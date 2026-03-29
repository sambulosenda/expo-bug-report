import { fileToBase64 } from '../utils/fileToBase64';
import type { BugReport, Integration, SendResult } from './types';

interface ProxyConfig {
  proxyUrl: string;
  apiKey: string;
  hmacSecret: string;
  fallbackWebhookUrl?: string;
  fallbackHeaders?: Record<string, string>;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 5000;

async function computeHmac(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const msgData = encoder.encode(message);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const signature = await crypto.subtle.sign('HMAC', cryptoKey, msgData);
  const bytes = new Uint8Array(signature);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function sha256(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const hash = await crypto.subtle.digest('SHA-256', encoder.encode(data));
  const bytes = new Uint8Array(hash);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timer);
  }
}

async function sendToFallbackWebhook(
  report: BugReport,
  fallbackUrl: string,
  fallbackHeaders?: Record<string, string>,
): Promise<SendResult> {
  try {
    let screenshotBase64: string | null = null;
    const imageUri = report.annotatedScreenshot ?? report.screenshot;
    if (imageUri) {
      try {
        screenshotBase64 = await fileToBase64(imageUri);
      } catch {
        // Skip screenshot on encoding failure
      }
    }

    const payload = {
      ...report,
      screenshotBase64,
      diagnostics: report.diagnostics ?? null,
    };

    const response = await fetch(fallbackUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...fallbackHeaders,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      return { success: false, error: `Fallback webhook returned ${response.status}` };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Fallback webhook failed',
    };
  }
}

export function ProxyIntegration(config: ProxyConfig): Integration {
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return {
    name: 'proxy',
    async send(report: BugReport): Promise<SendResult> {
      try {
        // Encode screenshot as base64 for proxy
        let screenshotBase64: string | null = null;
        const imageUri = report.annotatedScreenshot ?? report.screenshot;
        if (imageUri) {
          try {
            screenshotBase64 = await fileToBase64(imageUri);
          } catch (error) {
            const reason = error instanceof Error ? error.message : 'unknown error';
            console.warn(`[BugPulse] Failed to encode screenshot: ${reason}. Sending without screenshot.`);
          }
        }

        const payload = JSON.stringify({
          ...report,
          screenshotBase64,
          diagnostics: report.diagnostics ?? null,
        });

        // HMAC-SHA256 signing
        const timestamp = Math.floor(Date.now() / 1000).toString();
        const payloadHash = await sha256(payload);
        const signatureMessage = `${timestamp}.${payloadHash}`;
        const signature = await computeHmac(config.hmacSecret, signatureMessage);

        const response = await fetchWithTimeout(
          `${config.proxyUrl}/v1/reports`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-BugPulse-Key': config.apiKey,
              'X-BugPulse-Signature': signature,
              'X-BugPulse-Timestamp': timestamp,
            },
            body: payload,
          },
          timeoutMs,
        );

        if (!response.ok) {
          if (response.status === 402) {
            const data = await response.json().catch(() => ({}));
            const feature = (data as Record<string, unknown>).feature as string | undefined;
            console.warn(
              `[BugPulse] Your plan does not include "${feature ?? 'this feature'}". ` +
              'Upgrade at https://bugpulse.dev to enable it. Falling back to webhook.',
            );
          } else {
            console.warn(`[BugPulse] Proxy returned ${response.status}. Falling back to webhook.`);
          }

          // All non-200 responses fall back to webhook (if configured)
          if (config.fallbackWebhookUrl) {
            return sendToFallbackWebhook(report, config.fallbackWebhookUrl, config.fallbackHeaders);
          }
          return {
            success: false,
            error: 'Failed to send report',
          };
        }

        const data = await response.json().catch(() => ({}));
        const issues = (data as Record<string, unknown>).issues as SendResult['issues'] | undefined;

        return {
          success: true,
          issues: issues ?? undefined,
        };
      } catch (error) {
        // Network error or timeout — fall back to webhook
        if (config.fallbackWebhookUrl) {
          const reason = error instanceof Error ? error.message : 'unknown error';
          console.warn(`[BugPulse] Proxy request failed (${reason}). Falling back to webhook.`);
          return sendToFallbackWebhook(report, config.fallbackWebhookUrl, config.fallbackHeaders);
        }

        return {
          success: false,
          error: error instanceof Error ? error.message : 'Proxy request failed',
        };
      }
    },
  };
}
