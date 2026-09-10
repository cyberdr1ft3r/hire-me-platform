import PDFDocument from 'pdfkit';

import type { FontScript, FontWeight } from './font-registry.js';
import {
  fontAsset,
  fontBytes,
  registeredFontAssets,
  unsupportedCharacters,
} from './font-registry.js';
import { splitUnbrokenToken } from './line-breaking.js';
import { ShapedTextWriter } from './pdf-text-mapping.js';
import type { RunGroup } from './text-runs.js';
import { lineIsRtl, runGroups, visualRuns } from './text-runs.js';
import type { RenderableBlock, RenderableDocument } from '../renderable-document.js';
import { sanitizeText, textLines } from '../renderable-document.js';

/**
 * Pure-JavaScript Unicode PDF renderer.
 *
 * PDFKit builds the file in process with no native binary, no headless browser, no office
 * suite, and no shell, so generation adds no machine prerequisite and offers no command
 * or URL injection surface. It embeds the bundled TrueType faces through `fontkit`, which
 * performs real OpenType shaping, so Arabic is rendered as properly joined contextual
 * forms rather than isolated letters. Bidirectional ordering comes from `bidi-js`
 * (UAX #9); nothing reverses strings or substitutes presentation forms by hand.
 *
 * The output is real text in both senses. Visually, glyphs are the shaper's contextual
 * forms placed in UAX #9 visual order. Semantically, every drawn glyph maps back to the
 * source characters it came from, so copying, searching, and extracting return the
 * original Unicode; `pdf-text-mapping.ts` explains what PDFKit gets wrong there and how
 * this renderer corrects it.
 *
 * Nothing is clipped or truncated: long values wrap across lines and pages so the full
 * authoritative text is represented.
 */

const pageWidth = 595.28;
const pageHeight = 841.89;
const margin = 56;
const contentWidth = pageWidth - margin * 2;
const bodySize = 10;
const cellSize = 9;
const headingSize = 13;
const titleSize = 18;
const lineGap = 4;
const cellPadding = 6;

/** Fixed metadata keeps identical content byte-identical between renders. */
const fixedTimestamp = new Date(Date.UTC(2000, 0, 1));

type Pdf = PDFKit.PDFDocument;

function fontKey(script: FontScript, weight: FontWeight): string {
  return fontAsset(script, weight).id;
}

function registerFonts(pdf: Pdf): void {
  for (const { script, weight } of registeredFontAssets()) {
    pdf.registerFont(fontKey(script, weight), fontBytes(script, weight));
  }
}

type LaidOutGroup = RunGroup & { width: number };
type LaidOutLine = { groups: LaidOutGroup[]; width: number };

function measureGroups(
  writer: ShapedTextWriter,
  groups: RunGroup[],
  weight: FontWeight,
  size: number,
): LaidOutGroup[] {
  return groups.map((group) => ({
    ...group,
    width: writer.measure(fontKey(group.script, weight), size, group.segments),
  }));
}

/**
 * Wraps one logical line, then reorders each display line for presentation.
 *
 * Order matters here. Wrapping is performed on the text in **logical** order, which is
 * how a reader composes it, and only then is each resulting display line passed through
 * the bidirectional algorithm. That is exactly the sequence UAX #9 prescribes: the
 * reordering rules apply per display line, after line breaking. Reordering first and
 * wrapping afterwards would lay right-to-left words out left to right, which reads as
 * scrambled Arabic even though every glyph is correct.
 *
 * A token wider than the line is split at a grapheme boundary rather than clipped, so no
 * authoritative text is ever lost. `splitUnbrokenToken` combines a bounded search with a
 * finite contextual-recovery pass, and every candidate it accepts is measured here,
 * shaped exactly as it is drawn.
 */
