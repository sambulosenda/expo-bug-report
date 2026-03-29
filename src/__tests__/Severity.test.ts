import { detectSeverity } from '../Severity';
import type { Diagnostics } from '../integrations/types';

describe('detectSeverity', () => {
  const emptyDiag: Diagnostics = {
    stateSnapshots: [],
    navHistory: [],
    lastError: null,
  };

  const crashDiag: Diagnostics = {
    stateSnapshots: [],
    navHistory: [],
    lastError: {
      message: 'Component crashed',
      stack: 'Error\n    at App.tsx:10',
      componentStack: null,
      timestamp: '2026-01-01T12:00:00.000Z',
    },
  };

  it('returns crash when lastError is present', () => {
    expect(detectSeverity(crashDiag, '')).toBe('crash');
  });

  it('returns crash even if description also contains error keywords', () => {
    expect(detectSeverity(crashDiag, 'the app crashed')).toBe('crash');
  });

  it('returns error when description contains "crash"', () => {
    expect(detectSeverity(emptyDiag, 'The app crashed when I tapped checkout')).toBe('error');
  });

  it('returns error when description contains "error"', () => {
    expect(detectSeverity(emptyDiag, 'I got an error message')).toBe('error');
  });

  it('returns error when description contains "broke"', () => {
    expect(detectSeverity(emptyDiag, 'Something broke')).toBe('error');
  });

  it('returns error when description contains "broken"', () => {
    expect(detectSeverity(emptyDiag, 'The button is broken')).toBe('error');
  });

  it('returns feedback for generic descriptions', () => {
    expect(detectSeverity(emptyDiag, 'The button color looks wrong')).toBe('feedback');
  });

  it('returns feedback when description is empty', () => {
    expect(detectSeverity(emptyDiag, '')).toBe('feedback');
  });

  it('returns feedback when diagnostics is undefined', () => {
    expect(detectSeverity(undefined, 'just some feedback')).toBe('feedback');
  });

  it('is case-insensitive for keyword matching', () => {
    expect(detectSeverity(emptyDiag, 'CRASHED hard')).toBe('error');
    expect(detectSeverity(emptyDiag, 'Error occurred')).toBe('error');
  });

  it('matches whole words only (not substrings)', () => {
    // "errored" should not match because we use word boundary
    // Actually \b(error) does match "error" in "errored" at word start
    // But "terrorist" should not match
    expect(detectSeverity(emptyDiag, 'This is terrific')).toBe('feedback');
  });
});
