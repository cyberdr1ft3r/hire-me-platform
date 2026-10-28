import type {
  CommercialContractStatus,
  DocumentGenerationRequest,
  DocumentGenerationResponse,
  InvoiceBusinessDetailsInput,
  InvoiceStatus,
  PurchaseOrderStatus,
  QuotationStatus,
} from '@hire-me/contracts';

import {
  archiveCommercialContract,
  archiveInvoice,
  archivePurchaseOrder,
  archiveQuotation,
  cancelInvoice,
  createCommercialContract,
  createInvoice,
  createPurchaseOrder,
  createQuotation,
  generateContractDocument,
  generateInvoiceDocument,
  generatePurchaseOrderDocument,
  generateQuotationDocument,
  getCommercialContract,
  getInvoice,
  getPurchaseOrder,
  getQuotation,
  issueInvoice,
  updateInvoice,
  listCommercialContracts,
  listInvoices,
  listPurchaseOrders,
  listQuotations,
  updateCommercialContractStatus,
  updatePurchaseOrderStatus,
  updateQuotationStatus,
} from '../api.js';
import { dateInputStartIso } from '../tasks/task-datetime.js';
import {
  actionTargetStatus,
  type CommercialDetail,
  type CommercialKind,
  type CommercialStatus,
  type CommercialSummary,
  type LifecycleAction,
} from './commercial-kinds.js';
import type { CreateRequest } from './commercial-state.js';

/**
 * One adapter over the four per-type Commercial endpoints, so the workspace
 * treats quotations, purchase orders, invoices, and contracts alike. Every call
 * is a plain request to the existing API; nothing here decides authorization.
 */

export type CommercialPage = {
  items: CommercialSummary[];
  page: number;
  pageSize: number;
  total: number;
};

export type CommercialListParameters = {
  page: number;
  pageSize: number;
  reference?: string;
  clientId?: string;
  status?: CommercialStatus;
  includeArchived?: boolean;
};

export async function fetchCommercialList(
  accessToken: string,
  kind: CommercialKind,
  parameters: CommercialListParameters,
): Promise<CommercialPage> {
  switch (kind) {
    case 'quotation': {
      const response = await listQuotations(accessToken, {
        ...parameters,
        status: parameters.status as QuotationStatus | undefined,
      });
      return { items: response.quotations, ...response.pagination };
    }
    case 'contract': {
      const response = await listCommercialContracts(accessToken, {
        ...parameters,
        status: parameters.status as CommercialContractStatus | undefined,
      });
      return { items: response.contracts, ...response.pagination };
    }
    case 'purchaseOrder': {
      const response = await listPurchaseOrders(accessToken, {
        ...parameters,
        status: parameters.status as PurchaseOrderStatus | undefined,
      });
      return { items: response.purchaseOrders, ...response.pagination };
    }
    case 'invoice': {
      const response = await listInvoices(accessToken, {
        ...parameters,
        status: parameters.status as InvoiceStatus | undefined,
      });
      return { items: response.invoices, ...response.pagination };
    }
  }
}

export async function fetchCommercialDetail(
  accessToken: string,
  kind: CommercialKind,
  id: string,
): Promise<CommercialDetail> {
  switch (kind) {
    case 'quotation':
      return { kind, record: (await getQuotation(accessToken, id)).quotation };
    case 'contract':
      return { kind, record: (await getCommercialContract(accessToken, id)).contract };
    case 'purchaseOrder':
      return { kind, record: (await getPurchaseOrder(accessToken, id)).purchaseOrder };
    case 'invoice':
      return { kind, record: (await getInvoice(accessToken, id)).invoice };
  }
}

export async function createCommercialRecord(
  accessToken: string,
  create: CreateRequest,
): Promise<CommercialDetail> {
  switch (create.kind) {
    case 'quotation':
      return {
        kind: create.kind,
        record: (await createQuotation(accessToken, create.request)).quotation,
      };
    case 'contract':
      return {
        kind: create.kind,
        record: (await createCommercialContract(accessToken, create.request)).contract,
      };
    case 'purchaseOrder':
      return {
        kind: create.kind,
        record: (await createPurchaseOrder(accessToken, create.request)).purchaseOrder,
      };
    case 'invoice':
      return {
        kind: create.kind,
        record: (await createInvoice(accessToken, create.request)).invoice,
      };
  }
}

