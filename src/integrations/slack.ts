import { fileToBase64 } from '../utils/fileToBase64';
import type { BugReport, Integration, SendResult } from './types';

interface SlackConfig {
  webhookUrl: string;
  imageUploadKey?: string;
  imageUploadUrl?: string;
}

const DEFAULT_IMGBB_URL = 'https://api.imgbb.com/1/upload';
const MAX_BLOCK_TEXT = 3000; // Slack Block Kit limit

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

function truncateString(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen) + '...';
}

function formatTimeline(report: BugReport): string {
  if (!report.diagnostics) return '';

  const { stateSnapshots, navHistory, lastError } = report.diagnostics;
  const lines: string[] = [];

  // Build a chronological narrative
  if (navHistory.length > 0) {
    const route = navHistory.map((e) => e.pathname).join(' → ');
    lines.push(`*Navigation:* ${truncateString(route, 500)}`);
  }

  if (lastError) {
    lines.push('');
    lines.push(`*Error:* \`${truncateString(lastError.message, 200)}\``);
    if (lastError.stack) {
      const firstLine = lastError.stack.split('\n')[0] ?? '';
      if (firstLine !== lastError.message) {
        lines.push(`\`${truncateString(firstLine, 200)}\``);
      }
    }
    if (lastError.componentStack) {
      const component = lastError.componentStack.trim().split('\n')[0] ?? '';
      lines.push(`_Component:_ ${truncateString(component, 200)}`);
    }
  }

  if (stateSnapshots.length > 0) {
    lines.push('');
    lines.push(`*App State* (${stateSnapshots.length} snapshot${stateSnapshots.length === 1 ? '' : 's'}):`);
    // Show most recent snapshots, grouped by store name
    const byStore = new Map<string, typeof stateSnapshots>();
    for (const snap of stateSnapshots) {
      const existing = byStore.get(snap.name) ?? [];
      existing.push(snap);
      byStore.set(snap.name, existing);
    }
    for (const [name, snaps] of byStore) {
      const latest = snaps[snaps.length - 1]!;
      const statePreview = truncateString(latest.state, 150);
      lines.push(`  _${name}:_ \`${statePreview}\`${latest.truncated ? ' [TRUNCATED]' : ''}`);
    }
  }

  const result = lines.join('\n');
  return truncateString(result, MAX_BLOCK_TEXT);
}

function severityEmoji(severity: string | undefined): string {
  switch (severity) {
    case 'crash': return '\u{1F6A8}';
    case 'error': return '\u26A0\uFE0F';
    default: return '\u{1F4AC}';
  }
}

function severityLabel(severity: string | undefined): string {
  switch (severity) {
    case 'crash': return 'Crash';
    case 'error': return 'Error';
    default: return 'Feedback';
  }
}

function formatSlackMessage(
  report: BugReport,
  screenshotUrl: string | null,
): Record<string, unknown> {
  const emoji = severityEmoji(report.severity);
  const label = severityLabel(report.severity);

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
      text: { type: 'plain_text', text: `${emoji} Bug Report \u2014 ${label}`, emoji: true },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: fields.join('\n') },
    },
  ];

  // Repro steps section
  if (report.reproSteps && report.reproSteps.length > 0) {
    const stepsText = report.reproSteps.join('\n');
    blocks.push(
      { type: 'divider' },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Steps to Reproduce:*\n${truncateString(stepsText, MAX_BLOCK_TEXT)}`,
        },
      },
    );
  }

  // Only show raw timeline if repro steps aren't present (avoids redundancy)
  if (!report.reproSteps || report.reproSteps.length === 0) {
    const timeline = formatTimeline(report);
    if (timeline) {
      blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: timeline },
      });
    }
  }

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
            '[BugPulse] Screenshot available but no imageUploadKey configured. ' +
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
