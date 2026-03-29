import { ProxyIntegration } from '../../integrations/proxy';
import type { BugReport } from '../../integrations/types';

// Mock fileToBase64
jest.mock('../../utils/fileToBase64', () => ({
  fileToBase64: jest.fn().mockResolvedValue('base64data'),
}));

// Mock crypto.subtle
const mockSign = jest.fn().mockResolvedValue(new ArrayBuffer(32));
const mockDigest = jest.fn().mockResolvedValue(new ArrayBuffer(32));
const mockImportKey = jest.fn().mockResolvedValue({});

Object.defineProperty(global, 'crypto', {
  value: {
    subtle: {
      importKey: mockImportKey,
      sign: mockSign,
      digest: mockDigest,
    },
  },
});

const mockReport: BugReport = {
  screenshot: 'file:///screenshot.png',
  annotatedScreenshot: null,
  description: 'Button broken',
  device: {
    model: 'iPhone 15',
    os: 'iOS 17',
    appVersion: '1.0.0',
    screenSize: '393x852',
    locale: 'en-US',
    installationId: 'test-id',
    expoConfig: null,
  },
  screen: '/settings',
  timestamp: '2026-03-29T12:00:00Z',
  metadata: {},
  diagnostics: {
    stateSnapshots: [],
    navHistory: [],
    lastError: null,
  },
};

describe('ProxyIntegration', () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    jest.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('sends report to proxy with HMAC headers', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        success: true,
        issues: [{ destination: 'linear', url: 'https://linear.app/issue/BUG-1', key: 'BUG-1' }],
      }),
    });

    const integration = ProxyIntegration({
      proxyUrl: 'https://proxy.bugpulse.dev',
      apiKey: 'bp_test123',
      hmacSecret: 'bps_secret',
    });

    const result = await integration.send(mockReport);

    expect(result.success).toBe(true);
    expect(result.issues).toHaveLength(1);
    expect(result.issues![0]!.key).toBe('BUG-1');

    const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
    expect(fetchCall[0]).toBe('https://proxy.bugpulse.dev/v1/reports');
    expect(fetchCall[1].headers['X-BugPulse-Key']).toBe('bp_test123');
    expect(fetchCall[1].headers['X-BugPulse-Signature']).toBeDefined();
    expect(fetchCall[1].headers['X-BugPulse-Timestamp']).toBeDefined();
  });

  it('falls back to webhook on 402 and logs warning for developer', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

    global.fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 402,
        json: () => Promise.resolve({
          error: 'upgrade_required',
          feature: 'dedup',
          plan_required: 'pro',
        }),
      })
      .mockResolvedValueOnce({ ok: true, status: 200 });

    const integration = ProxyIntegration({
      proxyUrl: 'https://proxy.bugpulse.dev',
      apiKey: 'bp_test123',
      hmacSecret: 'bps_secret',
      fallbackWebhookUrl: 'https://hooks.example.com/bugs',
    });

    const result = await integration.send(mockReport);

    expect(result.success).toBe(true);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('does not include "dedup"'),
    );

    warnSpy.mockRestore();
  });

  it('falls back to webhook on proxy 5xx', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: false, status: 500 })  // proxy fails
      .mockResolvedValueOnce({ ok: true, status: 200 });   // fallback succeeds

    const integration = ProxyIntegration({
      proxyUrl: 'https://proxy.bugpulse.dev',
      apiKey: 'bp_test123',
      hmacSecret: 'bps_secret',
      fallbackWebhookUrl: 'https://hooks.example.com/bugs',
    });

    const result = await integration.send(mockReport);

    expect(result.success).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(2);

    const fallbackCall = (global.fetch as jest.Mock).mock.calls[1];
    expect(fallbackCall[0]).toBe('https://hooks.example.com/bugs');
  });

  it('falls back to webhook on network error', async () => {
    global.fetch = jest.fn()
      .mockRejectedValueOnce(new Error('Network request failed'))  // proxy fails
      .mockResolvedValueOnce({ ok: true, status: 200 });           // fallback succeeds

    const integration = ProxyIntegration({
      proxyUrl: 'https://proxy.bugpulse.dev',
      apiKey: 'bp_test123',
      hmacSecret: 'bps_secret',
      fallbackWebhookUrl: 'https://hooks.example.com/bugs',
    });

    const result = await integration.send(mockReport);

    expect(result.success).toBe(true);
  });

  it('returns error when proxy fails and no fallback configured', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 });

    const integration = ProxyIntegration({
      proxyUrl: 'https://proxy.bugpulse.dev',
      apiKey: 'bp_test123',
      hmacSecret: 'bps_secret',
    });

    const result = await integration.send(mockReport);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Failed to send report');
  });

  it('handles proxy returning no issues array', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ success: true }),
    });

    const integration = ProxyIntegration({
      proxyUrl: 'https://proxy.bugpulse.dev',
      apiKey: 'bp_test123',
      hmacSecret: 'bps_secret',
    });

    const result = await integration.send(mockReport);

    expect(result.success).toBe(true);
    expect(result.issues).toBeUndefined();
  });

  it('returns error on 403 without fallback', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 403,
    });

    const integration = ProxyIntegration({
      proxyUrl: 'https://proxy.bugpulse.dev',
      apiKey: 'bp_bad_key',
      hmacSecret: 'bps_secret',
    });

    const result = await integration.send(mockReport);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Failed to send report');
  });
});
