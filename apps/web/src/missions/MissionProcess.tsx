import type { MissionCandidateState, MissionCandidateSummary } from '@hire-me/contracts';
import { useRef, useState, type FormEvent, type ReactNode, type RefObject } from 'react';

import { useI18n } from '../i18n/index.js';
import { useStackedMasterDetailReveal } from '../layout/index.js';
import { Button, InlineMessage, Select, StatusBadge, TextField } from '../ui/index.js';
import type { MissionAccess } from './mission-access.js';
import {
  canPresentInState,
  isProcessWritable,
  nextProcessStates,
  processStateLabelKey,
  processStateTone,
} from './mission-labels.js';
import type { PickerOption } from './mission-state.js';

export interface ProcessTransferValues {
  responsibleRecruiterUserId: string;
  reason: string;
}

export interface MissionProcessModel {
  onClose: () => void;
  onMove: (state: MissionCandidateState) => void;
  onPresent: () => void;
  onTransfer: (values: ProcessTransferValues) => Promise<boolean>;
}

/** One opened candidate process: its stage, responsibility, and nested records. */
export function MissionProcess({
  access,
  children,
  layoutContainerRef,
  missionWritable,
  model,
  process,
  processDetailRevealToken,
  recruiters,
  sideBySideMinRem,
  writesLocked,
}: {
  access: MissionAccess;
  children: ReactNode;
  layoutContainerRef: RefObject<HTMLElement | null>;
  missionWritable: boolean;
  model: MissionProcessModel;
  process: MissionCandidateSummary;
  processDetailRevealToken: number;
  /** Active recruiters on the mission; null when the team cannot be read. */
  recruiters: PickerOption[] | null;
  sideBySideMinRem: number;
  writesLocked: boolean;
}) {
  const { t } = useI18n();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const editable = missionWritable && isProcessWritable(process);
  const transitions = nextProcessStates(process.state);
  const name = process.candidate.displayName;
  const titleId = `mission-process-${process.id}`;

  useStackedMasterDetailReveal({
    containerRef: layoutContainerRef,
    ready: true,
    revealToken: processDetailRevealToken,
    sideBySideMinRem,
    targetRef: headingRef,
  });

  return (
    <section aria-labelledby={titleId} className="mission-section mission-process">
      <div className="mission-process__heading">
        <h3
          className="mission-section__title mission-process__title"
          id={titleId}
          ref={headingRef}
          tabIndex={-1}
        >
          {name}
        </h3>
        <StatusBadge tone={processStateTone(process.state)}>
          {t(processStateLabelKey(process.state))}
        </StatusBadge>
        <Button onClick={model.onClose} size="compact" variant="quiet">
          {t('missions.process.close')}
        </Button>
      </div>
      <p className="mission-muted">
        {t('missions.process.responsible', { name: process.responsibleRecruiterDisplayName })}
      </p>
      {missionWritable && !isProcessWritable(process) ? (
        <p className="mission-muted">{t('missions.process.terminalNotice')}</p>
      ) : null}

      {editable && access.canTransitionProcesses ? (
        <div className="mission-group">
          <h4 className="mission-subtitle">{t('missions.process.stageTitle')}</h4>
          {transitions.length > 0 ? (
            <div className="mission-actions">
              {transitions.map((state) => (
                <Button
                  disabled={writesLocked}
                  key={state}
                  onClick={() => model.onMove(state)}
                  size="compact"
                  variant="secondary"
                >
                  {t('missions.process.moveTo', { state: t(processStateLabelKey(state)) })}
                </Button>
              ))}
            </div>
          ) : (
            <p className="mission-muted">{t('missions.process.noTransitions')}</p>
          )}
        </div>
      ) : null}

      {editable &&
      access.canPresentProcesses &&
      !process.clientVisible &&
      canPresentInState(process.state) ? (
        <div className="mission-actions">
          <Button disabled={writesLocked} onClick={model.onPresent} variant="secondary">
            {t('missions.process.present')}
          </Button>
        </div>
      ) : null}

      {editable && access.canTransferProcesses ? (
        <TransferForm
          model={model}
          process={process}
          recruiters={recruiters}
          writesLocked={writesLocked}
        />
      ) : null}

      {children}
    </section>
  );
}

function TransferForm({
  model,
  process,
  recruiters,
  writesLocked,
}: {
  model: MissionProcessModel;
  process: MissionCandidateSummary;
  recruiters: PickerOption[] | null;
  writesLocked: boolean;
}) {
  const { t } = useI18n();
  const [recruiterId, setRecruiterId] = useState('');
  const title = t('missions.process.transfer.title');
  const candidates =
    recruiters?.filter((recruiter) => recruiter.id !== process.responsibleRecruiterUserId) ?? null;

  if (!candidates || candidates.length === 0) {
    return (
      <InlineMessage title={title} tone="info">
        <p className="mission-message__text">
          {candidates
            ? t('missions.process.transfer.noRecruiters')
            : t('missions.process.transfer.unavailable')}
        </p>
      </InlineMessage>
    );
  }

  const selected = candidates.some((entry) => entry.id === recruiterId) ? recruiterId : '';

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget;
    const reason = new FormData(form).get('reason');
    if (!selected || typeof reason !== 'string' || reason.trim() === '') {
      return;
    }
    if (await model.onTransfer({ responsibleRecruiterUserId: selected, reason: reason.trim() })) {
      form.reset();
      setRecruiterId('');
    }
  }

  return (
    <form
      aria-label={title}
      className="mission-form"
      onSubmit={(event) => void handleSubmit(event)}
    >
      <h4 className="mission-subtitle">{title}</h4>
      <div className="mission-form__grid">
        <Select
          label={t('missions.process.transfer.recruiter')}
          name="transferRecruiter"
          onChange={(event) => setRecruiterId(event.currentTarget.value)}
          required
          value={selected}
        >
          <option value="">{t('missions.picker.choose')}</option>
          {candidates.map((recruiter) => (
            <option key={recruiter.id} value={recruiter.id}>
              {recruiter.label}
            </option>
          ))}
        </Select>
        <TextField
          label={t('missions.process.transfer.reason')}
          maxLength={1000}
          name="reason"
          required
        />
      </div>
      <div className="mission-actions">
        <Button disabled={writesLocked || !selected} type="submit" variant="primary">
          {t('missions.process.transfer.submit')}
        </Button>
      </div>
    </form>
  );
}
