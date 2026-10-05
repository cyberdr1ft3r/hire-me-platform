import { renderHook } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  bumpStackedDetailRevealToken,
  CANDIDATE_CLIENT_SIDE_BY_SIDE_MIN_REM,
  isStackedMasterDetailLayout,
  useStackedMasterDetailReveal,
} from './stacked-master-detail.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('isStackedMasterDetailLayout', () => {
  it('treats a null container as stacked', () => {
    expect(isStackedMasterDetailLayout(null, CANDIDATE_CLIENT_SIDE_BY_SIDE_MIN_REM, 16)).toBe(true);
  });

  it('matches the CSS container breakpoint using rem and client width', () => {
    const container = document.createElement('div');
    Object.defineProperty(container, 'clientWidth', { configurable: true, value: 959 });
    expect(isStackedMasterDetailLayout(container, CANDIDATE_CLIENT_SIDE_BY_SIDE_MIN_REM, 16)).toBe(
      true,
    );
    Object.defineProperty(container, 'clientWidth', { configurable: true, value: 960 });
    expect(isStackedMasterDetailLayout(container, CANDIDATE_CLIENT_SIDE_BY_SIDE_MIN_REM, 16)).toBe(
      false,
    );
  });
});

describe('bumpStackedDetailRevealToken', () => {
  it('increments monotonically', () => {
    expect(bumpStackedDetailRevealToken(0)).toBe(1);
    expect(bumpStackedDetailRevealToken(3)).toBe(4);
  });
});

describe('useStackedMasterDetailReveal', () => {
  it('focuses the detail target on stacked layouts when the reveal token advances', () => {
    const container = document.createElement('div');
    Object.defineProperty(container, 'clientWidth', { configurable: true, value: 400 });
    const target = document.createElement('h2');
    target.tabIndex = -1;
    const focusSpy = vi.spyOn(target, 'focus');
    const containerRef = createRef<HTMLDivElement>();
    const targetRef = createRef<HTMLHeadingElement>();
    containerRef.current = container;
    targetRef.current = target;

    const { rerender } = renderHook(
      (props: { revealToken: number; ready: boolean }) =>
        useStackedMasterDetailReveal({
          containerRef,
          ready: props.ready,
          revealToken: props.revealToken,
          sideBySideMinRem: CANDIDATE_CLIENT_SIDE_BY_SIDE_MIN_REM,
          targetRef,
        }),
      { initialProps: { ready: false, revealToken: 0 } },
    );

    rerender({ ready: true, revealToken: 1 });
    expect(focusSpy).toHaveBeenCalledTimes(1);

    rerender({ ready: true, revealToken: 1 });
    expect(focusSpy).toHaveBeenCalledTimes(1);
  });

  it('does not focus when the layout is side-by-side', () => {
    const container = document.createElement('div');
    Object.defineProperty(container, 'clientWidth', { configurable: true, value: 1200 });
    const target = document.createElement('h2');
    const focusSpy = vi.spyOn(target, 'focus');
    const containerRef = createRef<HTMLDivElement>();
    const targetRef = createRef<HTMLHeadingElement>();
    containerRef.current = container;
    targetRef.current = target;

    renderHook(() =>
      useStackedMasterDetailReveal({
        containerRef,
        ready: true,
        revealToken: 2,
        sideBySideMinRem: CANDIDATE_CLIENT_SIDE_BY_SIDE_MIN_REM,
        targetRef,
      }),
    );

    expect(focusSpy).not.toHaveBeenCalled();
  });
});
