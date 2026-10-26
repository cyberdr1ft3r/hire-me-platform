import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { InvoiceView } from '../apps/api/src/document-generation/generation-view-models.js';
import { renderPdf } from '../apps/api/src/document-generation/renderers/pdf.renderer.js';
import { resolveTemplate } from '../apps/api/src/document-generation/template-registry.js';
import { frenchMadAmountInWords } from '../apps/api/src/commercial/french-amount-in-words.js';

// This script is run through the API workspace, whose process cwd is apps/api.
const outputDirectory = resolve(process.cwd(), '../..', 'docs/audit/issue-244-invoice-business');
const outputPath = resolve(outputDirectory, 'sample-invoice-fr.pdf');

const view: InvoiceView = {
  kind: 'INVOICE',
  reference: 'HM-2026-042',
  status: 'ISSUED',
  currency: 'MAD',
  issueDate: new Date('2026-10-25T00:00:00.000Z'),
  dueDate: new Date('2026-11-24T00:00:00.000Z'),
  subtotalCents: 99_167,
  taxCents: 19_833,
  totalCents: 119_000,
  lines: [
    {
      description: "Programme synthétique d'accompagnement d'un mois",
      quantity: 1,
      unitPriceCents: 99_167,
      taxRateBps: 2_000,
      lineSubtotalCents: 99_167,
      lineTaxCents: 19_833,
      lineTotalCents: 119_000,
    },
  ],
  party: {
    clientName: 'Client individuel synthétique',
    missionTitle: null,
  },
  seller: {
    legalName: 'HireMe - profil synthétique de recette',
    legalForm: 'SARL (donnée synthétique)',
    capital: '100 000 MAD (donnée synthétique)',
    address: '29 rue de démonstration, Casablanca',
    ice: 'ICE-SYNTHETIQUE',
    taxId: 'IF-SYNTHETIQUE',
    registrationNumber: 'RC-SYNTHETIQUE',
    patente: 'PT-SYNTHETIQUE',
    phone: '+212 600 000 000',
    email: 'facturation@example.invalid',
    website: null,
  },
  buyer: {
    type: 'INDIVIDUAL',
    legalName: 'Client individuel synthétique',
    address: '12 rue de démonstration, Rabat',
    ice: null,
    taxId: null,
    billingContact: null,
  },
  customerReference: 'BC-TEST-2026-0042',
  paymentTerms: 'Paiement synthétique sous 30 jours.',
  paymentMethod: 'Virement bancaire',
  bankDetails: null,
  taxTreatment: null,
  totalAmountInWordsFr: frenchMadAmountInWords(119_000),
  commercialReferences: {
    quotation: null,
    contract: null,
    purchaseOrder: null,
  },
};

async function main(): Promise<void> {
  await mkdir(outputDirectory, { recursive: true });
  const template = resolveTemplate('INVOICE');
  const pdf = await renderPdf(template.build(view, 'fr'));
  await writeFile(outputPath, pdf);
  console.log(outputPath);
}

void main();
