import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Bundled font assets for PDF generation.
 *
 * Fonts are committed under `apps/api/assets/fonts` and read from disk at first use. The
 * path is resolved from this module's own URL rather than from `process.cwd()`, and both
 * `src/` and `dist/` are direct children of the package root, so the same relative path
 * resolves correctly whether the renderer runs from TypeScript sources or from the
 * compiled build. Nothing is fetched from the network at build time or at runtime.
 */

export type FontWeight = 'regular' | 'bold';

/** Script families the bundled faces cover. */
export type FontScript = 'latin' | 'arabic';

type FontAsset = { id: string; file: string };

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

const cache = new Map<string, Buffer>();

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
  const cached = cache.get(asset.file);
  if (cached) {
    return cached;
  }
  const bytes = readFileSync(`${assetDirectory()}${asset.file}`);
  cache.set(asset.file, bytes);
  return bytes;
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
 * Classifies one code point into the script family that must render it.
 *
 * `null` means no bundled face covers it, which the renderer turns into an explicit
 * script-coverage failure rather than a missing-glyph box or a silent substitution.
 * Characters that are shared across scripts, such as spaces, digits, and punctuation,
 * are neutral and inherit the surrounding run's font.
 */
export function scriptOf(codePoint: number): FontScript | 'neutral' | null {
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
  // and Cyrillic, all covered by NotoSans.
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

/** Distinct characters no bundled face can render. */
export function unsupportedCharacters(value: string): string[] {
  const found = new Set<string>();
  for (const character of value) {
    if (scriptOf(character.codePointAt(0) ?? 0) === null) {
      found.add(character);
    }
  }
  return [...found];
}
