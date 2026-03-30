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

    // UPDATE users SET api_key
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
