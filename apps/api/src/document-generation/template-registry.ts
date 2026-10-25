import type { GenerationLanguage } from '@hire-me/contracts';

import type {
  CertificateView,
  ContractView,
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
  | 'footer'
  | 'seller'
  | 'billedClient'
  | 'legalForm'
  | 'capital'
  | 'address'
  | 'ice'
  | 'taxId'
  | 'registrationNumber'
  | 'patente'
  | 'phone'
  | 'email'
  | 'website'
  | 'billingContact'
  | 'customerReference'
  | 'payment'
  | 'paymentMethod'
  | 'bankDetails'
  | 'taxTreatment'
  | 'commercialReferences'
  | 'quotationReference'
  | 'contractReference'
  | 'purchaseOrderReference'
  | 'invoiceSubtotal'
  | 'invoiceTax'
  | 'invoiceTotal'
  | 'amountInWords';

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
    seller: 'Seller',
    billedClient: 'Billed client',
    legalForm: 'Legal form',
    capital: 'Share capital',
    address: 'Address',
    ice: 'ICE',
    taxId: 'Tax identifier',
    registrationNumber: 'Commercial register',
    patente: 'Business tax (PT)',
    phone: 'Phone',
    email: 'Email',
    website: 'Website',
    billingContact: 'Billing contact',
    customerReference: 'Customer reference',
    payment: 'Payment',
    paymentMethod: 'Method',
    bankDetails: 'Bank details',
    taxTreatment: 'Tax treatment',
    commercialReferences: 'Commercial references',
    quotationReference: 'Quotation',
    contractReference: 'Contract',
    purchaseOrderReference: 'Purchase order',
    invoiceSubtotal: 'Subtotal excl. tax',
    invoiceTax: 'Tax',
    invoiceTotal: 'Total incl. tax',
    amountInWords: 'Amount in words',
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
    issueDate: "Date d'émission",
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
    footer: 'Généré à partir du document commercial de référence. Les montants restent par devise.',
    seller: 'Émetteur',
    billedClient: 'Client facturé',
    legalForm: 'Forme juridique',
    capital: 'Capital social',
    address: 'Adresse',
    ice: 'ICE',
    taxId: 'Identifiant fiscal',
    registrationNumber: 'Registre du commerce',
    patente: 'Patente / PT',
    phone: 'Téléphone',
    email: 'E-mail',
    website: 'Site web',
    billingContact: 'Contact facturation',
    customerReference: 'Référence client',
    payment: 'Règlement',
    paymentMethod: 'Mode',
    bankDetails: 'Coordonnées bancaires',
    taxTreatment: 'Traitement fiscal',
    commercialReferences: 'Références commerciales',
    quotationReference: 'Devis',
    contractReference: 'Contrat',
    purchaseOrderReference: 'Bon de commande',
    invoiceSubtotal: 'Sous-total HT',
    invoiceTax: 'TVA / taxe',
    invoiceTotal: 'Total TTC',
    amountInWords: 'Arrêtée la présente facture à la somme de',
  },
};

function invoiceDate(value: Date | null | undefined, language: GenerationLanguage): string {
  if (!value) {
    return '';
  }
  const iso = value.toISOString().slice(0, 10);
  if (language === 'en') {
    return iso;
  }
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
}

function invoiceMoney(cents: number, currency: string, language: GenerationLanguage): string {
  const negative = cents < 0;
  const absolute = Math.abs(cents);
  const major = String(Math.trunc(absolute / 100)).replace(
    /\B(?=(\d{3})+(?!\d))/g,
    language === 'fr' ? ' ' : ',',
  );
  const minor = String(absolute % 100).padStart(2, '0');
  return `${negative ? '-' : ''}${major}${language === 'fr' ? ',' : '.'}${minor} ${sanitizeText(currency)}`;
}

function invoiceFooter(
  view: InvoiceView,
  language: GenerationLanguage,
  defaultFooter: string,
): string {
  const identifiers = [
    view.seller.legalName,
    view.seller.legalForm,
    view.seller.capital
      ? `${language === 'fr' ? 'Capital' : 'Capital'}: ${view.seller.capital}`
      : null,
    view.seller.registrationNumber
      ? `${language === 'fr' ? 'RC' : 'CR'}: ${view.seller.registrationNumber}`
      : null,
    view.seller.taxId ? `${language === 'fr' ? 'IF' : 'Tax ID'}: ${view.seller.taxId}` : null,
    view.seller.ice ? `ICE: ${view.seller.ice}` : null,
    view.seller.patente ? `PT: ${view.seller.patente}` : null,
  ]
    .filter((value): value is string => Boolean(value))
    .map(sanitizeText);
  return identifiers.length > 0 ? `${defaultFooter} ${identifiers.join(' · ')}` : defaultFooter;
}

