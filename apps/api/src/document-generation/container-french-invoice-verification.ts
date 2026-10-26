import type { InvoiceView } from './generation-view-models.js';
import { documentStrings, renderPdf } from './renderers/pdf.renderer.js';
import type { GenerationTemplate } from './template-registry.js';
import { resolveTemplate } from './template-registry.js';

/**
 * Synthetic French invoice rendered only by the final production container in CI.
 *
 * The base64 PDF is written to stdout so the read-only, networkless container does not
 * need a writable bind mount. CI decodes it and performs independent PDF inspection with
 * the development-only parser. No real customer or seller data is used here.
 */

const wrappedDescription =
  'Prestation synthétique d’accompagnement professionnel approfondi, préparation d’entretiens, ' +
  'suivi personnalisé et compte rendu détaillé — données de démonstration uniquement.';

const view: InvoiceView = {
  kind: 'INVOICE',
  reference: 'INV-CONTAINER-SYN-001',
  status: 'ISSUED',
  currency: 'MAD',
  issueDate: new Date('2026-10-25T00:00:00.000Z'),
  dueDate: new Date('2026-11-25T00:00:00.000Z'),
  subtotalCents: 99_167,
  taxCents: 19_833,
  totalCents: 119_000,
  lines: [
    {
      description: wrappedDescription,
      quantity: 1,
      unitPriceCents: 99_167,
      taxRateBps: 2_000,
      lineSubtotalCents: 99_167,
      lineTaxCents: 19_833,
      lineTotalCents: 119_000,
    },
  ],
  party: {
    clientName: 'Cliente Synthétique',
    missionTitle: null,
  },
  seller: {
    legalName: 'HireMe Démonstration SARL',
    legalForm: 'SARL synthétique',
    capital: '100 000 MAD synthétiques',
    address: '1 avenue des Tests, Casablanca',
    ice: 'ICE-SYNTHETIQUE',
    taxId: 'IF-SYNTHETIQUE',
    registrationNumber: 'RC-SYNTHETIQUE',
    patente: 'PT-SYNTHETIQUE',
    phone: null,
    email: 'facturation@example.invalid',
    website: 'https://example.invalid',
  },
  buyer: {
    type: 'INDIVIDUAL',
    legalName: 'Cliente Synthétique',
    address: '2 rue de l’Exemple, Rabat',
    ice: null,
    taxId: null,
    billingContact: 'Contact Démonstration',
  },
  customerReference: 'BC-SYN-2026-0042',
  paymentTerms: 'Virement sous 30 jours après émission.',
  paymentMethod: 'Virement synthétique',
  bankDetails: null,
  taxTreatment: null,
  totalAmountInWordsFr: 'mille cent quatre-vingt-dix dirhams et zéro centime',
  commercialReferences: {
    quotation: 'DEV-SYN-001',
    contract: null,
    purchaseOrder: null,
  },
};

const template = resolveTemplate('INVOICE') as GenerationTemplate<InvoiceView>;
const document = template.build(view, 'fr');
const renderedStrings = documentStrings(document).join('\n');

for (const expected of [
  'FACTURE',
  'Émise',
  wrappedDescription,
  'Sous-total HT',
  '991,67 MAD',
  'TVA (20 %)',
  '198,33 MAD',
  'Total TTC',
  '1 190,00 MAD',
  'mille cent quatre-vingt-dix dirhams et zéro centime',
]) {
  if (!renderedStrings.includes(expected)) {
    throw new Error(`French invoice template omitted ${JSON.stringify(expected)}.`);
  }
}

const bytes = await renderPdf(document);
if (bytes.subarray(0, 4).toString() !== '%PDF') {
  throw new Error('French invoice renderer did not produce PDF bytes.');
}

process.stdout.write(bytes.toString('base64'));
