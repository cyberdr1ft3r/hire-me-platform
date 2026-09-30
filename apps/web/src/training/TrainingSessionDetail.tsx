import type { TrainingSessionStatus, TrainingSessionSummary } from '@hire-me/contracts';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';

import { useI18n } from '../i18n/index.js';
import { isoToLocalInput } from '../tasks/task-datetime.js';
import { Button, StatusBadge, TextField } from '../ui/index.js';
import type { TrainingAccess } from './training-access.js';
import {
  nextSessionStatuses,
  sessionArchivable,
  sessionCancelable,
  sessionEditable,
  sessionReschedulable,
  sessionStatusTone,
} from './training-labels.js';
import {
  scheduleWindowInvalid,
  sessionFormFrom,
  type LoadTrainingOptions,
  type SessionFormValues,
} from './training-state.js';
import { SessionForm } from './SessionForm.js';

type Panel = 'none' | 'reschedule' | 'cancel' | 'edit';

export type RescheduleValues = { scheduledAt: string; scheduledEndAt: string; reason: string };

export function TrainingSessionDetail({
  access,
  canOperate,
  children,
  focusToken,
  loadTrainers,
  onArchive,
  onCancelSession,
  onReschedule,
  onStatus,
  onUpdate,
  session,
  sourceKey,
  writesLocked,
}: {
  access: TrainingAccess;
  /** False once the program is closed or archived. */
  canOperate: boolean;
  children?: ReactNode;
  focusToken: number;
  loadTrainers: LoadTrainingOptions;
  onArchive: () => void;
  onCancelSession: (reason: string) => Promise<boolean>;
  onReschedule: (values: RescheduleValues) => Promise<boolean>;
  onStatus: (status: TrainingSessionStatus) => void;
  onUpdate: (values: SessionFormValues) => Promise<boolean>;
  session: TrainingSessionSummary;
  sourceKey: string;
  writesLocked: boolean;
}) {
  const { formatDateTime, t } = useI18n();
  const heading = useRef<HTMLHeadingElement>(null);
  const [panel, setPanel] = useState<Panel>('none');
  const [edit, setEdit] = useState<SessionFormValues>(() => sessionFormFrom(session));
  const [reschedule, setReschedule] = useState<RescheduleValues>({
    scheduledAt: isoToLocalInput(session.scheduledAt),
    scheduledEndAt: isoToLocalInput(session.scheduledEndAt),
    reason: '',
  });
  const [cancelReason, setCancelReason] = useState('');

  useEffect(() => {
    if (focusToken > 0) heading.current?.focus();
  }, [focusToken]);

  const manage = access.manageSessions && canOperate;
  const statusActions = manage ? nextSessionStatuses(session.status) : [];
  const canReschedule = manage && sessionReschedulable(session);
  const canCancel = manage && sessionCancelable(session);
  const canEdit = manage && sessionEditable(session);
  const canArchive = access.archiveSessions && canOperate && sessionArchivable(session);
  const rescheduleInvalid =
    reschedule.scheduledAt !== '' &&
    reschedule.scheduledEndAt !== '' &&
    scheduleWindowInvalid(reschedule.scheduledAt, reschedule.scheduledEndAt);

  function open(next: Panel): void {
    setPanel((current) => (current === next ? 'none' : next));
    if (next === 'edit') setEdit(sessionFormFrom(session));
  }

  function submitReschedule(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!reschedule.scheduledAt || !reschedule.scheduledEndAt || rescheduleInvalid) return;
    void onReschedule(reschedule).then((done) => {
      if (done) {
        setPanel('none');
        setReschedule((values) => ({ ...values, reason: '' }));
      }
    });
  }

  function submitCancel(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!cancelReason.trim()) return;
    void onCancelSession(cancelReason.trim()).then((done) => {
      if (done) {
        setPanel('none');
        setCancelReason('');
      }
    });
  }

  return (
    <article aria-labelledby="training-session-title" className="training-detail">
      <header className="training-detail__heading">
        <h3
          className="training-detail__title"
          id="training-session-title"
          ref={heading}
          tabIndex={-1}
        >
          {session.title}
        </h3>
        <StatusBadge tone={sessionStatusTone(session.status)}>
          {t(`training.status.session.${session.status}`)}
        </StatusBadge>
      </header>

      <dl className="training-facts">
        <div>
          <dt>{t('training.sessionDetail.start')}</dt>
          <dd>
            <time dateTime={session.scheduledAt}>{formatDateTime(session.scheduledAt)}</time>
          </dd>
        </div>
        <div>
          <dt>{t('training.sessionDetail.end')}</dt>
          <dd>
            <time dateTime={session.scheduledEndAt}>{formatDateTime(session.scheduledEndAt)}</time>
          </dd>
        </div>
        <div>
          <dt>{t('training.sessionDetail.delivery')}</dt>
          <dd>{t(`training.deliveryMode.${session.deliveryMode}`)}</dd>
        </div>
        <div>
          <dt>{t('training.sessionDetail.trainer')}</dt>
          <dd>{session.trainerDisplayName ?? t('training.common.unassigned')}</dd>
        </div>
        <div>
          <dt>{t('training.sessionDetail.location')}</dt>
          <dd>{session.location ?? t('training.common.notSet')}</dd>
        </div>
        {session.meetingUrl ? (
          <div>
            <dt>{t('training.sessionDetail.meetingUrl')}</dt>
            <dd className="training-break">{session.meetingUrl}</dd>
          </div>
        ) : null}
        <div>
          <dt>{t('training.sessionDetail.reschedules')}</dt>
          <dd className="u-tabular">{session.rescheduleCount}</dd>
        </div>
        {session.lastRescheduleReason ? (
          <div>
            <dt>{t('training.sessionDetail.lastRescheduleReason')}</dt>
            <dd>{session.lastRescheduleReason}</dd>
          </div>
        ) : null}
        {session.cancellationReason ? (
          <div>
            <dt>{t('training.sessionDetail.cancellationReason')}</dt>
            <dd>{session.cancellationReason}</dd>
          </div>
        ) : null}
        {session.outcome ? (
          <div>
            <dt>{t('training.sessionDetail.outcome')}</dt>
            <dd>{session.outcome}</dd>
          </div>
        ) : null}
      </dl>

      {statusActions.length > 0 || canReschedule || canCancel || canEdit || canArchive ? (
        <div
          aria-label={t('training.sessionDetail.actions')}
          className="training-actions"
          role="group"
        >
          {statusActions.map((status) => (
            <Button
              disabled={writesLocked}
              key={status}
              onClick={() => onStatus(status)}
              size="compact"
            >
              {t(`training.sessionDetail.statusAction.${status}`)}
            </Button>
          ))}
          {canReschedule ? (
            <Button
              aria-expanded={panel === 'reschedule'}
              disabled={writesLocked}
              onClick={() => open('reschedule')}
              size="compact"
              variant="secondary"
            >
              {t('training.sessionDetail.reschedule')}
            </Button>
          ) : null}
          {canEdit ? (
            <Button
              aria-expanded={panel === 'edit'}
              disabled={writesLocked}
              onClick={() => open('edit')}
              size="compact"
              variant="secondary"
            >
              {t('training.sessionDetail.edit')}
            </Button>
          ) : null}
          {canCancel ? (
            <Button
              aria-expanded={panel === 'cancel'}
              disabled={writesLocked}
              onClick={() => open('cancel')}
              size="compact"
              variant="danger"
            >
              {t('training.sessionDetail.cancel')}
            </Button>
          ) : null}
          {canArchive ? (
            <Button disabled={writesLocked} onClick={onArchive} size="compact" variant="danger">
              {t('training.sessionDetail.archive')}
            </Button>
          ) : null}
        </div>
      ) : null}

      {panel === 'reschedule' && canReschedule ? (
        <form
          aria-label={t('training.sessionDetail.rescheduleTitle')}
          className="training-form training-form--panel"
          noValidate
          onSubmit={submitReschedule}
        >
          <div className="training-form__grid">
            <TextField
              label={t('training.sessionDetail.newStart')}
              onChange={(event) =>
                setReschedule({ ...reschedule, scheduledAt: event.currentTarget.value })
              }
              required
              type="datetime-local"
              value={reschedule.scheduledAt}
            />
            <TextField
              error={rescheduleInvalid ? t('training.sessionForm.windowInvalid') : undefined}
              label={t('training.sessionDetail.newEnd')}
              onChange={(event) =>
                setReschedule({ ...reschedule, scheduledEndAt: event.currentTarget.value })
              }
              required
              type="datetime-local"
              value={reschedule.scheduledEndAt}
            />
            <TextField
              hint={t('training.sessionDetail.rescheduleReasonHint')}
              label={t('training.sessionDetail.rescheduleReason')}
              maxLength={500}
              onChange={(event) =>
                setReschedule({ ...reschedule, reason: event.currentTarget.value })
              }
              value={reschedule.reason}
            />
          </div>
          <div className="training-form__actions">
            <Button
              disabled={
                writesLocked ||
                rescheduleInvalid ||
                !reschedule.scheduledAt ||
                !reschedule.scheduledEndAt
              }
              type="submit"
            >
              {t('training.sessionDetail.confirmReschedule')}
            </Button>
            <Button disabled={writesLocked} onClick={() => setPanel('none')} variant="secondary">
              {t('training.common.cancel')}
            </Button>
          </div>
        </form>
      ) : null}

      {panel === 'cancel' && canCancel ? (
        <form
          aria-label={t('training.sessionDetail.cancelTitle')}
          className="training-form training-form--panel"
          noValidate
          onSubmit={submitCancel}
        >
          <TextField
            hint={t('training.sessionDetail.cancelReasonHint')}
            label={t('training.sessionDetail.cancelReason')}
            maxLength={500}
            onChange={(event) => setCancelReason(event.currentTarget.value)}
            required
            value={cancelReason}
          />
          <div className="training-form__actions">
            <Button disabled={writesLocked || !cancelReason.trim()} type="submit" variant="danger">
              {t('training.sessionDetail.confirmCancel')}
            </Button>
            <Button disabled={writesLocked} onClick={() => setPanel('none')} variant="secondary">
              {t('training.sessionDetail.keepSession')}
            </Button>
          </div>
        </form>
      ) : null}

      {panel === 'edit' && canEdit ? (
        <section aria-labelledby="training-session-edit" className="training-form--panel">
          <h4 className="training-section__subtitle" id="training-session-edit">
            {t('training.sessionDetail.editTitle')}
          </h4>
          <SessionForm
            access={access}
            loadTrainers={loadTrainers}
            mode="edit"
            onCancel={() => setPanel('none')}
            onChange={setEdit}
            onSubmit={() => {
              void onUpdate(edit).then((done) => {
                if (done) setPanel('none');
              });
            }}
            sourceKey={sourceKey}
            values={edit}
            writesLocked={writesLocked}
          />
        </section>
      ) : null}

      {children}
    </article>
  );
}
