import type { Env } from './types';

async function computeHash(screen: string, errorMessage: string | null): Promise<string> {
  const input = `${screen}:${errorMessage ?? ''}`;
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
): Promise<{ isDuplicate: boolean; existingIssueUrl: string | null }> {
  const hash = await computeHash(screen, errorMessage);

  const existing = await env.DB.prepare(
    'SELECT issue_url FROM report_hashes WHERE hash = ? AND user_id = ? AND expires_at > datetime(\'now\')',
  ).bind(hash, userId).first<{ issue_url: string | null }>();

  if (existing) {
    return { isDuplicate: true, existingIssueUrl: existing.issue_url };
  }

  // Insert hash for future dedup (best-effort, may race across PoPs)
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  try {
    await env.DB.prepare(
      'INSERT INTO report_hashes (hash, user_id, expires_at) VALUES (?, ?, ?)',
    ).bind(hash, userId, expiresAt).run();
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
): Promise<void> {
  const hash = await computeHash(screen, errorMessage);
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
