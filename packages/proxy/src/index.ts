import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { lookupUser, verifyHmac, checkTierAccess } from './auth';
import { checkDuplicate, updateHashWithIssueUrl, cleanupExpiredHashes } from './dedup';
import { deriveLabels } from './labels';
import { uploadScreenshot, getScreenshotUrl } from './r2';
import { decrypt, encrypt } from './encrypt';
import { createLinearIssue, addLinearComment } from './integrations/linear';
import { createGithubIssue, addGithubComment } from './integrations/github';
import { createJiraIssue, addJiraComment } from './integrations/jira';
import { trackSpike, cleanupSpikeWindows } from './spike';
import { checkAndSendOnboarding } from './onboarding';
import { handleStripeWebhook, expireGracePeriods } from './stripe';
import type { Env, IncomingReport, IntegrationRow, IssueResult, QueueMessage, User } from './types';

const VALID_INTEGRATION_TYPES = new Set(['linear', 'github', 'jira']);
const MAX_BODY_BYTES = 5 * 1024 * 1024; // 5MB

type AppEnv = { Bindings: Env; Variables: { user: User } };

export const app = new Hono<AppEnv>();

// --- CORS ---
app.use('*', (c, next) => {
  const allowedRaw = c.env.ALLOWED_ORIGINS || '*';
  const origins = allowedRaw === '*' ? '*' : allowedRaw.split(',').map((s: string) => s.trim());
  return cors({ origin: origins })(c, next);
});

// --- Auth middleware (reusable) ---
async function requireAuth(c: any, next: any) {
  const apiKey = c.req.header('X-BugPulse-Key');
  if (!apiKey) return c.json({ error: 'invalid_api_key' }, 403);

  const user = await lookupUser(apiKey, c.env);
  if (!user) return c.json({ error: 'invalid_api_key' }, 403);

  c.set('user', user);
  return next();
}

// --- Health ---
app.get('/v1/health', (c) => c.json({ status: 'ok' }));

// --- Signup (no auth) ---
app.post('/v1/signup', async (c) => {
  const body = await c.req.json<{ email?: string }>();
  if (!body.email) {
    return c.json({ error: 'validation_error', details: ['email required'] }, 422);
  }

  const id = crypto.randomUUID();
  const apiKey = `bp_${crypto.randomUUID().replace(/-/g, '')}`;
  const hmacSecret = `bps_${crypto.randomUUID().replace(/-/g, '')}`;

  const result = await c.env.DB.prepare(
    'INSERT OR IGNORE INTO users (id, email, api_key, hmac_secret, plan) VALUES (?, ?, ?, ?, ?)',
  ).bind(id, body.email, apiKey, hmacSecret, 'free').run();

  if (result.meta.changes === 0) {
    return c.json({ error: 'email_exists' }, 409);
  }

  return c.json({ api_key: apiKey, hmac_secret: hmacSecret });
});