function commercialStatus(status: string, language: GenerationLanguage): string {
  const translations: Record<string, { fr: string; en: string }> = {
    ACCEPTED: { fr: 'Accepté', en: 'Accepted' },
    DRAFT: { fr: 'Brouillon', en: 'Draft' },
    EXPIRED: { fr: 'Expiré', en: 'Expired' },
    ISSUED: { fr: 'Émise', en: 'Issued' },
    REJECTED: { fr: 'Refusé', en: 'Rejected' },
    SENT: { fr: 'Envoyé', en: 'Sent' },
  };
  return translations[status]?.[language] ?? sanitizeText(status);
}

function commercialTaxLabel(
  lines: readonly { taxRateBps: number }[],
  language: GenerationLanguage,
): string {
  const rates = [...new Set(lines.map((line) => line.taxRateBps))];
  if (rates.length !== 1) {
    return language === 'fr' ? 'TVA / taxe' : 'Tax';
  }
  const rate = rates[0]! / 100;
  return language === 'fr' ? `TVA (${rate.toFixed(2).replace('.00', '')} %)` : `Tax (${rate}%)`;
}

function invoiceTaxLabel(view: InvoiceView, language: GenerationLanguage): string {
  return commercialTaxLabel(view.lines, language);
}

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

const quotationTemplate: GenerationTemplate<QuotationView> = {
  templateId: 'commercial.quotation',
  version: 2,
  sourceType: 'COMMERCIAL_QUOTATION',
  languages: ['fr', 'en'],
  build(view, language) {
    const label = labels[language];
    const clientRows = [{ label: label.client, value: sanitizeText(view.party.clientName) }];
    if (view.party.missionTitle) {
      clientRows.push({ label: label.mission, value: sanitizeText(view.party.missionTitle) });
    }
    return {
      title: `${label.quotation} ${sanitizeText(view.reference)}`,
      subtitle: commercialStatus(view.status, language),
      blocks: [
        {
          kind: 'panelGrid',
          panels: [{ heading: label.client, rows: clientRows }],
        },
        {
          kind: 'table',
          columns: [
            language === 'fr' ? 'Désignation' : label.description,
            language === 'fr' ? 'Qté' : label.quantity,
            language === 'fr' ? 'Prix unit. HT' : 'Unit price excl. tax',
            language === 'fr' ? 'TVA' : 'Tax',
            language === 'fr' ? 'Total HT' : 'Total excl. tax',
          ],
          rows: view.lines.map((line) => [
            sanitizeText(line.description),
            String(line.quantity),
            invoiceMoney(line.unitPriceCents, view.currency, language),
            `${(line.taxRateBps / 100).toFixed(2).replace('.00', '')}${language === 'fr' ? ' %' : '%'}`,
            invoiceMoney(line.lineSubtotalCents, view.currency, language),
          ]),
        },
        {
          kind: 'totals',
          rows: [
            {
              label: language === 'fr' ? 'Sous-total HT' : 'Subtotal excl. tax',
              value: invoiceMoney(view.subtotalCents, view.currency, language),
            },
            {
              label: commercialTaxLabel(view.lines, language),
              value: invoiceMoney(view.taxCents, view.currency, language),
            },
            {
              label: language === 'fr' ? 'TOTAL TTC' : 'TOTAL INCL. TAX',
              value: invoiceMoney(view.totalCents, view.currency, language),
            },
          ],
        },
      ],
      footer: label.footer,
      presentation: {
        kind: 'hireme-commercial',
        documentLabel: label.quotation.toUpperCase(),
        reference: sanitizeText(view.reference),
        status: commercialStatus(view.status, language),
        details: [
          { label: label.issueDate, value: invoiceDate(view.issueDate, language) },
          { label: label.validUntil, value: invoiceDate(view.validUntil, language) },
        ],
      },
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
  version: 5,
  sourceType: 'INVOICE',
  languages: ['fr', 'en'],
  build(view, language) {
    const label = labels[language];
    const sellerRows = [
      { label: label.seller, value: sanitizeText(view.seller.legalName) },
      ...(view.seller.legalForm
        ? [{ label: label.legalForm, value: sanitizeText(view.seller.legalForm) }]
        : []),
      ...(view.seller.capital
        ? [{ label: label.capital, value: sanitizeText(view.seller.capital) }]
        : []),
      { label: label.address, value: sanitizeText(view.seller.address) },
      ...(view.seller.ice ? [{ label: label.ice, value: sanitizeText(view.seller.ice) }] : []),
      ...(view.seller.taxId
        ? [{ label: label.taxId, value: sanitizeText(view.seller.taxId) }]
        : []),
      ...(view.seller.registrationNumber
        ? [
            {
              label: label.registrationNumber,
              value: sanitizeText(view.seller.registrationNumber),
            },
          ]
        : []),
      ...(view.seller.patente
        ? [{ label: label.patente, value: sanitizeText(view.seller.patente) }]
        : []),
      ...(view.seller.phone
        ? [{ label: label.phone, value: sanitizeText(view.seller.phone) }]
        : []),
      ...(view.seller.email
        ? [{ label: label.email, value: sanitizeText(view.seller.email) }]
        : []),
      ...(view.seller.website
        ? [{ label: label.website, value: sanitizeText(view.seller.website) }]
        : []),
    ];
    const buyerRows = [
      { label: label.billedClient, value: sanitizeText(view.buyer.legalName) },
      { label: label.address, value: sanitizeText(view.buyer.address) },
      ...(view.buyer.ice ? [{ label: label.ice, value: sanitizeText(view.buyer.ice) }] : []),
      ...(view.buyer.taxId ? [{ label: label.taxId, value: sanitizeText(view.buyer.taxId) }] : []),
      ...(view.buyer.billingContact
        ? [{ label: label.billingContact, value: sanitizeText(view.buyer.billingContact) }]
        : []),
    ];
    const referenceRows = [
      ...(view.commercialReferences.quotation
        ? [
            {
              label: label.quotationReference,
              value: sanitizeText(view.commercialReferences.quotation),
            },
          ]
        : []),
      ...(view.commercialReferences.contract
        ? [
            {
              label: label.contractReference,
              value: sanitizeText(view.commercialReferences.contract),
            },
          ]
        : []),
      ...(view.commercialReferences.purchaseOrder
        ? [
            {
              label: label.purchaseOrderReference,
              value: sanitizeText(view.commercialReferences.purchaseOrder),
            },
          ]
        : []),
      ...(view.customerReference
        ? [{ label: label.customerReference, value: sanitizeText(view.customerReference) }]
        : []),
    ];
    return {
      title: `${label.invoice} ${sanitizeText(view.reference)}`,
      subtitle: commercialStatus(view.status, language),
      blocks: [
        {
          kind: 'panelGrid',
          panels: [
            { heading: label.seller, rows: sellerRows },
            { heading: label.billedClient, rows: buyerRows },
          ],
        },
        ...(view.party.missionTitle
          ? [
              {
                kind: 'keyValues' as const,
                rows: [{ label: label.mission, value: sanitizeText(view.party.missionTitle) }],
              },
            ]
          : []),
        {
          kind: 'table',
          columns: [
            language === 'fr' ? 'Désignation' : label.description,
            language === 'fr' ? 'Qté' : label.quantity,
            language === 'fr' ? 'Prix unit. HT' : 'Unit price excl. tax',
            language === 'fr' ? 'TVA' : 'Tax',
            language === 'fr' ? 'Total HT' : 'Total excl. tax',
          ],
          rows: view.lines.map((line) => [
            sanitizeText(line.description),
            String(line.quantity),
            invoiceMoney(line.unitPriceCents, view.currency, language),
            `${(line.taxRateBps / 100).toFixed(2).replace('.00', '')}${language === 'fr' ? ' %' : '%'}`,
            invoiceMoney(line.lineSubtotalCents, view.currency, language),
          ]),
        },
        {
          kind: 'totals',
          rows: [
            {
              label: label.invoiceSubtotal,
              value: invoiceMoney(view.subtotalCents, view.currency, language),
            },
            {
              label: invoiceTaxLabel(view, language),
              value: invoiceMoney(view.taxCents, view.currency, language),
            },
            {
              label: label.invoiceTotal,
              value: invoiceMoney(view.totalCents, view.currency, language),
            },
          ],
        },
        ...(language === 'fr' && view.totalAmountInWordsFr
          ? [
              { kind: 'heading' as const, text: label.amountInWords },
              { kind: 'paragraph' as const, text: sanitizeText(view.totalAmountInWordsFr) },
            ]
          : []),
        ...(view.taxTreatment
          ? [
              { kind: 'heading' as const, text: label.taxTreatment },
              { kind: 'paragraph' as const, text: sanitizeText(view.taxTreatment) },
            ]
          : []),
        {
          kind: 'panelGrid',
          panels: [
            {
              heading: label.payment,
              rows: [
                { label: label.terms, value: sanitizeText(view.paymentTerms) },
                ...(view.paymentMethod
                  ? [{ label: label.paymentMethod, value: sanitizeText(view.paymentMethod) }]
                  : []),
                ...(view.bankDetails
                  ? [{ label: label.bankDetails, value: sanitizeText(view.bankDetails) }]
                  : []),
              ],
            },
            ...(referenceRows.length > 0
              ? [{ heading: label.commercialReferences, rows: referenceRows }]
              : []),
          ],
        },
      ],
      footer: invoiceFooter(view, language, label.footer),
      presentation: {
        kind: 'hireme-commercial',
        documentLabel: label.invoice.toUpperCase(),
        reference: sanitizeText(view.reference),
        status: commercialStatus(view.status, language),
        details: [
          {
            label: language === 'fr' ? 'Facturée le' : label.issueDate,
            value: invoiceDate(view.issueDate, language),
          },
          {
            label: language === 'fr' ? 'Échéance' : label.dueDate,
            value: invoiceDate(view.dueDate, language),
          },
        ],
      },
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
