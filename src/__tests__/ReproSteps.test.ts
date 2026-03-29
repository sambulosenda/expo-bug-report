import { generateReproSteps } from '../ReproSteps';
import type { Diagnostics } from '../integrations/types';

describe('generateReproSteps', () => {
  it('returns empty array when diagnostics is undefined', () => {
    expect(generateReproSteps(undefined)).toEqual([]);
  });

  it('returns empty array when all diagnostics are empty', () => {
    const diag: Diagnostics = {
      stateSnapshots: [],
      navHistory: [],
      lastError: null,
    };
    expect(generateReproSteps(diag)).toEqual([]);
  });

  it('generates steps from nav history only', () => {
    const diag: Diagnostics = {
      stateSnapshots: [],
      navHistory: [
        { pathname: '/home', segments: ['home'], timestamp: '2026-01-01T12:00:01.000Z' },
        { pathname: '/cart', segments: ['cart'], timestamp: '2026-01-01T12:00:05.000Z' },
      ],
      lastError: null,
    };
    const steps = generateReproSteps(diag);
    expect(steps).toHaveLength(2);
    expect(steps[0]).toMatch(/^1\. Navigated to \/home/);
    expect(steps[1]).toMatch(/^2\. Navigated to \/cart/);
  });

  it('generates steps from state snapshots with diffs', () => {
    const diag: Diagnostics = {
      stateSnapshots: [
        { name: 'cart', state: '{"items":[],"total":0}', timestamp: '2026-01-01T12:00:01.000Z', truncated: false },
        { name: 'cart', state: '{"items":["a","b"],"total":20}', timestamp: '2026-01-01T12:00:05.000Z', truncated: false },
      ],
      navHistory: [],
      lastError: null,
    };
    const steps = generateReproSteps(diag);
    expect(steps).toHaveLength(2);
    expect(steps[0]).toMatch(/state captured/);
    expect(steps[1]).toMatch(/items\.length 0\u21922/);
  });

  it('generates steps including error', () => {
    const diag: Diagnostics = {
      stateSnapshots: [],
      navHistory: [
        { pathname: '/checkout', segments: ['checkout'], timestamp: '2026-01-01T12:00:01.000Z' },
      ],
      lastError: {
        message: 'PaymentError',
        stack: 'PaymentError\n    at checkout.tsx:47',
        componentStack: null,
        timestamp: '2026-01-01T12:00:05.000Z',
      },
    };
    const steps = generateReproSteps(diag);
    expect(steps).toHaveLength(2);
    expect(steps[0]).toMatch(/Navigated to \/checkout/);
    expect(steps[1]).toMatch(/Error: PaymentError/);
    expect(steps[1]).toMatch(/checkout\.tsx:47/);
  });

  it('sorts events chronologically across nav, state, and error', () => {
    const diag: Diagnostics = {
      stateSnapshots: [
        { name: 'app', state: '{"x":1}', timestamp: '2026-01-01T12:00:03.000Z', truncated: false },
      ],
      navHistory: [
        { pathname: '/home', segments: ['home'], timestamp: '2026-01-01T12:00:01.000Z' },
        { pathname: '/cart', segments: ['cart'], timestamp: '2026-01-01T12:00:05.000Z' },
      ],
      lastError: {
        message: 'Boom',
        stack: null,
        componentStack: null,
        timestamp: '2026-01-01T12:00:07.000Z',
      },
    };
    const steps = generateReproSteps(diag);
    expect(steps).toHaveLength(4);
    expect(steps[0]).toMatch(/\/home/);
    expect(steps[1]).toMatch(/state captured/);
    expect(steps[2]).toMatch(/\/cart/);
    expect(steps[3]).toMatch(/Error: Boom/);
  });

  it('handles malformed state JSON gracefully', () => {
    const diag: Diagnostics = {
      stateSnapshots: [
        { name: 'app', state: 'not json', timestamp: '2026-01-01T12:00:01.000Z', truncated: false },
        { name: 'app', state: 'also not json', timestamp: '2026-01-01T12:00:05.000Z', truncated: false },
      ],
      navHistory: [],
      lastError: null,
    };
    const steps = generateReproSteps(diag);
    expect(steps).toHaveLength(2);
    expect(steps[0]).toMatch(/state captured/);
    expect(steps[1]).toMatch(/\[app\] state changed/);
  });

  it('handles error with no stack trace', () => {
    const diag: Diagnostics = {
      stateSnapshots: [],
      navHistory: [],
      lastError: {
        message: 'Unknown error',
        stack: null,
        componentStack: null,
        timestamp: '2026-01-01T12:00:01.000Z',
      },
    };
    const steps = generateReproSteps(diag);
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatch(/Error: Unknown error/);
    expect(steps[0]).not.toMatch(/at/);
  });

  it('includes time in parentheses', () => {
    const diag: Diagnostics = {
      stateSnapshots: [],
      navHistory: [
        { pathname: '/home', segments: ['home'], timestamp: '2026-01-01T14:30:45.000Z' },
      ],
      lastError: null,
    };
    const steps = generateReproSteps(diag);
    expect(steps[0]).toContain('(14:30:45)');
  });

  it('shows primitive value changes in state diff', () => {
    const diag: Diagnostics = {
      stateSnapshots: [
        { name: 'auth', state: '{"loggedIn":false,"user":null}', timestamp: '2026-01-01T12:00:01.000Z', truncated: false },
        { name: 'auth', state: '{"loggedIn":true,"user":"sam"}', timestamp: '2026-01-01T12:00:05.000Z', truncated: false },
      ],
      navHistory: [],
      lastError: null,
    };
    const steps = generateReproSteps(diag);
    expect(steps[1]).toMatch(/loggedIn false\u2192true/);
  });
});
