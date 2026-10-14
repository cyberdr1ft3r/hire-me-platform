/**
 * Unsaved-changes guard for the application's own router (`App.tsx`).
 *
 * A `popstate` cannot be cancelled: by the time it fires the browser has already
 * moved to another history entry. Every entry the router writes therefore carries
 * its position (`hiremeHistoryIndex`), so a guarded Back or Forward can be undone
 * with the exact opposite `history.go(-delta)` and, once the user confirms, replayed
 * with `history.go(delta)`. No entries are added or duplicated, so history length and
 * order stay what the user built and nobody is trapped on a page.
 *
 * Only one blocker exists at a time: the open modal drawer owns the whole screen.
 */

const INDEX_KEY = 'hiremeHistoryIndex';

export interface NavigationBlocker {
  /**
   * The user tried to leave. Ask; call `proceed` only if they confirm. Calling it
   * releases this blocker and completes the original navigation.
   */
  confirmLeave: (proceed: () => void) => void;
}

let blocker: NavigationBlocker | null = null;
let currentIndex = 0;
let restoring = false;

function indexOf(state: unknown): number | null {
  if (typeof state !== 'object' || state === null) return null;
  const value = (state as Record<string, unknown>)[INDEX_KEY];
  return typeof value === 'number' && Number.isInteger(value) ? value : null;
}

function withIndex(index: number): Record<string, unknown> {
  return { [INDEX_KEY]: index };
}

/** Registers the active blocker; the returned function releases only that blocker. */
export function blockNavigation(next: NavigationBlocker): () => void {
  blocker = next;
  return () => {
    if (blocker === next) blocker = null;
  };
}

/**
 * Gives the entry the page loaded on a position. A reload keeps the stored one, so
 * entries written before the reload still line up.
 */
export function initializeHistoryIndex(): void {
  const index = indexOf(window.history.state);
  if (index === null) {
    window.history.replaceState(withIndex(0), '', window.location.href);
    currentIndex = 0;
  } else {
    currentIndex = index;
  }
  restoring = false;
}

export function pushHistoryPath(path: string): void {
  currentIndex += 1;
  window.history.pushState(withIndex(currentIndex), '', path);
}

export function replaceHistoryPath(path: string): void {
  window.history.replaceState(withIndex(currentIndex), '', path);
}

/**
 * Decides whether a `popstate` may be applied to the router. Returns false when the
 * traversal was held for confirmation (the browser is being returned to the entry
 * the user was on) or when it is that return trip itself.
 */
export function acceptHistoryTraversal(state: unknown): boolean {
  const target = indexOf(state);
  if (restoring) {
    restoring = false;
    if (target !== null) currentIndex = target;
    return false;
  }
  const delta = target === null ? 0 : target - currentIndex;
  // Unindexed entries (written outside the router) cannot be undone exactly; let
  // them through rather than guess a direction.
  if (!blocker || target === null || delta === 0) {
    if (target !== null) currentIndex = target;
    return true;
  }
  const held = blocker;
  restoring = true;
  window.history.go(-delta);
  held.confirmLeave(() => {
    if (blocker === held) blocker = null;
    window.history.go(delta);
  });
  return false;
}

/** Test seam: restores module state between tests. */
export function resetNavigationGuardForTests(): void {
  blocker = null;
  currentIndex = 0;
  restoring = false;
}
