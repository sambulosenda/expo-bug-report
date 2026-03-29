import { fileToBase64 } from '../utils/fileToBase64';
import type { BugReport, Integration, SendResult } from './types';

interface WebhookConfig {
  url: string;
  headers?: Record<string, string>;
}

export function WebhookIntegration(config: WebhookConfig): Integration {
  return {
    name: 'webhook',
    async send(report: BugReport): Promise<SendResult> {
      try {
        const payload: Record<string, unknown> = {
          ...report,
          screenshotBase64: report.screenshot
            ? await fileToBase64(report.screenshot)
            : null,
          annotatedScreenshotBase64: report.annotatedScreenshot
            ? await fileToBase64(report.annotatedScreenshot)
            : null,
          diagnostics: report.diagnostics ?? null,
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
