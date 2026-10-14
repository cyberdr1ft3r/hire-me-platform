import { useState } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../i18n/index.js';
import {
  acceptHistoryTraversal,
  initializeHistoryIndex,
  pushHistoryPath,
  resetNavigationGuardForTests,
} from '../navigation/navigation-guard.js';
import { CreationDrawer } from './Drawer.js';

afterEach(() => {
  document.getElementById('root')?.remove();
});

function Harness({
  onSubmit = () => undefined,
  submitting = false,
}: {
  onSubmit?: () => void;
  submitting?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  return (
    <I18nProvider initialLocale="en">
      <button onClick={() => setOpen(true)} type="button">
        Open drawer
      </button>
      {open ? (
        <CreationDrawer
          description="Synthetic purpose"
          dirty={name !== ''}
          formId="synthetic-form"
          onClose={() => {
            setName('');
            setOpen(false);
          }}
          submitLabel="Create record"
          submitting={submitting}
          title="New record"
        >
          <form
            id="synthetic-form"
            onSubmit={(event) => {
              event.preventDefault();
              onSubmit();
            }}
          >
            <label>
              Record name
              <input onChange={(event) => setName(event.currentTarget.value)} value={name} />
            </label>
          </form>
        </CreationDrawer>
      ) : null}
    </I18nProvider>
  );
}

function open(): HTMLElement {
  fireEvent.click(screen.getByRole('button', { name: 'Open drawer' }));
  return screen.getByRole('dialog', { name: 'New record' });
}

describe('CreationDrawer', () => {
  it('is a labelled modal with a pinned header, scrolling body and action footer', () => {
    render(<Harness />);
    const dialog = open();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleDescription('Synthetic purpose');
    expect(dialog.querySelector('.ui-drawer__header')).toContainElement(
      within(dialog).getByRole('button', { name: 'Close' }),
    );
    expect(dialog.querySelector('.ui-drawer__body')).toContainElement(
      within(dialog).getByRole('textbox', { name: 'Record name' }),
    );
    const footer = dialog.querySelector('.ui-drawer__footer');
    expect(footer).toContainElement(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(footer).toContainElement(within(dialog).getByRole('button', { name: 'Create record' }));
  });

  it('focuses the first field, makes the application inert and restores both on close', () => {
    const root = document.createElement('div');
    root.id = 'root';
    document.body.appendChild(root);
    render(<Harness />, { container: root });
    const opener = screen.getByRole('button', { name: 'Open drawer' });
    opener.focus();
    const dialog = open();
    expect(within(dialog).getByRole('textbox', { name: 'Record name' })).toHaveFocus();
    expect(root.inert).toBe(true);
    expect(root).not.toContainElement(dialog);
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(root.inert).toBe(false);
    expect(opener).toHaveFocus();
  });

  it('keeps Tab inside the drawer', () => {
    render(<Harness />);
    const dialog = open();
    const close = within(dialog).getByRole('button', { name: 'Close' });
    const submit = within(dialog).getByRole('button', { name: 'Create record' });
    submit.focus();
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(close).toHaveFocus();
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(submit).toHaveFocus();
  });

  it('asks before discarding unsaved input from Escape, Cancel or the close button', () => {
    render(<Harness />);
    let dialog = open();
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Record name' }), {
      target: { value: 'Draft' },
    });
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(within(dialog).getByText('You have unsaved changes. Discard them?')).toBeVisible();
    const keep = within(dialog).getByRole('button', { name: 'Keep editing' });
    expect(keep).toHaveFocus();
    fireEvent.click(keep);
    expect(within(dialog).getByRole('textbox', { name: 'Record name' })).toHaveValue('Draft');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(within(dialog).getByRole('button', { name: 'Discard changes' })).toBeVisible();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(within(dialog).queryByRole('button', { name: 'Discard changes' })).toBeNull();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Discard changes' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    dialog = open();
    expect(within(dialog).getByRole('textbox', { name: 'Record name' })).toHaveValue('');
  });

  it('submits the body form from the footer and blocks repeats while submitting', () => {
    const onSubmit = vi.fn();
    const { rerender } = render(<Harness onSubmit={onSubmit} />);
    const dialog = open();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create record' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    rerender(<Harness onSubmit={onSubmit} submitting />);
    const busy = within(screen.getByRole('dialog')).getByRole('button', { name: 'Working…' });
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute('aria-busy', 'true');
    expect(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }),
    ).toBeDisabled();
  });

  describe('browser navigation while open', () => {
    const backTo = (index: number) => acceptHistoryTraversal({ hiremeHistoryIndex: index });

    function prepareHistory() {
      resetNavigationGuardForTests();
      window.history.replaceState(null, '', '/');
      initializeHistoryIndex();
      pushHistoryPath('/clients');
      return vi.spyOn(window.history, 'go').mockImplementation(() => undefined);
    }

    it('holds Back with unsaved input, keeps the draft and returns focus to the field', async () => {
      const go = prepareHistory();
      render(<Harness />);
      const dialog = open();
      const field = within(dialog).getByRole('textbox', { name: 'Record name' });
      fireEvent.change(field, { target: { value: 'Draft' } });
      field.focus();

      let applied = true;
      act(() => {
        applied = backTo(0);
      });
      expect(applied).toBe(false);
      expect(go).toHaveBeenLastCalledWith(1);
      expect(within(dialog).getByText('You have unsaved changes. Discard them?')).toBeVisible();
      const keep = within(dialog).getByRole('button', { name: 'Keep editing' });
      expect(keep).toHaveFocus();

      fireEvent.click(keep);
      expect(field).toHaveValue('Draft');
      await waitFor(() => expect(field).toHaveFocus());
      go.mockRestore();
    });

    it('completes the held navigation after Discard changes and closes the drawer', () => {
      const go = prepareHistory();
      render(<Harness />);
      const dialog = open();
      fireEvent.change(within(dialog).getByRole('textbox', { name: 'Record name' }), {
        target: { value: 'Draft' },
      });
      act(() => {
        backTo(0);
      });
      backTo(1); // the browser's return trip is swallowed
      fireEvent.click(within(dialog).getByRole('button', { name: 'Discard changes' }));
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(go).toHaveBeenLastCalledWith(-1);
      expect(backTo(0)).toBe(true);
      go.mockRestore();
    });

    it('does not hold navigation for a clean drawer', () => {
      const go = prepareHistory();
      render(<Harness />);
      open();
      expect(backTo(0)).toBe(true);
      expect(go).not.toHaveBeenCalled();
      go.mockRestore();
    });

    it('asks the browser to confirm reload or close only while input is unsaved', () => {
      render(<Harness />);
      const dialog = open();
      const unload = () => {
        const event = new Event('beforeunload', { cancelable: true });
        window.dispatchEvent(event);
        return event.defaultPrevented;
      };
      expect(unload()).toBe(false);
      fireEvent.change(within(dialog).getByRole('textbox', { name: 'Record name' }), {
        target: { value: 'Draft' },
      });
      expect(unload()).toBe(true);
      fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
      fireEvent.click(within(dialog).getByRole('button', { name: 'Discard changes' }));
      expect(unload()).toBe(false);
    });
  });
});
