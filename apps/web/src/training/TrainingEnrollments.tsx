import type {
  TrainingEnrollmentStatus,
  TrainingEnrollmentSummary,
  TrainingParticipantType,
  TrainingProgramSummary,
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
  TextField,
} from '../ui/index.js';
import type { TrainingAccess } from './training-access.js';
import {
  certificateStatusTone,
  ENROLLMENT_STATUSES,
  enrollmentArchivable,
  enrollmentIsTerminal,
  enrollmentStatusTone,
  nextEnrollmentStatuses,
} from './training-labels.js';
import {
  hasActiveEnrollmentFilters,
  type EnrollmentFilterValues,
  type ListState,
  type LoadTrainingOptions,
  type TrainingPickerOption,
} from './training-state.js';
import { ParticipantIdentity } from './ParticipantIdentity.js';
import { TrainingCertificateStatus, type CertificateActions } from './TrainingCertificateStatus.js';
import { TrainingOptionPicker } from './TrainingOptionPicker.js';

/** EXTERNAL participants have no creation path in V1, so they are never offered here. */
type CreatableType = Exclude<TrainingParticipantType, 'EXTERNAL'>;

export type EnrollmentLoaders = {
  candidates: LoadTrainingOptions;
  users: LoadTrainingOptions;
  clients: LoadTrainingOptions;
  contacts: (clientId: string) => LoadTrainingOptions;
};

function creatableTypes(access: TrainingAccess): CreatableType[] {
  const types: CreatableType[] = [];
  if (access.enrollCandidates) types.push('CANDIDATE');
  if (access.enrollUsers) types.push('USER');
  if (access.enrollClientContacts) types.push('CLIENT_CONTACT');
  return types;
}

