import type {
  InternalPublicApplicationSummary,
  MissionCandidateSummary,
  MissionLifecycleState,
  MissionPlacement,
} from '@hire-me/contracts';

import { useRef, type RefObject } from 'react';

import { useI18n } from '../i18n/index.js';
import { MISSION_SIDE_BY_SIDE_MIN_REM, useStackedMasterDetailReveal } from '../layout/index.js';
import { InlineMessage, PageHeader, Skeleton, StatusBadge, EmptyState } from '../ui/index.js';
import { MissionDetailNav } from './MissionDetailNav.js';
import { MissionAssignments, type MissionAssignmentsModel } from './MissionAssignments.js';
import { MissionCandidatePipeline, type MissionPipelineModel } from './MissionCandidatePipeline.js';
import { MissionCreateForm } from './MissionCreateForm.js';
import { MissionEvaluations, type MissionEvaluationsModel } from './MissionEvaluations.js';
import { MissionFilters } from './MissionFilters.js';
import { MissionInterviews, type MissionInterviewsModel } from './MissionInterviews.js';
import { MissionLifecycle, type MissionClosureValues } from './MissionLifecycle.js';
import { MissionList } from './MissionList.js';
import { MissionOffers, type MissionOffersModel } from './MissionOffers.js';
import type { LoadPickerOptions } from './MissionPicker.js';
import { MissionPlacements } from './MissionPlacements.js';
import { MissionProcess, type MissionProcessModel } from './MissionProcess.js';
import { MissionProfile, type MissionProfileModel } from './MissionProfile.js';
import {
  MissionPublicApplications,
  MissionPublicOpportunity,
  type MissionPublicOpportunityModel,
} from './MissionPublicOpportunity.js';
import type { MissionAccess } from './mission-access.js';
import {
  missionDetailSectionPanelId,
  missionDetailSectionTabId,
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
  onSelect: (missionId: string) => void;
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

export function MissionsWorkspace({
  access,
  create,
  detail,
  feedback,
  list,
  detailSection,
  missionDetailRevealToken,
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
  onDetailSectionChange: (section: MissionDetailSection) => void;
  processDetailRevealToken: number;
  /** Names the option sources of this session, so pickers reload after a session change. */
  sessionKey: string;
  writesLocked: boolean;
}) {
  const { t } = useI18n();
  const layoutContainerRef = useRef<HTMLElement>(null);
  const filtered = hasActiveMissionFilters(list.appliedFilters);

  return (
    <section aria-label={t('missions.region')} className="missions" ref={layoutContainerRef}>
      <PageHeader
        description={t('missions.header.description')}
        eyebrow={t('missions.header.eyebrow')}
        title={t('missions.header.title')}
      />
      {access.readOnly ? (
        <InlineMessage title={t('missions.readOnly.title')} tone="info">
          <p className="mission-message__text">{t('missions.readOnly.body')}</p>
        </InlineMessage>
      ) : null}
      {feedback ? <FeedbackMessage feedback={feedback} /> : null}

      <div className="missions__workspace">
        <div className="missions__list-pane">
          <h2 className="missions__pane-title">{t('missions.list.title')}</h2>
          <MissionFilters
            busy={list.list.status === 'loading'}
            loadClientOptions={list.loadClientFilterOptions}
            onChange={list.onFiltersChange}
            onReset={list.onResetFilters}
            onSubmit={list.onApplyFilters}
            showReset={filtered || hasActiveMissionFilters(list.filters)}
            sourceKey={sessionKey}
            values={list.filters}
          />
          <MissionList
            filtered={filtered}
            list={list.list}
            onPage={list.onPage}
            onReset={list.onResetFilters}
            onRetry={list.onRetry}
            onSelect={list.onSelect}
            selectedId={list.selectedId}
          />
          {access.canCreate ? (
            <MissionCreateForm
              loadClientOptions={create.loadClientOptions}
              onCreate={create.onCreate}
              sourceKey={sessionKey}
              writesLocked={writesLocked}
            />
          ) : null}
        </div>
        <div
          aria-label={t('missions.detail.region')}
          className="missions__detail-pane"
          role="region"
        >
          <MissionDetailPane
            access={access}
            activeSection={detailSection}
            key={list.selectedId ?? 'none'}
            layoutContainerRef={layoutContainerRef}
            missionDetailRevealToken={missionDetailRevealToken}
            model={detail}
            onSectionChange={onDetailSectionChange}
            processDetailRevealToken={processDetailRevealToken}
            sessionKey={sessionKey}
            sideBySideMinRem={MISSION_SIDE_BY_SIDE_MIN_REM}
            writesLocked={writesLocked}
          />
        </div>
      </div>
    </section>
  );
}

function MissionDetailPane({
  access,
  activeSection,
  layoutContainerRef,
  missionDetailRevealToken,
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
    sideBySideMinRem,
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
        aria-labelledby={missionDetailSectionTabId('overview')}
        className="mission-detail__panel"
        hidden={section !== 'overview'}
        id={missionDetailSectionPanelId('overview')}
        role="tabpanel"
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
          aria-labelledby={missionDetailSectionTabId('team')}
          className="mission-detail__panel"
          hidden={section !== 'team'}
          id={missionDetailSectionPanelId('team')}
          role="tabpanel"
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
          aria-labelledby={missionDetailSectionTabId('pipeline')}
          className="mission-detail__panel"
          hidden={section !== 'pipeline'}
          id={missionDetailSectionPanelId('pipeline')}
          role="tabpanel"
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
            <div aria-live="polite" className="mission-pipeline-workspace__detail">
              {processDetail ?? (
                <p className="mission-muted">{t('missions.pipeline.selectProcessDetail')}</p>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {access.canViewPublicOpportunity || access.canViewPublicApplications ? (
        <div
          aria-labelledby={missionDetailSectionTabId('public')}
          className="mission-detail__panel"
          hidden={section !== 'public'}
          id={missionDetailSectionPanelId('public')}
          role="tabpanel"
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
