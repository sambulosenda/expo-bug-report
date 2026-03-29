import type { Env } from './types';

export async function uploadScreenshot(
  env: Env,
  base64Data: string,
  userId: string,
): Promise<string | null> {
  try {
    const binary = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
    const key = `${userId}/${Date.now()}-${crypto.randomUUID()}.png`;

    await env.SCREENSHOTS.put(key, binary, {
      httpMetadata: { contentType: 'image/png' },
    });

    // Return a public URL (requires R2 bucket to have public access or custom domain)
    return `https://screenshots.bugpulse.dev/${key}`;
  } catch (error) {
    console.error('[BugPulse Proxy] R2 upload failed:', error);
    return null;
  }
}
