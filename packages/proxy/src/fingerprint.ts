import type { IncomingReport } from './types';

async function sha256(input: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function computeFingerprint(
  diagnostics: IncomingReport['diagnostics'] | undefined,
  description: string | undefined,
): Promise<string | null> {
  const stack = diagnostics?.lastError?.stack;
  if (stack) {
    const lines = stack.split('\n').slice(0, 5);
    const cleaned = lines
      .map((l) => l.trim())
      .map((l) => l.replace(/0x[0-9a-fA-F]+/g, '<addr>'))
      .map((l) => l.replace(/\/data\/user\/\d+\/[^/]+\//g, '<app>/'))
      .join('\n');
    return sha256(cleaned);
  }

  if (description?.trim()) {
    return sha256(description.trim().toLowerCase());
  }

  return null;
}
