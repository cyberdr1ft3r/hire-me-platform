import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../i18n/index.js';
import { FULL_ACCESS } from './training-test-data.js';
import { EMPTY_PROGRAM_FORM, type ProgramFormValues } from './training-state.js';
import { resolveTrainingAccess } from './training-access.js';
import { ProgramForm } from './ProgramForm.js';

const access = resolveTrainingAccess(FULL_ACCESS);

function renderCreate(onChange: (values: ProgramFormValues) => void, values = EMPTY_PROGRAM_FORM) {
  return render(
    <I18nProvider initialLocale="en">
      <ProgramForm
        access={access}
        loadClients={() => Promise.resolve([])}
        loadOwners={() => Promise.resolve([])}
        mode="create"
        onChange={onChange}
        onSubmit={vi.fn()}
        sessionKey={1}
        values={values}
        writesLocked={false}
      />
    </I18nProvider>,
  );
}

describe('ProgramForm', () => {
  it('merges consecutive field patches before the parent supplies the next values prop', () => {
    const onChange = vi.fn();
    renderCreate(onChange);
    const reference = screen.getByLabelText(/^Reference/);
    const name = screen.getByLabelText(/^Name/);

    fireEvent.change(reference, { target: { value: 'T' } });
    fireEvent.change(name, { target: { value: 'Alpha' } });

    expect(onChange).toHaveBeenLastCalledWith({
      ...EMPTY_PROGRAM_FORM,
      reference: 'T',
      name: 'Alpha',
    });
  });

  it('applies back-to-back reference changes from the latest snapshot', () => {
    const onChange = vi.fn();
    renderCreate(onChange);
    const reference = screen.getByLabelText(/^Reference/);

    fireEvent.change(reference, { target: { value: 'T' } });
    fireEvent.change(reference, { target: { value: 'TR' } });

    expect(reference).toHaveValue('TR');
    expect(onChange).toHaveBeenLastCalledWith({
      ...EMPTY_PROGRAM_FORM,
      reference: 'TR',
    });
  });
});
