import { useEffect, useRef } from 'react';
import { Accelerometer } from 'expo-sensors';

const DEFAULT_THRESHOLD = 1.8;
const SHAKE_COUNT_REQUIRED = 3;
const SHAKE_WINDOW_MS = 800;
const COOLDOWN_MS = 3000;
const UPDATE_INTERVAL_MS = 100;

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

    Accelerometer.setUpdateInterval(UPDATE_INTERVAL_MS);

    const subscription = Accelerometer.addListener(({ x, y, z }) => {
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
        onShakeRef.current();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [threshold, enabled]);
}
