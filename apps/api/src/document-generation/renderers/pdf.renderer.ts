import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { PDFFont, PDFPage } from 'pdf-lib';

import type { RenderableBlock, RenderableDocument } from '../renderable-document.js';
import { sanitizeText } from '../renderable-document.js';

/**
 * Pure-JavaScript PDF renderer.
 *
 * `pdf-lib` builds the file in process with no native binary, no headless browser, and
 * no shell invocation, so generation adds no machine prerequisite and cannot be steered
 * into executing anything. Text is drawn as literal strings; there is no markup or
 * scripting path into the output.
 */

const pageWidth = 595.28;
const pageHeight = 841.89;
const margin = 56;
const contentWidth = pageWidth - margin * 2;
const bodySize = 10;
const headingSize = 13;
const titleSize = 18;
const lineHeight = 14;

/** Fixed document metadata keeps identical content byte-identical between renders. */
const fixedTimestamp = new Date(Date.UTC(2000, 0, 1));

type Cursor = { page: PDFPage; y: number };

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const words = text.split(' ').filter((word) => word.length > 0);
  if (words.length === 0) {
    return [''];
  }
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current.length === 0 ? word : `${current} ${word}`;
    if (font.widthOfTextAtSize(candidate, size) <= width || current.length === 0) {
      current = candidate;
      continue;
    }
    lines.push(current);
    current = word;
  }
  lines.push(current);
  return lines;
}

export async function renderPdf(document: RenderableDocument): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  pdf.setTitle(sanitizeText(document.title));
  pdf.setProducer('Hire Me Platform');
  pdf.setCreator('Hire Me Platform');
  pdf.setCreationDate(fixedTimestamp);
  pdf.setModificationDate(fixedTimestamp);

  const cursor: Cursor = { page: pdf.addPage([pageWidth, pageHeight]), y: pageHeight - margin };

  const ensureSpace = (needed: number): void => {
    if (cursor.y - needed < margin) {
      cursor.page = pdf.addPage([pageWidth, pageHeight]);
      cursor.y = pageHeight - margin;
    }
  };

  const drawLines = (text: string, font: PDFFont, size: number, indent = 0): void => {
    for (const line of wrap(sanitizeText(text), font, size, contentWidth - indent)) {
      ensureSpace(lineHeight);
      cursor.page.drawText(line, {
        x: margin + indent,
        y: cursor.y,
        size,
        font,
        color: rgb(0.1, 0.1, 0.1),
      });
      cursor.y -= lineHeight;
    }
  };

  drawLines(document.title, bold, titleSize);
  cursor.y -= 4;
  if (document.subtitle) {
    drawLines(document.subtitle, regular, bodySize);
  }
  cursor.y -= 8;

  for (const block of document.blocks) {
    drawBlock(block, { drawLines, ensureSpace, cursor, regular, bold });
  }

  if (document.footer) {
    cursor.y -= 8;
    drawLines(document.footer, regular, bodySize - 1);
  }

  const bytes = await pdf.save({ useObjectStreams: false });
  return Buffer.from(bytes);
}

function drawBlock(
  block: RenderableBlock,
  context: {
    drawLines: (text: string, font: PDFFont, size: number, indent?: number) => void;
    ensureSpace: (needed: number) => void;
    cursor: Cursor;
    regular: PDFFont;
    bold: PDFFont;
  },
): void {
  const { drawLines, ensureSpace, cursor, regular, bold } = context;
  switch (block.kind) {
    case 'heading':
      cursor.y -= 6;
      drawLines(block.text, bold, headingSize);
      cursor.y -= 2;
      return;
    case 'paragraph':
      drawLines(block.text, regular, bodySize);
      cursor.y -= 4;
      return;
    case 'keyValues':
      for (const row of block.rows) {
        drawLines(`${row.label}: ${row.value}`, regular, bodySize);
      }
      cursor.y -= 4;
      return;
    case 'table': {
      const columnCount = Math.max(block.columns.length, 1);
      const columnWidth = contentWidth / columnCount;
      const drawRow = (cells: readonly string[], font: PDFFont): void => {
        ensureSpace(lineHeight);
        cells.forEach((cell, index) => {
          const text = sanitizeText(cell);
          let clipped = text;
          while (
            clipped.length > 0 &&
            font.widthOfTextAtSize(clipped, bodySize - 1) > columnWidth - 6
          ) {
            clipped = clipped.slice(0, -1);
          }
          cursor.page.drawText(clipped, {
            x: margin + index * columnWidth,
            y: cursor.y,
            size: bodySize - 1,
            font,
            color: rgb(0.1, 0.1, 0.1),
          });
        });
        cursor.y -= lineHeight;
      };
      drawRow(block.columns, bold);
      for (const row of block.rows) {
        drawRow(row, regular);
      }
      cursor.y -= 4;
      return;
    }
    default: {
      const exhaustive: never = block;
      throw new Error(`Unsupported renderable block: ${JSON.stringify(exhaustive)}`);
    }
  }
}