function layoutLine(
  writer: ShapedTextWriter,
  line: string,
  weight: FontWeight,
  size: number,
  width: number,
  base: 'ltr' | 'rtl',
): LaidOutLine[] {
  const toDisplayLine = (text: string): LaidOutLine => {
    const groups = measureGroups(writer, runGroups(visualRuns(text, weight, base)), weight, size);
    return { groups, width: groups.reduce((total, group) => total + group.width, 0) };
  };

  const measure = (text: string): number => toDisplayLine(text).width;

  if (line.length === 0) {
    return [{ groups: [], width: 0 }];
  }

  const segments: string[] = [];
  let current = '';

  const breakLongToken = (token: string): void => {
    segments.push(...splitUnbrokenToken(token, (text) => measure(text) <= width));
  };

  for (const token of line.split(/(\s+)/).filter((piece) => piece.length > 0)) {
    const candidate = current + token;
    if (measure(candidate) <= width) {
      current = candidate;
      continue;
    }
    if (current.length > 0) {
      segments.push(current.trimEnd());
      current = '';
    }
    const standalone = token.trimStart();
    if (standalone.length === 0) {
      continue;
    }
    if (measure(standalone) <= width) {
      current = standalone;
      continue;
    }
    breakLongToken(standalone);
    current = segments.pop() ?? '';
  }
  if (current.length > 0 || segments.length === 0) {
    segments.push(current);
  }

  return segments.map(toDisplayLine);
}

function lineHeightFor(size: number): number {
  return size + lineGap;
}

export async function renderPdf(document: RenderableDocument): Promise<Buffer> {
  assertScriptCoverage(document);

  const pdf = new PDFDocument({
    size: [pageWidth, pageHeight],
    margins: { top: margin, bottom: margin, left: margin, right: margin },
    autoFirstPage: true,
    info: {
      Title: sanitizeText(document.title),
      Producer: 'Hire Me Platform',
      Creator: 'Hire Me Platform',
      CreationDate: fixedTimestamp,
      ModDate: fixedTimestamp,
    },
  });
  registerFonts(pdf);
  const writer = new ShapedTextWriter(pdf);

  const chunks: Buffer[] = [];
  pdf.on('data', (chunk: Buffer) => chunks.push(chunk));
  const finished = new Promise<void>((resolve, reject) => {
    pdf.on('end', () => resolve());
    pdf.on('error', (error: Error) => reject(error));
  });

  const cursor = { y: margin };

  const ensureSpace = (needed: number): void => {
    if (cursor.y + needed > pageHeight - margin) {
      pdf.addPage();
      cursor.y = margin;
    }
  };

  /** Draws one laid-out line, right-aligning it when the paragraph reads right to left. */
  const drawLine = (
    laidOut: LaidOutLine,
    weight: FontWeight,
    size: number,
    left: number,
    available: number,
    rightToLeft: boolean,
  ): void => {
    let x = rightToLeft ? left + available - laidOut.width : left;
    // One baseline for the whole line, taken from the Latin face, so that a mixed line
    // does not sit its Arabic and Latin stretches at two different heights.
    const ascent = writer.ascent(fontKey('latin', weight), size);
    for (const group of laidOut.groups) {
      writer.draw(fontKey(group.script, weight), size, group.segments, x, cursor.y, ascent);
      x += group.width;
    }
  };

  const drawText = (text: string, weight: FontWeight, size: number, indent = 0): void => {
    const available = contentWidth - indent;
    for (const logicalLine of textLines(sanitizeText(text))) {
      const rightToLeft = lineIsRtl(logicalLine);
      const base = rightToLeft ? 'rtl' : 'ltr';
      for (const laidOut of layoutLine(writer, logicalLine, weight, size, available, base)) {
        ensureSpace(lineHeightFor(size));
        drawLine(laidOut, weight, size, margin + indent, available, rightToLeft);
        cursor.y += lineHeightFor(size);
      }
    }
  };

  drawText(document.title, 'bold', titleSize);
  cursor.y += 4;
  if (document.subtitle) {
    drawText(document.subtitle, 'regular', bodySize);
  }
  cursor.y += 8;

  for (const block of document.blocks) {
    drawBlock(writer, block, { drawText, ensureSpace, drawLine, cursor });
  }

  if (document.footer) {
    cursor.y += 8;
    drawText(document.footer, 'regular', bodySize - 1);
  }

  pdf.end();
  await finished;
  return Buffer.concat(chunks);
}

type DrawContext = {
  drawText: (text: string, weight: FontWeight, size: number, indent?: number) => void;
  ensureSpace: (needed: number) => void;
  drawLine: (
    laidOut: LaidOutLine,
    weight: FontWeight,
    size: number,
    left: number,
    available: number,
    rightToLeft: boolean,
  ) => void;
  cursor: { y: number };
};

