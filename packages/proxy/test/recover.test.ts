import { describe, it, expect, beforeEach } from 'vitest';
import { app } from '../src/index';
import { createMockEnv, seedUser } from './helpers';

describe('POST /v1/recover', () => {
  let env: ReturnType<typeof createMockEnv>;

  beforeEach(() => {
    env = createMockEnv();
  });

  it('re-issues credentials for a known email', async () => {
    const user = await seedUser(env);

    const res = await app.request('/v1/recover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: user.email }),
    }, env);

    expect(res.status).toBe(200);
    const data = await res.json() as { api_key: string; hmac_secret: string };
    expect(data.api_key).toBeDefined();
    expect(data.hmac_secret).toBeDefined();
    // New keys should be different from the originals
    expect(data.api_key).not.toBe(user.api_key);
    expect(data.hmac_secret).not.toBe(user.hmac_secret);
  });

  it('returns 404 for unknown email', async () => {
    const res = await app.request('/v1/recover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'nobody@example.com' }),
    }, env);

    expect(res.status).toBe(404);
  });

  it('returns 422 for missing email', async () => {
    const res = await app.request('/v1/recover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }, env);

    expect(res.status).toBe(422);
  });

  it('rate limits after 3 attempts per hour', async () => {
    await seedUser(env, { email: 'ratelimit@test.com' });

    // First 3 should succeed
    for (let i = 0; i < 3; i++) {
      const res = await app.request('/v1/recover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'ratelimit@test.com' }),
      }, env);
      expect(res.status).toBe(200);
    }

    // 4th should be rate limited
    const res = await app.request('/v1/recover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'ratelimit@test.com' }),
    }, env);
    expect(res.status).toBe(429);
    const data = await res.json() as { error: string; retry_after: number };
    expect(data.error).toBe('rate_limited');
    expect(data.retry_after).toBeGreaterThan(0);
  });
});
