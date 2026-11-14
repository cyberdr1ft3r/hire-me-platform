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
const ink = '#102a2e';
const muted = '#5f7378';
const brandTeal = '#0d6675';
const paleTeal = '#dceef1';
const paleGray = '#edf1f2';
const panelBorder = '#c8d5d8';
const statusFill = '#e1f2ea';

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

  const drawAbsoluteText = (
    text: string,
    weight: FontWeight,
    size: number,
    left: number,
    top: number,
    available: number,
    color: string,
    align: 'left' | 'right' = 'left',
  ): number => {
    const sanitized = sanitizeText(text);
    const rightToLeft = lineIsRtl(sanitized);
    const base = rightToLeft ? 'rtl' : 'ltr';
    const lines = layoutLine(writer, sanitized, weight, size, available, base);
    pdf.fillColor(color);
    let y = top;
    for (const laidOut of lines) {
      let x = align === 'right' ? left + available - laidOut.width : left;
      const ascent = writer.ascent(fontKey('latin', weight), size);
      for (const group of laidOut.groups) {
        writer.draw(fontKey(group.script, weight), size, group.segments, x, y, ascent);
        x += group.width;
      }
      y += lineHeightFor(size);
    }
    pdf.fillColor(ink);
    return y;
  };

  const branded = document.presentation?.kind === 'hireme-commercial';
  pdf.fillColor(ink);
  if (branded && document.presentation) {
    pdf.rect(margin, 40, contentWidth, 4).fill(brandTeal);
    const hire = layoutLine(writer, 'HIRE', 'bold', 24, 120, 'ltr')[0]!;
    drawAbsoluteText('HIRE', 'bold', 24, margin, 66, 120, brandTeal);
    // The approved wordmark is preserved; only the inter-word gap is tightened to 6 pt.
    drawAbsoluteText('ME', 'bold', 24, margin + hire.width + 6, 66, 80, brandTeal);
    drawAbsoluteText('Cabinet de recrutement digital', 'regular', 8, margin, 94, 230, muted);
    let sellerBottom = 112;
    if (document.pdfInvoice) {
      for (const line of document.pdfInvoice.sellerLines) {
        sellerBottom = drawAbsoluteText(line, 'regular', 9, margin, sellerBottom, 285, ink);
        sellerBottom += 2;
      }
      const contact = (label: string, target: string | null, color: string) => {
        const top = sellerBottom;
        sellerBottom = drawAbsoluteText(label, 'regular', 9, margin, top, 285, color);
        if (target) {
          pdf.link(margin, top, 285, sellerBottom - top, target);
        }
        sellerBottom += 2;
      };
      const email = document.pdfInvoice.sellerEmail;
      if (email) {
        contact(email, /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? `mailto:${email}` : null, ink);
      }
      const website = document.pdfInvoice.sellerWebsite;
      if (website) {
        let target: string | null = null;
        try {
          const parsed = new URL(website.url);
          target =
            ['https:', 'http:'].includes(parsed.protocol) && parsed.hostname ? parsed.href : null;
        } catch {
          // Show the saved text without creating an invalid or unsafe PDF link.
        }
        contact(website.label, target, brandTeal);
      }
    }
    drawAbsoluteText(
      document.presentation.documentLabel,
      'bold',
      22,
      pageWidth - margin - 230,
      65,
      230,
      ink,
      'right',
    );
    drawAbsoluteText(
      document.presentation.reference,
      'bold',
      11,
      pageWidth - margin - 230,
      94,
      230,
      brandTeal,
      'right',
    );
    if (document.presentation.status) {
      const badgeWidth = 92;
      const badgeLeft = pageWidth - margin - 230 - badgeWidth - 12;
      pdf.rect(badgeLeft, 113, badgeWidth, 22).fill(statusFill);
      drawAbsoluteText(
        document.presentation.status.toUpperCase(),
        'bold',
        9,
        badgeLeft + 7,
        119,
        badgeWidth - 14,
        ink,
      );
    }
    document.presentation.details.forEach((row, index) => {
      drawAbsoluteText(
        `${row.label}: ${row.value}`,
        'regular',
        8,
        pageWidth - margin - 230,
        113 + index * 13,
        230,
        muted,
        'right',
      );
    });
    cursor.y = document.pdfInvoice ? Math.max(174, sellerBottom + 20) : 151;
  } else {
    drawText(document.title, 'bold', titleSize);
    cursor.y += 4;
    if (document.subtitle) {
      drawText(document.subtitle, 'regular', bodySize);
    }
    cursor.y += 8;
  }

  if (document.pdfInvoice) {
    const invoice = document.pdfInvoice;
    const measuredHeight = (value: string, size: number, width: number, weight: FontWeight) =>
      textLines(sanitizeText(value)).reduce(
        (total, line) =>
          total +
          layoutLine(writer, line, weight, size, width, lineIsRtl(line) ? 'rtl' : 'ltr').length *
            lineHeightFor(size),
        0,
      );
    const clientHeight = Math.max(
      68,
      30 +
        invoice.clientLines.reduce(
          (total, line, index) =>
            total +
            measuredHeight(
              line,
              index === 0 ? 13 : 9,
              contentWidth - 24,
              index === 0 ? 'bold' : 'regular',
            ) +
            2,
          0,
        ),
    );
    ensureSpace(clientHeight + 30);
    pdf.rect(margin, cursor.y, contentWidth, clientHeight).fill(paleTeal);
    drawAbsoluteText(
      invoice.clientHeading.toUpperCase(),
      'bold',
      10,
      margin + 12,
      cursor.y + 10,
      contentWidth - 24,
      brandTeal,
    );
    let clientY = cursor.y + 30;
    invoice.clientLines.forEach((line, index) => {
      clientY =
        drawAbsoluteText(
          line,
          index === 0 ? 'bold' : 'regular',
          index === 0 ? 13 : 9,
          margin + 12,
          clientY,
          contentWidth - 24,
          ink,
        ) + 2;
    });
    cursor.y += clientHeight + 26;

    const widths = [220, 42, 91, 52, contentWidth - 405];
    const starts = widths.map(
      (_, index) => margin + widths.slice(0, index).reduce((sum, width) => sum + width, 0),
    );
    const drawCellLine = (
      line: LaidOutLine,
      x: number,
      y: number,
      available: number,
      alignRight: boolean,
      weight: FontWeight,
      size: number,
    ) => {
      let left = alignRight ? x + available - line.width : x;
      const ascent = writer.ascent(fontKey('latin', weight), size);
      for (const group of line.groups) {
        writer.draw(fontKey(group.script, weight), size, group.segments, left, y, ascent);
        left += group.width;
      }
    };
    const headerHeight = Math.max(
      30,
      14 +
        Math.max(
          ...invoice.columns.map((column, index) =>
            measuredHeight(column, 8, widths[index]! - 14, 'bold'),
          ),
        ),
    );
    const drawTableHeader = () => {
      ensureSpace(headerHeight + 50);
      const top = cursor.y;
      pdf.rect(margin, top, contentWidth, headerHeight).fill(brandTeal);
      invoice.columns.forEach((column, index) => {
        const x = starts[index]!;
        const width = widths[index]!;
        drawAbsoluteText(
          column,
          'bold',
          8,
          x + 7,
          top + 10,
          width - 14,
          '#ffffff',
          index === 0 ? 'left' : 'right',
        );
      });
      cursor.y += headerHeight;
    };
    drawTableHeader();
    for (const row of invoice.rows) {
      const laidOut = row.map((cell, index) =>
        textLines(sanitizeText(cell)).flatMap((line) =>
          layoutLine(
            writer,
            line,
            index === 0 ? 'bold' : 'regular',
            9,
            widths[index]! - 14,
            lineIsRtl(line) ? 'rtl' : 'ltr',
          ),
        ),
      );
      const lineCount = Math.max(1, ...laidOut.map((lines) => lines.length));
      let offset = 0;
      while (offset < lineCount) {
        const remainingHeight = pageHeight - margin - 15 - cursor.y;
        if (remainingHeight < 42) {
          pdf.addPage();
          cursor.y = margin;
          drawTableHeader();
          continue;
        }
        const chunk = Math.min(
          lineCount - offset,
          Math.max(1, Math.floor((remainingHeight - 14) / 14)),
        );
        const rowHeight = Math.max(42, chunk * 14 + 14);
        const top = cursor.y;
        pdf.rect(margin, top, contentWidth, rowHeight).fillAndStroke('#ffffff', panelBorder);
        for (let index = 1; index < widths.length; index += 1) {
          pdf
            .moveTo(starts[index]!, top)
            .lineTo(starts[index]!, top + rowHeight)
            .stroke(panelBorder);
        }
        pdf.fillColor(ink);
        laidOut.forEach((lines, index) => {
          const x = starts[index]! + 7;
          const available = widths[index]! - 14;
          lines
            .slice(offset, offset + chunk)
            .forEach((line, lineIndex) =>
              drawCellLine(
                line,
                x,
                top + 9 + lineIndex * 14,
                available,
                index !== 0,
                index === 0 ? 'bold' : 'regular',
                9,
              ),
            );
        });
        cursor.y += rowHeight;
        offset += chunk;
      }
    }
    cursor.y += 20;
    const totalsWidth = 228;
    const totalsLeft = margin + contentWidth - totalsWidth;
    ensureSpace(invoice.totals.length * 31 + 16);
    invoice.totals.forEach((row, index) => {
      const top = cursor.y + index * 31;
      const final = index === invoice.totals.length - 1;
      pdf.rect(totalsLeft, top, totalsWidth, 31).fill(final ? brandTeal : paleTeal);
      drawAbsoluteText(
        row.label,
        'bold',
        final ? 11 : 9,
        totalsLeft + 9,
        top + 9,
        105,
        final ? '#ffffff' : ink,
      );
      drawAbsoluteText(
        row.value,
        'bold',
        final ? 11 : 9,
        totalsLeft + 116,
        top + 9,
        totalsWidth - 125,
        final ? '#ffffff' : brandTeal,
        'right',
      );
    });
    cursor.y += invoice.totals.length * 31 + 22;
    if (invoice.amountInWords) {
      const height = 26 + measuredHeight(invoice.amountInWords, 9, contentWidth - 20, 'regular');
      ensureSpace(height + 15);
      pdf.rect(margin, cursor.y, contentWidth, height).fill(paleTeal);
      drawAbsoluteText(
        invoice.amountHeading,
        'bold',
        9,
        margin + 10,
        cursor.y + 7,
        contentWidth - 20,
        brandTeal,
      );
      drawAbsoluteText(
        invoice.amountInWords,
        'regular',
        9,
        margin + 10,
        cursor.y + 24,
        contentWidth - 20,
        ink,
      );
      cursor.y += height + 18;
    }
    if (invoice.paymentLines.length > 0) {
      const height =
        29 +
        invoice.paymentLines.reduce(
          (sum, line) => sum + measuredHeight(line, 9, contentWidth - 20, 'regular') + 2,
          0,
        );
      ensureSpace(height + 15);
      pdf.rect(margin, cursor.y, contentWidth, height).stroke(panelBorder);
      pdf.rect(margin, cursor.y, contentWidth, 23).fill(paleTeal);
      drawAbsoluteText(
        invoice.paymentHeading,
        'bold',
        10,
        margin + 10,
        cursor.y + 6,
        contentWidth - 20,
        brandTeal,
      );
      let lineY = cursor.y + 29;
      for (const line of invoice.paymentLines) {
        lineY =
          drawAbsoluteText(line, 'regular', 9, margin + 10, lineY, contentWidth - 20, ink) + 2;
      }
      cursor.y += height + 15;
    }
    if (invoice.taxTreatment) {
      const height = 29 + measuredHeight(invoice.taxTreatment, 9, contentWidth - 20, 'regular');
      ensureSpace(height + 15);
      pdf.rect(margin, cursor.y, contentWidth, height).stroke(panelBorder);
      pdf.rect(margin, cursor.y, contentWidth, 23).fill(paleTeal);
      drawAbsoluteText(
        (invoice.taxHeading ?? '').toUpperCase(),
        'bold',
        10,
        margin + 10,
        cursor.y + 6,
        contentWidth - 20,
        brandTeal,
      );
      drawAbsoluteText(
        invoice.taxTreatment,
        'regular',
        9,
        margin + 10,
        cursor.y + 29,
        contentWidth - 20,
        ink,
      );
      cursor.y += height + 15;
    }
  } else {
    for (const block of document.blocks) {
      drawBlock(writer, block, {
        pdf,
        branded,
        drawText,
        ensureSpace,
        drawLine,
        drawAbsoluteText,
        cursor,
      });
    }
  }

  const footer = document.pdfInvoice?.footer ?? document.footer;
  if (footer) {
    if (branded) {
      const footerY = pageHeight - 42;
      pdf
        .moveTo(margin, footerY - 8)
        .lineTo(pageWidth - margin, footerY - 8)
        .stroke(panelBorder);
      drawAbsoluteText(footer, 'regular', 7, margin, footerY, contentWidth, muted);
    } else {
      cursor.y += 8;
      drawText(footer, 'regular', bodySize - 1);
    }
  }

  pdf.end();
  await finished;
  return Buffer.concat(chunks);
}

