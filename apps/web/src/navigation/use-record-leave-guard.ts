import { useEffect, useRef, type RefObject } from 'react';

import { blockNavigation } from './navigation-guard.js';

/** Marks the element a guard watches, so an outer guard leaves an inner one's forms alone. */
export const UNSAVED_GUARD_SCOPE_ATTRIBUTE = 'data-unsaved-guard-scope';

export interface RecordLeaveGuardOptions {
  /**
   * For records whose forms stay on screen after a save and that report only failures
   * (Missions): a submitted form counts as saved once its write ends without
   * `failureSignal` changing. Until then, and after a failure, it stays unsaved.
   * Records whose forms close or reset on success (Candidates) leave this off.
   */
  clearOnSubmit?: boolean;
  /** Changes (to a new non-null value) whenever a write in this screen fails. */
  failureSignal?: unknown;
  /**
   * Changes (to a new non-null value) whenever a write in this screen succeeds, such as
   * a success feedback object. The submitted form then counts as saved with the values
   * it shows, provided its submit started a write. Use it where edit forms stay on
   * screen after saving.
   */
  savedSignal?: unknown;
}

interface TrackedForm {
  /** Serialized values when editing began; null when input arrived before any focus. */
  baseline: string | null;
  /** Whether the user changed a control since the baseline. */
  edited: boolean;
}

/** A submit whose outcome is not known yet. */
interface Submission {
  form: HTMLFormElement;
  /** The values that were submitted. */
  submitted: string;
  /** Whether the first commit after the submit has been examined. */
  decided: boolean;
  /** The person changed the form after submitting it. */
  editedSince: boolean;
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
 * Input stays unsaved until its write is confirmed: a write in flight can still fail,
 * and the screen may be gone by then, so leaving during a save asks too. Every other
 * dirty form in the screen keeps asking while one form saves.
 *
 * `writePending` is the screen's single write lock (the modules run one write at a
 * time). It only tells which submit started the write that a later `savedSignal` or
 * `failureSignal` reports on: a submit counts when the lock was free and, in the
 * first commit after it, a write is running or has already reported its outcome. A
 * submit made while the lock is held is refused by the module and ignored here.
 *
 * While unsaved input exists, leaving asks first: the in-app navigation guard covers
 * Back/Forward, shell links and in-app actions, and `beforeunload` covers reload and
 * closing the tab. `confirmLeave` uses the same native confirmation the workspaces
 * already use for lifecycle changes.
 */
export function useRecordLeaveGuard(
  containerRef: RefObject<HTMLElement | null>,
  confirmMessage: string,
  writePending: boolean,
  options: RecordLeaveGuardOptions = {},
): { hasUnsavedInput: () => boolean } {
  const tracked = useRef(new Map<HTMLFormElement, TrackedForm>());
  const submission = useRef<Submission | null>(null);
  const seen = useRef({
    failure: options.failureSignal,
    pending: writePending,
    saved: options.savedSignal,
  });
  const message = useRef(confirmMessage);
  message.current = confirmMessage;
  const clearOnSubmit = useRef(options.clearOnSubmit ?? false);
  clearOnSubmit.current = options.clearOnSubmit ?? false;
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
    return unsaved;
  }

  /** The submitted form now shows saved values; anything typed since stays unsaved. */
  function confirmSaved(current: Submission): void {
    submission.current = null;
    if (!current.form.isConnected) return;
    tracked.current.set(
      current.form,
      current.editedSince
        ? { baseline: current.submitted, edited: true }
        : { baseline: formSnapshot(current.form), edited: false },
    );
  }

  // After every commit: attribute write outcomes to the submit that started the write.
  useEffect(() => {
    const previous = seen.current;
    const saved =
      options.savedSignal !== undefined &&
      options.savedSignal !== null &&
      options.savedSignal !== previous.saved;
    const failed =
      options.failureSignal !== undefined &&
      options.failureSignal !== null &&
      options.failureSignal !== previous.failure;
    const writeEnded = previous.pending && !writePending;
    seen.current = {
      failure: options.failureSignal,
      pending: writePending,
      saved: options.savedSignal,
    };
    const current = submission.current;
    if (!current) return;
    if (!current.decided) {
      current.decided = true;
      // A write that started and settled before this commit reports its outcome here.
      const started = writePending || saved || failed;
      if (!started) {
        // Validation or a refused submit: nothing to confirm.
        submission.current = null;
        return;
      }
    }
    if (failed) {
      // The input stays unsaved and keeps asking.
      submission.current = null;
      return;
    }
    if (saved || (writeEnded && clearOnSubmit.current)) {
      confirmSaved(current);
      return;
    }
    if (writeEnded) {
      // Ended without reporting success: keep the input unsaved rather than guess.
      submission.current = null;
    }
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    container.setAttribute(UNSAVED_GUARD_SCOPE_ATTRIBUTE, '');
    const forms = tracked.current;
    let undecidedCheck: number | undefined;

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
      if (submission.current?.form === form) submission.current.editedSince = true;
    };
    const clearReset = (event: Event) => {
      if (!(event.target instanceof HTMLFormElement)) return;
      forms.delete(event.target);
      if (submission.current?.form === event.target) submission.current = null;
    };
    const handleSubmit = (event: Event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement) || !guardsForm(container, form)) return;
      // With the write lock held this submit cannot start a write; the outcome that
      // follows belongs to the write already running, so keep its submission.
      if (pending.current) return;
      // The form stays protected until its write is confirmed (see confirmSaved).
      submission.current = {
        form,
        submitted: formSnapshot(form),
        decided: false,
        editedSince: false,
      };
      const current = submission.current;
      /*
       * React commits a submit's state updates before the next task, and the first
       * commit decides above. A submit still undecided by then changed nothing (a
       * handler that returned early): it started no write and confirms nothing later.
       */
      window.clearTimeout(undecidedCheck);
      undecidedCheck = window.setTimeout(() => {
        if (submission.current === current && !current.decided) submission.current = null;
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
      window.clearTimeout(undecidedCheck);
      container.removeAttribute(UNSAVED_GUARD_SCOPE_ATTRIBUTE);
      release();
      forms.clear();
      submission.current = null;
    };
    // The guard lives exactly as long as the screen it protects.
  }, [containerRef]);

  return { hasUnsavedInput };
}
