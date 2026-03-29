import { lookupUser, verifyHmac, checkTierAccess } from './auth';
import { checkDuplicate, updateHashWithIssueUrl, cleanupExpiredHashes } from './dedup';
import { deriveLabels } from './labels';
import { uploadScreenshot } from './r2';
import { decrypt, encrypt } from './encrypt';
import { createLinearIssue, addLinearComment } from './integrations/linear';
import { createGithubIssue, addGithubComment } from './integrations/github';
import { createJiraIssue, addJiraComment } from './integrations/jira';
import type { Env, IncomingReport, IntegrationRow, IssueResult, QueueMessage, RoutingConditions } from './types';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/v1/health') {
      return json({ status: 'ok' });
    }

    if (request.method === 'POST' && url.pathname === '/v1/reports') {
      return handleReport(request, env);
    }

    if (request.method === 'POST' && url.pathname === '/v1/signup') {
      return handleSignup(request, env);
    }

    if (request.method === 'POST' && url.pathname === '/v1/integrations') {
      return handleCreateIntegration(request, env);
    }

    if (request.method === 'GET' && url.pathname === '/v1/integrations') {
      return handleListIntegrations(request, env);
    }

    if (request.method === 'DELETE' && url.pathname.startsWith('/v1/integrations/')) {
      return handleDeleteIntegration(request, env, url.pathname.split('/').pop()!);
    }

    if (request.method === 'POST' && url.pathname === '/v1/routing-rules') {
      return handleCreateRoutingRule(request, env);
    }

    return json({ error: 'not_found' }, 404);
  },

  async queue(batch: MessageBatch<QueueMessage>, env: Env): Promise<void> {
    for (const msg of batch.messages) {
      try {
        await processQueueMessage(msg.body, env);
        msg.ack();
      } catch (error) {
        console.error('[BugPulse Proxy] Queue consumer error:', error);
        msg.retry();
      }
    }
  },

  async scheduled(_event: ScheduledEvent, env: Env): Promise<void> {
    const cleaned = await cleanupExpiredHashes(env);
    console.log(`[BugPulse Proxy] Cleaned ${cleaned} expired hashes`);
  },
};

// --- Report handling ---

