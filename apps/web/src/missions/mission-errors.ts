import { MissionRequestError } from '../api.js';

/**
 * Safe, language-neutral categories for a failed Missions request.
 *
 * Only the HTTP status is read, never the server's message, so nothing here
 * can surface backend detail. A `conflict` means the record changed or is no
 * longer writable (a terminal mission, a stale offer version, a duplicate
 * assignment); the workspace refreshes the current mission after one.
 */
export type MissionFailure = 'conflict' | 'forbidden' | 'invalid' | 'notFound' | 'unavailable';

export function classifyMissionFailure(error: unknown): MissionFailure {
  if (!(error instanceof MissionRequestError)) {
    return 'unavailable';
  }
  switch (error.status) {
    case 400:
      return 'invalid';
    case 403:
      return 'forbidden';
    case 404:
      return 'notFound';
    case 409:
      return 'conflict';
    default:
      return 'unavailable';
  }
}
