import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CandidateDetail } from '@hire-me/contracts';

import { I18nProvider, type Locale } from '../i18n/index.js';
import { resolveCandidateAccess } from './candidate-access.js';
import { EMPTY_CANDIDATE_FILTERS } from './candidate-state.js';
import {
  asServerWouldReturn,
  FULL_PERMISSIONS,
  ORDINARY_PERMISSIONS,
  P,
  syntheticCandidate,
} from './candidate-test-data.js';
import { CandidateWorkspace, type CandidateWorkspaceProps } from './CandidateWorkspace.js';

/**
 * Presentation tests for compensation and consent maintenance (Issue #69,
 * D-CAND-03). They render the real workspace with explicit permission sets:
 * every assertion is about what an actor can see, type, or trigger.
 */

afterEach(() => {
  cleanup();
});

function workspaceProps(
  permissions: readonly string[],
  overrides: Partial<CandidateWorkspaceProps> = {},
  options: { candidate?: CandidateDetail; raw?: boolean } = {},
): CandidateWorkspaceProps {
  const record = options.candidate ?? syntheticCandidate();
  const shaped = options.raw ? record : asServerWouldReturn(record, permissions);
  return {
    access: resolveCandidateAccess(permissions),
    appliedFilters: EMPTY_CANDIDATE_FILTERS,
    detail: { candidate: shaped, status: 'ready' },
    feedback: null,
    filters: EMPTY_CANDIDATE_FILTERS,
    list: { candidates: [shaped], page: 1, pageSize: 20, status: 'ready', total: 1 },
    onAddRecord: vi.fn(() => Promise.resolve({ ok: true as const })),
    onArchive: vi.fn(),
    onArchiveRecord: vi.fn(() => Promise.resolve(true)),
    onChangeStatus: vi.fn(),
    onCreate: vi.fn(() => Promise.resolve({ ok: true as const })),
    onFiltersChange: vi.fn(),
    onPage: vi.fn(),
    onResetFilters: vi.fn(),
    onRetryDetail: vi.fn(),
    onRetryList: vi.fn(),
    onSearch: vi.fn(),
    onSelect: vi.fn(),
    onUpdate: vi.fn(() => Promise.resolve({ ok: true as const })),
    onUpdateRecord: vi.fn(() => Promise.resolve({ ok: true as const })),
    onUpdateSensitive: vi.fn(() => Promise.resolve({ ok: true as const })),
    pending: null,
    selectedId: shaped.id,
    sessionKey: 0,
    ...overrides,
  };
}

function renderWorkspace(
  permissions: readonly string[],
  overrides: Partial<CandidateWorkspaceProps> = {},
  options: { candidate?: CandidateDetail; locale?: Locale; raw?: boolean } = {},
) {
  const props = workspaceProps(permissions, overrides, options);
  const view = render(
    <I18nProvider initialLocale={options.locale ?? 'en'}>
      <CandidateWorkspace {...props} />
    </I18nProvider>,
  );
  return { props, view };
}

const button = (name: string) => screen.queryByRole('button', { name });
const restricted = () => screen.queryByRole('region', { name: 'Restricted information' });
const UUID_TEXT = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

