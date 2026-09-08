/**
 * Neutral, data-only description of a business output.
 *
 * Templates build one of these; renderers turn it into PDF or DOCX bytes. There is no
 * markup layer anywhere in between, so a template can never emit HTML, script, a remote
 * reference, or anything else that a renderer would interpret. Every string is plain
 * text that the renderer draws verbatim.
 */
export type RenderableBlock =
  | { kind: 'heading'; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'keyValues'; rows: { label: string; value: string }[] }
  | { kind: 'table'; columns: string[]; rows: string[][] };

export type RenderableDocument = {
  title: string;
  subtitle: string | null;
  blocks: RenderableBlock[];
  footer: string | null;
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

/**
 * Code points the PDF standard fonts can encode.
 *
 * `pdf-lib`'s standard fonts use WinAnsi (CP1252), whose repertoire is Latin-1 plus the
 * 27 typographic characters in the 0x80-0x9F block. That block is what carries the
 * ligatures and punctuation real business text uses, including the French `oe` ligature
 * and the euro sign, so it must not be treated as unrepresentable.
 */
const winAnsiSpecials = new Set([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152,
  0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a,
  0x0153, 0x017e, 0x0178,
]);

export function isPdfRepresentable(codePoint: number): boolean {
  if (codePoint === 0x0a) {
    return true;
  }
  if (codePoint >= 0x20 && codePoint <= 0x7e) {
    return true;
  }
  if (codePoint >= 0xa0 && codePoint <= 0xff) {
    return true;
  }
  return winAnsiSpecials.has(codePoint);
}

/** Returns the distinct characters a PDF standard font cannot encode. */
export function unrepresentablePdfCharacters(document: RenderableDocument): string[] {
  const found = new Set<string>();
  const inspect = (value: string): void => {
    // Sanitization runs before any renderer draws, so representability is judged on the
    // text that will actually be encoded rather than on the raw field.
    for (const character of sanitizeText(value)) {
      if (!isPdfRepresentable(character.codePointAt(0) ?? 0)) {
        found.add(character);
      }
    }
  };

  inspect(document.title);
  inspect(document.subtitle ?? '');
  inspect(document.footer ?? '');
  for (const block of document.blocks) {
    switch (block.kind) {
      case 'heading':
      case 'paragraph':
        inspect(block.text);
        break;
      case 'keyValues':
        for (const row of block.rows) {
          inspect(row.label);
          inspect(row.value);
        }
        break;
      case 'table':
        block.columns.forEach(inspect);
        for (const row of block.rows) {
          row.forEach(inspect);
        }
        break;
      default: {
        const exhaustive: never = block;
        throw new Error(`Unsupported renderable block: ${JSON.stringify(exhaustive)}`);
      }
    }
  }
  return [...found];
}