type DrawContext = {
  pdf: Pdf;
  branded: boolean;
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
  drawAbsoluteText: (
    text: string,
    weight: FontWeight,
    size: number,
    left: number,
    top: number,
    available: number,
    color: string,
    align?: 'left' | 'right',
  ) => number;
  cursor: { y: number };
};

function drawBlock(writer: ShapedTextWriter, block: RenderableBlock, context: DrawContext): void {
  const { pdf, branded, drawText, ensureSpace, drawLine, drawAbsoluteText, cursor } = context;
  switch (block.kind) {
    case 'heading':
      if (branded) {
        cursor.y += 7;
        ensureSpace(24);
        pdf.rect(margin, cursor.y, contentWidth, 22).fill(paleGray);
        cursor.y += 5;
        pdf.fillColor(brandTeal);
        drawText(block.text.toUpperCase(), 'bold', 10);
        pdf.fillColor(ink);
        cursor.y += 5;
      } else {
        cursor.y += 6;
        drawText(block.text, 'bold', headingSize);
        cursor.y += 2;
      }
      return;
    case 'paragraph':
      drawText(block.text, 'regular', bodySize);
      cursor.y += 4;
      return;
    case 'keyValues':
      for (const row of block.rows) {
        drawText(`${row.label}: ${row.value}`, 'regular', branded ? 9 : bodySize);
      }
      cursor.y += branded ? 7 : 4;
      return;
    case 'table': {
      const columnCount = Math.max(block.columns.length, 1);
      const columnWidth = contentWidth / columnCount;
      const usableWidth = columnWidth - cellPadding;

      const drawRow = (cells: readonly string[], weight: FontWeight, isHeader = false): void => {
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
          if (branded) {
            const chunkHeight = chunk * height + 4;
            pdf
              .rect(margin, startY - 2, contentWidth, chunkHeight)
              .fillAndStroke(isHeader ? brandTeal : '#ffffff', panelBorder);
            for (let index = 1; index < columnCount; index += 1) {
              const x = margin + index * columnWidth;
              pdf
                .moveTo(x, startY - 2)
                .lineTo(x, startY - 2 + chunkHeight)
                .stroke(panelBorder);
            }
            pdf.fillColor(isHeader ? '#ffffff' : ink);
          }
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
          pdf.fillColor(ink);
        }
        cursor.y += branded ? 6 : 2;
      };

      drawRow(block.columns, 'bold', true);
      for (const row of block.rows) {
        drawRow(row, 'regular');
      }
      cursor.y += branded ? 8 : 4;
      return;
    }
    case 'panelGrid': {
      const panels = block.panels.slice(0, 2);
      if (panels.length === 0) {
        return;
      }
      const gap = panels.length > 1 ? 4 : 0;
      const panelWidth = (contentWidth - gap) / panels.length;
      const innerWidth = panelWidth - 16;
      const panelLines = panels.map((panel) =>
        panel.rows.map((row) => {
          const text = `${row.label}: ${row.value}`;
          return textLines(sanitizeText(text)).flatMap((logicalLine) => {
            const rightToLeft = lineIsRtl(logicalLine);
            return layoutLine(
              writer,
              logicalLine,
              'regular',
              8,
              innerWidth,
              rightToLeft ? 'rtl' : 'ltr',
            ).map((laidOut) => ({ laidOut, rightToLeft }));
          });
        }),
      );
      const bodyHeights = panelLines.map(
        (rows) => rows.reduce((sum, lines) => sum + Math.max(lines.length, 1) * 11, 0) + 12,
      );
      const panelHeight = 24 + Math.max(...bodyHeights, 24);
      cursor.y += 5;
      ensureSpace(panelHeight + 7);
      const top = cursor.y;
      panels.forEach((panel, panelIndex) => {
        const left = margin + panelIndex * (panelWidth + gap);
        pdf.rect(left, top, panelWidth, panelHeight).stroke(panelBorder);
        pdf.rect(left, top, panelWidth, 24).fill(paleTeal);
        drawAbsoluteText(
          panel.heading.toUpperCase(),
          'bold',
          10,
          left + 8,
          top + 7,
          panelWidth - 16,
          brandTeal,
        );
        let rowY = top + 31;
        panelLines[panelIndex]!.forEach((lines) => {
          for (const { laidOut, rightToLeft } of lines) {
            cursor.y = rowY;
            pdf.fillColor(ink);
            drawLine(laidOut, 'regular', 8, left + 8, innerWidth, rightToLeft);
            rowY += 11;
          }
        });
      });
      cursor.y = top + panelHeight + 7;
      pdf.fillColor(ink);
      return;
    }
    case 'totals': {
      const boxWidth = contentWidth * 0.5;
      const left = margin + contentWidth - boxWidth;
      const rowHeight = 26;
      cursor.y += 4;
      ensureSpace(block.rows.length * rowHeight + 10);
      const top = cursor.y;
      block.rows.forEach((row, index) => {
        const rowTop = top + index * rowHeight;
        const isTotal = index === block.rows.length - 1;
        pdf
          .rect(left, rowTop, boxWidth, rowHeight)
          .fillAndStroke(isTotal ? brandTeal : paleGray, panelBorder);
        drawAbsoluteText(
          row.label,
          'bold',
          isTotal ? 11 : 9,
          left + 10,
          rowTop + 8,
          boxWidth * 0.52 - 12,
          isTotal ? '#ffffff' : ink,
          'right',
        );
        drawAbsoluteText(
          row.value,
          'bold',
          isTotal ? 11 : 9,
          left + boxWidth * 0.52,
          rowTop + 8,
          boxWidth * 0.48 - 10,
          isTotal ? '#ffffff' : brandTeal,
          'right',
        );
      });
      cursor.y = top + block.rows.length * rowHeight + 8;
      pdf.fillColor(ink);
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
      case 'panelGrid':
        for (const panel of block.panels) {
          values.push(panel.heading);
          for (const row of panel.rows) {
            values.push(row.label, row.value);
          }
        }
        break;
      case 'totals':
        for (const row of block.rows) {
          values.push(row.label, row.value);
        }
        break;
      default: {
        const exhaustive: never = block;
        throw new Error(`Unsupported renderable block: ${JSON.stringify(exhaustive)}`);
      }
    }
  }
  if (document.presentation) {
    values.push(
      document.presentation.documentLabel,
      document.presentation.reference,
      document.presentation.status ?? '',
      ...document.presentation.details.flatMap((row) => [row.label, row.value]),
    );
  }
  if (document.pdfInvoice) {
    values.push(
      document.pdfInvoice.clientHeading,
      document.pdfInvoice.amountHeading,
      document.pdfInvoice.paymentHeading,
      ...document.pdfInvoice.sellerLines,
      document.pdfInvoice.sellerEmail ?? '',
      document.pdfInvoice.sellerWebsite?.label ?? '',
      ...document.pdfInvoice.clientLines,
      ...document.pdfInvoice.columns,
      ...document.pdfInvoice.rows.flat(),
      ...document.pdfInvoice.totals.flatMap((row) => [row.label, row.value]),
      document.pdfInvoice.amountInWords ?? '',
      ...document.pdfInvoice.paymentLines,
      document.pdfInvoice.taxHeading ?? '',
      document.pdfInvoice.taxTreatment ?? '',
      document.pdfInvoice.footer,
    );
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
