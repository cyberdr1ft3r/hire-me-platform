/**
 * Typed view models for generated business outputs.
 *
 * Each one is built server-side from a single authoritative record snapshot before
 * rendering starts. Templates and renderers receive only these values and never query
 * the database themselves, so a rendered output can never disagree with the record it
 * claims to represent and no renderer can widen its own read scope.
 */

export type GenerationParty = {
  clientName: string;
  missionTitle: string | null;
};

export type GenerationLineView = {
  description: string;
  quantity: number;
  unitPriceCents: number;
  taxRateBps: number;
  lineSubtotalCents: number;
  lineTaxCents: number;
  lineTotalCents: number;
};

export type QuotationView = {
  kind: 'COMMERCIAL_QUOTATION';
  reference: string;
  status: string;
  currency: string;
  issueDate: Date | null;
  validUntil: Date | null;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  lines: GenerationLineView[];
  party: GenerationParty;
};

export type PurchaseOrderView = {
  kind: 'PURCHASE_ORDER';
  reference: string;
  status: string;
  currency: string;
  amountCents: number;
  taxCents: number;
  totalCents: number;
  issueDate: Date | null;
  receivedDate: Date | null;
  party: GenerationParty;
};

export type ContractView = {
  kind: 'COMMERCIAL_CONTRACT';
  reference: string;
  businessType: 'RECRUITMENT' | 'TRAINING';
  status: string;
  currency: string;
  contractValueCents: number;
  taxCents: number;
  totalCents: number;
  termsSummary: string | null;
  effectiveDate: Date | null;
  startDate: Date | null;
  endDate: Date | null;
  party: GenerationParty;
};

export type InvoiceView = {
  kind: 'INVOICE';
  reference: string;
  status: string;
  currency: string;
  issueDate: Date | null;
  dueDate: Date | null;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  lines: GenerationLineView[];
  party: GenerationParty;
  seller: {
    legalName: string;
    legalForm: string | null;
    capital: string | null;
    address: string;
    ice: string | null;
    taxId: string | null;
    registrationNumber: string | null;
    patente: string | null;
    phone: string | null;
    email: string | null;
    website: string | null;
  };
  buyer: {
    type: 'COMPANY' | 'INDIVIDUAL';
    legalName: string;
    address: string | null;
    ice: string | null;
    taxId: string | null;
    billingContact: string | null;
  };
  customerReference: string | null;
  paymentTerms: string;
  paymentMethod: string | null;
  bankDetails: string | null;
  taxTreatment: string | null;
  totalAmountInWordsFr: string | null;
  commercialReferences: {
    quotation: string | null;
    contract: string | null;
    purchaseOrder: string | null;
  };
};

export type CertificateView = {
  kind: 'TRAINING_ENROLLMENT';
  reference: string;
  participantName: string;
  programReference: string;
  programName: string;
  completedAt: Date | null;
  clientName: string | null;
};

export type GenerationView =
  QuotationView | PurchaseOrderView | ContractView | InvoiceView | CertificateView;
