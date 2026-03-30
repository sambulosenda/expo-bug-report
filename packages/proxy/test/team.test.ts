import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { app } from '../src/index';
import { createMockEnv, seedUser } from './helpers';

// Mock fetch for Resend API calls
const originalFetch = globalThis.fetch;

describe('Team Management', () => {
  let env: ReturnType<typeof createMockEnv>;

  beforeEach(() => {
    env = createMockEnv();
    // Mock Resend API to succeed
    globalThis.fetch = vi.fn(async (url: any, ...args: any[]) => {
      if (typeof url === 'string' && url.includes('api.resend.com')) {
        return new Response(JSON.stringify({ id: 'email-123' }), { status: 200 });
      }
      return originalFetch(url, ...args);
    }) as any;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('POST /v1/team/invite', () => {
    it('returns 403 without API key', async () => {
      const res = await app.request('/v1/team/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'team@test.com' }),
      }, env);

      expect(res.status).toBe(403);
    });

    it('returns 422 for invalid email', async () => {
      const user = await seedUser(env);

      const res = await app.request('/v1/team/invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-BugPulse-Key': user.api_key,
        },
        body: JSON.stringify({ email: 'not-an-email' }),
      }, env);

      expect(res.status).toBe(422);
    });

    it('sends invite for valid email', async () => {
      const user = await seedUser(env);

      const res = await app.request('/v1/team/invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-BugPulse-Key': user.api_key,
        },
        body: JSON.stringify({ email: 'teammate@test.com' }),
      }, env);

      expect(res.status).toBe(200);
      const data = await res.json() as { ok: boolean; email_sent: boolean };
      expect(data.ok).toBe(true);
      expect(data.email_sent).toBe(true);

      // Team member should be created
      const db = env.DB as any;
      expect(db.teamMembers.size).toBe(1);
      expect(db.magicTokens.size).toBe(1);
    });

    it('returns 409 for duplicate invite', async () => {
      const user = await seedUser(env);

      // First invite
      await app.request('/v1/team/invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-BugPulse-Key': user.api_key,
        },
        body: JSON.stringify({ email: 'teammate@test.com' }),
      }, env);

      // Second invite (same email)
      const res = await app.request('/v1/team/invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-BugPulse-Key': user.api_key,
        },
        body: JSON.stringify({ email: 'teammate@test.com' }),
      }, env);

      expect(res.status).toBe(409);
    });

    it('returns manual link when Resend fails', async () => {
      // Override mock to fail
      globalThis.fetch = vi.fn(async (url: any, ...args: any[]) => {
        if (typeof url === 'string' && url.includes('api.resend.com')) {
          return new Response('Server Error', { status: 500 });
        }
        return originalFetch(url, ...args);
      }) as any;

      const user = await seedUser(env);

      const res = await app.request('/v1/team/invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-BugPulse-Key': user.api_key,
        },
        body: JSON.stringify({ email: 'teammate@test.com' }),
      }, env);

      expect(res.status).toBe(502);
      const data = await res.json() as { ok: boolean; email_sent: boolean; invite_url: string };
      expect(data.email_sent).toBe(false);
      expect(data.invite_url).toContain('bugpulse.dev/auth/magic');
    });
  });

  describe('GET /v1/team', () => {
    it('lists team members', async () => {
      const user = await seedUser(env);

      // Invite a member
      await app.request('/v1/team/invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-BugPulse-Key': user.api_key,
        },
        body: JSON.stringify({ email: 'a@test.com' }),
      }, env);

      const res = await app.request('/v1/team', {
        headers: { 'X-BugPulse-Key': user.api_key },
      }, env);

      expect(res.status).toBe(200);
      const data = await res.json() as { members: any[] };
      expect(data.members.length).toBe(1);
      expect(data.members[0].email).toBe('a@test.com');
    });
  });

  describe('DELETE /v1/team/:id', () => {
    it('deletes team member', async () => {
      const user = await seedUser(env);

      // Invite first
      await app.request('/v1/team/invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-BugPulse-Key': user.api_key,
        },
        body: JSON.stringify({ email: 'remove@test.com' }),
      }, env);

      const db = env.DB as any;
      const memberId = [...db.teamMembers.values()][0].id;

      const res = await app.request(`/v1/team/${memberId}`, {
        method: 'DELETE',
        headers: { 'X-BugPulse-Key': user.api_key },
      }, env);

      expect(res.status).toBe(200);
      expect(db.teamMembers.size).toBe(0);
    });
  });
});

