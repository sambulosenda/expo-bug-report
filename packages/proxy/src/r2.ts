import type { Env } from './types';

export async function uploadScreenshot(
  env: Env,
  base64Data: string,
  userId: string,
  customId?: string,
): Promise<string | null> {
  try {
    const binary = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
    const id = customId ?? crypto.randomUUID();
    const key = `${userId}/${id}.png`;

    await env.SCREENSHOTS.put(key, binary, {
      httpMetadata: { contentType: 'image/png' },
      customMetadata: { userId, id },
    });

    return id;
  } catch (error) {
    console.error('[BugPulse Proxy] R2 upload failed:', error);
    return null;
  }
}

export function getScreenshotUrl(env: Env, screenshotId: string): string | null {
  if (!screenshotId) return null;
  // The proxy redirect endpoint handles serving the image
  // This returns the internal R2 key pattern for lookup
  return screenshotId;
}

export async function getScreenshotObject(
  env: Env,
  userId: string,
  screenshotId: string,
): Promise<R2ObjectBody | null> {
  const key = `${userId}/${screenshotId}.png`;
  return env.SCREENSHOTS.get(key);
}
