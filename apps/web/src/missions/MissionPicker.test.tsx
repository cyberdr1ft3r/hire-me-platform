import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState, type FormEvent } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../i18n/index.js';
import { MissionPicker } from './MissionPicker.js';
import type { PickerOption } from './mission-state.js';

describe('Mission picker combobox adapter', () => {
  it('selects and clears an authorized identity without exposing an ID or submitting its form', async () => {
    const option = { id: '11111111-1111-4111-8111-111111111111', label: 'Synthetic client' };
    const load = vi.fn(() => Promise.resolve([option]));
    const submit = vi.fn((event: FormEvent) => event.preventDefault());
    function Harness() {
      const [value, setValue] = useState<PickerOption | null>(null);
      return (
        <I18nProvider initialLocale="en">
          <form onSubmit={submit}>
            <MissionPicker
              emptyLabel="Any client"
              hint="Authorized clients only"
              label="Client"
              loadOptions={load}
              onChange={setValue}
              sourceKey="session:clients"
              value={value}
            />
          </form>
        </I18nProvider>
      );
    }
    render(<Harness />);
    const input = screen.getByRole('combobox', { name: 'Client' });
    fireEvent.focus(input);
    await screen.findByRole('option', { name: 'Synthetic client' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(input).toHaveValue('Synthetic client');
    expect(submit).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain(option.id);
    fireEvent.click(screen.getByRole('button', { name: 'Any client' }));
    await waitFor(() => expect(input).toHaveValue(''));
    expect(load).toHaveBeenCalledWith('');
  });
});
