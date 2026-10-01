import { FINANCE_MANAGER_PERMISSION_CODES } from '@hire-me/contracts';
import { describe, expect, it } from 'vitest';

import { CommercialRequestError } from '../api.js';
import { resolveCommercialAccess, visibleKinds } from './commercial-access.js';
import {
  actionAcceptsReason,
  actionNeedsConfirmation,
  actionRequiresReason,
  actionTargetStatus,
  commercialChain,
  followUpKinds,
  generationEligible,
  lifecycleActions,
} from './commercial-kinds.js';
import {
  EMPTY_LIST_FILTERS,
  commercialFailureKey,
  deriveContext,
  emptyCreateForm,
  followUpForm,
  parseMoney,
  parseTaxRate,
  sourceOption,
  toCreateRequest,
  toListParameters,
  type CommercialPickerOption,
} from './commercial-state.js';
import {
  CLIENT_ID,
  CONTRACT_ID,
  LIMITED,
  MISSION_ID,
  OPERATOR,
  PLACEMENT_ID,
  PURCHASE_ORDER_ID,
  QUOTATION_B_ID,
  QUOTATION_ID,
  READ_ONLY,
  summary,
  syntheticContract,
  syntheticInvoice,
  syntheticPurchaseOrder,
  syntheticQuotation,
} from './commercial-test-data.js';

const client: CommercialPickerOption = { id: CLIENT_ID, label: 'Synthetic Client', detail: null };

function missionQuotation() {
  const quotation = syntheticQuotation();
  return syntheticQuotation({
    recruitmentMissionId: MISSION_ID,
    display: { ...quotation.display, missionTitle: 'Synthetic Data Engineer' },
  });
}

describe('resolveCommercialAccess', () => {
  it('gives the Finance Manager every record type with writes and generation, but no mission or placement source', () => {
    const access = resolveCommercialAccess(FINANCE_MANAGER_PERMISSION_CODES);
    expect(visibleKinds(access)).toEqual(['quotation', 'purchaseOrder', 'invoice', 'contract']);
    expect(Object.values(access.manage).every(Boolean)).toBe(true);
    expect(Object.values(access.generate).every(Boolean)).toBe(true);
    expect(access.amounts).toBe(true);
    expect(access.pickClients).toBe(true);
    expect(access.pickMissions).toBe(false);
    expect(access.pickPlacements).toBe(false);
    expect(access.readOnly).toBe(false);
  });

  it('requires commercial data access for every write and generation', () => {
    const access = resolveCommercialAccess(
      OPERATOR.filter((code) => code !== 'commercial_data:access'),
    );
    expect(Object.values(access.manage).some(Boolean)).toBe(false);
    expect(Object.values(access.generate).some(Boolean)).toBe(false);
    expect(access.pickPlacements).toBe(false);
    expect(access.readOnly).toBe(true);
  });

  it('keeps read-only and limited accounts free of writes', () => {
    expect(resolveCommercialAccess(READ_ONLY).readOnly).toBe(true);
    const limited = resolveCommercialAccess(LIMITED);
    expect(visibleKinds(limited)).toEqual(['invoice']);
    expect(limited.amounts).toBe(false);
    expect(limited.readOnly).toBe(true);
  });

  it('scopes mission choices to assignments without transfer and needs every placement code', () => {
    expect(resolveCommercialAccess(OPERATOR).missionsAssignedOnly).toBe(false);
    expect(resolveCommercialAccess(OPERATOR).pickPlacements).toBe(true);
    const withoutTransfer = OPERATOR.filter((code) => code !== 'mission_candidates:transfer');
    expect(resolveCommercialAccess(withoutTransfer).missionsAssignedOnly).toBe(true);
    for (const code of [
      'placements:view',
      'placement_commercial_eligibility:view',
      'missions:view',
      'clients:view',
      'invoices:manage',
    ]) {
      const access = resolveCommercialAccess(OPERATOR.filter((item) => item !== code));
      expect(access.pickPlacements, code).toBe(false);
    }
  });
});

