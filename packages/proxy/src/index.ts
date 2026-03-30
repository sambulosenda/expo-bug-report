import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { lookupUser, verifyHmac, checkTierAccess } from './auth';
import { checkDuplicate, updateHashWithIssueUrl, cleanupExpiredHashes, computeHash } from './dedup';
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
  if (allowedRaw === '*') {
    // Echo requesting origin (wildcard doesn't work with Authorization header)
    return cors({
      origin: (origin) => origin || '*',
      allowHeaders: ['Content-Type', 'Authorization', 'X-BugPulse-Key', 'X-BugPulse-Signature', 'X-BugPulse-Timestamp'],
      allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    })(c, next);
  }
  const origins = allowedRaw.split(',').map((s: string) => s.trim());
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

  // Persist full report for dashboard (fail-open: if D1 write fails, continue to integrations)
  const reportId = crypto.randomUUID();
  const severity = report.diagnostics?.lastError ? 'crash'
    : report.description?.toLowerCase().match(/error|fail|broke|crash/) ? 'error'
    : 'feedback';
  try {
    await c.env.DB.prepare(
      'INSERT INTO reports (id, user_id, hash, screen, severity, description, diagnostics, screenshot_id, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      reportId,
      user.id,
      errorMsg ? await computeHash(report.screen, errorMsg, report.description) : crypto.randomUUID(),
      report.screen,
      severity,
      report.description,
      report.diagnostics ? JSON.stringify(report.diagnostics) : null,
      report.screenshotId ?? null,
      'new',
      new Date().toISOString(),
    ).run();
  } catch (err) {
    console.error('[BugPulse Proxy] Failed to persist report to dashboard:', err);
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

  // Store failed integrations for replay
  for (let i = 0; i < results.length; i++) {
    if (results[i]!.status === 'rejected') {
      const failedIntegration = activeIntegrations[i]!;
      const errorMessage = (results[i] as PromiseRejectedResult).reason?.message ?? 'Unknown error';
      c.executionCtx.waitUntil(
        c.env.DB.prepare(
          'INSERT INTO failed_reports (id, user_id, report_payload, integration_id, error_message) VALUES (?, ?, ?, ?, ?)',
        ).bind(crypto.randomUUID(), user.id, JSON.stringify(report), failedIntegration.id, errorMessage).run().catch(() => {}),
      );
    }
  }

  // Create report_status rows for bidirectional feedback
  const reportHash = errorMsg
    ? await computeHash(report.screen, errorMsg, report.description)
    : null;
  if (reportHash && issues.length > 0) {
    const pushToken = (report as any).pushToken ?? null;
    for (const issue of issues) {
      c.executionCtx.waitUntil(
        c.env.DB.prepare(
          'INSERT OR IGNORE INTO report_status (report_hash, user_id, issue_url, linear_issue_id, push_token) VALUES (?, ?, ?, ?, ?)',
        ).bind(reportHash, user.id, issue.url, issue.externalId ?? null, pushToken).run().catch(() => {}),
      );
    }
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

// --- Stripe Checkout ---
app.post('/v1/checkout', requireAuth, async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{ plan?: string }>();

  if (!body.plan || (body.plan !== 'starter' && body.plan !== 'pro')) {
    return c.json({ error: 'validation_error', details: ['plan must be "starter" or "pro"'] }, 422);
  }

  if (user.plan === body.plan) {
    return c.json({ error: 'already_subscribed', current_plan: user.plan }, 409);
  }

  const priceId = body.plan === 'starter'
    ? c.env.STRIPE_STARTER_PRICE_ID
    : c.env.STRIPE_PRO_PRICE_ID;

  if (!priceId) {
    console.error(`[BugPulse Proxy] Missing STRIPE_${body.plan.toUpperCase()}_PRICE_ID env var`);
    return c.json({ error: 'service_configuration_error' }, 500);
  }

  const { default: Stripe } = await import('stripe');
  const stripe = new Stripe(c.env.STRIPE_SECRET_KEY);

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: user.stripe_customer_id ? undefined : user.email,
      customer: user.stripe_customer_id ?? undefined,
      metadata: { plan: body.plan, bugpulse_user_id: user.id },
      success_url: 'https://bugpulse.dev/?checkout=success',
      cancel_url: 'https://bugpulse.dev/?checkout=cancel',
    });

    return c.json({ url: session.url });
  } catch (error) {
    console.error('[BugPulse Proxy] Stripe checkout error:', error);
    return c.json({ error: 'payment_provider_error' }, 502);
  }
});

