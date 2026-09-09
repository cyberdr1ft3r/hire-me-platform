// @ts-expect-error `fontkit` ships no type declarations; only the methods used below are
// needed, and they are narrowed explicitly by the `fontkit` binding underneath.
import * as fontkitModule from 'fontkit';
import { describe, expect, it } from 'vitest';

import type { FontScript, FontWeight } from './font-registry.js';
import {
  faceForCodePoint,
  fontBytes,
  registeredFontAssets,
  scriptHint,
  unsupportedCharacters,
} from './font-registry.js';
import { drawnLineText, extractPdf, embeddedFontNames } from './pdf-text.testing.js';
import { PdfScriptCoverageError, renderPdf } from './pdf.renderer.js';
import { lineIsRtl, runGroups, visualRuns } from './text-runs.js';
import type { RenderableDocument } from '../renderable-document.js';

/**
 * Unicode PDF output: fonts, Arabic shaping, bidirectional ordering, and text recovery.
 *
 * Four separate claims are made and each is verified where it is actually decided.
 * Contextual shaping is asserted at the font-engine level, because that is where joining
 * forms are chosen. Bidirectional segmentation is asserted against the UAX #9 embedding
 * levels. Page layout is asserted by reading the content stream, which reports glyphs in
 * the order and at the position they are drawn. Text recovery is asserted by parsing the
 * produced file with `pdfjs-dist` and requiring the **exact** source string back — no
 * placeholder filtering, no "contains something" fallback, nothing removed to make the
 * comparison succeed.
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
const arabicDigits = '٢٠٢٦';
const french = 'Cœur & Œuvre — 1 250,00 €';
const mixed = 'Hire Me — شركة الأطلس — Casablanca 2026';
/** In the Unicode block the range classifier hands to the Latin face, absent from it. */
const armenian = 'Ա';

function document(title: string, blocks: RenderableDocument['blocks'] = []): RenderableDocument {
  return { title, subtitle: null, blocks, footer: null };
}

function reversed(value: string): string {
  return [...value].reverse().join('');
}

async function extractedText(bytes: Buffer): Promise<string> {
  return (await extractPdf(bytes)).text;
}

