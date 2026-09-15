import type { CandidateDetail, CandidateUpdateRequest } from '@hire-me/contracts';
import { useMemo, useState } from 'react';

import {
  CANDIDATE_LIST_PAGE_SIZE,
  CandidateWorkspace,
  EMPTY_CANDIDATE_FILTERS,
  candidateSourceQuery,
  resolveCandidateAccess,
  sensitiveUpdateRequest,
  type CandidateDetailState,
  type CandidateFeedback,
  type CandidateFilterValues,
  type CandidateFormOutcome,
  type CandidateListQuery,
  type CandidateListState,
  type CandidateRecordRef,
  type CandidateRecordUpdate,
} from '../candidates/index.js';
import { I18nProvider, useI18n } from '../i18n/index.js';
import { Select } from '../ui/index.js';
import { AppShell } from '../ui/shell/AppShell.js';
import {
  PREVIEW_CANDIDATES,
  PREVIEW_MANY_CANDIDATES,
  PREVIEW_PERMISSIONS,
  previewUser,
  shapeForAccess,
  type PreviewAccessProfile,
} from './candidate-preview-data.js';

/**
 * Development-only review surface for the Candidate workspace.
 *
 * It renders the real `CandidateWorkspace` inside the real `AppShell` and the
 * real `I18nProvider`, so switching language or access profile exercises the
 * same components production uses. There is no second, preview-only copy of
 * the workspace.
 *
 * It performs no request of any kind and contains only synthetic records. It
 * is not linked from product navigation and is excluded from the production
 * build. Search, source, status, and paging work locally over the synthetic
 * set in place of the server; a structured record, the compensation, and the
 * consent can be edited locally so those flows can be reviewed. Other forms
 * only report success, because there is no API behind them.
 *
 * Switching the access profile stands in for a new principal: it resets any
 * open compensation or consent form, as a new session does in production.
 *
 * `?dataset=many` starts with enough candidates for three pages.
 */
export function CandidatePreview() {
  return (
    <I18nProvider>
      <CandidatePreviewContent />
    </I18nProvider>
  );
}

type PreviewDataset = 'empty' | 'many' | 'populated';

const ACCEPTED: Promise<CandidateFormOutcome> = Promise.resolve({ ok: true });

function datasetRecords(dataset: PreviewDataset): CandidateDetail[] {
  if (dataset === 'empty') return [];
  return [...(dataset === 'many' ? PREVIEW_MANY_CANDIDATES : PREVIEW_CANDIDATES)];
}

