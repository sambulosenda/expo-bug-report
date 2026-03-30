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

      expect(res.status).toBe(401);
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

    it('re-invites existing member with new magic token (idempotent)', async () => {
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

      const db = env.DB as any;
      const tokensBefore = db.magicTokens.size;

      // Second invite (same email) — should succeed with new token
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
      // Should still have only 1 team member but 2 magic tokens
      expect(db.teamMembers.size).toBe(1);
      expect(db.magicTokens.size).toBe(tokensBefore + 1);
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

  describe('GET /v1/team status field', () => {
    it('returns pending status for members without sessions', async () => {
      const user = await seedUser(env);

      await app.request('/v1/team/invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-BugPulse-Key': user.api_key,
        },
        body: JSON.stringify({ email: 'pending@test.com' }),
      }, env);

      const res = await app.request('/v1/team', {
        headers: { 'X-BugPulse-Key': user.api_key },
      }, env);

      expect(res.status).toBe(200);
      const data = await res.json() as { members: Array<{ email: string; status: string }> };
      expect(data.members[0].status).toBe('pending');
    });

    it('returns active status for members with sessions', async () => {
      const user = await seedUser(env);

      // Invite and create a session for the member
      await app.request('/v1/team/invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-BugPulse-Key': user.api_key,
        },
        body: JSON.stringify({ email: 'active@test.com' }),
      }, env);

      const db = env.DB as any;
      const memberId = [...db.teamMembers.values()][0].id;

      // Simulate magic link redemption by inserting a session
      db.sessions.set('test-session', {
        token: 'test-session',
        user_id: user.id,
        type: 'team_member',
        team_member_id: memberId,
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        created_at: new Date().toISOString(),
      });

      const res = await app.request('/v1/team', {
        headers: { 'X-BugPulse-Key': user.api_key },
      }, env);

      expect(res.status).toBe(200);
      const data = await res.json() as { members: Array<{ email: string; status: string }> };
      expect(data.members[0].status).toBe('active');
    });
  });

  describe('Dashboard auth on team endpoints', () => {
    it('accepts Bearer session token on GET /v1/team', async () => {
      const user = await seedUser(env);

      // Create a developer session
      const db = env.DB as any;
      db.sessions.set('dev-session', {
        token: 'dev-session',
        user_id: user.id,
        type: 'developer',
        team_member_id: null,
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        created_at: new Date().toISOString(),
      });

      const res = await app.request('/v1/team', {
        headers: { 'Authorization': 'Bearer dev-session' },
      }, env);

      expect(res.status).toBe(200);
    });

    it('blocks team_member from inviting', async () => {
      const user = await seedUser(env);

      // Create a team_member session
      const db = env.DB as any;
      db.sessions.set('member-session', {
        token: 'member-session',
        user_id: user.id,
        type: 'team_member',
        team_member_id: 'some-member-id',
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        created_at: new Date().toISOString(),
      });

      const res = await app.request('/v1/team/invite', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer member-session',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: 'new@test.com' }),
      }, env);

      expect(res.status).toBe(403);
      const data = await res.json() as { error: string };
      expect(data.error).toBe('developer_only');
    });

    it('blocks team_member from deleting', async () => {
      const user = await seedUser(env);

      const db = env.DB as any;
      db.sessions.set('member-session', {
        token: 'member-session',
        user_id: user.id,
        type: 'team_member',
        team_member_id: 'some-member-id',
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        created_at: new Date().toISOString(),
      });

      const res = await app.request('/v1/team/some-id', {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer member-session' },
      }, env);

      expect(res.status).toBe(403);
    });
  });
});