describe('bundled font coverage', () => {
  it('covers the scripts business text uses', () => {
    const covered = [
      'Hire Me Casablanca',
      'Cœur Œuvre àéîõü Ÿšž',
      'Ωμέγα Δοκιμή',
      'Кириллица Проверка',
      arabicCompany,
      arabicPerson,
      arabicDigits,
      mixed,
      '€ £ — – … « » ‰ 1 250,00',
    ];
    for (const value of covered) {
      expect(unsupportedCharacters(value)).toEqual([]);
    }
  });

  it('confirms every routed character against the chosen face, not against a range', () => {
    const faces = new Map<string, ReturnType<typeof fontkit.create>>();
    const faceOf = (script: FontScript, weight: FontWeight) => {
      const key = `${script}:${weight}`;
      const existing = faces.get(key);
      if (existing) {
        return existing;
      }
      const created = fontkit.create(fontBytes(script, weight));
      faces.set(key, created);
      return created;
    };

    for (const value of [arabicCompany, arabicDigits, french, mixed, 'Ωμέγα Кириллица']) {
      for (const character of value) {
        const codePoint = character.codePointAt(0) ?? 0;
        for (const weight of ['regular', 'bold'] as const) {
          const script = faceForCodePoint(codePoint, weight);
          expect(script).not.toBeNull();
          expect(faceOf(script as FontScript, weight).hasGlyphForCodePoint(codePoint)).toBe(true);
        }
      }
    }
  });

  it('rejects a character the range classifier admits but no face contains', () => {
    const codePoint = armenian.codePointAt(0) ?? 0;

    // The range classifier routes Armenian to the Latin face, because it shares a span
    // with Latin Extended, Greek and Cyrillic.
    expect(scriptHint(codePoint)).toBe('latin');
    // No registered face actually has the glyph, which is proven rather than assumed.
    for (const { script, weight } of registeredFontAssets()) {
      expect(fontkit.create(fontBytes(script, weight)).hasGlyphForCodePoint(codePoint)).toBe(false);
    }
    expect(faceForCodePoint(codePoint, 'regular')).toBeNull();
    expect(unsupportedCharacters(`Name ${armenian}`)).toEqual([armenian]);
  });

  it('rejects a character outside every bundled block', () => {
    expect(scriptHint('中'.codePointAt(0) ?? 0)).toBeNull();
    expect(faceForCodePoint('中'.codePointAt(0) ?? 0, 'regular')).toBeNull();
    expect(unsupportedCharacters('中文')).toEqual(['中', '文']);
  });

  it('routes a neutral character to a face that has it rather than to its neighbours', () => {
    const euro = '€'.codePointAt(0) ?? 0;
    // The Arabic face has no euro sign, so an Arabic price line must not draw one with it.
    expect(fontkit.create(fontBytes('arabic', 'regular')).hasGlyphForCodePoint(euro)).toBe(false);
    expect(faceForCodePoint(euro, 'regular')).toBe('latin');

    const runs = visualRuns(`${arabicCompany} €`);
    const euroRun = runs.find((run) => run.text.includes('€'));
    expect(euroRun?.script).toBe('latin');
  });

  it('fails closed with a coverage error instead of drawing a missing-glyph box', async () => {
    await expect(renderPdf(document('中文 title'))).rejects.toBeInstanceOf(PdfScriptCoverageError);
    await expect(renderPdf(document(`Name ${armenian}`))).rejects.toBeInstanceOf(
      PdfScriptCoverageError,
    );
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

  it('gives Arabic-Indic digits their own left-to-right run inside Arabic', () => {
    const runs = visualRuns(`شهادة ${arabicDigits}`);
    const digits = runs.find((run) => run.text.includes(arabicDigits));

    expect(digits).toBeDefined();
    expect((digits?.level ?? 1) % 2).toBe(0);
    // Leftmost on the page, because the surrounding line reads right to left.
    expect(runs.indexOf(digits as (typeof runs)[number])).toBe(0);
  });

  it('draws a same-face stretch of a line as one group', () => {
    expect(runGroups(visualRuns(arabicCompany))).toHaveLength(1);
    expect(runGroups(visualRuns(`شهادة ${arabicDigits}`))).toHaveLength(1);
    expect(runGroups(visualRuns(mixed)).length).toBeGreaterThan(1);
  });
});

describe('page layout', () => {
  it('draws a right-to-left line with its first logical word furthest right', async () => {
    const bytes = await renderPdf(document(arabicCompany));
    // Read straight from the content stream, so this is the order on the page, not the
    // order a text extractor reconstructs.
    expect(drawnLineText(bytes)).toBe(reversed(arabicCompany));
  });

  it('keeps Arabic-Indic digits left to right inside a right-to-left line', async () => {
    const bytes = await renderPdf(document(`شهادة ${arabicDigits}`));
    // The digits sit leftmost and are not reversed; the Arabic word is.
    expect(drawnLineText(bytes)).toBe(`${arabicDigits} ${reversed('شهادة')}`);
  });

  it('draws a left-to-right line in logical order', async () => {
    const bytes = await renderPdf(document(french));
    expect(drawnLineText(bytes)).toBe(french);
  });

  it('draws a mixed line with the Latin parts in place and the Arabic reversed', async () => {
    const bytes = await renderPdf(document(mixed));
    expect(drawnLineText(bytes)).toBe(`Hire Me — ${reversed('شركة الأطلس')} — Casablanca 2026`);
  });
});

describe('Unicode round trip through a real PDF parser', () => {
  it('recovers an Arabic company name exactly', async () => {
    const bytes = await renderPdf(document(arabicCompany));
    expect(await extractedText(bytes)).toBe(arabicCompany);
    expect(embeddedFontNames(bytes).some((name) => name.includes('NotoSansArabic'))).toBe(true);
  });

  it('recovers an Arabic person name exactly', async () => {
    const bytes = await renderPdf(document(arabicPerson));
    expect(await extractedText(bytes)).toBe(arabicPerson);
  });

  it('recovers a mixed Latin and Arabic line exactly', async () => {
    const bytes = await renderPdf(document(mixed));
    const text = await extractedText(bytes);

    expect(text).toBe(mixed);
    expect(embeddedFontNames(bytes).some((name) => name.includes('NotoSans-'))).toBe(true);
    expect(embeddedFontNames(bytes).some((name) => name.includes('NotoSansArabic'))).toBe(true);
  });

  it('recovers Arabic-Indic digits exactly', async () => {
    const bytes = await renderPdf(document(arabicDigits));
    expect(await extractedText(bytes)).toBe(arabicDigits);
  });

  it('recovers French typography exactly', async () => {
    const bytes = await renderPdf(document(french));
    expect(bytes.subarray(0, 4).toString()).toBe('%PDF');
    expect(await extractedText(bytes)).toBe(french);
  });

  it('recovers every line of a long wrapped mixed paragraph', async () => {
    const sentences = Array.from(
      { length: 12 },
      (_, index) => `Segment ${index} — ${arabicCompany} — Casablanca ${2020 + index}`,
    );
    const bytes = await renderPdf(
      document('Mixed paragraph', [{ kind: 'paragraph', text: sentences.join(' ') }]),
    );
    // Wrapping is the point of the vector, so display line breaks are read back as the
    // spaces they replaced; nothing else is normalised.
    const text = (await extractedText(bytes)).replaceAll(String.fromCharCode(10), ' ');

    // Every sentence survives wrapping, in full, in both scripts.
    for (const sentence of sentences) {
      expect(text).toContain(sentence);
    }
  });

  it('recovers an Arabic table cell that wraps across lines', async () => {
    const cell = Array.from({ length: 30 }, () => arabicCompany).join(' ');
    const bytes = await renderPdf(
      document('Table', [{ kind: 'table', columns: ['Description'], rows: [[cell]] }]),
    );
    const text = await extractedText(bytes);

    expect(text).toContain(arabicCompany);
    // A wrapped cell keeps every repetition rather than clipping the overflow.
    expect(text.split(arabicCompany).length - 1).toBeGreaterThanOrEqual(30);
    expect(bytes.length).toBeLessThan(4_000_000);
  });

  it('leaves no unmapped glyph anywhere in a document mixing both scripts', async () => {
    const bytes = await renderPdf(
      document(mixed, [
        { kind: 'paragraph', text: `${arabicCompany} ${arabicPerson} ${arabicDigits}` },
        { kind: 'keyValues', rows: [{ label: 'Client', value: arabicCompany }] },
        { kind: 'table', columns: ['Client', 'Total'], rows: [[arabicPerson, french]] },
      ]),
    );
    const text = await extractedText(bytes);

    // An unmapped glyph surfaces as the raw glyph id, which lands in the control range.
    const control = [...text].filter(
      (character) => (character.codePointAt(0) ?? 0) < 0x20 && character !== '\n',
    );
    expect(control).toEqual([]);
    expect(text).not.toContain('?');
    // Letters that share one skeleton glyph in the face stay distinct in the text.
    expect(text).toContain('يوسف');
    expect(text).toContain('شركة');
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

  it('resolves its font assets without depending on the working directory', async () => {
    const original = process.cwd();
    try {
      process.chdir(original.split(/[\\/]/).slice(0, -1).join('/') || '/');
      const bytes = await renderPdf(document(arabicPerson));
      expect(await extractedText(bytes)).toBe(arabicPerson);
    } finally {
      process.chdir(original);
    }
  });
});
