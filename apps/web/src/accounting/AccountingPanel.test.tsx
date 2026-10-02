import { FINANCE_MANAGER_PERMISSION_CODES } from '@hire-me/contracts';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider, useI18n, type Locale } from '../i18n/index.js';
import { AccountingPanel } from './AccountingPanel.js';
import {
  ACTOR_ID,
  CLIENT_ID,
  FIXTURE_IDS,
  INVOICE_ID,
  jsonResponse,
  LIMITED,
  mockAccountingApi,
  OPERATOR,
  page,
  PAYMENT_ID,
  READ_ONLY,
  syntheticClient,
  syntheticExpense,
  syntheticPayment,
  type RecordedCall,
} from './accounting-test-data.js';

function LocaleToggle() {
  const { locale, setLocale } = useI18n();
  return (
    <button onClick={() => setLocale(locale === 'en' ? 'fr' : 'en')} type="button">
      Toggle locale
    </button>
  );
}

function Panel({
  accessToken = 'token-a',
  actorUserId = ACTOR_ID,
  locale = 'en',
  permissions = OPERATOR,
}: {
  accessToken?: string;
  actorUserId?: string;
  locale?: Locale;
  permissions?: readonly string[];
}) {
  return (
    <I18nProvider initialLocale={locale}>
      <LocaleToggle />
      <AccountingPanel
        accessToken={accessToken}
        actorUserId={actorUserId}
        permissions={[...permissions]}
      />
    </I18nProvider>
  );
}

const base = '/v1/accounting';
const payment = syntheticPayment();
const expense = syntheticExpense();

function standardApi(
  overrides: (call: RecordedCall) => Promise<Response> | Response | undefined = () => undefined,
): RecordedCall[] {
  return mockAccountingApi((call) => {
    const override = overrides(call);
    if (override) return override;
    if (call.method !== 'GET') return undefined;
    switch (call.path) {
      case `${base}/payments`:
        return jsonResponse(page('payments', [payment]));
      case `${base}/payments/${PAYMENT_ID}`:
        return jsonResponse({ payment });
      case `${base}/expenses`:
        return jsonResponse(page('expenses', [expense]));
      case `${base}/expenses/${expense.id}`:
        return jsonResponse({ expense });
      case `${base}/receivables/overdue`:
        return jsonResponse({
          asOf: payment.updatedAt,
          rows: [
            {
              invoiceId: INVOICE_ID,
              clientId: CLIENT_ID,
              display: { clientName: 'Synthetic Client' },
              reference: 'INV-SYN-001',
              dueDate: payment.updatedAt,
              daysOverdue: 5,
              amounts: {
                currency: 'MAD',
                totalCents: 1_000_000,
                allocatedCents: 400_000,
                outstandingCents: 600_000,
              },
            },
          ],
          pagination: { page: 1, pageSize: 20, total: 1 },
        });
      case '/v1/clients':
        return jsonResponse(page('clients', [syntheticClient]));
      default:
        return undefined;
    }
  });
}

function callsTo(calls: RecordedCall[], path: string, method = 'GET'): RecordedCall[] {
  return calls.filter((call) => call.method === method && call.path === path);
}

async function openPayment(): Promise<void> {
  fireEvent.click(await screen.findByRole('button', { name: 'PAY-SYN-001' }));
  await screen.findByRole('heading', { level: 2, name: 'PAY-SYN-001' });
}

async function openArea(label: string): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: label }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: label })).toHaveAttribute('aria-pressed', 'true'),
  );
}

