import { useEffect, useRef, type RefObject } from 'react';

import { blockNavigation } from './navigation-guard.js';

export interface RecordLeaveGuardOptions {
  /**
   * For records whose forms stay on screen after a save (Missions): submitting a
   * form hands its input to the write, so the form counts as saved. If that write
   * fails (`failureSignal` changes), the form that was submitted last counts as
   * unsaved again. Records whose forms close or reset on success (Candidates) leave
   * this off.
   */
  clearOnSubmit?: boolean;
  /** Changes whenever a write in this record fails; see `clearOnSubmit`. */
  failureSignal?: unknown;
}

/**
 * Protects unsaved input in a focused record (Candidates, Missions).
 *
 * A form is unsaved when it received input and is still on screen. A successful
 * save resets it (`form.reset()`) or closes it, which clears that state; with
 * `clearOnSubmit`, submitting does. Search and filter forms (`role="search"`) never
 * hold edits. Nothing about the forms themselves changes.
 *
 * While such a form exists, leaving the record asks first: the in-app navigation
 * guard covers Back/Forward, shell links and the record's own Back action, and
 * `beforeunload` covers reload and closing the tab, unless a save is in flight.
 * `confirmLeave` uses the same native confirmation the workspaces already use for
 * lifecycle changes.
 */
export function useRecordLeaveGuard(
  containerRef: RefObject<HTMLElement | null>,
  confirmMessage: string,
  writePending: boolean,
  options: RecordLeaveGuardOptions = {},
): { hasUnsavedInput: () => boolean } {
  const touched = useRef(new Set<HTMLFormElement>());
  const lastSubmitted = useRef<HTMLFormElement | null>(null);
  const message = useRef(confirmMessage);
  message.current = confirmMessage;
  const clearOnSubmit = useRef(options.clearOnSubmit ?? false);
  clearOnSubmit.current = options.clearOnSubmit ?? false;
  /*
   * While a save is in flight its input is not at risk: the write completes on the
   * server whether or not the record stays on screen (the existing write lifecycle).
   * A failed save leaves the form open with its input, and leaving asks again.
   */
  const pending = useRef(writePending);
  pending.current = writePending;

  function hasUnsavedInput(): boolean {
    for (const form of touched.current) {
      if (!form.isConnected) touched.current.delete(form);
    }
    return !pending.current && touched.current.size > 0;
  }

  // A failed write puts the submitted form's input back at risk.
  useEffect(() => {
    if (options.failureSignal === undefined || options.failureSignal === null) return;
    const form = lastSubmitted.current;
    if (form?.isConnected) touched.current.add(form);
  }, [options.failureSignal]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    const forms = touched.current;
    const markInput = (event: Event) => {
      const target = event.target;
      const form =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
          ? target.form
          : null;
      if (form && form.getAttribute('role') !== 'search') forms.add(form);
    };
    const clearReset = (event: Event) => {
      if (event.target instanceof HTMLFormElement) forms.delete(event.target);
    };
    const clearSubmitted = (event: Event) => {
      if (!(event.target instanceof HTMLFormElement)) return;
      lastSubmitted.current = event.target;
      if (clearOnSubmit.current) forms.delete(event.target);
    };
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedInput()) return;
      event.preventDefault();
      // Older browsers need a value to show their own generic prompt.
      event.returnValue = '';
    };
    container.addEventListener('input', markInput, true);
    container.addEventListener('change', markInput, true);
    container.addEventListener('reset', clearReset, true);
    container.addEventListener('submit', clearSubmitted, true);
    window.addEventListener('beforeunload', beforeUnload);
    const release = blockNavigation({
      confirmLeave: (proceed) => {
        if (window.confirm(message.current)) proceed();
      },
      shouldBlock: hasUnsavedInput,
    });
    return () => {
      container.removeEventListener('input', markInput, true);
      container.removeEventListener('change', markInput, true);
      container.removeEventListener('reset', clearReset, true);
      container.removeEventListener('submit', clearSubmitted, true);
      window.removeEventListener('beforeunload', beforeUnload);
      release();
      forms.clear();
    };
    // The guard lives exactly as long as the record view.
  }, [containerRef]);

  return { hasUnsavedInput };
}
