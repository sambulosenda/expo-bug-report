import type { Env, User } from './types';

const TIMESTAMP_DRIFT_SECONDS = 300; // ±5 minutes

export async function lookupUser(apiKey: string, env: Env): Promise<User | null> {
  const result = await env.DB.prepare(
    'SELECT * FROM users WHERE api_key = ?',
  ).bind(apiKey).first<User>();
  return result ?? null;
}

export async function verifyHmac(
  payload: string,
  signature: string,
  timestamp: string,
  hmacSecret: string,
): Promise<boolean> {
  // Check timestamp drift
  const now = Math.floor(Date.now() / 1000);
  const requestTime = parseInt(timestamp, 10);
  if (isNaN(requestTime) || Math.abs(now - requestTime) > TIMESTAMP_DRIFT_SECONDS) {
    return false;
  }

  // Compute expected signature
  const encoder = new TextEncoder();
  const payloadHash = await sha256(payload);
  const message = `${timestamp}.${payloadHash}`;

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(hmacSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  const expectedHex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return expectedHex === signature;
}

async function sha256(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const hash = await crypto.subtle.digest('SHA-256', encoder.encode(data));
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

type Plan = User['plan'];

const TIER_FEATURES: Record<string, Plan[]> = {
  proxy: ['starter', 'pro', 'beta'],
  multi_routing: ['starter', 'pro', 'beta'],
  dedup: ['pro', 'beta'],
  auto_labels: ['starter', 'pro', 'beta'],
  enrichment: ['pro', 'beta'],
  acknowledgment: ['starter', 'pro', 'beta'],
  hmac: ['starter', 'pro', 'beta'],
};

const REPORT_LIMITS: Record<Plan, number> = {
  free: 0,     // no proxy access
  starter: 500,
  pro: Infinity,
  beta: Infinity,
};

export function checkTierAccess(plan: Plan, feature: string): boolean {
  const allowed = TIER_FEATURES[feature];
  if (!allowed) return true; // unknown feature = allow
  return allowed.includes(plan);
}

export function getReportLimit(plan: Plan): number {
  return REPORT_LIMITS[plan] ?? 0;
}
