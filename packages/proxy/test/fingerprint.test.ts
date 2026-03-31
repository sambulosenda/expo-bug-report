import { describe, it, expect } from 'vitest';
import { computeFingerprint } from '../src/fingerprint';

describe('computeFingerprint', () => {
  it('hashes first 5 lines of stack trace', async () => {
    const stack = [
      'Error: test',
      '    at foo (app.js:10:5)',
      '    at bar (app.js:20:10)',
      '    at baz (app.js:30:15)',
      '    at qux (app.js:40:20)',
      '    at quux (app.js:50:25)',
      '    at extra (app.js:60:30)',
    ].join('\n');

    const fp = await computeFingerprint(
      { lastError: { message: 'test', stack, componentStack: null, timestamp: '' }, stateSnapshots: [], navHistory: [] },
      'some description',
    );

    expect(fp).toBeTruthy();
    expect(fp!.length).toBe(64); // SHA-256 hex
  });

  it('uses available lines when fewer than 5', async () => {
    const stack = 'Error: short\n    at foo (app.js:1:1)';

    const fp = await computeFingerprint(
      { lastError: { message: 'short', stack, componentStack: null, timestamp: '' }, stateSnapshots: [], navHistory: [] },
      'desc',
    );

    expect(fp).toBeTruthy();
    expect(fp!.length).toBe(64);
  });

  it('falls back to description hash when no stack', async () => {
    const fp = await computeFingerprint(undefined, 'App crashes on checkout');
    expect(fp).toBeTruthy();
    expect(fp!.length).toBe(64);
  });

  it('returns null when no stack and no description', async () => {
    const fp = await computeFingerprint(undefined, undefined);
    expect(fp).toBeNull();
  });

  it('returns null for empty description', async () => {
    const fp = await computeFingerprint(undefined, '   ');
    expect(fp).toBeNull();
  });

  it('produces same fingerprint for same stack with different metadata', async () => {
    const stack = 'Error: crash\n    at handler (index.js:42:8)\n    at render (react.js:100:3)';

    const fp1 = await computeFingerprint(
      { lastError: { message: 'crash', stack, componentStack: null, timestamp: '2026-01-01' }, stateSnapshots: [], navHistory: [] },
      'description A',
    );
    const fp2 = await computeFingerprint(
      { lastError: { message: 'crash', stack, componentStack: null, timestamp: '2026-02-02' }, stateSnapshots: [], navHistory: [] },
      'description B',
    );

    expect(fp1).toBe(fp2);
  });

  it('normalizes device-specific paths', async () => {
    const stack1 = 'Error: x\n    at fn (/data/user/0/com.app/index.js:10:5)';
    const stack2 = 'Error: x\n    at fn (/data/user/0/com.other/index.js:10:5)';

    const fp1 = await computeFingerprint(
      { lastError: { message: 'x', stack: stack1, componentStack: null, timestamp: '' }, stateSnapshots: [], navHistory: [] },
      '',
    );
    const fp2 = await computeFingerprint(
      { lastError: { message: 'x', stack: stack2, componentStack: null, timestamp: '' }, stateSnapshots: [], navHistory: [] },
      '',
    );

    expect(fp1).toBe(fp2);
  });

  it('normalizes memory addresses', async () => {
    const stack1 = 'Error: x\n    at 0x1a2b3c (native)';
    const stack2 = 'Error: x\n    at 0xffffff (native)';

    const fp1 = await computeFingerprint(
      { lastError: { message: 'x', stack: stack1, componentStack: null, timestamp: '' }, stateSnapshots: [], navHistory: [] },
      '',
    );
    const fp2 = await computeFingerprint(
      { lastError: { message: 'x', stack: stack2, componentStack: null, timestamp: '' }, stateSnapshots: [], navHistory: [] },
      '',
    );

    expect(fp1).toBe(fp2);
  });

  it('description fingerprint is case-insensitive', async () => {
    const fp1 = await computeFingerprint(undefined, 'App Crashes On Checkout');
    const fp2 = await computeFingerprint(undefined, 'app crashes on checkout');
    expect(fp1).toBe(fp2);
  });
});
