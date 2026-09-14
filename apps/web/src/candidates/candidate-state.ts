import type { CandidateDetail, CandidateStatus, CandidateSummary } from '@hire-me/contracts';

import type { CandidateFailure } from './candidate-errors.js';

/**
 * The list page size this surface has always requested. The API allows up to
 * 100; the workspace pages through the matches 20 at a time, in the server's
 * deterministic order (newest first, then by ID).
 */
export const CANDIDATE_LIST_PAGE_SIZE = 20;

/**
 * The one candidate source value the platform records by itself: a candidate
 * created from a public application. Every other stored source is free text
 * that an operator entered, so it is data rather than a category and is
 * filtered by exactly what was recorded.
 */
export const PUBLIC_APPLICATION_SOURCE = 'public_application';

/**
 * How the source filter is being used: no source, the platform's own public
 * application value, or a source matched exactly as an operator recorded it.
 */
export type CandidateSourceMode = '' | 'publicApplication' | 'recorded';

export const CANDIDATE_SOURCE_MODES: readonly Exclude<CandidateSourceMode, ''>[] = [
  'publicApplication',
  'recorded',
];

/** The list filters, exactly as the controls hold them. */
export interface CandidateFilterValues {
  search: string;
  sourceMode: CandidateSourceMode;
  /** The source as recorded, used only when `sourceMode` is `recorded`. */
  sourceText: string;
  status: '' | CandidateStatus;
}

export const EMPTY_CANDIDATE_FILTERS: CandidateFilterValues = {
  search: '',
  sourceMode: '',
  sourceText: '',
  status: '',
};

/**
 * The language-neutral `source` value the list request sends, or nothing. The
 * API matches it exactly, ignoring case; a label is never sent.
 */
export function candidateSourceQuery(filters: CandidateFilterValues): string | undefined {
  if (filters.sourceMode === 'publicApplication') {
    return PUBLIC_APPLICATION_SOURCE;
  }
  if (filters.sourceMode === 'recorded') {
    const recorded = filters.sourceText.trim();
    return recorded.length > 0 ? recorded : undefined;
  }
  return undefined;
}

export function hasActiveCandidateFilters(filters: CandidateFilterValues): boolean {
  return (
    filters.search.trim().length > 0 ||
    filters.status !== '' ||
    candidateSourceQuery(filters) !== undefined
  );
}

/** One list request: the applied filters and the page they are read at. */
export interface CandidateListQuery {
  filters: CandidateFilterValues;
  page: number;
}

export const FIRST_CANDIDATE_PAGE: CandidateListQuery = {
  filters: EMPTY_CANDIDATE_FILTERS,
  page: 1,
};

/**
 * Loading, a failed request, and a genuinely empty result are three different
 * states and never share one blank area. A ready list carries the page it is
 * and the server's total, so paging is always server-side.
 */
export type CandidateListState =
  | { status: 'error' }
  | { status: 'loading' }
  | {
      candidates: CandidateSummary[];
      page: number;
      pageSize: number;
      status: 'ready';
      total: number;
    };

export function candidatePageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

export type CandidateDetailState =
  | { status: 'idle' }
  | { candidateId: string; status: 'error' }
  | { candidateId: string; status: 'loading' }
  | { candidate: CandidateDetail; status: 'ready' };

/** The lifecycle targets reachable through the status endpoint. */
export type CandidateLifecycleTarget = Exclude<CandidateStatus, 'ARCHIVED'>;

/**
 * The one mutation in flight, if any. Every write action waits for it. A
 * structured record's own edit or archival is keyed by that record, so only
 * its row shows progress.
 */
export type CandidatePendingAction =
  | 'archive'
  | 'create'
  | 'education'
  | 'experience'
  | 'language'
  | 'skill'
  | 'status'
  | 'update'
  | `record:${string}`;

export function recordPendingAction(recordId: string): CandidatePendingAction {
  return `record:${recordId}`;
}

/** The four structured profile record types. */
export type CandidateRecordKind = 'education' | 'experience' | 'language' | 'skill';

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
  | { kind: 'recordArchived' | 'recordUpdated'; record: CandidateRecordKind; tone: 'success' }
  | { kind: 'statusChanged'; status: CandidateLifecycleTarget; tone: 'success' }
  | { failure: CandidateFailure; kind: 'failed'; tone: 'danger' };

/* --- Form values ------------------------------------------------------- */

/**
 * Form values are the raw control strings. The container turns them into the
 * exact request bodies the workspace sends, so presentation never decides
 * what reaches the API.
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

/** The values each structured record form holds: the same fields to add and to edit. */
export interface CandidateRecordValues {
  education: { field: string; institution: string; qualification: string };
  experience: {
    employer: string;
    endDate: string;
    isCurrent: boolean;
    startDate: string;
    title: string;
  };
  language: { language: string; proficiency: string };
  skill: { level: string; name: string };
}

export type CandidateRecordInput = {
  [Kind in CandidateRecordKind]: { kind: Kind; values: CandidateRecordValues[Kind] };
}[CandidateRecordKind];

/** An edit of one existing record, identified by its record ID only internally. */
export type CandidateRecordUpdate = CandidateRecordInput & { recordId: string };

/** The archival of one existing record. There is no deletion. */
export interface CandidateRecordRef {
  kind: CandidateRecordKind;
  recordId: string;
}

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
