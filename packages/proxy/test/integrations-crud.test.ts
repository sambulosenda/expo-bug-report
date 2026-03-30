import { describe, it, expect, beforeEach } from 'vitest';
import { app } from '../src/index';
import { createMockEnv, seedUser } from './helpers';

let env: ReturnType<typeof createMockEnv>;
const API_KEY = 'bp_testkey123';

describe('Integration CRUD', () => {
  beforeEach(async () => {
    env = createMockEnv();
    await seedUser(env, { plan: 'starter' });
  });

  it('rejects invalid integration type', async () => {
    const res = await app.request('/v1/integrations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-BugPulse-Key': API_KEY,
      },
      body: JSON.stringify({ type: 'invalid', config: { token: 'test' } }),
    }, env);

    expect(res.status).toBe(422);
    const data = await res.json() as any;
    expect(data.error).toBe('validation_error');
  });

  it('rejects missing type and config', async () => {
    const res = await app.request('/v1/integrations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-BugPulse-Key': API_KEY,
      },
      body: JSON.stringify({}),
    }, env);

    expect(res.status).toBe(422);
  });

  it('lists integrations (empty)', async () => {
    const res = await app.request('/v1/integrations', {
      headers: { 'X-BugPulse-Key': API_KEY },
    }, env);

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.integrations).toHaveLength(0);
  });

  it('deletes an integration', async () => {
    const res = await app.request('/v1/integrations/nonexistent', {
      method: 'DELETE',
      headers: { 'X-BugPulse-Key': API_KEY },
    }, env);

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.deleted).toBe(true);
  });
});
