import type {
  CommercialContractDetail,
  CommercialContractSummary,
  CommercialRecordDisplay,
  InvoiceDetail,
  InvoiceSummary,
  PurchaseOrderDetail,
  PurchaseOrderSummary,
  QuotationDetail,
  QuotationSummary,
} from '@hire-me/contracts';

import type { StatusTone } from '../ui/index.js';

/** The four commercial record types, in the order the workspace presents them. */
export type CommercialKind = 'quotation' | 'purchaseOrder' | 'invoice' | 'contract';

export type CommercialSummary =
  QuotationSummary | CommercialContractSummary | PurchaseOrderSummary | InvoiceSummary;

export type CommercialDetail =
  | { kind: 'quotation'; record: QuotationDetail }
  | { kind: 'contract'; record: CommercialContractDetail }
  | { kind: 'purchaseOrder'; record: PurchaseOrderDetail }
  | { kind: 'invoice'; record: InvoiceDetail };

export type CommercialStatus = CommercialSummary['status'];

/** Every lifecycle control the workspace can offer. Labels are presentation only. */
export type LifecycleAction =
  | 'issue'
  | 'accept'
  | 'reject'
  | 'expire'
  | 'cancel'
  | 'activate'
  | 'complete'
  | 'receive'
  | 'archive';

export type LifecycleActions = {
  primary: LifecycleAction | null;
  secondary: LifecycleAction[];
};

/**
 * The lifecycle controls a record offers, mirroring the server transition maps
 * in `commercial.service.ts`. The server stays authoritative: a stale screen
 * that offers a transition the record has left gets a localized conflict.
 */
export function lifecycleActions(
  kind: CommercialKind,
  status: CommercialStatus,
  archived: boolean,
): LifecycleActions {
  if (archived || status === 'ARCHIVED') return { primary: null, secondary: [] };
  switch (kind) {
    case 'quotation':
      if (status === 'DRAFT') return { primary: 'issue', secondary: ['cancel', 'archive'] };
      if (status === 'ISSUED') {
        return { primary: 'accept', secondary: ['reject', 'expire', 'cancel'] };
      }
      return { primary: null, secondary: ['archive'] };
    case 'contract':
      if (status === 'DRAFT') return { primary: 'activate', secondary: ['cancel', 'archive'] };
      if (status === 'ACTIVE') return { primary: 'complete', secondary: ['cancel'] };
      return { primary: null, secondary: ['archive'] };
    case 'purchaseOrder':
      if (status === 'DRAFT') return { primary: 'receive', secondary: ['cancel', 'archive'] };
      if (status === 'RECEIVED') return { primary: null, secondary: ['cancel'] };
      return { primary: null, secondary: ['archive'] };
    case 'invoice':
      if (status === 'DRAFT') return { primary: 'issue', secondary: ['cancel', 'archive'] };
      if (status === 'ISSUED') return { primary: null, secondary: ['cancel'] };
      return { primary: null, secondary: ['archive'] };
  }
}

/** Actions that end or hide a record ask for confirmation first. */
export function actionNeedsConfirmation(kind: CommercialKind, action: LifecycleAction): boolean {
  return (
    action === 'reject' ||
    action === 'expire' ||
    action === 'cancel' ||
    action === 'archive' ||
    (kind === 'invoice' && action === 'issue')
  );
}

/** Invoice cancellation is the only transition whose reason the API requires. */
export function actionRequiresReason(kind: CommercialKind, action: LifecycleAction): boolean {
  return kind === 'invoice' && action === 'cancel';
}

export function actionAcceptsReason(kind: CommercialKind, action: LifecycleAction): boolean {
  return action !== 'archive' && !(kind === 'invoice' && action === 'issue');
}

/** Status-endpoint target for an action (`archive` and invoice issue/cancel have their own routes). */
export function actionTargetStatus(action: LifecycleAction): string | null {
  switch (action) {
    case 'issue':
      return 'ISSUED';
    case 'accept':
      return 'ACCEPTED';
    case 'reject':
      return 'REJECTED';
    case 'expire':
      return 'EXPIRED';
    case 'cancel':
      return 'CANCELED';
    case 'activate':
      return 'ACTIVE';
    case 'complete':
      return 'COMPLETED';
    case 'receive':
      return 'RECEIVED';
    case 'archive':
      return null;
  }
}