async function handleReport(request: Request, env: Env): Promise<Response> {
  // Auth
  const apiKey = request.headers.get('X-BugPulse-Key');
  if (!apiKey) return json({ error: 'invalid_api_key' }, 403);

  const user = await lookupUser(apiKey, env);
  if (!user) return json({ error: 'invalid_api_key' }, 403);

  // Free tier shouldn't reach the proxy
  if (!checkTierAccess(user.plan, 'proxy')) {
    return json({ error: 'upgrade_required', feature: 'proxy', plan_required: 'starter' }, 402);
  }

  // HMAC verification
  const signature = request.headers.get('X-BugPulse-Signature');
  const timestamp = request.headers.get('X-BugPulse-Timestamp');
  const body = await request.text();

  if (!signature || !timestamp) {
    return json({ error: 'invalid_signature' }, 403);
  }

  const valid = await verifyHmac(body, signature, timestamp, user.hmac_secret);
  if (!valid) {
    return json({ error: 'invalid_signature' }, 403);
  }

  let report: IncomingReport;
  try {
    report = JSON.parse(body) as IncomingReport;
  } catch {
    return json({ error: 'validation_error', details: ['Invalid JSON'] }, 422);
  }

  // Upload screenshot to R2
  let screenshotUrl: string | null = null;
  if (report.screenshotBase64) {
    screenshotUrl = await uploadScreenshot(env, report.screenshotBase64, user.id);
    // Graceful: if upload fails, screenshotUrl stays null
  }

  // Auto-labels
  const labels = checkTierAccess(user.plan, 'auto_labels')
    ? deriveLabels(report)
    : [];

  // Duplicate detection (pro/beta only)
  const errorMsg = report.diagnostics?.lastError?.message ?? null;
  if (checkTierAccess(user.plan, 'dedup')) {
    const { isDuplicate, existingIssueUrl } = await checkDuplicate(
      env, user.id, report.screen, errorMsg,
    );

    if (isDuplicate && existingIssueUrl) {
      // Add comment to existing issue instead of creating new one
      await addCommentToExistingIssue(env, user, existingIssueUrl, report);
      return json({
        success: true,
        duplicate: true,
        issues: [{ destination: 'existing', url: existingIssueUrl, key: 'duplicate' }],
      });
    }
  }

  // Get user's integrations and routing rules
  const integrations = await env.DB.prepare(
    'SELECT * FROM integrations WHERE user_id = ? AND enabled = 1',
  ).bind(user.id).all<IntegrationRow>();

  const rules = await env.DB.prepare(
    'SELECT * FROM routing_rules WHERE user_id = ?',
  ).bind(user.id).all<{ integration_id: string; conditions: string | null }>();

  // Determine which integrations to fire
  const matchedIntegrations = filterByRoutingRules(
    integrations.results ?? [],
    rules.results ?? [],
    report,
  );

  if (matchedIntegrations.length === 0) {
    return json({ success: true, issues: [] });
  }

  // Check multi-routing tier limit
  const maxDestinations = user.plan === 'starter' ? 2 : Infinity;
  const activeIntegrations = matchedIntegrations.slice(0, maxDestinations);

  // Sync: create issue on primary integration
  const primary = activeIntegrations[0]!;
  let primaryResult: IssueResult | null = null;

  try {
    const config = JSON.parse(await decrypt(primary.config, env.ENCRYPTION_KEY)) as Record<string, string>;
    primaryResult = await createIssue(primary.type, report, config, labels, screenshotUrl);

    // Update dedup hash with issue URL
    if (primaryResult && checkTierAccess(user.plan, 'dedup')) {
      await updateHashWithIssueUrl(env, user.id, report.screen, errorMsg, primaryResult.url);
    }
  } catch (error) {
    console.error('[BugPulse Proxy] Primary integration failed:', error);
    return json({ error: 'internal_error' }, 500);
  }

  // Async: enqueue secondary integrations
  for (let i = 1; i < activeIntegrations.length; i++) {
    const integration = activeIntegrations[i]!;
    const config = JSON.parse(await decrypt(integration.config, env.ENCRYPTION_KEY)) as Record<string, string>;

    await env.FANOUT_QUEUE.send({
      report,
      integration: { id: integration.id, type: integration.type, config },
      labels,
      screenshotUrl,
      userId: user.id,
    } satisfies QueueMessage);
  }

  const issues: IssueResult[] = primaryResult ? [primaryResult] : [];
  return json({ success: true, issues });
}

// --- Queue processing ---

async function processQueueMessage(msg: QueueMessage, _env: Env): Promise<void> {
  await createIssue(
    msg.integration.type,
    msg.report,
    msg.integration.config,
    msg.labels,
    msg.screenshotUrl,
  );
}

// --- Integration dispatch ---

