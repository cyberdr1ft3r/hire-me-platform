import type { MissionCandidateSummary, MissionSummary } from '@hire-me/contracts';
import { useState, type FormEvent } from 'react';

import { useI18n } from '../i18n/index.js';
import { Button, InlineMessage, Select, StatusBadge, TextArea, TextField } from '../ui/index.js';
import { ScrollTable, SectionStatus } from './MissionBits.js';
import { MissionPicker, type LoadPickerOptions } from './MissionPicker.js';
import type { MissionAccess } from './mission-access.js';
import {
  MISSION_PRIORITIES,
  missionPriorityLabelKey,
  missionPriorityTone,
  processStateLabelKey,
  processStateTone,
} from './mission-labels.js';
import type { PickerOption, SectionState } from './mission-state.js';

type Priority = MissionSummary['priority'];

export interface ProcessLinkValues {
  candidate: PickerOption;
  responsibleRecruiterUserId: string;
  priority: Priority;
  source: string;
  sourceContext: string;
  internalNotes: string;
}

export interface MissionPipelineModel {
  activeProcessId: string | null;
  /** Null when the actor cannot read the candidate directory. */
  loadCandidateOptions: LoadPickerOptions | null;
  onLink: (values: ProcessLinkValues) => Promise<boolean>;
  onOpen: (processId: string) => void;
  onRetry: () => void;
  processes: SectionState<MissionCandidateSummary[]>;
  /** Active recruiters on the mission; null when the team cannot be read. */
  recruiters: PickerOption[] | null;
}