// --- Linear webhook (bidirectional feedback) ---
app.post('/v1/webhooks/linear', async (c) => {
  const signature = c.req.header('X-Linear-Signature') ?? '';
  const body = await c.req.text();

  // Find the integration that has a linear_webhook_secret
  // We verify against all linear integrations until one matches
  const integrations = await c.env.DB.prepare(
    "SELECT user_id, config FROM integrations WHERE type = 'linear' AND enabled = 1",
  ).all<{ user_id: string; config: string }>();

  let matchedUserId: string | null = null;
  for (const row of integrations.results ?? []) {
    const config = JSON.parse(await decrypt(row.config, c.env.ENCRYPTION_KEY)) as Record<string, string>;
    const secret = config.linear_webhook_secret;
    if (!secret) continue;

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
    const expected = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');

    if (expected.length === signature.length) {
      let mismatch = 0;
      for (let i = 0; i < expected.length; i++) mismatch |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
      if (mismatch === 0) { matchedUserId = row.user_id; break; }
    }
  }

  if (!matchedUserId) return c.json({ error: 'invalid_signature' }, 401);

  let payload: any;
  try { payload = JSON.parse(body); } catch { return c.json({ error: 'invalid_json' }, 400); }

  // Only handle issue status changes to "done" categories
  if (payload.type !== 'Issue' || payload.action !== 'update') {
    return c.json({ ok: true });
  }

  const issueId = payload.data?.id;
  const newState = payload.data?.state?.type; // 'completed', 'cancelled'
  if (!issueId || (newState !== 'completed' && newState !== 'cancelled')) {
    return c.json({ ok: true });
  }

  // Update all report_status rows for this issue
  const rows = await c.env.DB.prepare(
    'SELECT report_hash, push_token FROM report_status WHERE linear_issue_id = ? AND user_id = ?',
  ).bind(issueId, matchedUserId).all<{ report_hash: string; push_token: string | null }>();

  for (const row of rows.results ?? []) {
    await c.env.DB.prepare(
      "UPDATE report_status SET status = 'fixed', updated_at = datetime('now') WHERE report_hash = ? AND user_id = ?",
    ).bind(row.report_hash, matchedUserId).run();

    // Send push notification if token exists
    if (row.push_token) {
      c.executionCtx.waitUntil(sendPushNotification(row.push_token, payload.data?.title ?? 'Your reported issue'));
    }
  }

  return c.json({ ok: true, updated: (rows.results ?? []).length });
});

async function sendPushNotification(token: string, issueTitle: string): Promise<void> {
  try {
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: token,
        title: 'Bug Fixed!',
        body: `${issueTitle} was resolved`,
        data: { type: 'bugpulse_status_update' },
      }),
    });
    if (res.ok) {
      const data = await res.json() as { data?: { status?: string } };
      if (data.data?.status === 'DeviceNotRegistered') {
        // Clean up stale token — fire and forget
      }
    }
  } catch {
    // Push is best-effort
  }
}

// --- Report status polling (bidirectional feedback) ---
app.get('/v1/reports/status', requireAuth, async (c) => {
  const user = c.get('user');
  const hashesRaw = c.req.query('hashes') ?? '';
  const hashes = hashesRaw.split(',').filter(Boolean);

  if (hashes.length === 0) return c.json({ statuses: [] });
  if (hashes.length > 50) return c.json({ error: 'validation_error', details: ['max 50 hashes per request'] }, 422);

  const placeholders = hashes.map(() => '?').join(',');
  const rows = await c.env.DB.prepare(
    `SELECT report_hash, status, issue_url FROM report_status WHERE user_id = ? AND report_hash IN (${placeholders})`,
  ).bind(user.id, ...hashes).all<{ report_hash: string; status: string; issue_url: string | null }>();

  return c.json({ statuses: rows.results ?? [] });
});

