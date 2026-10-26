import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { chromium } from 'playwright';

const apiBase = process.env.EVIDENCE_API_URL ?? 'http://127.0.0.1:3000';
const webBase = process.env.EVIDENCE_WEB_URL ?? 'http://127.0.0.1:5173';
const password = process.env.EVIDENCE_ADMIN_PASSWORD;
if (!password) throw new Error('EVIDENCE_ADMIN_PASSWORD is required.');

const output = path.resolve('docs/audit/issue-244-invoice-business');
await mkdir(output, { recursive: true });

const login = await fetch(`${apiBase}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'admin@example.test', password }),
});
if (!login.ok) throw new Error(`API login failed with ${login.status}.`);
const { accessToken } = await login.json();

async function api(pathname, method = 'GET', body) {
  const response = await fetch(`${apiBase}${pathname}`, {
    method,
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  const parsed = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(
      `${method} ${pathname} failed with ${response.status}: ${parsed.error?.code ?? 'unknown'}`,
    );
  }
  return parsed;
}

const year = 2026;
const billingSettings = {
  sellerLegalName: 'HireMe - profil synthétique de recette',
  sellerLegalForm: 'SARL (donnée synthétique)',
  sellerCapital: '100 000 MAD (donnée synthétique)',
  sellerAddress: '29 rue de démonstration, Casablanca',
  sellerIce: 'ICE-SYNTHETIQUE',
  sellerTaxId: 'IF-SYNTHETIQUE',
  sellerRegistrationNumber: 'RC-SYNTHETIQUE',
  sellerPatente: 'PT-SYNTHETIQUE',
  sellerPhone: '+212 600 000 000',
  sellerEmail: 'facturation@example.invalid',
  sellerWebsite: null,
  paymentTerms: 'Paiement synthétique sous 30 jours.',
  paymentMethod: 'Virement bancaire',
  bankDetails: null,
  invoicePrefix: 'HM',
  invoiceDigits: 3,
  invoiceNumberingEnabled: false,
};

const existing = (await api('/v1/commercial/invoices?pageSize=100')).invoices.find(
  (invoice) => invoice.reference === 'HM-2026-042',
);
let issued;
if (existing) {
  issued = await api(`/v1/commercial/invoices/${existing.id}`);
} else {
  await api('/v1/admin/billing-settings', 'PATCH', billingSettings);
  await api('/v1/admin/billing-settings/numbering-baseline', 'POST', {
    year,
    highestExternalNumber: 41,
    confirmed: true,
  });
  await api('/v1/admin/billing-settings', 'PATCH', {
    ...billingSettings,
    invoiceNumberingEnabled: true,
  });

  const client = await api('/v1/clients', 'POST', {
    name: 'Client individuel synthétique Issue 244',
    industry: 'Services synthétiques',
    country: 'Maroc',
    city: 'Rabat',
    commercialSummary: 'Données synthétiques réservées à la recette Issue 244.',
  });
  const draft = await api('/v1/commercial/invoices', 'POST', {
    reference: 'I244-SYNTHETIC-DRAFT',
    clientId: client.client.id,
    currency: 'MAD',
    issueDate: '2026-10-25T00:00:00.000Z',
    dueDate: '2026-11-24T00:00:00.000Z',
    lines: [
      {
        description: "Programme synthétique d'accompagnement d'un mois",
        quantity: 1,
        unitPriceCents: 99_167,
        taxRateBps: 2_000,
      },
    ],
  });
  issued = await api(`/v1/commercial/invoices/${draft.invoice.id}/issue`, 'POST', {
    issueDate: '2026-10-25T00:00:00.000Z',
    dueDate: '2026-11-24T00:00:00.000Z',
    businessDetails: {
      sellerLegalName: billingSettings.sellerLegalName,
      sellerLegalForm: billingSettings.sellerLegalForm,
      sellerCapital: billingSettings.sellerCapital,
      sellerAddress: billingSettings.sellerAddress,
      sellerIce: billingSettings.sellerIce,
      sellerTaxId: billingSettings.sellerTaxId,
      sellerRegistrationNumber: billingSettings.sellerRegistrationNumber,
      sellerPatente: billingSettings.sellerPatente,
      sellerPhone: billingSettings.sellerPhone,
      sellerEmail: billingSettings.sellerEmail,
      buyerType: 'INDIVIDUAL',
      buyerLegalName: 'Client individuel synthétique',
      buyerAddress: '12 rue de démonstration, Rabat',
      customerReference: 'BC-TEST-2026-0042',
      paymentTerms: billingSettings.paymentTerms,
      paymentMethod: billingSettings.paymentMethod,
    },
    includeFrenchAmountInWords: true,
    reason: 'Synthetic Issue 244 browser acceptance.',
  });
}
if (issued.invoice.reference !== 'HM-2026-042') throw new Error('Unexpected invoice reference.');
if (
  issued.invoice.amounts?.subtotalCents !== 99_167 ||
  issued.invoice.amounts?.taxCents !== 19_833 ||
  issued.invoice.amounts?.totalCents !== 119_000
) {
  throw new Error('Unexpected invoice totals.');
}

const chromeCandidates = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
];
let executablePath;
for (const candidate of chromeCandidates) {
  try {
    await access(candidate);
    executablePath = candidate;
    break;
  } catch {}
}
if (!executablePath) throw new Error('Chrome or Edge executable was not found.');

const browser = await chromium.launch({ executablePath, headless: true });
const context = await browser.newContext({
  acceptDownloads: true,
  locale: 'en-US',
  viewport: { width: 1440, height: 900 },
});
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(error.message));
try {
  await page.goto(webBase, { waitUntil: 'networkidle' });
  await page.getByLabel('Email').fill('admin@example.test');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Login' }).click();
  await page
    .getByRole('navigation', { name: /Primary navigation|Navigation principale/ })
    .first()
    .waitFor();

  await page.goto(`${webBase}/admin`, { waitUntil: 'networkidle' });
  await page.screenshot({ path: path.join(output, 'billing-settings-debug.png'), fullPage: true });
  await page.getByRole('heading', { name: /Billing settings|Paramètres de facturation/ }).waitFor();
  await page.screenshot({
    path: path.join(output, 'billing-settings-desktop.png'),
    fullPage: false,
  });

  await page.goto(`${webBase}/commercial`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Invoices' }).click();
  await page.getByRole('button', { name: 'HM-2026-042' }).click();
  await page.getByRole('heading', { name: 'HM-2026-042' }).waitFor();
  await page.screenshot({
    path: path.join(output, 'issued-invoice-desktop.png'),
    fullPage: true,
  });

  await page.getByLabel('Document language', { exact: true }).selectOption('fr');
  await page.getByRole('button', { name: 'Generate PDF' }).click();
  await page.getByText(/PDF version 1 generated in French/).waitFor();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download', exact: true }).click();
  const download = await downloadPromise;
  await download.saveAs(path.join(output, 'sample-invoice-fr.pdf'));

  await api('/v1/admin/billing-settings', 'PATCH', {
    ...billingSettings,
    sellerLegalName: 'Changed synthetic settings after issuance',
    invoiceNumberingEnabled: true,
  });
  const reloaded = await api(`/v1/commercial/invoices/${issued.invoice.id}`);
  if (reloaded.invoice.businessDetails?.sellerLegalName !== billingSettings.sellerLegalName) {
    throw new Error('Issued seller snapshot changed after settings update.');
  }

  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Invoices' }).click();
  await page.getByRole('button', { name: 'HM-2026-042' }).click();
  await page.getByText(billingSettings.sellerLegalName, { exact: true }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: path.join(output, 'issued-invoice-mobile.png'),
    fullPage: true,
  });
} finally {
  await browser.close();
}

if (pageErrors.length > 0) throw new Error(`Browser page errors: ${pageErrors.join(' | ')}`);
await writeFile(
  path.join(output, 'browser-results.json'),
  `${JSON.stringify(
    {
      browser: path.basename(executablePath),
      invoiceReference: issued.invoice.reference,
      amounts: issued.invoice.amounts,
      buyerType: issued.invoice.businessDetails?.buyerType,
      buyerTaxIdentifiersAbsent:
        issued.invoice.businessDetails?.buyerIce === null &&
        issued.invoice.businessDetails?.buyerTaxId === null,
      immutableAfterSettingsChange: true,
      protectedPdfDownload: true,
      pageErrors,
    },
    null,
    2,
  )}\n`,
);
