import { WebhookIntegration } from '../../integrations/webhook';
import type { BugReport } from '../../integrations/types';

const mockReport: BugReport = {
  screenshot: 'file:///tmp/screenshot.png',
  annotatedScreenshot: 'file:///tmp/annotated.png',
  description: 'Something broke',
  device: {
    model: 'iPhone 15 Pro',
    os: 'ios 17.0',
    appVersion: '1.0.0',
    screenSize: '390x844',
    locale: 'en-US',
    installationId: 'test-id',
    expoConfig: { name: 'TestApp', slug: 'test-app' },
  },
  screen: 'Settings',
  timestamp: '2026-03-28T12:00:00.000Z',
  metadata: {},
};

describe('WebhookIntegration', () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    global.fetch = jest.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('posts report with base64 screenshots', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true });
    const integration = WebhookIntegration({ url: 'https://api.example.com/bugs' });
    const result = await integration.send(mockReport);
    expect(result.success).toBe(true);

    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(body.screenshotBase64).toBe('dGVzdGJhc2U2NA==');
    expect(body.annotatedScreenshotBase64).toBe('dGVzdGJhc2U2NA==');
    expect(body.description).toBe('Something broke');
  });

  it('sends null for screenshots when not provided', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true });
    const integration = WebhookIntegration({ url: 'https://api.example.com/bugs' });
    const result = await integration.send({ ...mockReport, screenshot: null, annotatedScreenshot: null });
    expect(result.success).toBe(true);

    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(body.screenshotBase64).toBeNull();
    expect(body.annotatedScreenshotBase64).toBeNull();
  });

  it('includes custom headers', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true });
    const integration = WebhookIntegration({
      url: 'https://api.example.com/bugs',
      headers: { Authorization: 'Bearer token123' },
    });
    await integration.send({ ...mockReport, screenshot: null, annotatedScreenshot: null });

    const headers = (global.fetch as jest.Mock).mock.calls[0][1].headers;
    expect(headers.Authorization).toBe('Bearer token123');
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('returns error on non-200', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 500 });
    const integration = WebhookIntegration({ url: 'https://api.example.com/bugs' });
    const result = await integration.send({ ...mockReport, screenshot: null, annotatedScreenshot: null });
    expect(result.success).toBe(false);
    expect(result.error).toContain('500');
  });

  it('returns error on network failure', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('Connection refused'));
    const integration = WebhookIntegration({ url: 'https://api.example.com/bugs' });
    const result = await integration.send({ ...mockReport, screenshot: null, annotatedScreenshot: null });
    expect(result.success).toBe(false);
    expect(result.error).toBe('Connection refused');
  });

  it('includes full diagnostics in payload', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true });
    const integration = WebhookIntegration({ url: 'https://api.example.com/bugs' });

    const diagnostics = {
      stateSnapshots: [
        { name: 'app', state: '{"count":42}', timestamp: '2026-03-28T12:00:00Z', truncated: false },
      ],
      navHistory: [
        { pathname: '/home', segments: ['home'], timestamp: '2026-03-28T12:00:00Z' },
      ],
      lastError: null,
    };

    await integration.send({
      ...mockReport,
      screenshot: null,
      annotatedScreenshot: null,
      diagnostics,
    });

    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(body.diagnostics).toEqual(diagnostics);
    expect(body.diagnostics.stateSnapshots).toHaveLength(1);
    expect(body.diagnostics.navHistory).toHaveLength(1);
  });
});
