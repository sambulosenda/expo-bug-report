import type { Diagnostics } from './integrations/types';

interface TimelineEvent {
  timestamp: string;
  text: string;
}

function formatTime(isoTimestamp: string): string {
  try {
    const date = new Date(isoTimestamp);
    const h = date.getUTCHours().toString().padStart(2, '0');
    const m = date.getUTCMinutes().toString().padStart(2, '0');
    const s = date.getUTCSeconds().toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
  } catch {
    return '';
  }
}

function summarizeStateDiff(prevJson: string, currJson: string, storeName: string): string | null {
  try {
    const prev = JSON.parse(prevJson) as Record<string, unknown>;
    const curr = JSON.parse(currJson) as Record<string, unknown>;

    const changes: string[] = [];
    const allKeys = new Set([...Object.keys(prev), ...Object.keys(curr)]);

    for (const key of allKeys) {
      const prevVal = prev[key];
      const currVal = curr[key];

      // Use JSON comparison for objects (already parsed from JSON, so this is safe)
      if (typeof prevVal === 'object' && typeof currVal === 'object'
        && prevVal !== null && currVal !== null
        && JSON.stringify(prevVal) === JSON.stringify(currVal)) continue;
      if (prevVal === currVal) continue;

      // For arrays, show length change
      if (Array.isArray(prevVal) && Array.isArray(currVal)) {
        if (prevVal.length !== currVal.length) {
          changes.push(`${key}.length ${prevVal.length}\u2192${currVal.length}`);
        } else {
          changes.push(`${key} changed`);
        }
      } else if (typeof prevVal !== 'object' && typeof currVal !== 'object') {
        // Primitives: show before/after
        const pStr = String(prevVal ?? 'undefined');
        const cStr = String(currVal ?? 'undefined');
        if (pStr.length < 30 && cStr.length < 30) {
          changes.push(`${key} ${pStr}\u2192${cStr}`);
        } else {
          changes.push(`${key} changed`);
        }
      } else if (prevVal === undefined) {
        changes.push(`${key} added`);
      } else if (currVal === undefined) {
        changes.push(`${key} removed`);
      } else {
        changes.push(`${key} changed`);
      }

      // Limit to 3 changes per step for readability
      if (changes.length >= 3) break;
    }

    if (changes.length === 0) return null;
    return `[${storeName}] state changed: ${changes.join(', ')}`;
  } catch {
    // If JSON parsing fails, fall back to generic message
    return `[${storeName}] state changed`;
  }
}

export function generateReproSteps(diagnostics: Diagnostics | undefined): string[] {
  if (!diagnostics) return [];

  const events: TimelineEvent[] = [];

  // Add nav events
  for (const nav of diagnostics.navHistory) {
    events.push({
      timestamp: nav.timestamp,
      text: `Navigated to ${nav.pathname}`,
    });
  }

  // Add state change events with diffs
  const byStore = new Map<string, typeof diagnostics.stateSnapshots>();
  for (const snap of diagnostics.stateSnapshots) {
    const existing = byStore.get(snap.name) ?? [];
    existing.push(snap);
    byStore.set(snap.name, existing);
  }

  for (const [name, snaps] of byStore) {
    for (let i = 0; i < snaps.length; i++) {
      const snap = snaps[i]!;
      if (i === 0) {
        // First snapshot for this store: just note it exists
        events.push({
          timestamp: snap.timestamp,
          text: `[${name}] state captured`,
        });
      } else {
        const prev = snaps[i - 1]!;
        const diffText = summarizeStateDiff(prev.state, snap.state, name);
        if (diffText) {
          events.push({
            timestamp: snap.timestamp,
            text: diffText,
          });
        }
      }
    }
  }

  // Add error event
  if (diagnostics.lastError) {
    const err = diagnostics.lastError;
    const firstStackLine = err.stack?.split('\n')[1]?.trim() ?? '';
    const location = firstStackLine ? ` at ${firstStackLine}` : '';
    events.push({
      timestamp: err.timestamp,
      text: `Error: ${err.message}${location}`,
    });
  }

  if (events.length === 0) return [];

  // Sort by timestamp
  events.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  // Format as numbered steps
  return events.map((event, i) => {
    const time = formatTime(event.timestamp);
    const timeStr = time ? ` (${time})` : '';
    return `${i + 1}. ${event.text}${timeStr}`;
  });
}
