import type { Env, IncomingReport, IntegrationRow } from './types';
import { decrypt } from './encrypt';

/**
 * Send onboarding message on first report. Fire-and-forget via waitUntil().
 */
export async function checkAndSendOnboarding(
  env: Env,
  userId: string,
  report: IncomingReport,
): Promise<void> {
  try {
    const user = await env.DB.prepare(
      'SELECT first_report_sent FROM users WHERE id = ?',
    ).bind(userId).first<{ first_report_sent: number }>();

    if (user?.first_report_sent) return;

    // Mark as sent (before actually sending, to prevent duplicates)
    await env.DB.prepare(
      'UPDATE users SET first_report_sent = 1 WHERE id = ?',
    ).bind(userId).run();

    // Find first Slack webhook integration
    const integrations = await env.DB.prepare(
      "SELECT * FROM integrations WHERE user_id = ? AND type = 'slack_webhook' AND enabled = 1 LIMIT 1",
    ).bind(userId).all<IntegrationRow>();

    const slackIntegration = integrations.results?.[0];
    if (!slackIntegration) return;

    const config = JSON.parse(await decrypt(slackIntegration.config, env.ENCRYPTION_KEY)) as { webhook_url: string };

    const stateCount = report.diagnostics?.stateSnapshots?.length ?? 0;
    const navCount = report.diagnostics?.navHistory?.length ?? 0;
    const severity = report.diagnostics?.lastError ? 'crash' : 'feedback';

    const text = [
      '🎉 Your first BugPulse report just arrived!',
      '',
      `Here's what it captured:`,
      `• ${stateCount} state snapshot${stateCount !== 1 ? 's' : ''}`,
      `• ${navCount} nav event${navCount !== 1 ? 's' : ''}`,
      `• Device: ${report.device.model}, ${report.device.os}`,
      `• Screen: \`${report.screen}\``,
      `• Severity: ${severity}`,
      '',
      'This is what your users see when they shake.',
    ].join('\n');

    await fetch(config.webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
  } catch (error) {
    console.error('[BugPulse Proxy] Onboarding message failed:', error);
  }
}
