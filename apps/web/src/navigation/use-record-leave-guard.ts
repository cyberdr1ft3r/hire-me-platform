import { useEffect, useRef, type RefObject } from 'react';

import { blockNavigation } from './navigation-guard.js';

/** Marks the element a guard watches, so an outer guard leaves an inner one's forms alone. */
export const UNSAVED_GUARD_SCOPE_ATTRIBUTE = 'data-unsaved-guard-scope';

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
  /**
   * Changes (to a new non-null value) whenever a write in this area succeeds, such as
   * a success feedback object. The form submitted last then counts as saved with the
   * values it shows, provided its submit started a write (`writePending` became true).
   * A failed or never-started write leaves the form unsaved. Use it where edit forms
   * stay on screen after saving.
   */
  savedSignal?: unknown;
}

interface TrackedForm {
  /** Serialized values when editing began; null when input arrived before any focus. */
  baseline: string | null;
  /** Whether the user changed a control since the baseline. */
  edited: boolean;
}

const NON_VALUE_INPUTS = new Set(['button', 'submit', 'reset', 'image']);

/** The values a person can change in a form, in document order. */
export function formSnapshot(form: HTMLFormElement): string {
  const values: string[] = [];
  for (const element of Array.from(form.elements)) {
    if (element instanceof HTMLInputElement) {
      if (NON_VALUE_INPUTS.has(element.type)) continue;
      if (element.type === 'checkbox' || element.type === 'radio') {
        values.push(element.checked ? '1' : '0');
      } else if (element.type === 'file') {
        values.push(
          Array.from(element.files ?? [])
            .map((file) => `${file.name}:${file.size}`)
            .join('|'),
        );
      } else {
        values.push(element.value);
      }
    } else if (element instanceof HTMLSelectElement) {
      values.push(
        Array.from(element.selectedOptions)
          .map((option) => option.value)
          .join('|'),
      );
    } else if (element instanceof HTMLTextAreaElement) {
      values.push(element.value);
    }
  }
  return JSON.stringify(values);
}

function formOf(target: EventTarget | null): HTMLFormElement | null {
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLButtonElement
  ) {
    return target.form;
  }
  return target instanceof Element ? target.closest('form') : null;
}

/**
 * Search and filter forms never hold edits (`role="search"`, or
 * `data-unsaved-guard="ignore"` where a search landmark would be wrong), and a form
 * inside a nested guard belongs to that guard.
 */
function guardsForm(container: HTMLElement, form: HTMLFormElement): boolean {
  if (form.getAttribute('role') === 'search') return false;
  if (form.getAttribute('data-unsaved-guard') === 'ignore') return false;
  const owner = form.closest(`[${UNSAVED_GUARD_SCOPE_ATTRIBUTE}]`);
  return owner === null || owner === container || !container.contains(owner);
}

/**
 * Protects genuinely unsaved input in a screen (a focused record, a module workspace).
 *
 * A form holds unsaved input while the person has changed it and its values differ
 * from what it showed when editing began. Typing and then restoring the original
 * value, a form nobody changed, a saved form (reset, closed, or confirmed through
 * `savedSignal` / `clearOnSubmit`) and search or filter forms never ask. Nothing
 * about the forms themselves changes.
 *
 * While such input exists, leaving asks first: the in-app navigation guard covers
 * Back/Forward, shell links and in-app actions, and `beforeunload` covers reload and
 * closing the tab, unless a save is in flight. `confirmLeave` uses the same native
 * confirmation the workspaces already use for lifecycle changes.
 */
