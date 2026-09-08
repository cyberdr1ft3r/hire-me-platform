import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';

import type { RenderableBlock, RenderableDocument } from '../renderable-document.js';
import { sanitizeText } from '../renderable-document.js';

/**
 * Pure-JavaScript Word-compatible renderer.
 *
 * The `docx` package assembles an OpenXML package in process, so like the PDF path it
 * needs no native binary, no office suite, and no shell. Values are written as literal
 * text runs, never as markup, so nothing in a business record can be interpreted.
 */

function textRun(value: string, bold = false): TextRun {
  return new TextRun({ text: sanitizeText(value), bold });
}

function blockToElements(block: RenderableBlock): (Paragraph | Table)[] {
  switch (block.kind) {
    case 'heading':
      return [
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [textRun(block.text, true)],
        }),
      ];
    case 'paragraph':
      return [new Paragraph({ children: [textRun(block.text)] })];
    case 'keyValues':
      return block.rows.map(
        (row) =>
          new Paragraph({
            children: [textRun(`${row.label}: `, true), textRun(row.value)],
          }),
      );
    case 'table': {
      const headerRow = new TableRow({
        children: block.columns.map(
          (column) =>
            new TableCell({
              children: [new Paragraph({ children: [textRun(column, true)] })],
            }),
        ),
      });
      const bodyRows = block.rows.map(
        (row) =>
          new TableRow({
            children: row.map(
              (cell) =>
                new TableCell({
                  children: [new Paragraph({ children: [textRun(cell)] })],
                }),
            ),
          }),
      );
      return [
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [headerRow, ...bodyRows],
        }),
        new Paragraph({ children: [] }),
      ];
    }
    default: {
      const exhaustive: never = block;
      throw new Error(`Unsupported renderable block: ${JSON.stringify(exhaustive)}`);
    }
  }
}

export async function renderDocx(document: RenderableDocument): Promise<Buffer> {
  const children: (Paragraph | Table)[] = [
    new Paragraph({
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.LEFT,
      children: [textRun(document.title, true)],
    }),
  ];

  if (document.subtitle) {
    children.push(new Paragraph({ children: [textRun(document.subtitle)] }));
  }

  for (const block of document.blocks) {
    children.push(...blockToElements(block));
  }

  if (document.footer) {
    children.push(new Paragraph({ children: [textRun(document.footer)] }));
  }

  const file = new Document({
    creator: 'Hire Me Platform',
    title: sanitizeText(document.title),
    description: 'Generated business output.',
    sections: [{ children }],
  });

  return Packer.toBuffer(file);
}
