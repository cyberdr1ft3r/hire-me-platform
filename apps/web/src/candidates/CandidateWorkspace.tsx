import { useEffect, useId, useRef, useState } from 'react';

import { useI18n } from '../i18n/index.js';
import { Button, PageHeader } from '../ui/index.js';
import type { CandidateAccess } from './candidate-access.js';
import {
  hasActiveCandidateFilters,
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
import { CandidateCreateForm } from './CandidateCreateForm.js';
import { CandidateDetailView } from './CandidateDetailView.js';
import { CandidateFilters } from './CandidateFilters.js';
import { CandidateList } from './CandidateList.js';

export interface CandidateWorkspaceProps {
  access: CandidateAccess;
  /** The filters the displayed list was loaded with, as opposed to the controls. */
  appliedFilters: CandidateFilterValues;
  detail: CandidateDetailState;
  feedback: CandidateFeedback | null;
  filters: CandidateFilterValues;
  list: CandidateListState;
  onAddRecord: (input: CandidateRecordInput) => Promise<CandidateFormOutcome>;
  onArchive: () => void;
  onChangeStatus: (status: CandidateLifecycleTarget) => void;
  onCreate: (values: CandidateCreateValues) => Promise<CandidateFormOutcome>;
  onFiltersChange: (filters: CandidateFilterValues) => void;
  onResetFilters: () => void;
  onRetryDetail: () => void;
  onRetryList: () => void;
  onSearch: () => void;
  onSelect: (candidateId: string) => void;
  onUpdate: (values: CandidateProfileValues) => Promise<CandidateFormOutcome>;
  pending: CandidatePendingAction | null;
  selectedId: string | null;
}

/**
 * The Candidate workspace presentation.
 *
 * It performs no request and holds no permission logic of its own: what it may
 * render is decided entirely by `access` and the other props, which is what
 * lets the synthetic review surface show the real workspace without an API or
 * any real candidate data.
 *
 * Hierarchy: the page header names the module; the list and the selected
 * record sit side by side when there is room and stack otherwise; the record
 * carries its own secondary identity heading rather than replacing the page
 * title with a profile hero.
 */
export function CandidateWorkspace({
  access,
  appliedFilters,
  detail,
  feedback,
  filters,
  list,
  onAddRecord,
  onArchive,
  onChangeStatus,
  onCreate,
  onFiltersChange,
  onResetFilters,
  onRetryDetail,
  onRetryList,
  onSearch,
  onSelect,
  onUpdate,
  pending,
  selectedId,
}: CandidateWorkspaceProps) {
  const { t } = useI18n();
  const listHeadingId = useId();
  const createRegionId = useId();
  const headerRef = useRef<HTMLDivElement>(null);
  const [creating, setCreating] = useState(false);
  const canCreate = access.canCreate;
  // The single write lock: while any Candidate write is in flight, no other may start.
  const mutationBusy = pending !== null;

  const restoreCreateFocus = useRef(false);

  /**
   * Cancel and a successful create close the form through this one path, and
   * focus returns to the page action that opened it — the control that held
   * focus inside the form no longer exists.
   */
  function closeCreate(): void {
    restoreCreateFocus.current = true;
    setCreating(false);
  }

  // Focus is restored after the commit, once the trigger is rendered enabled again.
  useEffect(() => {
    if (!restoreCreateFocus.current || creating || mutationBusy) {
      return;
    }
    restoreCreateFocus.current = false;
    headerRef.current?.querySelector<HTMLButtonElement>('[data-create-toggle]')?.focus();
  }, [creating, mutationBusy]);

  return (
    <div className="candidates">
      <div ref={headerRef}>
        <PageHeader
          description={t('candidate.header.description')}
          eyebrow={t('candidate.header.eyebrow')}
          primaryAction={
            // Without `candidates:create` the action does not exist at all.
            canCreate ? (
              <Button
                aria-controls={createRegionId}
                aria-expanded={creating}
                data-create-toggle=""
                disabled={creating || mutationBusy}
                onClick={() => setCreating(true)}
              >
                {t('candidate.actions.newCandidate')}
              </Button>
            ) : undefined
          }
          title={t('candidate.header.title')}
        />
      </div>

      {canCreate && creating ? (
        <div id={createRegionId}>
          <CandidateCreateForm
            busy={mutationBusy}
            onCancel={closeCreate}
            onCreated={closeCreate}
            onSubmit={onCreate}
            submitting={pending === 'create'}
          />
        </div>
      ) : null}

      <div className="candidates__workspace">
        <section aria-labelledby={listHeadingId} className="candidates__list-pane">
          <h2 className="candidates__pane-title" id={listHeadingId}>
            {t('candidate.list.title')}
          </h2>
          <CandidateFilters
            busy={list.status === 'loading'}
            onChange={onFiltersChange}
            onReset={onResetFilters}
            onSubmit={onSearch}
            showReset={hasActiveCandidateFilters(appliedFilters)}
            values={filters}
          />
          <CandidateList
            filtered={hasActiveCandidateFilters(appliedFilters)}
            list={list}
            onReset={onResetFilters}
            onRetry={onRetryList}
            onSelect={onSelect}
            selectedId={selectedId}
          />
        </section>
        <div className="candidates__detail-pane">
          <CandidateDetailView
            access={access}
            detail={detail}
            feedback={feedback}
            onAddRecord={onAddRecord}
            onArchive={onArchive}
            onChangeStatus={onChangeStatus}
            onRetry={onRetryDetail}
            onUpdate={onUpdate}
            pending={pending}
          />
        </div>
      </div>
    </div>
  );
}