export type LifecycleInput = {
  reason?: string;
  /** `YYYY-MM-DD` from a date input; invoice issue only. */
  issueDate?: string;
  dueDate?: string;
  businessDetails?: InvoiceBusinessDetailsInput;
  includeFrenchAmountInWords?: boolean;
};

export type ManualInvoiceClientUpdate = {
  name: string;
  address?: string;
  ice?: string;
  taxId?: string;
};

export async function updateManualInvoiceClient(
  accessToken: string,
  invoiceId: string,
  manualClient: ManualInvoiceClientUpdate,
): Promise<CommercialDetail> {
  return {
    kind: 'invoice',
    record: (await updateInvoice(accessToken, invoiceId, { manualClient })).invoice,
  };
}

function optionalReason(input: LifecycleInput): string | undefined {
  const reason = input.reason?.trim();
  return reason ? reason.slice(0, 500) : undefined;
}

export async function runCommercialAction(
  accessToken: string,
  kind: CommercialKind,
  id: string,
  action: LifecycleAction,
  input: LifecycleInput,
): Promise<CommercialDetail> {
  const reason = optionalReason(input);
  if (action === 'archive') {
    switch (kind) {
      case 'quotation':
        return { kind, record: (await archiveQuotation(accessToken, id)).quotation };
      case 'contract':
        return { kind, record: (await archiveCommercialContract(accessToken, id)).contract };
      case 'purchaseOrder':
        return { kind, record: (await archivePurchaseOrder(accessToken, id)).purchaseOrder };
      case 'invoice':
        return { kind, record: (await archiveInvoice(accessToken, id)).invoice };
    }
  }
  if (kind === 'invoice') {
    if (action === 'issue') {
      const { businessDetails, dueDate, issueDate } = input;
      if (!issueDate || !dueDate || !businessDetails) {
        throw new Error('Invoice issue details are required.');
      }
      const issueDateIso = dateInputStartIso(issueDate);
      const dueDateIso = dateInputStartIso(dueDate);
      if (!issueDateIso || !dueDateIso) {
        throw new Error('Invoice issue dates are invalid.');
      }
      const response = await issueInvoice(accessToken, id, {
        issueDate: issueDateIso,
        dueDate: dueDateIso,
        businessDetails,
        includeFrenchAmountInWords: input.includeFrenchAmountInWords ?? false,
      });
      return { kind, record: response.invoice };
    }
    if (action === 'cancel') {
      return {
        kind,
        record: (await cancelInvoice(accessToken, id, { reason: reason ?? '' })).invoice,
      };
    }
    throw new Error(`Unsupported invoice action ${action}`);
  }
  const status = actionTargetStatus(action);
  if (!status) throw new Error(`Unsupported action ${action}`);
  const body = { status, ...(reason ? { reason } : {}) };
  switch (kind) {
    case 'quotation':
      return {
        kind,
        record: (
          await updateQuotationStatus(
            accessToken,
            id,
            body as Parameters<typeof updateQuotationStatus>[2],
          )
        ).quotation,
      };
    case 'contract':
      return {
        kind,
        record: (
          await updateCommercialContractStatus(
            accessToken,
            id,
            body as Parameters<typeof updateCommercialContractStatus>[2],
          )
        ).contract,
      };
    case 'purchaseOrder':
      return {
        kind,
        record: (
          await updatePurchaseOrderStatus(
            accessToken,
            id,
            body as Parameters<typeof updatePurchaseOrderStatus>[2],
          )
        ).purchaseOrder,
      };
  }
}

export function generateCommercialDocument(
  accessToken: string,
  kind: CommercialKind,
  id: string,
  body: DocumentGenerationRequest,
  invoicePurpose: 'ISSUED' | 'DRAFT_PREVIEW' = 'ISSUED',
): Promise<DocumentGenerationResponse> {
  switch (kind) {
    case 'quotation':
      return generateQuotationDocument(accessToken, id, body);
    case 'contract':
      return generateContractDocument(accessToken, id, body);
    case 'purchaseOrder':
      return generatePurchaseOrderDocument(accessToken, id, body);
    case 'invoice':
      return generateInvoiceDocument(accessToken, id, { ...body, purpose: invoicePurpose });
  }
}
