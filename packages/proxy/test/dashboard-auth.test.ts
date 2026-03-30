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

    it('returns 200 and sets session cookie for valid api_key', async () => {
      const user = await seedUser(env);

      const res = await app.request('/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: user.api_key }),
      }, env);

      expect(res.status).toBe(200);
      const setCookie = res.headers.get('Set-Cookie');
      expect(setCookie).toContain('bp_session=');
      expect(setCookie).toContain('HttpOnly');
      expect(setCookie).toContain('Secure');
      expect(setCookie).toContain('SameSite=Strict');
    });
  });

  describe('POST /v1/auth/logout', () => {
    it('clears session cookie', async () => {
      const user = await seedUser(env);

      // Login first
      const loginRes = await app.request('/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: user.api_key }),
      }, env);

      const cookie = loginRes.headers.get('Set-Cookie')!;
      const token = cookie.match(/bp_session=([^;]+)/)![1];

      // Logout
      const res = await app.request('/v1/auth/logout', {
        method: 'POST',
        headers: { Cookie: `bp_session=${token}` },
      }, env);

      expect(res.status).toBe(200);
      const setCookie = res.headers.get('Set-Cookie');
      expect(setCookie).toContain('Max-Age=0');
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
      const setCookie = res.headers.get('Set-Cookie');
      expect(setCookie).toContain('bp_session=');

      // Token should be marked as used
      expect(db.magicTokens.get('valid-token').used).toBe(1);
    });
  });
});