export function useRecordLeaveGuard(
  containerRef: RefObject<HTMLElement | null>,
  confirmMessage: string,
  writePending: boolean,
  options: RecordLeaveGuardOptions = {},
): { hasUnsavedInput: () => boolean } {
  const tracked = useRef(new Map<HTMLFormElement, TrackedForm>());
  const lastSubmitted = useRef<{ form: HTMLFormElement; before: TrackedForm | undefined } | null>(
    null,
  );
  const awaiting = useRef<{ form: HTMLFormElement; wroteSince: boolean } | null>(null);
  const message = useRef(confirmMessage);
  message.current = confirmMessage;
  const clearOnSubmit = useRef(options.clearOnSubmit ?? false);
  clearOnSubmit.current = options.clearOnSubmit ?? false;
  /*
   * While a save is in flight its input is not at risk: the write completes on the
   * server whether or not the screen stays (the existing write lifecycle). A failed
   * save leaves the form open with its input, and leaving asks again.
   */
  const pending = useRef(writePending);
  pending.current = writePending;

  function hasUnsavedInput(): boolean {
    let unsaved = false;
    for (const [form, state] of tracked.current) {
      if (!form.isConnected) {
        tracked.current.delete(form);
        continue;
      }
      if (state.edited && (state.baseline === null || formSnapshot(form) !== state.baseline)) {
        unsaved = true;
      }
    }
    return !pending.current && unsaved;
  }

  // A confirmed save: the submitted form now shows saved values.
  useEffect(() => {
    if (options.savedSignal === undefined || options.savedSignal === null) return;
    const submitted = awaiting.current;
    if (!submitted?.wroteSince) return;
    awaiting.current = null;
    if (submitted.form.isConnected) {
      tracked.current.set(submitted.form, {
        baseline: formSnapshot(submitted.form),
        edited: false,
      });
    }
  }, [options.savedSignal]);

  // A failed write puts the submitted form's input back at risk.
  useEffect(() => {
    if (options.failureSignal === undefined || options.failureSignal === null) return;
    awaiting.current = null;
    const submitted = lastSubmitted.current;
    if (clearOnSubmit.current && submitted?.form.isConnected) {
      tracked.current.set(submitted.form, submitted.before ?? { baseline: null, edited: true });
    }
  }, [options.failureSignal]);

  // Only a submit that started a write can be confirmed by `savedSignal`.
  useEffect(() => {
    if (writePending && awaiting.current) awaiting.current.wroteSince = true;
  }, [writePending]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    container.setAttribute(UNSAVED_GUARD_SCOPE_ATTRIBUTE, '');
    const forms = tracked.current;
    let submitCheck: number | undefined;

    const startEditing = (event: Event) => {
      const form = formOf(event.target);
      if (!form || !container.contains(form) || !guardsForm(container, form)) return;
      const state = forms.get(form);
      // Values may have been replaced from data since the last look; re-read them.
      if (!state || !state.edited) forms.set(form, { baseline: formSnapshot(form), edited: false });
    };
    const markInput = (event: Event) => {
      const form = formOf(event.target);
      if (!form || !container.contains(form) || !guardsForm(container, form)) return;
      const state = forms.get(form);
      if (state) state.edited = true;
      else forms.set(form, { baseline: null, edited: true });
    };
    const clearReset = (event: Event) => {
      if (!(event.target instanceof HTMLFormElement)) return;
      forms.delete(event.target);
      if (awaiting.current?.form === event.target) awaiting.current = null;
    };
    const handleSubmit = (event: Event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement) || !guardsForm(container, form)) return;
      lastSubmitted.current = { form, before: forms.get(form) };
      if (clearOnSubmit.current) {
        forms.delete(form);
        return;
      }
      awaiting.current = { form, wroteSince: false };
      // A submit that starts no write (validation) cannot be confirmed later.
      window.clearTimeout(submitCheck);
      submitCheck = window.setTimeout(() => {
        const submitted = awaiting.current;
        if (submitted?.form === form && !submitted.wroteSince) {
          if (pending.current) submitted.wroteSince = true;
          else awaiting.current = null;
        }
      }, 0);
    };
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedInput()) return;
      event.preventDefault();
      // Older browsers need a value to show their own generic prompt.
      event.returnValue = '';
    };
    container.addEventListener('focusin', startEditing, true);
    container.addEventListener('pointerdown', startEditing, true);
    container.addEventListener('input', markInput, true);
    container.addEventListener('change', markInput, true);
    container.addEventListener('reset', clearReset, true);
    container.addEventListener('submit', handleSubmit, true);
    window.addEventListener('beforeunload', beforeUnload);
    const release = blockNavigation({
      confirmLeave: (proceed) => {
        if (window.confirm(message.current)) proceed();
      },
      shouldBlock: hasUnsavedInput,
    });
    return () => {
      container.removeEventListener('focusin', startEditing, true);
      container.removeEventListener('pointerdown', startEditing, true);
      container.removeEventListener('input', markInput, true);
      container.removeEventListener('change', markInput, true);
      container.removeEventListener('reset', clearReset, true);
      container.removeEventListener('submit', handleSubmit, true);
      window.removeEventListener('beforeunload', beforeUnload);
      window.clearTimeout(submitCheck);
      container.removeAttribute(UNSAVED_GUARD_SCOPE_ATTRIBUTE);
      release();
      forms.clear();
    };
    // The guard lives exactly as long as the screen it protects.
  }, [containerRef]);

  return { hasUnsavedInput };
}
