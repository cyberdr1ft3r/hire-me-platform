import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  acceptHistoryTraversal,
  blockNavigation,
  initializeHistoryIndex,
  pushHistoryPath,
  replaceHistoryPath,
  requestNavigation,
  resetNavigationGuardForTests,
} from './navigation-guard.js';

const at = (index: number) => ({ hiremeHistoryIndex: index });

describe('navigation guard', () => {
  let go: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resetNavigationGuardForTests();
    window.history.replaceState(null, '', '/');
    initializeHistoryIndex();
    go = vi.spyOn(window.history, 'go').mockImplementation(() => undefined);
  });

  afterEach(() => {
    go.mockRestore();
  });

  it('indexes the loaded entry and every entry the router writes', () => {
    expect(window.history.state).toEqual(at(0));
    pushHistoryPath('/clients');
    expect(window.history.state).toEqual(at(1));
    replaceHistoryPath('/clients?client=x');
    expect(window.history.state).toEqual(at(1));
    expect(window.location.pathname + window.location.search).toBe('/clients?client=x');
  });

  it('keeps the stored index across a reload', () => {
    window.history.replaceState(at(4), '', '/missions');
    initializeHistoryIndex();
    pushHistoryPath('/clients');
    expect(window.history.state).toEqual(at(5));
  });

  it('applies traversals while nothing blocks them', () => {
    pushHistoryPath('/clients');
    expect(acceptHistoryTraversal(at(0))).toBe(true);
    expect(go).not.toHaveBeenCalled();
  });

  it('holds a blocked Back, returns to the entry and completes it only on confirmation', () => {
    pushHistoryPath('/clients');
    const confirmLeave = vi.fn();
    blockNavigation({ confirmLeave });

    expect(acceptHistoryTraversal(at(0))).toBe(false);
    expect(go).toHaveBeenLastCalledWith(1);
    expect(confirmLeave).toHaveBeenCalledTimes(1);
    // The return trip itself is not applied to the router.
    expect(acceptHistoryTraversal(at(1))).toBe(false);

    const proceed = confirmLeave.mock.calls[0]?.[0] as () => void;
    proceed();
    expect(go).toHaveBeenLastCalledWith(-1);
    // The confirmed traversal now passes: the blocker was released.
    expect(acceptHistoryTraversal(at(0))).toBe(true);
  });

  it('holds a blocked Forward across several entries with the exact opposite step', () => {
    pushHistoryPath('/a');
    pushHistoryPath('/b');
    pushHistoryPath('/c');
    expect(acceptHistoryTraversal(at(1))).toBe(true); // user went back two entries, unblocked
    const confirmLeave = vi.fn();
    blockNavigation({ confirmLeave });

    expect(acceptHistoryTraversal(at(3))).toBe(false);
    expect(go).toHaveBeenLastCalledWith(-2);
    acceptHistoryTraversal(at(1));
    (confirmLeave.mock.calls[0]?.[0] as () => void)();
    expect(go).toHaveBeenLastCalledWith(2);
  });

  it('asks again on a repeated Back instead of losing the newer request', () => {
    pushHistoryPath('/clients');
    const confirmLeave = vi.fn();
    blockNavigation({ confirmLeave });
    acceptHistoryTraversal(at(0));
    acceptHistoryTraversal(at(1));
    acceptHistoryTraversal(at(0));
    expect(confirmLeave).toHaveBeenCalledTimes(2);
  });

  it('never holds an entry it cannot undo exactly', () => {
    pushHistoryPath('/clients');
    blockNavigation({ confirmLeave: vi.fn() });
    expect(acceptHistoryTraversal(null)).toBe(true);
    expect(acceptHistoryTraversal({})).toBe(true);
    expect(go).not.toHaveBeenCalled();
  });

  it('releases only the blocker that registered', () => {
    pushHistoryPath('/clients');
    const releaseFirst = blockNavigation({ confirmLeave: vi.fn() });
    const second = vi.fn();
    blockNavigation({ confirmLeave: second });
    releaseFirst();
    expect(acceptHistoryTraversal(at(0))).toBe(false);
    expect(second).toHaveBeenCalledTimes(1);
  });
  it('replays a synchronously confirmed Back only after the return trip has landed', () => {
    pushHistoryPath('/candidates?candidate=1');
    // A native confirm() answers inside the popstate handler, before the browser returns.
    blockNavigation({ confirmLeave: (proceed) => proceed() });

    expect(acceptHistoryTraversal(at(0))).toBe(false);
    expect(go).toHaveBeenCalledTimes(1);
    expect(go).toHaveBeenLastCalledWith(1);
    // The return trip lands; only now is the confirmed traversal replayed.
    expect(acceptHistoryTraversal(at(1))).toBe(false);
    expect(go).toHaveBeenCalledTimes(2);
    expect(go).toHaveBeenLastCalledWith(-1);
    expect(acceptHistoryTraversal(at(0))).toBe(true);
  });

  it('lets a traversal through while the active blocker has nothing to protect', () => {
    pushHistoryPath('/candidates?candidate=1');
    const confirmLeave = vi.fn();
    blockNavigation({ confirmLeave, shouldBlock: () => false });
    expect(acceptHistoryTraversal(at(0))).toBe(true);
    expect(confirmLeave).not.toHaveBeenCalled();
    expect(go).not.toHaveBeenCalled();
  });

  it('hands the decision back to the earlier blocker when a later one is released', () => {
    pushHistoryPath('/candidates?candidate=1');
    const record = vi.fn();
    blockNavigation({ confirmLeave: record });
    const releaseDrawer = blockNavigation({ confirmLeave: vi.fn() });
    releaseDrawer();
    expect(acceptHistoryTraversal(at(0))).toBe(false);
    expect(record).toHaveBeenCalledTimes(1);
  });

  it('asks before an in-app navigation and releases the blocker once confirmed', () => {
    let confirm: (() => void) | undefined;
    blockNavigation({
      confirmLeave: (proceed) => {
        confirm = proceed;
      },
    });
    const navigate = vi.fn();
    requestNavigation(navigate);
    expect(navigate).not.toHaveBeenCalled();
    confirm?.();
    expect(navigate).toHaveBeenCalledTimes(1);
    // Released: the next navigation does not ask again.
    const next = vi.fn();
    requestNavigation(next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('navigates in-app at once when no blocker wants to ask', () => {
    blockNavigation({ confirmLeave: vi.fn(), shouldBlock: () => false });
    const navigate = vi.fn();
    requestNavigation(navigate);
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it('skips a later blocker with nothing unsaved and asks the earlier one that has input', () => {
    pushHistoryPath('/messages');
    const workspace = vi.fn();
    blockNavigation({ confirmLeave: workspace, shouldBlock: () => true });
    const details = vi.fn();
    blockNavigation({ confirmLeave: details, shouldBlock: () => false });

    expect(acceptHistoryTraversal(at(0))).toBe(false);
    expect(details).not.toHaveBeenCalled();
    expect(workspace).toHaveBeenCalledTimes(1);
  });

  it('asks every surface that holds unsaved input before an in-app navigation proceeds', () => {
    const asked: string[] = [];
    let confirmRecord: (() => void) | undefined;
    let confirmDrawer: (() => void) | undefined;
    blockNavigation({
      confirmLeave: (proceed) => {
        asked.push('record');
        confirmRecord = proceed;
      },
      shouldBlock: () => true,
    });
    blockNavigation({
      confirmLeave: (proceed) => {
        asked.push('drawer');
        confirmDrawer = proceed;
      },
    });
    const navigate = vi.fn();
    requestNavigation(navigate);
    expect(asked).toEqual(['drawer']);

    confirmDrawer?.();
    expect(asked).toEqual(['drawer', 'record']);
    expect(navigate).not.toHaveBeenCalled();

    confirmRecord?.();
    expect(navigate).toHaveBeenCalledTimes(1);
  });
});
