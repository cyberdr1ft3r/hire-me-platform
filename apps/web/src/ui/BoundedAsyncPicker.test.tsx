import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../i18n/index.js';
import { BoundedAsyncPicker, type BoundedPickerOption } from './BoundedAsyncPicker.js';

const alice: BoundedPickerOption = {
  id: '11111111-1111-4111-8111-111111111111',
  label: 'Alice Example',
  detail: 'alice@example.test',
};

function renderPicker(loadOptions = vi.fn(() => Promise.resolve([alice]))) {
  const onChange = vi.fn();
  render(
    <I18nProvider>
      <BoundedAsyncPicker
        hint="Pick someone authorized for this workflow."
        label="Assignee"
        loadOptions={loadOptions}
        onChange={onChange}
        sourceKey="session-1"
        value={null}
      />
    </I18nProvider>,
  );
  return { loadOptions, onChange };
}

describe('BoundedAsyncPicker', () => {
  it('loads options on mount and shows human labels without UUID text', async () => {
    renderPicker();
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Assignee' })).toBeTruthy());
    const select = screen.getByRole('combobox', { name: 'Assignee' });
    expect(select.textContent).toContain('Alice Example');
    expect(select.textContent).not.toMatch(/11111111-1111-4111-8111-111111111111/);
  });

  it('ignores stale responses when sourceKey changes quickly', async () => {
    let resolveSlow: (value: BoundedPickerOption[]) => void = () => {};
    const slow = new Promise<BoundedPickerOption[]>((resolve) => {
      resolveSlow = resolve;
    });
    const loadOptions = vi.fn(() => slow);
    const { rerender } = render(
      <I18nProvider>
        <BoundedAsyncPicker
          hint="Hint"
          label="Client"
          loadOptions={loadOptions}
          onChange={vi.fn()}
          sourceKey="a"
          value={null}
        />
      </I18nProvider>,
    );
    rerender(
      <I18nProvider>
        <BoundedAsyncPicker
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
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Client' }).textContent).not.toContain('Alice'),
    );
  });

  it('runs search on Enter without submitting a parent form', async () => {
    const loadOptions = vi.fn(() => Promise.resolve([alice]));
    render(
      <I18nProvider>
        <form
          onSubmit={(event) => {
            event.preventDefault();
          }}
        >
          <BoundedAsyncPicker
            hint="Hint"
            label="Assignee"
            loadOptions={loadOptions}
            onChange={vi.fn()}
            sourceKey="s"
            value={null}
          />
        </form>
      </I18nProvider>,
    );
    await waitFor(() => expect(loadOptions).toHaveBeenCalled());
    loadOptions.mockClear();
    const search = screen.getByRole('searchbox');
    fireEvent.change(search, { target: { value: 'ali' } });
    fireEvent.keyDown(search, { key: 'Enter' });
    await waitFor(() => expect(loadOptions).toHaveBeenCalledWith('ali'));
  });
});
