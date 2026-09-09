import type { GenerationLanguage } from '@hire-me/contracts';

import type {
  CertificateView,
  ContractView,
  GenerationLineView,
  GenerationView,
  InvoiceView,
  PurchaseOrderView,
  QuotationView,
} from './generation-view-models.js';
import type { RenderableBlock, RenderableDocument } from './renderable-document.js';
import { formatDate, formatMoney, sanitizeText } from './renderable-document.js';

/**
 * Code-owned template registry.
 *
 * Templates are ordinary TypeScript functions that map a typed view model onto the
 * neutral renderable document. Nothing is uploaded, interpreted, evaluated, or fetched:
 * there is no template language, no HTML, no expression evaluation, and no remote
 * reference, so a template can never execute caller-controlled content.
 *
 * `templateId` and `version` are recorded on every generated version. Changing a
 * template raises its `version` and only affects outputs generated afterwards; an
 * already-generated historical file and its recorded provenance never change.
 */

export type GenerationTemplate<TView extends GenerationView = GenerationView> = {
  templateId: string;
  version: number;
  sourceType: TView['kind'];
  languages: readonly GenerationLanguage[];
  build(view: TView, language: GenerationLanguage): RenderableDocument;
};

type LabelKey =
  | 'quotation'
  | 'purchaseOrder'
  | 'recruitmentContract'
  | 'trainingContract'
  | 'invoice'
  | 'certificate'
  | 'reference'
  | 'client'
  | 'mission'
  | 'status'
  | 'issueDate'
  | 'validUntil'
  | 'dueDate'
  | 'receivedDate'
  | 'effectiveDate'
  | 'startDate'
  | 'endDate'
  | 'lines'
  | 'description'
  | 'quantity'
  | 'unitPrice'
  | 'taxRate'
  | 'lineTotal'
  | 'subtotal'
  | 'tax'
  | 'total'
  | 'amount'
  | 'terms'
  | 'summary'
  | 'participant'
  | 'program'
  | 'completedOn'
  | 'certificateBody'
  | 'footer';

const labels: Record<GenerationLanguage, Record<LabelKey, string>> = {
  en: {
    quotation: 'Quotation',
    purchaseOrder: 'Purchase order',
    recruitmentContract: 'Recruitment contract',
    trainingContract: 'Training contract',
    invoice: 'Invoice',
    certificate: 'Training certificate',
    reference: 'Reference',
    client: 'Client',
    mission: 'Recruitment mission',
    status: 'Status',
    issueDate: 'Issue date',
    validUntil: 'Valid until',
    dueDate: 'Due date',
    receivedDate: 'Received date',
    effectiveDate: 'Effective date',
    startDate: 'Start date',
    endDate: 'End date',
    lines: 'Lines',
    description: 'Description',
    quantity: 'Qty',
    unitPrice: 'Unit price',
    taxRate: 'Tax rate',
    lineTotal: 'Line total',
    subtotal: 'Subtotal',
    tax: 'Tax',
    total: 'Total',
    amount: 'Amount',
    terms: 'Terms',
    summary: 'Summary',
    participant: 'Participant',
    program: 'Training programme',
    completedOn: 'Completed on',
    certificateBody: 'This certifies that the participant completed the training programme.',
    footer: 'Generated from the authoritative business record. Amounts are shown per currency.',
  },
  fr: {
    quotation: 'Devis',
    purchaseOrder: 'Bon de commande',
    recruitmentContract: 'Contrat de recrutement',
    trainingContract: 'Contrat de formation',
    invoice: 'Facture',
    certificate: 'Attestation de formation',
    reference: 'Reference',
    client: 'Client',
    mission: 'Mission de recrutement',
    status: 'Statut',
    issueDate: "Date d'emission",
    validUntil: "Valable jusqu'au",
    dueDate: "Date d'echeance",
    receivedDate: 'Date de reception',
    effectiveDate: "Date d'effet",
    startDate: 'Date de debut',
    endDate: 'Date de fin',
    lines: 'Lignes',
    description: 'Designation',
    quantity: 'Qte',
    unitPrice: 'Prix unitaire',
    taxRate: 'Taux de taxe',
    lineTotal: 'Total ligne',
    subtotal: 'Sous-total',
    tax: 'Taxe',
    total: 'Total',
    amount: 'Montant',
    terms: 'Conditions',
    summary: 'Resume',
    participant: 'Participant',
    program: 'Programme de formation',
    completedOn: 'Termine le',
    certificateBody: 'La presente atteste que le participant a termine le programme de formation.',
    footer: 'Genere a partir du document commercial de reference. Les montants restent par devise.',
  },
};

