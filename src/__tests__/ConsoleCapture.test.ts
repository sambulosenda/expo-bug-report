import { startConsoleCapture, stopConsoleCapture, getConsoleLogs, clearConsoleLogs } from '../ConsoleCapture';

describe('ConsoleCapture', () => {
  afterEach(() => {
    stopConsoleCapture();
    clearConsoleLogs();
  });

  it('captures console.warn messages', () => {
    startConsoleCapture();
    console.warn('test warning');
    const logs = getConsoleLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0]!.level).toBe('warn');
    expect(logs[0]!.message).toBe('test warning');
    expect(logs[0]!.timestamp).toBeDefined();
  });

  it('captures console.error messages', () => {
    startConsoleCapture();
    console.error('test error');
    const logs = getConsoleLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0]!.level).toBe('error');
    expect(logs[0]!.message).toBe('test error');
  });

  it('respects ring buffer limit of 20', () => {
    startConsoleCapture();
    for (let i = 0; i < 25; i++) {
      console.warn(`msg ${i}`);
    }
    const logs = getConsoleLogs();
    expect(logs).toHaveLength(20);
    expect(logs[0]!.message).toBe('msg 5'); // first 5 evicted
    expect(logs[19]!.message).toBe('msg 24');
  });

  it('restores original console methods on stop', () => {
    const origWarn = console.warn;
    const origError = console.error;
    startConsoleCapture();
    expect(console.warn).not.toBe(origWarn);
    expect(console.error).not.toBe(origError);
    stopConsoleCapture();
    expect(console.warn).toBe(origWarn);
    expect(console.error).toBe(origError);
  });

  it('calls through to previous console implementation', () => {
    // Simulate Sentry-like patch
    const sentryCaptures: string[] = [];
    const realWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      sentryCaptures.push(args.map(String).join(' '));
      realWarn.apply(console, args);
    };

    startConsoleCapture();
    console.warn('captured by both');

    const logs = getConsoleLogs();
    expect(logs).toHaveLength(1);
    expect(sentryCaptures).toContain('captured by both');

    stopConsoleCapture();
    // Restore Sentry's patch (not the real original)
    console.warn = realWarn;
  });

  it('does not capture after stop', () => {
    startConsoleCapture();
    console.warn('before stop');
    stopConsoleCapture();
    console.warn('after stop');
    const logs = getConsoleLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0]!.message).toBe('before stop');
  });
});
