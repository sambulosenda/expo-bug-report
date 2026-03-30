import { describe, it, expect, beforeEach } from 'vitest';
import { app } from '../src/index';
import { createMockEnv, seedUser } from './helpers';

describe('Dashboard Auth', () => {
  let env: ReturnType<typeof createMockEnv>;

  beforeEach(() => {
    env = createMockEnv();
  });

  describe('POST /v1/auth/login', () => {
    it('returns 422 without api_key', async () => {
      const res = await app.request('/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }, env);

      expect(res.status).toBe(422);
    });

    it('returns 401 for invalid api_key', async () => {
      const res = await app.request('/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: 'bp_invalid' }),
      }, env);

      expect(res.status).toBe(401);
    });

    it('returns 200 with session token for valid api_key', async () => {
      const user = await seedUser(env);

      const res = await app.request('/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: user.api_key }),
      }, env);

      expect(res.status).toBe(200);
      const data = await res.json() as { ok: boolean; session_token: string };
      expect(data.ok).toBe(true);
      expect(data.session_token).toBeTruthy();
    });
  });

  describe('POST /v1/auth/logout', () => {
    it('deletes session', async () => {
      const user = await seedUser(env);

      // Login first
      const loginRes = await app.request('/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: user.api_key }),
      }, env);

      const loginData = await loginRes.json() as { session_token: string };

      // Logout
      const res = await app.request('/v1/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${loginData.session_token}` },
      }, env);

      expect(res.status).toBe(200);
    });
  });

  describe('POST /v1/auth/magic/:token', () => {
    it('returns 401 for invalid token', async () => {
      const res = await app.request('/v1/auth/magic/invalid-token', {
        method: 'POST',
      }, env);

      expect(res.status).toBe(401);
    });

    it('returns 401 for already-used token', async () => {
      const user = await seedUser(env);

      // Seed a magic token directly
      const db = env.DB as any;
      db.magicTokens.set('test-token', {
        token: 'test-token',
        team_member_id: 'member-1',
        user_id: user.id,
        used: 1,
        expires_at: new Date(Date.now() + 86400000).toISOString(),
      });

      const res = await app.request('/v1/auth/magic/test-token', {
        method: 'POST',
      }, env);

      expect(res.status).toBe(401);
    });

    it('creates session for valid unused token', async () => {
      const user = await seedUser(env);

      const db = env.DB as any;
      db.magicTokens.set('valid-token', {
        token: 'valid-token',
        team_member_id: 'member-1',
        user_id: user.id,
        used: 0,
        expires_at: new Date(Date.now() + 86400000).toISOString(),
      });

      const res = await app.request('/v1/auth/magic/valid-token', {
        method: 'POST',
      }, env);

      expect(res.status).toBe(200);
      const data = await res.json() as { ok: boolean; session_token: string };
      expect(data.ok).toBe(true);
      expect(data.session_token).toBeTruthy();

      // Token should be marked as used
      expect(db.magicTokens.get('valid-token').used).toBe(1);
    });
  });
});
