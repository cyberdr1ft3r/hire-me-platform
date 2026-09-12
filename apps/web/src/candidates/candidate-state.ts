import type { CandidateDetail, CandidateStatus, CandidateSummary } from '@hire-me/contracts';

import type { CandidateFailure } from './candidate-errors.js';

/**
 * The list page size this surface has always requested. The API allows up to
 * 100; the workspace keeps asking for the same 20 most recent matches.
 */
export const CANDIDATE_LIST_PAGE_SIZE = 20;

/** The two list filters this surface exposes, exactly as the controls hold them. */
export interface CandidateFilterValues {
  search: string;
  status: '' | CandidateStatus;
}

export const EMPTY_CANDIDATE_FILTERS: CandidateFilterValues = { search: '', status: '' };

export function hasActiveCandidateFilters(filters: CandidateFilterValues): boolean {
  return filters.search.trim().length > 0 || filters.status !== '';
}

/**
 * Loading, a failed request, and a genuinely empty result are three different
 * states and never share one blank area.
 */
export type CandidateListState =
  | { status: 'error' }
  | { status: 'loading' }
  | { candidates: CandidateSummary[]; status: 'ready'; total: number };

export type CandidateDetailState =
  | { status: 'idle' }
  | { candidateId: string; status: 'error' }
  | { candidateId: string; status: 'loading' }
  | { candidate: CandidateDetail; status: 'ready' };

/** The lifecycle targets reachable through the status endpoint. */
export type CandidateLifecycleTarget = Exclude<CandidateStatus, 'ARCHIVED'>;

/** The one mutation in flight, if any. Every write action waits for it. */
export type CandidatePendingAction =
  'archive' | 'create' | 'education' | 'experience' | 'language' | 'skill' | 'status' | 'update';

/**
 * Feedback is stored as meaning, not as text, so switching language re-renders
 * it in the new language instead of leaving a stale sentence behind.
 */
export type CandidateFeedback =
  | {
      kind:
        | 'archived'
        | 'created'
        | 'educationAdded'
        | 'experienceAdded'
        | 'languageAdded'
        | 'skillAdded'
        | 'updated';
      tone: 'success';
    }
  | { kind: 'statusChanged'; status: CandidateLifecycleTarget; tone: 'success' }
  | { failure: CandidateFailure; kind: 'failed'; tone: 'danger' };

/* --- Form values ------------------------------------------------------- */

/**
 * Form values are the raw control strings. The container turns them into the
 * exact request bodies the workspace has always sent, so presentation never
 * decides what reaches the API.
 */
export interface CandidateCreateValues {
  city: string;
  country: string;
  currentJobTitle: string;
  displayName: string;
  email: string;
  phone: string;
  source: string;
}

/** The eight approved master fields the profile edit has always sent. */
export interface CandidateProfileValues extends CandidateCreateValues {
  professionalSummary: string;
}

export type CandidateRecordInput =
  | { kind: 'education'; values: { field: string; institution: string; qualification: string } }
  | {
      kind: 'experience';
      values: {
        employer: string;
        endDate: string;
        isCurrent: boolean;
        startDate: string;
        title: string;
      };
    }
  | { kind: 'language'; values: { language: string; proficiency: string } }
  | { kind: 'skill'; values: { level: string; name: string } };

export type CandidateFieldError = 'duplicateEmail' | 'email' | 'required';

/**
 * What a submitted form learns back from the container: success, field-level
 * errors to show beside their controls, and/or one safe form-level failure.
 */
export type CandidateFormOutcome =
  | { ok: true }
  | {
      failure?: CandidateFailure;
      fieldErrors?: Partial<Record<string, CandidateFieldError>>;
      ok: false;
    };
