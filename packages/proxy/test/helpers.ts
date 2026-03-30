import type { Env, User } from '../src/types';

// In-memory D1 mock — stores data in Maps, implements the subset of D1 API we use
class MockD1Result {
  constructor(
    public results: any[] = [],
    public meta: { changes: number } = { changes: 0 },
  ) {}
}

class MockD1PreparedStatement {
  private boundValues: any[] = [];

  constructor(private db: MockD1Database, private sql: string) {}

  bind(...values: any[]) {
    this.boundValues = values;
    return this;
  }

  async first<T = any>(column?: string): Promise<T | null> {
    const results = this.db.execute(this.sql, this.boundValues);
    if (results.length === 0) return null;
    if (column) return results[0][column] ?? null;
    return results[0] as T;
  }

  async all<T = any>(): Promise<{ results: T[]; meta: { changes: number } }> {
    const results = this.db.execute(this.sql, this.boundValues);
    return { results: results as T[], meta: { changes: results.length } };
  }

  async run(): Promise<{ meta: { changes: number } }> {
    const changes = this.db.execute(this.sql, this.boundValues);
    return { meta: { changes: typeof changes === 'number' ? changes : changes.length } };
  }
}

class MockD1Database {
  private users = new Map<string, any>();
  private integrations = new Map<string, any>();
  private reportHashes = new Map<string, any>();
  private screenReports = new Map<string, any>();
  public reports = new Map<string, any>();
  public sessions = new Map<string, any>();
  public teamMembers = new Map<string, any>();
  public magicTokens = new Map<string, any>();

  prepare(sql: string) {
    return new MockD1PreparedStatement(this, sql);
  }

  async exec(sql: string) {
    // For schema creation and deletes
    if (sql.includes('DELETE FROM users')) this.users.clear();
    if (sql.includes('DELETE FROM integrations')) this.integrations.clear();
    if (sql.includes('DELETE FROM report_hashes')) this.reportHashes.clear();
    if (sql.includes('DELETE FROM screen_reports')) this.screenReports.clear();
  }

