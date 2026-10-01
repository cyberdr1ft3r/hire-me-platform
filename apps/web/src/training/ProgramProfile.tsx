import type { TrainingProgramStatus, TrainingProgramSummary } from '@hire-me/contracts';
import { useEffect, useRef, useState } from 'react';

import { useI18n } from '../i18n/index.js';
import { Button, InlineMessage, StatusBadge } from '../ui/index.js';
import type { TrainingAccess } from './training-access.js';
import {
  nextProgramStatuses,
  programAcceptsOperations,
  programEditable,
  programStatusTone,
} from './training-labels.js';
import {
  programFormFrom,
  type LoadTrainingOptions,
  type ProgramFormValues,
} from './training-state.js';
import { ProgramForm } from './ProgramForm.js';

export function ProgramProfile({
  access,
  focusToken,
  loadClients,
  loadOwners,
  onArchive,
  onSave,
  onStatus,
  program,
  sessionKey,
  writesLocked,
}: {
  access: TrainingAccess;
  focusToken: number;
  loadClients: LoadTrainingOptions;
  loadOwners: LoadTrainingOptions;
  onArchive: () => void;
  onSave: (values: ProgramFormValues) => Promise<boolean>;
  onStatus: (status: TrainingProgramStatus) => void;
  program: TrainingProgramSummary;
  sessionKey: number;
  writesLocked: boolean;
}) {
  const { formatDate, formatDateTime, t } = useI18n();
  const heading = useRef<HTMLHeadingElement>(null);
  const [editing, setEditing] = useState<ProgramFormValues | null>(null);

  useEffect(() => {
    if (focusToken > 0) heading.current?.focus();
  }, [focusToken]);

  const editable = programEditable(program);
  const statusActions =
    access.changeProgramStatus && editable ? nextProgramStatuses(program.status) : [];
  const canArchive = access.archiveProgram && program.status === 'PROGRAM_CLOSED';

  return (
    <article aria-labelledby="training-program-title" className="training-profile">
      <header className="training-profile__heading">
        <p className="training-profile__reference">{program.reference}</p>
        <h2
          className="training-profile__title"
          id="training-program-title"
          ref={heading}
          tabIndex={-1}
        >
          {program.name}
        </h2>
        <div className="training-profile__badges">
          <StatusBadge tone={programStatusTone(program.status)}>
            {t(`training.status.program.${program.status}`)}
          </StatusBadge>
        </div>
      </header>

      {!programAcceptsOperations(program) ? (
        <InlineMessage
          title={
            program.status === 'PROGRAM_CLOSED'
              ? t('training.profile.closedTitle')
              : t('training.profile.archivedTitle')
          }
          tone="info"
        >
          <p className="training-message__text">
            {program.status === 'PROGRAM_CLOSED'
              ? t('training.profile.closedBody')
              : t('training.profile.archivedBody')}
          </p>
        </InlineMessage>
      ) : null}

      <dl className="training-facts">
        <div>
          <dt>{t('training.profile.owner')}</dt>
          <dd>{program.ownerDisplayName ?? t('training.common.unassigned')}</dd>
        </div>
        {access.pickClients ? (
          <div>
            <dt>{t('training.profile.client')}</dt>
            <dd>{program.clientDisplayName ?? t('training.programs.noClient')}</dd>
          </div>
        ) : null}
        <div>
          <dt>{t('training.profile.plannedStart')}</dt>
          <dd>
            {program.plannedStartDate
              ? formatDate(program.plannedStartDate)
              : t('training.common.notSet')}
          </dd>
        </div>
        <div>
          <dt>{t('training.profile.plannedEnd')}</dt>
          <dd>
            {program.plannedEndDate
              ? formatDate(program.plannedEndDate)
              : t('training.common.notSet')}
          </dd>
        </div>
        <div>
          <dt>{t('training.profile.targetAudience')}</dt>
          <dd>{program.targetAudience ?? t('training.common.notSet')}</dd>
        </div>
        <div>
          <dt>{t('training.profile.updated')}</dt>
          <dd>
            <time dateTime={program.updatedAt}>{formatDateTime(program.updatedAt)}</time>
          </dd>
        </div>
      </dl>
      {program.description ? (
        <div className="training-profile__description">
          <h3 className="training-section__subtitle">{t('training.profile.description')}</h3>
          <p>{program.description}</p>
        </div>
      ) : null}

      {statusActions.length > 0 || canArchive || (access.editProgram && editable) ? (
        <div aria-label={t('training.profile.actions')} className="training-actions" role="group">
          {statusActions.map((status) => (
            <Button
              disabled={writesLocked}
              key={status}
              onClick={() => onStatus(status)}
              size="compact"
              variant={status === 'PROGRAM_CLOSED' ? 'secondary' : 'primary'}
            >
              {t(`training.profile.statusAction.${status}`)}
            </Button>
          ))}
          {canArchive ? (
            <Button disabled={writesLocked} onClick={onArchive} size="compact" variant="danger">
              {t('training.profile.archive')}
            </Button>
          ) : null}
          {access.editProgram && editable && !editing ? (
            <Button
              disabled={writesLocked}
              onClick={() => setEditing(programFormFrom(program))}
              size="compact"
              variant="secondary"
            >
              {t('training.profile.edit')}
            </Button>
          ) : null}
        </div>
      ) : null}

      {editing ? (
        <section aria-labelledby="training-program-edit" className="training-section">
          <h3 className="training-section__subtitle" id="training-program-edit">
            {t('training.profile.editTitle')}
          </h3>
          <ProgramForm
            access={access}
            loadClients={loadClients}
            loadOwners={loadOwners}
            mode="edit"
            onCancel={() => setEditing(null)}
            onChange={setEditing}
            onSubmit={() => {
              void onSave(editing).then((saved) => {
                if (saved) setEditing(null);
              });
            }}
            sessionKey={sessionKey}
            values={editing}
            writesLocked={writesLocked}
          />
        </section>
      ) : null}
    </article>
  );
}
