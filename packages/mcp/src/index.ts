#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import * as fs from 'fs';
import * as path from 'path';

interface Config {
  apiKey: string;
  proxyUrl: string;
}

function loadConfig(): Config {
  // 1. Env var (highest priority)
  if (process.env.BUGPULSE_API_KEY) {
    return {
      apiKey: process.env.BUGPULSE_API_KEY,
      proxyUrl: process.env.BUGPULSE_PROXY_URL || 'https://bugpulse-proxy.sambulo.workers.dev',
    };
  }

  // 2. .bugpulserc.json in cwd
  const cwdPath = path.resolve(process.cwd(), '.bugpulserc.json');
  if (fs.existsSync(cwdPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(cwdPath, 'utf8'));
      if (config.apiKey) return { apiKey: config.apiKey, proxyUrl: config.proxyUrl || 'https://bugpulse-proxy.sambulo.workers.dev' };
    } catch { /* ignore */ }
  }

  // 3. .bugpulserc.json in home dir
  const homePath = path.resolve(process.env.HOME || '~', '.bugpulserc.json');
  if (fs.existsSync(homePath)) {
    try {
      const config = JSON.parse(fs.readFileSync(homePath, 'utf8'));
      if (config.apiKey) return { apiKey: config.apiKey, proxyUrl: config.proxyUrl || 'https://bugpulse-proxy.sambulo.workers.dev' };
    } catch { /* ignore */ }
  }

  throw new Error(
    'No BugPulse API key found. Set BUGPULSE_API_KEY env var or run: npx @bugpulse/cli signup',
  );
}

async function apiRequest(config: Config, method: string, urlPath: string, body?: unknown): Promise<unknown> {
  const res = await fetch(`${config.proxyUrl}${urlPath}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-BugPulse-Key': config.apiKey,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    throw new Error(`BugPulse API error: ${res.status} ${res.statusText}`);
  }

  return res.json();
}

async function main() {
  const config = loadConfig();

  const server = new Server(
    { name: 'bugpulse', version: '0.1.0' },
    { capabilities: { resources: {}, tools: {} } },
  );

  // --- Resources ---
  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: [
      {
        uri: 'bugpulse://reports',
        name: 'Recent Bug Reports',
        description: 'Last 50 bug reports with screen, severity, and timestamp',
        mimeType: 'application/json',
      },
      {
        uri: 'bugpulse://analytics',
        name: 'Report Analytics',
        description: 'Top reported screens, volume by day, severity breakdown (last 7 days)',
        mimeType: 'application/json',
      },
      {
        uri: 'bugpulse://integrations',
        name: 'Configured Integrations',
        description: 'List of configured integrations (Linear, GitHub, Jira) and their status',
        mimeType: 'application/json',
      },
    ],
  }));

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const uri = request.params.uri;

    if (uri === 'bugpulse://reports') {
      const data = await apiRequest(config, 'GET', '/v1/reports/recent?since=' + new Date(Date.now() - 7 * 86400000).toISOString());
      return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(data, null, 2) }] };
    }

    if (uri === 'bugpulse://analytics') {
      const data = await apiRequest(config, 'GET', '/v1/analytics');
      return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(data, null, 2) }] };
    }

    if (uri === 'bugpulse://integrations') {
      const data = await apiRequest(config, 'GET', '/v1/integrations');
      return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(data, null, 2) }] };
    }

    throw new Error(`Unknown resource: ${uri}`);
  });

  // --- Tools ---
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'replay_report',
        description: 'Retry a failed bug report that could not be delivered to the issue tracker',
        inputSchema: {
          type: 'object' as const,
          properties: {
            id: { type: 'string', description: 'The failed report ID (from bugpulse://reports/failed)' },
          },
          required: ['id'],
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name === 'replay_report') {
      const id = request.params.arguments?.id as string;
      if (!id) throw new Error('id is required');

      const result = await apiRequest(config, 'POST', '/v1/reports/replay', { id });
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    throw new Error(`Unknown tool: ${request.params.name}`);
  });

  // --- Start ---
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('BugPulse MCP server error:', error.message);
  process.exit(1);
});