function matches(filters: CandidateFilterValues, record: CandidateDetail) {
  const search = filters.search.trim().toLowerCase();
  const source = candidateSourceQuery(filters)?.toLowerCase();
  const haystack = [
    record.displayName,
    record.email,
    record.currentJobTitle,
    record.city,
    record.country,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return (
    (!filters.status || record.status === filters.status) &&
    (!source || record.source?.toLowerCase() === source) &&
    (!search || haystack.includes(search))
  );
}

function nullable(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Applies a structured-record edit to a synthetic candidate, as the API would. */
function applyUpdate(record: CandidateDetail, update: CandidateRecordUpdate): CandidateDetail {
  switch (update.kind) {
    case 'skill':
      return {
        ...record,
        skills: record.skills.map((entry) =>
          entry.id === update.recordId
            ? { ...entry, level: nullable(update.values.level), name: update.values.name.trim() }
            : entry,
        ),
      };
    case 'language':
      return {
        ...record,
        languages: record.languages.map((entry) =>
          entry.id === update.recordId
            ? {
                ...entry,
                language: update.values.language.trim(),
                proficiency: update.values.proficiency.trim(),
              }
            : entry,
        ),
      };
    case 'experience':
      return {
        ...record,
        workExperiences: record.workExperiences.map((entry) =>
          entry.id === update.recordId
            ? {
                ...entry,
                description: nullable(update.values.description),
                employer: update.values.employer.trim(),
                endDate: nullable(update.values.endDate),
                isCurrent: update.values.isCurrent,
                startDate: nullable(update.values.startDate),
                title: update.values.title.trim(),
              }
            : entry,
        ),
      };
    case 'education':
      return {
        ...record,
        education: record.education.map((entry) =>
          entry.id === update.recordId
            ? {
                ...entry,
                description: nullable(update.values.description),
                endDate: nullable(update.values.endDate),
                field: nullable(update.values.field),
                institution: update.values.institution.trim(),
                qualification: update.values.qualification.trim(),
                startDate: nullable(update.values.startDate),
              }
            : entry,
        ),
      };
  }
}

/** Applies a partial compensation or consent update to a synthetic candidate, as the API would. */
function applySensitive(record: CandidateDetail, body: CandidateUpdateRequest): CandidateDetail {
  const compensation = record.compensation ?? {
    salaryExpectationCents: null,
    salaryExpectationCurrency: null,
  };
  const consent = record.consent ?? { consentRecordedAt: null, consentStatus: 'UNKNOWN' };
  return {
    ...record,
    compensation: {
      salaryExpectationCents:
        body.salaryExpectationCents !== undefined
          ? body.salaryExpectationCents
          : compensation.salaryExpectationCents,
      salaryExpectationCurrency:
        body.salaryExpectationCurrency !== undefined
          ? body.salaryExpectationCurrency
          : compensation.salaryExpectationCurrency,
    },
    consent: {
      consentRecordedAt:
        body.consentRecordedAt !== undefined ? body.consentRecordedAt : consent.consentRecordedAt,
      consentStatus: body.consentStatus ?? consent.consentStatus,
    },
  };
}

/** Marks a synthetic structured record archived; it stays as history. */
function applyArchive(record: CandidateDetail, ref: CandidateRecordRef): CandidateDetail {
  const archivedAt = new Date().toISOString();
  const archive = <Row extends { archivedAt: string | null; id: string }>(rows: Row[]) =>
    rows.map((row) => (row.id === ref.recordId ? { ...row, archivedAt } : row));
  switch (ref.kind) {
    case 'skill':
      return { ...record, skills: archive(record.skills) };
    case 'language':
      return { ...record, languages: archive(record.languages) };
    case 'experience':
      return { ...record, workExperiences: archive(record.workExperiences) };
    case 'education':
      return { ...record, education: archive(record.education) };
  }
}

function CandidatePreviewContent() {
  const { t } = useI18n();
  const initialDataset: PreviewDataset =
    new URLSearchParams(window.location.search).get('dataset') === 'many' ? 'many' : 'populated';
  const [dataset, setDataset] = useState<PreviewDataset>(initialDataset);
  const [records, setRecords] = useState<CandidateDetail[]>(() => datasetRecords(initialDataset));
  const [profile, setProfile] = useState<PreviewAccessProfile>('full');
  const [filters, setFilters] = useState<CandidateFilterValues>(EMPTY_CANDIDATE_FILTERS);
  const [query, setQuery] = useState<CandidateListQuery>({
    filters: EMPTY_CANDIDATE_FILTERS,
    page: 1,
  });
  const [feedback, setFeedback] = useState<CandidateFeedback | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(PREVIEW_CANDIDATES[0]?.id ?? null);
  const [sessionKey, setSessionKey] = useState(0);

  const permissions = PREVIEW_PERMISSIONS[profile];
  const access = useMemo(() => resolveCandidateAccess(permissions), [permissions]);
  const visible = records.filter((record) => matches(query.filters, record));
  const start = (query.page - 1) * CANDIDATE_LIST_PAGE_SIZE;
  const list: CandidateListState = {
    // The preview stands in for the server page; production never slices in the browser.
    candidates: visible
      .slice(start, start + CANDIDATE_LIST_PAGE_SIZE)
      .map((record) => shapeForAccess(record, permissions)),
    page: query.page,
    pageSize: CANDIDATE_LIST_PAGE_SIZE,
    status: 'ready',
    total: visible.length,
  };
  const selected = records.find((record) => record.id === selectedId);
  const detail: CandidateDetailState = selected
    ? { candidate: shapeForAccess(selected, permissions), status: 'ready' }
    : { status: 'idle' };

  function updateSelected(change: (record: CandidateDetail) => CandidateDetail): void {
    setRecords((current) =>
      current.map((record) => (record.id === selectedId ? change(record) : record)),
    );
  }

  return (
    <AppShell
      apiState={{ message: 'hire-me-api is ok', status: 'ready' }}
      currentRoute="candidates"
      onLogout={() => undefined}
      onNavigate={() => undefined}
      onRefreshUser={() => undefined}
      user={{ ...previewUser, permissions: [...permissions] }}
    >
      <div className="candidate-preview__switches">
        <Select
          label={t('preview.candidate.dataset')}
          onChange={(event) => {
            const next = event.target.value;
            const value: PreviewDataset = next === 'empty' || next === 'many' ? next : 'populated';
            setDataset(value);
            setRecords(datasetRecords(value));
            setQuery({ filters: EMPTY_CANDIDATE_FILTERS, page: 1 });
            setFilters(EMPTY_CANDIDATE_FILTERS);
          }}
          value={dataset}
        >
          <option value="populated">{t('preview.candidate.populated')}</option>
          <option value="many">{t('preview.candidate.many')}</option>
          <option value="empty">{t('preview.candidate.empty')}</option>
        </Select>
        <Select
          label={t('preview.candidate.access')}
          onChange={(event) => {
            const next = event.target.value;
            setProfile(
              next === 'recruiter' || next === 'restrictedViewer' || next === 'viewer'
                ? next
                : 'full',
            );
            setSessionKey((key) => key + 1);
          }}
          value={profile}
        >
          <option value="full">{t('preview.candidate.accessFull')}</option>
          <option value="restrictedViewer">{t('preview.candidate.accessRestrictedViewer')}</option>
          <option value="recruiter">{t('preview.candidate.accessRecruiter')}</option>
          <option value="viewer">{t('preview.candidate.accessViewer')}</option>
        </Select>
      </div>
      <CandidateWorkspace
        access={access}
        appliedFilters={query.filters}
        detail={detail}
        feedback={feedback}
        filters={filters}
        list={list}
        onAddRecord={() => ACCEPTED}
        onArchive={() => undefined}
        onArchiveRecord={(ref) => {
          updateSelected((record) => applyArchive(record, ref));
          setFeedback({ kind: 'recordArchived', record: ref.kind, tone: 'success' });
          return Promise.resolve(true);
        }}
        onChangeStatus={() => undefined}
        onCreate={() => ACCEPTED}
        onFiltersChange={setFilters}
        onPage={(page) => setQuery((current) => ({ ...current, page }))}
        onResetFilters={() => {
          setFilters({ ...EMPTY_CANDIDATE_FILTERS });
          setQuery({ filters: { ...EMPTY_CANDIDATE_FILTERS }, page: 1 });
        }}
        onRetryDetail={() => undefined}
        onRetryList={() => undefined}
        onSearch={() => setQuery({ filters: { ...filters }, page: 1 })}
        onSelect={(id) => {
          setSelectedId(id);
          setFeedback(null);
        }}
        onUpdate={() => ACCEPTED}
        onUpdateRecord={(update) => {
          updateSelected((record) => applyUpdate(record, update));
          setFeedback({ kind: 'recordUpdated', record: update.kind, tone: 'success' });
          return ACCEPTED;
        }}
        onUpdateSensitive={(update) => {
          const request =
            detail.status === 'ready' ? sensitiveUpdateRequest(detail.candidate, update) : null;
          if (!request) {
            return Promise.resolve({ ok: false });
          }
          if (!request.ok) {
            return Promise.resolve({ fieldErrors: request.fieldErrors, ok: false });
          }
          if (Object.keys(request.body).length > 0) {
            updateSelected((record) => applySensitive(record, request.body));
            setFeedback({
              kind: update.kind === 'compensation' ? 'compensationUpdated' : 'consentUpdated',
              tone: 'success',
            });
          }
          return ACCEPTED;
        }}
        pending={null}
        selectedId={selectedId}
        sessionKey={sessionKey}
      />
    </AppShell>
  );
}
