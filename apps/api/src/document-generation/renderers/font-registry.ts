import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// @ts-expect-error `fontkit` ships no type declarations; the two members used here are
// narrowed explicitly by the `fontkit` binding below.
import * as fontkitModule from 'fontkit';

/**
 * Bundled font assets for PDF generation, and glyph-authoritative script coverage.
 *
 * Fonts are committed under `apps/api/assets/fonts` and read from disk at first use. The
 * path is resolved from this module's own URL rather than from `process.cwd()`, and both
 * `src/` and `dist/` are direct children of the package root, so the same relative path
 * resolves correctly whether the renderer runs from TypeScript sources or from the
 * compiled build. Nothing is fetched from the network at build time or at runtime.
 *
 * Coverage is decided by the faces themselves. Every registered face is parsed once with
 * `fontkit` and asked, per code point, whether it actually contains a glyph. A Unicode
 * block range only *suggests* which face to try first; it never decides the answer, so a
 * character that falls inside a bundled block but has no glyph in the face is reported as
 * unsupported instead of being drawn as a `.notdef` box.
 */

export type FontWeight = 'regular' | 'bold';

/** Script families the bundled faces cover. */
export type FontScript = 'latin' | 'arabic';

/**
 * Which face to try first for a code point.
 *
 * This is a routing optimisation, not an authority: `neutral` means "any face may own
 * it", and `null` means "no block-level guess", and both still go through the glyph
 * check below.
 */
export type ScriptHint = FontScript | 'neutral' | null;

type FontAsset = { id: string; file: string };

type FontkitFont = {
  hasGlyphForCodePoint: (codePoint: number) => boolean;
};

const fontkit = fontkitModule as unknown as {
  create: (bytes: Buffer) => FontkitFont;
};

const assets: Record<FontScript, Record<FontWeight, FontAsset>> = {
  latin: {
    regular: { id: 'NotoSans-Regular', file: 'NotoSans-Regular.ttf' },
    bold: { id: 'NotoSans-Bold', file: 'NotoSans-Bold.ttf' },
  },
  arabic: {
    // No bold Arabic face is bundled: bold is only ever applied to template labels and
    // headings, which are always rendered in the template language. See FONTS.md.
    regular: { id: 'NotoSansArabic-Regular', file: 'NotoSansArabic-Regular.ttf' },
    bold: { id: 'NotoSansArabic-Regular', file: 'NotoSansArabic-Regular.ttf' },
  },
};

/** Faces are tried in this order once the block hint has had its turn. */
const fallbackOrder: readonly FontScript[] = ['latin', 'arabic'];

const weights: readonly FontWeight[] = ['regular', 'bold'];

const byteCache = new Map<string, Buffer>();
const faceCache = new Map<string, FontkitFont>();
const glyphCache = new Map<string, boolean>();

function assetDirectory(): string {
  // `src/document-generation/renderers/` and `dist/document-generation/renderers/` are
  // both three levels below the package root, so one relative path serves both.
  return fileURLToPath(new URL('../../../assets/fonts/', import.meta.url));
}

export function fontAsset(script: FontScript, weight: FontWeight): FontAsset {
  return assets[script][weight];
}

/** Reads a bundled face, caching the bytes for the life of the process. */
export function fontBytes(script: FontScript, weight: FontWeight): Buffer {
  const asset = fontAsset(script, weight);
  const cached = byteCache.get(asset.file);
  if (cached) {
    return cached;
  }
  const bytes = readFileSync(`${assetDirectory()}${asset.file}`);
  byteCache.set(asset.file, bytes);
  return bytes;
}

/** Parses a bundled face, caching the parsed font for the life of the process. */
function parsedFace(script: FontScript, weight: FontWeight): FontkitFont {
  const asset = fontAsset(script, weight);
  const cached = faceCache.get(asset.file);
  if (cached) {
    return cached;
  }
  const face = fontkit.create(fontBytes(script, weight));
  faceCache.set(asset.file, face);
  return face;
}

/** Every face the renderer registers, in a stable order. */
export function registeredFontAssets(): {
  script: FontScript;
  weight: FontWeight;
  asset: FontAsset;
}[] {
  return [
    { script: 'latin', weight: 'regular', asset: assets.latin.regular },
    { script: 'latin', weight: 'bold', asset: assets.latin.bold },
    { script: 'arabic', weight: 'regular', asset: assets.arabic.regular },
  ];
}

