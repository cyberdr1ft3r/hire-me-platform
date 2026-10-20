import { useRef, useState, type FormEvent } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';

import { I18nProvider } from '../i18n/index.js';
import {
  acceptHistoryTraversal,
  initializeHistoryIndex,
  pushHistoryPath,
  requestNavigation,
  resetNavigationGuardForTests,
} from './navigation-guard.js';
import { UnsavedInputScope } from './UnsavedInputScope.js';
import { useRecordLeaveGuard } from './use-record-leave-guard.js';

type Outcome = { tone: 'success' | 'danger' } | null;

/**
 * A module-like screen with one write lock (like the modules' `pending`): an edit form
 * that stays open after saving (controlled), a second edit form, a create form that
 * resets, a search form, an ignored filter form, and a nested scope with its own
 * outcome. Write outcomes are driven from the test through buttons.
 */
function Screen({ showEdit = true }: { showEdit?: boolean }) {
  const [title, setTitle] = useState('Original title');
  const [notes, setNotes] = useState('Original notes');
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<Outcome>(null);
  const [innerFeedback, setInnerFeedback] = useState<Outcome>(null);
  const [innerName, setInnerName] = useState('Group');
  const [innerPending, setInnerPending] = useState(false);

  /** Starts a write the way the modules do: refused while another write runs. */
  function beginWrite(event: FormEvent): void {
    event.preventDefault();
    if (pending) return;
    setFeedback(null);
    setPending(true);
  }

  return (
    <I18nProvider initialLocale="en">
      <UnsavedInputScope
        failureSignal={feedback?.tone === 'danger' ? feedback : null}
        savedSignal={feedback?.tone === 'success' ? feedback : null}
        writePending={pending}
      >
        {showEdit ? (
          <form
            aria-label="Edit"
            onSubmit={(event) => {
              if (title.trim() === '') {
                event.preventDefault(); // validation: returns without starting a write
                return;
              }
              beginWrite(event);
            }}
          >
            <input
              aria-label="Title"
              onChange={(event) => setTitle(event.currentTarget.value)}
              value={title}
            />
            <button type="submit">Save</button>
          </form>
        ) : null}
        <form aria-label="Notes" onSubmit={beginWrite}>
          <textarea
            aria-label="Notes text"
            onChange={(event) => setNotes(event.currentTarget.value)}
            value={notes}
          />
        </form>
        <form aria-label="Create">
          <input aria-label="Name" defaultValue="" />
          <button type="reset">Clear</button>
        </form>
        <form aria-label="Search" role="search">
          <input aria-label="Query" defaultValue="" />
        </form>
        <form aria-label="Filters" data-unsaved-guard="ignore">
          <input aria-label="Status" defaultValue="" />
        </form>
        <UnsavedInputScope savedSignal={innerFeedback} writePending={innerPending}>
          <form
            aria-label="Rename"
            onSubmit={(event) => {
              event.preventDefault();
              setInnerPending(true);
            }}
          >
            <input
              aria-label="Group name"
              onChange={(event) => setInnerName(event.currentTarget.value)}
              value={innerName}
            />
          </form>
        </UnsavedInputScope>
        <button
          onClick={() => {
            if (pending) return;
            setFeedback(null);
            setPending(true);
          }}
          type="button"
        >
          Start a write without a form
        </button>
        <button
          onClick={() => {
            setPending(false);
            setFeedback({ tone: 'success' });
          }}
          type="button"
        >
          Write succeeds
        </button>
        <button
          onClick={() => {
            setPending(false);
            setFeedback({ tone: 'danger' });
          }}
          type="button"
        >
          Write fails
        </button>
        <button onClick={() => setPending(false)} type="button">
          Write ends silently
        </button>
        <button
          onClick={() => {
            setInnerPending(false);
            setInnerFeedback({ tone: 'success' });
          }}
          type="button"
        >
          Inner write succeeds
        </button>
      </UnsavedInputScope>
    </I18nProvider>
  );
}

/** A screen whose write starts and settles before React renders in between. */
function InstantScreen() {
  const [title, setTitle] = useState('Original title');
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(0);
  return (
    <I18nProvider initialLocale="en">
      <UnsavedInputScope savedSignal={saved || null} writePending={pending}>
        <form
          aria-label="Edit"
          onSubmit={(event) => {
            event.preventDefault();
            // Batched into one commit: the write started, succeeded and released the lock.
            setPending(true);
            setSaved((count) => count + 1);
            setPending(false);
          }}
        >
          <input
            aria-label="Title"
            onChange={(event) => setTitle(event.currentTarget.value)}
            value={title}
          />
        </form>
      </UnsavedInputScope>
    </I18nProvider>
  );
}

