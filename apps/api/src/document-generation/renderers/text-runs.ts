import type { Bidi } from 'bidi-js';
import * as bidiModule from 'bidi-js';

import type { FontScript, FontWeight } from './font-registry.js';
import { faceForCodePoint, faceHasGlyph, scriptHint } from './font-registry.js';
import type { ShapedSegment } from './pdf-text-mapping.js';

/**
 * Bidirectional segmentation and face routing for PDF text layout.
 *
 * The Unicode bidirectional algorithm (UAX #9) is applied by `bidi-js`, a maintained
 * pure-JavaScript implementation. Nothing here reverses strings, maps characters to
 * presentation forms, or invents an ad-hoc table: the algorithm produces embedding
 * levels, this module turns those levels into visually ordered runs, and the PDF font
 * engine performs the actual Arabic contextual shaping from the original characters.
 *
 * Each run also carries the face that will draw it, chosen by asking the faces which of
 * them actually contains a glyph for the character. A neutral character stays with the
 * surrounding run whenever that run's face can draw it, so an em dash between Arabic words
 * does not split the run; when it cannot — the Arabic face has no `€`, for instance — the
 * character opens a run in a face that does, instead of rendering as a missing-glyph box.
 */

// `bidi-js` is published as CommonJS whose `module.exports` is the factory itself, so
// the default-interop shape differs between the type view and the runtime value.
const bidiFactory =
  (bidiModule as unknown as { default?: () => Bidi }).default ??
  (bidiModule as unknown as () => Bidi);
const bidi = bidiFactory();

export type TextRun = {
  /** Characters in logical order; the shaper receives them unmodified. */
  text: string;
  /** Even levels are left-to-right, odd levels right-to-left. */
  level: number;
  script: FontScript;
};

/** Consecutive runs drawn with one face, shaped and emitted as a single text object. */
export type RunGroup = {
  script: FontScript;
  segments: ShapedSegment[];
};

/** Raised when a character reaches layout that no bundled face can draw. */
export class UnroutableCharacterError extends Error {
  constructor(readonly character: string) {
    super(`No bundled PDF font contains a glyph for ${JSON.stringify(character)}.`);
    this.name = 'UnroutableCharacterError';
  }
}

function directionOf(level: number): 'ltr' | 'rtl' {
  return level % 2 === 1 ? 'rtl' : 'ltr';
}

/**
 * Splits one logical line into runs already ordered left to right on the page.
 *
 * Runs are split on both a change of embedding level and a change of face, so each run can
 * be shaped and measured with exactly one font.
 *
 * `base` is the direction of the paragraph the line belongs to. UAX #9 resolves the base
 * direction once per paragraph and applies it to every line of it, so a wrapped line that
 * happens to start with Arabic must not be re-read as a right-to-left paragraph of its
 * own — that is what turns the middle of a wrapped Latin paragraph inside out.
 */
export function visualRuns(
  line: string,
  weight: FontWeight = 'regular',
  base?: 'ltr' | 'rtl',
): TextRun[] {
  if (line.length === 0) {
    return [];
  }

  const embeddingLevels = bidi.getEmbeddingLevels(line, base);
  const levels = embeddingLevels.levels;

  // Logical runs first: contiguous characters sharing an embedding level and a face.
  type LogicalRun = { start: number; end: number; level: number; script: FontScript };
  const logical: LogicalRun[] = [];
  let index = 0;
  for (const character of [...line]) {
    const codePoint = character.codePointAt(0) ?? 0;
    const level = levels[index] ?? 0;
    const previous = logical[logical.length - 1];
    const joinsPrevious =
      previous !== undefined &&
      previous.level === level &&
      scriptHint(codePoint) === 'neutral' &&
      faceHasGlyph(previous.script, weight, codePoint);
    const script = joinsPrevious ? previous.script : faceForCodePoint(codePoint, weight);
    if (script === null) {
      throw new UnroutableCharacterError(character);
    }
    if (previous && previous.level === level && previous.script === script) {
      previous.end = index + character.length;
    } else {
      logical.push({ start: index, end: index + character.length, level, script });
    }
    index += character.length;
  }

  // Visual order: reverse each maximal span of runs at or above every odd level, which is
  // the reordering step of UAX #9 rule L2.
  const visual = [...logical];
  const maxLevel = Math.max(...visual.map((run) => run.level), 0);
  const minOddLevel = Math.min(
    ...visual.filter((run) => run.level % 2 === 1).map((run) => run.level),
    maxLevel + 1,
  );
  for (let level = maxLevel; level >= minOddLevel; level -= 1) {
    let start = -1;
    for (let position = 0; position <= visual.length; position += 1) {
      const current = visual[position];
      if (current && current.level >= level) {
        if (start === -1) {
          start = position;
        }
        continue;
      }
      if (start !== -1) {
        const segment = visual.splice(start, position - start).reverse();
        visual.splice(start, 0, ...segment);
        start = -1;
      }
    }
  }

  return visual.map((run) => ({
    text: line.slice(run.start, run.end),
    level: run.level,
    script: run.script,
  }));
}

/**
 * Merges neighbouring visual runs that share a face into one drawing group.
 *
 * Each group becomes a single PDF text object, which keeps a whole same-face stretch of a
 * line in one extraction run so that a reader applies the bidirectional algorithm to the
 * stretch as a whole rather than to one word at a time.
 */
export function runGroups(runs: TextRun[]): RunGroup[] {
  const groups: RunGroup[] = [];
  for (const run of runs) {
    const segment: ShapedSegment = { text: run.text, direction: directionOf(run.level) };
    const last = groups[groups.length - 1];
    if (last && last.script === run.script) {
      last.segments.push(segment);
    } else {
      groups.push({ script: run.script, segments: [segment] });
    }
  }
  return groups;
}

/** True when the line as a whole reads right to left. */
export function lineIsRtl(line: string): boolean {
  if (line.length === 0) {
    return false;
  }
  return (bidi.getEmbeddingLevels(line).paragraphs[0]?.level ?? 0) % 2 === 1;
}
