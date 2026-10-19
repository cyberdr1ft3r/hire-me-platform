import type {
  InternalPublicApplicationSummary,
  MissionCandidateSummary,
  MissionLifecycleState,
  MissionPlacement,
  MissionSummary,
} from '@hire-me/contracts';

import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from 'react';

import { useI18n } from '../i18n/index.js';
import {
  MISSION_SIDE_BY_SIDE_MIN_REM,
  useNarrowContainer,
  useStackedMasterDetailReveal,
} from '../layout/index.js';
import { useRecordLeaveGuard } from '../navigation/use-record-leave-guard.js';
import {
  Button,
  ContextualActions,
  DirectoryPage,
  EmptyState,
  InlineMessage,
  RecordPage,
  Skeleton,
  StatusBadge,
  WORKSPACE_SPLIT_MIN_REM,
  WorkspacePane,
  WorkspaceSurface,
  WorkspaceToolbar,
} from '../ui/index.js';
import { MissionDetailNav } from './MissionDetailNav.js';
import { MissionAssignments, type MissionAssignmentsModel } from './MissionAssignments.js';
import { MissionCandidatePipeline, type MissionPipelineModel } from './MissionCandidatePipeline.js';
import { MissionCreateDrawer } from './MissionCreateForm.js';
import { MissionEvaluations, type MissionEvaluationsModel } from './MissionEvaluations.js';
import { MissionFilters } from './MissionFilters.js';
import { MissionInterviews, type MissionInterviewsModel } from './MissionInterviews.js';
import { MissionLifecycle, type MissionClosureValues } from './MissionLifecycle.js';
import { MissionDirectory } from './MissionDirectory.js';
import { MissionOffers, type MissionOffersModel } from './MissionOffers.js';
import type { LoadPickerOptions } from './MissionPicker.js';
import { MissionPlacements } from './MissionPlacements.js';
import { MissionProcess, type MissionProcessModel } from './MissionProcess.js';
import { MissionProfile, type MissionProfileModel } from './MissionProfile.js';
import { MissionQuickPreview } from './MissionQuickPreview.js';
import {
  MissionPublicApplications,
  MissionPublicOpportunity,
  type MissionPublicOpportunityModel,
} from './MissionPublicOpportunity.js';
import type { MissionAccess } from './mission-access.js';
import { missionDetailPanelProps } from './mission-detail-panel-props.js';
import {
  normalizeMissionDetailSection,
  type MissionDetailSection,
} from './mission-detail-section.js';
import {
  canCreateOfferInState,
  isMissionWritable,
  isProcessWritable,
  missionPriorityLabelKey,
  missionPriorityTone,
  missionStateLabelKey,
  missionStateTone,
} from './mission-labels.js';
import {
  hasActiveMissionFilters,
  sectionData,
  type MissionCreateValues,
  type MissionDetailState,
  type MissionFeedback,
  type MissionFilterValues,
  type MissionListState,
  type PickerOption,
  type SectionState,
} from './mission-state.js';

export interface MissionListModel {
  appliedFilters: MissionFilterValues;
  filters: MissionFilterValues;
  list: MissionListState;
  loadClientFilterOptions: LoadPickerOptions | null;
  onApplyFilters: () => void;
  onFiltersChange: (values: MissionFilterValues) => void;
  onPage: (page: number) => void;
  onResetFilters: () => void;
  onRetry: () => void;
  onClosePreview: () => void;
  onPreview: (mission: MissionSummary) => void;
  /** Opens a mission as the focused record. */
  onSelect: (missionId: string) => void;
  /** The directory row shown in the quick preview, as the list returned it. */
  previewMission: MissionSummary | null;
  /** The mission open as the focused record, or null for the directory. */
  selectedId: string | null;
}

export interface MissionCreateModel {
  loadClientOptions: LoadPickerOptions | null;
  onCreate: (values: MissionCreateValues) => Promise<boolean>;
}

export interface MissionLifecycleModel {
  onArchive: () => void;
  onClose: (values: MissionClosureValues) => void;
  onMove: (state: MissionLifecycleState) => void;
}

export interface MissionProcessContextModel {
  evaluations: MissionEvaluationsModel;
  interviews: MissionInterviewsModel;
  offers: MissionOffersModel;
  onCorrectPlacement: () => void;
  onRetryPlacement: () => void;
  placement: SectionState<MissionPlacement | null>;
  process: MissionCandidateSummary | null;
  processModel: MissionProcessModel;
}