describe('Restricted information maintenance permissions', () => {
  it('shows compensation to a view-only actor without Edit, and consent without Manage', () => {
    renderWorkspace([...ORDINARY_PERMISSIONS, P.compensationView, P.consentView]);

    const section = restricted()!;
    expect(within(section).getByText(/€54,000\.00/)).toBeVisible();
    expect(within(section).getByText('Granted')).toBeVisible();
    expect(within(section).queryByRole('button')).toBeNull();
  });

  it('gives an update or manage permission without its view permission no blind editor', () => {
    // `raw` still carries both areas, so only the permission can be what hides them.
    renderWorkspace(
      [...ORDINARY_PERMISSIONS, P.compensationUpdate, P.consentManage],
      {},
      { raw: true },
    );

    expect(restricted()).toBeNull();
    expect(button('Edit compensation')).toBeNull();
    expect(button('Manage consent')).toBeNull();
    expect(document.body.textContent).not.toMatch(/54,000|€|Granted|Salary|Consent/);
  });

  it('offers neither action with one view permission and the other area’s update', () => {
    renderWorkspace(
      [...ORDINARY_PERMISSIONS, P.compensationView, P.consentManage],
      {},
      { raw: true },
    );

    const section = restricted()!;
    expect(within(section).getByText(/€54,000\.00/)).toBeVisible();
    expect(within(section).queryByText('Granted')).toBeNull();
    expect(within(section).queryByRole('button')).toBeNull();
  });

  it('offers no restricted action without candidates:update, even with view and update/manage', () => {
    renderWorkspace([
      P.view,
      P.compensationView,
      P.compensationUpdate,
      P.consentView,
      P.consentManage,
    ]);

    const section = restricted()!;
    expect(within(section).getByText(/€54,000\.00/)).toBeVisible();
    expect(within(section).getByText('Granted')).toBeVisible();
    expect(within(section).queryByRole('button')).toBeNull();
  });

  it('offers both actions with every required permission, each inside its own block', () => {
    renderWorkspace(FULL_PERMISSIONS);

    const compensation = screen.getByRole('group', { name: 'Compensation' });
    const consent = screen.getByRole('group', { name: 'Consent' });
    expect(within(compensation).getByRole('button', { name: 'Edit compensation' })).toBeEnabled();
    expect(within(consent).getByRole('button', { name: 'Manage consent' })).toBeEnabled();
  });

  it('keeps an archived candidate’s restricted values read-only', () => {
    renderWorkspace(
      FULL_PERMISSIONS,
      {},
      {
        candidate: syntheticCandidate({
          archivedAt: '2026-07-22T00:00:00.000Z',
          status: 'ARCHIVED',
        }),
      },
    );

    const section = restricted()!;
    expect(within(section).getByText(/€54,000\.00/)).toBeVisible();
    expect(within(section).getByText('Granted')).toBeVisible();
    expect(within(section).queryByRole('button')).toBeNull();
  });

  it('holds the restricted actions while any Candidate write is in flight', () => {
    renderWorkspace(FULL_PERMISSIONS, { pending: 'skill' });

    expect(button('Edit compensation')).toBeDisabled();
    expect(button('Manage consent')).toBeDisabled();
  });
});