// --- Report ingest ---
app.post('/v1/reports', requireAuth, async (c) => {
  const user = c.get('user');

  if (!checkTierAccess(user.plan, 'proxy')) {
    return c.json({ error: 'upgrade_required', feature: 'proxy', plan_required: 'starter' }, 402);
  }

  // Body size check
  const contentLength = parseInt(c.req.header('Content-Length') ?? '0', 10);
  if (contentLength > MAX_BODY_BYTES) {
    return c.json({ error: 'payload_too_large' }, 413);
  }

  // HMAC verification
  const signature = c.req.header('X-BugPulse-Signature');
  const timestamp = c.req.header('X-BugPulse-Timestamp');
  const body = await c.req.text();

  if (body.length > MAX_BODY_BYTES) {
    return c.json({ error: 'payload_too_large' }, 413);
  }

  if (!signature || !timestamp) {
    return c.json({ error: 'invalid_signature' }, 403);
  }

  const valid = await verifyHmac(body, signature, timestamp, user.hmac_secret);
  if (!valid) {
    return c.json({ error: 'invalid_signature' }, 403);
  }

  let report: IncomingReport;
  try {
    report = JSON.parse(body) as IncomingReport;
  } catch {
    return c.json({ error: 'validation_error', details: ['Invalid JSON'] }, 422);
  }

  // Screenshot: use existing screenshotId or upload inline base64
  let screenshotUrl: string | null = null;
  if (report.screenshotId) {
    screenshotUrl = getScreenshotUrl(c.env, report.screenshotId);
  } else if (report.screenshotBase64) {
    screenshotUrl = await uploadScreenshot(c.env, report.screenshotBase64, user.id);
  }

  // Auto-labels
  const labels = checkTierAccess(user.plan, 'auto_labels')
    ? deriveLabels(report)
    : [];

  // Auto-generated issue title
  const title = generateTitle(report);

  // Duplicate detection (pro/beta only)
  const errorMsg = report.diagnostics?.lastError?.message ?? null;
  if (checkTierAccess(user.plan, 'dedup')) {
    const { isDuplicate, existingIssueUrl } = await checkDuplicate(
      c.env, user.id, report.screen, errorMsg, report.description,
    );

    if (isDuplicate && existingIssueUrl) {
      await addCommentToExistingIssue(c.env, user, existingIssueUrl, report);
      return c.json({
        success: true,
        duplicate: true,
        issues: [{ destination: 'existing', url: existingIssueUrl, key: 'duplicate' }],
      });
    }
  }

  // Get user's integrations (all fire, routing rules removed)
  const integrations = await c.env.DB.prepare(
    'SELECT * FROM integrations WHERE user_id = ? AND enabled = 1',
  ).bind(user.id).all<IntegrationRow>();

  const matchedIntegrations = integrations.results ?? [];

  if (matchedIntegrations.length === 0) {
    return c.json({ success: true, issues: [] });
  }

  // Check multi-routing tier limit
  const maxDestinations = user.plan === 'starter' ? 2 : Infinity;
  const activeIntegrations = matchedIntegrations.slice(0, maxDestinations);

  // Parallel fan-out to all integrations
  const results = await Promise.allSettled(
    activeIntegrations.map(async (integration) => {
      const config = JSON.parse(await decrypt(integration.config, c.env.ENCRYPTION_KEY)) as Record<string, string>;
      return createIssue(integration.type, report, config, labels, screenshotUrl, title);
    }),
  );

  const issues: IssueResult[] = [];
  for (const result of results) {
    if (result.status === 'fulfilled' && result.value) {
      issues.push(result.value);
    }
  }

  // Update dedup hash with first successful issue URL
  if (issues.length > 0 && checkTierAccess(user.plan, 'dedup')) {
    await updateHashWithIssueUrl(c.env, user.id, report.screen, errorMsg, issues[0]!.url, report.description);
  }

  // Fire-and-forget: spike detection + onboarding (non-blocking)
  const errorMsg2 = report.diagnostics?.lastError?.message ?? null;
  c.executionCtx.waitUntil(trackSpike(c.env, user.id, report.screen, errorMsg2));
  c.executionCtx.waitUntil(checkAndSendOnboarding(c.env, user.id, report));

  return c.json({ success: true, issues });
});

// --- Screenshot upload (separate endpoint) ---
app.post('/v1/screenshots', requireAuth, async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{ base64: string }>();

  if (!body.base64) {
    return c.json({ error: 'validation_error', details: ['base64 required'] }, 422);
  }

  if (body.base64.length > MAX_BODY_BYTES) {
    return c.json({ error: 'payload_too_large' }, 413);
  }

  const id = crypto.randomUUID();
  const url = await uploadScreenshot(c.env, body.base64, user.id, id);
  if (!url) {
    return c.json({ error: 'upload_failed' }, 500);
  }

  return c.json({ id, url });
});

// --- Screenshot proxy redirect (auth'd) ---
app.get('/v1/screenshots/:id', requireAuth, async (c) => {
  const screenshotId = c.req.param('id');
  const url = getScreenshotUrl(c.env, screenshotId);
  if (!url) {
    return c.json({ error: 'not_found' }, 404);
  }
  return c.redirect(url, 302);
});

// --- Integration CRUD ---
app.post('/v1/integrations', requireAuth, async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{ type?: string; config?: Record<string, string> }>();

  if (!body.type || !body.config) {
    return c.json({ error: 'validation_error', details: ['type and config required'] }, 422);
  }

  if (!VALID_INTEGRATION_TYPES.has(body.type)) {
    return c.json({ error: 'validation_error', details: [`Invalid type. Must be one of: ${[...VALID_INTEGRATION_TYPES].join(', ')}`] }, 422);
  }

  // Validate token before saving
  const healthResult = await checkIntegrationHealth(body.type, body.config);
  if (!healthResult.healthy) {
    return c.json({ error: 'invalid_token', details: [healthResult.error ?? 'Token validation failed'] }, 422);
  }

  const id = crypto.randomUUID();
  const encryptedConfig = await encrypt(JSON.stringify(body.config), c.env.ENCRYPTION_KEY);

  await c.env.DB.prepare(
    'INSERT INTO integrations (id, user_id, type, config) VALUES (?, ?, ?, ?)',
  ).bind(id, user.id, body.type, encryptedConfig).run();

  return c.json({ id, type: body.type, enabled: true });
});

