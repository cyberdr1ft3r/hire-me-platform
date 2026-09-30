import type {
  TrainingParticipationSummary,
  TrainingSessionParticipationStatus,
} from '@hire-me/contracts';
import { useState, type FormEvent } from 'react';

import { ListPagination } from '../clients/ListPagination.js';
import { useI18n } from '../i18n/index.js';
import {
  Button,
  Checkbox,
  EmptyState,
  InlineMessage,
  Select,
  Skeleton,
  StatusBadge,
  TextArea,
  TextField,
} from '../ui/index.js';
import type { TrainingAccess } from './training-access.js';
import {
  CORRECTABLE_PARTICIPATION_STATUSES,
  nextParticipationStatuses,
  PARTICIPATION_STATUSES,
  participationStatusTone,
} from './training-labels.js';
import type {
  ListState,
  LoadTrainingOptions,
  ParticipationFilterValues,
  TrainingPickerOption,
} from './training-state.js';
import { ParticipantIdentity } from './ParticipantIdentity.js';
import { TrainingOptionPicker } from './TrainingOptionPicker.js';

export type AttendanceValues = {
  status: TrainingSessionParticipationStatus | '';
  sessionOutcome: string;
  completionStatus: string;
  trainerNotes: string;
  correctionReason: string;
};

function attendanceFrom(participation: TrainingParticipationSummary): AttendanceValues {
  return {
    status: '',
    sessionOutcome: participation.sessionOutcome ?? '',
    completionStatus: participation.completionStatus ?? '',
    trainerNotes: participation.trainerNotes ?? '',
    correctionReason: '',
  };
}