describe('Compensation form', () => {
  const candidate = syntheticCandidate({
    compensation: { salaryExpectationCents: 3_600_050, salaryExpectationCurrency: 'MAD' },
  });

  it('pre-fills the stored cents as major units with explicit labels, and never asks for cents', () => {
    renderWorkspace(FULL_PERMISSIONS, {}, { candidate });
    fireEvent.click(screen.getByRole('button', { name: 'Edit compensation' }));

    const form = screen.getByRole('form', { name: 'Edit compensation' });
    const amount = within(form).getByLabelText('Salary expectation');
    expect(amount).toHaveValue('36000.50');
    expect(amount).toHaveAttribute('inputmode', 'decimal');
    expect(amount).toHaveAttribute('autocomplete', 'off');
    expect(amount).toHaveFocus();
    const currency = within(form).getByLabelText('Currency');
    expect(currency).toHaveValue('MAD');
    expect(currency).toHaveAttribute('maxlength', '3');
    expect(within(form).getByText(/not cents, for example 36000 or 36000\.50/)).toBeVisible();
    // The form takes the place of the read-only value in the same block.
    expect(within(restricted()!).queryByText(/36,000\.50/)).toBeNull();
  });

  it('pre-fills zero as zero and an unrecorded amount as empty', () => {
    renderWorkspace(
      FULL_PERMISSIONS,
      {},
      {
        candidate: syntheticCandidate({
          compensation: { salaryExpectationCents: 0, salaryExpectationCurrency: null },
        }),
      },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Edit compensation' }));
    expect(screen.getByLabelText('Salary expectation')).toHaveValue('0');
    expect(screen.getByLabelText('Currency')).toHaveValue('');
    cleanup();

    renderWorkspace(
      FULL_PERMISSIONS,
      {},
      {
        candidate: syntheticCandidate({
          compensation: { salaryExpectationCents: null, salaryExpectationCurrency: null },
        }),
      },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Edit compensation' }));
    expect(screen.getByLabelText('Salary expectation')).toHaveValue('');
  });

  it('rejects a malformed amount or currency before any save, beside the field', async () => {
    const { props } = renderWorkspace(FULL_PERMISSIONS, {}, { candidate });
    fireEvent.click(screen.getByRole('button', { name: 'Edit compensation' }));
    const form = screen.getByRole('form', { name: 'Edit compensation' });
    const amount = within(form).getByLabelText('Salary expectation');

    for (const value of ['36000.505', '-5', '36,000', '1e5', 'abc', '21474836.48']) {
      fireEvent.change(amount, { target: { value } });
      fireEvent.click(within(form).getByRole('button', { name: 'Save changes' }));
      expect(
        await within(form).findByText(
          'Enter an amount such as 36000 or 36000.50, with at most two decimals.',
        ),
      ).toBeVisible();
      expect(amount).toHaveAttribute('aria-invalid', 'true');
      expect(amount).toHaveFocus();
    }
    fireEvent.change(amount, { target: { value: '36000' } });
    fireEvent.change(within(form).getByLabelText('Currency'), { target: { value: 'EU' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Save changes' }));
    expect(
      await within(form).findByText('Enter exactly three characters, for example EUR.'),
    ).toBeVisible();
    expect(props.onUpdateSensitive).not.toHaveBeenCalled();
  });

  it('hands the typed values to the container, closes, and returns focus to the action', async () => {
    const { props } = renderWorkspace(FULL_PERMISSIONS, {}, { candidate });
    fireEvent.click(screen.getByRole('button', { name: 'Edit compensation' }));
    const form = screen.getByRole('form', { name: 'Edit compensation' });
    fireEvent.change(within(form).getByLabelText('Salary expectation'), {
      target: { value: '36000.5' },
    });
    fireEvent.click(within(form).getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(screen.queryByRole('form', { name: 'Edit compensation' })).toBeNull(),
    );
    expect(props.onUpdateSensitive).toHaveBeenCalledWith({
      kind: 'compensation',
      values: { amount: '36000.5', currency: 'MAD' },
    });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Edit compensation' })).toHaveFocus(),
    );
  });

  it('cancels without saving and returns focus to the action', async () => {
    const { props } = renderWorkspace(FULL_PERMISSIONS, {}, { candidate });
    fireEvent.click(screen.getByRole('button', { name: 'Edit compensation' }));
    const form = screen.getByRole('form', { name: 'Edit compensation' });
    fireEvent.change(within(form).getByLabelText('Salary expectation'), {
      target: { value: '1' },
    });
    fireEvent.click(within(form).getByRole('button', { name: 'Cancel' }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Edit compensation' })).toHaveFocus(),
    );
    expect(props.onUpdateSensitive).not.toHaveBeenCalled();
    expect(within(restricted()!).getByText(/36,000\.50/)).toBeVisible();
  });

  it('shows a denied save generically inside the form, which stays open', async () => {
    renderWorkspace(
      FULL_PERMISSIONS,
      {
        onUpdateSensitive: vi.fn(() =>
          Promise.resolve({ failure: 'forbidden' as const, ok: false as const }),
        ),
      },
      { candidate },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Edit compensation' }));
    const form = screen.getByRole('form', { name: 'Edit compensation' });
    fireEvent.change(within(form).getByLabelText('Salary expectation'), {
      target: { value: '1' },
    });
    fireEvent.click(within(form).getByRole('button', { name: 'Save changes' }));

    expect(await within(form).findByRole('alert')).toHaveTextContent(
      'Your access does not allow this change.',
    );
    expect(screen.getByRole('form', { name: 'Edit compensation' })).toBeVisible();
  });
});

describe('Consent form', () => {
  it('offers the four contract statuses by their localized labels, carrying the enum values', () => {
    renderWorkspace(FULL_PERMISSIONS);
    fireEvent.click(screen.getByRole('button', { name: 'Manage consent' }));

    const form = screen.getByRole('form', { name: 'Manage consent' });
    const status = within(form).getByLabelText('Consent status');
    expect(status).toHaveValue('GRANTED');
    expect(status).toHaveFocus();
    const options = within(status).getAllByRole<HTMLOptionElement>('option');
    expect(options.map((option) => [option.value, option.textContent])).toEqual([
      ['UNKNOWN', 'Unknown'],
      ['GRANTED', 'Granted'],
      ['REVOKED', 'Revoked'],
      ['EXPIRED', 'Expired'],
    ]);
    expect(within(form).getByLabelText('Recorded date and time')).toHaveAttribute(
      'type',
      'datetime-local',
    );
    expect(within(form).getByText(/Changing the status does not change this date\./)).toBeVisible();
  });

  it('pre-fills the recorded instant with its local date and time', () => {
    renderWorkspace(FULL_PERMISSIONS);
    fireEvent.click(screen.getByRole('button', { name: 'Manage consent' }));

    const recorded = new Date('2026-07-21T12:00:00.000Z');
    const pad = (value: number) => String(value).padStart(2, '0');
    expect(screen.getByLabelText('Recorded date and time')).toHaveValue(
      `${recorded.getFullYear()}-${pad(recorded.getMonth() + 1)}-${pad(recorded.getDate())}` +
        `T${pad(recorded.getHours())}:${pad(recorded.getMinutes())}`,
    );
  });

  it('does not treat an incomplete date as a cleared one', async () => {
    const { props } = renderWorkspace(FULL_PERMISSIONS);
    fireEvent.click(screen.getByRole('button', { name: 'Manage consent' }));
    const form = screen.getByRole('form', { name: 'Manage consent' });
    const recorded = within(form).getByLabelText('Recorded date and time');
    // A browser reports a partly typed date as an empty value with `badInput`.
    Object.defineProperty(recorded, 'validity', { configurable: true, value: { badInput: true } });
    fireEvent.change(recorded, { target: { value: '' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Save changes' }));

    expect(
      await within(form).findByText('Enter a complete date and time, or leave the field empty.'),
    ).toBeVisible();
    expect(props.onUpdateSensitive).not.toHaveBeenCalled();
  });

  it('hands the chosen enum value and the local date to the container', async () => {
    const { props } = renderWorkspace(FULL_PERMISSIONS);
    fireEvent.click(screen.getByRole('button', { name: 'Manage consent' }));
    const form = screen.getByRole('form', { name: 'Manage consent' });
    fireEvent.change(within(form).getByLabelText('Consent status'), {
      target: { value: 'EXPIRED' },
    });
    fireEvent.change(within(form).getByLabelText('Recorded date and time'), {
      target: { value: '2026-08-01T11:30' },
    });
    fireEvent.click(within(form).getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(screen.queryByRole('form', { name: 'Manage consent' })).toBeNull());
    expect(props.onUpdateSensitive).toHaveBeenCalledWith({
      kind: 'consent',
      values: { consentRecordedAt: '2026-08-01T11:30', consentStatus: 'EXPIRED' },
    });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Manage consent' })).toHaveFocus(),
    );
  });
});

describe('Restricted information in both languages', () => {
  const STATUSES = [
    ['UNKNOWN', 'Unknown', 'Inconnu'],
    ['GRANTED', 'Granted', 'Accordé'],
    ['REVOKED', 'Revoked', 'Retiré'],
    ['EXPIRED', 'Expired', 'Expiré'],
  ] as const;

  it('reads every consent status by its localized label, never the stored value', () => {
    for (const [status, english, french] of STATUSES) {
      for (const [locale, label, groupName] of [
        ['en', english, 'Consent'],
        ['fr', french, 'Consentement'],
      ] as const) {
        renderWorkspace(
          FULL_PERMISSIONS,
          {},
          {
            candidate: syntheticCandidate({
              consent: { consentRecordedAt: null, consentStatus: status },
            }),
            locale,
          },
        );
        const consent = screen.getByRole('group', { name: groupName });
        expect(within(consent).getByText(label)).toBeVisible();
        expect(consent.textContent).not.toContain(status);
        cleanup();
      }
    }
  });

  it('labels both forms in French with no English and no identifier', () => {
    renderWorkspace(FULL_PERMISSIONS, {}, { locale: 'fr' });
    fireEvent.click(screen.getByRole('button', { name: 'Modifier la rémunération' }));
    fireEvent.click(screen.getByRole('button', { name: 'Gérer le consentement' }));

    const compensation = screen.getByRole('form', { name: 'Modifier la rémunération' });
    expect(within(compensation).getByLabelText('Prétentions salariales')).toHaveValue('54000');
    expect(within(compensation).getByLabelText('Devise')).toHaveValue('EUR');
    const consent = screen.getByRole('form', { name: 'Gérer le consentement' });
    const status = within(consent).getByLabelText('Statut du consentement');
    expect(
      within(status)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Inconnu', 'Accordé', 'Retiré', 'Expiré']);
    expect(within(consent).getByLabelText('Date et heure d’enregistrement')).toBeVisible();
    expect(
      within(consent)
        .getAllByRole('button')
        .map((control) => control.textContent),
    ).toEqual(['Enregistrer les modifications', 'Annuler']);

    const content =
      screen.getByRole('region', { name: 'Informations restreintes' }).textContent ?? '';
    expect(content).not.toMatch(
      /\b(Edit|Manage|Salary|Currency|Consent status|Recorded|Save|Cancel|Leave empty|cents)\b/,
    );
    expect(content).not.toMatch(UUID_TEXT);
  });
});

describe('Restricted forms and the session', () => {
  it('discards an open compensation or consent form when the session key changes', () => {
    const { view } = renderWorkspace(FULL_PERMISSIONS);
    fireEvent.click(screen.getByRole('button', { name: 'Edit compensation' }));
    fireEvent.change(screen.getByLabelText('Salary expectation'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Manage consent' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit profile' }));

    view.rerender(
      <I18nProvider initialLocale="en">
        <CandidateWorkspace {...workspaceProps(FULL_PERMISSIONS, { sessionKey: 1 })} />
      </I18nProvider>,
    );

    expect(screen.queryByRole('form', { name: 'Edit compensation' })).toBeNull();
    expect(screen.queryByRole('form', { name: 'Manage consent' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Edit compensation' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Manage consent' })).toBeEnabled();
    // Only the restricted forms are tied to the session key.
    expect(screen.getByRole('form', { name: 'Edit profile' })).toBeVisible();
  });
});
