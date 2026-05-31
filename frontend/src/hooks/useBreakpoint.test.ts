import { renderHook, act } from '@testing-library/react';
import { useBreakpoint } from './useBreakpoint';

function setWidth(px: number) {
  Object.defineProperty(window, 'innerWidth', { writable: true, value: px });
  window.dispatchEvent(new Event('resize'));
}

describe('useBreakpoint', () => {
  test('returns "mobile" for widths < 768', () => {
    setWidth(400);
    const { result } = renderHook(() => useBreakpoint());
    expect(result.current).toBe('mobile');
  });

  test('returns "tablet" for widths between 768 and 1023', () => {
    setWidth(800);
    const { result } = renderHook(() => useBreakpoint());
    expect(result.current).toBe('tablet');
  });

  test('returns "desktop" for widths >= 1024', () => {
    setWidth(1280);
    const { result } = renderHook(() => useBreakpoint());
    expect(result.current).toBe('desktop');
  });

  test('updates when window is resized', () => {
    setWidth(400);
    const { result } = renderHook(() => useBreakpoint());
    expect(result.current).toBe('mobile');
    act(() => setWidth(1200));
    expect(result.current).toBe('desktop');
  });
});