/** Missions-style record: failures only, forms stay open after saving. */
function ClearOnSubmitRecord() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [title, setTitle] = useState('Original title');
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<{ attempt: number } | null>(null);
  useRecordLeaveGuard(containerRef, 'Leave the record?', pending, {
    clearOnSubmit: true,
    failureSignal: failure,
  });
  return (
    <div ref={containerRef}>
      <form
        aria-label="Edit"
        onSubmit={(event) => {
          event.preventDefault();
          setFailure(null);
          setPending(true);
        }}
      >
        <input
          aria-label="Title"
          onChange={(event) => setTitle(event.currentTarget.value)}
          value={title}
        />
      </form>
      <button onClick={() => setPending(false)} type="button">
        Record write succeeds
      </button>
      <button
        onClick={() => {
          setPending(false);
          setFailure({ attempt: Math.random() });
        }}
        type="button"
      >
        Record write fails
      </button>
    </div>
  );
}

function edit(label: string, value: string): void {
  const field = screen.getByLabelText(label);
  fireEvent.focusIn(field);
  fireEvent.change(field, { target: { value } });
}

function leaveAsks(): boolean {
  const navigate = vi.fn();
  requestNavigation(navigate);
  return navigate.mock.calls.length === 0;
}

function click(name: string): void {
  fireEvent.click(screen.getByRole('button', { name }));
}

function submit(name: string): void {
  fireEvent.submit(screen.getByRole('form', { name }));
}

/** Lets the next task run (React has committed long before). */
async function nextTask(): Promise<void> {
  await act(() => new Promise((resolve) => window.setTimeout(resolve, 0)));
}