function partyBlock(
  language: GenerationLanguage,
  party: { clientName: string; missionTitle: string | null },
): RenderableBlock {
  const label = labels[language];
  const rows = [{ label: label.client, value: sanitizeText(party.clientName) }];
  if (party.missionTitle) {
    rows.push({ label: label.mission, value: sanitizeText(party.missionTitle) });
  }
  return { kind: 'keyValues', rows };
}

function lineTable(
  language: GenerationLanguage,
  currency: string,
  lines: readonly GenerationLineView[],
): RenderableBlock {
  const label = labels[language];
  return {
    kind: 'table',
    columns: [label.description, label.quantity, label.unitPrice, label.taxRate, label.lineTotal],
    rows: lines.map((line) => [
      sanitizeText(line.description),
      String(line.quantity),
      formatMoney(line.unitPriceCents, currency),
      `${(line.taxRateBps / 100).toFixed(2)}%`,
      formatMoney(line.lineTotalCents, currency),
    ]),
  };
}

function totalsBlock(
  language: GenerationLanguage,
  currency: string,
  totals: { subtotalCents: number; taxCents: number; totalCents: number },
): RenderableBlock {
  const label = labels[language];
  return {
    kind: 'keyValues',
    rows: [
      { label: label.subtotal, value: formatMoney(totals.subtotalCents, currency) },
      { label: label.tax, value: formatMoney(totals.taxCents, currency) },
      { label: label.total, value: formatMoney(totals.totalCents, currency) },
    ],
  };
}

const quotationTemplate: GenerationTemplate<QuotationView> = {
  templateId: 'commercial.quotation',
  version: 1,
  sourceType: 'COMMERCIAL_QUOTATION',
  languages: ['fr', 'en'],
  build(view, language) {
    const label = labels[language];
    return {
      title: `${label.quotation} ${sanitizeText(view.reference)}`,
      subtitle: `${label.status}: ${sanitizeText(view.status)}`,
      blocks: [
        partyBlock(language, view.party),
        {
          kind: 'keyValues',
          rows: [
            { label: label.issueDate, value: formatDate(view.issueDate) },
            { label: label.validUntil, value: formatDate(view.validUntil) },
          ],
        },
        { kind: 'heading', text: label.lines },
        lineTable(language, view.currency, view.lines),
        totalsBlock(language, view.currency, view),
      ],
      footer: label.footer,
    };
  },
};

const purchaseOrderTemplate: GenerationTemplate<PurchaseOrderView> = {
  templateId: 'commercial.purchase-order',
  version: 1,
  sourceType: 'PURCHASE_ORDER',
  languages: ['fr', 'en'],
  build(view, language) {
    const label = labels[language];
    return {
      title: `${label.purchaseOrder} ${sanitizeText(view.reference)}`,
      subtitle: `${label.status}: ${sanitizeText(view.status)}`,
      blocks: [
        partyBlock(language, view.party),
        {
          kind: 'keyValues',
          rows: [
            { label: label.issueDate, value: formatDate(view.issueDate) },
            { label: label.receivedDate, value: formatDate(view.receivedDate) },
          ],
        },
        { kind: 'heading', text: label.summary },
        {
          kind: 'keyValues',
          rows: [
            { label: label.amount, value: formatMoney(view.amountCents, view.currency) },
            { label: label.tax, value: formatMoney(view.taxCents, view.currency) },
            { label: label.total, value: formatMoney(view.totalCents, view.currency) },
          ],
        },
      ],
      footer: label.footer,
    };
  },
};

