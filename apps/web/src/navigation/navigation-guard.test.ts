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

  it('asks before an in-app navigation and proceeds once confirmed, keeping the blocker registered', () => {
    let confirm: (() => void) | undefined;
    const release = blockNavigation({
      confirmLeave: (proceed) => {
        confirm = proceed;
      },
    });
    const navigate = vi.fn();
    requestNavigation(navigate);
    expect(navigate).not.toHaveBeenCalled();
    confirm?.();
    expect(navigate).toHaveBeenCalledTimes(1);
    // A confirmation answers one attempt; only the screen itself releases its blocker.
    const next = vi.fn();
    requestNavigation(next);
    expect(next).not.toHaveBeenCalled();
    release();
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

  describe('several surfaces with unsaved input', () => {
    /** A dirty surface whose question the test answers later. */
    function surface(name: string, asked: string[]) {
      const answers: Array<() => void> = [];
      const release = blockNavigation({
        confirmLeave: (proceed) => {
          asked.push(name);
          answers.push(proceed);
        },
        shouldBlock: () => true,
      });
      return { confirm: () => answers.at(-1)?.(), release, questions: () => answers.length };
    }

    it('keeps an earlier surface protected when a later question in the same attempt is cancelled', () => {
      const asked: string[] = [];
      const record = surface('record', asked);
      const drawer = surface('drawer', asked);
      const navigate = vi.fn();

      requestNavigation(navigate);
      drawer.confirm(); // first answer: discard the drawer input
      expect(asked).toEqual(['drawer', 'record']);
      // The record's question is cancelled: nothing is answered, nobody leaves.
      expect(navigate).not.toHaveBeenCalled();

      // Both surfaces are still registered and ask again on the next attempt.
      const retry = vi.fn();
      requestNavigation(retry);
      expect(asked).toEqual(['drawer', 'record', 'drawer']);
      expect(retry).not.toHaveBeenCalled();
      expect(record.questions()).toBe(1);
    });

    it('completes a retried navigation only after every surface confirms again', () => {
      const asked: string[] = [];
      const record = surface('record', asked);
      const drawer = surface('drawer', asked);
      const first = vi.fn();
      requestNavigation(first);
      drawer.confirm(); // record question then cancelled

      const retry = vi.fn();
      requestNavigation(retry);
      drawer.confirm();
      expect(retry).not.toHaveBeenCalled();
      record.confirm();
      expect(retry).toHaveBeenCalledTimes(1);
      expect(first).not.toHaveBeenCalled();
      expect(asked).toEqual(['drawer', 'record', 'drawer', 'record']);
    });

    it('ignores a late answer that belongs to an abandoned attempt', () => {
      const asked: string[] = [];
      const record = surface('record', asked);
      const stale = vi.fn();
      requestNavigation(stale);
      const current = vi.fn();
      requestNavigation(current);
      // The surface was asked twice; answering the current question never runs the old one.
      expect(record.questions()).toBe(2);
      expect(stale).not.toHaveBeenCalled();
      record.confirm(); // answers the current question
      expect(current).toHaveBeenCalledTimes(1);
      expect(stale).not.toHaveBeenCalled();
    });

    it('holds Back for each surface in turn and keeps the earlier one when the later one is cancelled', () => {
      pushHistoryPath('/tasks?task=1');
      const asked: string[] = [];
      const record = surface('record', asked);
      const drawer = surface('drawer', asked);

      // Back: the drawer asks, the browser is returned, the answer comes after the return.
      expect(acceptHistoryTraversal(at(0))).toBe(false);
      expect(go).toHaveBeenLastCalledWith(1);
      expect(acceptHistoryTraversal(at(1))).toBe(false); // return trip lands
      drawer.confirm();
      expect(go).toHaveBeenLastCalledWith(-1); // replay of the same attempt
      // The replay arrives: the drawer already agreed, the record asks now.
      expect(acceptHistoryTraversal(at(0))).toBe(false);
      expect(asked).toEqual(['drawer', 'record']);
      expect(acceptHistoryTraversal(at(1))).toBe(false); // return trip lands
      // The record question is cancelled. A new Back asks the drawer again.
      expect(acceptHistoryTraversal(at(0))).toBe(false);
      expect(asked).toEqual(['drawer', 'record', 'drawer']);
      expect(record.questions()).toBe(1);
    });

    it('completes Back after every surface confirms, then applies the traversal once', () => {
      pushHistoryPath('/tasks?task=1');
      const asked: string[] = [];
      const record = surface('record', asked);
      const drawer = surface('drawer', asked);

      expect(acceptHistoryTraversal(at(0))).toBe(false);
      acceptHistoryTraversal(at(1));
      drawer.confirm();
      expect(acceptHistoryTraversal(at(0))).toBe(false);
      acceptHistoryTraversal(at(1));
      record.confirm();
      expect(go).toHaveBeenLastCalledWith(-1);
      // The final replay is applied to the router; both surfaces stay registered until
      // their screens unmount.
      expect(acceptHistoryTraversal(at(0))).toBe(true);
      expect(asked).toEqual(['drawer', 'record']);
      drawer.release();
      record.release();
      pushHistoryPath('/tasks');
      expect(acceptHistoryTraversal(at(0))).toBe(true);
    });
  });
});
