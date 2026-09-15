import { CandidateRequestError } from '../api.js';

/**
 * Safe, language-neutral categories for a failed candidate request.
 *
 * The workspace shows its own localized copy for each category and never the
 * server's message text. Only stable API error codes and HTTP statuses are
 * read, so nothing here can surface backend detail to the interface.
 */
export type CandidateFailure =
  | 'archived'
  | 'conflict'
  | 'duplicateEmail'
  | 'forbidden'
  | 'invalid'
  | 'notFound'
  | 'recordUnavailable'
  | 'unavailable';

/**
 * A structured record that was archived meanwhile, or that no longer belongs
 * to this candidate. Both mean the row on screen is out of date, and neither
 * reveals anything beyond that.
 */
const RECORD_UNAVAILABLE_CODES: ReadonlySet<string> = new Set([
  'CANDIDATE_EDUCATION_ARCHIVED',
  'CANDIDATE_EDUCATION_NOT_FOUND',
  'CANDIDATE_LANGUAGE_ARCHIVED',
  'CANDIDATE_LANGUAGE_NOT_FOUND',
  'CANDIDATE_SKILL_ARCHIVED',
  'CANDIDATE_SKILL_NOT_FOUND',
  'CANDIDATE_WORK_EXPERIENCE_ARCHIVED',
  'CANDIDATE_WORK_EXPERIENCE_NOT_FOUND',
]);

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
  if (error.code && RECORD_UNAVAILABLE_CODES.has(error.code)) {
    return 'recordUnavailable';
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
