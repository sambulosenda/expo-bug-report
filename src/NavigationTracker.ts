import { useEffect, useRef } from 'react';
import { RingBuffer } from './RingBuffer';
import type { NavEntry } from './integrations/types';

const MAX_ENTRIES = 10;
const MAX_TOTAL_BYTES = 20 * 1024; // 20KB
const MAX_ENTRY_BYTES = 2 * 1024; // 2KB per entry estimate

const navBuffer = new RingBuffer<NavEntry>(MAX_ENTRIES);
let frozenHistory: NavEntry[] | null = null;
let currentPathname: string | null = null;

// Detect expo-router availability once at module load
let expoRouterHooks: {
  usePathname: () => string;
  useSegments: () => string[];
} | null = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const expoRouter = require('expo-router');
  if (expoRouter.usePathname && expoRouter.useSegments) {
    expoRouterHooks = {
      usePathname: expoRouter.usePathname,
      useSegments: expoRouter.useSegments,
    };
  }
} catch {
  // expo-router not available
}

/**
 * Hook for tracking navigation when expo-router IS available.
 * Always calls the same hooks in the same order (React rules of hooks).
 */
function useExpoRouterTracker(): void {
  const pathname = expoRouterHooks!.usePathname();
  const segments = expoRouterHooks!.useSegments();
  const lastPathname = useRef<string | null>(null);

  useEffect(() => {
    if (pathname === lastPathname.current) return;
    lastPathname.current = pathname;
    currentPathname = pathname;

    navBuffer.push({
      pathname,
      segments: segments ?? [],
      timestamp: new Date().toISOString(),
    });
  }, [pathname, segments]);
}

/**
 * No-op hook when expo-router is not installed.
 */
function useNoOpTracker(): void {
  // intentionally empty — no hooks called, consistent every render
}

/**
 * Track navigation changes via Expo Router.
 * Safe to call regardless of whether expo-router is installed.
 */
export const useNavigationTracker: () => void = expoRouterHooks
  ? useExpoRouterTracker
  : useNoOpTracker;

export function getCurrentPathname(): string | null {
  return currentPathname;
}

export function freezeNavHistory(): void {
  const entries = navBuffer.getAll();

  // Single-pass size check: estimate total size and drop oldest if over limit
  let totalBytes = 0;
  let startIndex = 0;
  const entrySizes: number[] = [];

  for (const entry of entries) {
    const size = entry.pathname.length + JSON.stringify(entry.segments).length + 60; // overhead
    entrySizes.push(size);
    totalBytes += size;
  }

  while (totalBytes > MAX_TOTAL_BYTES && startIndex < entries.length - 1) {
    totalBytes -= entrySizes[startIndex]!;
    startIndex++;
  }

  frozenHistory = startIndex > 0 ? entries.slice(startIndex) : entries;
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
  currentPathname = null;
}
