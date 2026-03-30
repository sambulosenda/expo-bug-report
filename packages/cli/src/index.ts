#!/usr/bin/env node

import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';

const CONFIG_FILE = '.bugpulserc.json';
const PROXY_URL = process.env.BUGPULSE_PROXY_URL || 'https://bugpulse-proxy.sambulo.workers.dev';

interface Config {
  apiKey: string;
  hmacSecret: string;
  proxyUrl: string;
}

function loadConfig(): Config | null {
  if (process.env.BUGPULSE_API_KEY && process.env.BUGPULSE_HMAC_SECRET) {
    return { apiKey: process.env.BUGPULSE_API_KEY, hmacSecret: process.env.BUGPULSE_HMAC_SECRET, proxyUrl: PROXY_URL };
  }
  const cwdPath = path.resolve(process.cwd(), CONFIG_FILE);
  if (fs.existsSync(cwdPath)) {
    try { return JSON.parse(fs.readFileSync(cwdPath, 'utf8')); } catch { /* ignore */ }
  }
  const homePath = path.resolve(process.env.HOME ?? '~', CONFIG_FILE);
  if (fs.existsSync(homePath)) {
    try { return JSON.parse(fs.readFileSync(homePath, 'utf8')); } catch { /* ignore */ }
  }
  return null;
}

function saveConfig(config: Config): void {
  const configPath = path.resolve(process.cwd(), CONFIG_FILE);
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
  const gitignorePath = path.resolve(process.cwd(), '.gitignore');
  if (fs.existsSync(gitignorePath)) {
    const content = fs.readFileSync(gitignorePath, 'utf8');
    if (!content.includes(CONFIG_FILE)) {
      fs.appendFileSync(gitignorePath, `\n# BugPulse config (contains API key)\n${CONFIG_FILE}\n`);
    }
  } else {
    fs.writeFileSync(gitignorePath, `# BugPulse config (contains API key)\n${CONFIG_FILE}\n`);
  }
}

function requireConfig(): Config {
  const config = loadConfig();
  if (!config) { console.error('  No BugPulse config found. Run: npx @bugpulse/cli signup'); process.exit(1); }
  return config;
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
function ask(question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, (answer) => resolve(answer.trim())));
}

async function apiRequest(config: Config, method: string, urlPath: string, body?: unknown): Promise<Response> {
  return fetch(`${config.proxyUrl}${urlPath}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-BugPulse-Key': config.apiKey },
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function signup(): Promise<void> {
  console.log('\n  BugPulse Signup\n');
  const email = await ask('  Email: ');
  if (!email || !email.includes('@')) { console.error('  Invalid email.'); process.exit(1); }

  console.log('  Creating account...');
  const res = await fetch(`${PROXY_URL}/v1/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });

  if (res.status === 409) { console.error('  Email already registered. Run: npx @bugpulse/cli recover'); process.exit(1); }
  if (!res.ok) { console.error(`  Signup failed (${res.status}).`); process.exit(1); }

  const data = await res.json() as { api_key: string; hmac_secret: string };
  saveConfig({ apiKey: data.api_key, hmacSecret: data.hmac_secret, proxyUrl: PROXY_URL });

  console.log(`\n  Account created! Config saved to ${CONFIG_FILE}`);
  console.log(`  API Key:     ${data.api_key}`);
  console.log(`  HMAC Secret: ${data.hmac_secret}`);
  console.log('\n  IMPORTANT: The HMAC secret cannot be retrieved later.\n');
  rl.close();
}

async function recover(): Promise<void> {
  console.log('\n  BugPulse Key Recovery\n');
  const email = await ask('  Email: ');
  if (!email || !email.includes('@')) { console.error('  Invalid email.'); process.exit(1); }

  const res = await fetch(`${PROXY_URL}/v1/recover`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });

  if (res.status === 404) { console.error('  Email not found.'); process.exit(1); }
  if (res.status === 429) { console.error('  Too many attempts. Try again later.'); process.exit(1); }
  if (!res.ok) { console.error(`  Recovery failed (${res.status}).`); process.exit(1); }

  const data = await res.json() as { api_key: string; hmac_secret: string };
  saveConfig({ apiKey: data.api_key, hmacSecret: data.hmac_secret, proxyUrl: PROXY_URL });

  console.log(`\n  Keys re-issued. Config saved to ${CONFIG_FILE}`);
  console.log(`  API Key:     ${data.api_key}`);
  console.log(`  HMAC Secret: ${data.hmac_secret}`);
  console.log('\n  WARNING: Your old keys are now invalid.\n');
  rl.close();
}

