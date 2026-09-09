import { inflateSync } from 'node:zlib';

/**
 * Test-only PDF inspection helpers.
 *
 * Generated PDFs embed subsetted TrueType fonts, so the drawn strings are glyph indices
 * rather than readable characters. Two independent readings are offered here, because the
 * feature makes two independent claims.
 *
 * `extractPdf` parses the produced file with `pdfjs-dist` and reads the text back exactly
 * as a viewer would: through the `ToUnicode` map, with the bidirectional algorithm applied
 * to each run. It answers "does copying this PDF give back the source text".
 *
 * `drawnGlyphs` reads the page content stream directly and reports each drawn glyph with
 * the position it was drawn at and the characters its `ToUnicode` entry maps to. It
 * answers "is the text laid out correctly on the page" — the question a text extractor
 * deliberately hides, because it reorders what it reads.
 *
 * The module is imported only from tests and is excluded from the production build.
 */

type ExtractedPdf = {
  /** Text of every page, concatenated in reading order. */
  text: string;
  pageCount: number;
  /** Names of the fonts the document actually embedded. */
  fontNames: string[];
};

export async function extractPdf(bytes: Buffer): Promise<ExtractedPdf> {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = getDocument({
    data: new Uint8Array(bytes),
    // No network, no worker process, no system fonts: everything needed is embedded.
    disableFontFace: true,
    useSystemFonts: false,
    isEvalSupported: false,
  });
  const document = await task.promise;
  let text = '';

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    for (const item of content.items) {
      if ('str' in item) {
        text += item.str;
        if (item.hasEOL) {
          text += '\n';
        }
      }
    }
    page.cleanup();
  }

  const pageCount = document.numPages;
  await document.destroy();
  return { text, pageCount, fontNames: embeddedFontNames(bytes) };
}

/** Font resource names declared in the raw file, which survive subsetting prefixes. */
export function embeddedFontNames(bytes: Buffer): string[] {
  const raw = bytes.toString('latin1');
  const names = new Set<string>();
  const pattern = /\/BaseFont\s*\/([A-Za-z0-9+\-_]+)/g;
  let match = pattern.exec(raw);
  while (match !== null) {
    if (match[1]) {
      names.add(match[1]);
    }
    match = pattern.exec(raw);
  }
  return [...names];
}

/** One glyph as the page actually draws it. */
export type DrawnGlyph = {
  /** Horizontal position in PDF user space; larger is further right. */
  x: number;
  /** Vertical position in PDF user space; one drawn line shares one value. */
  y: number;
  /** Characters this glyph's `ToUnicode` entry maps to. */
  text: string;
};

type PdfObject = { number: number; body: string; stream: Buffer | null };

function objects(raw: string, bytes: Buffer): Map<number, PdfObject> {
  const found = new Map<number, PdfObject>();
  const pattern = /(\d+) 0 obj([\s\S]*?)endobj/g;
  let match = pattern.exec(raw);
  while (match !== null) {
    const number = Number(match[1]);
    const body = match[2] ?? '';
    const streamStart = body.indexOf('stream');
    let stream: Buffer | null = null;
    if (streamStart !== -1) {
      const dataStart =
        (match.index ?? 0) +
        String(match[1]).length +
        ' 0 obj'.length +
        streamStart +
        'stream'.length;
      const skip = raw.startsWith('\r\n', dataStart) ? 2 : 1;
      const end = raw.indexOf('endstream', dataStart);
      const slice = bytes.subarray(dataStart + skip, end);
      stream = body.includes('FlateDecode') ? inflateSync(slice) : Buffer.from(slice);
    }
    found.set(number, { number, body, stream });
    match = pattern.exec(raw);
  }
  return found;
}