describe('UnsavedInputScope', () => {
  let confirm: MockInstance<(message?: string) => boolean>;

  beforeEach(() => {
    resetNavigationGuardForTests();
    window.history.replaceState(null, '', '/tasks');
    initializeHistoryIndex();
    // Answer "stay" so every question is visible and nothing proceeds.
    confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  });

  afterEach(() => {
    confirm.mockRestore();
  });

  describe('what counts as unsaved', () => {
    it('never asks for a form that was focused but not changed', () => {
      render(<Screen />);
      fireEvent.focusIn(screen.getByLabelText('Title'));
      expect(leaveAsks()).toBe(false);
      expect(confirm).not.toHaveBeenCalled();
    });

    it('asks while input differs, with the localized prompt, and proceeds only on confirmation', () => {
      render(<Screen />);
      edit('Title', 'Changed title');

      expect(leaveAsks()).toBe(true);
      expect(confirm).toHaveBeenCalledWith(
        'You have unsaved changes on this page. Leave and discard them?',
      );

      confirm.mockReturnValue(true);
      const navigate = vi.fn();
      requestNavigation(navigate);
      expect(navigate).toHaveBeenCalledTimes(1);
    });

    it('stops asking once the person restores the original value', () => {
      render(<Screen />);
      edit('Title', 'Changed title');
      edit('Title', 'Original title');
      expect(leaveAsks()).toBe(false);
    });

    it('ignores search forms and forms marked as filters', () => {
      render(<Screen />);
      edit('Query', 'synthetic');
      edit('Status', 'open');
      expect(leaveAsks()).toBe(false);
    });

    it('clears a form when it is reset', () => {
      render(<Screen />);
      edit('Name', 'Synthetic person');
      expect(leaveAsks()).toBe(true);
      click('Clear');
      expect(leaveAsks()).toBe(false);
    });

    it('holds Back only while input is unsaved', () => {
      const go = vi.spyOn(window.history, 'go').mockImplementation(() => undefined);
      render(<Screen />);
      pushHistoryPath('/tasks?task=1');

      expect(acceptHistoryTraversal({ hiremeHistoryIndex: 0 })).toBe(true);
      pushHistoryPath('/tasks?task=1');
      edit('Title', 'Changed title');
      expect(acceptHistoryTraversal({ hiremeHistoryIndex: 0 })).toBe(false);
      expect(confirm).toHaveBeenCalledTimes(1);
      go.mockRestore();
    });

    it('prompts on reload or tab close only while input is unsaved', () => {
      render(<Screen />);
      const clean = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(clean);
      expect(clean.defaultPrevented).toBe(false);

      edit('Title', 'Changed title');
      const dirty = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(dirty);
      expect(dirty.defaultPrevented).toBe(true);
    });
  });

  describe('writes: in flight, failed, confirmed', () => {
    it('keeps asking while the save is in flight, and stops once it is confirmed', () => {
      render(<Screen />);
      edit('Title', 'Saved title');
      submit('Edit');
      // The write can still fail after the screen is gone: leaving and reloading ask.
      expect(leaveAsks()).toBe(true);
      const unload = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(unload);
      expect(unload.defaultPrevented).toBe(true);

      click('Write succeeds');
      expect(leaveAsks()).toBe(false);

      edit('Title', 'Saved title, edited again');
      expect(leaveAsks()).toBe(true);
    });

    it('keeps asking after a failed write, and a later unrelated success does not confirm it', () => {
      render(<Screen />);
      edit('Title', 'Not saved');
      submit('Edit');
      click('Write fails');
      expect(leaveAsks()).toBe(true);
      click('Start a write without a form');
      click('Write succeeds');
      expect(leaveAsks()).toBe(true);
    });

    it('keeps asking when a write ends without reporting success or failure', () => {
      render(<Screen />);
      edit('Title', 'Unknown outcome');
      submit('Edit');
      click('Write ends silently');
      expect(leaveAsks()).toBe(true);
    });

    it('does not let a later write confirm a submit that returned without starting one', async () => {
      render(<Screen />);
      edit('Title', '   ');
      submit('Edit');
      await nextTask();
      click('Start a write without a form');
      click('Write succeeds');
      expect(leaveAsks()).toBe(true);
    });

    it('confirms a write that starts and settles before React renders in between', () => {
      render(<InstantScreen />);
      edit('Title', 'Saved instantly');
      submit('Edit');
      expect(leaveAsks()).toBe(false);
    });

    it('keeps input typed during the save unsaved after the save is confirmed', () => {
      render(<Screen />);
      edit('Title', 'Submitted title');
      submit('Edit');
      edit('Title', 'Submitted title plus more');
      click('Write succeeds');
      expect(leaveAsks()).toBe(true);
      // Typing back to exactly what was saved is not unsaved.
      edit('Title', 'Submitted title');
      expect(leaveAsks()).toBe(false);
    });
  });

  describe('simultaneous forms', () => {
    it('keeps asking for another dirty form while one form saves and after it is saved', () => {
      render(<Screen />);
      edit('Title', 'Saving title');
      edit('Notes text', 'Unsaved notes');
      submit('Edit');
      expect(leaveAsks()).toBe(true);
      click('Write succeeds');
      // The title is saved; the notes are not.
      expect(leaveAsks()).toBe(true);
      edit('Notes text', 'Original notes');
      expect(leaveAsks()).toBe(false);
    });

    it('credits a success only to the form whose submit started the write', () => {
      render(<Screen />);
      edit('Title', 'Saving title');
      submit('Edit');
      edit('Notes text', 'Refused notes');
      // The module refuses this submit: a write is already running.
      submit('Notes');
      click('Write succeeds');
      // The notes were never written and still ask; the title was saved.
      expect(leaveAsks()).toBe(true);
      edit('Notes text', 'Original notes');
      expect(leaveAsks()).toBe(false);
    });

    it('lets a nested scope own its forms and their saved state', () => {
      render(<Screen />);
      edit('Group name', 'Renamed group');
      expect(leaveAsks()).toBe(true);
      submit('Rename');
      click('Inner write succeeds');
      expect(leaveAsks()).toBe(false);
    });

    it('asks the nested and the outer scope in turn and leaves only after both agree', () => {
      render(<Screen />);
      edit('Title', 'Outer change');
      edit('Group name', 'Inner change');
      const navigate = vi.fn();
      // Agree to discard the first surface, then cancel at the second.
      confirm.mockReturnValueOnce(true).mockReturnValueOnce(false);
      requestNavigation(navigate);
      expect(confirm).toHaveBeenCalledTimes(2);
      expect(navigate).not.toHaveBeenCalled();
      // Both scopes still protect their input on the next attempt.
      confirm.mockReturnValue(true);
      requestNavigation(navigate);
      expect(confirm).toHaveBeenCalledTimes(4);
      expect(navigate).toHaveBeenCalledTimes(1);
    });
  });

  describe('unmount', () => {
    it('forgets a form that leaves the screen', () => {
      const { rerender } = render(<Screen />);
      edit('Title', 'Changed title');
      rerender(<Screen showEdit={false} />);
      expect(leaveAsks()).toBe(false);
    });

    it('protects a save in flight until the screen goes away, and nothing after', () => {
      const { unmount } = render(<Screen />);
      edit('Title', 'Changed title');
      submit('Edit');
      expect(leaveAsks()).toBe(true);
      unmount();
      expect(leaveAsks()).toBe(false);
      const unload = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(unload);
      expect(unload.defaultPrevented).toBe(false);
    });
  });

  describe('clearOnSubmit (records that report failures only)', () => {
    it('asks while the save is in flight and counts the form saved when it ends without a failure', () => {
      render(<ClearOnSubmitRecord />);
      edit('Title', 'Record title');
      submit('Edit');
      expect(leaveAsks()).toBe(true);
      click('Record write succeeds');
      expect(leaveAsks()).toBe(false);
    });

    it('keeps the input unsaved when the write fails', () => {
      render(<ClearOnSubmitRecord />);
      edit('Title', 'Record title');
      submit('Edit');
      click('Record write fails');
      expect(leaveAsks()).toBe(true);
    });
  });
});