  execute(sql: string, params: any[]): any[] | number {
    const sqlLower = sql.toLowerCase().trim();

    // INSERT INTO users
    if (sqlLower.includes('insert') && sqlLower.includes('users')) {
      const [id, email, apiKey, hmacSecret, plan] = params;
      if (sqlLower.includes('or ignore') || sqlLower.includes('or replace')) {
        const existingByEmail = [...this.users.values()].find((u) => u.email === email);
        if (existingByEmail && !sqlLower.includes('or replace')) return [];
        if (existingByEmail) this.users.delete(existingByEmail.id);
      }
      this.users.set(id, {
        id, email, api_key: apiKey, hmac_secret: hmacSecret,
        plan: plan ?? 'free', stripe_customer_id: null,
        first_report_sent: 0, grace_expires_at: null,
        created_at: new Date().toISOString(),
      });
      return [this.users.get(id)];
    }

    // SELECT * FROM users WHERE api_key = ?
    if (sqlLower.includes('select') && sqlLower.includes('users') && sqlLower.includes('api_key')) {
      const user = [...this.users.values()].find((u) => u.api_key === params[0]);
      return user ? [user] : [];
    }

    // SELECT * FROM users WHERE email = ?
    if (sqlLower.includes('select') && sqlLower.includes('users') && sqlLower.includes('email')) {
      const user = [...this.users.values()].find((u) => u.email === params[0]);
      return user ? [user] : [];
    }

    // SELECT * FROM users WHERE id = ?
    if (sqlLower.includes('select') && sqlLower.includes('users') && sqlLower.includes('id')) {
      const user = this.users.get(params[0]);
      return user ? [user] : [];
    }

    // UPDATE users SET api_key = ?, hmac_secret = ? WHERE id = ? (recover)
    if (sqlLower.includes('update') && sqlLower.includes('users') && sqlLower.includes('api_key') && sqlLower.includes('hmac_secret')) {
      const user = this.users.get(params[2]);
      if (user) {
        user.api_key = params[0];
        user.hmac_secret = params[1];
        return 1 as any;
      }
      return 0 as any;
    }

    // UPDATE users SET api_key (rotate)
    if (sqlLower.includes('update') && sqlLower.includes('users') && sqlLower.includes('api_key')) {
      const user = this.users.get(params[1]);
      if (user) {
        user.api_key = params[0];
        return [user];
      }
      return [];
    }

    // UPDATE users SET plan (Stripe)
    if (sqlLower.includes('update') && sqlLower.includes('users') && sqlLower.includes('plan')) {
      // Generic update — just return success
      return [];
    }

    // UPDATE users SET first_report_sent
    if (sqlLower.includes('update') && sqlLower.includes('first_report_sent')) {
      const user = this.users.get(params[1]);
      if (user) user.first_report_sent = 1;
      return [];
    }

    // SELECT * FROM integrations WHERE user_id = ?
    if (sqlLower.includes('select') && sqlLower.includes('integrations') && sqlLower.includes('user_id')) {
      const results = [...this.integrations.values()].filter((i) => i.user_id === params[0]);
      return results;
    }

    // INSERT INTO integrations
    if (sqlLower.includes('insert') && sqlLower.includes('integrations')) {
      const [id, userId, type, config] = params;
      this.integrations.set(id, {
        id, user_id: userId, type, config, enabled: 1,
        created_at: new Date().toISOString(),
      });
      return [this.integrations.get(id)];
    }

    // DELETE FROM integrations
    if (sqlLower.includes('delete') && sqlLower.includes('integrations')) {
      const id = params[0];
      this.integrations.delete(id);
      return [];
    }

    // SELECT from integrations for health check
    if (sqlLower.includes('select') && sqlLower.includes('integrations') && sqlLower.includes('id')) {
      const integration = this.integrations.get(params[0]);
      return integration ? [integration] : [];
    }

    // INSERT INTO screen_reports (spike)
    if (sqlLower.includes('screen_reports')) {
      // Simplified: just return count 1
      return [{ count: 1 }];
    }

    // INSERT INTO reports
    if (sqlLower.includes('insert') && sqlLower.includes('reports') && !sqlLower.includes('report_hashes') && !sqlLower.includes('report_status') && !sqlLower.includes('failed_reports')) {
      const [id, userId, hash, screen, severity, description, diagnostics, screenshotId, status, createdAt] = params;
      this.reports.set(id, { id, user_id: userId, hash, screen, severity, description, diagnostics, screenshot_id: screenshotId, status: status ?? 'new', created_at: createdAt ?? new Date().toISOString() });
      return [this.reports.get(id)];
    }

    // SELECT from reports (dashboard list — no diagnostics)
    if (sqlLower.includes('select') && sqlLower.includes('from reports') && !sqlLower.includes('select *') && sqlLower.includes('order by')) {
      const userId = params[0];
      let results = [...this.reports.values()].filter(r => r.user_id === userId);
      // Apply screen filter if present
      if (params.length > 1 && sqlLower.includes('screen = ?')) results = results.filter(r => r.screen === params[1]);
      results.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      const limit = params[params.length - 2] ?? 50;
      const offset = params[params.length - 1] ?? 0;
      return results.slice(offset, offset + limit);
    }

    // SELECT * FROM reports WHERE id = ? AND user_id = ?
    if (sqlLower.includes('select *') && sqlLower.includes('from reports') && sqlLower.includes('id = ?')) {
      const report = this.reports.get(params[0]);
      return report && report.user_id === params[1] ? [report] : [];
    }

    // UPDATE reports SET status
    if (sqlLower.includes('update') && sqlLower.includes('reports') && sqlLower.includes('status')) {
      const report = this.reports.get(params[1]);
      if (report && report.user_id === params[2]) {
        report.status = params[0];
        return 1 as any;
      }
      return 0 as any;
    }

    // COUNT(*) FROM reports
    if (sqlLower.includes('count(*)') && sqlLower.includes('from reports')) {
      return [{ count: this.reports.size }];
    }

    // INSERT INTO sessions
    if (sqlLower.includes('insert') && sqlLower.includes('sessions')) {
      const [token, userId, type, ...rest] = params;
      const expiresAt = rest.length === 2 ? rest[1] : rest[0];
      const teamMemberId = rest.length === 2 ? rest[0] : null;
      this.sessions.set(token, { token, user_id: userId, type, team_member_id: teamMemberId, expires_at: expiresAt, created_at: new Date().toISOString() });
      return [this.sessions.get(token)];
    }

    // SELECT from sessions WHERE token = ?
    if (sqlLower.includes('select') && sqlLower.includes('sessions') && sqlLower.includes('token')) {
      const session = this.sessions.get(params[0]);
      if (session && new Date(session.expires_at) > new Date()) return [session];
      return [];
    }

    // DELETE FROM sessions WHERE token = ?
    if (sqlLower.includes('delete') && sqlLower.includes('sessions') && sqlLower.includes('token')) {
      this.sessions.delete(params[0]);
      return [];
    }

    // DELETE FROM sessions WHERE team_member_id = ?
    if (sqlLower.includes('delete') && sqlLower.includes('sessions') && sqlLower.includes('team_member_id')) {
      for (const [k, v] of this.sessions) { if (v.team_member_id === params[0]) this.sessions.delete(k); }
      return [];
    }

    // INSERT INTO team_members
    if (sqlLower.includes('insert') && sqlLower.includes('team_members')) {
      const [id, userId, email, invitedBy] = params;
      const existing = [...this.teamMembers.values()].find(m => m.user_id === userId && m.email === email);
      if (existing) return [];
      this.teamMembers.set(id, { id, user_id: userId, email, invited_by: invitedBy, created_at: new Date().toISOString() });
      return [this.teamMembers.get(id)];
    }

    // SELECT COUNT from team_members
    if (sqlLower.includes('count(*)') && sqlLower.includes('team_members')) {
      const count = [...this.teamMembers.values()].filter(m => m.user_id === params[0]).length;
      return [{ count }];
    }

    // SELECT id FROM team_members WHERE user_id = ? AND email = ?
    if (sqlLower.includes('select') && sqlLower.includes('team_members') && sqlLower.includes('and email')) {
      const member = [...this.teamMembers.values()].find(m => m.user_id === params[0] && m.email === params[1]);
      return member ? [member] : [];
    }

    // SELECT from team_members WHERE user_id = ? (list)
    if (sqlLower.includes('select') && sqlLower.includes('team_members') && sqlLower.includes('user_id')) {
      return [...this.teamMembers.values()].filter(m => m.user_id === params[0]);
    }

    // DELETE FROM team_members
    if (sqlLower.includes('delete') && sqlLower.includes('team_members')) {
      this.teamMembers.delete(params[0]);
      return [];
    }

    // INSERT INTO magic_tokens
    if (sqlLower.includes('insert') && sqlLower.includes('magic_tokens')) {
      const [token, teamMemberId, userId, expiresAt] = params;
      this.magicTokens.set(token, { token, team_member_id: teamMemberId, user_id: userId, used: 0, expires_at: expiresAt, created_at: new Date().toISOString() });
      return [this.magicTokens.get(token)];
    }

    // UPDATE magic_tokens SET used = 1 (atomic claim)
    if (sqlLower.includes('update') && sqlLower.includes('magic_tokens') && sqlLower.includes('used = 1')) {
      const token = this.magicTokens.get(params[0]);
      if (token && token.used === 0 && new Date(token.expires_at) > new Date()) {
        token.used = 1;
        return 1 as any;
      }
      return 0 as any;
    }

    // SELECT from magic_tokens WHERE token = ?
    if (sqlLower.includes('select') && sqlLower.includes('magic_tokens') && sqlLower.includes('token')) {
      const token = this.magicTokens.get(params[0]);
      return token ? [token] : [];
    }

    // Default: return empty
    return [];
  }
}

