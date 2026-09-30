import type {
  TrainingEnrollmentStatus,
  TrainingEnrollmentSummary,
  TrainingParticipantType,
  TrainingParticipationSummary,
  TrainingProgramStatus,
  TrainingProgramSummary,
  TrainingSessionStatus,
  TrainingSessionSummary,
} from '@hire-me/contracts';
import { useState } from 'react';

import { useI18n } from '../i18n/index.js';
import { InlineMessage, PageHeader } from '../ui/index.js';
import type { TrainingAccess } from './training-access.js';
import {
  programAcceptsOperations,
  sessionAcceptsAttendance,
  sessionAcceptsParticipants,
} from './training-labels.js';
import {
  EMPTY_PROGRAM_FORM,
  hasActiveProgramFilters,
  type EnrollmentFilterValues,
  type ListState,
  type LoadTrainingOptions,
  type ParticipationFilterValues,
  type ProgramFilterValues,
  type ProgramFormValues,
  type SessionFilterValues,
  type SessionFormValues,
  type TrainingFeedback,
  type TrainingPickerOption,
} from './training-state.js';
import { ProgramFilters } from './ProgramFilters.js';
import { ProgramForm } from './ProgramForm.js';
import { ProgramList } from './ProgramList.js';
import { ProgramProfile } from './ProgramProfile.js';
import type { CertificateActions } from './TrainingCertificateStatus.js';
import { TrainingEnrollments, type EnrollmentLoaders } from './TrainingEnrollments.js';
import { TrainingParticipation, type AttendanceValues } from './TrainingParticipation.js';
import { TrainingSessionDetail, type RescheduleValues } from './TrainingSessionDetail.js';
import { TrainingSessions } from './TrainingSessions.js';

export type ProgramPane = {
  appliedFilters: ProgramFilterValues;
  filters: ProgramFilterValues;
  focusToken: number;
  list: ListState<TrainingProgramSummary>;
  selected: TrainingProgramSummary | null;
  onApplyFilters: () => void;
  onArchive: () => void;
  onCreate: (values: ProgramFormValues) => Promise<boolean>;
  onFiltersChange: (values: ProgramFilterValues) => void;
  onPage: (page: number) => void;
  onResetFilters: () => void;
  onRetry: () => void;
  onSave: (values: ProgramFormValues) => Promise<boolean>;
  onSelect: (program: TrainingProgramSummary) => void;
  onStatus: (status: TrainingProgramStatus) => void;
};

export type SessionPane = {
  appliedFilters: SessionFilterValues;
  filters: SessionFilterValues;
  focusToken: number;
  list: ListState<TrainingSessionSummary>;
  selected: TrainingSessionSummary | null;
  onApplyFilters: () => void;
  onArchive: () => void;
  onCancelSession: (reason: string) => Promise<boolean>;
  onCreate: (values: SessionFormValues) => Promise<boolean>;
  onFiltersChange: (values: SessionFilterValues) => void;
  onPage: (page: number) => void;
  onReschedule: (values: RescheduleValues) => Promise<boolean>;
  onResetFilters: () => void;
  onRetry: () => void;
  onSelect: (session: TrainingSessionSummary) => void;
  onStatus: (status: TrainingSessionStatus) => void;
  onUpdate: (values: SessionFormValues) => Promise<boolean>;
};

export type EnrollmentPane = {
  certificate: CertificateActions;
  filters: EnrollmentFilterValues;
  list: ListState<TrainingEnrollmentSummary>;
  selectedId: string | null;
  onArchive: (enrollment: TrainingEnrollmentSummary) => void;
  onCreate: (
    type: Exclude<TrainingParticipantType, 'EXTERNAL'>,
    participant: TrainingPickerOption,
  ) => Promise<boolean>;
  onFiltersChange: (values: EnrollmentFilterValues) => void;
  onPage: (page: number) => void;
  onRetry: () => void;
  onSelect: (enrollmentId: string | null) => void;
  onStatus: (enrollment: TrainingEnrollmentSummary, status: TrainingEnrollmentStatus) => void;
  onWithdraw: (enrollment: TrainingEnrollmentSummary, reason: string) => Promise<boolean>;
};

