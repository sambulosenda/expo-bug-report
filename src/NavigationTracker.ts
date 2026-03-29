import { useEffect, useRef } from 'react';
import { RingBuffer } from './RingBuffer';
import type { NavEntry } from './integrations/types';

const MAX_ENTRIES = 10;
const MAX_TOTAL_BYTES = 20 * 1024; // 20KB

const navBuffer = new RingBuffer<NavEntry>(MAX_ENTRIES);
let frozenHistory: NavEntry[] | null = null;

export function useNavigationTracker(): void {
  let usePathname: (() => string) | undefined;
  let useSegments: (() => string[]) | undefined;

  try {
    // Optional import — graceful when expo-router is not installed
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const expoRouter = require('expo-router');
    usePathname = expoRouter.usePathname;
    useSegments = expoRouter.useSegments;
  } catch {
    // expo-router not available — no-op
  }

  const pathname = usePathname?.() ?? null;
  const segments = useSegments?.() ?? null;
  const lastPathname = useRef<string | null>(null);

  useEffect(() => {
    if (pathname === null || pathname === lastPathname.current) return;
    lastPathname.current = pathname;

    navBuffer.push({
      pathname,
      segments: segments ?? [],
      timestamp: new Date().toISOString(),
    });
  }, [pathname, segments]);
}

export function freezeNavHistory(): void {
  let entries = navBuffer.getAll();

  // Enforce 20KB total cap — drop oldest entries until under limit
  let totalBytes = JSON.stringify(entries).length;
  while (totalBytes > MAX_TOTAL_BYTES && entries.length > 1) {
    entries = entries.slice(1);
    totalBytes = JSON.stringify(entries).length;
  }

  frozenHistory = entries;
}

export function getNavHistory(): NavEntry[] {
  return frozenHistory ?? [];
}

export function clearNavHistory(): void {
  frozenHistory = null;
}

export function resetNavTracker(): void {
  navBuffer.clear();
  frozenHistory = null;
}
