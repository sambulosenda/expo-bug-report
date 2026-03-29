import { useEffect, useRef } from 'react';
import { Accelerometer } from 'expo-sensors';

const DEFAULT_THRESHOLD = 1.8;
const SHAKE_COUNT_REQUIRED = 3;
const SHAKE_WINDOW_MS = 800;
const COOLDOWN_MS = 3000;
const UPDATE_INTERVAL_MS = 100;

// Try to load expo-haptics (optional peer dep)
let Haptics: { impactAsync: (style: string) => Promise<void> } | null = null;
let ImpactFeedbackStyle: { Medium: string } | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const haptics = require('expo-haptics');
  Haptics = haptics;
  ImpactFeedbackStyle = haptics.ImpactFeedbackStyle;
} catch {
  // expo-haptics not installed — haptic feedback disabled
}

function triggerHaptic(): void {
  if (Haptics && ImpactFeedbackStyle) {
    Haptics.impactAsync(ImpactFeedbackStyle.Medium).catch(() => {
      // Haptic failed silently (e.g., unsupported device)
    });
  }
}

export function useShakeDetector(
  onShake: () => void,
  options?: { threshold?: number; enabled?: boolean },
): void {
  const onShakeRef = useRef(onShake);
  const threshold = options?.threshold ?? DEFAULT_THRESHOLD;
  const enabled = options?.enabled ?? true;

  useEffect(() => {
    onShakeRef.current = onShake;
  }, [onShake]);

  useEffect(() => {
    if (!enabled) return;

    let shakeTimestamps: number[] = [];
    let lastShakeTime = 0;

    try {
      Accelerometer.setUpdateInterval(UPDATE_INTERVAL_MS);
    } catch {
      console.warn(
        '[BugPulse] Accelerometer not available on this device. Shake-to-report disabled. Use triggerBugReport() instead.',
      );
      return;
    }

    let subscription: { remove: () => void } | null = null;
    try {
      subscription = Accelerometer.addListener(({ x, y, z }) => {
        const totalForce = Math.sqrt(x * x + y * y + z * z);
        if (totalForce < threshold) return;

        const now = Date.now();
        if (now - lastShakeTime < COOLDOWN_MS) return;

        shakeTimestamps.push(now);
        shakeTimestamps = shakeTimestamps.filter(
          (ts) => now - ts < SHAKE_WINDOW_MS,
        );

        if (shakeTimestamps.length >= SHAKE_COUNT_REQUIRED) {
          lastShakeTime = now;
          shakeTimestamps = [];
          triggerHaptic();
          onShakeRef.current();
        }
      });
    } catch {
      console.warn(
        '[BugPulse] Failed to start accelerometer listener. Shake-to-report disabled.',
      );
      return;
    }

    return () => {
      subscription?.remove();
    };
  }, [threshold, enabled]);
}
