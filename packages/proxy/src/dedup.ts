import type { Env } from './types';

async function computeHash(screen: string, errorMessage: string | null, description?: string): Promise<string> {
  // Include description in hash to avoid colliding all error-free bugs on the same screen
  const input = `${screen}:${errorMessage ?? ''}:${description?.slice(0, 100) ?? ''}`;
  const encoder = new TextEncoder();
  const hash = await crypto.subtle.digest('SHA-256', encoder.encode(input));
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function checkDuplicate(
  env: Env,
  userId: string,
  screen: string,
  errorMessage: string | null,
  description?: string,
): Promise<{ isDuplicate: boolean; existingIssueUrl: string | null }> {
  const hash = await computeHash(screen, errorMessage, description);

  const existing = await env.DB.prepare(
    'SELECT issue_url FROM report_hashes WHERE hash = ? AND user_id = ? AND expires_at > datetime(\'now\')',
  ).bind(hash, userId).first<{ issue_url: string | null }>();

  if (existing) {
    return { isDuplicate: true, existingIssueUrl: existing.issue_url };
  }

  // Insert hash for future dedup (best-effort, may race across PoPs)
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const severity = errorMessage ? 'crash' : 'feedback';
  try {
    await env.DB.prepare(
      'INSERT INTO report_hashes (hash, user_id, expires_at, severity, screen) VALUES (?, ?, ?, ?, ?)',
    ).bind(hash, userId, expiresAt, severity, screen).run();
  } catch {
    // Race condition or D1 error — continue, don't block the report
  }

  return { isDuplicate: false, existingIssueUrl: null };
}

export async function updateHashWithIssueUrl(
  env: Env,
  userId: string,
  screen: string,
  errorMessage: string | null,
  issueUrl: string,
  description?: string,
): Promise<void> {
  const hash = await computeHash(screen, errorMessage, description);
  try {
    await env.DB.prepare(
      'UPDATE report_hashes SET issue_url = ? WHERE hash = ? AND user_id = ?',
    ).bind(issueUrl, hash, userId).run();
  } catch {
    // Non-critical — dedup still works without the URL
  }
}

export async function cleanupExpiredHashes(env: Env): Promise<number> {
  const result = await env.DB.prepare(
    'DELETE FROM report_hashes WHERE expires_at < datetime(\'now\')',
  ).run();
  return result.meta.changes ?? 0;
}
