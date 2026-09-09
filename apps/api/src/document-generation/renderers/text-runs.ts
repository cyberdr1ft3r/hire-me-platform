import type { Bidi } from 'bidi-js';
import * as bidiModule from 'bidi-js';

import type { FontScript } from './font-registry.js';
import { scriptOf } from './font-registry.js';

/**
 * Bidirectional segmentation for PDF text layout.
 *
 * The Unicode bidirectional algorithm (UAX #9) is applied by `bidi-js`, a maintained
 * pure-JavaScript implementation. Nothing here reverses strings, maps characters to
 * presentation forms, or invents an ad-hoc table: the algorithm produces embedding
 * levels, this module turns those levels into visually ordered runs, and the PDF font
 * engine performs the actual Arabic contextual shaping from the original characters.
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

function resolveScript(text: string, paragraphIsRtl: boolean): FontScript {
  for (const character of text) {
    const script = scriptOf(character.codePointAt(0) ?? 0);
    if (script === 'latin' || script === 'arabic') {
      return script;
    }
  }
  // A neutral-only run (spaces, digits, punctuation) follows the paragraph direction so
  // that, for example, a number inside an Arabic sentence keeps the Arabic face.
  return paragraphIsRtl ? 'arabic' : 'latin';
}

/**
 * Splits one logical line into runs already ordered left to right on the page.
 *
 * Runs are split on both a change of embedding level and a change of script, so each run
 * can be shaped and measured with exactly one font.
 */
export function visualRuns(line: string): TextRun[] {
  if (line.length === 0) {
    return [];
  }

  const embeddingLevels = bidi.getEmbeddingLevels(line);
  const paragraphIsRtl = (embeddingLevels.paragraphs[0]?.level ?? 0) % 2 === 1;
  const levels = embeddingLevels.levels;

  // Logical runs first: contiguous characters sharing an embedding level and a script.
  type LogicalRun = { start: number; end: number; level: number; script: FontScript };
  const logical: LogicalRun[] = [];
  const characters = [...line];
  let index = 0;
  for (const character of characters) {
    const level = levels[index] ?? 0;
    const script = resolveScript(character, paragraphIsRtl);
    const previous = logical[logical.length - 1];
    const neutral = scriptOf(character.codePointAt(0) ?? 0) === 'neutral';
    if (previous && previous.level === level && (neutral || previous.script === script)) {
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

/** True when the line as a whole reads right to left. */
export function lineIsRtl(line: string): boolean {
  if (line.length === 0) {
    return false;
  }
  return (bidi.getEmbeddingLevels(line).paragraphs[0]?.level ?? 0) % 2 === 1;
}
