/**
 * Correct `ToUnicode` mapping and explicit shaping direction for PDFKit text.
 *
 * PDFKit derives a font's `ToUnicode` map from the code points fontkit reports for each
 * shaped glyph, and keys it by subset glyph id. Two properties of real OpenType Arabic
 * break that scheme, and both are properties of PDFKit and fontkit rather than of this
 * renderer:
 *
 * 1. **A shaper emits glyphs that carry no source characters.** Noto Sans Arabic uses the
 *    dotless-skeleton architecture: `ccmp` decomposes a dotted letter into a dotless base
 *    plus a zero-width dots glyph, and the dots glyph reports no code points. PDFKit then
 *    writes an empty `bfrange` destination, `<>`, which extractors resolve to the raw
 *    glyph id — the stray control-character artefacts that made extracted Arabic unreadable.
 * 2. **One glyph legitimately serves several characters.** Because the dots are a separate
 *    glyph, `س` and `ش` share the same skeleton glyph, as do `ب`, `ت`, `ن`, and `ي`. A map
 *    keyed by glyph id can only remember whichever character was drawn first, so the other
 *    characters silently extract as the wrong letter. Fontkit's own per-id glyph cache has
 *    the same effect on the code points it reports.
 *
 * The fix keeps the shaper untouched and repairs the bookkeeping around it:
 *
 * - glyph objects are re-created whenever the code points differ from the cached ones, so
 *   each occurrence reports the characters it actually came from;
 * - a distinct CID is allocated per *(glyph, code points)* pair rather than per glyph, so
 *   two characters sharing a skeleton keep two honest mappings. The subset simply carries
 *   the glyph twice, which costs a few bytes and no fidelity;
 * - a glyph that carries no source characters maps to U+2060 WORD JOINER, an invisible
 *   format character, instead of to an empty destination. It represents no text because
 *   there is no text to represent — the letter itself is on the skeleton glyph — and
 *   extractors drop format characters, so copied text contains the source characters and
 *   nothing else. No test filters anything out to make this true.
 *
 * The same seam supplies the shaping **direction** per bidirectional run. PDFKit does not
 * expose one, and fontkit otherwise guesses from the string, which reverses Arabic-Indic
 * digits inside an Arabic line. Passing the direction that UAX #9 resolved keeps digits
 * left to right inside right-to-left text.
 *
 * Finally, a whole same-face stretch of a display line is shaped and drawn as one text
 * object. PDFKit's own layout splits at spaces and concatenates the pieces in logical
 * order, which lays right-to-left words out left to right; shaping the stretch here in one
 * pass keeps word order correct on the page and keeps the line in one text run, which is
 * what lets an extractor apply the bidirectional algorithm to the whole line at once.
 */

/** A stretch of one line, in logical order, with the direction UAX #9 resolved for it. */
export type ShapedSegment = { text: string; direction: 'ltr' | 'rtl' };

/** Destination for glyphs that represent no source character. */
const wordJoiner = 0x2060;

type GlyphPosition = Record<string, number>;

type FontkitGlyph = {
  id: number;
  codePoints: number[];
  advanceWidth: number;
};

type FontkitRun = {
  glyphs: FontkitGlyph[];
  positions: GlyphPosition[];
  advanceWidth: number;
};

type FontkitFont = {
  _glyphs: Record<number, { codePoints: number[] } | undefined>;
  getGlyph: (id: number, codePoints?: number[]) => FontkitGlyph;
  layout: (
    text: string,
    features?: unknown,
    script?: string,
    language?: string,
    direction?: 'ltr' | 'rtl',
  ) => FontkitRun;
};

/** The shape of PDFKit's `EmbeddedFont` that this module relies on. */
type EmbeddedFont = {
  font: FontkitFont;
  scale: number;
  subset: { glyphs: number[] };
  ascender: number;
  widths: number[];
  unicode: number[][];
  encode: (text: string, features?: unknown) => [string[], GlyphPosition[]];
  widthOfString: (text: string, size: number, features?: unknown) => number;
};

type Pdf = PDFKit.PDFDocument;

const patched = new WeakSet<EmbeddedFont>();
const pending = new WeakMap<EmbeddedFont, ShapedSegment[]>();

function currentFont(pdf: Pdf): EmbeddedFont {
  return (pdf as unknown as { _font: EmbeddedFont })._font;
}

function segmentsOf(font: EmbeddedFont, text: string): ShapedSegment[] {
  return pending.get(font) ?? [{ text, direction: 'ltr' }];
}

