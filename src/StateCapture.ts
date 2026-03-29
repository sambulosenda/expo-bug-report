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
let redactedKeys: string[] = [];

function deleteNestedKey(obj: Record<string, unknown>, keyPath: string): void {
  const parts = keyPath.split('.');
  let current: Record<string, unknown> = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]!;
    if (current[part] == null || typeof current[part] !== 'object') return;
    current = current[part] as Record<string, unknown>;
  }

  const lastKey = parts[parts.length - 1]!;
  if (lastKey in current) {
    current[lastKey] = '[REDACTED]';
  }
}

function applyRedaction(state: unknown): unknown {
  if (redactedKeys.length === 0 || state == null || typeof state !== 'object') {
    return state;
  }

  // Deep clone to avoid mutating the original store state
  const cloned = JSON.parse(JSON.stringify(state)) as Record<string, unknown>;
  for (const keyPath of redactedKeys) {
    deleteNestedKey(cloned, keyPath);
  }
  return cloned;
}

export function redactStateKeys(keys: string[]): void {
  redactedKeys = keys;
}

export function clearRedactedKeys(): void {
  redactedKeys = [];
}

function serializeState(state: unknown): { json: string; truncated: boolean } {
  try {
    const json = JSON.stringify(state);

    if (json.length > MAX_SNAPSHOT_BYTES) {
      return { json: JSON.stringify('[STATE TOO LARGE - ' + json.length + ' bytes]'), truncated: true };
    }

    return { json, truncated: false };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown error';
    console.warn(`[BugPulse] Failed to serialize state: ${reason}. Skipping snapshot.`);
    return { json: TRUNCATED_MARKER, truncated: true };
  }
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
    const redacted = applyRedaction(store.getState());
    const { json, truncated } = serializeState(redacted);
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
