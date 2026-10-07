import { createHash } from 'node:crypto';

/**
 * Deterministic fingerprint over exactly the authoritative values a financial output renders.
 * Shared by document generation (Issue #49) and signing staleness checks (Issue #141).
 */
export function fingerprintOf(parts: readonly (string | number | boolean | Date | null)[]): string {
  const canonical = parts.map((part) => {
    if (part === null) {
      return '\u0000null';
    }
    if (part instanceof Date) {
      return `\u0000date:${part.toISOString()}`;
    }
    return `\u0000${typeof part}:${String(part)}`;
  });
  return createHash('sha256').update(canonical.join('\u0001')).digest('hex');
}

export function quotationSourceFingerprint(quotation: {
  id: string;
  reference: string;
  status: string;
  clientId: string;
  recruitmentMissionId: string | null;
  currency: string;
  issueDate: Date | null;
  validUntil: Date | null;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  archivedAt: Date | null;
  client: { name: string };
  recruitmentMission: { title: string } | null;
  lines: {
    sortOrder: number;
    description: string;
    quantity: number;
    unitPriceCents: number;
    taxRateBps: number;
    lineSubtotalCents: number;
    lineTaxCents: number;
    lineTotalCents: number;
  }[];
}): string {
  return fingerprintOf([
    'COMMERCIAL_QUOTATION',
    quotation.id,
    quotation.reference,
    quotation.status,
    quotation.clientId,
    quotation.recruitmentMissionId,
    quotation.currency,
    quotation.issueDate,
    quotation.validUntil,
    quotation.subtotalCents,
    quotation.taxCents,
    quotation.totalCents,
    quotation.archivedAt,
    quotation.client.name,
    quotation.recruitmentMission?.title ?? null,
    quotation.lines.length,
    ...quotation.lines.flatMap((line) => [
      line.sortOrder,
      line.description,
      line.quantity,
      line.unitPriceCents,
      line.taxRateBps,
      line.lineSubtotalCents,
      line.lineTaxCents,
      line.lineTotalCents,
    ]),
  ]);
}

export function purchaseOrderSourceFingerprint(order: {
  id: string;
  reference: string;
  status: string;
  clientId: string;
  recruitmentMissionId: string | null;
  currency: string;
  amountCents: number;
  taxCents: number;
  totalCents: number;
  issueDate: Date | null;
  receivedDate: Date | null;
  archivedAt: Date | null;
  client: { name: string };
  recruitmentMission: { title: string } | null;
}): string {
  return fingerprintOf([
    'PURCHASE_ORDER',
    order.id,
    order.reference,
    order.status,
    order.clientId,
    order.recruitmentMissionId,
    order.currency,
    order.amountCents,
    order.taxCents,
    order.totalCents,
    order.issueDate,
    order.receivedDate,
    order.archivedAt,
    order.client.name,
    order.recruitmentMission?.title ?? null,
  ]);
}

export function commercialContractSourceFingerprint(contract: {
  id: string;
  reference: string;
  businessType: string;
  status: string;
  clientId: string;
  recruitmentMissionId: string | null;
  currency: string;
  contractValueCents: number;
  taxCents: number;
  totalCents: number;
  termsSummary: string | null;
  effectiveDate: Date | null;
  startDate: Date | null;
  endDate: Date | null;
  archivedAt: Date | null;
  client: { name: string };
  recruitmentMission: { title: string } | null;
}): string {
  return fingerprintOf([
    'COMMERCIAL_CONTRACT',
    contract.id,
    contract.reference,
    contract.businessType,
    contract.status,
    contract.clientId,
    contract.recruitmentMissionId,
    contract.currency,
    contract.contractValueCents,
    contract.taxCents,
    contract.totalCents,
    contract.termsSummary,
    contract.effectiveDate,
    contract.startDate,
    contract.endDate,
    contract.archivedAt,
    contract.client.name,
    contract.recruitmentMission?.title ?? null,
  ]);
}

export function invoiceSourceFingerprint(invoice: {
  id: string;
  reference: string;
  status: string;
  clientId: string;
  recruitmentMissionId: string | null;
  currency: string;
  issueDate: Date | null;
  dueDate: Date | null;
  issuedAt: Date | null;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  archivedAt: Date | null;
  client: { name: string };
  recruitmentMission: { title: string } | null;
  lines: {
    sortOrder: number;
    description: string;
    quantity: number;
    unitPriceCents: number;
    taxRateBps: number;
    lineSubtotalCents: number;
    lineTaxCents: number;
    lineTotalCents: number;
  }[];
}): string {
  return fingerprintOf([
    'INVOICE',
    invoice.id,
    invoice.reference,
    invoice.status,
    invoice.clientId,
    invoice.recruitmentMissionId,
    invoice.currency,
    invoice.issueDate,
    invoice.dueDate,
    invoice.issuedAt,
    invoice.subtotalCents,
    invoice.taxCents,
    invoice.totalCents,
    invoice.archivedAt,
    invoice.client.name,
    invoice.recruitmentMission?.title ?? null,
    invoice.lines.length,
    ...invoice.lines.flatMap((line) => [
      line.sortOrder,
      line.description,
      line.quantity,
      line.unitPriceCents,
      line.taxRateBps,
      line.lineSubtotalCents,
      line.lineTaxCents,
      line.lineTotalCents,
    ]),
  ]);
}