// Mock R2 bucket
class MockR2Bucket {
  private objects = new Map<string, ArrayBuffer>();

  async put(key: string, data: ArrayBufferLike, _options?: any) {
    this.objects.set(key, data as ArrayBuffer);
  }

  async get(key: string): Promise<{ body: ReadableStream; httpMetadata: any } | null> {
    const data = this.objects.get(key);
    if (!data) return null;
    return {
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(data));
          controller.close();
        },
      }),
      httpMetadata: { contentType: 'image/png' },
    };
  }
}

// Mock Queue
class MockQueue {
  public messages: any[] = [];

  async send(message: any) {
    this.messages.push(message);
  }
}

export function createMockEnv(): Env {
  return {
    DB: new MockD1Database() as unknown as D1Database,
    SCREENSHOTS: new MockR2Bucket() as unknown as R2Bucket,
    FANOUT_QUEUE: new MockQueue() as unknown as Queue,
    ENCRYPTION_KEY: 'test-encryption-key-32-bytes-ok!',
    STRIPE_SECRET_KEY: 'sk_test_fake',
    STRIPE_WEBHOOK_SECRET: 'whsec_test_fake',
    STRIPE_STARTER_PRICE_ID: 'price_starter_test',
    STRIPE_PRO_PRICE_ID: 'price_pro_test',
    RESEND_API_KEY: 'test_resend_key',
    ALLOWED_ORIGINS: '*',
  };
}

export async function seedUser(
  env: Env,
  overrides?: Partial<User>,
) {
  const user = {
    id: overrides?.id ?? 'user-1',
    email: overrides?.email ?? 'test@example.com',
    api_key: overrides?.api_key ?? 'bp_testkey123',
    hmac_secret: overrides?.hmac_secret ?? 'bps_testsecret',
    plan: overrides?.plan ?? 'starter',
  };

  await (env.DB as any).prepare(
    'INSERT OR REPLACE INTO users (id, email, api_key, hmac_secret, plan) VALUES (?, ?, ?, ?, ?)',
  ).bind(user.id, user.email, user.api_key, user.hmac_secret, user.plan).run();

  return user;
}