/** Parses a `ToUnicode` CMap into a code-to-text map. */
function parseToUnicode(cmap: string): Map<number, string> {
  const map = new Map<number, string>();
  const fromHex = (hex: string): string =>
    (hex.match(/.{4}/g) ?? []).map((unit) => String.fromCharCode(parseInt(unit, 16))).join('');

  for (const block of cmap.match(/beginbfchar([\s\S]*?)endbfchar/g) ?? []) {
    for (const entry of block.matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]*)>/g)) {
      map.set(parseInt(entry[1] ?? '0', 16), fromHex(entry[2] ?? ''));
    }
  }
  for (const block of cmap.match(/beginbfrange([\s\S]*?)endbfrange/g) ?? []) {
    for (const entry of block.matchAll(
      /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(\[[\s\S]*?\]|<[0-9a-fA-F]*>)/g,
    )) {
      const low = parseInt(entry[1] ?? '0', 16);
      const destination = entry[3] ?? '';
      if (destination.startsWith('[')) {
        const parts = [...destination.matchAll(/<([0-9a-fA-F]*)>/g)];
        parts.forEach((part, offset) => map.set(low + offset, fromHex(part[1] ?? '')));
        continue;
      }
      const high = parseInt(entry[2] ?? '0', 16);
      const base = fromHex(destination.slice(1, -1));
      for (let code = low; code <= high; code += 1) {
        map.set(code, base);
      }
    }
  }
  return map;
}

/**
 * Every glyph the first page draws, in content-stream order, with its position.
 *
 * Content-stream order is the order the glyphs appear on the page from left to right,
 * which is what makes this a check on layout rather than on extraction.
 */
export function drawnGlyphs(bytes: Buffer): DrawnGlyph[] {
  const raw = bytes.toString('latin1');
  const parsed = objects(raw, bytes);

  const toUnicodeByResource = new Map<string, Map<number, string>>();
  for (const object of parsed.values()) {
    const resources = object.body.match(/\/Font\s*<<([\s\S]*?)>>/);
    if (!resources) {
      continue;
    }
    for (const entry of (resources[1] ?? '').matchAll(/\/(\w+)\s+(\d+) 0 R/g)) {
      const font = parsed.get(Number(entry[2]));
      const reference = font?.body.match(/\/ToUnicode\s+(\d+) 0 R/);
      const cmap = reference ? parsed.get(Number(reference[1]))?.stream : null;
      if (cmap && entry[1]) {
        toUnicodeByResource.set(entry[1], parseToUnicode(cmap.toString('latin1')));
      }
    }
  }

  const content = [...parsed.values()]
    .map((object) => object.stream?.toString('latin1') ?? '')
    .find((text) => text.includes('TJ') || text.includes('Tj'));
  if (!content) {
    return [];
  }

  const glyphs: DrawnGlyph[] = [];
  let x = 0;
  let y = 0;
  let map: Map<number, string> | undefined;
  const pattern =
    /\/(\w+)\s+[\d.]+\s+Tf|[\d.-]+\s+[\d.-]+\s+[\d.-]+\s+[\d.-]+\s+([\d.-]+)\s+([\d.-]+)\s+Tm|<([0-9a-fA-F]+)>/g;
  for (const token of content.matchAll(pattern)) {
    if (token[1]) {
      map = toUnicodeByResource.get(token[1]);
      continue;
    }
    if (token[2] !== undefined) {
      x = Number(token[2]);
      y = Number(token[3]);
      continue;
    }
    const hex = token[4];
    if (!hex || !map) {
      continue;
    }
    for (const unit of hex.match(/.{4}/g) ?? []) {
      glyphs.push({ x, y, text: map.get(parseInt(unit, 16)) ?? '' });
    }
  }
  return glyphs;
}

/** Glyphs that stand for source characters, in the order the page draws them. */
function textGlyphs(bytes: Buffer): DrawnGlyph[] {
  const wordJoiner = String.fromCharCode(0x2060);
  return drawnGlyphs(bytes).filter((glyph) => glyph.text !== '' && glyph.text !== wordJoiner);
}

/**
 * Every drawn line of the first page, top to bottom, each read left to right.
 *
 * Only glyphs that carry source characters are reported: the marks a shaper produces are
 * mapped to U+2060 precisely because they stand for no character of the source string.
 * Lines are separated by their shared baseline.
 */
export function drawnLines(bytes: Buffer): string[] {
  const lines = new Map<number, string>();
  for (const glyph of textGlyphs(bytes)) {
    lines.set(glyph.y, (lines.get(glyph.y) ?? '') + glyph.text);
  }
  return [...lines.entries()].sort(([left], [right]) => right - left).map(([, text]) => text);
}

/** One drawn line, counting from the top of the page. */
export function drawnLineText(bytes: Buffer, lineIndex = 0): string {
  return drawnLines(bytes)[lineIndex] ?? '';
}