export function TrainingEnrollments({
  access,
  canOperate,
  certificate,
  filters,
  list,
  loaders,
  onArchive,
  onCreate,
  onFiltersChange,
  onPage,
  onRetry,
  onSelect,
  onStatus,
  onWithdraw,
  program,
  selectedId,
  sourceKey,
  writesLocked,
}: {
  access: TrainingAccess;
  /** False once the program is closed or archived. */
  canOperate: boolean;
  certificate: CertificateActions;
  filters: EnrollmentFilterValues;
  list: ListState<TrainingEnrollmentSummary>;
  loaders: EnrollmentLoaders;
  onArchive: (enrollment: TrainingEnrollmentSummary) => void;
  onCreate: (type: CreatableType, participant: TrainingPickerOption) => Promise<boolean>;
  onFiltersChange: (values: EnrollmentFilterValues) => void;
  onPage: (page: number) => void;
  onRetry: () => void;
  onSelect: (enrollmentId: string | null) => void;
  onStatus: (enrollment: TrainingEnrollmentSummary, status: TrainingEnrollmentStatus) => void;
  onWithdraw: (enrollment: TrainingEnrollmentSummary, reason: string) => Promise<boolean>;
  program: TrainingProgramSummary;
  selectedId: string | null;
  sourceKey: string;
  writesLocked: boolean;
}) {
  const { formatDateTime, t } = useI18n();
  const types = creatableTypes(access);
  const filtered = hasActiveEnrollmentFilters(filters);
  const selected =
    list.status === 'ready' ? (list.items.find((item) => item.id === selectedId) ?? null) : null;

  return (
    <section
      aria-labelledby="training-enrollments-title"
      className="training-section training-block"
    >
      <h2 className="training-block__title" id="training-enrollments-title">
        {t('training.enrollments.title')}
      </h2>

      {canOperate && types.length > 0 ? (
        <EnrollmentCreate
          loaders={loaders}
          onCreate={onCreate}
          program={program}
          sourceKey={sourceKey}
          types={types}
          writesLocked={writesLocked}
        />
      ) : null}

      <div className="training-filters training-filters--compact">
        <div className="training-filters__controls">
          <Select
            label={t('training.enrollments.filters.status')}
            onChange={(event) =>
              onFiltersChange({
                ...filters,
                status: event.currentTarget.value as EnrollmentFilterValues['status'],
              })
            }
            value={filters.status}
          >
            <option value="">{t('training.filters.anyStatus')}</option>
            {ENROLLMENT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {t(`training.status.enrollment.${status}`)}
              </option>
            ))}
          </Select>
          <Select
            label={t('training.enrollments.filters.participantType')}
            onChange={(event) =>
              onFiltersChange({
                ...filters,
                participantType: event.currentTarget
                  .value as EnrollmentFilterValues['participantType'],
              })
            }
            value={filters.participantType}
          >
            <option value="">{t('training.enrollments.filters.anyType')}</option>
            {(['USER', 'CANDIDATE', 'CLIENT_CONTACT', 'EXTERNAL'] as const).map((type) => (
              <option key={type} value={type}>
                {t(`training.participantType.${type}`)}
              </option>
            ))}
          </Select>
          <Checkbox
            checked={filters.certificateReadyOnly}
            label={t('training.enrollments.filters.certificateReadyOnly')}
            onChange={(event) =>
              onFiltersChange({ ...filters, certificateReadyOnly: event.currentTarget.checked })
            }
          />
          <Checkbox
            checked={filters.includeArchived}
            label={t('training.enrollments.filters.includeArchived')}
            onChange={(event) =>
              onFiltersChange({ ...filters, includeArchived: event.currentTarget.checked })
            }
          />
        </div>
      </div>

      {list.status === 'loading' || list.status === 'idle' ? (
        <div aria-busy="true">
          <Skeleton label={t('training.enrollments.states.loading')} />
        </div>
      ) : list.status === 'error' ? (
        <InlineMessage announce title={t('training.enrollments.states.errorTitle')} tone="danger">
          <p className="training-message__text">{t('training.enrollments.states.error')}</p>
          <Button onClick={onRetry} size="compact" variant="secondary">
            {t('common.actions.retry')}
          </Button>
        </InlineMessage>
      ) : list.items.length === 0 ? (
        <EmptyState
          title={
            filtered
              ? t('training.enrollments.empty.noMatchesTitle')
              : t('training.enrollments.empty.noneTitle')
          }
        >
          {filtered
            ? t('training.enrollments.empty.noMatches')
            : t('training.enrollments.empty.none')}
        </EmptyState>
      ) : (
        <div className="training-list">
          <p aria-live="polite" className="training-list__count">
            {t('training.enrollments.count', { count: list.total })}
          </p>
          <table aria-label={t('training.enrollments.tableLabel')} className="training-table">
            <thead>
              <tr>
                <th scope="col">{t('training.enrollments.columns.participant')}</th>
                <th scope="col">{t('training.enrollments.columns.status')}</th>
                <th scope="col">{t('training.enrollments.columns.certificate')}</th>
                <th scope="col">{t('training.enrollments.columns.enrolled')}</th>
                <th scope="col">{t('training.enrollments.columns.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {list.items.map((enrollment) => {
                const isSelected = enrollment.id === selectedId;
                return (
                  <tr data-selected={isSelected ? 'true' : undefined} key={enrollment.id}>
                    <th scope="row">
                      <ParticipantIdentity
                        display={enrollment.participantDisplay}
                        participantType={enrollment.participantType}
                      />
                    </th>
                    <td data-label={t('training.enrollments.columns.status')}>
                      <StatusBadge tone={enrollmentStatusTone(enrollment.status)}>
                        {t(`training.status.enrollment.${enrollment.status}`)}
                      </StatusBadge>
                      {enrollment.archivedAt ? (
                        <span className="training-table__secondary">
                          {t('training.common.archived')}
                        </span>
                      ) : null}
                    </td>
                    <td data-label={t('training.enrollments.columns.certificate')}>
                      <StatusBadge tone={certificateStatusTone(enrollment.certificateStatus)}>
                        {t(`training.status.certificate.${enrollment.certificateStatus}`)}
                      </StatusBadge>
                      {enrollment.certificateReady ? (
                        <span className="training-table__secondary">
                          {t('training.certificate.readyShort')}
                        </span>
                      ) : null}
                    </td>
                    <td
                      className="u-tabular"
                      data-label={t('training.enrollments.columns.enrolled')}
                    >
                      {enrollment.enrolledAt ? (
                        <time dateTime={enrollment.enrolledAt}>
                          {formatDateTime(enrollment.enrolledAt)}
                        </time>
                      ) : (
                        <span className="training-muted">{t('training.common.notSet')}</span>
                      )}
                    </td>
                    <td data-label={t('training.enrollments.columns.actions')}>
                      <Button
                        aria-expanded={isSelected}
                        onClick={() => onSelect(isSelected ? null : enrollment.id)}
                        size="compact"
                        variant="secondary"
                      >
                        {isSelected
                          ? t('training.enrollments.closeDetails')
                          : t('training.enrollments.openDetails')}
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
              region: t('training.enrollments.paginationRegion'),
            }}
            onPage={onPage}
            page={list.page}
            pageSize={list.pageSize}
            total={list.total}
          />
        </div>
      )}

      {selected ? (
        <EnrollmentRecord
          access={access}
          canOperate={canOperate}
          certificate={certificate}
          enrollment={selected}
          key={selected.id}
          onArchive={onArchive}
          onStatus={onStatus}
          onWithdraw={onWithdraw}
          writesLocked={writesLocked}
        />
      ) : null}
    </section>
  );
}