// --- Report analytics ---
app.get('/v1/analytics', requireAuth, async (c) => {
  const user = c.get('user');
  const fromDate = c.req.query('from') ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const toDate = c.req.query('to') ?? new Date().toISOString();

  const topScreens = await c.env.DB.prepare(
    'SELECT screen, COUNT(*) as count FROM report_hashes WHERE user_id = ? AND created_at >= ? AND created_at <= ? AND screen IS NOT NULL GROUP BY screen ORDER BY count DESC LIMIT 10',
  ).bind(user.id, fromDate, toDate).all<{ screen: string; count: number }>();

  const volumeByDay = await c.env.DB.prepare(
    "SELECT date(created_at) as date, COUNT(*) as count FROM report_hashes WHERE user_id = ? AND created_at >= ? AND created_at <= ? GROUP BY date(created_at) ORDER BY date",
  ).bind(user.id, fromDate, toDate).all<{ date: string; count: number }>();

  const severityRows = await c.env.DB.prepare(
    'SELECT severity, COUNT(*) as count FROM report_hashes WHERE user_id = ? AND created_at >= ? AND created_at <= ? AND severity IS NOT NULL GROUP BY severity',
  ).bind(user.id, fromDate, toDate).all<{ severity: string; count: number }>();

  const severityBreakdown: Record<string, number> = {};
  for (const row of severityRows.results ?? []) severityBreakdown[row.severity] = row.count;

  return c.json({
    period: { from: fromDate, to: toDate },
    topScreens: topScreens.results ?? [],
    volumeByDay: volumeByDay.results ?? [],
    severityBreakdown,
  });
});

// --- Recent reports (for CLI watch polling) ---
app.get('/v1/reports/recent', requireAuth, async (c) => {
  const user = c.get('user');
  const since = c.req.query('since') ?? new Date(Date.now() - 60000).toISOString();

  const rows = await c.env.DB.prepare(
    'SELECT hash, screen, severity, created_at FROM report_hashes WHERE user_id = ? AND created_at > ? ORDER BY created_at DESC LIMIT 50',
  ).bind(user.id, since).all<{ hash: string; screen: string; severity: string; created_at: string }>();

  return c.json({ reports: rows.results ?? [] });
});

// --- Failed reports (webhook replay) ---
app.get('/v1/reports/failed', requireAuth, async (c) => {
  const user = c.get('user');

  const rows = await c.env.DB.prepare(
    'SELECT id, integration_id, error_message, retries, created_at FROM failed_reports WHERE user_id = ? ORDER BY created_at DESC LIMIT 50',
  ).bind(user.id).all();

  return c.json({ failed: rows.results ?? [] });
});

app.post('/v1/reports/replay', requireAuth, async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{ id?: string }>();
  if (!body.id) return c.json({ error: 'validation_error', details: ['id required'] }, 422);

  const row = await c.env.DB.prepare(
    'SELECT * FROM failed_reports WHERE id = ? AND user_id = ?',
  ).bind(body.id, user.id).first<{ id: string; report_payload: string; integration_id: string; retries: number }>();

  if (!row) return c.json({ error: 'not_found' }, 404);
  if (row.retries >= 3) return c.json({ error: 'max_retries_exceeded' }, 422);

  const integration = await c.env.DB.prepare(
    'SELECT type, config FROM integrations WHERE id = ? AND user_id = ?',
  ).bind(row.integration_id, user.id).first<{ type: string; config: string }>();

  if (!integration) return c.json({ error: 'integration_not_found' }, 404);

  const report = JSON.parse(row.report_payload) as IncomingReport;
  const config = JSON.parse(await decrypt(integration.config, c.env.ENCRYPTION_KEY)) as Record<string, string>;
  const title = generateTitle(report);

  try {
    const result = await createIssue(integration.type as any, report, config, [], null, title);
    // Success — delete the failed report
    await c.env.DB.prepare('DELETE FROM failed_reports WHERE id = ?').bind(body.id).run();
    return c.json({ success: true, issue: result });
  } catch (error) {
    // Still failing — increment retry count
    await c.env.DB.prepare(
      'UPDATE failed_reports SET retries = retries + 1, error_message = ? WHERE id = ?',
    ).bind(error instanceof Error ? error.message : 'Unknown error', body.id).run();
    return c.json({ error: 'replay_failed', retries: row.retries + 1 }, 502);
  }
});

