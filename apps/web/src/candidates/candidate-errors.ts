import { CandidateRequestError } from '../api.js';

/**
 * Safe, language-neutral categories for a failed candidate request.
 *
 * The workspace shows its own localized copy for each category and never the
 * server's message text. Only stable API error codes and HTTP statuses are
 * read, so nothing here can surface backend detail to the interface.
 */
export type CandidateFailure =
  'archived' | 'conflict' | 'duplicateEmail' | 'forbidden' | 'invalid' | 'notFound' | 'unavailable';

export function classifyCandidateFailure(error: unknown): CandidateFailure {
  if (!(error instanceof CandidateRequestError)) {
    return 'unavailable';
  }
  if (error.code === 'CANDIDATE_EMAIL_ALREADY_EXISTS') {
    return 'duplicateEmail';
  }
  if (error.code === 'CANDIDATE_ARCHIVED') {
    return 'archived';
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