describe('lifecycle rules', () => {
  it('mirrors the server transition maps, with one primary action at most', () => {
    expect(lifecycleActions('quotation', 'DRAFT', false)).toEqual({
      primary: 'issue',
      secondary: ['cancel', 'archive'],
    });
    expect(lifecycleActions('quotation', 'ISSUED', false)).toEqual({
      primary: 'accept',
      secondary: ['reject', 'expire', 'cancel'],
    });
    expect(lifecycleActions('quotation', 'ACCEPTED', false)).toEqual({
      primary: null,
      secondary: ['archive'],
    });
    expect(lifecycleActions('contract', 'ACTIVE', false)).toEqual({
      primary: 'complete',
      secondary: ['cancel'],
    });
    // A received purchase order cannot be archived, and an issued invoice only canceled.
    expect(lifecycleActions('purchaseOrder', 'RECEIVED', false)).toEqual({
      primary: null,
      secondary: ['cancel'],
    });
    expect(lifecycleActions('invoice', 'ISSUED', false)).toEqual({
      primary: null,
      secondary: ['cancel'],
    });
    expect(lifecycleActions('invoice', 'DRAFT', true)).toEqual({ primary: null, secondary: [] });
    expect(lifecycleActions('contract', 'ARCHIVED', false)).toEqual({
      primary: null,
      secondary: [],
    });
  });

  it('confirms ending actions and requires a reason only for invoice cancellation', () => {
    expect(actionNeedsConfirmation('quotation', 'issue')).toBe(false);
    expect(actionNeedsConfirmation('invoice', 'issue')).toBe(true);
    for (const action of ['reject', 'expire', 'cancel', 'archive'] as const) {
      expect(actionNeedsConfirmation('quotation', action)).toBe(true);
    }
    expect(actionRequiresReason('invoice', 'cancel')).toBe(true);
    expect(actionRequiresReason('quotation', 'cancel')).toBe(false);
    expect(actionAcceptsReason('quotation', 'reject')).toBe(true);
    expect(actionAcceptsReason('contract', 'archive')).toBe(false);
    expect(actionAcceptsReason('invoice', 'issue')).toBe(false);
    expect(actionTargetStatus('receive')).toBe('RECEIVED');
    expect(actionTargetStatus('archive')).toBeNull();
  });

  it('offers follow-ups only from linkable states and gates generation by lifecycle', () => {
    expect(followUpKinds('quotation', 'ACCEPTED')).toEqual([
      'purchaseOrder',
      'invoice',
      'contract',
    ]);
    expect(followUpKinds('quotation', 'ISSUED')).toEqual([]);
    expect(followUpKinds('contract', 'ACTIVE')).toEqual(['purchaseOrder', 'invoice']);
    expect(followUpKinds('purchaseOrder', 'RECEIVED')).toEqual(['invoice']);
    expect(followUpKinds('invoice', 'ISSUED')).toEqual([]);
    expect(generationEligible('quotation', 'DRAFT')).toBe(false);
    expect(generationEligible('quotation', 'ISSUED')).toBe(true);
    expect(generationEligible('invoice', 'DRAFT')).toBe(false);
    expect(generationEligible('invoice', 'ISSUED')).toBe(true);
    expect(generationEligible('contract', 'CANCELED')).toBe(false);
    expect(generationEligible('purchaseOrder', 'RECEIVED')).toBe(true);
  });
});

describe('commercialChain', () => {
  it('lists the devis → commande → facture chain by reference, marking unreadable links', () => {
    const chain = commercialChain({ kind: 'invoice', record: syntheticInvoice() });
    expect(chain.map((link) => [link.kind, link.reference, link.linked, link.current])).toEqual([
      ['quotation', 'Q-SYN-001', true, false],
      ['contract', null, false, false],
      ['purchaseOrder', 'PO-SYN-001', true, false],
      ['invoice', 'INV-SYN-001', true, true],
    ]);
    const restricted = syntheticInvoice({
      display: { ...syntheticInvoice().display, linkedQuotationReference: null },
    });
    expect(commercialChain({ kind: 'invoice', record: restricted })[0]).toMatchObject({
      linked: true,
      reference: null,
    });
    expect(commercialChain({ kind: 'quotation', record: syntheticQuotation() })).toHaveLength(1);
  });
});

