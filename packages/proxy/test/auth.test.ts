import { describe, it, expect, beforeEach } from 'vitest';
import { app } from '../src/index';
import { createMockEnv, seedUser } from './helpers';

let env: ReturnType<typeof createMockEnv>;

describe('Authentication', () => {
  beforeEach(async () => {
    env = createMockEnv();
    await seedUser(env);
  });

  it('returns 403 for missing API key', async () => {
    const res = await app.request('/v1/integrations', {}, env);
    expect(res.status).toBe(403);
  });

  it('returns 403 for invalid API key', async () => {
    const res = await app.request('/v1/integrations', {
      headers: { 'X-BugPulse-Key': 'bp_invalid' },
    }, env);
    expect(res.status).toBe(403);
  });

  it('accepts valid API key', async () => {
    const res = await app.request('/v1/integrations', {
      headers: { 'X-BugPulse-Key': 'bp_testkey123' },
    }, env);
    expect(res.status).toBe(200);
  });
});

describe('API key rotation', () => {
  beforeEach(async () => {
    env = createMockEnv();
    await seedUser(env);
  });

  it('rotates API key and returns new one', async () => {
    const res = await app.request('/v1/rotate-key', {
      method: 'POST',
      headers: { 'X-BugPulse-Key': 'bp_testkey123' },
    }, env);

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.api_key).toMatch(/^bp_/);
    expect(data.api_key).not.toBe('bp_testkey123');
  });
});

describe('Tier gating', () => {
  beforeEach(async () => {
    env = createMockEnv();
    await seedUser(env, { plan: 'free' });
  });

  it('returns 402 for free tier accessing proxy reports', async () => {
    const res = await app.request('/v1/reports', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-BugPulse-Key': 'bp_testkey123',
        'X-BugPulse-Signature': 'fakesig',
        'X-BugPulse-Timestamp': Math.floor(Date.now() / 1000).toString(),
      },
      body: JSON.stringify({}),
    }, env);

    expect(res.status).toBe(402);
    const data = await res.json() as any;
    expect(data.error).toBe('upgrade_required');
  });
});
