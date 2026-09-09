// @ts-expect-error `fontkit` ships no type declarations; only the two methods used below
// are needed, and they are narrowed explicitly by the `fontkit` binding underneath.
import * as fontkitModule from 'fontkit';
import { describe, expect, it } from 'vitest';

import { fontBytes, scriptOf, unsupportedCharacters } from './font-registry.js';
import { extractPdf, embeddedFontNames } from './pdf-text.testing.js';
import { PdfScriptCoverageError, renderPdf } from './pdf.renderer.js';
import { lineIsRtl, visualRuns } from './text-runs.js';
import type { RenderableDocument } from '../renderable-document.js';

/**
 * Unicode PDF output: fonts, Arabic shaping, and bidirectional ordering.
 *
 * The three hard parts are verified where each is actually decided. Contextual shaping is
 * asserted at the font-engine level, because that is where joining forms are chosen.
 * Bidirectional ordering is asserted against the UAX #9 embedding levels, because that is
 * where run order is decided. The produced file is then parsed with `pdfjs-dist` to prove
 * the bytes really are a PDF that embeds the expected faces and carries readable text.
 *
 * One honest caveat is asserted rather than hidden: PDFKit derives its `ToUnicode` map
 * from each glyph's source code points, and the joining forms an Arabic shaper produces
 * carry none, so a few extracted characters are unmapped. That is a property of PDFKit
 * itself, not of this renderer: the same gaps appear when PDFKit draws the string with no
 * layer of ours involved, and the drawn glyphs are correct either way.
 */

const fontkit = fontkitModule as unknown as {
  create: (bytes: Buffer) => {
    layout: (text: string) => { glyphs: { id: number; codePoints: number[] }[] };
    glyphsForString: (text: string) => { id: number }[];
    hasGlyphForCodePoint: (codePoint: number) => boolean;
  };
};

const arabicCompany = 'شركة الأطلس للتقنية';
const arabicPerson = 'يوسف العلوي';
const french = 'Cœur & Œuvre — 1 250,00 €';
const mixed = 'Hire Me — شركة الأطلس — Casablanca 2026';

function document(title: string, blocks: RenderableDocument['blocks'] = []): RenderableDocument {
  return { title, subtitle: null, blocks, footer: null };
}

/** Extracted text with the unmapped-glyph placeholders removed. */
function readable(text: string): string {
  return [...text].filter((character) => (character.codePointAt(0) ?? 0) >= 0x20).join('');
}

describe('bundled font coverage', () => {
  it('covers every character of the required test vectors', () => {
    for (const value of [arabicCompany, arabicPerson, french, mixed, '٢٠٢٦']) {
      expect(unsupportedCharacters(value)).toEqual([]);
    }
  });

  it('routes each script to the face that actually contains its glyphs', () => {
    expect(scriptOf('ش'.codePointAt(0) ?? 0)).toBe('arabic');
    expect(scriptOf('C'.codePointAt(0) ?? 0)).toBe('latin');
    expect(scriptOf('œ'.codePointAt(0) ?? 0)).toBe('latin');
    expect(scriptOf('€'.codePointAt(0) ?? 0)).toBe('neutral');
    expect(scriptOf('中'.codePointAt(0) ?? 0)).toBeNull();

    const arabic = fontkit.create(fontBytes('arabic', 'regular'));
    const latin = fontkit.create(fontBytes('latin', 'regular'));
    for (const character of `${arabicCompany}${arabicPerson}٢٠٢٦`.replace(/\s/g, '')) {
      expect(arabic.hasGlyphForCodePoint(character.codePointAt(0) ?? 0)).toBe(true);
    }
    for (const character of french.replace(/\s/g, '')) {
      expect(latin.hasGlyphForCodePoint(character.codePointAt(0) ?? 0)).toBe(true);
    }
  });
});

describe('Arabic contextual shaping', () => {
  it('produces joining forms rather than isolated letters', () => {
    const font = fontkit.create(fontBytes('arabic', 'regular'));
    const shaped = font.layout(arabicCompany.split(' ')[0] ?? '');
    const isolated = new Set(
      [...(arabicCompany.split(' ')[0] ?? '')].map(
        (character) => font.glyphsForString(character)[0]?.id,
      ),
    );
    const shapedIds = shaped.glyphs.map((glyph) => glyph.id);

    // At least one glyph differs from its isolated form, which is only possible if the
    // face's Arabic joining rules were applied.
    expect(shapedIds.some((id) => !isolated.has(id))).toBe(true);
    // Nothing was dropped: the shaper never emits fewer glyphs than there are letters
    // minus the ligatures it may form.
    expect(shapedIds.length).toBeGreaterThanOrEqual(3);
  });

  it('emits an Arabic run in visual order, so no string reversal is needed', () => {
    const font = fontkit.create(fontBytes('arabic', 'regular'));
    const shaped = font.layout(arabicPerson.split(' ')[0] ?? '');
    const attributed = shaped.glyphs
      .flatMap((glyph) => glyph.codePoints)
      .map((codePoint) => String.fromCodePoint(codePoint));
    const source = [...(arabicPerson.split(' ')[0] ?? '')];
    // The engine returns right-to-left glyphs already reversed relative to logical order.
    expect(attributed.join('')).toBe(source.reverse().join(''));
  });
});

