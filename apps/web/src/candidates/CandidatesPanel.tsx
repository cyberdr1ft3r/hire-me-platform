import type {
  CandidateCreateRequest,
  CandidateDetail,
  CandidateUpdateRequest,
} from '@hire-me/contracts';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import {
  archiveCandidate,
  createCandidate,
  createCandidateEducation,
  createCandidateLanguage,
  createCandidateSkill,
  createCandidateWorkExperience,
  getCandidate,
  listCandidates,
  updateCandidate,
  updateCandidateStatus,
} from '../api.js';
import { useI18n } from '../i18n/index.js';
import { resolveCandidateAccess } from './candidate-access.js';
import { classifyCandidateFailure, type CandidateFailure } from './candidate-errors.js';
import { candidateStatusLabelKey } from './candidate-labels.js';
import {
  CANDIDATE_LIST_PAGE_SIZE,
  EMPTY_CANDIDATE_FILTERS,
  type CandidateCreateValues,
  type CandidateDetailState,
  type CandidateFeedback,
  type CandidateFilterValues,
  type CandidateFormOutcome,
  type CandidateLifecycleTarget,
  type CandidateListState,
  type CandidatePendingAction,
  type CandidateProfileValues,
  type CandidateRecordInput,
} from './candidate-state.js';
import { CandidateWorkspace } from './CandidateWorkspace.js';