describe('list parameters', () => {
  it('trims and caps the reference, maps the client, and lists archived records for ARCHIVED', () => {
    expect(toListParameters({ page: 2, filters: EMPTY_LIST_FILTERS })).toEqual({
      includeArchived: false,
      page: 2,
      pageSize: 20,
    });
    expect(
      toListParameters({
        page: 1,
        filters: {
          ...EMPTY_LIST_FILTERS,
          client,
          reference: `  ${'R'.repeat(90)}  `,
          status: 'ARCHIVED',
        },
      }),
    ).toEqual({
      clientId: CLIENT_ID,
      includeArchived: true,
      page: 1,
      pageSize: 20,
      reference: 'R'.repeat(80),
      status: 'ARCHIVED',
    });
  });
});

describe('money and tax parsing', () => {
  it('converts typed major units to exact minor units with point or French comma', () => {
    expect(parseMoney('')).toEqual({ ok: true, cents: null });
    expect(parseMoney('0.10')).toEqual({ ok: true, cents: 10 });
    expect(parseMoney('1250,5')).toEqual({ ok: true, cents: 125050 });
    expect(parseMoney('12 000,00')).toEqual({ ok: true, cents: 1200000 });
    expect(parseMoney('12\u202f000')).toEqual({ ok: true, cents: 1200000 });
    expect(parseMoney('0.29')).toEqual({ ok: true, cents: 29 });
    expect(parseMoney('1.234')).toEqual({ ok: false });
    expect(parseMoney('-5')).toEqual({ ok: false });
    expect(parseMoney('1e3')).toEqual({ ok: false });
    expect(parseMoney('9'.repeat(20))).toEqual({ ok: false });
  });

  it('converts percentages to basis points within bounds', () => {
    expect(parseTaxRate('')).toBe(0);
    expect(parseTaxRate('20')).toBe(2000);
    expect(parseTaxRate('7,5')).toBe(750);
    expect(parseTaxRate('7.25')).toBe(725);
    expect(parseTaxRate('abc')).toBeNull();
    expect(parseTaxRate('1000')).toBeNull();
  });
});