/**
 * Records that can be created from this one, so the devis → commande → facture
 * chain reuses the preserved link instead of retyping it.
 */
export function followUpKinds(kind: CommercialKind, status: CommercialStatus): CommercialKind[] {
  if (kind === 'quotation' && status === 'ACCEPTED')
    return ['purchaseOrder', 'invoice', 'contract'];
  if (kind === 'contract' && status === 'ACTIVE') return ['purchaseOrder', 'invoice'];
  if (kind === 'purchaseOrder' && status === 'RECEIVED') return ['invoice'];
  return [];
}

/** Lifecycle states the document generation endpoints accept (unchanged from the legacy panel). */
export function generationEligible(kind: CommercialKind, status: CommercialStatus): boolean {
  switch (kind) {
    case 'quotation':
      return ['ISSUED', 'ACCEPTED', 'REJECTED', 'EXPIRED'].includes(status);
    case 'invoice':
      return status === 'ISSUED';
    case 'contract':
    case 'purchaseOrder':
      return status !== 'CANCELED' && status !== 'ARCHIVED';
  }
}

export function statusTone(status: CommercialStatus): StatusTone {
  switch (status) {
    case 'ACCEPTED':
    case 'ACTIVE':
    case 'COMPLETED':
    case 'RECEIVED':
      return 'success';
    case 'ISSUED':
      return 'info';
    case 'REJECTED':
    case 'CANCELED':
      return 'danger';
    case 'EXPIRED':
      return 'warning';
    case 'DRAFT':
    case 'ARCHIVED':
      return 'neutral';
  }
}

/** The date a list row leads with for each record type. */
export function primaryDate(kind: CommercialKind, record: CommercialSummary): string | null {
  switch (kind) {
    case 'contract':
      return (record as CommercialContractSummary).effectiveDate;
    case 'purchaseOrder':
      return (record as PurchaseOrderSummary).issueDate;
    case 'quotation':
      return (record as QuotationSummary).issueDate;
    case 'invoice':
      return (record as InvoiceSummary).issueDate;
  }
}

export type ChainLink = {
  kind: CommercialKind;
  reference: string | null;
  linked: boolean;
  current: boolean;
};

/**
 * The devis → commande → facture chain around one record, by human reference.
 * `linked` without a `reference` means the record has that link but the actor
 * may not view that record type, so only a restricted marker is shown.
 */
export function commercialChain(detail: CommercialDetail): ChainLink[] {
  const { display } = detail.record;
  const link = (
    kind: CommercialKind,
    id: string | null | undefined,
    reference: string | null,
  ): ChainLink => ({ kind, reference, linked: Boolean(id), current: false });
  const current = (kind: CommercialKind): ChainLink => ({
    kind,
    reference: detail.record.reference,
    linked: true,
    current: true,
  });
  switch (detail.kind) {
    case 'quotation':
      return [current('quotation')];
    case 'contract':
      return [
        link('quotation', detail.record.sourceQuotationId, display.linkedQuotationReference),
        current('contract'),
      ];
    case 'purchaseOrder':
      return [
        link('quotation', detail.record.quotationId, display.linkedQuotationReference),
        link('contract', detail.record.contractId, display.linkedContractReference),
        current('purchaseOrder'),
      ];
    case 'invoice':
      return [
        link('quotation', detail.record.quotationId, display.linkedQuotationReference),
        link('contract', detail.record.contractId, display.linkedContractReference),
        link('purchaseOrder', detail.record.purchaseOrderId, display.linkedPurchaseOrderReference),
        current('invoice'),
      ];
  }
}

export function hasMissionContext(record: { recruitmentMissionId: string | null }): boolean {
  return record.recruitmentMissionId !== null;
}

export type { CommercialRecordDisplay };