export function TrainingParticipation({
  access,
  acceptsAttendance,
  acceptsParticipants,
  filters,
  list,
  loadEnrollmentOptions,
  onAdd,
  onArchive,
  onCorrect,
  onFiltersChange,
  onPage,
  onRecord,
  onRetry,
  onSelect,
  selectedId,
  sourceKey,
  writesLocked,
}: {
  access: TrainingAccess;
  acceptsAttendance: boolean;
  acceptsParticipants: boolean;
  filters: ParticipationFilterValues;
  list: ListState<TrainingParticipationSummary>;
  loadEnrollmentOptions: LoadTrainingOptions;
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
  selectedId: string | null;
  sourceKey: string;
  writesLocked: boolean;
}) {
  const { formatDateTime, t } = useI18n();
  const [participant, setParticipant] = useState<TrainingPickerOption | null>(null);
  const selected =
    list.status === 'ready' ? (list.items.find((item) => item.id === selectedId) ?? null) : null;

  function submitAdd(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!participant) return;
    void onAdd(participant).then((added) => {
      if (added) setParticipant(null);
    });
  }

  return (
    <section aria-labelledby="training-attendance-title" className="training-section">
      <h4 className="training-section__subtitle" id="training-attendance-title">
        {t('training.participation.title')}
      </h4>

      {!acceptsAttendance ? (
        <p className="training-muted">{t('training.participation.notAccepting')}</p>
      ) : null}

      {access.manageParticipation && acceptsParticipants ? (
        <form
          aria-label={t('training.participation.addTitle')}
          className="training-form training-form--inline"
          noValidate
          onSubmit={submitAdd}
        >
          <TrainingOptionPicker
            formatOption={(option) =>
              [
                option.label,
                option.participantType
                  ? t(`training.participantType.${option.participantType}`)
                  : null,
                option.detail,
              ]
                .filter(Boolean)
                .join(' · ')
            }
            hint={t('training.participation.addHint')}
            label={t('training.participation.participant')}
            loadOptions={loadEnrollmentOptions}
            onChange={setParticipant}
            sourceKey={`${sourceKey}:enrollment-options`}
            value={participant}
          />
          <div className="training-form__actions">
            <Button disabled={writesLocked || !participant} type="submit">
              {t('training.participation.add')}
            </Button>
          </div>
        </form>
      ) : null}

      <div className="training-filters training-filters--compact">
        <div className="training-filters__controls">
          <Select
            label={t('training.participation.filters.status')}
            onChange={(event) =>
              onFiltersChange({
                ...filters,
                status: event.currentTarget.value as ParticipationFilterValues['status'],
              })
            }
            value={filters.status}
          >
            <option value="">{t('training.filters.anyStatus')}</option>
            {PARTICIPATION_STATUSES.map((status) => (
              <option key={status} value={status}>
                {t(`training.status.participation.${status}`)}
              </option>
            ))}
          </Select>
          <Checkbox
            checked={filters.includeArchived}
            label={t('training.participation.filters.includeArchived')}
            onChange={(event) =>
              onFiltersChange({ ...filters, includeArchived: event.currentTarget.checked })
            }
          />
        </div>
      </div>

      {list.status === 'loading' || list.status === 'idle' ? (
        <div aria-busy="true">
          <Skeleton label={t('training.participation.states.loading')} />
        </div>
      ) : list.status === 'error' ? (
        <InlineMessage announce title={t('training.participation.states.errorTitle')} tone="danger">
          <p className="training-message__text">{t('training.participation.states.error')}</p>
          <Button onClick={onRetry} size="compact" variant="secondary">
            {t('common.actions.retry')}
          </Button>
        </InlineMessage>
      ) : list.items.length === 0 ? (
        <EmptyState title={t('training.participation.empty.title')}>
          {t('training.participation.empty.body')}
        </EmptyState>
      ) : (
        <div className="training-list">
          <p aria-live="polite" className="training-list__count">
            {t('training.participation.count', { count: list.total })}
          </p>
          <table aria-label={t('training.participation.tableLabel')} className="training-table">
            <thead>
              <tr>
                <th scope="col">{t('training.participation.columns.participant')}</th>
                <th scope="col">{t('training.participation.columns.attendance')}</th>
                <th scope="col">{t('training.participation.columns.recorded')}</th>
                <th scope="col">{t('training.participation.columns.corrections')}</th>
                <th scope="col">{t('training.participation.columns.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {list.items.map((participation) => {
                const isSelected = participation.id === selectedId;
                return (
                  <tr data-selected={isSelected ? 'true' : undefined} key={participation.id}>
                    <th scope="row">
                      <ParticipantIdentity
                        display={participation.enrollment.participantDisplay}
                        participantType={participation.enrollment.participantType}
                      />
                    </th>
                    <td data-label={t('training.participation.columns.attendance')}>
                      <StatusBadge tone={participationStatusTone(participation.status)}>
                        {t(`training.status.participation.${participation.status}`)}
                      </StatusBadge>
                    </td>
                    <td
                      className="u-tabular"
                      data-label={t('training.participation.columns.recorded')}
                    >
                      {participation.attendanceRecordedAt ? (
                        <time dateTime={participation.attendanceRecordedAt}>
                          {formatDateTime(participation.attendanceRecordedAt)}
                        </time>
                      ) : (
                        <span className="training-muted">
                          {t('training.participation.notRecorded')}
                        </span>
                      )}
                    </td>
                    <td
                      className="u-tabular"
                      data-label={t('training.participation.columns.corrections')}
                    >
                      {participation.correctionCount}
                    </td>
                    <td data-label={t('training.participation.columns.actions')}>
                      <Button
                        aria-expanded={isSelected}
                        onClick={() => onSelect(isSelected ? null : participation.id)}
                        size="compact"
                        variant="secondary"
                      >
                        {isSelected
                          ? t('training.participation.closeDetails')
                          : t('training.participation.openDetails')}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <ListPagination
            labels={{
              next: t('training.pagination.next'),
              page: (values) => t('training.pagination.page', values),
              previous: t('training.pagination.previous'),
              range: (values) => t('training.pagination.range', values),
              region: t('training.participation.paginationRegion'),
            }}
            onPage={onPage}
            page={list.page}
            pageSize={list.pageSize}
            total={list.total}
          />
        </div>
      )}

      {selected ? (
        <ParticipationRecord
          access={access}
          acceptsAttendance={acceptsAttendance}
          key={selected.id}
          onArchive={onArchive}
          onCorrect={onCorrect}
          onRecord={onRecord}
          participation={selected}
          writesLocked={writesLocked}
        />
      ) : null}
    </section>
  );
}

function ParticipationRecord({
  access,
  acceptsAttendance,
  onArchive,
  onCorrect,
  onRecord,
  participation,
  writesLocked,
}: {
  access: TrainingAccess;
  acceptsAttendance: boolean;
  onArchive: (participation: TrainingParticipationSummary) => void;
  onCorrect: (
    participation: TrainingParticipationSummary,
    values: AttendanceValues,
  ) => Promise<boolean>;
  onRecord: (
    participation: TrainingParticipationSummary,
    values: AttendanceValues,
  ) => Promise<boolean>;
  participation: TrainingParticipationSummary;
  writesLocked: boolean;
}) {
  const { formatDateTime, t } = useI18n();
  const [record, setRecord] = useState<AttendanceValues>(() => attendanceFrom(participation));
  const [correction, setCorrection] = useState<AttendanceValues>(() =>
    attendanceFrom(participation),
  );
  const archived = participation.archivedAt !== null;
  const nextStatuses =
    access.manageParticipation && acceptsAttendance && !archived
      ? nextParticipationStatuses(participation.status)
      : [];
  const canCorrect = access.correctAttendance && acceptsAttendance && !archived;
  const canArchive =
    access.archiveParticipation && !archived && participation.status === 'SESSION_OUTCOME_RECORDED';

  function submitRecord(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!record.status) return;
    void onRecord(participation, record);
  }

  function submitCorrection(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!correction.status || !correction.correctionReason.trim()) return;
    void onCorrect(participation, correction);
  }

  return (
    <div aria-labelledby="training-participation-record" className="training-record" role="region">
      <h5 className="training-record__title" id="training-participation-record">
        {t('training.participation.recordTitle')}
      </h5>
      <ParticipantIdentity
        display={participation.enrollment.participantDisplay}
        participantType={participation.enrollment.participantType}
      />
      <dl className="training-facts">
        <div>
          <dt>{t('training.participation.outcome')}</dt>
          <dd>{participation.sessionOutcome ?? t('training.common.notSet')}</dd>
        </div>
        <div>
          <dt>{t('training.participation.completion')}</dt>
          <dd>{participation.completionStatus ?? t('training.common.notSet')}</dd>
        </div>
        {participation.trainerNotes ? (
          <div>
            <dt>{t('training.participation.trainerNotes')}</dt>
            <dd>{participation.trainerNotes}</dd>
          </div>
        ) : null}
        {participation.lastCorrectionReason ? (
          <div>
            <dt>{t('training.participation.lastCorrection')}</dt>
            <dd>
              {participation.lastCorrectionReason}
              {participation.lastCorrectedAt ? (
                <span className="training-muted">
                  {' · '}
                  <time dateTime={participation.lastCorrectedAt}>
                    {formatDateTime(participation.lastCorrectedAt)}
                  </time>
                </span>
              ) : null}
            </dd>
          </div>
        ) : null}
      </dl>

      {nextStatuses.length > 0 ? (
        <form
          aria-label={t('training.participation.recordAction')}
          className="training-form training-form--panel"
          noValidate
          onSubmit={submitRecord}
        >
          <div className="training-form__grid">
            <Select
              label={t('training.participation.newStatus')}
              onChange={(event) =>
                setRecord({
                  ...record,
                  status: event.currentTarget.value as AttendanceValues['status'],
                })
              }
              required
              value={record.status}
            >
              <option value="">{t('training.participation.chooseStatus')}</option>
              {nextStatuses.map((status) => (
                <option key={status} value={status}>
                  {t(`training.status.participation.${status}`)}
                </option>
              ))}
            </Select>
            <TextField
              label={t('training.participation.completion')}
              maxLength={120}
              onChange={(event) =>
                setRecord({ ...record, completionStatus: event.currentTarget.value })
              }
              value={record.completionStatus}
            />
          </div>
          <TextArea
            label={t('training.participation.outcome')}
            maxLength={2000}
            onChange={(event) =>
              setRecord({ ...record, sessionOutcome: event.currentTarget.value })
            }
            rows={2}
            value={record.sessionOutcome}
          />
          <TextArea
            hint={t('training.participation.trainerNotesHint')}
            label={t('training.participation.trainerNotes')}
            maxLength={2000}
            onChange={(event) => setRecord({ ...record, trainerNotes: event.currentTarget.value })}
            rows={2}
            value={record.trainerNotes}
          />
          <div className="training-form__actions">
            <Button disabled={writesLocked || !record.status} type="submit">
              {t('training.participation.recordAction')}
            </Button>
          </div>
        </form>
      ) : null}

      {canCorrect ? (
        <details className="training-disclosure">
          <summary className="training-disclosure__summary">
            <span className="training-disclosure__title">
              {t('training.participation.correctTitle')}
            </span>
          </summary>
          <form
            aria-label={t('training.participation.correctTitle')}
            className="training-form"
            noValidate
            onSubmit={submitCorrection}
          >
            <div className="training-form__grid">
              <Select
                label={t('training.participation.correctedStatus')}
                onChange={(event) =>
                  setCorrection({
                    ...correction,
                    status: event.currentTarget.value as AttendanceValues['status'],
                  })
                }
                required
                value={correction.status}
              >
                <option value="">{t('training.participation.chooseStatus')}</option>
                {CORRECTABLE_PARTICIPATION_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {t(`training.status.participation.${status}`)}
                  </option>
                ))}
              </Select>
              <TextField
                hint={t('training.participation.correctionReasonHint')}
                label={t('training.participation.correctionReason')}
                maxLength={500}
                onChange={(event) =>
                  setCorrection({ ...correction, correctionReason: event.currentTarget.value })
                }
                required
                value={correction.correctionReason}
              />
            </div>
            <div className="training-form__actions">
              <Button
                disabled={writesLocked || !correction.status || !correction.correctionReason.trim()}
                type="submit"
                variant="secondary"
              >
                {t('training.participation.correctAction')}
              </Button>
            </div>
          </form>
        </details>
      ) : null}

      {canArchive ? (
        <div className="training-actions">
          <Button
            disabled={writesLocked}
            onClick={() => onArchive(participation)}
            size="compact"
            variant="danger"
          >
            {t('training.participation.archive')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
