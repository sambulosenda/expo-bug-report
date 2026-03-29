import { renderHook } from '@testing-library/react-native';
import { useThemeColors } from '../useThemeColors';

// Mock useColorScheme
let mockColorScheme: 'light' | 'dark' = 'light';
jest.mock('react-native', () => {
  const actual = jest.requireActual('react-native');
  return {
    ...actual,
    useColorScheme: () => mockColorScheme,
  };
});

describe('useThemeColors', () => {
  it('returns light colors by default', () => {
    mockColorScheme = 'light';
    const { result } = renderHook(() => useThemeColors());
    expect(result.current.background).toBe('#fff');
    expect(result.current.text).toBe('#000');
  });

  it('returns dark colors when device is dark', () => {
    mockColorScheme = 'dark';
    const { result } = renderHook(() => useThemeColors());
    expect(result.current.background).toBe('#1C1C1E');
    expect(result.current.text).toBe('#fff');
  });

  it('respects override parameter', () => {
    mockColorScheme = 'dark';
    const { result } = renderHook(() => useThemeColors('light'));
    expect(result.current.background).toBe('#fff');
  });

  it('override dark on light device', () => {
    mockColorScheme = 'light';
    const { result } = renderHook(() => useThemeColors('dark'));
    expect(result.current.background).toBe('#1C1C1E');
  });
});
