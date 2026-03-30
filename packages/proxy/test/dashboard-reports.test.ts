import { describe, it, expect, beforeEach } from 'vitest';
import { app } from '../src/index';
import { createMockEnv, seedUser } from './helpers';

describe('Dashboard Reports', () => {
  let env: ReturnType<typeof createMockEnv>;

  beforeEach(() => {
    env = createMockEnv();
  });

  async function loginAndGetCookie(apiKey: string): Promise<string> {
    const res = await app.request('/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: apiKey }),
    }, env);
    const cookie = res.headers.get('Set-Cookie')!;
    return cookie.match(/bp_session=([^;]+)/)![1];
  }

  function seedReport(userId: string, overrides: Record<string, any> = {}) {
    const id = overrides.id ?? crypto.randomUUID();
    const report = {
      id,
      user_id: userId,
      hash: 'hash-' + id,
      screen: overrides.screen ?? '/home',
      severity: overrides.severity ?? 'feedback',
      description: overrides.description ?? 'Test report',
      diagnostics: overrides.diagnostics ?? null,
      screenshot_id: overrides.screenshot_id ?? null,
      status: overrides.status ?? 'new',
      created_at: overrides.created_at ?? new Date().toISOString(),
    };
    (env.DB as any).reports.set(id, report);
    return report;
  }

  describe('GET /v1/dashboard/reports', () => {
    it('returns 401 without auth', async () => {
      const res = await app.request('/v1/dashboard/reports', {}, env);
      expect(res.status).toBe(401);
    });

    it('returns empty list when no reports', async () => {
      const user = await seedUser(env);
      const token = await loginAndGetCookie(user.api_key);

      const res = await app.request('/v1/dashboard/reports', {
        headers: { Cookie: `bp_session=${token}` },
      }, env);

      expect(res.status).toBe(200);
      const data = await res.json() as { reports: any[] };
      expect(data.reports).toEqual([]);
    });

    it('returns reports for authenticated user', async () => {
      const user = await seedUser(env);
      seedReport(user.id, { description: 'Bug on checkout' });
      seedReport(user.id, { description: 'Crash on profile' });
      const token = await loginAndGetCookie(user.api_key);

      const res = await app.request('/v1/dashboard/reports', {
        headers: { Cookie: `bp_session=${token}` },
      }, env);

      expect(res.status).toBe(200);
      const data = await res.json() as { reports: any[] };
      expect(data.reports.length).toBe(2);
    });

    it('does not return other users reports', async () => {
      const user1 = await seedUser(env, { id: 'u1', email: 'a@test.com', api_key: 'bp_key1' });
      const user2 = await seedUser(env, { id: 'u2', email: 'b@test.com', api_key: 'bp_key2' });
      seedReport(user1.id);
      seedReport(user2.id);
      const token = await loginAndGetCookie(user1.api_key);

      const res = await app.request('/v1/dashboard/reports', {
        headers: { Cookie: `bp_session=${token}` },
      }, env);

      const data = await res.json() as { reports: any[] };
      expect(data.reports.length).toBe(1);
      expect(data.reports[0].user_id).toBe('u1');
    });
  });

  describe('GET /v1/dashboard/reports/:id', () => {
    it('returns 404 for non-existent report', async () => {
      const user = await seedUser(env);
      const token = await loginAndGetCookie(user.api_key);

      const res = await app.request('/v1/dashboard/reports/nonexistent', {
        headers: { Cookie: `bp_session=${token}` },
      }, env);

      expect(res.status).toBe(404);
    });

    it('returns full report with diagnostics', async () => {
      const user = await seedUser(env);
      const report = seedReport(user.id, {
        id: 'rpt-1',
        diagnostics: JSON.stringify({ navHistory: [{ pathname: '/home', timestamp: new Date().toISOString() }] }),
      });
      const token = await loginAndGetCookie(user.api_key);

      const res = await app.request('/v1/dashboard/reports/rpt-1', {
        headers: { Cookie: `bp_session=${token}` },
      }, env);

      expect(res.status).toBe(200);
      const data = await res.json() as { report: any };
      expect(data.report.id).toBe('rpt-1');
      expect(data.report.diagnostics).toBeTruthy();
    });
  });

  describe('PATCH /v1/reports/:id', () => {
    it('returns 422 for invalid status', async () => {
      const user = await seedUser(env);
      seedReport(user.id, { id: 'rpt-1' });
      const token = await loginAndGetCookie(user.api_key);

      const res = await app.request('/v1/reports/rpt-1', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `bp_session=${token}`,
        },
        body: JSON.stringify({ status: 'invalid' }),
      }, env);

      expect(res.status).toBe(422);
    });

    it('returns 404 for non-existent report', async () => {
      const user = await seedUser(env);
      const token = await loginAndGetCookie(user.api_key);

      const res = await app.request('/v1/reports/nonexistent', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `bp_session=${token}`,
        },
        body: JSON.stringify({ status: 'triaged' }),
      }, env);

      expect(res.status).toBe(404);
    });

    it('updates report status', async () => {
      const user = await seedUser(env);
      seedReport(user.id, { id: 'rpt-1', status: 'new' });
      const token = await loginAndGetCookie(user.api_key);

      const res = await app.request('/v1/reports/rpt-1', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `bp_session=${token}`,
        },
        body: JSON.stringify({ status: 'triaged' }),
      }, env);

      expect(res.status).toBe(200);
      const data = await res.json() as { ok: boolean; status: string };
      expect(data.status).toBe('triaged');
    });
  });

  describe('GET /v1/stats/public', () => {
    it('returns total report count (unauthenticated)', async () => {
      const user = await seedUser(env);
      seedReport(user.id);
      seedReport(user.id);

      const res = await app.request('/v1/stats/public', {}, env);

      expect(res.status).toBe(200);
      const data = await res.json() as { totalReports: number };
      expect(data.totalReports).toBe(2);
    });
  });
});
