import type { CandidateConsentStatus, CandidateStatus } from '@hire-me/contracts';

import type { PlainMessageKey } from '../i18n/index.js';
import type { StatusTone } from '../ui/index.js';
import type { CandidateFailure } from './candidate-errors.js';
import {
  PUBLIC_APPLICATION_SOURCE,
  type CandidateFieldError,
  type CandidateLifecycleTarget,
  type CandidateRecordKind,
  type CandidateSourceMode,
} from './candidate-state.js';

/**
 * Presentation labels for language-neutral candidate values.
 *
 * The stored value stays authoritative: it is what the API returned and what a
 * lifecycle action sends back. These helpers only choose the dictionary key
 * that describes it, so a localized label never reaches the API and no branch
 * is ever taken on display text.
 */

export const CANDIDATE_STATUS_FILTER_OPTIONS: readonly CandidateStatus[] = [
  'ACTIVE',
  'INACTIVE',
  'TALENT_POOL',
  'ARCHIVED',
];

/** The non-archival lifecycle targets, in the order the workspace has always offered them. */
export const CANDIDATE_LIFECYCLE_TARGETS: readonly CandidateLifecycleTarget[] = [
  'ACTIVE',
  'INACTIVE',
  'TALENT_POOL',
];

export function candidateStatusLabelKey(status: CandidateStatus): PlainMessageKey {
  return `domain.candidateStatus.${status}`;
}

export function consentStatusLabelKey(status: CandidateConsentStatus): PlainMessageKey {
  return `domain.consentStatus.${status}`;
}

export function lifecycleActionLabelKey(status: CandidateLifecycleTarget): PlainMessageKey {
  return `candidate.lifecycle.moveTo.${status}`;
}

/**
 * Status tone supports the text label and never replaces it. Only an active
 * record reads as positive; the other states stay calm and neutral.
 */
export function candidateStatusTone(status: CandidateStatus): StatusTone {
  switch (status) {
    case 'ACTIVE':
      return 'success';
    case 'TALENT_POOL':
      return 'info';
    default:
      return 'neutral';
  }
}

export function candidateSourceModeLabelKey(
  mode: Exclude<CandidateSourceMode, ''>,
): PlainMessageKey {
  return `candidate.filters.sourceModes.${mode}`;
}

/**
 * How a stored source reads in the interface. The platform's own
 * `public_application` value has a label in each language; any other source is
 * what an operator recorded, shown exactly as recorded.
 */
export function candidateSourceLabel(source: string, t: (key: PlainMessageKey) => string): string {
  return source.trim().toLowerCase() === PUBLIC_APPLICATION_SOURCE
    ? t('candidate.source.publicApplication')
    : source;
}

export function candidateRecordKindLabelKey(kind: CandidateRecordKind): PlainMessageKey {
  return `candidate.records.kinds.${kind}`;
}

export function candidateFailureLabelKey(failure: CandidateFailure): PlainMessageKey {
  return `candidate.feedback.failure.${failure}`;
}

export function candidateFieldErrorLabelKey(error: CandidateFieldError): PlainMessageKey {
  return `candidate.validation.${error}`;
}
