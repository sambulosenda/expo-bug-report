import { describe, it, expect, beforeEach } from 'vitest';
import { app } from '../src/index';
import { createMockEnv, seedUser } from './helpers';

describe('POST /v1/checkout', () => {
  let env: ReturnType<typeof createMockEnv>;

  beforeEach(() => {
    env = createMockEnv();
  });

  it('returns 403 without API key', async () => {
    const res = await app.request('/v1/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: 'starter' }),
    }, env);

    expect(res.status).toBe(403);
  });

  it('returns 422 for invalid plan', async () => {
    const user = await seedUser(env);

    const res = await app.request('/v1/checkout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-BugPulse-Key': user.api_key,
      },
      body: JSON.stringify({ plan: 'enterprise' }),
    }, env);

    expect(res.status).toBe(422);
    const data = await res.json() as { error: string };
    expect(data.error).toBe('validation_error');
  });

  it('returns 422 for missing plan', async () => {
    const user = await seedUser(env);

    const res = await app.request('/v1/checkout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-BugPulse-Key': user.api_key,
      },
      body: JSON.stringify({}),
    }, env);

    expect(res.status).toBe(422);
  });

  it('returns 409 if already on requested plan', async () => {
    const user = await seedUser(env, { plan: 'starter' });

    const res = await app.request('/v1/checkout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-BugPulse-Key': user.api_key,
      },
      body: JSON.stringify({ plan: 'starter' }),
    }, env);

    expect(res.status).toBe(409);
    const data = await res.json() as { error: string };
    expect(data.error).toBe('already_subscribed');
  });
});
