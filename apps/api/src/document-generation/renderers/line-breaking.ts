/**
 * Splits a token wider than the line into chunks that each fit, without losing text.
 *
 * `fits` is the caller's authoritative width check. The PDF renderer passes one that
 * shapes the candidate exactly as it would be drawn, so kerning, ligatures, Arabic
 * contextual forms, and bidirectional runs are all accounted for. Nothing here estimates
 * a width: every chunk is chosen only after `fits` has accepted that exact text.
 *
 * Each chunk is the longest fitting prefix of what remains, found by a galloping search
 * (lengths 1, 2, 4, 8, … until one stops fitting) followed by a binary search between the
 * last length that fit and the first that did not. The search never measures a candidate
 * more than about twice as long as the chunk it settles on, so the work for a very long
 * unbroken value grows roughly linearly with its length. Measuring every shorter prefix of
 * the whole remainder instead — which is what this replaces — shapes on the order of the
 * cube of the token length, and a user-supplied value of a few thousand characters without
 * a space would occupy the renderer for minutes.
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
  while (remainder.length > 0) {
    const take = longestFittingPrefix(remainder, fits);
    chunks.push(remainder.slice(0, take));
    remainder = remainder.slice(take);
  }
  return chunks;
}

/**
 * Length, at least 1, of the longest prefix of `text` that `fits` accepts.
 *
 * Widths grow as text is added, so the prefixes that fit form a contiguous range starting
 * at the shortest one. The search relies on that only to decide where to look; whatever
 * length it returns above 1 is one that `fits` explicitly accepted.
 */
function longestFittingPrefix(text: string, fits: (text: string) => boolean): number {
  const prefixFits = (length: number): boolean => fits(text.slice(0, length));

  // `fitting` is the longest length accepted so far (0 when none has been); `overflowing`
  // is the shortest length rejected so far (`text.length + 1` when none has been).
  let fitting = 0;
  let overflowing = text.length + 1;

  for (let probe = 1; probe <= text.length; probe = Math.min(probe * 2, text.length)) {
    if (!prefixFits(probe)) {
      overflowing = probe;
      break;
    }
    fitting = probe;
    if (probe === text.length) {
      return probe;
    }
  }

  while (overflowing - fitting > 1) {
    const middle = fitting + Math.floor((overflowing - fitting) / 2);
    if (prefixFits(middle)) {
      fitting = middle;
    } else {
      overflowing = middle;
    }
  }

  // A first character wider than the whole line still has to be drawn somewhere.
  return Math.max(fitting, 1);
}
