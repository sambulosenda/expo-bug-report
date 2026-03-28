import { fileToBase64 } from '../utils/fileToBase64';
import type { BugReport, Integration, SendResult } from './types';

interface SlackConfig {
  webhookUrl: string;
  imageUploadKey?: string;
  imageUploadUrl?: string;
}

const DEFAULT_IMGBB_URL = 'https://api.imgbb.com/1/upload';

async function uploadImage(
  uri: string,
  apiKey: string,
  uploadUrl: string,
): Promise<string | null> {
  try {
    const base64 = await fileToBase64(uri);

    const formData = new FormData();
    formData.append('key', apiKey);
    formData.append('image', base64);

    const response = await fetch(uploadUrl, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) return null;

    const data = await response.json();
    return data?.data?.url ?? null;
  } catch {
    return null;
  }
}

function formatSlackMessage(
  report: BugReport,
  screenshotUrl: string | null,
): Record<string, unknown> {
  const fields = [
    `*Screen:* ${report.screen}`,
    `*Device:* ${report.device.model}`,
    `*OS:* ${report.device.os}`,
    `*App Version:* ${report.device.appVersion}`,
    `*Time:* ${report.timestamp}`,
  ];

  if (report.description) {
    fields.unshift(`*Description:* ${report.description}`);
  }

  const metaEntries = Object.entries(report.metadata);
  if (metaEntries.length > 0) {
    fields.push(
      `*Metadata:* ${metaEntries.map(([k, v]) => `${k}=${v}`).join(', ')}`,
    );
  }

  const blocks: Record<string, unknown>[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: 'Bug Report', emoji: true },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: fields.join('\n') },
    },
  ];

  if (screenshotUrl) {
    blocks.push({
      type: 'image',
      image_url: screenshotUrl,
      alt_text: 'Bug report screenshot',
    });
  }

  return { blocks };
}

export function SlackIntegration(config: SlackConfig): Integration {
  return {
    name: 'slack',
    async send(report: BugReport): Promise<SendResult> {
      try {
        let screenshotUrl: string | null = null;

        const imageUri = report.annotatedScreenshot ?? report.screenshot;
        if (imageUri && !config.imageUploadKey) {
          console.warn(
            '[expo-bug-report] Screenshot available but no imageUploadKey configured. ' +
            'Bug report will be sent without the screenshot image. ' +
            'Add imageUploadKey to SlackIntegration config to include screenshots.',
          );
        }
        if (imageUri && config.imageUploadKey) {
          screenshotUrl = await uploadImage(
            imageUri,
            config.imageUploadKey,
            config.imageUploadUrl ?? DEFAULT_IMGBB_URL,
          );
        }

        const message = formatSlackMessage(report, screenshotUrl);

        const response = await fetch(config.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(message),
        });

        if (!response.ok) {
          return {
            success: false,
            error: `Slack returned ${response.status}`,
          };
        }

        return { success: true };
      } catch (error) {
        return {
          success: false,
          error:
            error instanceof Error ? error.message : 'Slack send failed',
        };
      }
    },
  };
}
