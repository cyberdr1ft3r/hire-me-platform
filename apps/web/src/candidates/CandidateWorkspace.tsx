import type { CandidateSummary } from '@hire-me/contracts';
import { useEffect, useId, useRef, useState } from 'react';

import { useI18n } from '../i18n/index.js';
import {
  Button,
  PageHeader,
  WorkspacePane,
  WorkspaceSurface,
  WorkspaceToolbar,
} from '../ui/index.js';
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
  type CandidateRecordRef,
  type CandidateRecordUpdate,
  type CandidateSensitiveUpdate,
} from './candidate-state.js';
import { CandidateCreateDrawer } from './CandidateCreateForm.js';
import { CandidateDirectory } from './CandidateDirectory.js';
import { CandidateFilters } from './CandidateFilters.js';
import { CandidateFocusedRecord, type CandidateRelatedLoaders } from './CandidateFocusedRecord.js';
import { CandidateQuickPreview } from './CandidateQuickPreview.js';

const NO_RELATED: CandidateRelatedLoaders = { documents: null, tasks: null };

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
  onArchiveRecord: (record: CandidateRecordRef) => Promise<boolean>;
  onChangeStatus: (status: CandidateLifecycleTarget) => void;
  /** Leaves the focused record for the directory (asks first if input would be lost). */
  onCloseRecord: () => void;
  onClosePreview: () => void;
  onCreate: (values: CandidateCreateValues) => Promise<CandidateFormOutcome>;
  onFiltersChange: (filters: CandidateFilterValues) => void;
  /** In-app navigation for links to other modules (tasks, documents). */
  onNavigatePath?: (path: string) => void;
  /** Opens a candidate as the focused record. */
  onOpenRecord: (candidateId: string) => void;
  /** Reads another server page of the current matches. */
  onPage: (page: number) => void;
  onPreview: (candidate: CandidateSummary) => void;
  onResetFilters: () => void;
  onRetryDetail: () => void;
  onRetryList: () => void;
  onSearch: () => void;
  onUpdate: (values: CandidateProfileValues) => Promise<CandidateFormOutcome>;
  onUpdateRecord: (update: CandidateRecordUpdate) => Promise<CandidateFormOutcome>;
  /** Saves a partial compensation or consent update for the selected candidate. */
  onUpdateSensitive: (update: CandidateSensitiveUpdate) => Promise<CandidateFormOutcome>;
  pending: CandidatePendingAction | null;
  /** The directory row shown in the quick preview, as the list returned it. */
  previewCandidate: CandidateSummary | null;
  /** The candidate open as the focused record, or null for the directory. */
  recordCandidateId: string | null;
  /** Advances when a record is opened, so its heading takes focus. */
  detailRevealToken: number;
  relatedLoaders?: CandidateRelatedLoaders;
}

/**
 * The Candidate workspace presentation (Entity Workspace v2.0, Issue #204).
 *
 * Three states over the same data: the full-width directory, the directory with a
 * non-modal quick preview of one row, and the focused record. It performs no request
 * and holds no permission logic of its own: what it may render is decided entirely
 * by `access` and the other props, which is what lets the synthetic review surface
 * show the real workspace without an API or any real candidate data.
 *
 * The directory unmounts while a record is open, but its list, filters and page are
 * the container's state, so returning shows the same page without a new request.
 */