export function MissionCandidatePipeline({
  access,
  model,
  sourceKey,
  writable,
  writesLocked,
}: {
  access: MissionAccess;
  model: MissionPipelineModel;
  sourceKey: string;
  writable: boolean;
  writesLocked: boolean;
}) {
  const { t } = useI18n();
  const title = t('missions.pipeline.title');

  return (
    <section aria-label={t('missions.pipeline.region')} className="mission-section">
      <h3 className="mission-section__title">{title}</h3>
      <SectionStatus onRetry={model.onRetry} section={model.processes}>
        {(processes) =>
          processes.length === 0 ? (
            <p className="mission-muted">{t('missions.pipeline.empty')}</p>
          ) : (
            <ScrollTable label={title}>
              <table className="mission-table">
                <thead>
                  <tr>
                    <th scope="col">{t('missions.pipeline.columns.candidate')}</th>
                    <th scope="col">{t('missions.pipeline.columns.state')}</th>
                    <th scope="col">{t('missions.pipeline.columns.responsible')}</th>
                    <th scope="col">{t('missions.pipeline.columns.priority')}</th>
                    <th scope="col">{t('missions.pipeline.columns.visibility')}</th>
                    <th scope="col">{t('missions.pipeline.columns.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {processes.map((process) => {
                    const open = process.id === model.activeProcessId;
                    return (
                      <tr aria-current={open ? 'true' : undefined} data-selected={open} key={process.id}>
                        <th scope="row">{process.candidate.displayName}</th>
                        <td>
                          <StatusBadge tone={processStateTone(process.state)}>
                            {t(processStateLabelKey(process.state))}
                          </StatusBadge>
                        </td>
                        <td>{process.responsibleRecruiterDisplayName}</td>
                        <td>
                          <StatusBadge tone={missionPriorityTone(process.priority)}>
                            {t(missionPriorityLabelKey(process.priority))}
                          </StatusBadge>
                        </td>
                        <td>
                          <span className="mission-badges">
                            <span>
                              {process.clientVisible
                                ? t('missions.pipeline.clientVisible')
                                : t('missions.pipeline.internalOnly')}
                            </span>
                            {process.placementConfirmedAt ? (
                              <StatusBadge tone="success">
                                {t('missions.pipeline.placementConfirmed')}
                              </StatusBadge>
                            ) : null}
                          </span>
                        </td>
                        <td>
                          <Button
                            aria-expanded={open}
                            aria-label={t('missions.pipeline.openLabel', {
                              name: process.candidate.displayName,
                            })}
                            onClick={() => model.onOpen(process.id)}
                            size="compact"
                            variant={open ? 'primary' : 'secondary'}
                          >
                            {t('missions.pipeline.open')}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </ScrollTable>
          )
        }
      </SectionStatus>
      {access.canCreateProcesses && writable ? (
        <ProcessLinkForm
          model={model}
          sourceKey={sourceKey}
          writesLocked={writesLocked}
        />
      ) : null}
    </section>
  );
}

function ProcessLinkForm({
  model,
  sourceKey,
  writesLocked,
}: {
  model: MissionPipelineModel;
  sourceKey: string;
  writesLocked: boolean;
}) {
  const { t } = useI18n();
  const [candidate, setCandidate] = useState<PickerOption | null>(null);
  const [recruiterId, setRecruiterId] = useState('');
  const [priority, setPriority] = useState<Priority>('NORMAL');
  const title = t('missions.pipeline.link.title');

  if (!model.loadCandidateOptions || !model.recruiters || model.recruiters.length === 0) {
    const reason = !model.loadCandidateOptions
      ? t('missions.pipeline.link.candidatesUnavailable')
      : !model.recruiters
        ? t('missions.pipeline.link.assignmentsUnavailable')
        : t('missions.pipeline.link.noRecruiters');
    return (
      <InlineMessage title={title} tone="info">
        <p className="mission-message__text">{reason}</p>
      </InlineMessage>
    );
  }

  const recruiters = model.recruiters;
  const responsible = recruiters.some((entry) => entry.id === recruiterId) ? recruiterId : '';

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!candidate || !responsible) {
      return;
    }
    const form = event.currentTarget;
    const data = new FormData(form);
    const text = (name: string) => {
      const value = data.get(name);
      return typeof value === 'string' ? value : '';
    };
    const linked = await model.onLink({
      candidate,
      responsibleRecruiterUserId: responsible,
      priority,
      source: text('source'),
      sourceContext: text('sourceContext'),
      internalNotes: text('internalNotes'),
    });
    if (linked) {
      form.reset();
      setCandidate(null);
      setPriority('NORMAL');
    }
  }

  return (
    <form aria-label={title} className="mission-form" onSubmit={(event) => void handleSubmit(event)}>
      <h4 className="mission-subtitle">{title}</h4>
      <MissionPicker
        hint={t('missions.pipeline.link.candidateHint')}
        label={t('missions.pipeline.link.candidate')}
        loadOptions={model.loadCandidateOptions}
        onChange={setCandidate}
        required
        sourceKey={`${sourceKey}:link-candidate`}
        value={candidate}
      />
      <div className="mission-form__grid">
        <Select
          hint={t('missions.pipeline.link.responsibleHint')}
          label={t('missions.pipeline.link.responsible')}
          name="responsibleRecruiter"
          onChange={(event) => setRecruiterId(event.currentTarget.value)}
          required
          value={responsible}
        >
          <option value="">{t('missions.picker.choose')}</option>
          {recruiters.map((recruiter) => (
            <option key={recruiter.id} value={recruiter.id}>
              {recruiter.detail ? `${recruiter.label} · ${recruiter.detail}` : recruiter.label}
            </option>
          ))}
        </Select>
        <Select
          label={t('missions.pipeline.link.priority')}
          name="priority"
          onChange={(event) =>
            setPriority(
              MISSION_PRIORITIES.find((entry) => entry === event.currentTarget.value) ?? priority,
            )
          }
          value={priority}
        >
          {MISSION_PRIORITIES.map((entry) => (
            <option key={entry} value={entry}>
              {t(missionPriorityLabelKey(entry))}
            </option>
          ))}
        </Select>
        <TextField label={t('missions.pipeline.link.source')} maxLength={120} name="source" />
      </div>
      <TextArea
        label={t('missions.pipeline.link.sourceContext')}
        maxLength={1000}
        name="sourceContext"
        rows={3}
      />
      <TextArea
        label={t('missions.pipeline.link.internalNotes')}
        maxLength={2000}
        name="internalNotes"
        rows={3}
      />
      <div className="mission-actions">
        <Button disabled={writesLocked || !candidate || !responsible} type="submit" variant="primary">
          {t('missions.pipeline.link.submit')}
        </Button>
      </div>
    </form>
  );
}