function expectNoRawIds(): void {
  const text = document.body.textContent ?? '';
  for (const id of FIXTURE_IDS) {
    expect(text).not.toContain(id);
  }
  expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  for (const input of document.querySelectorAll('input, textarea, select')) {
    expect((input as HTMLInputElement).value).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/i);
  }
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AccountingPanel: presentation and localization', () => {
  it('renders one English heading, human labels, readable money, and no identifier', async () => {
    standardApi();
    render(<Panel />);

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: 'Accounting' })).toBeVisible();
    const table = await screen.findByRole('table', { name: 'Payments' });
    expect(within(table).getByText('Synthetic Client')).toBeVisible();
    expect(within(table).getByText(/10,000\.00/)).toBeVisible();
    expect(screen.getByText('1 payment')).toBeVisible();

    await openPayment();
    expect(within(screen.getByRole('region', { name: 'History' })).getByText('Recorded')).toBeVisible();
    expect(screen.queryByText('Synthetic server summary')).toBeNull();
    expectNoRawIds();
  });

  it('renders the workspace in French with localized area labels', async () => {
    standardApi();
    render(<Panel locale="fr" />);

    expect(screen.getByRole('heading', { level: 1, name: 'Comptabilité' })).toBeVisible();
    expect(await screen.findByText('1 paiement')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Dépenses' })).toBeVisible();
    await openPayment();
    expect(screen.getByRole('heading', { level: 3, name: 'Imputations sur factures' })).toBeVisible();
    expectNoRawIds();
  });

  it('keeps the selected payment across a locale switch without refetching', async () => {
    const calls = standardApi();
    render(<Panel />);

    await openPayment();
    await waitFor(() => expect(callsTo(calls, '/v1/clients').length).toBeGreaterThan(0));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    const before = calls.length;

    fireEvent.click(screen.getByRole('button', { name: 'Toggle locale' }));

    expect(await screen.findByRole('heading', { level: 2, name: 'PAY-SYN-001' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Paiements' })).toHaveAttribute('aria-pressed', 'true');
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(calls.length).toBe(before);
  });
});

describe('AccountingPanel: personas and permissions', () => {
  it('gives the seeded Finance Manager every area without mission or placement sources', async () => {
    const calls = standardApi();
    render(<Panel permissions={FINANCE_MANAGER_PERMISSION_CODES} />);

    expect(await screen.findByRole('table', { name: 'Payments' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Record payment' })).toBeVisible();
    await openArea('Expenses');
    fireEvent.click(screen.getByRole('button', { name: 'Record expense' }));
    expect(
      within(screen.getByRole('form', { name: 'Record expense' })).queryByRole('combobox', {
        name: 'Recruitment mission',
      }),
    ).toBeNull();
    expect(callsTo(calls, '/v1/missions')).toHaveLength(0);
    expect(callsTo(calls, `${base}/placement-options`)).toHaveLength(0);
    expectNoRawIds();
  });

  it('keeps a read-only account free of every write control', async () => {
    standardApi();
    render(<Panel permissions={READ_ONLY} />);

    expect(await screen.findByText('Read-only access')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Record payment' })).toBeNull();
    await openPayment();
    expect(screen.queryByRole('group', { name: 'Payment actions' })).toBeNull();
  });

  it('shows a limited account without amounts or write controls', async () => {
    const hidden = syntheticPayment({ amounts: null });
    const calls = standardApi((call) => {
      if (call.method !== 'GET') return undefined;
      if (call.path === `${base}/payments`) return jsonResponse(page('payments', [hidden]));
      if (call.path === `${base}/payments/${PAYMENT_ID}`) return jsonResponse({ payment: hidden });
      return undefined;
    });
    render(<Panel permissions={LIMITED} />);
    void calls;

    expect(await screen.findByText('Amounts hidden')).toBeVisible();
    expect(screen.getAllByText('Hidden').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Record payment' })).toBeNull();
  });
});

describe('AccountingPanel: stale read protection', () => {
  it('drops a late payment detail response after the token changes', async () => {
    let resolveDetail!: (value: Response) => void;
    const detail = new Promise<Response>((resolve) => {
      resolveDetail = resolve;
    });
    standardApi((call) => {
      if (call.method === 'GET' && call.path === `${base}/payments/${PAYMENT_ID}`) return detail;
      return undefined;
    });

    const { rerender } = render(<Panel accessToken="token-a" />);
    fireEvent.click(await screen.findByRole('button', { name: 'PAY-SYN-001' }));
    expect(await screen.findByText('Loading payment…')).toBeVisible();

    rerender(
      <I18nProvider initialLocale="en">
        <AccountingPanel accessToken="token-b" actorUserId={ACTOR_ID} permissions={[...OPERATOR]} />
      </I18nProvider>,
    );

    resolveDetail(jsonResponse({ payment }));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    expect(screen.queryByRole('heading', { level: 2, name: 'PAY-SYN-001' })).toBeNull();
  });
});
