import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * Inspects the PDF emitted by the final API runtime container.
 *
 * `pdfjs-dist` remains a development-only dependency: the production image only renders
 * with its normal runtime dependency set, while CI independently reads the artifact back.
 */

const artifactPath = process.argv[2];
if (!artifactPath) {
  throw new Error('Usage: node scripts/verify-container-french-invoice.mjs <invoice.pdf>');
}

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const inspectorUrl = pathToFileURL(
  join(packageRoot, 'dist', 'document-generation', 'renderers', 'pdf-text.testing.js'),
).href;
const { drawnLines, embeddedFontNames, extractPdf } = await import(inspectorUrl);
const bytes = await readFile(resolve(artifactPath));

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Container invoice verification failed: ${message}`);
  }
}

assert(bytes.subarray(0, 4).toString() === '%PDF', 'artifact is not a PDF');
assert(bytes.length > 10_000 && bytes.length < 4_000_000, 'artifact size is outside bounds');

const raw = bytes.toString('latin1');
for (const construct of ['/JavaScript', '/JS', '/OpenAction', '/Launch', '/EmbeddedFile']) {
  assert(!raw.includes(construct), `active or remote PDF construct ${construct} was emitted`);
}
const links = [...raw.matchAll(/\/URI\s*\(([^)]*)\)/g)].map((match) => match[1]);
assert(
  links.length === 2 &&
    links.includes('mailto:facturation@example.invalid') &&
    links.includes('https://example.invalid/'),
  `unexpected PDF link targets: ${links.join(', ')}`,
);

const fonts = embeddedFontNames(bytes);
assert(
  fonts.some((name) => name.includes('NotoSans-Regular')),
  `regular Noto Sans was not embedded (saw ${fonts.join(', ')})`,
);
assert(
  fonts.some((name) => name.includes('NotoSans-Bold')),
  `bold Noto Sans was not embedded (saw ${fonts.join(', ')})`,
);

const extracted = await extractPdf(bytes);
const normalized = extracted.text.replaceAll(/\s+/g, ' ').trim();
for (const expected of [
  'FACTURE',
  'Facturée le',
  'synthétique d’accompagnement professionnel approfondi',
  'préparation d’entretiens',
  'suivi personnalisé et compte rendu détaillé',
  'Sous-total HT',
  '991,67 MAD',
  'TVA (20 %)',
  '198,33 MAD',
  'Total TTC',
  '1 190,00 MAD',
  'Virement sous 30 jours après émission.',
]) {
  assert(normalized.includes(expected), `extracted text omitted ${JSON.stringify(expected)}`);
}
assert(!normalized.includes('ÉMISE'), 'the removed issued badge is still visible');
assert(!normalized.includes('?'), 'a French character was substituted');
assert(extracted.pageCount >= 1 && extracted.pageCount <= 2, 'unexpected invoice page count');

const descriptionTerms = [
  'Prestation',
  'synthétique',
  'accompagnement',
  'professionnel',
  'préparation',
  'entretiens',
  'personnalisé',
  'démonstration',
];
const wrappedLines = drawnLines(bytes).filter((line) =>
  descriptionTerms.some((term) => line.includes(term)),
);
assert(wrappedLines.length >= 3, 'the long French invoice line did not wrap across drawn lines');

console.log(
  `Container French invoice verified: ${bytes.length} bytes, ${extracted.pageCount} page(s), ${fonts.length} embedded font face(s), ${wrappedLines.length} wrapped description lines.`,
);
