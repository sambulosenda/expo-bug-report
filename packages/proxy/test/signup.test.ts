import { describe, it, expect, beforeEach } from 'vitest';
import { app } from '../src/index';
import { createMockEnv } from './helpers';

let env: ReturnType<typeof createMockEnv>;

describe('POST /v1/signup', () => {
  beforeEach(() => {
    env = createMockEnv();
  });

  it('creates a new user and returns API key + HMAC secret', async () => {
    const res = await app.request('/v1/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'dev@example.com' }),
    }, env);

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.api_key).toMatch(/^bp_/);
    expect(data.hmac_secret).toMatch(/^bps_/);
  });

  it('returns 422 for missing email', async () => {
    const res = await app.request('/v1/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }, env);

    expect(res.status).toBe(422);
  });
});