function EnrollmentCreate({
  loaders,
  onCreate,
  program,
  sourceKey,
  types,
  writesLocked,
}: {
  loaders: EnrollmentLoaders;
  onCreate: (type: CreatableType, participant: TrainingPickerOption) => Promise<boolean>;
  program: TrainingProgramSummary;
  sourceKey: string;
  types: CreatableType[];
  writesLocked: boolean;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<CreatableType>(types[0]!);
  const [participant, setParticipant] = useState<TrainingPickerOption | null>(null);
  const [contactClient, setContactClient] = useState<TrainingPickerOption | null>(null);
  const activeType = types.includes(type) ? type : types[0]!;
  // A client-linked program only accepts contacts of its own client.
  const contactClientId = program.clientId ?? contactClient?.id ?? null;

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!participant) return;
    void onCreate(activeType, participant).then((created) => {
      if (created) {
        setParticipant(null);
        setOpen(false);
      }
    });
  }

  return (
    <details
      className="training-disclosure"
      onToggle={(event) => setOpen(event.currentTarget.open)}
      open={open}
    >
      <summary className="training-disclosure__summary">
        <h3 className="training-disclosure__title">{t('training.enrollments.createTitle')}</h3>
      </summary>
      <form
        aria-label={t('training.enrollments.createTitle')}
        className="training-form"
        noValidate
        onSubmit={submit}
      >
        <div className="training-form__grid">
          <Select
            label={t('training.enrollments.participantType')}
            onChange={(event) => {
              setType(event.currentTarget.value as CreatableType);
              setParticipant(null);
            }}
            value={activeType}
          >
            {types.map((option) => (
              <option key={option} value={option}>
                {t(`training.participantType.${option}`)}
              </option>
            ))}
          </Select>

          {activeType === 'CANDIDATE' ? (
            <TrainingOptionPicker
              hint={t('training.enrollments.candidateHint')}
              label={t('training.enrollments.candidate')}
              loadOptions={loaders.candidates}
              onChange={setParticipant}
              required
              sourceKey={`${sourceKey}:enroll-candidate`}
              value={participant}
            />
          ) : null}

          {activeType === 'USER' ? (
            <TrainingOptionPicker
              hint={t('training.enrollments.userHint')}
              label={t('training.enrollments.user')}
              loadOptions={loaders.users}
              onChange={setParticipant}
              required
              sourceKey={`${sourceKey}:enroll-user`}
              value={participant}
            />
          ) : null}

          {activeType === 'CLIENT_CONTACT' ? (
            <>
              {program.clientId ? (
                <TextField
                  disabled
                  hint={t('training.enrollments.programClientHint')}
                  label={t('training.enrollments.contactClient')}
                  readOnly
                  value={program.clientDisplayName ?? t('training.participant.restricted')}
                />
              ) : (
                <TrainingOptionPicker
                  hint={t('training.enrollments.contactClientHint')}
                  label={t('training.enrollments.contactClient')}
                  loadOptions={loaders.clients}
                  onChange={(next) => {
                    setContactClient(next);
                    setParticipant(null);
                  }}
                  required
                  sourceKey={`${sourceKey}:enroll-contact-client`}
                  value={contactClient}
                />
              )}
              {contactClientId ? (
                <TrainingOptionPicker
                  hint={t('training.enrollments.contactHint')}
                  label={t('training.enrollments.contact')}
                  loadOptions={loaders.contacts(contactClientId)}
                  onChange={setParticipant}
                  required
                  sourceKey={`${sourceKey}:enroll-contact:${contactClientId}`}
                  value={participant}
                />
              ) : null}
            </>
          ) : null}
        </div>
        <div className="training-form__actions">
          <Button disabled={writesLocked || !participant} type="submit">
            {t('training.enrollments.create')}
          </Button>
        </div>
      </form>
    </details>
  );
}

