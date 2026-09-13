import type { TaskCreateRequest, TaskPriority } from '@hire-me/contracts';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';

import { useI18n } from '../i18n/index.js';
import { Button, Select, TextArea, TextField } from '../ui/index.js';
import { localInputToIso } from './task-datetime.js';
import { taskContextKindLabelKey, taskPriorityLabelKey } from './task-labels.js';
import {
  TASK_CONTEXT_FIELD,
  TASK_PRIORITIES,
  type LoadOptions,
  type TaskAccess,
  type TaskContextKind,
} from './task-state.js';
import { SearchPicker } from './TaskPickers.js';

export interface TaskCreateValues {
  assigneeUserId: string | null;
  context: NonNullable<TaskCreateRequest['context']>;
  description: string | null;
  dueAt: string | null;
  priority: TaskPriority;
  title: string;
}

function text(form: HTMLFormElement, name: string): string {
  const entry = new FormData(form).get(name);
  return typeof entry === 'string' ? entry.trim() : '';
}

/**
 * Create a task owned by the current user, exactly as before, with people and
 * linked records chosen by name. The assignee picker is offered only to actors
 * who may assign; linked-record kinds only where the actor can read that list.
 */
export function TaskCreateForm({
  access,
  busy,
  loadOptions,
  onCancel,
  onCreate,
  optionsKey,
  submitting,
}: {
  access: TaskAccess;
  /** True while any Task write owns the global lock. */
  busy: boolean;
  loadOptions: LoadOptions;
  onCancel: () => void;
  onCreate: (values: TaskCreateValues) => Promise<boolean>;
  optionsKey: string;
  /** True while this form's own create is the write in flight. */
  submitting: boolean;
}) {
  const { t } = useI18n();
  const headingId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const [kind, setKind] = useState<TaskContextKind | ''>('');
  const [missionId, setMissionId] = useState<string | null>(null);

  useEffect(() => {
    formRef.current?.querySelector<HTMLInputElement>('input[name="title"]')?.focus();
  }, []);

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const context: TaskCreateValues['context'] = {};
    const recordId = text(form, 'contextRecordId');
    if (kind && recordId) context[TASK_CONTEXT_FIELD[kind]] = recordId;
    const missionCandidateId = text(form, 'missionCandidateId');
    if (kind === 'mission' && recordId && missionCandidateId) {
      context.missionCandidateId = missionCandidateId;
    }
    void onCreate({
      assigneeUserId: text(form, 'assigneeUserId') || null,
      context,
      description: text(form, 'description') || null,
      dueAt: localInputToIso(text(form, 'dueAt')),
      priority: (text(form, 'priority') || 'NORMAL') as TaskPriority,
      title: text(form, 'title'),
    });
  }

  return (
    <section aria-labelledby={headingId} className="tasks__create">
      <h2 id={headingId}>{t('task.actions.newTask')}</h2>
      <form
        aria-labelledby={headingId}
        className="tasks__form-grid"
        onSubmit={submit}
        ref={formRef}
      >
        <TextField label={t('task.fields.title')} maxLength={200} name="title" required />
        <Select defaultValue="NORMAL" label={t('task.fields.priority')} name="priority">
          {TASK_PRIORITIES.map((priority) => (
            <option key={priority} value={priority}>
              {t(taskPriorityLabelKey(priority))}
            </option>
          ))}
        </Select>
        <TextArea
          className="tasks__span"
          label={t('task.fields.description')}
          maxLength={4000}
          name="description"
        />
        <TextField label={t('task.fields.dueAt')} name="dueAt" type="datetime-local" />
        {access.canAssign ? (
          <SearchPicker
            hint={t('task.picker.searchPeopleHint')}
            label={t('task.fields.assignee')}
            loadOptions={loadOptions}
            name="assigneeUserId"
            source={{ purpose: 'assignee', type: 'person' }}
            sourceKey={`${optionsKey}:create-assignee`}
          />
        ) : null}
        {access.contextKinds.length ? (
          <div className="tasks__span task-context-picker">
            <Select
              label={t('task.context.kind')}
              onChange={(event) => {
                setKind(event.target.value as TaskContextKind | '');
                setMissionId(null);
              }}
              value={kind}
            >
              <option value="">{t('task.context.none')}</option>
              {access.contextKinds.map((entry) => (
                <option key={entry} value={entry}>
                  {t(taskContextKindLabelKey(entry))}
                </option>
              ))}
            </Select>
            {kind ? (
              <SearchPicker
                hint={t('task.picker.searchRecordsHint')}
                key={kind}
                label={t(taskContextKindLabelKey(kind))}
                loadOptions={loadOptions}
                name="contextRecordId"
                onChange={(option) =>
                  setMissionId(kind === 'mission' ? (option?.id ?? null) : null)
                }
                source={{ kind, type: 'record' }}
                sourceKey={`${optionsKey}:create-context:${kind}`}
              />
            ) : null}
            {kind === 'mission' && missionId && access.canViewMissionCandidates ? (
              <SearchPicker
                hint={t('task.picker.searchRecordsHint')}
                key={missionId}
                label={t('task.context.fields.missionCandidateId')}
                loadOptions={loadOptions}
                name="missionCandidateId"
                source={{ missionId, type: 'missionCandidate' }}
                sourceKey={`${optionsKey}:create-mission-candidate:${missionId}`}
              />
            ) : null}
          </div>
        ) : null}
        <div className="tasks__form-actions tasks__span">
          <Button
            disabled={busy}
            loading={submitting}
            loadingLabel={t('task.actions.create')}
            type="submit"
          >
            {t('task.actions.create')}
          </Button>
          <Button disabled={submitting} onClick={onCancel} variant="quiet">
            {t('task.actions.cancel')}
          </Button>
        </div>
      </form>
    </section>
  );
}