async function init(): Promise<void> {
  console.log('\n  BugPulse Project Setup\n');

  const pkgPath = path.resolve(process.cwd(), 'package.json');
  if (!fs.existsSync(pkgPath)) {
    console.log('  No package.json found. Run this from your project root.\n');
    console.log('  Generic setup:');
    console.log('    npm install @bugpulse/react-native');
    console.log('    npx @bugpulse/cli signup\n');
    rl.close();
    return;
  }

  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const isExpo = !!deps['expo'];
  const hasExpoRouter = !!deps['expo-router'];
  const hasReactNav = !!deps['@react-navigation/native'];
  const hasZustand = !!deps['zustand'];
  const hasRedux = !!deps['@reduxjs/toolkit'] || !!deps['redux'];

  console.log('  Detected:');
  console.log(`    Framework:  ${isExpo ? 'Expo' : 'React Native'}`);
  console.log(`    Navigation: ${hasExpoRouter ? 'Expo Router' : hasReactNav ? 'React Navigation' : 'none'}`);
  console.log(`    State:      ${hasZustand ? 'Zustand' : hasRedux ? 'Redux' : 'none'}`);

  let config = loadConfig();
  if (!config) {
    console.log('\n  No config found. Signing up first...\n');
    const email = await ask('  Email: ');
    if (!email || !email.includes('@')) { console.error('  Invalid email.'); process.exit(1); }

    const res = await fetch(`${PROXY_URL}/v1/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    if (res.status === 409) { console.error('  Email already registered. Run: npx @bugpulse/cli recover'); process.exit(1); }
    if (!res.ok) { console.error(`  Signup failed (${res.status}).`); process.exit(1); }

    const data = await res.json() as { api_key: string; hmac_secret: string };
    config = { apiKey: data.api_key, hmacSecret: data.hmac_secret, proxyUrl: PROXY_URL };
    saveConfig(config);
    console.log(`  Config saved to ${CONFIG_FILE}`);
  }

  const layoutFile = hasExpoRouter ? 'app/_layout.tsx' : 'App.tsx';
  console.log(`\n  Add to your ${layoutFile}:\n`);
  console.log(`    import { BugReportProvider } from '@bugpulse/react-native';\n`);
  console.log(`    <BugReportProvider`);
  console.log(`      integration={{`);
  console.log(`        type: 'proxy',`);
  console.log(`        apiKey: '${config.apiKey}',`);
  console.log(`        hmacSecret: '${config.hmacSecret}',`);
  console.log(`      }}`);
  console.log(`    >`);
  console.log(`      {/* your existing layout */}`);
  console.log(`    </BugReportProvider>\n`);
  rl.close();
}

async function addIntegration(): Promise<void> {
  const config = requireConfig();
  console.log('\n  BugPulse — Add Integration\n');

  const typeOptions = ['linear', 'github', 'jira'];
  console.log('  Types: ' + typeOptions.join(', '));
  const type = await ask('  Type: ');
  if (!typeOptions.includes(type)) { console.error(`  Unknown type "${type}".`); process.exit(1); }

  const integrationConfig: Record<string, string> = {};

  if (type === 'linear') {
    integrationConfig.token = await ask('  Linear API token: ');
    integrationConfig.team_id = await ask('  Team ID: ');
    const projectId = await ask('  Project ID (optional, enter to skip): ');
    if (projectId) integrationConfig.project_id = projectId;
    console.log('\n  For bidirectional feedback (optional):');
    console.log('  1. Go to https://linear.app/settings/api/webhooks');
    console.log(`  2. Create webhook with URL: ${config.proxyUrl}/v1/webhooks/linear`);
    console.log('  3. Copy the signing secret');
    const webhookSecret = await ask('  Webhook signing secret (enter to skip): ');
    if (webhookSecret) integrationConfig.linear_webhook_secret = webhookSecret;
  } else if (type === 'github') {
    integrationConfig.token = await ask('  GitHub personal access token: ');
    integrationConfig.owner = await ask('  Repo owner: ');
    integrationConfig.repo = await ask('  Repo name: ');
  } else if (type === 'jira') {
    integrationConfig.email = await ask('  Jira email: ');
    integrationConfig.api_token = await ask('  Jira API token: ');
    integrationConfig.domain = await ask('  Jira domain (e.g., team.atlassian.net): ');
    integrationConfig.project_key = await ask('  Project key (e.g., BUG): ');
  }

  console.log('  Validating and adding...');
  const res = await apiRequest(config, 'POST', '/v1/integrations', { type, config: integrationConfig });

  if (res.status === 422) {
    const data = await res.json() as { error: string; details?: string[] };
    console.error(`  Failed: ${data.details?.join(', ') ?? data.error}`);
    process.exit(1);
  }
  if (!res.ok) { console.error(`  Failed (${res.status}).`); process.exit(1); }

  const data = await res.json() as { id: string; type: string };
  console.log(`\n  Integration added: ${data.type} (${data.id})\n`);
  rl.close();
}

async function status(): Promise<void> {
  const config = requireConfig();
  const res = await apiRequest(config, 'GET', '/v1/integrations');
  if (!res.ok) { console.error(`  Failed (${res.status}).`); process.exit(1); }

  const data = await res.json() as { integrations: Array<{ id: string; type: string; enabled: number }> };
  console.log('\n  BugPulse Status\n');
  console.log(`  Proxy: ${config.proxyUrl}`);
  console.log(`  Integrations: ${data.integrations.length}`);
  for (const i of data.integrations) {
    console.log(`    ${i.type.padEnd(10)} ${i.id.slice(0, 8)}...  ${i.enabled ? 'enabled' : 'disabled'}`);
  }
  console.log('');
}

async function health(): Promise<void> {
  const config = requireConfig();
  try {
    const res = await fetch(`${config.proxyUrl}/v1/health`);
    console.log(`\n  Proxy: ${res.ok ? 'OK' : 'DOWN'}`);
  } catch { console.log('\n  Proxy: UNREACHABLE'); }

  const intRes = await apiRequest(config, 'GET', '/v1/integrations');
  if (!intRes.ok) { console.log('  Integrations: failed to fetch\n'); return; }

  const data = await intRes.json() as { integrations: Array<{ id: string; type: string }> };
  for (const integration of data.integrations) {
    const healthRes = await apiRequest(config, 'GET', `/v1/integrations/${integration.id}/health`);
    if (healthRes.ok) {
      const h = await healthRes.json() as { healthy: boolean; error?: string };
      console.log(`  ${integration.type.padEnd(10)} ${h.healthy ? 'HEALTHY' : `UNHEALTHY: ${h.error}`}`);
    } else {
      console.log(`  ${integration.type.padEnd(10)} ERROR (${healthRes.status})`);
    }
  }
  console.log('');
}

async function watch(): Promise<void> {
  const config = requireConfig();
  console.log('\n  Watching for new reports... (Ctrl+C to stop)\n');
  let since = new Date().toISOString();

  const poll = async () => {
    try {
      const res = await apiRequest(config, 'GET', `/v1/reports/recent?since=${encodeURIComponent(since)}`);
      if (res.ok) {
        const data = await res.json() as { reports: Array<{ screen: string; severity: string; created_at: string }> };
        for (const r of data.reports) {
          const time = new Date(r.created_at).toLocaleTimeString();
          console.log(`  [${time}] ${(r.severity ?? 'report').padEnd(8)} ${r.screen}`);
        }
        if (data.reports.length > 0) since = data.reports[0]!.created_at;
      }
    } catch { /* retry next poll */ }
  };

  await poll();
  setInterval(poll, 5000);
}

async function stats(): Promise<void> {
  const config = requireConfig();
  const res = await apiRequest(config, 'GET', '/v1/analytics');
  if (!res.ok) { console.error(`  Failed (${res.status}).`); process.exit(1); }

  const data = await res.json() as {
    period: { from: string; to: string };
    topScreens: Array<{ screen: string; count: number }>;
    volumeByDay: Array<{ date: string; count: number }>;
    severityBreakdown: Record<string, number>;
  };

  console.log(`\n  BugPulse Stats (${data.period.from.slice(0, 10)} to ${data.period.to.slice(0, 10)})\n`);
  if (data.topScreens.length > 0) {
    console.log('  Top Screens:');
    for (const s of data.topScreens) console.log(`    ${s.screen.padEnd(30)} ${s.count} reports`);
  }
  const total = Object.values(data.severityBreakdown).reduce((a, b) => a + b, 0);
  if (total > 0) {
    console.log('\n  Severity:');
    for (const [sev, count] of Object.entries(data.severityBreakdown)) console.log(`    ${sev.padEnd(12)} ${count}`);
  }
  if (data.volumeByDay.length > 0) {
    console.log('\n  Volume:');
    for (const d of data.volumeByDay) console.log(`    ${d.date} ${'█'.repeat(Math.min(d.count, 40))} ${d.count}`);
  }
  console.log('');
}

async function billing(): Promise<void> {
  const config = requireConfig();
  const res = await apiRequest(config, 'POST', '/v1/billing/portal');
  if (res.status === 422) { console.log('\n  No active subscription. Visit https://bugpulse.dev to upgrade.\n'); return; }
  if (!res.ok) { console.error(`  Failed (${res.status}).`); process.exit(1); }

  const data = await res.json() as { url: string };
  console.log('\n  Opening billing portal...\n');
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  execFile(cmd, [data.url]);
}

async function showFailed(): Promise<void> {
  const config = requireConfig();
  const res = await apiRequest(config, 'GET', '/v1/reports/failed');
  if (!res.ok) { console.error(`  Failed (${res.status}).`); process.exit(1); }

  const data = await res.json() as { failed: Array<{ id: string; error_message: string; retries: number; created_at: string }> };
  if (data.failed.length === 0) { console.log('\n  No failed reports.\n'); return; }

  console.log(`\n  Failed Reports (${data.failed.length}):\n`);
  for (const f of data.failed) {
    console.log(`  ${f.id.slice(0, 8)}  retries:${f.retries}  ${f.error_message}  ${f.created_at.slice(0, 10)}`);
  }
  console.log('\n  Replay with: npx @bugpulse/cli replay <id>\n');
}

async function replay(): Promise<void> {
  const config = requireConfig();
  const id = process.argv[3];
  if (!id) { console.error('  Usage: npx @bugpulse/cli replay <report-id>'); process.exit(1); }

  const res = await apiRequest(config, 'POST', '/v1/reports/replay', { id });
  if (res.status === 404) { console.error('  Report not found.'); process.exit(1); }
  if (res.status === 422) { console.error('  Max retries exceeded.'); process.exit(1); }

  if (res.ok) {
    const data = await res.json() as { issue: { url: string } };
    console.log(`\n  Replay succeeded! Issue: ${data.issue.url}\n`);
  } else {
    const data = await res.json() as { error: string; retries: number };
    console.error(`  Replay failed (attempt ${data.retries}). Error: ${data.error}`);
  }
}

const command = process.argv[2];
switch (command) {
  case 'signup': signup().catch(console.error); break;
  case 'recover': recover().catch(console.error); break;
  case 'init': init().catch(console.error); break;
  case 'add-integration': addIntegration().catch(console.error); break;
  case 'status': status().catch(console.error); break;
  case 'health': health().catch(console.error); break;
  case 'watch': watch().catch(console.error); break;
  case 'stats': stats().catch(console.error); break;
  case 'billing': billing().catch(console.error); break;
  case 'failed': showFailed().catch(console.error); break;
  case 'replay': replay().catch(console.error); break;
  default:
    console.log(`
  BugPulse CLI

  Setup:
    signup              Create a new account
    recover             Re-issue lost API keys
    init                Detect project and generate setup code

  Integrations:
    add-integration     Add Linear, GitHub, or Jira integration
    status              Show configured integrations
    health              Check proxy and integration health

  Monitoring:
    watch               Live stream of incoming reports
    stats               Report analytics (top screens, volume, severity)
    failed              Show failed reports
    replay <id>         Retry a failed report

  Billing:
    billing             Open Stripe billing portal
`);
    process.exit(0);
}
