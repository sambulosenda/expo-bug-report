import { RingBuffer } from './RingBuffer';

export interface ConsoleEntry {
  level: 'warn' | 'error';
  message: string;
  timestamp: string;
}

const buffer = new RingBuffer<ConsoleEntry>(20);

let origWarn: typeof console.warn | null = null;
let origError: typeof console.error | null = null;
let active = false;

export function startConsoleCapture(): void {
  if (active) return;
  active = true;

  // Wrap whatever is currently assigned (may be Sentry/LogBox patched)
  origWarn = console.warn;
  origError = console.error;

  console.warn = (...args: unknown[]) => {
    buffer.push({
      level: 'warn',
      message: args.map(String).join(' '),
      timestamp: new Date().toISOString(),
    });
    origWarn!.apply(console, args);
  };

  console.error = (...args: unknown[]) => {
    buffer.push({
      level: 'error',
      message: args.map(String).join(' '),
      timestamp: new Date().toISOString(),
    });
    origError!.apply(console, args);
  };
}

export function stopConsoleCapture(): void {
  if (!active) return;
  active = false;

  if (origWarn) console.warn = origWarn;
  if (origError) console.error = origError;
  origWarn = null;
  origError = null;
}

export function getConsoleLogs(): ConsoleEntry[] {
  return buffer.getAll();
}

export function clearConsoleLogs(): void {
  buffer.clear();
}
