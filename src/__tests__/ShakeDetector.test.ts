import { renderHook, act } from '@testing-library/react-native';
import { useShakeDetector } from '../ShakeDetector';
import { Accelerometer } from 'expo-sensors';

describe('useShakeDetector', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (Accelerometer as any)._reset();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('sets up accelerometer subscription when enabled', () => {
    const onShake = jest.fn();
    renderHook(() => useShakeDetector(onShake, { enabled: true }));
    expect(Accelerometer.setUpdateInterval).toHaveBeenCalledWith(100);
    expect(Accelerometer.addListener).toHaveBeenCalled();
  });

  it('does not subscribe when disabled', () => {
    const onShake = jest.fn();
    renderHook(() => useShakeDetector(onShake, { enabled: false }));
    expect(Accelerometer.addListener).not.toHaveBeenCalled();
  });

  it('ignores acceleration below threshold', () => {
    const onShake = jest.fn();
    renderHook(() => useShakeDetector(onShake, { threshold: 1.8 }));
    (Accelerometer as any)._simulateData({ x: 0.5, y: 0.5, z: 0.5 });
    expect(onShake).not.toHaveBeenCalled();
  });

  it('triggers onShake after 3 shakes within window', () => {
    const onShake = jest.fn();
    renderHook(() => useShakeDetector(onShake, { threshold: 1.8 }));

    const strongShake = { x: 2.0, y: 2.0, z: 2.0 };
    (Accelerometer as any)._simulateData(strongShake);
    (Accelerometer as any)._simulateData(strongShake);
    (Accelerometer as any)._simulateData(strongShake);

    expect(onShake).toHaveBeenCalledTimes(1);
  });

  it('respects cooldown period', () => {
    const onShake = jest.fn();
    renderHook(() => useShakeDetector(onShake, { threshold: 1.8 }));

    const strongShake = { x: 2.0, y: 2.0, z: 2.0 };

    // First shake sequence
    (Accelerometer as any)._simulateData(strongShake);
    (Accelerometer as any)._simulateData(strongShake);
    (Accelerometer as any)._simulateData(strongShake);
    expect(onShake).toHaveBeenCalledTimes(1);

    // Immediately try again (within cooldown)
    (Accelerometer as any)._simulateData(strongShake);
    (Accelerometer as any)._simulateData(strongShake);
    (Accelerometer as any)._simulateData(strongShake);
    expect(onShake).toHaveBeenCalledTimes(1);
  });

  it('cleans up subscription on unmount', () => {
    const onShake = jest.fn();
    const removeMock = jest.fn();
    (Accelerometer.addListener as jest.Mock).mockReturnValue({ remove: removeMock });

    const { unmount } = renderHook(() => useShakeDetector(onShake));
    unmount();
    expect(removeMock).toHaveBeenCalled();
  });
});