export interface MissionDetailModel {
  applications: SectionState<InternalPublicApplicationSummary[]>;
  assignments: MissionAssignmentsModel;
  detail: MissionDetailState;
  lifecycle: MissionLifecycleModel;
  onRetryApplications: () => void;
  pipeline: MissionPipelineModel;
  processContext: MissionProcessContextModel;
  profile: MissionProfileModel;
  publicOpportunity: MissionPublicOpportunityModel;
  /** Active team members of the mission; null when the team cannot be read. */
  team: PickerOption[] | null;
}

function FeedbackMessage({ feedback }: { feedback: MissionFeedback }) {
  const { t } = useI18n();
  if (feedback.tone === 'success') {
    const text = feedback.labelKey
      ? (t as (key: string, values: Record<string, string>) => string)(feedback.key, {
          label: t(feedback.labelKey),
        })
      : (t as (key: string) => string)(feedback.key);
    return (
      <InlineMessage announce title={t('missions.feedback.successTitle')} tone="success">
        <p className="mission-message__text">{text}</p>
      </InlineMessage>
    );
  }
  if (feedback.tone === 'warning') {
    return (
      <InlineMessage announce title={t('missions.publicOpportunity.title')} tone="warning">
        <p className="mission-message__text">{t(feedback.key)}</p>
      </InlineMessage>
    );
  }
  return (
    <InlineMessage announce title={t(feedback.key)} tone="danger">
      <p className="mission-message__text">{t(`missions.failure.reason.${feedback.failure}`)}</p>
    </InlineMessage>
  );
}

/**
 * The Missions workspace presentation (Entity Workspace v2.0, Issue #204): a
 * full-width directory, a quick preview of one row (side pane, or a bottom sheet on
 * narrow workspaces), and the focused mission record, which replaces the directory.
 * The directory's list, filters and page are the container's state, so returning
 * from a record shows the same page without a new request.
 */
