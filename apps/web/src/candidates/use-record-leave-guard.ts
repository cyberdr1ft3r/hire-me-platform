import { useEffect, useRef, type RefObject } from 'react';

import { blockNavigation } from '../navigation/navigation-guard.js';

/**
 * Protects unsaved input in the focused candidate record.
 *
 * Every Candidate form is uncontrolled and opened on demand (edit profile, add or
 * edit a record, the restricted forms), and it closes on save or cancel. A form is
 * therefore unsaved exactly when it received input and is still on screen; a
 * successful save resets it (`form.reset()`), which clears that state too. Nothing
 * about the forms themselves changes.
 *
 * While such a form exists, leaving the record asks first: the in-app navigation
 * guard covers Back/Forward, shell links and the record's own Back action, and
 * `beforeunload` covers reload and closing the tab, unless a save is in flight. `confirmLeave` uses the same
 * native confirmation the workspace already uses for lifecycle changes.
 */
export function useRecordLeaveGuard(
  containerRef: RefObject<HTMLElement | null>,
  confirmMessage: string,
  writePending: boolean,
): { hasUnsavedInput: () => boolean } {
  const touched = useRef(new Set<HTMLFormElement>());
  const message = useRef(confirmMessage);
  message.current = confirmMessage;
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
      if (form) forms.add(form);
    };
    const clearReset = (event: Event) => {
      if (event.target instanceof HTMLFormElement) forms.delete(event.target);
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
      window.removeEventListener('beforeunload', beforeUnload);
      release();
      forms.clear();
    };
    // The guard lives exactly as long as the record view.
  }, [containerRef]);

  return { hasUnsavedInput };
}
