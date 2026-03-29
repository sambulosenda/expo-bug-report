import {
  trackStore,
  untrackStore,
  freezeStateSnapshot,
  getStateSnapshot,
  clearStateCapture,
  resetAllStores,
} from '../StateCapture';

function createMockStore(initialState: unknown) {
  let state = initialState;
  const listeners = new Set<() => void>();
  return {
    getState: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setState: (newState: unknown) => {
      state = newState;
      listeners.forEach((l) => l());
    },
  };
}

describe('StateCapture', () => {
  afterEach(() => {
    resetAllStores();
  });

  it('records state changes to ring buffer', () => {
    const store = createMockStore({ count: 0 });
    trackStore(store, { name: 'counter' });

    store.setState({ count: 1 });
    store.setState({ count: 2 });

    freezeStateSnapshot();
    const snapshots = getStateSnapshot();
    expect(snapshots).toHaveLength(2);
    expect(snapshots[0]!.name).toBe('counter');
    expect(JSON.parse(snapshots[0]!.state)).toEqual({ count: 1 });
    expect(JSON.parse(snapshots[1]!.state)).toEqual({ count: 2 });
  });

  it('evicts oldest when buffer is full (N=10)', () => {
    const store = createMockStore({ v: 0 });
    trackStore(store, { name: 'test' });

    for (let i = 1; i <= 11; i++) {
      store.setState({ v: i });
    }

    freezeStateSnapshot();
    const snapshots = getStateSnapshot();
    expect(snapshots).toHaveLength(10);
    expect(JSON.parse(snapshots[0]!.state)).toEqual({ v: 2 });
    expect(JSON.parse(snapshots[9]!.state)).toEqual({ v: 11 });
  });

  it('truncates snapshots exceeding 50KB', () => {
    const store = createMockStore({});
    trackStore(store, { name: 'big' });

    const bigState = { data: 'x'.repeat(60 * 1024) };
    store.setState(bigState);

    freezeStateSnapshot();
    const snapshots = getStateSnapshot();
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]!.truncated).toBe(true);
    expect(snapshots[0]!.state).toContain('STATE TOO LARGE');
    // Truncated state should still be valid JSON
    expect(() => JSON.parse(snapshots[0]!.state)).not.toThrow();
  });

  it('tracks multiple named stores', () => {
    const store1 = createMockStore({ a: 1 });
    const store2 = createMockStore({ b: 2 });
    trackStore(store1, { name: 'store1' });
    trackStore(store2, { name: 'store2' });

    store1.setState({ a: 10 });
    store2.setState({ b: 20 });

    freezeStateSnapshot();
    const snapshots = getStateSnapshot();
    expect(snapshots).toHaveLength(2);
    const names = snapshots.map((s) => s.name);
    expect(names).toContain('store1');
    expect(names).toContain('store2');
  });

  it('untrackStore removes subscription', () => {
    const store = createMockStore({ x: 0 });
    trackStore(store, { name: 'temp' });

    store.setState({ x: 1 });

    // Freeze before untracking to capture the one change
    freezeStateSnapshot();
    const beforeUntrack = getStateSnapshot();
    expect(beforeUntrack).toHaveLength(1);
    expect(JSON.parse(beforeUntrack[0]!.state)).toEqual({ x: 1 });

    // After untracking, new state changes should not be recorded
    clearStateCapture();
    untrackStore('temp');
    store.setState({ x: 2 });

    freezeStateSnapshot();
    const afterUntrack = getStateSnapshot();
    expect(afterUntrack).toHaveLength(0);
  });

  it('freezeStateSnapshot creates independent copy', () => {
    const store = createMockStore({ v: 0 });
    trackStore(store, { name: 'test' });

    store.setState({ v: 1 });
    freezeStateSnapshot();

    store.setState({ v: 2 });
    const frozen = getStateSnapshot();
    expect(frozen).toHaveLength(1);
    expect(JSON.parse(frozen[0]!.state)).toEqual({ v: 1 });
  });

  it('returns empty array when nothing tracked', () => {
    freezeStateSnapshot();
    expect(getStateSnapshot()).toEqual([]);
  });

  it('handles circular references gracefully', () => {
    const store = createMockStore({});
    trackStore(store, { name: 'circular' });

    const circular: Record<string, unknown> = { a: 1 };
    circular.self = circular;

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
    store.setState(circular);
    warnSpy.mockRestore();

    freezeStateSnapshot();
    const snapshots = getStateSnapshot();
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]!.truncated).toBe(true);
  });

  it('clearStateCapture resets frozen snapshot', () => {
    const store = createMockStore({ v: 1 });
    trackStore(store, { name: 'test' });
    store.setState({ v: 2 });

    freezeStateSnapshot();
    expect(getStateSnapshot()).toHaveLength(1);

    clearStateCapture();
    expect(getStateSnapshot()).toEqual([]);
  });
});