// --- Dashboard auth: session-based ---
async function requireDashboardAuth(c: any, next: any) {
  // Check Authorization: Bearer <session-token> header, or session cookie
  const authHeader = c.req.header('Authorization');
  const sessionToken = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7)
    : c.req.header('Cookie')?.match(/bp_session=([^;]+)/)?.[1];
  if (sessionToken) {
    const session = await c.env.DB.prepare(
      "SELECT user_id, type, team_member_id, expires_at FROM sessions WHERE token = ? AND expires_at > datetime('now')",
    ).bind(sessionToken).first() as { user_id: string; type: string; team_member_id: string | null; expires_at: string } | null;

    if (session) {
      const user = await c.env.DB.prepare(
        'SELECT * FROM users WHERE id = ?',
      ).bind(session.user_id).first() as User | null;

      if (user) {
        c.set('user', user);
        c.set('sessionType', session.type);
        c.set('teamMemberId', session.team_member_id);
        return next();
      }
    }
  }

  // Fall back to API key header
  const apiKey = c.req.header('X-BugPulse-Key');
  if (apiKey) {
    const user = await lookupUser(apiKey, c.env);
    if (user) {
      c.set('user', user);
      c.set('sessionType', 'developer');
      return next();
    }
  }

  return c.json({ error: 'unauthorized' }, 401);
}

// --- Dashboard login (API key → session) ---
app.post('/v1/auth/login', async (c) => {
  const body = await c.req.json<{ api_key?: string }>();
  if (!body.api_key) return c.json({ error: 'validation_error', details: ['api_key required'] }, 422);

  const user = await lookupUser(body.api_key, c.env);
  if (!user) return c.json({ error: 'invalid_api_key' }, 401);

  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  await c.env.DB.prepare(
    'INSERT INTO sessions (token, user_id, type, expires_at) VALUES (?, ?, ?, ?)',
  ).bind(token, user.id, 'developer', expiresAt).run();

  return c.json({ ok: true, session_token: token });
});

// --- Dashboard logout ---
app.post('/v1/auth/logout', requireDashboardAuth, async (c) => {
  // Check Authorization header or cookie for session token
  const authHeader = c.req.header('Authorization');
  const sessionToken = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7)
    : c.req.header('Cookie')?.match(/bp_session=([^;]+)/)?.[1];
  if (sessionToken) {
    await c.env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(sessionToken).run();
  }

  return c.json({ ok: true });
});

// --- Magic link auth ---
app.post('/v1/auth/magic/:token', async (c) => {
  const token = c.req.param('token');

  // Atomic claim: UPDATE only if unused and not expired. Prevents race condition.
  const claimed = await c.env.DB.prepare(
    "UPDATE magic_tokens SET used = 1 WHERE token = ? AND used = 0 AND expires_at > datetime('now')",
  ).bind(token).run();

  if ((claimed.meta.changes ?? 0) === 0) {
    // Either expired, already used, or doesn't exist
    return c.json({ error: 'token_expired_or_invalid' }, 401);
  }

  const row = await c.env.DB.prepare(
    'SELECT team_member_id, user_id FROM magic_tokens WHERE token = ?',
  ).bind(token).first<{ team_member_id: string; user_id: string }>();

  if (!row) return c.json({ error: 'token_expired_or_invalid' }, 401);

  // Create session
  const sessionToken = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  await c.env.DB.prepare(
    'INSERT INTO sessions (token, user_id, type, team_member_id, expires_at) VALUES (?, ?, ?, ?, ?)',
  ).bind(sessionToken, row.user_id, 'team_member', row.team_member_id, expiresAt).run();

  return c.json({ ok: true, session_token: sessionToken });
});