/** An optional field: trimmed, or omitted when empty, exactly as before. */
function optional(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** A clearable field: trimmed, or `null` when empty, exactly as before. */
function nullable(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * The create body the workspace has always sent: seven approved fields, the
 * name as entered, everything else trimmed or omitted. It never carries
 * lifecycle, compensation, or consent fields.
 */
export function toCandidateCreateRequest(values: CandidateCreateValues): CandidateCreateRequest {
  return {
    displayName: values.displayName,
    email: optional(values.email),
    phone: optional(values.phone),
    city: optional(values.city),
    country: optional(values.country),
    currentJobTitle: optional(values.currentJobTitle),
    source: optional(values.source),
  };
}

/**
 * The update body the workspace has always sent: the same eight approved
 * master fields every time, a cleared field sent as `null`. Compensation and
 * consent keys are never present, so an ordinary profile save can never touch
 * them, whatever the actor's permissions.
 */
export function toCandidateUpdateRequest(values: CandidateProfileValues): CandidateUpdateRequest {
  return {
    displayName: values.displayName,
    email: nullable(values.email),
    phone: nullable(values.phone),
    city: nullable(values.city),
    country: nullable(values.country),
    currentJobTitle: nullable(values.currentJobTitle),
    professionalSummary: nullable(values.professionalSummary),
    source: nullable(values.source),
  };
}

const RECORD_ADDED_FEEDBACK = {
  education: 'educationAdded',
  experience: 'experienceAdded',
  language: 'languageAdded',
  skill: 'skillAdded',
} as const satisfies Record<CandidateRecordInput['kind'], string>;

/**
 * The result a form receives for a write that could not start, or whose
 * candidate context has moved on. The form that submitted it belongs to a
 * record that is no longer on screen, so nothing is shown: neither the success
 * nor the failure.
 */
const SUPERSEDED: CandidateFormOutcome = { ok: false };

function failureOutcome(failure: CandidateFailure): CandidateFormOutcome {
  return failure === 'duplicateEmail'
    ? { fieldErrors: { email: 'duplicateEmail' }, ok: false }
    : { failure, ok: false };
}

/**
 * Container for the Candidate workspace.
 *
 * It owns everything with a consequence: the authenticated reads, the applied
 * filters, selection, every mutation, the confirmation prompts, and the
 * permission-derived access flags. `CandidateWorkspace` below it is
 * presentation only, so the visual work cannot change a request, a permission
 * rule, or a filter semantic.
 *
 * The candidate endpoints, their payloads, their lifecycle rules, and the
 * server-side authorization and redaction behind them are unchanged.
 */
export function CandidatesPanel({
  accessToken,
  permissions,
}: {
  accessToken: string;
  permissions: string[];
}) {
  const { t } = useI18n();
  const access = useMemo(() => resolveCandidateAccess(permissions), [permissions]);
  const [filters, setFilters] = useState<CandidateFilterValues>(EMPTY_CANDIDATE_FILTERS);
  const [appliedFilters, setAppliedFilters] =
    useState<CandidateFilterValues>(EMPTY_CANDIDATE_FILTERS);
  const [list, setList] = useState<CandidateListState>({ status: 'loading' });
  const [detail, setDetail] = useState<CandidateDetailState>({ status: 'idle' });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pending, setPending] = useState<CandidatePendingAction | null>(null);
  const [feedback, setFeedback] = useState<CandidateFeedback | null>(null);

  /*
   * Monotonic request counters. A list or detail response may commit only while
   * it is still the latest one of its kind, so a slow response for an earlier
   * search or an earlier selection can never overwrite a newer one. The
   * selected id is mirrored in a ref for the same reason: a mutation that
   * resolves after the user moved to another candidate must not replace it.
   */
  const listRequest = useRef(0);
  const detailRequest = useRef(0);
  const selectedRef = useRef<string | null>(null);

  /*
   * The candidate context a write belongs to. It advances whenever the
   * selection or the session changes, and each write captures it when it
   * starts. A write whose context has moved on still completes on the server —
   * nothing is cancelled — but its candidate-scoped result (the record, and its
   * success or failure feedback) is not shown on whichever candidate is now
   * selected.
   */
  const contextGeneration = useRef(0);

  /*
   * One Candidate write at a time. The ref closes the gap between a click and
   * the re-render that disables every write control, so a second write can
   * never start while the first is still in flight.
   */
  const writeInFlight = useRef(false);

  /*
   * The latest committed list filters and the current session token.
   *
   * A write can resolve long after the render that started it: the user may
   * have applied other filters meanwhile, or the session may have moved to a
   * new token. The post-write list refresh therefore reads these refs instead
   * of the values its own render captured. The filter ref is written in the
   * same handler that commits the filters, so there is no window in which a
   * refresh could still see the previous ones.
   */
  const appliedFiltersRef = useRef<CandidateFilterValues>(EMPTY_CANDIDATE_FILTERS);
  const sessionToken = useRef(accessToken);

  useLayoutEffect(() => {
    sessionToken.current = accessToken;
  }, [accessToken]);

  function applyFilters(next: CandidateFilterValues): void {
    appliedFiltersRef.current = next;
    setAppliedFilters(next);
  }

  /**
   * Refreshes the list after a write with the latest applied filters, but only
   * while the write still belongs to the current session. A selection change
   * does not suppress it: the list shows every matching candidate, not the
   * selection. A write from an earlier session starts no request at all, so it
   * can neither reuse that session's token nor supersede the current list.
   */
  function refreshListAfterWrite(session: string): void {
    if (session !== sessionToken.current) {
      return;
    }
    void loadList(appliedFiltersRef.current, true);
  }

  function captureContext(candidateId: string | null): () => boolean {
    const generation = contextGeneration.current;
    return () => contextGeneration.current === generation && selectedRef.current === candidateId;
  }

  function beginWrite(action: CandidatePendingAction): boolean {
    if (writeInFlight.current) {
      return false;
    }
    writeInFlight.current = true;
    setPending(action);
    return true;
  }

  function endWrite(): void {
    writeInFlight.current = false;
    setPending(null);
  }

  async function loadList(nextFilters: CandidateFilterValues, quiet = false): Promise<void> {
    const request = ++listRequest.current;
    if (!quiet) {
      setList({ status: 'loading' });
    }
    try {
      // The same query as before: page 1 of 20, search and status only.
      const response = await listCandidates({
        accessToken,
        search: nextFilters.search,
        status: nextFilters.status || undefined,
        pageSize: CANDIDATE_LIST_PAGE_SIZE,
      });
      if (request === listRequest.current) {
        setList({
          candidates: response.candidates,
          status: 'ready',
          total: response.pagination.total,
        });
      }
    } catch {
      // A quiet refresh after a mutation keeps the rows already on screen.
      if (request === listRequest.current && !quiet) {
        setList({ status: 'error' });
      }
    }
  }

  /*
   * The list reloads when the session or the applied filters change, and never
   * because the interface language changed: switching English and French only
   * re-renders labels and `Intl` formatting.
   */
  useEffect(() => {
    void loadList(appliedFilters);
    return () => {
      listRequest.current += 1;
    };
    // `loadList` reads only `accessToken`, which is listed here.
  }, [accessToken, appliedFilters]);

  // A new session, or leaving the workspace, ends every candidate context.
  useEffect(
    () => () => {
      detailRequest.current += 1;
      contextGeneration.current += 1;
    },
    [accessToken],
  );

  async function loadDetail(candidateId: string, quiet = false): Promise<void> {
    const request = ++detailRequest.current;
    if (!quiet) {
      setDetail({ candidateId, status: 'loading' });
    }
    try {
      const response = await getCandidate(accessToken, candidateId);
      if (request === detailRequest.current && selectedRef.current === candidateId) {
        setDetail({ candidate: response.candidate, status: 'ready' });
      }
    } catch {
      if (request === detailRequest.current && selectedRef.current === candidateId && !quiet) {
        setDetail({ candidateId, status: 'error' });
      }
    }
  }

  /**
   * Commits a fresh record from a mutation response, invalidating older reads,
   * but only while the write's own candidate context is still current.
   */
  function commitDetail(candidate: CandidateDetail, isCurrent: () => boolean): void {
    if (!isCurrent() || selectedRef.current !== candidate.id) {
      return;
    }
    detailRequest.current += 1;
    setDetail({ candidate, status: 'ready' });
  }

  function select(candidateId: string): void {
    contextGeneration.current += 1;
    selectedRef.current = candidateId;
    setSelectedId(candidateId);
    setFeedback(null);
  }

  function handleSelect(candidateId: string): void {
    select(candidateId);
    void loadDetail(candidateId);
  }

  function handleSearch(): void {
    applyFilters({ ...filters });
  }

  function handleResetFilters(): void {
    setFilters({ ...EMPTY_CANDIDATE_FILTERS });
    applyFilters({ ...EMPTY_CANDIDATE_FILTERS });
  }

  function handleRetryList(): void {
    applyFilters({ ...appliedFiltersRef.current });
  }

  function handleRetryDetail(): void {
    if (selectedRef.current) {
      void loadDetail(selectedRef.current);
    }
  }

  /**
   * An archived-conflict means the record changed underneath the user, so the
   * record and the list are refreshed to show its real state.
   */
  function refreshAfterFailure(
    failure: CandidateFailure,
    candidateId: string,
    isCurrent: () => boolean,
    session: string,
  ): void {
    if (failure === 'archived' || failure === 'conflict') {
      if (isCurrent()) {
        void loadDetail(candidateId, true);
      }
      refreshListAfterWrite(session);
    }
  }

  async function handleCreate(values: CandidateCreateValues): Promise<CandidateFormOutcome> {
    if (!beginWrite('create')) {
      return SUPERSEDED;
    }
    // Creation belongs to no candidate; it only takes over the selection if the
    // user has not selected another candidate while it was in flight.
    const isCurrent = captureContext(selectedRef.current);
    try {
      const created = await createCandidate(accessToken, toCandidateCreateRequest(values));
      if (isCurrent()) {
        select(created.candidate.id);
        commitDetail(created.candidate, () => true);
        setFeedback({ kind: 'created', tone: 'success' });
      }
      refreshListAfterWrite(accessToken);
      return { ok: true };
    } catch (error) {
      return failureOutcome(classifyCandidateFailure(error));
    } finally {
      endWrite();
    }
  }

  async function handleUpdate(values: CandidateProfileValues): Promise<CandidateFormOutcome> {
    if (detail.status !== 'ready' || !beginWrite('update')) {
      return SUPERSEDED;
    }
    const current = detail.candidate;
    const isCurrent = captureContext(current.id);
    try {
      const updated = await updateCandidate(
        accessToken,
        current.id,
        toCandidateUpdateRequest(values),
      );
      // The list may always refresh: it shows every candidate, not the selection.
      refreshListAfterWrite(accessToken);
      if (!isCurrent()) {
        return SUPERSEDED;
      }
      commitDetail(updated.candidate, isCurrent);
      setFeedback({ kind: 'updated', tone: 'success' });
      return { ok: true };
    } catch (error) {
      const failure = classifyCandidateFailure(error);
      refreshAfterFailure(failure, current.id, isCurrent, accessToken);
      return isCurrent() ? failureOutcome(failure) : SUPERSEDED;
    } finally {
      endWrite();
    }
  }

  async function handleChangeStatus(status: CandidateLifecycleTarget): Promise<void> {
    if (detail.status !== 'ready' || writeInFlight.current) {
      return;
    }
    const current = detail.candidate;
    // The same explicit confirmation as before, now in the interface language.
    if (
      !window.confirm(
        t('candidate.lifecycle.confirmStatus', { status: t(candidateStatusLabelKey(status)) }),
      ) ||
      !beginWrite('status')
    ) {
      return;
    }
    const isCurrent = captureContext(current.id);
    setFeedback(null);
    try {
      const updated = await updateCandidateStatus(accessToken, current.id, { status });
      refreshListAfterWrite(accessToken);
      if (isCurrent()) {
        commitDetail(updated.candidate, isCurrent);
        setFeedback({ kind: 'statusChanged', status, tone: 'success' });
      }
    } catch (error) {
      const failure = classifyCandidateFailure(error);
      if (isCurrent()) {
        setFeedback({ failure, kind: 'failed', tone: 'danger' });
      }
      refreshAfterFailure(failure, current.id, isCurrent, accessToken);
    } finally {
      endWrite();
    }
  }

  async function handleArchive(): Promise<void> {
    if (detail.status !== 'ready' || writeInFlight.current) {
      return;
    }
    const current = detail.candidate;
    // Archival stays a serious, explicitly confirmed action. There is no deletion.
    if (!window.confirm(t('candidate.lifecycle.confirmArchive')) || !beginWrite('archive')) {
      return;
    }
    const isCurrent = captureContext(current.id);
    setFeedback(null);
    try {
      const archived = await archiveCandidate(accessToken, current.id);
      refreshListAfterWrite(accessToken);
      if (isCurrent()) {
        commitDetail(archived.candidate, isCurrent);
        setFeedback({ kind: 'archived', tone: 'success' });
      }
    } catch (error) {
      const failure = classifyCandidateFailure(error);
      if (isCurrent()) {
        setFeedback({ failure, kind: 'failed', tone: 'danger' });
      }
      refreshAfterFailure(failure, current.id, isCurrent, accessToken);
    } finally {
      endWrite();
    }
  }

  /**
   * Structured profile records, each with exactly the body the workspace has
   * always sent. The record is re-read afterwards, as before, so the new row
   * appears with its server-assigned identity and ordering.
   */
  async function handleAddRecord(input: CandidateRecordInput): Promise<CandidateFormOutcome> {
    if (detail.status !== 'ready' || !beginWrite(input.kind)) {
      return SUPERSEDED;
    }
    const candidateId = detail.candidate.id;
    const isCurrent = captureContext(candidateId);
    setFeedback(null);
    try {
      switch (input.kind) {
        case 'skill':
          await createCandidateSkill(accessToken, candidateId, {
            name: input.values.name,
            level: optional(input.values.level),
          });
          break;
        case 'language':
          await createCandidateLanguage(accessToken, candidateId, {
            language: input.values.language,
            proficiency: input.values.proficiency,
          });
          break;
        case 'experience':
          await createCandidateWorkExperience(accessToken, candidateId, {
            employer: input.values.employer,
            title: input.values.title,
            startDate: optional(input.values.startDate),
            endDate: optional(input.values.endDate),
            isCurrent: input.values.isCurrent,
          });
          break;
        case 'education':
          await createCandidateEducation(accessToken, candidateId, {
            institution: input.values.institution,
            qualification: input.values.qualification,
            field: optional(input.values.field),
          });
          break;
      }
    } catch (error) {
      const failure = classifyCandidateFailure(error);
      refreshAfterFailure(failure, candidateId, isCurrent, accessToken);
      endWrite();
      return isCurrent() ? failureOutcome(failure) : SUPERSEDED;
    }

    if (!isCurrent()) {
      endWrite();
      return SUPERSEDED;
    }
    await loadDetail(candidateId, true);
    endWrite();
    if (!isCurrent()) {
      return SUPERSEDED;
    }
    setFeedback({ kind: RECORD_ADDED_FEEDBACK[input.kind], tone: 'success' });
    return { ok: true };
  }

  return (
    <CandidateWorkspace
      access={access}
      appliedFilters={appliedFilters}
      detail={detail}
      feedback={feedback}
      filters={filters}
      list={list}
      onAddRecord={handleAddRecord}
      onArchive={() => void handleArchive()}
      onChangeStatus={(status) => void handleChangeStatus(status)}
      onCreate={handleCreate}
      onFiltersChange={setFilters}
      onResetFilters={handleResetFilters}
      onRetryDetail={handleRetryDetail}
      onRetryList={handleRetryList}
      onSearch={handleSearch}
      onSelect={handleSelect}
      onUpdate={handleUpdate}
      pending={pending}
      selectedId={selectedId}
    />
  );
}
