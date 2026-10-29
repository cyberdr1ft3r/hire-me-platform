/**
 * Neutral, data-only description of a business output.
 *
 * Templates build one of these; renderers turn it into PDF or DOCX bytes. There is no
 * markup layer anywhere in between, so a template can never emit HTML, script, a remote
 * reference, or anything else that a renderer would interpret. Every string is plain
 * text that the renderer draws verbatim.
 */
export type RenderableKeyValue = { label: string; value: string };

export type RenderableBlock =
  | { kind: 'heading'; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'keyValues'; rows: RenderableKeyValue[] }
  | { kind: 'table'; columns: string[]; rows: string[][] }
  | {
      kind: 'panelGrid';
      panels: { heading: string; rows: RenderableKeyValue[] }[];
    }
  | { kind: 'totals'; rows: RenderableKeyValue[] };

export type RenderablePresentation = {
  kind: 'hireme-commercial';
  documentLabel: string;
  reference: string;
  status: string | null;
  details: RenderableKeyValue[];
};

export type RenderableDocument = {
  title: string;
  subtitle: string | null;
  blocks: RenderableBlock[];
  footer: string | null;
  presentation?: RenderablePresentation;
  /** PDF-only invoice layout; the neutral blocks remain authoritative for other formats. */
  pdfInvoice?: {
    clientHeading: string;
    amountHeading: string;
    paymentHeading: string;
    sellerLines: string[];
    clientLines: string[];
    columns: string[];
    rows: string[][];
    totals: RenderableKeyValue[];
    amountInWords: string | null;
    paymentLines: string[];
    taxTreatment: string | null;
    footer: string;
  };
};

/**
 * Single sanitization boundary for every generated string.
 *
 * It protects the output format without changing business meaning. Control characters
 * are removed because they have no meaning in a business output and are the usual
 * carrier for filename, terminal, and spreadsheet injection. Line breaks are preserved
 * as explicit separators so multi-line contract terms keep their structure, while runs
 * of horizontal whitespace collapse.
 *
 * It deliberately does **not** truncate and does **not** substitute characters. An
 * official quotation line, invoice description, contract term, client name, or
 * participant name must reach the file exactly as the authoritative record stores it. A
 * product length limit belongs in the domain write path, not in the renderer.
 */
export function sanitizeText(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return '';
  }
  const raw = typeof value === 'string' ? value : String(value);
  let result = '';
  for (const character of raw) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint === 0x0a || codePoint === 0x0d) {
      // Normalise every line ending to a single separator the renderers understand.
      result += result.endsWith('\n') ? '' : '\n';
      continue;
    }
    if (codePoint === 0x09) {
      result += ' ';
      continue;
    }
    if (codePoint < 0x20 || codePoint === 0x7f) {
      continue;
    }
    result += character;
  }
  return result
    .split('\n')
    .map((line) => line.replace(/[ \u00a0\u2000-\u200a\u202f\u205f\u3000]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Splits sanitized text into the explicit lines a renderer must lay out. */
export function textLines(value: string): string[] {
  const lines = value.split('\n');
  return lines.length > 0 ? lines : [''];
}

/** Money is always minor units. Formatting never converts or merges currencies. */
export function formatMoney(cents: number, currency: string): string {
  const negative = cents < 0;
  const absolute = Math.abs(cents);
  const major = Math.trunc(absolute / 100);
  const minor = String(absolute % 100).padStart(2, '0');
  return `${negative ? '-' : ''}${major}.${minor} ${sanitizeText(currency)}`;
}

export function formatDate(value: Date | null | undefined): string {
  return value ? value.toISOString().slice(0, 10) : '';
}