// --- Team invite ---
app.post('/v1/team/invite', requireAuth, async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{ email?: string }>();

  if (!body.email || !body.email.includes('@')) {
    return c.json({ error: 'validation_error', details: ['valid email required'] }, 422);
  }

  // Check max team size (20 members)
  const count = await c.env.DB.prepare(
    'SELECT COUNT(*) as count FROM team_members WHERE user_id = ?',
  ).bind(user.id).first<{ count: number }>();
  if ((count?.count ?? 0) >= 20) {
    return c.json({ error: 'team_limit_reached', max: 20 }, 422);
  }

  // Check for duplicate
  const existing = await c.env.DB.prepare(
    'SELECT id FROM team_members WHERE user_id = ? AND email = ?',
  ).bind(user.id, body.email).first();
  if (existing) {
    return c.json({ error: 'already_invited' }, 409);
  }

  const memberId = crypto.randomUUID();
  await c.env.DB.prepare(
    'INSERT INTO team_members (id, user_id, email, invited_by) VALUES (?, ?, ?, ?)',
  ).bind(memberId, user.id, body.email, user.id).run();

  // Generate magic link token
  const magicToken = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  await c.env.DB.prepare(
    'INSERT INTO magic_tokens (token, team_member_id, user_id, expires_at) VALUES (?, ?, ?, ?)',
  ).bind(magicToken, memberId, user.id, expiresAt).run();

  const inviteUrl = `https://bugpulse.dev/auth/magic?token=${magicToken}`;

  // Try to send email via Resend (fail-open: return manual link if Resend is down)
  try {
    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${(c.env as any).RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'BugPulse <noreply@bugpulse.dev>',
        to: body.email,
        subject: 'You\'ve been invited to BugPulse',
        html: `<p>You've been invited to view bug reports on BugPulse.</p><p><a href="${inviteUrl}">Click here to access the dashboard</a></p><p>This link expires in 24 hours.</p>`,
      }),
    });

    if (!resendRes.ok) {
      throw new Error(`Resend returned ${resendRes.status}`);
    }

    return c.json({ ok: true, email_sent: true });
  } catch (err) {
    console.error('[BugPulse Proxy] Resend email failed:', err);
    return c.json({ ok: true, email_sent: false, invite_url: inviteUrl, message: 'Email delivery failed. Share this link manually.' }, 502);
  }
});

// --- Team management ---
app.get('/v1/team', requireAuth, async (c) => {
  const user = c.get('user');
  const rows = await c.env.DB.prepare(
    'SELECT id, email, created_at FROM team_members WHERE user_id = ?',
  ).bind(user.id).all();
  return c.json({ members: rows.results ?? [] });
});

app.delete('/v1/team/:id', requireAuth, async (c) => {
  const user = c.get('user');
  const memberId = c.req.param('id');

  // Delete member and their sessions
  await c.env.DB.prepare('DELETE FROM team_members WHERE id = ? AND user_id = ?').bind(memberId, user.id).run();
  await c.env.DB.prepare('DELETE FROM sessions WHERE team_member_id = ?').bind(memberId).run();

  return c.json({ deleted: true });
});