function patch(font: EmbeddedFont): void {
  if (patched.has(font)) {
    return;
  }
  patched.add(font);

  const fontkitFont = font.font;
  const baseGetGlyph = fontkitFont.getGlyph.bind(fontkitFont);
  fontkitFont.getGlyph = (id: number, codePoints: number[] = []): FontkitGlyph => {
    const cached = fontkitFont._glyphs[id];
    if (cached && String(cached.codePoints) !== String(codePoints)) {
      // The cached object was built for a different character that shares this skeleton.
      delete fontkitFont._glyphs[id];
    }
    return baseGetGlyph(id, codePoints);
  };

  const shape = (segments: ShapedSegment[]): FontkitRun => {
    const glyphs: FontkitGlyph[] = [];
    const positions: GlyphPosition[] = [];
    let advanceWidth = 0;
    for (const segment of segments) {
      const run = fontkitFont.layout(
        segment.text,
        undefined,
        undefined,
        undefined,
        segment.direction,
      );
      advanceWidth += run.advanceWidth;
      run.positions.forEach((position, index) => {
        for (const key of Object.keys(position)) {
          position[key] = (position[key] ?? 0) * font.scale;
        }
        position.advanceWidth = (run.glyphs[index]?.advanceWidth ?? 0) * font.scale;
        glyphs.push(run.glyphs[index] as FontkitGlyph);
        positions.push(position);
      });
    }
    return { glyphs, positions, advanceWidth };
  };

  const cids = new Map<string, number>();
  font.encode = (text: string): [string[], GlyphPosition[]] => {
    const { glyphs, positions } = shape(segmentsOf(font, text));
    const codes = glyphs.map((glyph) => {
      const codePoints = glyph.codePoints;
      const key = `${glyph.id}:${codePoints.join(',')}`;
      let cid = cids.get(key);
      if (cid === undefined) {
        font.subset.glyphs.push(glyph.id);
        cid = font.subset.glyphs.length - 1;
        cids.set(key, cid);
        font.widths[cid] = glyph.advanceWidth * font.scale;
        font.unicode[cid] = codePoints.length > 0 ? codePoints : [wordJoiner];
      }
      return `0000${cid.toString(16)}`.slice(-4);
    });
    return [codes, positions];
  };

  font.widthOfString = (text: string, size: number): number =>
    (shape(segmentsOf(font, text)).advanceWidth * font.scale * size) / 1000;
}

/**
 * Draws and measures bidirectional text through a PDFKit document.
 *
 * Callers hand over segments in logical order together with the direction resolved for
 * each; this class owns the PDFKit-level details of turning them into correctly mapped,
 * correctly ordered page text.
 */
export class ShapedTextWriter {
  constructor(private readonly pdf: Pdf) {}

  private select(fontKey: string, size: number): EmbeddedFont {
    this.pdf.font(fontKey).fontSize(size);
    const font = currentFont(this.pdf);
    patch(font);
    return font;
  }

  /**
   * Distance from the top of a line to the baseline for one face at one size.
   *
   * Every face on a line is drawn against the same value. PDFKit otherwise offsets each
   * text object by its own font's ascender, which sits Arabic and Latin on two different
   * baselines whenever they share a line.
   */
  ascent(fontKey: string, size: number): number {
    return (this.select(fontKey, size).ascender * size) / 1000;
  }

  /** Width of one same-face stretch, shaped exactly as it will be drawn. */
  measure(fontKey: string, size: number, segments: ShapedSegment[]): number {
    if (segments.length === 0) {
      return 0;
    }
    const font = this.select(fontKey, size);
    pending.set(font, segments);
    try {
      return this.pdf.widthOfString(joinSegments(segments));
    } finally {
      pending.delete(font);
    }
  }

  /**
   * Draws one same-face stretch with its left edge at `x` and its top at `y`.
   *
   * `ascent` is the shared top-to-baseline distance of the line, passed as an explicit
   * numeric baseline so that faces with different ascenders still line up.
   */
  draw(
    fontKey: string,
    size: number,
    segments: ShapedSegment[],
    x: number,
    y: number,
    ascent: number,
  ): void {
    if (segments.length === 0) {
      return;
    }
    const font = this.select(fontKey, size);
    pending.set(font, segments);
    try {
      this.pdf.text(joinSegments(segments), x, y, { lineBreak: false, baseline: -ascent });
    } finally {
      pending.delete(font);
    }
  }
}

function joinSegments(segments: ShapedSegment[]): string {
  return segments.map((segment) => segment.text).join('');
}
