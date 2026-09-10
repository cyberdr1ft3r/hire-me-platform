/**
 * Splits a token wider than the line into chunks that each fit, without losing text.
 *
 * `fits` is the caller's authoritative width check. The PDF renderer passes one that
 * shapes the candidate exactly as it would be drawn, so kerning, ligatures, Arabic
 * contextual forms, and bidirectional runs are all accounted for. Nothing here estimates
 * a width: every chunk is chosen only after `fits` has accepted that exact text.
 *
 * Each chunk starts with a galloping search (lengths 1, 2, 4, 8, …) and binary refinement.
 * Font shaping is not monotonic: appending an Arabic character can replace a wider isolated
 * form with narrower joined forms. A bounded forward recovery pass therefore checks beyond
 * the provisional boundary and resumes whenever a later prefix fits. Six grapheme clusters
 * cover the largest contextual or ligature input in the bundled Noto faces; marks stay with
 * their base cluster. This preserves the production shaper's longest-fitting-prefix result
 * without measuring every shorter prefix of the whole remainder.
 *
 * Invariants:
 *
 * - the chunks, concatenated, are exactly the token: nothing is dropped or reordered;
 * - no chunk is empty;
 * - every chunk has been accepted by `fits`, except a single character that does not fit
 *   even on its own, which is still emitted on a line by itself rather than lost.
 */
export function splitUnbrokenToken(token: string, fits: (text: string) => boolean): string[] {
  const chunks: string[] = [];
  let remainder = token;
  let suggestedLength = 1;
  while (remainder.length > 0) {
    const prefix = longestFittingPrefix(remainder, fits, suggestedLength);
    chunks.push(remainder.slice(0, prefix.end));
    remainder = remainder.slice(prefix.end);
    suggestedLength = prefix.graphemes;
  }
  return chunks;
}

/** Largest contextual/ligature span encoded by the bundled Noto faces. */
const contextualRecoverySpan = 6;
const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/**
 * Length, at least 1, of the longest prefix of `text` that `fits` accepts.
 *
 * Galloping and binary refinement locate a provisional fit efficiently. Those probes are
 * only a search hint: the production font's finite contextual span is checked explicitly
 * before the result is settled, and every returned multi-grapheme prefix was accepted by
 * `fits` itself.
 */
function longestFittingPrefix(
  text: string,
  fits: (text: string) => boolean,
  suggestedLength: number,
): { end: number; graphemes: number } {
  const boundaries = [...graphemeSegmenter.segment(text)].map(
    ({ index, segment }) => index + segment.length,
  );
  const measured = new Map<number, boolean>();
  const prefixFits = (length: number): boolean => {
    const cached = measured.get(length);
    if (cached !== undefined) {
      return cached;
    }
    const accepted = fits(text.slice(0, boundaries[length - 1]));
    measured.set(length, accepted);
    return accepted;
  };
  const prefixCount = boundaries.length;

  // `fitting` is the longest length accepted so far (0 when none has been); `overflowing`
  // is the shortest length rejected so far (`prefixCount + 1` when none has been).
  let fitting = 0;
  let overflowing = prefixCount + 1;

  // A settled chunk is a strong size hint for the next remainder. Confirm it and its
  // immediate successor before galloping further; uniform long tokens then need no new
  // binary search for every line.
  let probe = Math.min(Math.max(suggestedLength, 1), prefixCount);
  if (prefixFits(probe)) {
    fitting = probe;
    if (probe === prefixCount) {
      return { end: boundaries[probe - 1] ?? text.length, graphemes: probe };
    }
    probe += 1;
    if (prefixFits(probe)) {
      fitting = probe;
      for (probe = Math.min(probe * 2, prefixCount); ; probe = Math.min(probe * 2, prefixCount)) {
        if (!prefixFits(probe)) {
          overflowing = probe;
          break;
        }
        fitting = probe;
        if (probe === prefixCount) {
          return { end: boundaries[probe - 1] ?? text.length, graphemes: probe };
        }
      }
    } else {
      overflowing = probe;
    }
  } else {
    overflowing = probe;
  }

  while (overflowing - fitting > 1) {
    const middle = fitting + Math.floor((overflowing - fitting) / 2);
    if (prefixFits(middle)) {
      fitting = middle;
    } else {
      overflowing = middle;
    }
  }

  // Binary search can stop before a later fitting prefix when contextual shaping makes a
  // shorter prefix wider. Scan one finite shaping span beyond the provisional result; if
  // a fit recovers, repeat from the furthest recovered point until a whole span rejects.
  let recovered = fitting;
  while (recovered < prefixCount) {
    const end = Math.min(recovered + contextualRecoverySpan, prefixCount);
    let furthest = recovered;
    for (let candidate = recovered + 1; candidate <= end; candidate += 1) {
      if (prefixFits(candidate)) {
        furthest = candidate;
      }
    }
    if (furthest === recovered) {
      break;
    }
    recovered = furthest;
  }

  // A first grapheme wider than the whole line still has to be drawn somewhere.
  const graphemes = Math.max(recovered, 1);
  return { end: boundaries[graphemes - 1] ?? text.length, graphemes };
}
