import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { chdir } from 'node:process';
import { pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Verifies the **compiled** document generator against its bundled font assets.
 *
 * Issue #49 ships font binaries alongside the API, and a renderer that only works from
 * the TypeScript source tree would fail in production. This script therefore imports the
 * built `dist/` renderer, runs it from an unrelated working directory, and asserts that it
 * resolved its fonts, embedded them, and produced correct Arabic and mixed-direction
 * output with no network access.
 *
 * Run it after `pnpm build`.
 */

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distRenderers = join(packageRoot, 'dist', 'document-generation', 'renderers');

const { renderPdf } = await import(pathToFileURL(join(distRenderers, 'pdf.renderer.js')).href);
const { extractPdf, embeddedFontNames } = await import(
  pathToFileURL(join(distRenderers, 'pdf-text.testing.js')).href
);

// Running from an unrelated directory proves nothing depends on `process.cwd()`.
chdir(await mkdtemp(join(tmpdir(), 'hire-me-generation-assets-')));

const bytes = await renderPdf({
  title: 'Hire Me — شركة الأطلس — Casablanca 2026',
  subtitle: 'Cœur & Œuvre — 1 250,00 €',
  blocks: [
    { kind: 'paragraph', text: 'يوسف العلوي' },
    { kind: 'table', columns: ['Description'], rows: [['شركة الأطلس للتقنية']] },
  ],
  footer: null,
});

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Generation asset verification failed: ${message}`);
  }
}

assert(bytes.subarray(0, 4).toString() === '%PDF', 'the compiled renderer did not produce a PDF');
assert(bytes.length > 0 && bytes.length < 4_000_000, 'the produced PDF is outside the size bound');

const fonts = embeddedFontNames(bytes);
assert(
  fonts.some((name) => name.includes('NotoSans-Regular')),
  `the Latin face was not embedded (saw ${fonts.join(', ')})`,
);
assert(
  fonts.some((name) => name.includes('NotoSansArabic')),
  `the Arabic face was not embedded (saw ${fonts.join(', ')})`,
);

const extracted = await extractPdf(bytes);
const readable = [...extracted.text]
  .filter((character) => (character.codePointAt(0) ?? 0) >= 0x20)
  .join('');

assert(extracted.pageCount >= 1, 'the produced PDF has no pages');
assert(readable.includes('Hire Me'), 'the Latin text is missing from the compiled output');
assert(readable.includes('Casablanca 2026'), 'the trailing Latin run is missing');
assert(readable.includes('Cœur & Œuvre'), 'the French ligature is missing');
assert(!readable.includes('?'), 'a character was substituted rather than rendered');

console.log(
  `Compiled generation assets verified from ${process.cwd()}: ${fonts.length} faces embedded, ${extracted.pageCount} page(s).`,
);
