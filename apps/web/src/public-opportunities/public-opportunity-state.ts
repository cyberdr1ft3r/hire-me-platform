import type { PublicOpportunity } from '@hire-me/contracts';

import { PublicRequestError } from '../api.js';

/**
 * Loading, failure, and emptiness are different states and never share one
 * blank area. An empty list is a successful `ready` result with no rows.
 */
export type PublicListState =
  | { status: 'error' }
  | { status: 'loading' }
  | { opportunities: PublicOpportunity[]; status: 'ready' };

/**
 * `notFound` is every 404 the API returns. The server answers an unknown slug,
 * and an opportunity that is not open, has its link disabled, is outside its
 * publication window, or belongs to an unavailable mission, with the same 404,
 * so the page shows the same words for all of them and can reveal nothing the
 * server deliberately hides. `error` is a network or server failure, which says
 * nothing about the opportunity itself.
 */
export type PublicDetailState =
  | { status: 'error' }
  | { status: 'loading' }
  | { status: 'notFound' }
  | { opportunity: PublicOpportunity; status: 'ready' };

/** Safe, language-neutral categories for a submission the server refused. */
export type PublicSubmissionFailure = 'failed' | 'invalid' | 'rateLimited' | 'unavailable';

/**
 * `received` is shown only after the server has answered `RECEIVED`. The server
 * gives that same answer for duplicate and otherwise quietly declined
 * applications, so the page promises nothing beyond receipt.
 */
export type PublicSubmissionState =
  | { failure: PublicSubmissionFailure; status: 'failed' }
  | { status: 'idle' }
  | { status: 'received' }
  | { status: 'submitting' };

export function isNotFound(error: unknown): boolean {
  return error instanceof PublicRequestError && error.status === 404;
}

/** Only the HTTP status is read; the server's message text never reaches the page. */
export function classifySubmissionFailure(error: unknown): PublicSubmissionFailure {
  if (!(error instanceof PublicRequestError)) {
    return 'failed';
  }
  switch (error.status) {
    case 400:
      return 'invalid';
    case 404:
      return 'unavailable';
    case 429:
      return 'rateLimited';
    default:
      return 'failed';
  }
}