export function MissionsWorkspace({
  access,
  create,
  detail,
  feedback,
  list,
  detailSection,
  missionDetailRevealToken,
  onCloseRecord,
  onDetailSectionChange,
  processDetailRevealToken,
  sessionKey,
  writesLocked,
}: {
  access: MissionAccess;
  create: MissionCreateModel;
  detail: MissionDetailModel;
  detailSection: MissionDetailSection;
  feedback: MissionFeedback | null;
  list: MissionListModel;
  missionDetailRevealToken: number;
  /** Leaves the focused record for the directory (asks first if input would be lost). */
  onCloseRecord: () => void;
  onDetailSectionChange: (section: MissionDetailSection) => void;
  processDetailRevealToken: number;
  /** Names the option sources of this session, so pickers reload after a session change. */
  sessionKey: string;
  writesLocked: boolean;
}) {
  const { t } = useI18n();
  const recordLayoutRef = useRef<HTMLDivElement>(null);
  const directoryRef = useRef<HTMLDivElement>(null);
  const listHeadingId = useId();
  const listHeadingRef = useRef<HTMLHeadingElement>(null);
  const filtered = hasActiveMissionFilters(list.appliedFilters);
  // Creation happens in a drawer over the directory, so list selection, filters and
  // scroll position are untouched until a created mission is opened.
  const [creating, setCreating] = useState(false);
  const recordOpen = list.selectedId !== null;
  // Too narrow for the side preview: the preview opens as a bottom sheet instead.
  const narrow = useNarrowContainer(directoryRef, WORKSPACE_SPLIT_MIN_REM.preview);
  const preview = list.previewMission;
  const sidePreview = preview && !narrow ? preview : null;
  // The row to focus once the directory is back on screen (closing a preview or a record).
  const focusRowAfterRender = useRef<string | null>(null);
  const lastRecordId = useRef<string | null>(null);
  if (list.selectedId) {
    lastRecordId.current = list.selectedId;
  }

  // Leaving a record returns focus to its row when that row is on the page, else the heading.
  useEffect(() => {
    if (recordOpen || !lastRecordId.current) return;
    focusRowAfterRender.current = lastRecordId.current;
    lastRecordId.current = null;
  }, [recordOpen]);

  useEffect(() => {
    const id = focusRowAfterRender.current;
    if (!id || recordOpen) return;
    focusRowAfterRender.current = null;
    const row = directoryRef.current?.querySelector<HTMLButtonElement>(
      `button[data-mission-id="${CSS.escape(id)}"]`,
    );
    (row ?? listHeadingRef.current)?.focus();
  });

  function closePreview(): void {
    if (preview) focusRowAfterRender.current = preview.id;
    list.onClosePreview();
  }

  const primaryAction = access.canCreate ? (
    <ContextualActions
      primary={
        <Button aria-haspopup="dialog" disabled={writesLocked} onClick={() => setCreating(true)}>
          <span aria-hidden="true">+ </span>
          {t('missions.create.title')}
        </Button>
      }
    />
  ) : undefined;

  const notices = (
    <>
      {access.readOnly ? (
        <InlineMessage title={t('missions.readOnly.title')} tone="info">
          <p className="mission-message__text">{t('missions.readOnly.body')}</p>
        </InlineMessage>
      ) : null}
      {feedback ? <FeedbackMessage feedback={feedback} /> : null}
    </>
  );

  const pageProps = {
    'aria-label': t('missions.region'),
    className: 'missions ui-workspace-page',
    compact: true,
    description: t('missions.header.description'),
    eyebrow: t('missions.header.eyebrow'),
    primaryAction,
    title: t('missions.header.title'),
  };

  return (
    <>
      {recordOpen ? (
        <RecordPage {...pageProps} data-view="record" notices={notices}>
          <MissionFocusedRecord
            containerRef={recordLayoutRef}
            feedback={feedback}
            onBack={onCloseRecord}
            writesLocked={writesLocked}
          >
            <MissionDetailPane
              access={access}
              activeSection={detailSection}
              key={list.selectedId ?? 'none'}
              layoutContainerRef={recordLayoutRef}
              missionDetailRevealToken={missionDetailRevealToken}
              // The record is the whole workspace, so its heading always takes focus on open.
              missionSideBySideMinRem={Number.POSITIVE_INFINITY}
              model={detail}
              onSectionChange={onDetailSectionChange}
              processDetailRevealToken={processDetailRevealToken}
              sessionKey={sessionKey}
              sideBySideMinRem={MISSION_SIDE_BY_SIDE_MIN_REM}
              writesLocked={writesLocked}
            />
          </MissionFocusedRecord>
        </RecordPage>
      ) : (
        <DirectoryPage {...pageProps} data-view="directory" layout="fill" notices={notices}>
          <WorkspaceSurface
            className="missions__workspace"
            ref={directoryRef}
            split="preview"
            view={sidePreview ? undefined : 'list'}
          >
            <WorkspacePane
              aria-labelledby={listHeadingId}
              className="missions__list-pane"
              kind="list"
              toolbar={
                <WorkspaceToolbar
                  heading={
                    <h2
                      className="missions__pane-title"
                      id={listHeadingId}
                      ref={listHeadingRef}
                      tabIndex={-1}
                    >
                      {t('missions.directory.title')}
                    </h2>
                  }
                >
                  <MissionFilters
                    appliedValues={list.appliedFilters}
                    busy={list.list.status === 'loading'}
                    loadClientOptions={list.loadClientFilterOptions}
                    onChange={list.onFiltersChange}
                    onReset={list.onResetFilters}
                    onSubmit={list.onApplyFilters}
                    showReset={filtered || hasActiveMissionFilters(list.filters)}
                    sourceKey={sessionKey}
                    values={list.filters}
                  />
                </WorkspaceToolbar>
              }
            >
              <MissionDirectory
                filtered={filtered}
                list={list.list}
                onPage={list.onPage}
                onPreview={list.onPreview}
                onReset={list.onResetFilters}
                onRetry={list.onRetry}
                previewId={preview?.id ?? null}
                tableLabelId={listHeadingId}
              />
            </WorkspacePane>
            {sidePreview ? (
              <WorkspacePane as="div" className="missions__preview-pane" kind="detail">
                <MissionQuickPreview
                  key={sidePreview.id}
                  mission={sidePreview}
                  onClose={closePreview}
                  onOpenRecord={() => list.onSelect(sidePreview.id)}
                />
              </WorkspacePane>
            ) : null}
          </WorkspaceSurface>
        </DirectoryPage>
      )}

      {!recordOpen && preview && narrow ? (
        <MissionQuickPreview
          key={preview.id}
          mission={preview}
          onClose={closePreview}
          onOpenRecord={() => list.onSelect(preview.id)}
          presentation="sheet"
        />
      ) : null}

      {access.canCreate && creating ? (
        <MissionCreateDrawer
          failure={
            feedback && feedback.tone !== 'success' ? <FeedbackMessage feedback={feedback} /> : null
          }
          loadClientOptions={create.loadClientOptions}
          onClose={() => setCreating(false)}
          onCreate={create.onCreate}
          sourceKey={sessionKey}
          writesLocked={writesLocked}
        />
      ) : null}
    </>
  );
}

