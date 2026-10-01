import { FINANCE_MANAGER_PERMISSION_CODES } from '@hire-me/contracts';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider, useI18n, type Locale } from '../i18n/index.js';
import { CommercialPanel } from './CommercialPanel.js';
import {
  ACTOR_ID,
  CLIENT_ID,
  CONTRACT_ID,
  deferred,
  DOCUMENT_ID,
  errorResponse,
  FIXTURE_IDS,
  INVOICE_ID,
  jsonResponse,
  LIMITED,
  mockCommercialApi,
  MISSION_ID,
  OPERATOR,
  page,
  PLACEMENT_ID,
  PURCHASE_ORDER_ID,
  QUOTATION_B_ID,
  QUOTATION_ID,
  READ_ONLY,
  summary,
  syntheticClient,
  syntheticContract,
  syntheticInvoice,
  syntheticPurchaseOrder,
  syntheticQuotation,
  TIMESTAMP,
  VERSION_ID,
  type RecordedCall,
} from './commercial-test-data.js';

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
      <CommercialPanel
        accessToken={accessToken}
        actorUserId={actorUserId}
        permissions={[...permissions]}
      />
    </I18nProvider>
  );
}

const base = '/v1/commercial';
const paths = {
  contract: `${base}/contracts`,
  invoice: `${base}/invoices`,
  purchaseOrder: `${base}/purchase-orders`,
  quotation: `${base}/quotations`,
};

const quotation = syntheticQuotation();
const draftQuotation = syntheticQuotation({
  id: QUOTATION_B_ID,
  reference: 'Q-SYN-002',
  status: 'DRAFT',
});
const contract = syntheticContract();
const purchaseOrder = syntheticPurchaseOrder();
const invoice = syntheticInvoice();

const mission = {
  id: MISSION_ID,
  clientId: CLIENT_ID,
  clientName: 'Synthetic Client',
  title: 'Synthetic Data Engineer',
  description: null,
  requirements: null,
  state: 'CANDIDATE_SOURCING',
  priority: 'NORMAL',
  numberOfPositions: 1,
  filledPlacementCount: 0,
  location: null,
  workArrangement: null,
  engagementType: null,
  targetStartDate: null,
  applicationDeadline: null,
  commercial: null,
  closureReason: null,
  closedAt: null,
  archivedAt: null,
  createdAt: TIMESTAMP,
  updatedAt: TIMESTAMP,
};

/** Default routing: one record of each type plus every option source. */
function standardApi(
  overrides: (call: RecordedCall) => Promise<Response> | Response | undefined = () => undefined,
): RecordedCall[] {
  return mockCommercialApi((call) => {
    const override = overrides(call);
    if (override) return override;
    if (call.method !== 'GET') return undefined;
    switch (call.path) {
      case paths.quotation:
        return jsonResponse(page('quotations', [summary(quotation), summary(draftQuotation)]));
      case `${paths.quotation}/${QUOTATION_ID}`:
        return jsonResponse({ quotation });
      case `${paths.quotation}/${QUOTATION_B_ID}`:
        return jsonResponse({ quotation: draftQuotation });
      case paths.contract:
        return jsonResponse(page('contracts', [summary(contract)]));
      case `${paths.contract}/${CONTRACT_ID}`:
        return jsonResponse({ contract });
      case paths.purchaseOrder:
        return jsonResponse(page('purchaseOrders', [summary(purchaseOrder)]));
      case `${paths.purchaseOrder}/${PURCHASE_ORDER_ID}`:
        return jsonResponse({ purchaseOrder });
      case paths.invoice:
        return jsonResponse(page('invoices', [summary(invoice)]));
      case `${paths.invoice}/${INVOICE_ID}`:
        return jsonResponse({ invoice });
      case `${base}/placement-options`:
        return jsonResponse({
          options: [
            {
              id: PLACEMENT_ID,
              recruitmentMissionId: MISSION_ID,
              missionTitle: 'Synthetic Data Engineer',
              integrationStartDate: '2026-10-01T00:00:00.000Z',
              confirmedAt: '2026-09-01T00:00:00.000Z',
            },
          ],
        });
      case '/v1/clients':
        return jsonResponse(page('clients', [syntheticClient]));
      case '/v1/missions':
        return jsonResponse(page('missions', [mission]));
      default:
        return undefined;
    }
  });
}

function callsTo(calls: RecordedCall[], path: string, method = 'GET'): RecordedCall[] {
  return calls.filter((call) => call.method === method && call.path === path);
}

async function openRecord(reference: string): Promise<void> {
  fireEvent.click(await screen.findByRole('button', { name: reference }));
  await screen.findByRole('heading', { level: 2, name: reference });
}

async function openKind(label: string): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: label }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: label })).toHaveAttribute('aria-pressed', 'true'),
  );
}

function createForm(): HTMLElement {
  return screen.getByRole('form', { name: /^(New|Nouveau|Nouvelle) / });
}