function drawBlock(writer: ShapedTextWriter, block: RenderableBlock, context: DrawContext): void {
  const { drawText, ensureSpace, drawLine, cursor } = context;
  switch (block.kind) {
    case 'heading':
      cursor.y += 6;
      drawText(block.text, 'bold', headingSize);
      cursor.y += 2;
      return;
    case 'paragraph':
      drawText(block.text, 'regular', bodySize);
      cursor.y += 4;
      return;
    case 'keyValues':
      for (const row of block.rows) {
        drawText(`${row.label}: ${row.value}`, 'regular', bodySize);
      }
      cursor.y += 4;
      return;
    case 'table': {
      const columnCount = Math.max(block.columns.length, 1);
      const columnWidth = contentWidth / columnCount;
      const usableWidth = columnWidth - cellPadding;

      const drawRow = (cells: readonly string[], weight: FontWeight): void => {
        const wrapped = cells.map((cell) =>
          textLines(sanitizeText(cell)).flatMap((logicalLine) => {
            const rightToLeft = lineIsRtl(logicalLine);
            const base = rightToLeft ? 'rtl' : 'ltr';
            return layoutLine(writer, logicalLine, weight, cellSize, usableWidth, base).map(
              (laidOut) => ({ laidOut, rightToLeft }),
            );
          }),
        );
        const rowLines = Math.max(...wrapped.map((lines) => lines.length), 1);
        const height = lineHeightFor(cellSize);
        let drawn = 0;
        while (drawn < rowLines) {
          const available = Math.max(Math.floor((pageHeight - margin - cursor.y) / height), 0);
          if (available === 0) {
            // A tall row continues on the next page instead of losing its remaining text.
            ensureSpace(height);
            continue;
          }
          const chunk = Math.min(rowLines - drawn, available);
          const startY = cursor.y;
          for (let offset = 0; offset < chunk; offset += 1) {
            wrapped.forEach((lines, index) => {
              const entry = lines[drawn + offset];
              if (!entry) {
                return;
              }
              cursor.y = startY + offset * height;
              drawLine(
                entry.laidOut,
                weight,
                cellSize,
                margin + index * columnWidth,
                usableWidth,
                entry.rightToLeft,
              );
            });
          }
          cursor.y = startY + chunk * height;
          drawn += chunk;
        }
        cursor.y += 2;
      };

      drawRow(block.columns, 'bold');
      for (const row of block.rows) {
        drawRow(row, 'regular');
      }
      cursor.y += 4;
      return;
    }
    default: {
      const exhaustive: never = block;
      throw new Error(`Unsupported renderable block: ${JSON.stringify(exhaustive)}`);
    }
  }
}

/** Every string a document renders, for coverage checking. */
export function documentStrings(document: RenderableDocument): string[] {
  const values: string[] = [document.title, document.subtitle ?? '', document.footer ?? ''];
  for (const block of document.blocks) {
    switch (block.kind) {
      case 'heading':
      case 'paragraph':
        values.push(block.text);
        break;
      case 'keyValues':
        for (const row of block.rows) {
          values.push(row.label, row.value);
        }
        break;
      case 'table':
        values.push(...block.columns);
        for (const row of block.rows) {
          values.push(...row);
        }
        break;
      default: {
        const exhaustive: never = block;
        throw new Error(`Unsupported renderable block: ${JSON.stringify(exhaustive)}`);
      }
    }
  }
  return values;
}

/** Characters no bundled face covers, judged on the text that will actually be drawn. */
export function unsupportedDocumentCharacters(document: RenderableDocument): string[] {
  const found = new Set<string>();
  for (const value of documentStrings(document)) {
    for (const character of unsupportedCharacters(sanitizeText(value))) {
      found.add(character);
    }
  }
  return [...found];
}

function assertScriptCoverage(document: RenderableDocument): void {
  const unsupported = unsupportedDocumentCharacters(document);
  if (unsupported.length > 0) {
    throw new PdfScriptCoverageError(unsupported);
  }
}

/** Raised instead of substituting a character the bundled faces cannot render. */
export class PdfScriptCoverageError extends Error {
  constructor(readonly characters: string[]) {
    super('The source text uses a script no bundled PDF font covers.');
    this.name = 'PdfScriptCoverageError';
  }
}
