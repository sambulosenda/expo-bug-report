import { describe, it, expect } from 'vitest';
import { app } from '../src/index';
import { createMockEnv } from './helpers';

const env = createMockEnv();

describe('GET /v1/health', () => {
  it('returns ok', async () => {
    const res = await app.request('/v1/health', {}, env);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.status).toBe('ok');
  });
});

describe('404 fallback', () => {
  it('returns 404 for unknown routes', async () => {
    const res = await app.request('/v1/nonexistent', {}, env);
    expect(res.status).toBe(404);
  });
});