// --- Dashboard report endpoints ---
app.get('/v1/dashboard/reports', requireDashboardAuth, async (c) => {
  const user = c.get('user');
  const page = parseInt(c.req.query('page') ?? '1', 10);
  const limit = Math.min(parseInt(c.req.query('limit') ?? '50', 10), 50);
  const screen = c.req.query('screen');
  const severity = c.req.query('severity');
  const offset = (page - 1) * limit;

  let query = 'SELECT id, screen, severity, description, status, screenshot_id, created_at FROM reports WHERE user_id = ?';
  const params: any[] = [user.id];

  if (screen) {
    query += ' AND screen = ?';
    params.push(screen);
  }
  if (severity) {
    query += ' AND severity = ?';
    params.push(severity);
  }

  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const rows = await c.env.DB.prepare(query).bind(...params).all();
  return c.json({ reports: rows.results ?? [], page, limit });
});

app.get('/v1/dashboard/reports/:id', requireDashboardAuth, async (c) => {
  const user = c.get('user');
  const reportId = c.req.param('id');

  const report = await c.env.DB.prepare(
    'SELECT * FROM reports WHERE id = ? AND user_id = ?',
  ).bind(reportId, user.id).first();

  if (!report) return c.json({ error: 'not_found' }, 404);
  return c.json({ report });
});

app.patch('/v1/reports/:id', requireDashboardAuth, async (c) => {
  const user = c.get('user');
  const reportId = c.req.param('id');
  const body = await c.req.json<{ status?: string }>();

  if (!body.status || !['new', 'triaged', 'fixed'].includes(body.status)) {
    return c.json({ error: 'validation_error', details: ['status must be "new", "triaged", or "fixed"'] }, 422);
  }

  const result = await c.env.DB.prepare(
    'UPDATE reports SET status = ? WHERE id = ? AND user_id = ?',
  ).bind(body.status, reportId, user.id).run();

  if ((result.meta.changes ?? 0) === 0) {
    return c.json({ error: 'not_found' }, 404);
  }

  return c.json({ ok: true, status: body.status });
});

// --- Public stats (unauthenticated, rate limited, cached) ---
let statsCache: { value: number | null; cachedAt: number } = { value: null, cachedAt: 0 };

app.get('/v1/stats/public', async (c) => {
  const now = Date.now();
  if (statsCache.value !== null && now - statsCache.cachedAt < 5 * 60 * 1000) {
    return c.json({ totalReports: statsCache.value });
  }

  try {
    const row = await c.env.DB.prepare('SELECT COUNT(*) as count FROM reports').first<{ count: number }>();
    statsCache = { value: row?.count ?? 0, cachedAt: now };
    return c.json({ totalReports: statsCache.value });
  } catch {
    return c.json({ totalReports: statsCache.value });
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

    // Clean stale report_status rows (30-day TTL)
    const statusCleaned = await env.DB.prepare(
      "DELETE FROM report_status WHERE updated_at < datetime('now', '-30 days')",
    ).run();

    // Clean old failed_reports (7-day TTL)
    const failedCleaned = await env.DB.prepare(
      "DELETE FROM failed_reports WHERE created_at < datetime('now', '-7 days')",
    ).run();

    // Clean old reports (30-day TTL)
    const reportsCleaned = await env.DB.prepare(
      "DELETE FROM reports WHERE created_at < datetime('now', '-30 days')",
    ).run();

    // Clean expired sessions
    const sessionsCleaned = await env.DB.prepare(
      "DELETE FROM sessions WHERE expires_at < datetime('now')",
    ).run();

    // Clean expired magic tokens (24h TTL)
    const tokensCleaned = await env.DB.prepare(
      "DELETE FROM magic_tokens WHERE expires_at < datetime('now')",
    ).run();

    console.log(`[BugPulse Proxy] Cleaned ${hashCleaned} hashes, ${spikeCleaned} spike windows, ${graceExpired} grace periods, ${statusCleaned.meta.changes ?? 0} stale statuses, ${failedCleaned.meta.changes ?? 0} old failed reports, ${reportsCleaned.meta.changes ?? 0} old reports, ${sessionsCleaned.meta.changes ?? 0} expired sessions, ${tokensCleaned.meta.changes ?? 0} expired tokens`);
  },
};
