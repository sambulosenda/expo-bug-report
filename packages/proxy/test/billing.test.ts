import { describe, it, expect, beforeEach } from 'vitest';
import { app } from '../src/index';
import { createMockEnv, seedUser } from './helpers';

describe('POST /v1/billing/portal', () => {
  let env: ReturnType<typeof createMockEnv>;

  beforeEach(() => {
    env = createMockEnv();
  });

  it('returns 403 without API key', async () => {
    const res = await app.request('/v1/billing/portal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }, env);

    expect(res.status).toBe(403);
  });

  it('returns 422 if user has no stripe_customer_id', async () => {
    const user = await seedUser(env);

    const res = await app.request('/v1/billing/portal', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-BugPulse-Key': user.api_key,
      },
    }, env);

    expect(res.status).toBe(422);
    const data = await res.json() as { error: string };
    expect(data.error).toBe('no_subscription');
  });
});