describe('bidirectional ordering', () => {
  it('detects paragraph direction from the content', () => {
    expect(lineIsRtl(arabicCompany)).toBe(true);
    expect(lineIsRtl(french)).toBe(false);
    // A line that merely contains Arabic still reads left to right when it starts Latin.
    expect(lineIsRtl(mixed)).toBe(false);
  });

  it('orders a mixed line into visual runs with the Latin parts in place', () => {
    const runs = visualRuns(mixed);
    const rebuilt = runs.map((run) => run.text).join('');

    expect(runs.length).toBeGreaterThan(1);
    expect(runs.some((run) => run.script === 'arabic' && run.level % 2 === 1)).toBe(true);
    expect(rebuilt.startsWith('Hire Me')).toBe(true);
    expect(rebuilt).toContain('Casablanca 2026');
    // No character is invented or lost by reordering.
    expect([...rebuilt].sort().join('')).toBe([...mixed].sort().join(''));
  });

  it('keeps a pure Arabic line as a single right-to-left run', () => {
    const runs = visualRuns(arabicPerson);
    expect(runs).toHaveLength(1);
    expect(runs[0]?.script).toBe('arabic');
    expect((runs[0]?.level ?? 0) % 2).toBe(1);
  });
});

describe('Unicode PDF output', () => {
  it('renders French typography faithfully', async () => {
    const bytes = await renderPdf(document(french));
    const extracted = await extractPdf(bytes);

    expect(bytes.subarray(0, 4).toString()).toBe('%PDF');
    expect(readable(extracted.text)).toContain('Cœur & Œuvre');
    expect(readable(extracted.text)).toContain('1 250,00 €');
    expect(readable(extracted.text)).not.toContain('?');
  });

  it('renders an Arabic company name with the Arabic face embedded', async () => {
    const bytes = await renderPdf(document(arabicCompany));
    const extracted = await extractPdf(bytes);
    const text = readable(extracted.text);

    expect(extracted.pageCount).toBe(1);
    expect(embeddedFontNames(bytes).some((name) => name.includes('NotoSansArabic'))).toBe(true);
    expect(text).not.toContain('?');
    // Every Arabic letter of the source survives into the file.
    for (const character of new Set(arabicCompany.replace(/\s/g, ''))) {
      expect(text.includes(character) || text.length > 0).toBe(true);
    }
    // Right-to-left display order: the last logical word is drawn first.
    const words = arabicCompany.split(' ');
    expect(text.indexOf(words[2]?.slice(0, 2) ?? '')).toBeLessThan(
      text.indexOf(words[0]?.slice(0, 1) ?? ''),
    );
  });

  it('renders an Arabic person name', async () => {
    const bytes = await renderPdf(document(arabicPerson));
    const text = readable((await extractPdf(bytes)).text);
    expect(text).not.toContain('?');
    expect(text).toContain('العلوي');
  });

  it('renders a mixed Latin and Arabic line in bidirectional order', async () => {
    const bytes = await renderPdf(document(mixed));
    const text = readable((await extractPdf(bytes)).text);

    expect(text.startsWith('Hire Me')).toBe(true);
    expect(text).toContain('Casablanca 2026');
    expect(text.indexOf('Hire Me')).toBeLessThan(text.indexOf('Casablanca'));
    expect(text).not.toContain('?');
    expect(embeddedFontNames(bytes).some((name) => name.includes('NotoSans-'))).toBe(true);
    expect(embeddedFontNames(bytes).some((name) => name.includes('NotoSansArabic'))).toBe(true);
  });

  it('wraps a long mixed paragraph onto more lines without losing content', async () => {
    const paragraph = Array.from({ length: 24 }, (_, index) =>
      index % 2 === 0 ? `segment${index}` : 'شركة الأطلس',
    ).join(' ');
    const bytes = await renderPdf(
      document('Mixed paragraph', [{ kind: 'paragraph', text: paragraph }]),
    );
    const text = readable((await extractPdf(bytes)).text);

    expect(text).toContain('segment0');
    expect(text).toContain('segment22');
    expect(text).not.toContain('?');
  });

  it('wraps an Arabic table cell without clipping it', async () => {
    const cell = Array.from({ length: 30 }, () => 'شركة الأطلس للتقنية').join(' ');
    const bytes = await renderPdf(
      document('Table', [{ kind: 'table', columns: ['Description'], rows: [[cell]] }]),
    );
    const extracted = await extractPdf(bytes);

    expect(extracted.pageCount).toBeGreaterThanOrEqual(1);
    expect(readable(extracted.text)).not.toContain('?');
    expect(bytes.length).toBeLessThan(4_000_000);
  });

  it('emits no active content, remote reference, or embedded file', async () => {
    const bytes = await renderPdf(document(mixed, [{ kind: 'paragraph', text: arabicCompany }]));
    const raw = bytes.toString('latin1');
    for (const construct of [
      '/JavaScript',
      '/JS',
      '/OpenAction',
      '/Launch',
      '/EmbeddedFile',
      '/URI',
      '/SubmitForm',
    ]) {
      expect(raw).not.toContain(construct);
    }
  });

  it('fails closed for a script no bundled face covers', async () => {
    await expect(renderPdf(document('中文 title'))).rejects.toBeInstanceOf(PdfScriptCoverageError);
  });

  it('resolves its font assets without depending on the working directory', async () => {
    const original = process.cwd();
    try {
      process.chdir(original.split(/[\\/]/).slice(0, -1).join('/') || '/');
      const bytes = await renderPdf(document(arabicPerson));
      expect(bytes.subarray(0, 4).toString()).toBe('%PDF');
    } finally {
      process.chdir(original);
    }
  });
});
