import { useState } from 'react';
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

/**
 * A module-like screen: an edit form that stays open after saving (controlled), a
 * create form that resets, a search form, an ignored filter form, and a nested scope
 * with its own saved signal. Writes are driven from the test.
 */
function Screen({ showEdit = true }: { showEdit?: boolean }) {
  const [title, setTitle] = useState('Original title');
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'danger' } | null>(null);
  const [innerFeedback, setInnerFeedback] = useState<{ tone: 'success' } | null>(null);
  const [innerName, setInnerName] = useState('Group');
  const [innerPending, setInnerPending] = useState(false);
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
              event.preventDefault();
              if (title.trim() === '') return; // validation: no write starts
              setFeedback(null);
              setPending(true);
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
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(leaveAsks()).toBe(false);
  });

  it('treats a form that stays open as saved after a confirmed write, and dirty again on new input', () => {
    render(<Screen />);
    edit('Title', 'Saved title');
    fireEvent.submit(screen.getByRole('form', { name: 'Edit' }));
    // While the write is in flight its input is not at risk.
    expect(leaveAsks()).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Write succeeds' }));
    expect(leaveAsks()).toBe(false);

    edit('Title', 'Saved title, edited again');
    expect(leaveAsks()).toBe(true);
  });

  it('keeps asking after a failed write', () => {
    render(<Screen />);
    edit('Title', 'Not saved');
    fireEvent.submit(screen.getByRole('form', { name: 'Edit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Write fails' }));
    expect(leaveAsks()).toBe(true);
  });

  it('does not let a later success confirm a submit that never started a write', async () => {
    render(<Screen />);
    edit('Title', '   ');
    fireEvent.submit(screen.getByRole('form', { name: 'Edit' }));
    // The submit check runs after the event; nothing was written.
    await act(() => new Promise((resolve) => window.setTimeout(resolve, 0)));
    fireEvent.click(screen.getByRole('button', { name: 'Write succeeds' }));
    expect(leaveAsks()).toBe(true);
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

  it('lets a nested scope own its forms and their saved state', () => {
    render(<Screen />);
    edit('Group name', 'Renamed group');
    expect(leaveAsks()).toBe(true);
    // Saved by the nested area's own success: the outer scope does not ask either.
    fireEvent.submit(screen.getByRole('form', { name: 'Rename' }));
    fireEvent.click(screen.getByRole('button', { name: 'Inner write succeeds' }));
    expect(leaveAsks()).toBe(false);
  });

  it('forgets a form that leaves the screen', () => {
    const { rerender } = render(<Screen />);
    edit('Title', 'Changed title');
    rerender(<Screen showEdit={false} />);
    expect(leaveAsks()).toBe(false);
  });
});