app.get('/v1/integrations', requireAuth, async (c) => {
  const user = c.get('user');
  const results = await c.env.DB.prepare(
    'SELECT id, type, enabled, created_at FROM integrations WHERE user_id = ?',
  ).bind(user.id).all();

  return c.json({ integrations: results.results ?? [] });
});

app.delete('/v1/integrations/:id', requireAuth, async (c) => {
  const user = c.get('user');
  const integrationId = c.req.param('id');

  await c.env.DB.prepare(
    'DELETE FROM integrations WHERE id = ? AND user_id = ?',
  ).bind(integrationId, user.id).run();

  return c.json({ deleted: true });
});

// --- Integration health check ---
app.get('/v1/integrations/:id/health', requireAuth, async (c) => {
  const user = c.get('user');
  const integrationId = c.req.param('id');

  const row = await c.env.DB.prepare(
    'SELECT type, config FROM integrations WHERE id = ? AND user_id = ?',
  ).bind(integrationId, user.id).first<{ type: string; config: string }>();

  if (!row) {
    return c.json({ error: 'not_found' }, 404);
  }

  const config = JSON.parse(await decrypt(row.config, c.env.ENCRYPTION_KEY)) as Record<string, string>;
  const result = await checkIntegrationHealth(row.type, config);

  return c.json({ healthy: result.healthy, error: result.error ?? null, checkedAt: new Date().toISOString() });
});

// --- Stripe webhook (no auth middleware — uses Stripe signature) ---
app.post('/v1/stripe/webhook', async (c) => {
  return handleStripeWebhook(c.req.raw, c.env);
});

// --- API key rotation ---
app.post('/v1/rotate-key', requireAuth, async (c) => {
  const user = c.get('user');
  const newKey = `bp_${crypto.randomUUID().replace(/-/g, '')}`;

  await c.env.DB.prepare(
    'UPDATE users SET api_key = ? WHERE id = ?',
  ).bind(newKey, user.id).run();

  return c.json({ api_key: newKey });
});

// --- Account recovery (no auth — user lost their key) ---
const recoverAttempts = new Map<string, { count: number; firstAttempt: number }>();
const MAX_RECOVER_ATTEMPTS = 3;
const RECOVER_WINDOW_MS = 60 * 60 * 1000; // 1 hour

app.post('/v1/recover', async (c) => {
  const body = await c.req.json<{ email?: string }>();
  if (!body.email) {
    return c.json({ error: 'validation_error', details: ['email required'] }, 422);
  }

  // Rate limit: 3 attempts per email per hour
  const now = Date.now();
  const entry = recoverAttempts.get(body.email);
  if (entry && now - entry.firstAttempt < RECOVER_WINDOW_MS && entry.count >= MAX_RECOVER_ATTEMPTS) {
    return c.json({ error: 'rate_limited', retry_after: Math.ceil((entry.firstAttempt + RECOVER_WINDOW_MS - now) / 1000) }, 429);
  }

  const user = await c.env.DB.prepare(
    'SELECT id FROM users WHERE email = ?',
  ).bind(body.email).first<{ id: string }>();

  if (!user) {
    return c.json({ error: 'not_found' }, 404);
  }

  // Track attempt
  if (!entry || now - entry.firstAttempt >= RECOVER_WINDOW_MS) {
    recoverAttempts.set(body.email, { count: 1, firstAttempt: now });
  } else {
    entry.count++;
  }

  // Generate new credentials (invalidates old ones)
  const newKey = `bp_${crypto.randomUUID().replace(/-/g, '')}`;
  const newSecret = `bps_${crypto.randomUUID().replace(/-/g, '')}`;

  await c.env.DB.prepare(
    'UPDATE users SET api_key = ?, hmac_secret = ? WHERE id = ?',
  ).bind(newKey, newSecret, user.id).run();

  return c.json({ api_key: newKey, hmac_secret: newSecret });
});

// --- Billing portal ---
app.post('/v1/billing/portal', requireAuth, async (c) => {
  const user = c.get('user');

  if (!user.stripe_customer_id) {
    return c.json({ error: 'no_subscription' }, 422);
  }

  const { default: Stripe } = await import('stripe');
  const stripe = new Stripe(c.env.STRIPE_SECRET_KEY);

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripe_customer_id,
      return_url: 'https://bugpulse.dev',
    });
    return c.json({ url: session.url });
  } catch {
    return c.json({ error: 'payment_provider_error' }, 502);
  }
});

// --- 404 fallback ---
app.all('*', (c) => c.json({ error: 'not_found' }, 404));

// --- Integration dispatch ---