async function chooseOption(scope: HTMLElement, label: RegExp | string, optionText: RegExp) {
  const select = within(scope).getByRole<HTMLSelectElement>('combobox', { name: label });
  const option = await waitFor(() => {
    const match = [...select.options].find((item) => optionText.test(item.textContent ?? ''));
    if (!match)
      throw new Error(
        `No option ${optionText} among ${[...select.options].map((item) => item.textContent).join(' | ')}`,
      );
    return match;
  });
  fireEvent.change(select, { target: { value: option.value } });
}

function expectNoRawIds(): void {
  const text = document.body.textContent ?? '';
  for (const id of FIXTURE_IDS) {
    expect(text).not.toContain(id);
  }
  expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  for (const input of document.querySelectorAll('input, textarea')) {
    expect((input as HTMLInputElement).value).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/i);
  }
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('CommercialPanel: presentation and localization', () => {
  it('renders one English heading, human labels, readable money, and no identifier', async () => {
    standardApi();
    render(<Panel />);

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: 'Commercial' })).toBeVisible();
    const tabs = within(screen.getByRole('group', { name: 'Commercial record type' }));
    expect(tabs.getAllByRole('button').map((button) => button.textContent)).toEqual([
      'Quotations',
      'Purchase orders',
      'Invoices',
      'Contracts',
    ]);
    const table = await screen.findByRole('table', { name: 'Quotations' });
    expect(within(table).getAllByText('Synthetic Client')).toHaveLength(2);
    expect(within(table).getByText('Accepted')).toBeVisible();
    const total = within(table).getAllByText(/12,000\.00/)[0];
    expect(total).toHaveClass('commercial-money');
    expect(total?.textContent).toMatch(/MAD/);
    expect(screen.getByText('2 records')).toBeVisible();

    await openRecord('Q-SYN-001');
    expect(screen.getByText('Synthetic recruitment fee')).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Create purchase order from this record' }),
    ).toBeVisible();
    expect(
      within(screen.getByRole('region', { name: 'History' })).getByText('Created'),
    ).toBeVisible();
    // The server's English summary is never shown in place of localized history.
    expect(screen.queryByText('Synthetic server summary')).toBeNull();
    expectNoRawIds();
  });

  it('renders the workspace in French with per-type status agreement', async () => {
    standardApi();
    render(<Panel locale="fr" />);

    expect(screen.getByRole('heading', { level: 1, name: 'Commercial' })).toBeVisible();
    expect(await screen.findByText('2 pièces')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Bons de commande' })).toBeVisible();
    expect(screen.getAllByText('Accepté').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Nouveau devis' })).toBeVisible();
    expect(screen.getAllByText(/12\s000,00\sMAD/).length).toBeGreaterThan(0);

    await openRecord('Q-SYN-001');
    expect(
      screen.getByRole('button', { name: 'Créer un bon de commande à partir de cette pièce' }),
    ).toBeVisible();
    await openKind('Factures');
    await openRecord('INV-SYN-001');
    expect(screen.getAllByText('Brouillon').length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { level: 3, name: 'Pièces liées' })).toBeVisible();
    expect(screen.queryByText('Invoices')).toBeNull();
    expectNoRawIds();
  });

  it('keeps selection, filters, and a typed form across a locale switch without refetching', async () => {
    const calls = standardApi();
    render(<Panel />);

    await openRecord('Q-SYN-001');
    fireEvent.change(screen.getByRole('searchbox', { name: 'Reference' }), {
      target: { value: 'Q-SYN' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'New quotation' }));
    fireEvent.change(within(createForm()).getByLabelText(/^Reference/), {
      target: { value: 'Q-TYPED' },
    });
    await waitFor(() => expect(callsTo(calls, '/v1/clients').length).toBeGreaterThan(0));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    const before = calls.length;

    fireEvent.click(screen.getByRole('button', { name: 'Toggle locale' }));

    expect(await screen.findByRole('heading', { level: 2, name: 'Nouveau devis' })).toBeVisible();
    expect(screen.getByRole('heading', { level: 2, name: 'Q-SYN-001' })).toBeVisible();
    expect(screen.getByRole('searchbox', { name: 'Référence' })).toHaveValue('Q-SYN');
    expect(within(createForm()).getByLabelText(/^Référence/)).toHaveValue('Q-TYPED');
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(calls.length).toBe(before);
  });
});