export type ParticipationPane = {
  filters: ParticipationFilterValues;
  list: ListState<TrainingParticipationSummary>;
  selectedId: string | null;
  onAdd: (option: TrainingPickerOption) => Promise<boolean>;
  onArchive: (participation: TrainingParticipationSummary) => void;
  onCorrect: (
    participation: TrainingParticipationSummary,
    values: AttendanceValues,
  ) => Promise<boolean>;
  onFiltersChange: (values: ParticipationFilterValues) => void;
  onPage: (page: number) => void;
  onRecord: (
    participation: TrainingParticipationSummary,
    values: AttendanceValues,
  ) => Promise<boolean>;
  onRetry: () => void;
  onSelect: (participationId: string | null) => void;
};

export type TrainingLoaders = {
  clients: LoadTrainingOptions;
  enrollment: EnrollmentLoaders;
  enrollmentOptions: LoadTrainingOptions;
  owners: LoadTrainingOptions;
  trainers: LoadTrainingOptions;
};

export function TrainingWorkspace({
  access,
  enrollments,
  feedback,
  loaders,
  participation,
  programs,
  sessionKey,
  sessions,
  writesLocked,
}: {
  access: TrainingAccess;
  enrollments: EnrollmentPane;
  feedback: TrainingFeedback | null;
  loaders: TrainingLoaders;
  participation: ParticipationPane;
  programs: ProgramPane;
  sessionKey: number;
  sessions: SessionPane;
  writesLocked: boolean;
}) {
  const { t } = useI18n();
  const [createOpen, setCreateOpen] = useState(false);
  const [draft, setDraft] = useState<ProgramFormValues>(EMPTY_PROGRAM_FORM);
  const message = t as (key: TrainingFeedback['messageKey']) => string;
  const program = programs.selected;
  const session = sessions.selected;
  const canOperate = program ? programAcceptsOperations(program) : false;
  const programSource = program ? `${sessionKey}:${program.id}` : `${sessionKey}`;
  const sessionSource = session ? `${programSource}:${session.id}` : programSource;

  return (
    <section aria-label={t('training.region')} className="training">
      <PageHeader
        description={t('training.header.description')}
        eyebrow={t('training.header.eyebrow')}
        title={t('training.header.title')}
      />
      {access.readOnly ? (
        <InlineMessage title={t('training.readOnly.title')} tone="info">
          {t('training.readOnly.body')}
        </InlineMessage>
      ) : null}
      {feedback ? (
        <InlineMessage
          announce
          title={
            feedback.tone === 'success'
              ? t('training.feedback.successTitle')
              : t('training.feedback.errorTitle')
          }
          tone={feedback.tone === 'success' ? 'success' : 'danger'}
        >
          <p className="training-message__text">{message(feedback.messageKey)}</p>
        </InlineMessage>
      ) : null}

      {access.createProgram ? (
        <details
          className="training-disclosure training-create"
          onToggle={(event) => setCreateOpen(event.currentTarget.open)}
          open={createOpen}
        >
          <summary className="training-disclosure__summary">
            <h2 className="training-disclosure__title">{t('training.programForm.createTitle')}</h2>
          </summary>
          <ProgramForm
            access={access}
            loadClients={loaders.clients}
            loadOwners={loaders.owners}
            mode="create"
            onChange={setDraft}
            onSubmit={() => {
              void programs.onCreate(draft).then((created) => {
                if (created) {
                  setDraft(EMPTY_PROGRAM_FORM);
                  setCreateOpen(false);
                }
              });
            }}
            sessionKey={sessionKey}
            values={draft}
            writesLocked={writesLocked}
          />
        </details>
      ) : null}

      <div className="training__workspace">
        <section aria-labelledby="training-programs-title" className="training__list-pane">
          <h2 className="training__pane-title" id="training-programs-title">
            {t('training.programs.title')}
          </h2>
          <ProgramFilters
            access={access}
            busy={programs.list.status === 'loading'}
            loadClients={loaders.clients}
            loadOwners={loaders.owners}
            onChange={programs.onFiltersChange}
            onReset={programs.onResetFilters}
            onSubmit={programs.onApplyFilters}
            sessionKey={sessionKey}
            showReset={
              hasActiveProgramFilters(programs.appliedFilters) ||
              hasActiveProgramFilters(programs.filters)
            }
            values={programs.filters}
          />
          <ProgramList
            filtered={hasActiveProgramFilters(programs.appliedFilters)}
            list={programs.list}
            onPage={programs.onPage}
            onReset={programs.onResetFilters}
            onRetry={programs.onRetry}
            onSelect={programs.onSelect}
            selectedId={program?.id ?? null}
            showClient={access.pickClients}
          />
        </section>

        <div className="training__detail-pane">
          {program ? (
            <ProgramProfile
              access={access}
              focusToken={programs.focusToken}
              key={program.id}
              loadClients={loaders.clients}
              loadOwners={loaders.owners}
              onArchive={programs.onArchive}
              onSave={programs.onSave}
              onStatus={programs.onStatus}
              program={program}
              sessionKey={sessionKey}
              writesLocked={writesLocked}
            />
          ) : (
            <p className="training-muted">{t('training.profile.selectPrompt')}</p>
          )}
        </div>
      </div>

      {program ? (
        <div className="training__operations" key={program.id}>
          {access.viewSessions ? (
            <TrainingSessions
              access={access}
              appliedFilters={sessions.appliedFilters}
              canSchedule={canOperate}
              filters={sessions.filters}
              list={sessions.list}
              loadTrainers={loaders.trainers}
              onApplyFilters={sessions.onApplyFilters}
              onCreate={sessions.onCreate}
              onFiltersChange={sessions.onFiltersChange}
              onPage={sessions.onPage}
              onResetFilters={sessions.onResetFilters}
              onRetry={sessions.onRetry}
              onSelect={sessions.onSelect}
              selectedId={session?.id ?? null}
              sourceKey={programSource}
              writesLocked={writesLocked}
            >
              {session ? (
                <TrainingSessionDetail
                  access={access}
                  canOperate={canOperate}
                  focusToken={sessions.focusToken}
                  key={session.id}
                  loadTrainers={loaders.trainers}
                  onArchive={sessions.onArchive}
                  onCancelSession={sessions.onCancelSession}
                  onReschedule={sessions.onReschedule}
                  onStatus={sessions.onStatus}
                  onUpdate={sessions.onUpdate}
                  session={session}
                  sourceKey={sessionSource}
                  writesLocked={writesLocked}
                >
                  {access.viewParticipation ? (
                    <TrainingParticipation
                      access={access}
                      acceptsAttendance={canOperate && sessionAcceptsAttendance(session)}
                      acceptsParticipants={canOperate && sessionAcceptsParticipants(session)}
                      filters={participation.filters}
                      list={participation.list}
                      loadEnrollmentOptions={loaders.enrollmentOptions}
                      onAdd={participation.onAdd}
                      onArchive={participation.onArchive}
                      onCorrect={participation.onCorrect}
                      onFiltersChange={participation.onFiltersChange}
                      onPage={participation.onPage}
                      onRecord={participation.onRecord}
                      onRetry={participation.onRetry}
                      onSelect={participation.onSelect}
                      selectedId={participation.selectedId}
                      sourceKey={sessionSource}
                      writesLocked={writesLocked}
                    />
                  ) : null}
                </TrainingSessionDetail>
              ) : null}
            </TrainingSessions>
          ) : null}

          {access.viewEnrollments ? (
            <TrainingEnrollments
              access={access}
              canOperate={canOperate}
              certificate={enrollments.certificate}
              filters={enrollments.filters}
              list={enrollments.list}
              loaders={loaders.enrollment}
              onArchive={enrollments.onArchive}
              onCreate={enrollments.onCreate}
              onFiltersChange={enrollments.onFiltersChange}
              onPage={enrollments.onPage}
              onRetry={enrollments.onRetry}
              onSelect={enrollments.onSelect}
              onStatus={enrollments.onStatus}
              onWithdraw={enrollments.onWithdraw}
              program={program}
              selectedId={enrollments.selectedId}
              sourceKey={programSource}
              writesLocked={writesLocked}
            />
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