function generateTitle(report: IncomingReport): string {
  const severity = report.diagnostics?.lastError ? 'crash' : 'feedback';
  const errorMsg = report.diagnostics?.lastError?.message;
  const desc = errorMsg ?? report.description.split('\n')[0] ?? '';
  const raw = `[${severity}] ${report.screen}: ${desc}`;
  return raw.length > 120 ? raw.slice(0, 117) + '...' : raw;
}

async function createIssue(
  type: IntegrationRow['type'],
  report: IncomingReport,
  config: Record<string, string>,
  labels: string[],
  screenshotUrl: string | null,
  title: string,
): Promise<IssueResult> {
  switch (type) {
    case 'linear':
      return createLinearIssue(report, config as any, labels, screenshotUrl, title);
    case 'github':
      return createGithubIssue(report, config as any, labels, screenshotUrl, title);
    case 'jira':
      return createJiraIssue(report, config as any, labels, screenshotUrl, title);
    default:
      throw new Error(`Unknown integration type: ${type}`);
  }
}

async function addCommentToExistingIssue(
  env: Env,
  user: { id: string },
  issueUrl: string,
  report: IncomingReport,
): Promise<void> {
  const integrations = await env.DB.prepare(
    'SELECT * FROM integrations WHERE user_id = ? AND enabled = 1',
  ).bind(user.id).all<IntegrationRow>();

  for (const integration of integrations.results ?? []) {
    const config = JSON.parse(await decrypt(integration.config, env.ENCRYPTION_KEY)) as Record<string, string>;

    try {
      if (integration.type === 'linear' && issueUrl.includes('linear.app')) {
        await addLinearComment(issueUrl, report, config as any);
        return;
      }
      if (integration.type === 'github' && issueUrl.includes('github.com')) {
        await addGithubComment(issueUrl, report, config as any);
        return;
      }
      if (integration.type === 'jira' && issueUrl.includes('atlassian.net')) {
        await addJiraComment(issueUrl, report, config as any);
        return;
      }
    } catch (error) {
      console.error('[BugPulse Proxy] Failed to add comment:', error);
    }
  }
}

async function checkIntegrationHealth(
  type: string,
  config: Record<string, string>,
): Promise<{ healthy: boolean; error?: string }> {
  const timeout = 5000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    let response: Response;

    switch (type) {
      case 'linear':
        response = await fetch('https://api.linear.app/graphql', {
          method: 'POST',
          headers: {
            'Authorization': config.token!,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ query: '{ viewer { id } }' }),
          signal: controller.signal,
        });
        break;
      case 'github':
        response = await fetch('https://api.github.com/user', {
          headers: {
            'Authorization': `Bearer ${config.token}`,
            'User-Agent': 'BugPulse-Proxy',
          },
          signal: controller.signal,
        });
        break;
      case 'jira':
        response = await fetch(`https://${config.domain}/rest/api/3/myself`, {
          headers: {
            'Authorization': `Basic ${btoa(`${config.email}:${config.api_token}`)}`,
          },
          signal: controller.signal,
        });
        break;
      default:
        return { healthy: false, error: `Unknown type: ${type}` };
    }

    if (!response.ok) {
      return { healthy: false, error: `API returned ${response.status}` };
    }
    return { healthy: true };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return { healthy: false, error: msg.includes('abort') ? 'timeout' : msg };
  } finally {
    clearTimeout(timer);
  }
}

// --- Exports ---

export default {
  fetch: app.fetch,

  async queue(batch: MessageBatch<QueueMessage>, env: Env): Promise<void> {
    for (const msg of batch.messages) {
      try {
        const row = await env.DB.prepare(
          'SELECT config FROM integrations WHERE id = ?',
        ).bind(msg.integration.id).first<{ config: string }>();

        if (!row) {
          console.error(`[BugPulse Proxy] Integration ${msg.integration.id} not found`);
          msg.ack();
          continue;
        }

        const config = JSON.parse(await decrypt(row.config, env.ENCRYPTION_KEY)) as Record<string, string>;
        const title = generateTitle(msg.report);
        await createIssue(msg.integration.type, msg.report, config, msg.labels, msg.screenshotUrl, title);
        msg.ack();
      } catch (error) {
        console.error('[BugPulse Proxy] Queue consumer error:', error);
        msg.retry();
      }
    }
  },

  async scheduled(_event: ScheduledEvent, env: Env): Promise<void> {
    const hashCleaned = await cleanupExpiredHashes(env);
    const spikeCleaned = await cleanupSpikeWindows(env);
    const graceExpired = await expireGracePeriods(env);
    console.log(`[BugPulse Proxy] Cleaned ${hashCleaned} hashes, ${spikeCleaned} spike windows, ${graceExpired} grace periods expired`);
  },
};
