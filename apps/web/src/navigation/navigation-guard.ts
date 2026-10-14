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
 * In-app links (shell navigation, notification items, record actions) ask through
 * `requestNavigation` before they move, so the same question covers them.
 *
 * Blockers stack: the most recently registered one decides. A focused record with an
 * open edit form registers one, and a creation drawer opened on top registers its
 * own; closing the drawer hands the decision back to the record.
 */

const INDEX_KEY = 'hiremeHistoryIndex';

export interface NavigationBlocker {
  /**
   * The user tried to leave. Ask; call `proceed` only if they confirm. Calling it
   * releases this blocker and completes the original navigation.
   */
  confirmLeave: (proceed: () => void) => void;
  /**
   * Whether leaving needs a question right now. Omitted means always: an open
   * modal drawer asks only when dirty, and decides that inside `confirmLeave`.
   */
  shouldBlock?: () => boolean;
}

let blockers: NavigationBlocker[] = [];
let currentIndex = 0;
let restoring = false;
/*
 * A confirmation can arrive before the browser's return trip has landed (a native
 * `confirm()` answers synchronously). Two traversals started in the same task can be
 * merged by the browser, so the confirmed replay waits for the return trip.
 */
let pendingReplay: number | null = null;

function indexOf(state: unknown): number | null {
  if (typeof state !== 'object' || state === null) return null;
  const value = (state as Record<string, unknown>)[INDEX_KEY];
  return typeof value === 'number' && Number.isInteger(value) ? value : null;
}

function withIndex(index: number): Record<string, unknown> {
  return { [INDEX_KEY]: index };
}

function release(blocker: NavigationBlocker): void {
  blockers = blockers.filter((entry) => entry !== blocker);
}

/** The blocker that decides now, if it wants to ask. */
function activeBlocker(): NavigationBlocker | null {
  const top = blockers[blockers.length - 1] ?? null;
  return top && (top.shouldBlock?.() ?? true) ? top : null;
}

/** Registers a blocker; the returned function releases only that blocker. */
export function blockNavigation(next: NavigationBlocker): () => void {
  blockers = [...blockers, next];
  return () => release(next);
}

/**
 * Runs an in-app navigation, asking the active blocker first. `proceed` runs at
 * once when nothing would be lost, and only after confirmation otherwise.
 */
export function requestNavigation(proceed: () => void): void {
  const held = activeBlocker();
  if (!held) {
    proceed();
    return;
  }
  held.confirmLeave(() => {
    release(held);
    proceed();
  });
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
    if (pendingReplay !== null) {
      const replay = pendingReplay;
      pendingReplay = null;
      window.history.go(replay);
    }
    return false;
  }
  const delta = target === null ? 0 : target - currentIndex;
  const held = activeBlocker();
  // Unindexed entries (written outside the router) cannot be undone exactly; let
  // them through rather than guess a direction.
  if (!held || target === null || delta === 0) {
    if (target !== null) currentIndex = target;
    return true;
  }
  restoring = true;
  window.history.go(-delta);
  held.confirmLeave(() => {
    release(held);
    if (restoring) {
      pendingReplay = delta;
    } else {
      window.history.go(delta);
    }
  });
  return false;
}

/** Test seam: restores module state between tests. */
export function resetNavigationGuardForTests(): void {
  blockers = [];
  currentIndex = 0;
  restoring = false;
  pendingReplay = null;
}