describe('linked sources and derived context', () => {
  const quotationOption = sourceOption(summary(missionQuotation()));
  const contractOption = sourceOption(
    summary(syntheticContract({ recruitmentMissionId: MISSION_ID })),
  );
  const purchaseOrderOption = sourceOption(
    summary(syntheticPurchaseOrder({ recruitmentMissionId: MISSION_ID })),
  );

  it('labels sources by reference and carries their chain context', () => {
    expect(quotationOption).toMatchObject({
      id: QUOTATION_ID,
      label: 'Q-SYN-001',
      context: { recruitmentMissionId: MISSION_ID, currency: 'MAD' },
    });
    expect(purchaseOrderOption.context).toMatchObject({ quotationId: QUOTATION_ID });
  });

  it('prefills a follow-up with its client and source, never typed identifiers', () => {
    const values = followUpForm({ kind: 'quotation', record: syntheticQuotation() });
    expect(values.client).toEqual({ id: CLIENT_ID, label: 'Synthetic Client', detail: null });
    expect(values.quotation?.id).toBe(QUOTATION_ID);
    expect(values.currency).toBe('MAD');
    expect(values.reference).toBe('');
  });

  it('keeps the whole chain when following up a purchase order, by reference only', () => {
    const purchaseOrder = syntheticPurchaseOrder({
      contractId: CONTRACT_ID,
      display: {
        ...syntheticPurchaseOrder().display,
        linkedContractReference: 'C-SYN-001',
        linkedQuotationReference: 'Q-SYN-001',
      },
    });
    const values = followUpForm({ kind: 'purchaseOrder', record: purchaseOrder });
    expect(values.purchaseOrder?.id).toBe(PURCHASE_ORDER_ID);
    expect(values.quotation).toMatchObject({ id: QUOTATION_ID, label: 'Q-SYN-001' });
    expect(values.contract).toMatchObject({ id: CONTRACT_ID, label: 'C-SYN-001' });
    expect(deriveContext('invoice', { ...values, reference: 'INV' }).status).toBe('derived');
    const request = toCreateRequest('invoice', { ...values, reference: 'INV-CHAIN' });
    expect(request.ok && request.value.request).toMatchObject({
      contractId: CONTRACT_ID,
      purchaseOrderId: PURCHASE_ORDER_ID,
      quotationId: QUOTATION_ID,
    });

    // Without the reference the actor may not read that record type: never linked blind.
    const restricted = followUpForm({
      kind: 'purchaseOrder',
      record: syntheticPurchaseOrder({
        display: { ...syntheticPurchaseOrder().display, linkedQuotationReference: null },
      }),
    });
    expect(restricted.quotation).toBeNull();
    expect(restricted.contract).toBeNull();

    const fromContract = followUpForm({ kind: 'contract', record: syntheticContract() });
    expect(fromContract.contract?.id).toBe(CONTRACT_ID);
    expect(fromContract.quotation).toMatchObject({ id: QUOTATION_ID, label: 'Q-SYN-001' });
  });

  it('derives mission and currency from sources and reports disagreeing sources', () => {
    const values = { ...emptyCreateForm(), client, quotation: quotationOption };
    expect(deriveContext('invoice', values)).toMatchObject({
      status: 'derived',
      recruitmentMissionId: MISSION_ID,
      currency: 'MAD',
      from: 'quotation',
    });
    expect(deriveContext('quotation', values)).toEqual({ status: 'none' });

    expect(deriveContext('invoice', { ...values, purchaseOrder: purchaseOrderOption }).status).toBe(
      'derived',
    );
    expect(
      deriveContext('invoice', {
        ...values,
        purchaseOrder: {
          ...purchaseOrderOption,
          context: { ...purchaseOrderOption.context!, recruitmentMissionId: null },
        },
      }).status,
    ).toBe('conflict');

    const otherCurrency: CommercialPickerOption = {
      ...purchaseOrderOption,
      context: { ...purchaseOrderOption.context!, currency: 'EUR' },
    };
    expect(deriveContext('invoice', { ...values, purchaseOrder: otherCurrency }).status).toBe(
      'conflict',
    );

    const otherQuotation: CommercialPickerOption = {
      ...purchaseOrderOption,
      context: { ...purchaseOrderOption.context!, quotationId: QUOTATION_B_ID },
    };
    expect(deriveContext('invoice', { ...values, purchaseOrder: otherQuotation }).status).toBe(
      'conflict',
    );

    const sameContract: CommercialPickerOption = {
      ...purchaseOrderOption,
      context: { ...purchaseOrderOption.context!, contractId: CONTRACT_ID },
    };
    expect(
      deriveContext('invoice', { ...values, contract: contractOption, purchaseOrder: sameContract })
        .status,
    ).toBe('derived');

    const otherContract: CommercialPickerOption = {
      ...purchaseOrderOption,
      context: { ...purchaseOrderOption.context!, contractId: QUOTATION_B_ID },
    };
    expect(
      deriveContext('invoice', {
        ...values,
        contract: contractOption,
        purchaseOrder: otherContract,
      }).status,
    ).toBe('conflict');
  });
});

