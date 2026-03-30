import { ProxyIntegration } from '../../integrations/proxy';
import type { BugReport } from '../../integrations/types';

// Mock fileToBase64
jest.mock('../../utils/fileToBase64', () => ({
  fileToBase64: jest.fn().mockResolvedValue('base64data'),
}));

// Mock crypto.subtle (fallback path when expo-crypto is not available)
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

// Helper: mock screenshot upload success + report response
function mockScreenshotThenReport(reportResponse: Partial<Response>) {
  return jest.fn()
    // First call: screenshot upload
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ id: 'screenshot-123' }),
    })
    // Second call: report
    .mockResolvedValueOnce(reportResponse);
}

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
    global.fetch = mockScreenshotThenReport({
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

    // First call is screenshot upload
    const uploadCall = (global.fetch as jest.Mock).mock.calls[0];
    expect(uploadCall[0]).toBe('https://proxy.bugpulse.dev/v1/screenshots');

    // Second call is report with HMAC headers
    const reportCall = (global.fetch as jest.Mock).mock.calls[1];
    expect(reportCall[0]).toBe('https://proxy.bugpulse.dev/v1/reports');
    expect(reportCall[1].headers['X-BugPulse-Key']).toBe('bp_test123');
    expect(reportCall[1].headers['X-BugPulse-Signature']).toBeDefined();
    expect(reportCall[1].headers['X-BugPulse-Timestamp']).toBeDefined();

    // Report payload should have screenshotId, not base64
    const payload = JSON.parse(reportCall[1].body);
    expect(payload.screenshotId).toBe('screenshot-123');
    expect(payload.screenshotBase64).toBeNull();
  });

  it('falls back to webhook on 402 and logs warning for developer', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

    global.fetch = jest.fn()
      // Screenshot upload
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: () => Promise.resolve({ id: 'screenshot-123' }),
      })
      // Report returns 402
      .mockResolvedValueOnce({
        ok: false,
        status: 402,
        json: () => Promise.resolve({
          error: 'upgrade_required',
          feature: 'dedup',
          plan_required: 'pro',
        }),
      })
      // Fallback webhook
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
      // Screenshot upload
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: () => Promise.resolve({ id: 'screenshot-123' }),
      })
      // Report returns 500
      .mockResolvedValueOnce({ ok: false, status: 500 })
      // Fallback succeeds
      .mockResolvedValueOnce({ ok: true, status: 200 });

    const integration = ProxyIntegration({
      proxyUrl: 'https://proxy.bugpulse.dev',
      apiKey: 'bp_test123',
      hmacSecret: 'bps_secret',
      fallbackWebhookUrl: 'https://hooks.example.com/bugs',
    });

    const result = await integration.send(mockReport);

    expect(result.success).toBe(true);
    // 3 calls: upload + report + fallback
    expect(global.fetch).toHaveBeenCalledTimes(3);

    const fallbackCall = (global.fetch as jest.Mock).mock.calls[2];
    expect(fallbackCall[0]).toBe('https://hooks.example.com/bugs');
  });

  it('falls back to webhook on network error', async () => {
    global.fetch = jest.fn()
      // Screenshot upload
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: () => Promise.resolve({ id: 'screenshot-123' }),
      })
      // Report fails with network error
      .mockRejectedValueOnce(new Error('Network request failed'))
      // Fallback succeeds
      .mockResolvedValueOnce({ ok: true, status: 200 });

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
    global.fetch = jest.fn()
      // Screenshot upload
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: () => Promise.resolve({ id: 'screenshot-123' }),
      })
      // Report fails
      .mockResolvedValueOnce({ ok: false, status: 500 });

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
    global.fetch = mockScreenshotThenReport({
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
    global.fetch = jest.fn()
      // Screenshot upload
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: () => Promise.resolve({ id: 'screenshot-123' }),
      })
      // Report returns 403
      .mockResolvedValueOnce({ ok: false, status: 403 });

    const integration = ProxyIntegration({
      proxyUrl: 'https://proxy.bugpulse.dev',
      apiKey: 'bp_bad_key',
      hmacSecret: 'bps_secret',
    });

    const result = await integration.send(mockReport);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Failed to send report');
  });

  it('sends report without screenshot when upload fails', async () => {
    global.fetch = jest.fn()
      // Screenshot upload fails
      .mockRejectedValueOnce(new Error('Upload timeout'))
      // Report still succeeds
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true, issues: [] }),
      });

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

    const integration = ProxyIntegration({
      proxyUrl: 'https://proxy.bugpulse.dev',
      apiKey: 'bp_test123',
      hmacSecret: 'bps_secret',
    });

    const result = await integration.send(mockReport);

    expect(result.success).toBe(true);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Screenshot upload failed'),
    );

    // Report payload should have null screenshotId
    const reportCall = (global.fetch as jest.Mock).mock.calls[1];
    const payload = JSON.parse(reportCall[1].body);
    expect(payload.screenshotId).toBeNull();

    warnSpy.mockRestore();
  });

  it('sends report without screenshot when no image URI', async () => {
    const reportNoScreenshot = { ...mockReport, screenshot: null };

    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ success: true, issues: [] }),
    });

    const integration = ProxyIntegration({
      proxyUrl: 'https://proxy.bugpulse.dev',
      apiKey: 'bp_test123',
      hmacSecret: 'bps_secret',
    });

    const result = await integration.send(reportNoScreenshot);

    expect(result.success).toBe(true);
    // Only 1 call (report, no screenshot upload)
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