describe('CommercialPanel: personas and permissions', () => {
  it('gives the seeded Finance Manager every record type without mission or placement sources', async () => {
    const calls = standardApi();
    render(<Panel permissions={FINANCE_MANAGER_PERMISSION_CODES} />);

    expect(await screen.findByRole('table', { name: 'Quotations' })).toBeVisible();
    expect(screen.getByText('Records without a mission')).toBeVisible();
    expect(screen.queryByText('Read-only access')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'New quotation' }));
    await chooseOption(createForm(), /^Client/, /Synthetic Client/);
    expect(
      within(createForm()).queryByRole('combobox', { name: /Recruitment mission/ }),
    ).toBeNull();

    fireEvent.click(within(createForm()).getByRole('button', { name: 'Cancel' }));
    await openKind('Invoices');
    fireEvent.click(screen.getByRole('button', { name: 'New invoice' }));
    await chooseOption(createForm(), /^Client/, /Synthetic Client/);
    expect(within(createForm()).getByRole('combobox', { name: 'Quotation' })).toBeVisible();
    expect(within(createForm()).getByRole('combobox', { name: 'Purchase order' })).toBeVisible();
    expect(within(createForm()).queryByRole('combobox', { name: 'Placement' })).toBeNull();
    expect(callsTo(calls, '/v1/missions')).toHaveLength(0);
    expect(callsTo(calls, `${base}/placement-options`)).toHaveLength(0);
    expectNoRawIds();
  });

  it('keeps a read-only account free of every write and generation control', async () => {
    standardApi();
    render(<Panel permissions={READ_ONLY} />);

    expect(await screen.findByText('Read-only access')).toBeVisible();
    expect(screen.queryByRole('button', { name: /^New / })).toBeNull();
    await openRecord('Q-SYN-001');
    expect(screen.getByText('Synthetic recruitment fee')).toBeVisible();
    expect(screen.queryByRole('group', { name: 'Record actions' })).toBeNull();
    expect(screen.queryByText('Next in the chain')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Documents' })).toBeNull();
  });

  it('shows a limited account only its record type, without amounts or linked references', async () => {
    const hidden = {
      ...invoice,
      amounts: null,
      lines: null,
      display: {
        ...invoice.display,
        linkedPurchaseOrderReference: null,
        linkedQuotationReference: null,
      },
    };
    const calls = standardApi((call) => {
      if (call.method !== 'GET') return undefined;
      if (call.path === paths.invoice) return jsonResponse(page('invoices', [summary(hidden)]));
      if (call.path === `${paths.invoice}/${INVOICE_ID}`) return jsonResponse({ invoice: hidden });
      return undefined;
    });
    render(<Panel permissions={LIMITED} />);

    const tabs = within(screen.getByRole('group', { name: 'Commercial record type' }));
    expect(tabs.getAllByRole('button').map((button) => button.textContent)).toEqual(['Invoices']);
    expect(screen.getByText('Amounts hidden')).toBeVisible();
    expect(await screen.findByText('Hidden')).toBeVisible();
    await openRecord('INV-SYN-001');
    expect(screen.getByText('Amounts are hidden for your account.')).toBeVisible();
    expect(screen.getAllByText('Restricted')).toHaveLength(2);
    expect(screen.queryByRole('heading', { name: 'Lines' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Documents' })).toBeNull();
    expect(calls.some((call) => call.path === paths.quotation)).toBe(false);
    expectNoRawIds();
  });

  it('shows the no-access state without any Commercial request', async () => {
    const calls = standardApi();
    render(<Panel permissions={['clients:view']} />);

    expect(screen.getByText('No commercial records available')).toBeVisible();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(calls.filter((call) => call.path.startsWith(base))).toHaveLength(0);
  });
});

describe('CommercialPanel: lists and states', () => {
  it('filters on the server and shows loading, error with retry, and empty states', async () => {
    let fail = true;
    const calls = standardApi((call) => {
      if (call.method !== 'GET' || call.path !== paths.quotation) return undefined;
      if (fail) return errorResponse(500, 'SYNTHETIC_FAILURE');
      if (call.search.get('reference') === 'NONE') return jsonResponse(page('quotations', []));
      return undefined;
    });
    render(<Panel />);

    expect(await screen.findByText('Records unavailable')).toBeVisible();
    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('table', { name: 'Quotations' })).toBeVisible();

    const filters = screen.getByRole('search', { name: 'Filter Quotations' });
    fireEvent.change(within(filters).getByRole('searchbox', { name: 'Reference' }), {
      target: { value: 'NONE' },
    });
    fireEvent.change(within(filters).getByRole('combobox', { name: 'Status' }), {
      target: { value: 'ARCHIVED' },
    });
    fireEvent.click(within(filters).getByRole('button', { name: 'Apply filters' }));
    expect(await screen.findByText('No matching records')).toBeVisible();
    const last = callsTo(calls, paths.quotation).at(-1);
    expect(last?.search.get('reference')).toBe('NONE');
    expect(last?.search.get('status')).toBe('ARCHIVED');
    expect(last?.search.get('includeArchived')).toBe('true');

    fireEvent.click(screen.getAllByRole('button', { name: 'Clear filters' })[0] as HTMLElement);
    expect(await screen.findByRole('table', { name: 'Quotations' })).toBeVisible();
  });

  it('says when a record type has no records yet', async () => {
    standardApi((call) =>
      call.method === 'GET' && call.path === paths.contract
        ? jsonResponse(page('contracts', []))
        : undefined,
    );
    render(<Panel />);
    await screen.findByRole('table', { name: 'Quotations' });
    await openKind('Contracts');
    expect(await screen.findByText('No contracts yet')).toBeVisible();
  });
});

describe('CommercialPanel: lifecycle', () => {
  it.each([
    {
      kind: 'Quotations',
      reference: 'Q-SYN-002',
      action: 'Issue',
      path: `${paths.quotation}/${QUOTATION_B_ID}/status`,
      body: { status: 'ISSUED' },
      result: { quotation: { ...draftQuotation, status: 'ISSUED' } },
      success: 'Record issued.',
    },
    {
      kind: 'Contracts',
      reference: 'C-SYN-001',
      action: 'Mark completed',
      path: `${paths.contract}/${CONTRACT_ID}/status`,
      body: { status: 'COMPLETED' },
      result: { contract: { ...contract, status: 'COMPLETED' } },
      success: 'Contract marked completed.',
    },
  ])('runs $action on a $kind record without confirmation', async (row) => {
    const calls = standardApi((call) =>
      call.method === 'POST' && call.path === row.path ? jsonResponse(row.result) : undefined,
    );
    render(<Panel />);
    await screen.findByRole('table', { name: 'Quotations' });
    if (row.kind !== 'Quotations') await openKind(row.kind);
    await openRecord(row.reference);

    fireEvent.click(screen.getByRole('button', { name: row.action }));
    expect(await screen.findByText(row.success)).toBeVisible();
    expect(callsTo(calls, row.path, 'POST')[0]?.body).toEqual(row.body);
  });

  it('confirms a rejection and sends its optional reason', async () => {
    const issued = syntheticQuotation({ status: 'ISSUED' });
    const statusPath = `${paths.quotation}/${QUOTATION_ID}/status`;
    const calls = standardApi((call) => {
      if (call.method === 'GET' && call.path === `${paths.quotation}/${QUOTATION_ID}`) {
        return jsonResponse({ quotation: issued });
      }
      if (call.method === 'POST' && call.path === statusPath) {
        return jsonResponse({ quotation: { ...issued, status: 'REJECTED' } });
      }
      return undefined;
    });
    render(<Panel />);
    await openRecord('Q-SYN-001');

    // One primary action per region; the others are secondary.
    expect(screen.getByRole('button', { name: 'Mark accepted' })).toHaveClass('ui-button--primary');
    fireEvent.click(screen.getByRole('button', { name: 'Mark rejected' }));
    const confirm = screen.getByRole('form', { name: 'Confirm rejection' });
    fireEvent.change(within(confirm).getByLabelText(/^Reason/), {
      target: { value: 'Client chose another offer' },
    });
    fireEvent.click(within(confirm).getByRole('button', { name: 'Mark rejected' }));

    expect(await screen.findByText('Quotation marked rejected.')).toBeVisible();
    expect(callsTo(calls, statusPath, 'POST')[0]?.body).toEqual({
      reason: 'Client chose another offer',
      status: 'REJECTED',
    });
  });

  it('requires a reason before canceling an invoice', async () => {
    const cancelPath = `${paths.invoice}/${INVOICE_ID}/cancel`;
    const calls = standardApi((call) =>
      call.method === 'POST' && call.path === cancelPath
        ? jsonResponse({ invoice: { ...invoice, status: 'CANCELED' } })
        : undefined,
    );
    render(<Panel />);
    await screen.findByRole('table', { name: 'Quotations' });
    await openKind('Invoices');
    await openRecord('INV-SYN-001');

    fireEvent.click(screen.getByRole('button', { name: 'Cancel record' }));
    const confirm = screen.getByRole('form', { name: 'Confirm cancellation' });
    fireEvent.click(within(confirm).getByRole('button', { name: 'Cancel record' }));
    expect(
      await within(confirm).findByText('Enter the reason for canceling this invoice.'),
    ).toBeVisible();
    expect(callsTo(calls, cancelPath, 'POST')).toHaveLength(0);

    fireEvent.change(within(confirm).getByLabelText(/^Reason/), {
      target: { value: 'Duplicate invoice' },
    });
    fireEvent.click(within(confirm).getByRole('button', { name: 'Cancel record' }));
    expect(await screen.findByText('Record canceled.')).toBeVisible();
    expect(callsTo(calls, cancelPath, 'POST')[0]?.body).toEqual({ reason: 'Duplicate invoice' });
  });

  it('issues an invoice with its due date', async () => {
    const issuePath = `${paths.invoice}/${INVOICE_ID}/issue`;
    const calls = standardApi((call) =>
      call.method === 'POST' && call.path === issuePath
        ? jsonResponse({ invoice: { ...invoice, status: 'ISSUED', issuedAt: TIMESTAMP } })
        : undefined,
    );
    render(<Panel />);
    await screen.findByRole('table', { name: 'Quotations' });
    await openKind('Invoices');
    await openRecord('INV-SYN-001');

    fireEvent.click(screen.getByRole('button', { name: 'Issue' }));
    const confirm = screen.getByRole('form', { name: 'Confirm issue' });
    fireEvent.change(within(confirm).getByLabelText(/^Due date/), {
      target: { value: '2026-11-30' },
    });
    fireEvent.click(within(confirm).getByRole('button', { name: 'Issue invoice' }));

    expect(await screen.findByText('Record issued.')).toBeVisible();
    const body = callsTo(calls, issuePath, 'POST')[0]?.body;
    expect(body?.dueDate).toMatch(/^2026-11-(29|30)T/);
    expect(body).not.toHaveProperty('issueDate');
    expect(await screen.findByRole('button', { name: 'Cancel record' })).toBeVisible();
  });

  it('archives a completed contract after confirmation', async () => {
    const completed = syntheticContract({ status: 'COMPLETED' });
    const archivePath = `${paths.contract}/${CONTRACT_ID}/archive`;
    const calls = standardApi((call) => {
      if (call.method === 'GET' && call.path === `${paths.contract}/${CONTRACT_ID}`) {
        return jsonResponse({ contract: completed });
      }
      if (call.method === 'POST' && call.path === archivePath) {
        return jsonResponse({
          contract: { ...completed, status: 'ARCHIVED', archivedAt: TIMESTAMP },
        });
      }
      return undefined;
    });
    render(<Panel />);
    await screen.findByRole('table', { name: 'Quotations' });
    await openKind('Contracts');
    await openRecord('C-SYN-001');

    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
    fireEvent.click(
      within(screen.getByRole('form', { name: 'Confirm archive' })).getByRole('button', {
        name: 'Archive record',
      }),
    );
    expect(await screen.findByText('Record archived.')).toBeVisible();
    expect(callsTo(calls, archivePath, 'POST')).toHaveLength(1);
    expect(screen.queryByRole('group', { name: 'Record actions' })).toBeNull();
  });

  it('reports a lifecycle conflict with localized copy and shows the current state', async () => {
    const statusPath = `${paths.quotation}/${QUOTATION_B_ID}/status`;
    let detailReads = 0;
    const calls = standardApi((call) => {
      if (call.method === 'POST' && call.path === statusPath) {
        return errorResponse(409, 'QUOTATION_INVALID_TRANSITION');
      }
      if (call.method === 'GET' && call.path === `${paths.quotation}/${QUOTATION_B_ID}`) {
        detailReads += 1;
        return jsonResponse({
          quotation: detailReads > 1 ? { ...draftQuotation, status: 'CANCELED' } : draftQuotation,
        });
      }
      return undefined;
    });
    render(<Panel />);
    await openRecord('Q-SYN-002');

    fireEvent.click(screen.getByRole('button', { name: 'Issue' }));
    expect(
      await screen.findByText(
        'The record changed status in the meantime. Its current state is shown.',
      ),
    ).toBeVisible();
    await waitFor(() =>
      expect(within(screen.getByRole('article')).getByText('Canceled')).toBeVisible(),
    );
    expect(callsTo(calls, statusPath, 'POST')).toHaveLength(1);
  });
});

describe('CommercialPanel: creation and option sources', () => {
  it('creates a purchase order from an accepted quotation and follows the chain', async () => {
    const created = syntheticPurchaseOrder({
      id: PURCHASE_ORDER_ID,
      reference: 'PO-NEW',
      status: 'DRAFT',
    });
    const calls = standardApi((call) =>
      call.method === 'POST' && call.path === paths.purchaseOrder
        ? jsonResponse({ purchaseOrder: created }, 201)
        : undefined,
    );
    render(<Panel />);
    await openRecord('Q-SYN-001');

    fireEvent.click(screen.getByRole('button', { name: 'Create purchase order from this record' }));
    const form = createForm();
    expect(screen.getByRole('heading', { level: 2, name: 'New purchase order' })).toHaveFocus();
    await waitFor(() =>
      expect(
        within(form).getByRole<HTMLSelectElement>('combobox', { name: 'Quotation' })
          .selectedOptions[0]?.textContent,
      ).toBe('Q-SYN-001'),
    );
    expect(within(form).getByText('Taken from')).toBeVisible();
    expect(within(form).getByText('MAD')).toBeVisible();
    fireEvent.change(within(form).getByLabelText(/^Reference/), { target: { value: 'PO-NEW' } });
    fireEvent.change(within(form).getByLabelText(/^Amount/), { target: { value: '1250,50' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Create purchase order' }));

    expect(await screen.findByText('Purchase order created.')).toBeVisible();
    expect(callsTo(calls, paths.purchaseOrder, 'POST')[0]?.body).toEqual({
      amountCents: 125_050,
      clientId: CLIENT_ID,
      currency: 'MAD',
      quotationId: QUOTATION_ID,
      reference: 'PO-NEW',
      taxCents: 0,
    });
    expect(screen.getByRole('button', { name: 'Purchase orders' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('heading', { level: 2, name: 'PO-NEW' })).toBeVisible();
    expect(screen.queryByRole('form', { name: /^New / })).toBeNull();
    expectNoRawIds();
  });

  it('creates a quotation with a mission and exact line amounts from the option sources', async () => {
    const calls = standardApi((call) =>
      call.method === 'POST' && call.path === paths.quotation
        ? jsonResponse(
            { quotation: syntheticQuotation({ reference: 'Q-NEW', status: 'DRAFT' }) },
            201,
          )
        : undefined,
    );
    render(<Panel />);
    await screen.findByRole('table', { name: 'Quotations' });

    fireEvent.click(screen.getByRole('button', { name: 'New quotation' }));
    const form = createForm();
    fireEvent.click(within(form).getByRole('button', { name: 'Create quotation' }));
    expect(await within(form).findByText('Some fields need attention')).toBeVisible();
    expect(callsTo(calls, paths.quotation, 'POST')).toHaveLength(0);

    fireEvent.change(within(form).getByLabelText(/^Reference/), { target: { value: 'Q-NEW' } });
    await chooseOption(form, /^Client/, /Synthetic Client · Synthetic City/);
    await chooseOption(form, /^Recruitment mission/, /Synthetic Data Engineer/);
    fireEvent.change(within(form).getByLabelText(/^Description/), {
      target: { value: 'Synthetic search fee' },
    });
    fireEvent.change(within(form).getByLabelText(/^Unit price/), { target: { value: '0.10' } });
    fireEvent.change(within(form).getByLabelText(/^Tax rate/), { target: { value: '7,5' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Create quotation' }));

    expect(await screen.findByText('Quotation created.')).toBeVisible();
    expect(callsTo(calls, paths.quotation, 'POST')[0]?.body).toEqual({
      clientId: CLIENT_ID,
      currency: 'MAD',
      lines: [
        { description: 'Synthetic search fee', quantity: 1, taxRateBps: 750, unitPriceCents: 10 },
      ],
      recruitmentMissionId: MISSION_ID,
      reference: 'Q-NEW',
    });
    // With transfer the actor's mission scope is not limited to its own assignments.
    expect(callsTo(calls, '/v1/missions')[0]?.search.get('clientId')).toBe(CLIENT_ID);
    expect(callsTo(calls, '/v1/missions')[0]?.search.get('assigneeUserId')).toBeNull();
  });

  it('limits mission choices to the actor’s own assignments without transfer', async () => {
    const calls = standardApi();
    render(
      <Panel permissions={OPERATOR.filter((code) => code !== 'mission_candidates:transfer')} />,
    );
    await screen.findByRole('table', { name: 'Quotations' });

    fireEvent.click(screen.getByRole('button', { name: 'New quotation' }));
    await chooseOption(createForm(), /^Client/, /Synthetic Client/);
    await waitFor(() => expect(callsTo(calls, '/v1/missions')).toHaveLength(1));
    expect(callsTo(calls, '/v1/missions')[0]?.search.get('assigneeUserId')).toBe(ACTOR_ID);
    expect(
      within(createForm()).getByText('Missions you are actively assigned to for this client.'),
    ).toBeVisible();
  });

  it('invoices a placement from the bounded placement source, described by dates only', async () => {
    const calls = standardApi((call) =>
      call.method === 'POST' && call.path === paths.invoice
        ? jsonResponse({ invoice: syntheticInvoice({ reference: 'INV-NEW' }) }, 201)
        : undefined,
    );
    render(<Panel />);
    await screen.findByRole('table', { name: 'Quotations' });
    await openKind('Invoices');

    fireEvent.click(screen.getByRole('button', { name: 'New invoice' }));
    const form = createForm();
    fireEvent.change(within(form).getByLabelText(/^Reference/), { target: { value: 'INV-NEW' } });
    await chooseOption(form, /^Client/, /Synthetic Client/);
    await chooseOption(
      form,
      'Placement',
      /Synthetic Data Engineer · confirmed 1 Sept 2026 · starts 1 Oct 2026/,
    );
    expect(within(form).getByText('Taken from')).toBeVisible();
    fireEvent.change(within(form).getByLabelText(/^Description/), {
      target: { value: 'Placement fee' },
    });
    fireEvent.change(within(form).getByLabelText(/^Unit price/), { target: { value: '5000' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Create invoice' }));

    expect(await screen.findByText('Invoice created.')).toBeVisible();
    const body = callsTo(calls, paths.invoice, 'POST')[0]?.body;
    expect(body).toMatchObject({
      clientId: CLIENT_ID,
      missionPlacementId: PLACEMENT_ID,
      recruitmentMissionId: MISSION_ID,
    });
    expect(callsTo(calls, `${base}/placement-options`)[0]?.search.get('clientId')).toBe(CLIENT_ID);
    // Linked sources come only from the Commercial lists, filtered by client and linkable status.
    const quotationSource = callsTo(calls, paths.quotation).find(
      (call) => call.search.get('status') === 'ACCEPTED',
    );
    expect(quotationSource?.search.get('clientId')).toBe(CLIENT_ID);
    expectNoRawIds();
  });

  it('shows a duplicate reference as localized copy and keeps the typed form', async () => {
    standardApi((call) =>
      call.method === 'POST' && call.path === paths.quotation
        ? errorResponse(409, 'QUOTATION_REFERENCE_EXISTS')
        : undefined,
    );
    render(<Panel />);
    await screen.findByRole('table', { name: 'Quotations' });

    fireEvent.click(screen.getByRole('button', { name: 'New quotation' }));
    const form = createForm();
    fireEvent.change(within(form).getByLabelText(/^Reference/), { target: { value: 'Q-SYN-001' } });
    await chooseOption(form, /^Client/, /Synthetic Client/);
    fireEvent.change(within(form).getByLabelText(/^Description/), { target: { value: 'Fee' } });
    fireEvent.change(within(form).getByLabelText(/^Unit price/), { target: { value: '10' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Create quotation' }));

    expect(
      await screen.findByText('This reference, or this source, is already used.'),
    ).toBeVisible();
    expect(within(createForm()).getByLabelText(/^Reference/)).toHaveValue('Q-SYN-001');
  });
});

describe('CommercialPanel: document generation', () => {
  it('hides generation without the capability or without commercial data access', async () => {
    standardApi();
    const { unmount } = render(
      <Panel permissions={OPERATOR.filter((code) => code !== 'documents:generate')} />,
    );
    await openRecord('Q-SYN-001');
    expect(screen.queryByRole('button', { name: 'Generate PDF' })).toBeNull();
    unmount();

    render(<Panel permissions={['clients:view', 'quotations:view', 'documents:generate']} />);
    await openRecord('Q-SYN-001');
    expect(screen.queryByRole('button', { name: 'Generate PDF' })).toBeNull();
  });

  it('explains when the lifecycle does not allow generation yet', async () => {
    const calls = standardApi();
    render(<Panel />);
    await openRecord('Q-SYN-002');
    expect(
      screen.getByText('Documents can be generated once the quotation is issued.'),
    ).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Generate PDF' })).toBeNull();
    expect(calls.some((call) => call.path.endsWith('/generate'))).toBe(false);
  });

  it('generates in the chosen language, lists versions, and downloads through the protected endpoint', async () => {
    const generatePath = `${paths.quotation}/${QUOTATION_ID}/generate`;
    const calls = standardApi((call) => {
      if (call.method === 'POST' && call.path === generatePath) {
        return jsonResponse(
          {
            generated: {
              documentId: DOCUMENT_ID,
              versionId: VERSION_ID,
              versionNumber: 1,
              sourceType: 'COMMERCIAL_QUOTATION',
              sourceId: QUOTATION_ID,
              documentType: 'QUOTATION',
              outputFamily: 'WORD',
              language: 'fr',
              templateId: 'commercial.quotation',
              templateVersion: 1,
              filename: 'quotation-q-syn-001-v1.docx',
              mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              sizeBytes: 2048,
              checksumSha256: 'a'.repeat(64),
              generatedByUserId: ACTOR_ID,
              generatedAt: TIMESTAMP,
              replayed: false,
            },
          },
          201,
        );
      }
      if (call.method === 'GET' && call.path === `/v1/documents/${DOCUMENT_ID}/versions`) {
        return jsonResponse({
          versions: [
            {
              id: VERSION_ID,
              documentId: DOCUMENT_ID,
              versionNumber: 1,
              filename: 'quotation-q-syn-001-v1.docx',
              originalFilename: null,
              mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              sizeBytes: 2048,
              checksumSha256: 'a'.repeat(64),
              outputFamily: 'WORD',
              source: 'GENERATED',
              templateId: 'commercial.quotation',
              templateVersion: 1,
              generationLanguage: 'fr',
              status: 'ACTIVE',
              archivedAt: null,
              createdByUserId: ACTOR_ID,
              createdByDisplayName: 'Synthetic Operator',
              createdAt: TIMESTAMP,
            },
          ],
        });
      }
      if (
        call.method === 'GET' &&
        call.path === `/v1/documents/${DOCUMENT_ID}/versions/${VERSION_ID}/download`
      ) {
        return new Response(new Blob(['PK'], { type: 'application/octet-stream' }), {
          status: 200,
        });
      }
      return undefined;
    });
    const createObjectURL = vi.fn(() => 'blob:synthetic-generated-document');
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    const clicks: HTMLAnchorElement[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function mockClick(
      this: HTMLAnchorElement,
    ) {
      clicks.push(this);
    });
    render(<Panel />);
    await openRecord('Q-SYN-001');

    expect(screen.getByRole('combobox', { name: 'Document language' })).toHaveValue('en');
    fireEvent.change(screen.getByRole('combobox', { name: 'Document language' }), {
      target: { value: 'fr' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Generate Word' }));

    expect(await screen.findByText('Word version 1 generated in French.')).toBeVisible();
    const body = callsTo(calls, generatePath, 'POST')[0]?.body;
    expect(body).toMatchObject({ language: 'fr', outputFamily: 'WORD' });
    expect(typeof body?.idempotencyKey).toBe('string');
    expect(screen.getByRole('button', { name: 'Regenerate Word' })).toBeVisible();

    fireEvent.click(await screen.findByRole('button', { name: 'Download version 1' }));
    expect(await screen.findByText('Download started.')).toBeVisible();
    expect(clicks[0]?.download).toBe('quotation-q-syn-001-v1.docx');
    expect(clicks[0]?.isConnected).toBe(false);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:synthetic-generated-document');
    expectNoRawIds();
  });
});

describe('CommercialPanel: session and stale-response safety', () => {
  it('drops a list from a replaced token and reloads for the new one', async () => {
    const lateList = deferred();
    const calls = standardApi((call) => {
      if (call.method === 'GET' && call.path === paths.quotation) {
        return call.authorization === 'Bearer token-a'
          ? lateList.promise
          : jsonResponse(page('quotations', [summary(quotation)]));
      }
      return undefined;
    });
    const { rerender } = render(<Panel accessToken="token-a" />);
    await waitFor(() => expect(callsTo(calls, paths.quotation)).toHaveLength(1));

    rerender(<Panel accessToken="token-b" />);
    expect(await screen.findByRole('button', { name: 'Q-SYN-001' })).toBeVisible();
    await act(async () => {
      lateList.resolve(jsonResponse(page('quotations', [summary(draftQuotation)])));
      await lateList.promise;
    });
    expect(screen.queryByRole('button', { name: 'Q-SYN-002' })).toBeNull();
    expect(callsTo(calls, paths.quotation).at(-1)?.authorization).toBe('Bearer token-b');
  });

  it('clears selection and the open form when the permission principal changes', async () => {
    standardApi();
    const { rerender } = render(<Panel />);
    await openRecord('Q-SYN-001');
    fireEvent.click(screen.getByRole('button', { name: 'New quotation' }));

    rerender(<Panel permissions={READ_ONLY} />);
    expect(await screen.findByText('Read-only access')).toBeVisible();
    expect(screen.queryByRole('heading', { level: 2, name: 'Q-SYN-001' })).toBeNull();
    expect(screen.queryByRole('form', { name: /^New / })).toBeNull();
    expect(screen.getByText('Select a quotation to see its details.')).toBeVisible();
  });

  it('never lets a late detail for the previous selection replace the current one', async () => {
    const lateDetail = deferred();
    standardApi((call) =>
      call.method === 'GET' && call.path === `${paths.quotation}/${QUOTATION_ID}`
        ? lateDetail.promise
        : undefined,
    );
    render(<Panel />);

    fireEvent.click(await screen.findByRole('button', { name: 'Q-SYN-001' }));
    await openRecord('Q-SYN-002');
    await act(async () => {
      lateDetail.resolve(jsonResponse({ quotation }));
      await lateDetail.promise;
    });
    expect(screen.getByRole('heading', { level: 2, name: 'Q-SYN-002' })).toBeVisible();
    expect(screen.queryByRole('heading', { level: 2, name: 'Q-SYN-001' })).toBeNull();
  });

  it('never lets a late list of the previous record type populate the new one', async () => {
    const lateQuotations = deferred();
    standardApi((call) =>
      call.method === 'GET' && call.path === paths.quotation ? lateQuotations.promise : undefined,
    );
    render(<Panel />);

    await openKind('Invoices');
    expect(await screen.findByRole('button', { name: 'INV-SYN-001' })).toBeVisible();
    await act(async () => {
      lateQuotations.resolve(jsonResponse(page('quotations', [summary(quotation)])));
      await lateQuotations.promise;
    });
    expect(screen.queryByRole('button', { name: 'Q-SYN-001' })).toBeNull();
    expect(screen.getByRole('table', { name: 'Invoices' })).toBeVisible();
  });

  it('ignores a late mutation for a record that is no longer selected, and allows one write at a time', async () => {
    const lateStatus = deferred();
    const statusPath = `${paths.quotation}/${QUOTATION_B_ID}/status`;
    const calls = standardApi((call) =>
      call.method === 'POST' && call.path === statusPath ? lateStatus.promise : undefined,
    );
    render(<Panel />);
    await openRecord('Q-SYN-002');

    fireEvent.click(screen.getByRole('button', { name: 'Issue' }));
    await waitFor(() => expect(callsTo(calls, statusPath, 'POST')).toHaveLength(1));
    expect(screen.getByRole('button', { name: 'Cancel record' })).toBeDisabled();

    await openRecord('Q-SYN-001');
    await act(async () => {
      lateStatus.resolve(jsonResponse({ quotation: { ...draftQuotation, status: 'ISSUED' } }));
      await lateStatus.promise;
    });
    expect(screen.getByRole('heading', { level: 2, name: 'Q-SYN-001' })).toBeVisible();
    expect(screen.queryByText('Record issued.')).toBeNull();
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Create purchase order from this record' }),
      ).toBeEnabled(),
    );
  });

  it('moves focus to the selected record heading', async () => {
    standardApi();
    render(<Panel />);
    await openRecord('Q-SYN-001');
    expect(screen.getByRole('heading', { level: 2, name: 'Q-SYN-001' })).toHaveFocus();
  });
});