describe('toCreateRequest', () => {
  it('reports every missing field instead of sending a partial record', () => {
    const result = toCreateRequest('quotation', emptyCreateForm());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.reference).toBe('commercial.form.errors.reference');
    expect(result.errors.client).toBe('commercial.form.errors.client');
    expect(Object.values(result.errors)).toContain('commercial.form.errors.lineDescription');
    expect(Object.values(result.errors)).toContain('commercial.form.errors.linePrice');
  });

  it('builds a purchase order from its quotation with the derived mission and currency', () => {
    const result = toCreateRequest('purchaseOrder', {
      ...emptyCreateForm(),
      reference: ' PO-NEW ',
      client,
      quotation: sourceOption(summary(missionQuotation())),
      currency: 'EUR',
      amount: '1250,50',
    });
    expect(result).toEqual({
      ok: true,
      value: {
        kind: 'purchaseOrder',
        request: {
          amountCents: 125050,
          clientId: CLIENT_ID,
          currency: 'MAD',
          issueDate: undefined,
          quotationId: QUOTATION_ID,
          receivedDate: undefined,
          recruitmentMissionId: MISSION_ID,
          reference: 'PO-NEW',
          taxCents: 0,
        },
      },
    });
  });

  it('takes invoice lines from a linked source unless the actor types them', () => {
    const fromSource = toCreateRequest('invoice', {
      ...emptyCreateForm(),
      reference: 'INV-NEW',
      client,
      purchaseOrder: sourceOption(summary(syntheticPurchaseOrder())),
    });
    expect(fromSource.ok && fromSource.value.request).toMatchObject({
      purchaseOrderId: PURCHASE_ORDER_ID,
    });
    expect(fromSource.ok && 'lines' in fromSource.value.request).toBe(false);

    const placement = toCreateRequest('invoice', {
      ...emptyCreateForm(),
      reference: 'INV-PLACEMENT',
      client,
      placement: {
        id: PLACEMENT_ID,
        label: 'Synthetic Data Engineer',
        detail: null,
        context: {
          currency: null,
          missionTitle: 'Synthetic Data Engineer',
          recruitmentMissionId: MISSION_ID,
        },
      },
      lines: [{ key: 1, description: 'Fee', quantity: '2', unitPrice: '10', taxRate: '20' }],
    });
    expect(placement.ok && placement.value.request).toMatchObject({
      missionPlacementId: PLACEMENT_ID,
      recruitmentMissionId: MISSION_ID,
      lines: [{ description: 'Fee', quantity: 2, unitPriceCents: 1000, taxRateBps: 2000 }],
    });
  });

  it('refuses a mission on a training contract', () => {
    const result = toCreateRequest('contract', {
      ...emptyCreateForm(),
      reference: 'C-TRAINING',
      client,
      businessType: 'TRAINING',
      mission: { id: MISSION_ID, label: 'Synthetic Data Engineer', detail: null },
      amount: '100',
    });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors.context).toBe('commercial.form.errors.trainingMission');
  });
});

describe('commercialFailureKey', () => {
  it('maps stable API codes and statuses to localized copy, never server text', () => {
    const failure = (status: number, code: string | null) =>
      commercialFailureKey(new CommercialRequestError(status, code));
    expect(failure(409, 'QUOTATION_REFERENCE_EXISTS')).toBe(
      'commercial.feedback.failure.duplicateReference',
    );
    expect(failure(409, 'INVOICE_INVALID_TRANSITION')).toBe(
      'commercial.feedback.failure.lifecycle',
    );
    expect(failure(400, 'INVOICE_SOURCE_CHAIN_MISMATCH')).toBe('commercial.feedback.failure.chain');
    expect(failure(400, 'MISSION_TERMINAL')).toBe('commercial.feedback.failure.missionTerminal');
    expect(failure(404, null)).toBe('commercial.feedback.failure.notFound');
    expect(failure(403, null)).toBe('commercial.feedback.failure.forbidden');
    expect(failure(409, 'SOMETHING_NEW')).toBe('commercial.feedback.failure.lifecycle');
    expect(failure(500, null)).toBe('commercial.feedback.failure.generic');
    expect(commercialFailureKey(new Error('Synthetic server text'))).toBe(
      'commercial.feedback.failure.generic',
    );
  });
});
