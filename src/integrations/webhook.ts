import { fileToBase64 } from '../utils/fileToBase64';
import type { BugReport, Integration, SendResult } from './types';

interface WebhookConfig {
  url: string;
  headers?: Record<string, string>;
  maxPayloadBytes?: number;
}

const DEFAULT_MAX_PAYLOAD_BYTES = 1_000_000; // 1MB

async function safeFileToBase64(uri: string | null): Promise<string | null> {
  if (!uri) return null;
  try {
    return await fileToBase64(uri);
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown error';
    console.warn(`[BugPulse] Failed to encode file as base64: ${reason}. Sending report without this image.`);
    return null;
  }
}

export function WebhookIntegration(config: WebhookConfig): Integration {
  const maxBytes = config.maxPayloadBytes ?? DEFAULT_MAX_PAYLOAD_BYTES;

  return {
    name: 'webhook',
    async send(report: BugReport): Promise<SendResult> {
      try {
        let screenshotBase64 = await safeFileToBase64(report.screenshot);
        let annotatedScreenshotBase64 = await safeFileToBase64(report.annotatedScreenshot);

        // Check if base64 images exceed size limit
        const screenshotSize = screenshotBase64?.length ?? 0;
        const annotatedSize = annotatedScreenshotBase64?.length ?? 0;

        let screenshotSkipped = false;
        if (screenshotSize + annotatedSize > maxBytes) {
          console.warn(
            `[BugPulse] Screenshot base64 exceeds ${Math.round(maxBytes / 1024)}KB limit. Sending report without screenshot.`,
          );
          screenshotBase64 = null;
          annotatedScreenshotBase64 = null;
          screenshotSkipped = true;
        }

        const payload: Record<string, unknown> = {
          ...report,
          screenshotBase64,
          annotatedScreenshotBase64,
          diagnostics: report.diagnostics ?? null,
          ...(screenshotSkipped && { screenshotSkipped: true }),
        };

        const response = await fetch(config.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...config.headers,
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          return {
            success: false,
            error: `Webhook returned ${response.status}`,
          };
        }

        return { success: true };
      } catch (error) {
        return {
          success: false,
          error:
            error instanceof Error ? error.message : 'Webhook send failed',
        };
      }
    },
  };
}