/**
 * The focused mission record: the existing mission detail (profile, lifecycle, team,
 * pipeline with its process, interviews, offers and placement, public opportunity)
 * with a way back to the directory. Mission forms stay on screen after a save, so a
 * submitted form counts as saved unless its write fails.
 */
function MissionFocusedRecord({
  children,
  containerRef,
  feedback,
  onBack,
  writesLocked,
}: {
  children: ReactNode;
  containerRef: RefObject<HTMLDivElement | null>;
  feedback: MissionFeedback | null;
  onBack: () => void;
  writesLocked: boolean;
}) {
  const { t } = useI18n();
  useRecordLeaveGuard(containerRef, t('missions.record.discardPrompt'), writesLocked, {
    clearOnSubmit: true,
    failureSignal: feedback?.tone === 'danger' ? feedback : null,
  });

  return (
    <div className="mission-record" ref={containerRef}>
      <nav aria-label={t('missions.record.navigation')} className="mission-record__nav">
        <Button className="mission-record__back" onClick={onBack} size="compact" variant="quiet">
          <span aria-hidden="true">←</span> {t('missions.record.back')}
        </Button>
      </nav>
      {children}
    </div>
  );
}

function MissionDetailPane({
  access,
  activeSection,
  layoutContainerRef,
  missionDetailRevealToken,
  missionSideBySideMinRem = MISSION_SIDE_BY_SIDE_MIN_REM,
  model,
  onSectionChange,
  processDetailRevealToken,
  sessionKey,
  sideBySideMinRem,
  writesLocked,
}: {
  access: MissionAccess;
  activeSection: MissionDetailSection;
  layoutContainerRef: RefObject<HTMLElement | null>;
  missionDetailRevealToken: number;
  /** Width below which the mission heading takes focus on open (always, in the record). */
  missionSideBySideMinRem?: number;
  model: MissionDetailModel;
  onSectionChange: (section: MissionDetailSection) => void;
  processDetailRevealToken: number;
  sessionKey: string;
  sideBySideMinRem: number;
  writesLocked: boolean;
}) {
  const { t } = useI18n();
  const missionHeadingRef = useRef<HTMLHeadingElement>(null);
  const detail = model.detail;

  useStackedMasterDetailReveal({
    containerRef: layoutContainerRef,
    ready: detail.status === 'ready',
    revealToken: missionDetailRevealToken,
    sideBySideMinRem: missionSideBySideMinRem,
    targetRef: missionHeadingRef,
  });

  if (detail.status === 'idle') {
    return (
      <EmptyState title={t('missions.detail.selectPromptTitle')}>
        {t('missions.detail.selectPrompt')}
      </EmptyState>
    );
  }
  if (detail.status === 'loading') {
    return <Skeleton label={t('missions.states.loadingDetail')} />;
  }
  if (detail.status === 'unavailable') {
    return (
      <InlineMessage announce title={t('missions.states.unavailableTitle')} tone="warning">
        <p className="mission-message__text">{t('missions.states.unavailable')}</p>
      </InlineMessage>
    );
  }

  const mission = detail.mission;
  const writable = isMissionWritable(mission);
  const sourceKey = `${sessionKey}:${mission.id}`;
  const context = model.processContext;
  const process = context.process;
  const processEditable = writable && process !== null && isProcessWritable(process);
  const placementRecorded = sectionData(context.placement) !== null;
  const section = normalizeMissionDetailSection(activeSection, access);

  const processDetail =
    access.canViewProcesses && process ? (
      <MissionProcess
        access={access}
        detailPane
        key={process.id}
        layoutContainerRef={layoutContainerRef}
        missionWritable={writable}
        model={context.processModel}
        process={process}
        processDetailRevealToken={processDetailRevealToken}
        recruiters={model.pipeline.recruiters}
        sideBySideMinRem={sideBySideMinRem}
        writesLocked={writesLocked}
      >
        {access.canViewOffers ? (
          <MissionOffers
            access={access}
            canCreateOffer={canCreateOfferInState(process.state)}
            editable={processEditable}
            model={context.offers}
            placementRecorded={placementRecorded}
            writesLocked={writesLocked}
          />
        ) : null}
        {access.canViewPlacements ? (
          <MissionPlacements
            access={access}
            editable={processEditable}
            onCorrect={context.onCorrectPlacement}
            onRetry={context.onRetryPlacement}
            placement={context.placement}
            writesLocked={writesLocked}
          />
        ) : null}
        {access.canViewInterviews ? (
          <MissionInterviews
            access={access}
            clientVisible={process.clientVisible}
            editable={processEditable}
            model={context.interviews}
            renderEvaluations={() => (
              <MissionEvaluations
                access={access}
                editable={processEditable}
                model={context.evaluations}
                writesLocked={writesLocked}
              />
            )}
            team={model.team}
            writesLocked={writesLocked}
          />
        ) : null}
      </MissionProcess>
    ) : null;

  return (
    <article className="mission-detail">
      <header className="mission-detail__header">
        <h2 className="mission-detail__title" ref={missionHeadingRef} tabIndex={-1}>
          {mission.title}
        </h2>
        <p className="mission-detail__client">{mission.clientName}</p>
        <p className="mission-badges">
          <StatusBadge tone={missionStateTone(mission.state)}>
            {t(missionStateLabelKey(mission.state))}
          </StatusBadge>
          <StatusBadge tone={missionPriorityTone(mission.priority)}>
            {t(missionPriorityLabelKey(mission.priority))}
          </StatusBadge>
        </p>
      </header>
      {mission.archivedAt !== null || mission.state === 'ARCHIVED' ? (
        <InlineMessage title={t('missions.detail.archivedNoticeTitle')} tone="info">
          <p className="mission-message__text">{t('missions.detail.archivedNotice')}</p>
        </InlineMessage>
      ) : !writable ? (
        <InlineMessage title={t('missions.detail.terminalNoticeTitle')} tone="info">
          <p className="mission-message__text">{t('missions.detail.terminalNotice')}</p>
        </InlineMessage>
      ) : null}

      <MissionDetailNav access={access} active={section} onChange={onSectionChange} />

      <div
        {...missionDetailPanelProps('overview', access, section, t)}
        className="mission-detail__panel"
      >
        <MissionProfile
          canEdit={access.canUpdate && writable}
          mission={mission}
          model={model.profile}
          writesLocked={writesLocked}
        />
        {access.canManageStatus || access.canClose || access.canArchive ? (
          <MissionLifecycle
            access={access}
            mission={mission}
            onArchive={model.lifecycle.onArchive}
            onClose={model.lifecycle.onClose}
            onMove={model.lifecycle.onMove}
            writesLocked={writesLocked}
          />
        ) : null}
      </div>

      {access.canViewAssignments || access.canManageAssignments ? (
        <div
          {...missionDetailPanelProps('team', access, section, t)}
          className="mission-detail__panel"
        >
          <MissionAssignments
            access={access}
            model={model.assignments}
            sourceKey={sourceKey}
            writable={writable}
            writesLocked={writesLocked}
          />
        </div>
      ) : null}

      {access.canViewProcesses ? (
        <div
          {...missionDetailPanelProps('pipeline', access, section, t)}
          className="mission-detail__panel"
        >
          <div
            className={
              process
                ? 'mission-pipeline-workspace mission-pipeline-workspace--split'
                : 'mission-pipeline-workspace'
            }
          >
            <div className="mission-pipeline-workspace__list">
              <MissionCandidatePipeline
                access={access}
                model={model.pipeline}
                sourceKey={sourceKey}
                writable={writable}
                writesLocked={writesLocked}
              />
            </div>
            <div className="mission-pipeline-workspace__detail">
              {processDetail ?? (
                <p className="mission-muted">{t('missions.pipeline.selectProcessDetail')}</p>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {access.canViewPublicOpportunity || access.canViewPublicApplications ? (
        <div
          {...missionDetailPanelProps('public', access, section, t)}
          className="mission-detail__panel"
        >
          {access.canViewPublicOpportunity ? (
            <MissionPublicOpportunity
              access={access}
              mission={mission}
              model={model.publicOpportunity}
              writable={writable}
              writesLocked={writesLocked}
            />
          ) : null}
          {access.canViewPublicApplications ? (
            <MissionPublicApplications
              applications={model.applications}
              onRetry={model.onRetryApplications}
            />
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
