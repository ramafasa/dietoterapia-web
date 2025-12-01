import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useIntersectionObserver } from '@/hooks/useIntersectionObserver';

describe('useIntersectionObserver', () => {
  it('returns elementRef and isVisible', () => {
    const { result } = renderHook(() => useIntersectionObserver());

    expect(result.current.elementRef).toBeDefined();
    expect(result.current.elementRef.current).toBeNull(); // Initially null
    expect(result.current.isVisible).toBe(false); // Initially false
  });

  it('accepts custom options', () => {
    const { result } = renderHook(() =>
      useIntersectionObserver({
        threshold: 0.5,
        rootMargin: '100px',
        triggerOnce: false,
      })
    );

    expect(result.current.elementRef).toBeDefined();
    expect(result.current.isVisible).toBe(false);
  });

  it('returns consistent ref across renders', () => {
    const { result, rerender } = renderHook(() => useIntersectionObserver());

    const firstRef = result.current.elementRef;
    rerender();

    // Ref should be stable across renders
    expect(result.current.elementRef).toBe(firstRef);
  });

  it('uses default options when none provided', () => {
    const { result } = renderHook(() => useIntersectionObserver());

    // Should not throw and should return expected structure
    expect(result.current).toEqual({
      elementRef: expect.any(Object),
      isVisible: false,
    });
  });

  it('initializes with isVisible false', () => {
    const { result } = renderHook(() => useIntersectionObserver({ triggerOnce: false }));

    expect(result.current.isVisible).toBe(false);
  });
});
