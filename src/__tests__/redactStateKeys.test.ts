import {
  trackStore,
  untrackStore,
  freezeStateSnapshot,
  getStateSnapshot,
  resetAllStores,
  redactStateKeys,
  clearRedactedKeys,
} from '../StateCapture';

describe('redactStateKeys', () => {
  let listeners: Array<() => void>;
  let storeState: Record<string, unknown>;

  function createMockStore(initial: Record<string, unknown>) {
    storeState = { ...initial };
    listeners = [];
    return {
      getState: () => storeState,
      subscribe: (listener: () => void) => {
        listeners.push(listener);
        return () => {
          listeners = listeners.filter((l) => l !== listener);
        };
      },
    };
  }

  function updateStore(newState: Record<string, unknown>) {
    storeState = newState;
    listeners.forEach((l) => l());
  }

  afterEach(() => {
    resetAllStores();
    clearRedactedKeys();
  });

  it('redacts a single top-level key', () => {
    redactStateKeys(['password']);
    const store = createMockStore({ user: 'sam', password: 'secret123' });
    trackStore(store, { name: 'auth' });
    updateStore({ user: 'sam', password: 'newpassword' });

    freezeStateSnapshot();
    const snapshots = getStateSnapshot();

    expect(snapshots.length).toBe(1);
    const state = JSON.parse(snapshots[0]!.state);
    expect(state.user).toBe('sam');
    expect(state.password).toBe('[REDACTED]');
  });

  it('redacts nested key paths', () => {
    redactStateKeys(['auth.token', 'user.email']);
    const store = createMockStore({});
    trackStore(store, { name: 'app' });
    updateStore({
      auth: { token: 'jwt_secret', role: 'admin' },
      user: { email: 'test@test.com', name: 'Sam' },
    });

    freezeStateSnapshot();
    const snapshots = getStateSnapshot();
    const state = JSON.parse(snapshots[0]!.state);

    expect(state.auth.token).toBe('[REDACTED]');
    expect(state.auth.role).toBe('admin');
    expect(state.user.email).toBe('[REDACTED]');
    expect(state.user.name).toBe('Sam');
  });

  it('ignores non-existent key paths without error', () => {
    redactStateKeys(['nonexistent.deep.path']);
    const store = createMockStore({});
    trackStore(store, { name: 'app' });
    updateStore({ name: 'test' });

    freezeStateSnapshot();
    const snapshots = getStateSnapshot();
    const state = JSON.parse(snapshots[0]!.state);

    expect(state.name).toBe('test');
  });

  it('does nothing with empty redaction list', () => {
    redactStateKeys([]);
    const store = createMockStore({});
    trackStore(store, { name: 'app' });
    updateStore({ secret: 'visible' });

    freezeStateSnapshot();
    const snapshots = getStateSnapshot();
    const state = JSON.parse(snapshots[0]!.state);

    expect(state.secret).toBe('visible');
  });

  it('does not mutate the original store state', () => {
    redactStateKeys(['token']);
    const store = createMockStore({});
    trackStore(store, { name: 'app' });
    updateStore({ token: 'secret', name: 'test' });

    freezeStateSnapshot();

    // Original store should still have the token
    expect(storeState.token).toBe('secret');
  });

  it('clearRedactedKeys stops redaction', () => {
    redactStateKeys(['secret']);
    const store = createMockStore({});
    trackStore(store, { name: 'app' });
    updateStore({ secret: 'hidden' });

    freezeStateSnapshot();
    let snapshots = getStateSnapshot();
    let state = JSON.parse(snapshots[0]!.state);
    expect(state.secret).toBe('[REDACTED]');

    // Clear and re-track
    resetAllStores();
    clearRedactedKeys();
    const store2 = createMockStore({});
    trackStore(store2, { name: 'app' });
    updateStore({ secret: 'visible' });

    freezeStateSnapshot();
    snapshots = getStateSnapshot();
    state = JSON.parse(snapshots[snapshots.length - 1]!.state);
    expect(state.secret).toBe('visible');
  });
});
