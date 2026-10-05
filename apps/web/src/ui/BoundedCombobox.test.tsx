import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../i18n/index.js';
import { BoundedCombobox, type BoundedPickerOption } from './BoundedCombobox.js';

const alice: BoundedPickerOption = {
  id: '11111111-1111-4111-8111-111111111111',
  label: 'Alice Example',
  detail: 'alice@example.test',
};

const bob: BoundedPickerOption = {
  id: '22222222-2222-4222-8222-222222222222',
  label: 'Bob Example',
  detail: 'bob@example.test',
};

function renderCombobox(
  loadOptions = vi.fn(() => Promise.resolve([alice, bob])),
  value: BoundedPickerOption | null = null,
) {
  const onChange = vi.fn();
  render(
    <I18nProvider>
      <BoundedCombobox
        hint="Authorized source for this workflow only."
        label="Assignee"
        loadOptions={loadOptions}
        onChange={onChange}
        sourceKey="session-1"
        value={value}
      />
    </I18nProvider>,
  );
  return { loadOptions, onChange };
}

describe('BoundedCombobox', () => {
  it('uses combobox semantics and never renders UUIDs in the list', async () => {
    renderCombobox();
    const input = screen.getByRole('combobox', { name: 'Assignee' });
    fireEvent.focus(input);
    await waitFor(() => expect(screen.getByRole('listbox')).toBeTruthy());
    expect(screen.getByText(/Alice Example/)).toBeTruthy();
    expect(screen.queryByText(/11111111-1111-4111-8111-111111111111/)).toBeNull();
  });

  it('selects with ArrowDown and Enter', async () => {
    const { onChange } = renderCombobox();
    const input = screen.getByRole('combobox', { name: 'Assignee' });
    fireEvent.focus(input);
    await waitFor(() => expect(screen.getByRole('listbox')).toBeTruthy());
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(alice));
  });

  it('closes on Escape without changing the selection', async () => {
    renderCombobox(undefined, alice);
    const input = screen.getByRole('combobox', { name: 'Assignee' });
    expect(input).toHaveValue('Alice Example · alice@example.test');
    fireEvent.focus(input);
    await waitFor(() => expect(screen.getByRole('listbox')).toBeTruthy());
    fireEvent.keyDown(input, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
    expect(input).toHaveValue('Alice Example · alice@example.test');
  });

  it('drops stale load results after sourceKey changes', async () => {
    let resolveSlow: (value: BoundedPickerOption[]) => void = () => {};
    const slow = new Promise<BoundedPickerOption[]>((resolve) => {
      resolveSlow = resolve;
    });
    const loadOptions = vi.fn(() => slow);
    const { rerender } = render(
      <I18nProvider>
        <BoundedCombobox
          hint="Hint"
          label="Client"
          loadOptions={loadOptions}
          onChange={vi.fn()}
          sourceKey="a"
          value={null}
        />
      </I18nProvider>,
    );
    fireEvent.focus(screen.getByRole('combobox', { name: 'Client' }));
    rerender(
      <I18nProvider>
        <BoundedCombobox
          hint="Hint"
          label="Client"
          loadOptions={vi.fn(() => Promise.resolve([]))}
          onChange={vi.fn()}
          sourceKey="b"
          value={null}
        />
      </I18nProvider>,
    );
    resolveSlow([alice]);
    fireEvent.focus(screen.getByRole('combobox', { name: 'Client' }));
    await waitFor(() => expect(screen.queryByText(/Alice Example/)).toBeNull());
  });
});