function EnrollmentRecord({
  access,
  canOperate,
  certificate,
  enrollment,
  onArchive,
  onStatus,
  onWithdraw,
  writesLocked,
}: {
  access: TrainingAccess;
  canOperate: boolean;
  certificate: CertificateActions;
  enrollment: TrainingEnrollmentSummary;
  onArchive: (enrollment: TrainingEnrollmentSummary) => void;
  onStatus: (enrollment: TrainingEnrollmentSummary, status: TrainingEnrollmentStatus) => void;
  onWithdraw: (enrollment: TrainingEnrollmentSummary, reason: string) => Promise<boolean>;
  writesLocked: boolean;
}) {
  const { formatDateTime, t } = useI18n();
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [reason, setReason] = useState('');
  const manage = access.manageEnrollments && canOperate && enrollment.archivedAt === null;
  const statusActions = manage ? nextEnrollmentStatuses(enrollment.status) : [];
  const canWithdraw = manage && !enrollmentIsTerminal(enrollment);
  const canArchive = manage && enrollmentArchivable(enrollment);

  function submitWithdraw(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!reason.trim()) return;
    void onWithdraw(enrollment, reason.trim()).then((done) => {
      if (done) {
        setWithdrawOpen(false);
        setReason('');
      }
    });
  }

  const dates: { key: 'enrolled' | 'completed' | 'withdrawn'; value: string | null }[] = [
    { key: 'enrolled', value: enrollment.enrolledAt },
    { key: 'completed', value: enrollment.completedAt },
    { key: 'withdrawn', value: enrollment.withdrawnAt },
  ];

  return (
    <div aria-labelledby="training-enrollment-record" className="training-record" role="region">
      <h4 className="training-record__title" id="training-enrollment-record">
        {t('training.enrollments.recordTitle')}
      </h4>
      <ParticipantIdentity
        display={enrollment.participantDisplay}
        participantType={enrollment.participantType}
      />
      <dl className="training-facts">
        <div>
          <dt>{t('training.enrollments.columns.status')}</dt>
          <dd>
            <StatusBadge tone={enrollmentStatusTone(enrollment.status)}>
              {t(`training.status.enrollment.${enrollment.status}`)}
            </StatusBadge>
          </dd>
        </div>
        {dates.map(({ key, value }) =>
          value ? (
            <div key={key}>
              <dt>{t(`training.enrollments.dates.${key}`)}</dt>
              <dd>
                <time dateTime={value}>{formatDateTime(value)}</time>
              </dd>
            </div>
          ) : null,
        )}
        {enrollment.withdrawalReason ? (
          <div>
            <dt>{t('training.enrollments.withdrawalReason')}</dt>
            <dd>{enrollment.withdrawalReason}</dd>
          </div>
        ) : null}
      </dl>

      {statusActions.length > 0 || canWithdraw || canArchive ? (
        <div
          aria-label={t('training.enrollments.actions')}
          className="training-actions"
          role="group"
        >
          {statusActions.map((status) => (
            <Button
              disabled={writesLocked}
              key={status}
              onClick={() => onStatus(enrollment, status)}
              size="compact"
              variant={status === 'REJECTED' ? 'danger' : 'primary'}
            >
              {t('training.enrollments.moveTo', {
                status: t(`training.status.enrollment.${status}`),
              })}
            </Button>
          ))}
          {canWithdraw ? (
            <Button
              aria-expanded={withdrawOpen}
              disabled={writesLocked}
              onClick={() => setWithdrawOpen((value) => !value)}
              size="compact"
              variant="danger"
            >
              {t('training.enrollments.withdraw')}
            </Button>
          ) : null}
          {canArchive ? (
            <Button
              disabled={writesLocked}
              onClick={() => onArchive(enrollment)}
              size="compact"
              variant="danger"
            >
              {t('training.enrollments.archive')}
            </Button>
          ) : null}
        </div>
      ) : null}

      {withdrawOpen && canWithdraw ? (
        <form
          aria-label={t('training.enrollments.withdrawTitle')}
          className="training-form training-form--panel"
          noValidate
          onSubmit={submitWithdraw}
        >
          <TextField
            hint={t('training.enrollments.withdrawReasonHint')}
            label={t('training.enrollments.withdrawReason')}
            maxLength={500}
            onChange={(event) => setReason(event.currentTarget.value)}
            required
            value={reason}
          />
          <div className="training-form__actions">
            <Button disabled={writesLocked || !reason.trim()} type="submit" variant="danger">
              {t('training.enrollments.confirmWithdraw')}
            </Button>
            <Button
              disabled={writesLocked}
              onClick={() => setWithdrawOpen(false)}
              variant="secondary"
            >
              {t('training.enrollments.keepEnrollment')}
            </Button>
          </div>
        </form>
      ) : null}

      <TrainingCertificateStatus
        access={access}
        actions={certificate}
        canOperate={canOperate}
        enrollment={enrollment}
        writesLocked={writesLocked}
      />
    </div>
  );
}
