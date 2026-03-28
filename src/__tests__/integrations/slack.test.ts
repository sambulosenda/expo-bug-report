import { SlackIntegration } from '../../integrations/slack';
import type { BugReport } from '../../integrations/types';

const mockReport: BugReport = {
  screenshot: 'file:///tmp/screenshot.png',
  annotatedScreenshot: null,
  description: 'Button does not work',
  device: {
    model: 'iPhone 15 Pro',
    os: 'ios 17.0',
    appVersion: '1.0.0',
    screenSize: '390x844',
    locale: 'en-US',
  },
  screen: 'HomeScreen',
  timestamp: '2026-03-28T12:00:00.000Z',
  metadata: { userId: '123' },
};

describe('SlackIntegration', () => {
  let originalFetch: typeof global.fetch;
  let consoleWarnSpy: jest.SpyInstance;

  beforeEach(() => {
    originalFetch = global.fetch;
    global.fetch = jest.fn();
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    consoleWarnSpy.mockRestore();
  });

  it('sends message to slack webhook', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true });
    const integration = SlackIntegration({ webhookUrl: 'https://hooks.slack.com/test' });
    const result = await integration.send({ ...mockReport, screenshot: null });
    expect(result.success).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://hooks.slack.com/test',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('warns when screenshot exists but no imageUploadKey', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true });
    const integration = SlackIntegration({ webhookUrl: 'https://hooks.slack.com/test' });
    await integration.send(mockReport);
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('no imageUploadKey configured'),
    );
  });

  it('does not warn when no screenshot', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true });
    const integration = SlackIntegration({ webhookUrl: 'https://hooks.slack.com/test' });
    await integration.send({ ...mockReport, screenshot: null });
    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it('uploads image when imageUploadKey provided', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ data: { url: 'https://i.imgbb.com/test.png' } }) })
      .mockResolvedValueOnce({ ok: true });

    const integration = SlackIntegration({
      webhookUrl: 'https://hooks.slack.com/test',
      imageUploadKey: 'test-key',
    });
    const result = await integration.send(mockReport);
    expect(result.success).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('returns error on slack non-200', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 403 });
    const integration = SlackIntegration({ webhookUrl: 'https://hooks.slack.com/test' });
    const result = await integration.send({ ...mockReport, screenshot: null });
    expect(result.success).toBe(false);
    expect(result.error).toContain('403');
  });

  it('returns error on network failure', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));
    const integration = SlackIntegration({ webhookUrl: 'https://hooks.slack.com/test' });
    const result = await integration.send({ ...mockReport, screenshot: null });
    expect(result.success).toBe(false);
    expect(result.error).toBe('Network error');
  });

  it('handles image upload failure gracefully', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: true });

    const integration = SlackIntegration({
      webhookUrl: 'https://hooks.slack.com/test',
      imageUploadKey: 'test-key',
    });
    const result = await integration.send(mockReport);
    expect(result.success).toBe(true);
  });
});