const contractTemplate: GenerationTemplate<ContractView> = {
  templateId: 'commercial.contract',
  version: 1,
  sourceType: 'COMMERCIAL_CONTRACT',
  languages: ['fr', 'en'],
  build(view, language) {
    const label = labels[language];
    const heading =
      view.businessType === 'RECRUITMENT' ? label.recruitmentContract : label.trainingContract;
    const blocks: RenderableBlock[] = [
      partyBlock(language, view.party),
      {
        kind: 'keyValues',
        rows: [
          { label: label.effectiveDate, value: formatDate(view.effectiveDate) },
          { label: label.startDate, value: formatDate(view.startDate) },
          { label: label.endDate, value: formatDate(view.endDate) },
        ],
      },
      { kind: 'heading', text: label.summary },
      {
        kind: 'keyValues',
        rows: [
          { label: label.amount, value: formatMoney(view.contractValueCents, view.currency) },
          { label: label.tax, value: formatMoney(view.taxCents, view.currency) },
          { label: label.total, value: formatMoney(view.totalCents, view.currency) },
        ],
      },
    ];
    if (view.termsSummary) {
      blocks.push({ kind: 'heading', text: label.terms });
      blocks.push({ kind: 'paragraph', text: sanitizeText(view.termsSummary) });
    }
    return {
      title: `${heading} ${sanitizeText(view.reference)}`,
      subtitle: `${label.status}: ${sanitizeText(view.status)}`,
      blocks,
      footer: label.footer,
    };
  },
};

const invoiceTemplate: GenerationTemplate<InvoiceView> = {
  templateId: 'commercial.invoice',
  version: 1,
  sourceType: 'INVOICE',
  languages: ['fr', 'en'],
  build(view, language) {
    const label = labels[language];
    return {
      title: `${label.invoice} ${sanitizeText(view.reference)}`,
      subtitle: `${label.status}: ${sanitizeText(view.status)}`,
      blocks: [
        partyBlock(language, view.party),
        {
          kind: 'keyValues',
          rows: [
            { label: label.issueDate, value: formatDate(view.issueDate) },
            { label: label.dueDate, value: formatDate(view.dueDate) },
          ],
        },
        { kind: 'heading', text: label.lines },
        lineTable(language, view.currency, view.lines),
        totalsBlock(language, view.currency, view),
      ],
      footer: label.footer,
    };
  },
};

const certificateTemplate: GenerationTemplate<CertificateView> = {
  templateId: 'training.certificate',
  version: 1,
  sourceType: 'TRAINING_ENROLLMENT',
  languages: ['fr', 'en'],
  build(view, language) {
    const label = labels[language];
    const rows = [
      { label: label.participant, value: sanitizeText(view.participantName) },
      { label: label.program, value: sanitizeText(view.programName) },
      { label: label.reference, value: sanitizeText(view.programReference) },
      { label: label.completedOn, value: formatDate(view.completedAt) },
    ];
    if (view.clientName) {
      rows.push({ label: label.client, value: sanitizeText(view.clientName) });
    }
    return {
      title: label.certificate,
      subtitle: sanitizeText(view.reference),
      blocks: [
        { kind: 'paragraph', text: label.certificateBody },
        { kind: 'keyValues', rows },
      ],
      // A certificate carries no commercial amounts, so the money footer does not apply.
      footer: null,
    };
  },
};

const templates = [
  quotationTemplate,
  purchaseOrderTemplate,
  contractTemplate,
  invoiceTemplate,
  certificateTemplate,
] as const;

const templatesBySource = new Map<GenerationView['kind'], GenerationTemplate>(
  templates.map((template) => [template.sourceType, template as GenerationTemplate]),
);

/** Resolves the single registered template for one source family. */
export function resolveTemplate(sourceType: GenerationView['kind']): GenerationTemplate {
  const template = templatesBySource.get(sourceType);
  if (!template) {
    throw new Error(`No generation template is registered for ${sourceType}.`);
  }
  return template;
}

export const registeredTemplates = templates;
