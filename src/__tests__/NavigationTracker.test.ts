import { renderHook } from '@testing-library/react-native';
import {
  useNavigationTracker,
  freezeNavHistory,
  getNavHistory,
  clearNavHistory,
  resetNavTracker,
} from '../NavigationTracker';

// expo-router is already mocked via jest.config.js moduleNameMapper
import { __setPathname, __setSegments } from '../__tests__/__mocks__/expo-router';

describe('NavigationTracker', () => {
  afterEach(() => {
    resetNavTracker();
    __setPathname('/');
    __setSegments([]);
  });

  it('records pathname changes', () => {
    __setPathname('/home');
    __setSegments(['home']);

    renderHook(() => useNavigationTracker());

    freezeNavHistory();
    const history = getNavHistory();
    expect(history).toHaveLength(1);
    expect(history[0]!.pathname).toBe('/home');
    expect(history[0]!.segments).toEqual(['home']);
  });

  it('does not record duplicate pathnames', () => {
    __setPathname('/home');

    const { rerender } = renderHook(() => useNavigationTracker());
    rerender({});

    freezeNavHistory();
    expect(getNavHistory()).toHaveLength(1);
  });

  it('returns empty after reset', () => {
    __setPathname('/page');
    renderHook(() => useNavigationTracker());

    resetNavTracker();
    freezeNavHistory();
    expect(getNavHistory()).toEqual([]);
  });

  it('clearNavHistory resets frozen snapshot', () => {
    __setPathname('/test');
    renderHook(() => useNavigationTracker());

    freezeNavHistory();
    expect(getNavHistory()).toHaveLength(1);

    clearNavHistory();
    expect(getNavHistory()).toEqual([]);
  });

  it('freezeNavHistory creates independent copy', () => {
    __setPathname('/first');
    renderHook(() => useNavigationTracker());

    freezeNavHistory();
    const frozen = getNavHistory();
    expect(frozen).toHaveLength(1);
    expect(frozen[0]!.pathname).toBe('/first');
  });
});
