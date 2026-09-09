import { inflateRawSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import type { RenderableDocument } from './renderable-document.js';
import { formatMoney, sanitizeText, textLines } from './renderable-document.js';
import { renderDocx } from './renderers/docx.renderer.js';
import { scriptOf, unsupportedCharacters } from './renderers/font-registry.js';
import { extractPdf } from './renderers/pdf-text.testing.js';
import {
  PdfScriptCoverageError,
  renderPdf,
  unsupportedDocumentCharacters,
} from './renderers/pdf.renderer.js';
import { registeredTemplates, resolveTemplate } from './template-registry.js';

/**
 * Renderer and template safety, verified without a database.
 *
 * These cover the properties that must hold for every generated business output: the
 * bytes are a real PDF or OpenXML package, hostile free text cannot escape into markup,
 * control characters never survive, authoritative text is never truncated or silently
 * altered, and a template change is visible through an explicit version rather than
 * silently rewriting history.
 */

/** Hostile but representable text: everything here must survive verbatim in both families. */
const hostile = [
  '<script>alert(1)</script>',
  '=cmd|"/c calc"!A1',
  '../../etc/passwd',
  `bell${String.fromCharCode(7)} null${String.fromCharCode(0)} tab\t`,
  'French ligature: cœur, Œuvre, 12 € facturés',
  'typography: “curly” — dash … ‰',
].join(' ');

const hostileDocument: RenderableDocument = {
  title: hostile,
  subtitle: hostile,
  blocks: [
    { kind: 'heading', text: hostile },
    { kind: 'paragraph', text: hostile },
    { kind: 'keyValues', rows: [{ label: hostile, value: hostile }] },
    { kind: 'table', columns: [hostile, hostile], rows: [[hostile, hostile]] },
  ],
  footer: hostile,
};

/** Reads drawn text back out of a generated PDF through its embedded ToUnicode map. */
async function pdfText(bytes: Buffer): Promise<string> {
  const extracted = await extractPdf(bytes);
  return [...extracted.text]
    .filter((character) => (character.codePointAt(0) ?? 0) >= 0x20)
    .join('');
}

/** Inflates every deflated entry of an OOXML package so its XML can be inspected. */
function docxXml(bytes: Buffer): string {
  let xml = '';
  let offset = 0;
  while (offset >= 0 && offset < bytes.length - 30) {
    const signature = bytes.readUInt32LE(offset);
    if (signature !== 0x04034b50) {
      break;
    }
    const method = bytes.readUInt16LE(offset + 8);
    const compressedSize = bytes.readUInt32LE(offset + 18);
    const nameLength = bytes.readUInt16LE(offset + 26);
    const extraLength = bytes.readUInt16LE(offset + 28);
    const dataStart = offset + 30 + nameLength + extraLength;
    const data = bytes.subarray(dataStart, dataStart + compressedSize);
    try {
      xml += method === 8 ? inflateRawSync(data).toString('utf8') : data.toString('utf8');
    } catch {
      // A non-inflatable entry contributes nothing to the inspected XML.
    }
    offset = dataStart + compressedSize;
  }
  return xml;
}

describe('generated output sanitization', () => {
  it('removes control characters without altering business text', () => {
    const result = sanitizeText(`a${String.fromCharCode(7)}b${String.fromCharCode(0)}c\td`);
    expect([...result].some((character) => (character.codePointAt(0) ?? 0) < 0x20)).toBe(false);
    expect(result).toBe('abc d');
  });

  it('preserves legitimate Unicode instead of substituting it', () => {
    const value = 'cœur Œuvre 12 € Ünïcode أمثلة 中文';
    expect(sanitizeText(value)).toBe(value);
  });

  it('never truncates authoritative text', () => {
    const long = 'x'.repeat(5_000);
    expect(sanitizeText(long)).toHaveLength(5_000);
  });

  it('keeps explicit line breaks and collapses only horizontal whitespace', () => {
    expect(sanitizeText('  a\t\t  b  ')).toBe('a b');
    expect(sanitizeText('first\r\nsecond')).toBe('first\nsecond');
    expect(textLines(sanitizeText('first\nsecond'))).toEqual(['first', 'second']);
  });

  it('formats money in minor units without merging currencies', () => {
    expect(formatMoney(123_456, 'MAD')).toBe('1234.56 MAD');
    expect(formatMoney(-50, 'EUR')).toBe('-0.50 EUR');
    expect(formatMoney(0, 'MAD')).toBe('0.00 MAD');
  });
});

describe('PDF script coverage', () => {
  it('covers the Latin, Greek, Cyrillic and Arabic repertoire business text uses', () => {
    for (const character of 'cœur Œuvre € ‰ – — “ ” é à ç ñ Ÿ š Ωμέγα Кириллица') {
      expect(scriptOf(character.codePointAt(0) ?? 0)).not.toBeNull();
    }
    for (const character of 'شركة الأطلس يوسف العلوي ٢٠٢٦') {
      expect(scriptOf(character.codePointAt(0) ?? 0)).not.toBeNull();
    }
    expect(unsupportedCharacters('Cœur & شركة')).toEqual([]);
  });

  it('reports a script no bundled face covers instead of substituting', () => {
    const document: RenderableDocument = {
      title: 'Certificate',
      subtitle: null,
      blocks: [{ kind: 'paragraph', text: 'participant 中文 name' }],
      footer: null,
    };
    expect(unsupportedDocumentCharacters(document).length).toBeGreaterThan(0);
    expect(unsupportedDocumentCharacters(hostileDocument)).toEqual([]);
  });

  it('fails closed rather than drawing a missing-glyph box', async () => {
    await expect(
      renderPdf({
        title: '中文 title',
        subtitle: null,
        blocks: [],
        footer: null,
      }),
    ).rejects.toBeInstanceOf(PdfScriptCoverageError);
  });
});

describe('PDF rendering', () => {
  it('produces valid PDF bytes for hostile input without throwing', async () => {
    const bytes = await renderPdf(hostileDocument);
    expect(bytes.subarray(0, 4).toString()).toBe('%PDF');
    expect(bytes.length).toBeGreaterThan(0);
  });

  it('carries hostile input only as inert drawn text', async () => {
    const bytes = await renderPdf(hostileDocument);
    const raw = bytes.toString('latin1');
    // The only way a PDF can execute anything is an active-content construct, and the
    // renderer emits none: the hostile value is drawn as ordinary literal text.
    for (const construct of ['/JavaScript', '/JS', '/OpenAction', '/Launch', '/EmbeddedFile']) {
      expect(raw).not.toContain(construct);
    }
    expect(await pdfText(bytes)).toContain('script');
  });

  it('drops control characters before they reach the rendered stream', async () => {
    const bytes = await renderPdf({
      title: `bell${String.fromCharCode(7)} null${String.fromCharCode(0)} escape`,
      subtitle: null,
      blocks: [],
      footer: null,
    });
    const drawn = await pdfText(bytes);
    expect(drawn).not.toContain(String.fromCharCode(7));
    expect(drawn).not.toContain(String.fromCharCode(0));
    expect(drawn).toContain('bell null escape');
  });

  it('renders the French ligature as real Unicode rather than replacing it', async () => {
    const drawn = await pdfText(
      await renderPdf({
        title: 'Client coeur',
        subtitle: 'cœur Œuvre',
        blocks: [],
        footer: null,
      }),
    );
    expect(drawn).toContain('cœur Œuvre');
    expect(drawn).not.toContain('?');
  });

  it('wraps a long table cell across lines and pages instead of clipping it', async () => {
    const description = Array.from({ length: 1_500 }, (_, index) => `word${index}`).join(' ');
    const bytes = await renderPdf({
      title: 'Invoice',
      subtitle: null,
      blocks: [{ kind: 'table', columns: ['Description'], rows: [[description]] }],
      footer: null,
    });
    const drawn = await pdfText(bytes);
    // Both the first and the very last token survive, so nothing was clipped away.
    expect(drawn).toContain('word0');
    expect(drawn).toContain('word1499');
    // A cell that cannot fit one page continues onto another.
    expect((await extractPdf(bytes)).pageCount).toBeGreaterThan(1);
  });

  it('wraps an unbroken token instead of dropping its tail', async () => {
    const token = 'A'.repeat(600);
    const drawn = await pdfText(
      await renderPdf({
        title: 'Reference',
        subtitle: null,
        blocks: [{ kind: 'paragraph', text: token }],
        footer: null,
      }),
    );
    expect(drawn.split('A').length - 1).toBe(600);
  });

  it('is deterministic for identical content', async () => {
    const first = await renderPdf(hostileDocument);
    const second = await renderPdf(hostileDocument);
    expect(first.equals(second)).toBe(true);
  });
});

describe('DOCX rendering', () => {
  it('produces a structurally valid OpenXML package', async () => {
    const bytes = await renderDocx(hostileDocument);
    // Local file header of a ZIP container.
    expect(bytes.subarray(0, 2).toString()).toBe('PK');
    expect(bytes.toString('latin1')).toContain('word/document.xml');
  });

  it('escapes hostile free text instead of emitting markup', async () => {
    const xml = docxXml(await renderDocx(hostileDocument));
    expect(xml).toContain('&lt;script&gt;');
    expect(xml).not.toContain('<script>');
  });

  it('emits no macro project and no external relationship target', async () => {
    const bytes = await renderDocx(hostileDocument);
    const raw = bytes.toString('latin1');
    expect(raw).not.toContain('vbaProject.bin');
    expect(docxXml(bytes)).not.toContain('TargetMode="External"');
  });

  it('preserves full Unicode and long text without degradation', async () => {
    const name = 'cœur أمثلة 中文 Ünïcode';
    const description = 'y'.repeat(1_500);
    const xml = docxXml(
      await renderDocx({
        title: name,
        subtitle: null,
        blocks: [{ kind: 'table', columns: ['Description'], rows: [[description]] }],
        footer: null,
      }),
    );
    expect(xml).toContain(name);
    expect(xml).toContain(description);
  });
});

describe('template registry', () => {
  it('registers exactly one template per supported source family', () => {
    const sources = registeredTemplates.map((template) => template.sourceType).sort();
    expect(sources).toEqual([
      'COMMERCIAL_CONTRACT',
      'COMMERCIAL_QUOTATION',
      'INVOICE',
      'PURCHASE_ORDER',
      'TRAINING_ENROLLMENT',
    ]);
  });

  it('exposes a stable identifier and an explicit version for every template', () => {
    for (const template of registeredTemplates) {
      expect(template.templateId).toMatch(/^[a-z]+\.[a-z-]+$/);
      expect(template.version).toBeGreaterThan(0);
      expect([...template.languages].sort()).toEqual(['en', 'fr']);
      expect(resolveTemplate(template.sourceType)).toBe(template);
    }
  });

  it('renders the two contract taxonomies from the same template without collapsing them', () => {
    const template = resolveTemplate('COMMERCIAL_CONTRACT');
    const base = {
      kind: 'COMMERCIAL_CONTRACT' as const,
      reference: 'CT-1',
      status: 'ACTIVE',
      currency: 'MAD',
      contractValueCents: 1_000,
      taxCents: 200,
      totalCents: 1_200,
      termsSummary: null,
      effectiveDate: null,
      startDate: null,
      endDate: null,
      party: { clientName: 'Client', missionTitle: null },
    };
    const recruitment = template.build({ ...base, businessType: 'RECRUITMENT' }, 'fr');
    const training = template.build({ ...base, businessType: 'TRAINING' }, 'fr');
    expect(recruitment.title).toContain('Contrat de recrutement');
    expect(training.title).toContain('Contrat de formation');
  });

  it('keeps a long contract term intact in the renderable document', () => {
    const terms = 'z'.repeat(2_000);
    const built = resolveTemplate('COMMERCIAL_CONTRACT').build(
      {
        kind: 'COMMERCIAL_CONTRACT',
        reference: 'CT-2',
        businessType: 'RECRUITMENT',
        status: 'ACTIVE',
        currency: 'MAD',
        contractValueCents: 1_000,
        taxCents: 0,
        totalCents: 1_000,
        termsSummary: terms,
        effectiveDate: null,
        startDate: null,
        endDate: null,
        party: { clientName: 'Client', missionTitle: null },
      },
      'fr',
    );
    const paragraph = built.blocks.find((block) => block.kind === 'paragraph');
    expect(paragraph && 'text' in paragraph ? paragraph.text : '').toHaveLength(2_000);
  });
});
