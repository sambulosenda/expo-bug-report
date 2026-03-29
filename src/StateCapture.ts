import { RingBuffer } from './RingBuffer';
import type { StateSnapshot } from './integrations/types';

const MAX_ENTRIES = 10;
const MAX_SNAPSHOT_BYTES = 50 * 1024; // 50KB
const TRUNCATED_MARKER = '"[TRUNCATED]"';

interface TrackedStore {
  name: string;
  buffer: RingBuffer<StateSnapshot>;
  unsubscribe: () => void;
}

const stores = new Map<string, TrackedStore>();
let frozenSnapshot: StateSnapshot[] | null = null;

function serializeState(state: unknown): { json: string; truncated: boolean } {
  let json: string;
  try {
    json = JSON.stringify(state);
  } catch {
    console.warn('[expo-bug-report] Failed to serialize state (circular reference?). Skipping snapshot.');
    return { json: TRUNCATED_MARKER, truncated: true };
  }

  if (json.length > MAX_SNAPSHOT_BYTES) {
    return { json: json.slice(0, MAX_SNAPSHOT_BYTES) + '...[TRUNCATED]', truncated: true };
  }

  return { json, truncated: false };
}

export function trackStore(
  store: { subscribe: (listener: () => void) => () => void; getState: () => unknown },
  options: { name: string },
): void {
  if (stores.has(options.name)) {
    untrackStore(options.name);
  }

  const buffer = new RingBuffer<StateSnapshot>(MAX_ENTRIES);

  const unsubscribe = store.subscribe(() => {
    const { json, truncated } = serializeState(store.getState());
    buffer.push({
      name: options.name,
      state: json,
      timestamp: new Date().toISOString(),
      truncated,
    });
  });

  stores.set(options.name, { name: options.name, buffer, unsubscribe });
}

export function untrackStore(name: string): void {
  const tracked = stores.get(name);
  if (tracked) {
    tracked.unsubscribe();
    stores.delete(name);
  }
}

export function freezeStateSnapshot(): void {
  const allSnapshots: StateSnapshot[] = [];
  for (const tracked of stores.values()) {
    allSnapshots.push(...tracked.buffer.getAll());
  }
  allSnapshots.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  frozenSnapshot = allSnapshots;
}

export function getStateSnapshot(): StateSnapshot[] {
  return frozenSnapshot ?? [];
}

export function clearStateCapture(): void {
  frozenSnapshot = null;
}

export function resetAllStores(): void {
  for (const tracked of stores.values()) {
    tracked.unsubscribe();
  }
  stores.clear();
  frozenSnapshot = null;
}
