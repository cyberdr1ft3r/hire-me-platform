import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { PDFFont, PDFPage } from 'pdf-lib';

import type { RenderableBlock, RenderableDocument } from '../renderable-document.js';
import { sanitizeText, textLines } from '../renderable-document.js';

/**
 * Pure-JavaScript PDF renderer.
 *
 * `pdf-lib` builds the file in process with no native binary, no headless browser, and
 * no shell invocation, so generation adds no machine prerequisite and cannot be steered
 * into executing anything. Text is drawn as literal strings; there is no markup or
 * scripting path into the output.
 *
 * Nothing is clipped or truncated. Long values wrap across lines and pages so the full
 * authoritative text is represented, because an official business output must not
 * silently drop part of a line description or a contract term.
 */

const pageWidth = 595.28;
const pageHeight = 841.89;
const margin = 56;
const contentWidth = pageWidth - margin * 2;
const bodySize = 10;
const cellSize = 9;
const headingSize = 13;
const titleSize = 18;
const lineHeight = 14;
const cellLineHeight = 12;
const cellPadding = 6;

/** Fixed document metadata keeps identical content byte-identical between renders. */
const fixedTimestamp = new Date(Date.UTC(2000, 0, 1));

type Cursor = { page: PDFPage; y: number };

/**
 * Wraps one logical line to a width.
 *
 * A single word longer than the available width is split rather than clipped, so an
 * unbroken reference or identifier still appears in full.
 */
function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const words = text.split(' ').filter((word) => word.length > 0);
  if (words.length === 0) {
    return [''];
  }
  const lines: string[] = [];
  let current = '';

  const pushBrokenWord = (word: string): void => {
    let remainder = word;
    while (font.widthOfTextAtSize(remainder, size) > width && remainder.length > 1) {
      let take = remainder.length - 1;
      while (take > 1 && font.widthOfTextAtSize(remainder.slice(0, take), size) > width) {
        take -= 1;
      }
      lines.push(remainder.slice(0, take));
      remainder = remainder.slice(take);
    }
    current = remainder;
  };

  for (const word of words) {
    const candidate = current.length === 0 ? word : `${current} ${word}`;
    if (font.widthOfTextAtSize(candidate, size) <= width) {
      current = candidate;
      continue;
    }
    if (current.length > 0) {
      lines.push(current);
      current = '';
    }
    if (font.widthOfTextAtSize(word, size) > width) {
      pushBrokenWord(word);
      continue;
    }
    current = word;
  }
  if (current.length > 0 || lines.length === 0) {
    lines.push(current);
  }
  return lines;
}

/** Every physical line a value needs, honouring explicit line breaks then wrapping. */
function layoutLines(text: string, font: PDFFont, size: number, width: number): string[] {
  return textLines(sanitizeText(text)).flatMap((line) => wrap(line, font, size, width));
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
    for (const line of layoutLines(text, font, size, contentWidth - indent)) {
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
      const usableWidth = columnWidth - cellPadding;

      /** Draws one row as a multi-line cell block so nothing is clipped. */
      const drawRow = (cells: readonly string[], font: PDFFont): void => {
        const wrapped = cells.map((cell) => layoutLines(cell, font, cellSize, usableWidth));
        const rowLines = Math.max(...wrapped.map((lines) => lines.length), 1);
        let drawn = 0;
        while (drawn < rowLines) {
          // A tall row continues on the next page instead of losing its remaining text.
          const remaining = rowLines - drawn;
          const available = Math.max(Math.floor((cursor.y - margin) / cellLineHeight), 0);
          if (available === 0) {
            ensureSpace(cellLineHeight);
            continue;
          }
          const chunk = Math.min(remaining, available);
          for (let offset = 0; offset < chunk; offset += 1) {
            wrapped.forEach((lines, index) => {
              const line = lines[drawn + offset];
              if (line === undefined || line.length === 0) {
                return;
              }
              cursor.page.drawText(line, {
                x: margin + index * columnWidth,
                y: cursor.y - offset * cellLineHeight,
                size: cellSize,
                font,
                color: rgb(0.1, 0.1, 0.1),
              });
            });
          }
          cursor.y -= chunk * cellLineHeight;
          drawn += chunk;
        }
        cursor.y -= 2;
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
