import { useLayoutEffect, useRef, type RefObject } from 'react';

/** Matches `@container candidates` / `@container clients` side-by-side breakpoint. */
export const CANDIDATE_CLIENT_SIDE_BY_SIDE_MIN_REM = 60;

/** Matches `@container missions` side-by-side breakpoint. */
export const MISSION_SIDE_BY_SIDE_MIN_REM = 64;

export function readRootFontSizePx(): number {
  const parsed = parseFloat(getComputedStyle(document.documentElement).fontSize);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 16;
}

/**
 * True when the workspace container is narrower than the CSS container query
 * that switches list + detail from stacked to side-by-side.
 */
export function isStackedMasterDetailLayout(
  container: HTMLElement | null,
  sideBySideMinRem: number,
  rootFontSizePx = readRootFontSizePx(),
): boolean {
  if (!container) {
    return true;
  }
  return container.clientWidth < sideBySideMinRem * rootFontSizePx;
}

export function bumpStackedDetailRevealToken(token: number): number {
  return token + 1;
}

/**
 * After an explicit list selection on a stacked layout, move focus to a
 * meaningful detail heading once that detail is ready. Side-by-side layouts
 * keep focus on the source control. The token advances only on user navigation,
 * so background refresh, stale responses, pagination reconciliation, and
 * locale-only rerenders do not repeat the reveal.
 */
export function useStackedMasterDetailReveal({
  containerRef,
  targetRef,
  revealToken,
  ready,
  sideBySideMinRem,
}: {
  containerRef: RefObject<HTMLElement | null>;
  targetRef: RefObject<HTMLElement | null>;
  revealToken: number;
  ready: boolean;
  sideBySideMinRem: number;
}): void {
  const appliedToken = useRef(0);

  useLayoutEffect(() => {
    if (!ready || revealToken <= 0) {
      return;
    }
    if (revealToken === appliedToken.current) {
      return;
    }
    const stacked = isStackedMasterDetailLayout(containerRef.current, sideBySideMinRem);
    appliedToken.current = revealToken;
    if (!stacked) {
      return;
    }
    targetRef.current?.focus();
  }, [containerRef, targetRef, revealToken, ready, sideBySideMinRem]);
}
