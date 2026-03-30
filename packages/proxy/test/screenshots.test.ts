import { describe, it, expect, beforeEach } from 'vitest';
import { app } from '../src/index';
import { createMockEnv, seedUser } from './helpers';

let env: ReturnType<typeof createMockEnv>;
const API_KEY = 'bp_testkey123';

describe('Screenshot upload', () => {
  beforeEach(async () => {
    env = createMockEnv();
    await seedUser(env, { plan: 'starter' });
  });

  it('uploads a screenshot and returns an ID', async () => {
    const base64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

    const res = await app.request('/v1/screenshots', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-BugPulse-Key': API_KEY,
      },
      body: JSON.stringify({ base64 }),
    }, env);

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.id).toBeDefined();
  });

  it('rejects upload without auth', async () => {
    const res = await app.request('/v1/screenshots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base64: 'data' }),
    }, env);

    expect(res.status).toBe(403);
  });

  it('rejects upload without base64', async () => {
    const res = await app.request('/v1/screenshots', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-BugPulse-Key': API_KEY,
      },
      body: JSON.stringify({}),
    }, env);

    expect(res.status).toBe(422);
  });
});
