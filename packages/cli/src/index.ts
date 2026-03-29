#!/usr/bin/env node

import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';

const PROXY_URL = process.env.BUGPULSE_PROXY_URL || 'https://proxy.bugpulse.dev';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

async function signup(): Promise<void> {
  console.log('\n  BugPulse — Proxy Signup\n');

  const email = await ask('  Email: ');
  if (!email || !email.includes('@')) {
    console.error('  Invalid email.');
    process.exit(1);
  }

  console.log('  Creating account...');

  const response = await fetch(`${PROXY_URL}/v1/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });

  if (response.status === 409) {
    console.error('  This email is already registered.');
    process.exit(1);
  }

  if (!response.ok) {
    console.error(`  Signup failed (${response.status}).`);
    process.exit(1);
  }

  const data = (await response.json()) as { api_key: string; hmac_secret: string };

  console.log('\n  Account created!\n');
  console.log(`  API Key:     ${data.api_key}`);
  console.log(`  HMAC Secret: ${data.hmac_secret}`);
  console.log('\n  IMPORTANT: Save these now. The HMAC secret cannot be retrieved later.\n');

  const writeEnv = await ask('  Write to .env file? (y/n): ');
  if (writeEnv.toLowerCase() === 'y') {
    const envPath = path.resolve(process.cwd(), '.env');
    const lines = [
      `BUGPULSE_API_KEY=${data.api_key}`,
      `BUGPULSE_HMAC_SECRET=${data.hmac_secret}`,
      `BUGPULSE_PROXY_URL=${PROXY_URL}`,
    ].join('\n');

    if (fs.existsSync(envPath)) {
      fs.appendFileSync(envPath, `\n# BugPulse\n${lines}\n`);
      console.log(`  Appended to ${envPath}`);
    } else {
      fs.writeFileSync(envPath, `# BugPulse\n${lines}\n`);
      console.log(`  Created ${envPath}`);
    }
  }

  rl.close();
}

async function addIntegration(): Promise<void> {
  console.log('\n  BugPulse — Add Integration\n');

  const apiKey = process.env.BUGPULSE_API_KEY || await ask('  API Key: ');

  const typeOptions = ['linear', 'github', 'jira'];
  console.log('  Integration types: ' + typeOptions.join(', '));
  const type = await ask('  Type: ');

  if (!typeOptions.includes(type)) {
    console.error(`  Unknown type "${type}".`);
    process.exit(1);
  }

  let config: Record<string, string> = {};

  if (type === 'linear') {
    config.token = await ask('  Linear API token: ');
    config.team_id = await ask('  Team ID: ');
    config.project_id = await ask('  Project ID (optional): ');
    if (!config.project_id) delete config.project_id;
  } else if (type === 'github') {
    config.token = await ask('  GitHub personal access token: ');
    config.owner = await ask('  Repo owner: ');
    config.repo = await ask('  Repo name: ');
  } else if (type === 'jira') {
    config.email = await ask('  Jira email: ');
    config.api_token = await ask('  Jira API token: ');
    config.domain = await ask('  Jira domain (e.g., team.atlassian.net): ');
    config.project_key = await ask('  Project key (e.g., BUG): ');
  }

  console.log('  Adding integration...');

  const response = await fetch(`${PROXY_URL}/v1/integrations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-BugPulse-Key': apiKey,
    },
    body: JSON.stringify({ type, config }),
  });

  if (!response.ok) {
    console.error(`  Failed (${response.status}).`);
    process.exit(1);
  }

  const data = (await response.json()) as { id: string; type: string };
  console.log(`\n  Integration added: ${data.type} (${data.id})`);

  rl.close();
}

async function listIntegrations(): Promise<void> {
  const apiKey = process.env.BUGPULSE_API_KEY;
  if (!apiKey) {
    console.error('  Set BUGPULSE_API_KEY environment variable.');
    process.exit(1);
  }

  const response = await fetch(`${PROXY_URL}/v1/integrations`, {
    headers: { 'X-BugPulse-Key': apiKey },
  });

  if (!response.ok) {
    console.error(`  Failed (${response.status}).`);
    process.exit(1);
  }

  const data = (await response.json()) as { integrations: Array<{ id: string; type: string; enabled: number }> };

  console.log('\n  Integrations:\n');
  if (data.integrations.length === 0) {
    console.log('  (none)');
  } else {
    for (const i of data.integrations) {
      console.log(`  ${i.type.padEnd(10)} ${i.id}  ${i.enabled ? 'enabled' : 'disabled'}`);
    }
  }

  rl.close();
}

// Main
const command = process.argv[2];

switch (command) {
  case 'signup':
    signup().catch(console.error);
    break;
  case 'add-integration':
    addIntegration().catch(console.error);
    break;
  case 'integrations':
    listIntegrations().catch(console.error);
    break;
  default:
    console.log(`
  BugPulse CLI

  Commands:
    signup              Create a new account
    add-integration     Add a Linear, GitHub, or Jira integration
    integrations        List configured integrations

  Usage:
    npx @bugpulse/cli signup
    npx @bugpulse/cli add-integration
    npx @bugpulse/cli integrations
`);
    process.exit(0);
}
