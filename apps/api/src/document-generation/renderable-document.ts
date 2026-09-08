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

const maxTextLength = 500;

/**
 * PDF standard fonts are WinAnsi encoded, so a character outside that repertoire would
 * throw at render time. Common typographic punctuation is folded to its ASCII
 * equivalent, and anything still unrepresentable becomes `?` rather than failing the
 * generation of an otherwise valid business output.
 */
const punctuationFolding = new Map<string, string>([
  ['‘', "'"],
  ['’', "'"],
  ['‚', "'"],
  ['“', '"'],
  ['”', '"'],
  ['„', '"'],
  ['–', '-'],
  ['—', '-'],
  ['−', '-'],
  ['…', '...'],
  [' ', ' '],
  [' ', ' '],
  ['•', '-'],
]);

function isWinAnsiRepresentable(codePoint: number): boolean {
  if (codePoint >= 0x20 && codePoint <= 0x7e) {
    return true;
  }
  // Latin-1 supplement minus the unused control block, which covers French and the
  // accented Latin characters the product needs.
  return codePoint >= 0xa1 && codePoint <= 0xff;
}

/**
 * Single sanitization boundary for every generated string.
 *
 * Control characters are removed rather than escaped: they have no meaning in a
 * business output and are the usual carrier for filename, terminal, and spreadsheet
 * injection. Whitespace is collapsed so a hostile multi-line value cannot reshape the
 * layout, and length is bounded so one field cannot dominate a rendered page.
 */
export function sanitizeText(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return '';
  }
  const raw = typeof value === 'string' ? value : String(value);
  let result = '';
  for (const character of raw) {
    const folded = punctuationFolding.get(character);
    if (folded !== undefined) {
      result += folded;
      continue;
    }
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint < 0x20 || codePoint === 0x7f) {
      // Newlines and tabs become a single space; other control characters vanish.
      result += codePoint === 0x0a || codePoint === 0x0d || codePoint === 0x09 ? ' ' : '';
      continue;
    }
    result += isWinAnsiRepresentable(codePoint) ? character : '?';
  }
  return result.replace(/\s+/g, ' ').trim().slice(0, maxTextLength);
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
