import type { Env, IntegrationRow } from './types';
import { decrypt } from './encrypt';

const DEFAULT_THRESHOLD = 5;

/**
 * Increment spike counter for a screen. Fire-and-forget via waitUntil().
 * Uses tumbling windows truncated to the hour.
 */
export async function trackSpike(
  env: Env,
  userId: string,
  screen: string,
  errorMessage: string | null,
): Promise<void> {
  const now = new Date();
  const windowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours()).toISOString();

  try {
    const result = await env.DB.prepare(`
      INSERT INTO screen_reports (screen, user_id, count, window_start)
      VALUES (?, ?, 1, ?)
      ON CONFLICT (screen, user_id, window_start)
      DO UPDATE SET count = count + 1
      RETURNING count
    `).bind(screen, userId, windowStart).first<{ count: number }>();

    const count = result?.count ?? 0;

    if (count === DEFAULT_THRESHOLD) {
      // Fire alert exactly once at threshold
      await sendSpikeAlert(env, userId, screen, count, errorMessage);
    }
  } catch (error) {
    // Fire-and-forget: don't break the report flow
    console.error('[BugPulse Proxy] Spike tracking failed:', error);
  }
}

async function sendSpikeAlert(
  env: Env,
  userId: string,
  screen: string,
  count: number,
  errorMessage: string | null,
): Promise<void> {
  // Find first Slack webhook integration for this user
  const integrations = await env.DB.prepare(
    "SELECT * FROM integrations WHERE user_id = ? AND type = 'slack_webhook' AND enabled = 1 LIMIT 1",
  ).bind(userId).all<IntegrationRow>();

  const slackIntegration = integrations.results?.[0];
  if (!slackIntegration) return;

  try {
    const config = JSON.parse(await decrypt(slackIntegration.config, env.ENCRYPTION_KEY)) as { webhook_url: string };

    const text = errorMessage
      ? `⚠️ Spike: ${count} reports from \`${screen}\` in the last hour. Latest: ${errorMessage}`
      : `⚠️ Spike: ${count} reports from \`${screen}\` in the last hour.`;

    await fetch(config.webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
  } catch (error) {
    console.error('[BugPulse Proxy] Spike alert failed:', error);
  }
}

/**
 * Clean up expired spike windows. Called by cron handler.
 */
export async function cleanupSpikeWindows(env: Env): Promise<number> {
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

  const result = await env.DB.prepare(
    'DELETE FROM screen_reports WHERE window_start < ?',
  ).bind(twoHoursAgo).run();

  return result.meta.changes ?? 0;
}
