import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { InvoiceView } from '../src/document-generation/generation-view-models.js';
import { renderPdf } from '../src/document-generation/renderers/pdf.renderer.js';
import {
  resolveTemplate,
  type GenerationTemplate,
} from '../src/document-generation/template-registry.js';

const outputDirectory = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../docs/audit/invoice-consolidation',
);

const baseView: InvoiceView = {
  kind: 'INVOICE',
  documentState: 'ISSUED',
  reference: 'SYNTHETIC-INV-2026-008',
  status: 'ISSUED',
  currency: 'MAD',
  issueDate: new Date('2026-10-23T00:00:00.000Z'),
  dueDate: new Date('2026-11-23T00:00:00.000Z'),
  subtotalCents: 20_000,
  taxCents: 4_000,
  totalCents: 24_000,
  lines: [
    {
      description: 'Accompagnement synthétique',
      quantity: 1,
      unitPriceCents: 20_000,
      taxRateBps: 2_000,
      lineSubtotalCents: 20_000,
      lineTaxCents: 4_000,
      lineTotalCents: 24_000,
    },
  ],
  party: { clientName: 'Client synthétique', missionTitle: 'Mission de démonstration' },
  seller: {
    legalName: 'HireMe Démonstration SARL',
    legalForm: 'SARL synthétique',
    capital: '100 000 MAD synthétiques',
    address: '1 avenue des Tests, Casablanca',
    ice: 'ICE-SYNTHETIQUE',
    taxId: 'IF-SYNTHETIQUE',
    registrationNumber: 'RC-SYNTHETIQUE',
    patente: 'PT-SYNTHETIQUE',
    phone: '+212 600 000 000',
    email: 'facturation@example.invalid',
    website: 'https://example.invalid',
  },
  buyer: {
    type: 'COMPANY',
    legalName: 'Client Synthétique SA',
    address: '2 rue de l’Exemple, Rabat',
    ice: 'CLIENT-ICE-SYNTHETIQUE',
    taxId: 'CLIENT-IF-SYNTHETIQUE',
    billingContact: 'Contact Démonstration',
  },
  customerReference: 'BC-SYN-2026-0042',
  paymentTerms: 'Virement sous 30 jours après émission.',
  paymentMethod: 'Virement synthétique',
  bankDetails: 'Compte bancaire synthétique uniquement.',
  taxTreatment: null,
  totalAmountInWordsFr: 'deux cent quarante dirhams et zéro centime',
  commercialReferences: {
    quotation: 'DEV-SYN-001',
    contract: 'CTR-SYN-001',
    purchaseOrder: 'BC-SYN-001',
  },
};

const withoutOptionalBuyer = {
  ...baseView.buyer,
  address: null,
  ice: null,
  taxId: null,
  billingContact: null,
};

const samples: Array<{ name: string; view: InvoiceView }> = [
  {
    name: 'issued-full-common-service-date.pdf',
    view: {
      ...baseView,
      lines: baseView.lines.map((line) => ({
        ...line,
        description: `${line.description} — Date de prestation : 15/09/2026`,
      })),
    },
  },
  {
    name: 'issued-minimal-differing-service-dates.pdf',
    view: {
      ...baseView,
      reference: 'SYNTHETIC-INV-2026-009',
      buyer: withoutOptionalBuyer,
      lines: [
        {
          ...baseView.lines[0]!,
          description: 'Service synthétique A — Date de prestation : 15/09/2026',
        },
        {
          ...baseView.lines[0]!,
          description: 'Service synthétique B — Date de prestation : 16/09/2026',
        },
      ],
      subtotalCents: 40_000,
      taxCents: 8_000,
      totalCents: 48_000,
      totalAmountInWordsFr: 'quatre cent quatre-vingts dirhams et zéro centime',
    },
  },
  {
    name: 'draft-full-common-service-date.pdf',
    view: {
      ...baseView,
      documentState: 'DRAFT_PREVIEW',
      reference: 'SYNTHETIC-DRAFT-008',
      status: 'DRAFT',
      lines: baseView.lines.map((line) => ({
        ...line,
        description: `${line.description} — Date de prestation : 15/09/2026`,
      })),
    },
  },
  {
    name: 'draft-minimal-no-service-date.pdf',
    view: {
      ...baseView,
      documentState: 'DRAFT_PREVIEW',
      reference: 'SYNTHETIC-DRAFT-009',
      status: 'DRAFT',
      buyer: withoutOptionalBuyer,
    },
  },
];

await mkdir(outputDirectory, { recursive: true });
const template = resolveTemplate('INVOICE') as GenerationTemplate<InvoiceView>;
if (template.version !== 8) {
  throw new Error(`Expected invoice template v8, received v${template.version}.`);
}

for (const sample of samples) {
  const bytes = await renderPdf(template.build(sample.view, 'fr'));
  await writeFile(resolve(outputDirectory, sample.name), bytes);
  process.stdout.write(`${sample.name}: ${bytes.length} bytes\n`);
}