export function CandidateWorkspace({
  access,
  appliedFilters,
  detail,
  detailRevealToken,
  feedback,
  filters,
  list,
  onAddRecord,
  onArchive,
  onArchiveRecord,
  onChangeStatus,
  onCloseRecord,
  onClosePreview,
  onCreate,
  onFiltersChange,
  onNavigatePath,
  onOpenRecord,
  onPage,
  onPreview,
  onResetFilters,
  onRetryDetail,
  onRetryList,
  onSearch,
  onUpdate,
  onUpdateRecord,
  onUpdateSensitive,
  pending,
  previewCandidate,
  recordCandidateId,
  relatedLoaders = NO_RELATED,
}: CandidateWorkspaceProps) {
  const { t } = useI18n();
  const listHeadingId = useId();
  const listHeadingRef = useRef<HTMLHeadingElement>(null);
  const directoryRef = useRef<HTMLDivElement>(null);
  // Set by a page change: once the new page has settled, focus moves to the list heading.
  const focusListAfterPage = useRef(false);
  // The row to focus once the directory is back on screen (closing a preview or a record).
  const focusRowAfterRender = useRef<string | null>(null);
  const lastRecordId = useRef<string | null>(null);
  const [creating, setCreating] = useState(false);
  // Cancel and a successful create both return focus to the page action that opened the drawer.
  const restoreCreateFocus = useRef(false);
  const headerRef = useRef<HTMLDivElement>(null);
  const canCreate = access.canCreate;
  // The single write lock: while any Candidate write is in flight, no other may start.
  const mutationBusy = pending !== null;
  const recordOpen = recordCandidateId !== null;

  if (recordCandidateId) {
    lastRecordId.current = recordCandidateId;
  }

  /*
   * The page controls are replaced while the next page loads, so the control
   * that was pressed no longer exists. Focus moves to the list heading once the
   * page has settled, so keyboard and screen-reader users continue from the top
   * of the new page.
   */
  useEffect(() => {
    if (!focusListAfterPage.current || list.status === 'loading') {
      return;
    }
    focusListAfterPage.current = false;
    listHeadingRef.current?.focus();
  }, [list]);

  // Leaving a record returns focus to its row when that row is on the page, else the heading.
  useEffect(() => {
    if (recordOpen || !lastRecordId.current) {
      return;
    }
    focusRowAfterRender.current = lastRecordId.current;
    lastRecordId.current = null;
  }, [recordOpen]);

  useEffect(() => {
    const id = focusRowAfterRender.current;
    if (!id || recordOpen) {
      return;
    }
    focusRowAfterRender.current = null;
    const row = directoryRef.current?.querySelector<HTMLButtonElement>(
      `button[data-candidate-id="${CSS.escape(id)}"]`,
    );
    (row ?? listHeadingRef.current)?.focus();
  });

  // Focus is restored after the commit, once the trigger is rendered enabled again.
  useEffect(() => {
    if (!restoreCreateFocus.current || creating || mutationBusy) {
      return;
    }
    restoreCreateFocus.current = false;
    headerRef.current?.querySelector<HTMLButtonElement>('[data-create-toggle]')?.focus();
  }, [creating, mutationBusy]);

  function closeCreate(): void {
    restoreCreateFocus.current = true;
    setCreating(false);
  }

  function changePage(page: number): void {
    focusListAfterPage.current = true;
    onPage(page);
  }

  function closePreview(): void {
    if (previewCandidate) {
      focusRowAfterRender.current = previewCandidate.id;
    }
    onClosePreview();
  }

  const header = (
    <div ref={headerRef}>
      <PageHeader
        compact
        description={t('candidate.header.description')}
        eyebrow={t('candidate.header.eyebrow')}
        primaryAction={
          // Without `candidates:create` the action does not exist at all.
          canCreate ? (
            <Button
              aria-haspopup="dialog"
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
  );

  return (
    <div className="candidates ui-workspace-page" data-view={recordOpen ? 'record' : 'directory'}>
      {header}

      {canCreate && creating ? (
        <CandidateCreateDrawer
          busy={mutationBusy}
          onClose={closeCreate}
          onSubmit={onCreate}
          submitting={pending === 'create'}
        />
      ) : null}

      {recordOpen ? (
        <CandidateFocusedRecord
          detailProps={{
            access,
            detail,
            detailRevealToken,
            feedback,
            // The record is always the whole workspace, so its heading always takes focus on open.
            layoutContainerRef: directoryRef,
            onAddRecord,
            onArchive,
            onArchiveRecord,
            onChangeStatus,
            onRetry: onRetryDetail,
            onUpdate,
            onUpdateRecord,
            onUpdateSensitive,
            pending,
            sideBySideMinRem: Number.POSITIVE_INFINITY,
          }}
          loaders={relatedLoaders}
          onBack={onCloseRecord}
          onNavigatePath={onNavigatePath}
        />
      ) : (
        <WorkspaceSurface
          className="candidates__workspace"
          ref={directoryRef}
          split="preview"
          view={previewCandidate ? undefined : 'list'}
        >
          <WorkspacePane
            aria-labelledby={listHeadingId}
            className="candidates__list-pane"
            kind="list"
            toolbar={
              <WorkspaceToolbar
                heading={
                  <h2
                    className="candidates__pane-title"
                    id={listHeadingId}
                    ref={listHeadingRef}
                    tabIndex={-1}
                  >
                    {t('candidate.directory.title')}
                  </h2>
                }
              >
                <CandidateFilters
                  appliedValues={appliedFilters}
                  busy={list.status === 'loading'}
                  onChange={onFiltersChange}
                  onReset={onResetFilters}
                  onSubmit={onSearch}
                  showReset={hasActiveCandidateFilters(appliedFilters)}
                  values={filters}
                />
              </WorkspaceToolbar>
            }
          >
            <CandidateDirectory
              filtered={hasActiveCandidateFilters(appliedFilters)}
              list={list}
              onPage={changePage}
              onPreview={onPreview}
              onReset={onResetFilters}
              onRetry={onRetryList}
              previewId={previewCandidate?.id ?? null}
              tableLabelId={listHeadingId}
            />
          </WorkspacePane>
          {previewCandidate ? (
            <WorkspacePane as="div" className="candidates__preview-pane" kind="detail">
              <CandidateQuickPreview
                candidate={previewCandidate}
                key={previewCandidate.id}
                onClose={closePreview}
                onOpenRecord={() => onOpenRecord(previewCandidate.id)}
              />
            </WorkspacePane>
          ) : null}
        </WorkspaceSurface>
      )}
    </div>
  );
}