async function createIssue(
  type: IntegrationRow['type'],
  report: IncomingReport,
  config: Record<string, string>,
  labels: string[],
  screenshotUrl: string | null,
): Promise<IssueResult> {
  switch (type) {
    case 'linear':
      return createLinearIssue(report, config as any, labels, screenshotUrl);
    case 'github':
      return createGithubIssue(report, config as any, labels, screenshotUrl);
    case 'jira':
      return createJiraIssue(report, config as any, labels, screenshotUrl);
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
  // Determine integration type from URL
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

// --- Routing ---

function filterByRoutingRules(
  integrations: IntegrationRow[],
  rules: Array<{ integration_id: string; conditions: string | null }>,
  report: IncomingReport,
): IntegrationRow[] {
  if (rules.length === 0) {
    // No rules = all integrations fire
    return integrations;
  }

  const matchedIds = new Set<string>();
  for (const rule of rules) {
    if (!rule.conditions) {
      // null conditions = always fire
      matchedIds.add(rule.integration_id);
      continue;
    }

    const conditions = JSON.parse(rule.conditions) as RoutingConditions;
    if (matchesConditions(conditions, report)) {
      matchedIds.add(rule.integration_id);
    }
  }

  return integrations.filter((i) => matchedIds.has(i.id));
}

function matchesConditions(conditions: RoutingConditions, report: IncomingReport): boolean {
  if (conditions.screen_match && !report.screen.startsWith(conditions.screen_match)) {
    return false;
  }

  if (conditions.platform) {
    const os = report.device.os.toLowerCase();
    if (conditions.platform === 'ios' && !os.includes('ios')) return false;
    if (conditions.platform === 'android' && !os.includes('android')) return false;
  }

  // error_type matching would require classification — skip for now
  return true;
}

// --- Signup ---

async function handleSignup(request: Request, env: Env): Promise<Response> {
  const body = (await request.json()) as { email?: string };
  if (!body.email) {
    return json({ error: 'validation_error', details: ['email required'] }, 422);
  }

  // Check if email already exists
  const existing = await env.DB.prepare(
    'SELECT id FROM users WHERE email = ?',
  ).bind(body.email).first();

  if (existing) {
    return json({ error: 'email_exists' }, 409);
  }

  const id = crypto.randomUUID();
  const apiKey = `bp_${crypto.randomUUID().replace(/-/g, '')}`;
  const hmacSecret = `bps_${crypto.randomUUID().replace(/-/g, '')}`;

  await env.DB.prepare(
    'INSERT INTO users (id, email, api_key, hmac_secret, plan) VALUES (?, ?, ?, ?, ?)',
  ).bind(id, body.email, apiKey, hmacSecret, 'free').run();

  return json({ api_key: apiKey, hmac_secret: hmacSecret });
}

// --- Integration CRUD ---

async function handleCreateIntegration(request: Request, env: Env): Promise<Response> {
  const user = await authenticateRequest(request, env);
  if (!user) return json({ error: 'invalid_api_key' }, 403);

  const body = (await request.json()) as { type?: string; config?: Record<string, string> };
  if (!body.type || !body.config) {
    return json({ error: 'validation_error', details: ['type and config required'] }, 422);
  }

  const id = crypto.randomUUID();
  const encryptedConfig = await encrypt(JSON.stringify(body.config), env.ENCRYPTION_KEY);

  await env.DB.prepare(
    'INSERT INTO integrations (id, user_id, type, config) VALUES (?, ?, ?, ?)',
  ).bind(id, user.id, body.type, encryptedConfig).run();

  return json({ id, type: body.type, enabled: true });
}

async function handleListIntegrations(request: Request, env: Env): Promise<Response> {
  const user = await authenticateRequest(request, env);
  if (!user) return json({ error: 'invalid_api_key' }, 403);

  const results = await env.DB.prepare(
    'SELECT id, type, enabled, created_at FROM integrations WHERE user_id = ?',
  ).bind(user.id).all();

  return json({ integrations: results.results ?? [] });
}

async function handleDeleteIntegration(request: Request, env: Env, integrationId: string): Promise<Response> {
  const user = await authenticateRequest(request, env);
  if (!user) return json({ error: 'invalid_api_key' }, 403);

  await env.DB.prepare(
    'DELETE FROM integrations WHERE id = ? AND user_id = ?',
  ).bind(integrationId, user.id).run();

  // Also delete associated routing rules
  await env.DB.prepare(
    'DELETE FROM routing_rules WHERE integration_id = ? AND user_id = ?',
  ).bind(integrationId, user.id).run();

  return json({ deleted: true });
}

async function handleCreateRoutingRule(request: Request, env: Env): Promise<Response> {
  const user = await authenticateRequest(request, env);
  if (!user) return json({ error: 'invalid_api_key' }, 403);

  const body = (await request.json()) as { integration_id?: string; conditions?: RoutingConditions | null };
  if (!body.integration_id) {
    return json({ error: 'validation_error', details: ['integration_id required'] }, 422);
  }

  const id = crypto.randomUUID();
  const conditions = body.conditions ? JSON.stringify(body.conditions) : null;

  await env.DB.prepare(
    'INSERT INTO routing_rules (id, user_id, integration_id, conditions) VALUES (?, ?, ?, ?)',
  ).bind(id, user.id, body.integration_id, conditions).run();

  return json({ id });
}

// --- Helpers ---

async function authenticateRequest(request: Request, env: Env) {
  const apiKey = request.headers.get('X-BugPulse-Key');
  if (!apiKey) return null;
  return lookupUser(apiKey, env);
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