/**
 * Suggests the face to try first for one code point.
 *
 * Ranges are cheap to evaluate and get the common cases right on the first attempt, which
 * keeps run splitting stable. They are deliberately not trusted: `faceForCodePoint` still
 * proves the glyph exists before the character is drawn with that face.
 */
export function scriptHint(codePoint: number): ScriptHint {
  if (codePoint === 0x0a || codePoint === 0x09) {
    return 'neutral';
  }
  // ASCII punctuation, digits, and spaces are neutral.
  if (codePoint < 0x0041) {
    return 'neutral';
  }
  if (
    (codePoint >= 0x0041 && codePoint <= 0x005a) ||
    (codePoint >= 0x0061 && codePoint <= 0x007a)
  ) {
    return 'latin';
  }
  if (codePoint >= 0x005b && codePoint <= 0x0060) {
    return 'neutral';
  }
  if (codePoint >= 0x007b && codePoint <= 0x00bf) {
    return 'neutral';
  }
  // Latin-1 letters, Latin Extended-A/B, IPA, spacing modifiers, combining marks, Greek,
  // and Cyrillic. NotoSans covers these; the glyph check decides which of them it really
  // does, which is why Armenian sitting in the same span is not a problem here.
  if (codePoint >= 0x00c0 && codePoint <= 0x058f) {
    return 'latin';
  }
  // Arabic, Arabic Supplement, Arabic Extended-A, and the presentation form blocks.
  if (
    (codePoint >= 0x0600 && codePoint <= 0x06ff) ||
    (codePoint >= 0x0750 && codePoint <= 0x077f) ||
    (codePoint >= 0x08a0 && codePoint <= 0x08ff) ||
    (codePoint >= 0xfb50 && codePoint <= 0xfdff) ||
    (codePoint >= 0xfe70 && codePoint <= 0xfeff)
  ) {
    return 'arabic';
  }
  // General punctuation, currency symbols, and common typography.
  if (
    (codePoint >= 0x2000 && codePoint <= 0x206f) ||
    (codePoint >= 0x20a0 && codePoint <= 0x20cf) ||
    (codePoint >= 0x2100 && codePoint <= 0x214f)
  ) {
    return 'neutral';
  }
  return null;
}

/** Whether one registered face really contains a glyph for a code point. */
export function faceHasGlyph(script: FontScript, weight: FontWeight, codePoint: number): boolean {
  const key = `${fontAsset(script, weight).file}:${codePoint}`;
  const cached = glyphCache.get(key);
  if (cached !== undefined) {
    return cached;
  }
  const present = parsedFace(script, weight).hasGlyphForCodePoint(codePoint);
  glyphCache.set(key, present);
  return present;
}

/** Candidate faces for a code point: the block hint first, then the approved fallbacks. */
function candidates(codePoint: number): readonly FontScript[] {
  const hint = scriptHint(codePoint);
  if (hint === null || hint === 'neutral') {
    return fallbackOrder;
  }
  return [hint, ...fallbackOrder.filter((script) => script !== hint)];
}

/**
 * The face that will draw a code point at a given weight, or `null` when none contains it.
 *
 * The hinted face is tried first so routing stays predictable, then the remaining
 * registered faces in a fixed order. Every candidate is confirmed with a real glyph
 * lookup, so this never returns a face that would emit `.notdef`.
 */
export function faceForCodePoint(codePoint: number, weight: FontWeight): FontScript | null {
  for (const script of candidates(codePoint)) {
    if (faceHasGlyph(script, weight, codePoint)) {
      return script;
    }
  }
  return null;
}

/**
 * Distinct characters no bundled face can render.
 *
 * Both weights must be coverable, because the same value can be drawn bold in a heading
 * and regular in a body line, and a coverage answer that depended on which one happened
 * to be asked would not be a guarantee.
 */
export function unsupportedCharacters(value: string): string[] {
  const found = new Set<string>();
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (weights.some((weight) => faceForCodePoint(codePoint, weight) === null)) {
      found.add(character);
    }
  }
  return [...found];
}
