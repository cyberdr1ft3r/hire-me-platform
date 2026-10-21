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
 * Blockers stack: the most recently registered one that wants to ask decides. A
 * focused record with an open edit form registers one, and a creation drawer opened on
 * top registers its own; closing the drawer hands the decision back to the record. A
 * blocker with nothing unsaved is skipped, and after one blocker's input is discarded
 * the next one that still holds unsaved input asks too, so no input is lost silently.
 *
 * A confirmation answers only the navigation attempt it was asked for. It never
 * unregisters a blocker: a blocker leaves the stack only when its own screen releases
 * it (unmounts, or has nothing left to protect). So if a later question in the same
 * attempt is cancelled, the user stays and every earlier surface is still protected;
 * a retried navigation asks each of them again.
 */

const INDEX_KEY = 'hiremeHistoryIndex';

export interface NavigationBlocker {
  /**
   * The user tried to leave. Ask; call `proceed` only if they confirm. Calling it
   * answers this navigation attempt only (the blocker stays registered); the
   * navigation completes once every blocker with unsaved input has confirmed.
   */
  confirmLeave: (proceed: () => void) => void;
  /**
   * Whether leaving needs a question right now. Omitted means always: an open
   * modal drawer asks only when dirty, and decides that inside `confirmLeave`.
   */
  shouldBlock?: () => boolean;
}

/** One Back/Forward the user asked for, with the blockers that agreed to it so far. */
interface TraversalAttempt {
  delta: number;
  confirmed: Set<NavigationBlocker>;
}

let blockers: NavigationBlocker[] = [];
let currentIndex = 0;
let restoring = false;
/*
 * A confirmation can arrive before the browser's return trip has landed (a native
 * `confirm()` answers synchronously). Two traversals started in the same task can be
 * merged by the browser, so the confirmed replay waits for the return trip.
 */
let pendingReplay: TraversalAttempt | null = null;
/** Set just before the guard replays a confirmed traversal itself. */
let replaying: TraversalAttempt | null = null;
/** The traversal waiting for an answer; an answer to an older one is ignored. */
let heldTraversal: TraversalAttempt | null = null;
/** Counts in-app navigation attempts; an answer to an older one is ignored. */
let requestAttempt = 0;
const stateListeners = new Set<() => void>();

/** Read-only presentation signal; requestNavigation remains the guard authority. */
export function hasUnsavedNavigationChanges(): boolean {
  return blockers.some((blocker) => blocker.shouldBlock?.() ?? true);
}

export function subscribeNavigationGuardState(listener: () => void): () => void {
  stateListeners.add(listener);
  return () => stateListeners.delete(listener);
}

export function notifyNavigationGuardStateChanged(): void {
  for (const listener of stateListeners) listener();
}

function indexOf(state: unknown): number | null {
  if (typeof state !== 'object' || state === null) return null;
  const value = (state as Record<string, unknown>)[INDEX_KEY];
  return typeof value === 'number' && Number.isInteger(value) ? value : null;
}

function withIndex(index: number, extension?: Record<string, unknown>): Record<string, unknown> {
  const current: unknown = window.history.state;
  const base: Record<string, unknown> =
    current && typeof current === 'object' && !Array.isArray(current)
      ? (current as Record<string, unknown>)
      : {};
  return { ...base, ...extension, [INDEX_KEY]: index };
}

function release(blocker: NavigationBlocker): void {
  blockers = blockers.filter((entry) => entry !== blocker);
  notifyNavigationGuardStateChanged();
}

/**
 * The most recently registered blocker that wants to ask now and has not already
 * agreed to this attempt, if any.
 */
function activeBlocker(confirmed: ReadonlySet<NavigationBlocker>): NavigationBlocker | null {
  for (let index = blockers.length - 1; index >= 0; index -= 1) {
    const blocker = blockers[index];
    if (blocker && !confirmed.has(blocker) && (blocker.shouldBlock?.() ?? true)) return blocker;
  }
  return null;
}

/** Registers a blocker; the returned function releases only that blocker. */
export function blockNavigation(next: NavigationBlocker): () => void {
  blockers = [...blockers, next];
  notifyNavigationGuardStateChanged();
  return () => release(next);
}

/**
 * Runs an in-app navigation, asking the active blocker first. `proceed` runs at
 * once when nothing would be lost, and only after confirmation otherwise.
 */
export function requestNavigation(proceed: () => void): void {
  requestAttempt += 1;
  askInTurn(proceed, new Set(), requestAttempt);
}

function askInTurn(
  proceed: () => void,
  confirmed: ReadonlySet<NavigationBlocker>,
  attempt: number,
): void {
  const held = activeBlocker(confirmed);
  if (!held) {
    proceed();
    return;
  }
  let answered = false;
  held.confirmLeave(() => {
    // One answer per question, and only for the attempt that asked it.
    if (answered || attempt !== requestAttempt) return;
    answered = true;
    // Another surface may still hold unsaved input of its own; it asks next.
    askInTurn(proceed, new Set([...confirmed, held]), attempt);
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
  pendingReplay = null;
  replaying = null;
  heldTraversal = null;
}

export function pushHistoryPath(path: string, extension?: Record<string, unknown>): void {
  currentIndex += 1;
  window.history.pushState({ ...extension, [INDEX_KEY]: currentIndex }, '', path);
}

export function replaceHistoryPath(path: string, extension?: Record<string, unknown>): void {
  window.history.replaceState({ ...extension, [INDEX_KEY]: currentIndex }, '', path);
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
      replaying = replay;
      window.history.go(replay.delta);
    }
    return false;
  }
  // The guard's own replay continues its attempt; any other traversal is a new one.
  const attempt = replaying ?? { delta: 0, confirmed: new Set<NavigationBlocker>() };
  replaying = null;
  const delta = target === null ? 0 : target - currentIndex;
  attempt.delta = delta;
  const held = activeBlocker(attempt.confirmed);
  // Unindexed entries (written outside the router) cannot be undone exactly; let
  // them through rather than guess a direction.
  if (!held || target === null || delta === 0) {
    if (target !== null) currentIndex = target;
    heldTraversal = null;
    return true;
  }
  heldTraversal = attempt;
  restoring = true;
  window.history.go(-delta);
  let answered = false;
  held.confirmLeave(() => {
    if (answered || heldTraversal !== attempt) return;
    answered = true;
    attempt.confirmed.add(held);
    if (restoring) {
      pendingReplay = attempt;
    } else {
      replaying = attempt;
      window.history.go(attempt.delta);
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
  replaying = null;
  heldTraversal = null;
  requestAttempt = 0;
}
