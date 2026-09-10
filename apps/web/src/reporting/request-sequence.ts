/**
 * A monotonic sequence of asynchronous requests in which only the most recent
 * one may still commit its result.
 *
 * Each check is a closure over the sequence value at the moment it was taken.
 * Starting a newer request, or invalidating the sequence, moves the value on,
 * so every earlier check answers `false` from then on. Nothing is cancelled on
 * the network; a superseded response is simply never allowed to touch state.
 */
export interface RequestSequence {
  /** A check for the request that is current now, without superseding it. */
  current(): () => boolean;
  /** Supersedes every outstanding request. */
  invalidate(): void;
  /** Starts a new request, superseding every earlier one, and returns its check. */
  next(): () => boolean;
}

export function createRequestSequence(): RequestSequence {
  let latest = 0;

  function checkFor(token: number): () => boolean {
    return () => latest === token;
  }

  return {
    current() {
      return checkFor(latest);
    },
    invalidate() {
      latest += 1;
    },
    next() {
      latest += 1;
      return checkFor(latest);
    },
  };
}
