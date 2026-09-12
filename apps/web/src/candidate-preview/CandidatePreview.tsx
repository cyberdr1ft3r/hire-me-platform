import { useMemo, useState } from 'react';

import {
  CandidateWorkspace,
  EMPTY_CANDIDATE_FILTERS,
  resolveCandidateAccess,
  type CandidateDetailState,
  type CandidateFilterValues,
  type CandidateFormOutcome,
  type CandidateListState,
} from '../candidates/index.js';
import { I18nProvider, useI18n } from '../i18n/index.js';
import { Select } from '../ui/index.js';
import { AppShell } from '../ui/shell/AppShell.js';
import {
  PREVIEW_CANDIDATES,
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
 * build. Search and selection work locally; a submitted form only reports
 * success, because there is no API behind it.
 */
export function CandidatePreview() {
  return (
    <I18nProvider>
      <CandidatePreviewContent />
    </I18nProvider>
  );
}

type PreviewDataset = 'empty' | 'populated';

const ACCEPTED: Promise<CandidateFormOutcome> = Promise.resolve({ ok: true });

function matches(filters: CandidateFilterValues, record: (typeof PREVIEW_CANDIDATES)[number]) {
  const search = filters.search.trim().toLowerCase();
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
    (!filters.status || record.status === filters.status) && (!search || haystack.includes(search))
  );
}

function CandidatePreviewContent() {
  const { t } = useI18n();
  const [dataset, setDataset] = useState<PreviewDataset>('populated');
  const [profile, setProfile] = useState<PreviewAccessProfile>('full');
  const [filters, setFilters] = useState<CandidateFilterValues>(EMPTY_CANDIDATE_FILTERS);
  const [applied, setApplied] = useState<CandidateFilterValues>(EMPTY_CANDIDATE_FILTERS);
  const [selectedId, setSelectedId] = useState<string | null>(PREVIEW_CANDIDATES[0]?.id ?? null);

  const permissions = PREVIEW_PERMISSIONS[profile];
  const access = useMemo(() => resolveCandidateAccess(permissions), [permissions]);
  const source = dataset === 'empty' ? [] : PREVIEW_CANDIDATES;
  const visible = source.filter((record) => matches(applied, record));
  const list: CandidateListState = {
    candidates: visible.map((record) => shapeForAccess(record, permissions)),
    status: 'ready',
    total: visible.length,
  };
  const selected = source.find((record) => record.id === selectedId);
  const detail: CandidateDetailState = selected
    ? { candidate: shapeForAccess(selected, permissions), status: 'ready' }
    : { status: 'idle' };

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
          onChange={(event) => setDataset(event.target.value === 'empty' ? 'empty' : 'populated')}
          value={dataset}
        >
          <option value="populated">{t('preview.candidate.populated')}</option>
          <option value="empty">{t('preview.candidate.empty')}</option>
        </Select>
        <Select
          label={t('preview.candidate.access')}
          onChange={(event) => {
            const next = event.target.value;
            setProfile(next === 'recruiter' || next === 'viewer' ? next : 'full');
          }}
          value={profile}
        >
          <option value="full">{t('preview.candidate.accessFull')}</option>
          <option value="recruiter">{t('preview.candidate.accessRecruiter')}</option>
          <option value="viewer">{t('preview.candidate.accessViewer')}</option>
        </Select>
      </div>
      <CandidateWorkspace
        access={access}
        appliedFilters={applied}
        detail={detail}
        feedback={null}
        filters={filters}
        list={list}
        onAddRecord={() => ACCEPTED}
        onArchive={() => undefined}
        onChangeStatus={() => undefined}
        onCreate={() => ACCEPTED}
        onFiltersChange={setFilters}
        onResetFilters={() => {
          setFilters({ ...EMPTY_CANDIDATE_FILTERS });
          setApplied({ ...EMPTY_CANDIDATE_FILTERS });
        }}
        onRetryDetail={() => undefined}
        onRetryList={() => undefined}
        onSearch={() => setApplied({ ...filters })}
        onSelect={setSelectedId}
        onUpdate={() => ACCEPTED}
        pending={null}
        selectedId={selectedId}
      />
    </AppShell>
  );
}
