import type { Notification, TaskDetail, TaskStatus } from '@hire-me/contracts';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';

import { useI18n } from '../i18n/index.js';
import {
  Button,
  EmptyState,
  InlineMessage,
  PageHeader,
  Select,
  Skeleton,
  StatusBadge,
  TextArea,
  TextField,
} from '../ui/index.js';
import {
  classifyDueDate,
  taskPriorityLabelKey,
  taskPriorityTone,
  taskStatusLabelKey,
  taskStatusTone,
} from './task-labels.js';
import {
  ALLOWED_TASK_TRANSITIONS,
  TASK_PRIORITIES,
  TASK_STATUSES,
  hasTaskFilters,
  type TaskAccess,
  type TaskDetailState,
  type TaskFilters,
  type TaskListState,
} from './task-state.js';
import './task.css';

export interface TaskWorkspaceProps {
  access: TaskAccess;
  appliedFilters: TaskFilters;
  detail: TaskDetailState;
  feedback: { message: string; tone: 'success' | 'danger' } | null;
  filters: TaskFilters;
  list: TaskListState;
  notifications: Notification[];
  notificationTotal: number;
  notificationStatus: '' | 'UNREAD' | 'READ';
  pending: string | null;
  selectedId: string | null;
  onAddAssignment: (form: HTMLFormElement) => void;
  onAddComment: (form: HTMLFormElement) => void;
  onAddReminder: (form: HTMLFormElement) => void;
  onArchive: (reason: string) => void;
  onChangeOwner: (form: HTMLFormElement) => void;
  onCreate: (form: HTMLFormElement) => Promise<boolean>;
  onFiltersChange: (filters: TaskFilters) => void;
  onNotificationArchive: (id: string) => void;
  onNotificationFilter: (status: '' | 'UNREAD' | 'READ') => void;
  onNotificationRead: (id: string) => void;
  onNotificationsReadAll: () => void;
  onProcessReminders: () => void;
  onResetFilters: () => void;
  onRetryDetail: () => void;
  onRetryList: () => void;
  onSearch: () => void;
  onSelect: (id: string) => void;
  onTransition: (status: TaskStatus, reason: string | null) => void;
  onUpdate: (form: HTMLFormElement) => Promise<boolean>;
}

function DueLabel({ dueAt, status }: Pick<TaskDetail, 'dueAt' | 'status'>) {
  const { formatDateTime, t } = useI18n();
  const state = classifyDueDate(dueAt, status);
  if (!dueAt) return <span className="tasks__due">{t('task.values.dueNone')}</span>;
  const date = formatDateTime(dueAt);
  const key =
    state === 'overdue'
      ? 'task.values.dueOverdue'
      : state === 'today'
        ? 'task.values.dueToday'
        : 'task.values.dueFuture';
  return (
    <span className="tasks__due" data-due={state}>
      {t(key, { date })}
    </span>
  );
}

function FormActions({
  busy,
  cancel,
  label,
}: {
  busy: boolean;
  cancel?: () => void;
  label: string;
}) {
  const { t } = useI18n();
  return (
    <div className="tasks__form-actions">
      <Button loading={busy} loadingLabel={label} type="submit">
        {label}
      </Button>
      {cancel ? (
        <Button disabled={busy} onClick={cancel} variant="quiet">
          {t('task.actions.cancel')}
        </Button>
      ) : null}
    </div>
  );
}

function formValue(form: HTMLFormElement, name: string): string {
  const entry = new FormData(form).get(name);
  return typeof entry === 'string' ? entry.trim() : '';
}

export function TaskWorkspace(props: TaskWorkspaceProps) {
  const { formatDateTime, t } = useI18n();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [transitionStatus, setTransitionStatus] = useState<TaskStatus | null>(null);
  const createId = useId();
  const wasCreating = useRef(false);
  const busy = props.pending !== null;

  useEffect(() => {
    setEditing(false);
    setTransitionStatus(null);
  }, [props.selectedId]);
  useEffect(() => {
    if (creating) {
      document
        .getElementById(createId)
        ?.querySelector<HTMLInputElement>('input[name="title"]')
        ?.focus();
    } else if (wasCreating.current) {
      document.querySelector<HTMLButtonElement>('[data-task-create-toggle]')?.focus();
    }
    wasCreating.current = creating;
  }, [createId, creating]);
  function closeCreate() {
    setCreating(false);
  }

  async function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (await props.onCreate(event.currentTarget)) closeCreate();
  }

  return (
    <div className="tasks" data-density="internal-standard">
      <PageHeader
        primaryAction={
          <div className="tasks__header-actions">
            {props.access.canManageReminders ? (
              <Button
                disabled={busy}
                onClick={props.onProcessReminders}
                size="compact"
                variant="secondary"
              >
                {t('task.actions.processReminders')}
              </Button>
            ) : null}
            {props.access.canCreate ? (
              <Button
                aria-controls={createId}
                aria-expanded={creating}
                disabled={busy || creating}
                onClick={() => setCreating(true)}
                data-task-create-toggle=""
                size="compact"
              >
                {t('task.actions.newTask')}
              </Button>
            ) : null}
          </div>
        }
        description={t('task.header.description')}
        title={t('task.header.title')}
      />

      {props.feedback ? (
        <InlineMessage
          announce
          tone={props.feedback.tone}
          title={
            props.feedback.tone === 'success'
              ? t('task.feedback.successTitle')
              : t('task.feedback.errorTitle')
          }
        >
          {props.feedback.message}
        </InlineMessage>
      ) : null}

      {creating ? (
        <section className="tasks__create" id={createId} aria-labelledby={`${createId}-title`}>
          <h2 id={`${createId}-title`}>{t('task.actions.newTask')}</h2>
          <form className="tasks__form-grid" onSubmit={(event) => void submitCreate(event)}>
            <TextField label={t('task.fields.title')} name="title" required />
            <Select defaultValue="NORMAL" label={t('task.fields.priority')} name="priority">
              {TASK_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {t(taskPriorityLabelKey(p))}
                </option>
              ))}
            </Select>
            <TextArea
              className="tasks__span"
              label={t('task.fields.description')}
              name="description"
            />
            <TextField label={t('task.fields.dueAt')} name="dueAt" type="datetime-local" />
            <TextField label={t('task.fields.assignee')} name="assigneeUserId" />
            <TextField label={t('task.fields.mission')} name="recruitmentMissionId" />
            <TextField label={t('task.fields.missionCandidate')} name="missionCandidateId" />
            <FormActions
              busy={props.pending === 'create'}
              cancel={closeCreate}
              label={t('task.actions.create')}
            />
          </form>
        </section>
      ) : null}

      <section
        className="tasks__filters"
        aria-labelledby="task-filter-title"
        data-density="internal-compact"
      >
        <div>
          <h2 id="task-filter-title">{t('task.filters.title')}</h2>
          <p>{t('task.filters.description')}</p>
        </div>
        <form
          className="tasks__filter-grid"
          onSubmit={(event) => {
            event.preventDefault();
            props.onSearch();
          }}
        >
          <TextField
            label={t('task.fields.search')}
            onChange={(e) => props.onFiltersChange({ ...props.filters, search: e.target.value })}
            value={props.filters.search}
          />
          <Select
            label={t('task.fields.status')}
            onChange={(e) =>
              props.onFiltersChange({
                ...props.filters,
                status: e.target.value as TaskFilters['status'],
              })
            }
            value={props.filters.status}
          >
            <option value="">{t('task.filters.anyStatus')}</option>
            {TASK_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(taskStatusLabelKey(s))}
              </option>
            ))}
          </Select>
          <Select
            label={t('task.fields.priority')}
            onChange={(e) =>
              props.onFiltersChange({
                ...props.filters,
                priority: e.target.value as TaskFilters['priority'],
              })
            }
            value={props.filters.priority}
          >
            <option value="">{t('task.filters.anyPriority')}</option>
            {TASK_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {t(taskPriorityLabelKey(p))}
              </option>
            ))}
          </Select>
          <TextField
            label={t('task.fields.owner')}
            onChange={(e) =>
              props.onFiltersChange({ ...props.filters, ownerUserId: e.target.value })
            }
            value={props.filters.ownerUserId}
          />
          <TextField
            label={t('task.fields.assignee')}
            onChange={(e) =>
              props.onFiltersChange({ ...props.filters, assigneeUserId: e.target.value })
            }
            value={props.filters.assigneeUserId}
          />
          <div className="tasks__filter-actions">
            <Button size="compact" type="submit">
              {t('task.actions.applyFilters')}
            </Button>
            {hasTaskFilters(props.appliedFilters) ? (
              <Button onClick={props.onResetFilters} size="compact" variant="quiet">
                {t('task.actions.reset')}
              </Button>
            ) : null}
          </div>
        </form>
      </section>

      <div className="tasks__workspace">
        <section className="tasks__queue" aria-labelledby="task-queue-title">
          <div className="tasks__section-heading">
            <h2 id="task-queue-title">{t('task.list.title')}</h2>
            {props.list.status === 'ready' ? (
              <span>
                {t('task.list.showing', {
                  shown: props.list.tasks.length,
                  total: props.list.total,
                })}
              </span>
            ) : null}
          </div>
          {props.list.status === 'loading' ? (
            <Skeleton label={t('task.states.loadingList')} />
          ) : props.list.status === 'error' ? (
            <EmptyState
              action={<Button onClick={props.onRetryList}>{t('task.actions.retry')}</Button>}
              title={t('task.states.listError')}
            >
              {t('task.feedback.failed')}
            </EmptyState>
          ) : props.list.tasks.length === 0 ? (
            <EmptyState
              action={
                hasTaskFilters(props.appliedFilters) ? (
                  <Button onClick={props.onResetFilters}>{t('task.actions.reset')}</Button>
                ) : undefined
              }
              title={
                hasTaskFilters(props.appliedFilters)
                  ? t('task.list.filteredEmpty')
                  : t('task.list.empty')
              }
            >
              {t('task.filters.description')}
            </EmptyState>
          ) : (
            <ul aria-label={t('task.list.region')} className="tasks__queue-list">
              {props.list.tasks.map((task) => (
                <li
                  key={task.id}
                  className="tasks__queue-item"
                  data-selected={props.selectedId === task.id || undefined}
                >
                  <button
                    aria-current={props.selectedId === task.id ? 'true' : undefined}
                    className="tasks__queue-button"
                    onClick={() => props.onSelect(task.id)}
                    type="button"
                  >
                    <span className="tasks__queue-title">{task.title}</span>
                    <span className="tasks__badges">
                      <StatusBadge tone={taskStatusTone(task.status)}>
                        {t(taskStatusLabelKey(task.status))}
                      </StatusBadge>
                      <StatusBadge tone={taskPriorityTone(task.priority)}>
                        {t(taskPriorityLabelKey(task.priority))}
                      </StatusBadge>
                    </span>
                    <span>{task.ownerDisplayName ?? t('task.detail.notRecorded')}</span>
                    <span>{t('task.list.assignees', { count: task.assigneeUserIds.length })}</span>
                    <DueLabel dueAt={task.dueAt} status={task.status} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="tasks__detail" aria-label={t('task.detail.metadata')}>
          {props.detail.status === 'idle' ? (
            <EmptyState title={t('task.detail.selectTitle')}>
              {t('task.detail.selectBody')}
            </EmptyState>
          ) : props.detail.status === 'loading' ? (
            <Skeleton label={t('task.states.loadingDetail')} />
          ) : props.detail.status === 'error' ? (
            <EmptyState
              action={<Button onClick={props.onRetryDetail}>{t('task.actions.retry')}</Button>}
              title={t('task.states.detailError')}
            >
              {t('task.feedback.failed')}
            </EmptyState>
          ) : (
            (() => {
              const task = props.detail.task;
              const targets = ALLOWED_TASK_TRANSITIONS[task.status] ?? [];
              const selectedTransition =
                transitionStatus && targets.includes(transitionStatus)
                  ? transitionStatus
                  : targets[0];
              const transitionReasonRequired =
                selectedTransition === 'BLOCKED' ||
                (selectedTransition === 'OPEN' &&
                  (task.status === 'COMPLETED' || task.status === 'CANCELED'));
              const context = Object.entries(task.context).filter(
                (entry): entry is [string, string] => Boolean(entry[1]),
              );
              return (
                <div className="tasks__record" key={task.id}>
                  <header className="tasks__record-header">
                    <div>
                      <h2>{task.title}</h2>
                      <div className="tasks__badges">
                        <StatusBadge tone={taskStatusTone(task.status)}>
                          {t(taskStatusLabelKey(task.status))}
                        </StatusBadge>
                        <StatusBadge tone={taskPriorityTone(task.priority)}>
                          {t(taskPriorityLabelKey(task.priority))}
                        </StatusBadge>
                      </div>
                    </div>
                    {props.access.canUpdate &&
                    task.status !== 'ARCHIVED' &&
                    task.status !== 'COMPLETED' &&
                    task.status !== 'CANCELED' ? (
                      <Button
                        disabled={busy}
                        onClick={() => setEditing(!editing)}
                        size="compact"
                        variant="secondary"
                      >
                        {t('task.actions.edit')}
                      </Button>
                    ) : null}
                  </header>
                  <DueLabel dueAt={task.dueAt} status={task.status} />
                  <dl className="tasks__metadata">
                    <div>
                      <dt>{t('task.fields.owner')}</dt>
                      <dd>{task.ownerDisplayName ?? t('task.detail.notRecorded')}</dd>
                    </div>
                    <div>
                      <dt>{t('task.detail.assignments')}</dt>
                      <dd>
                        {task.assignments
                          .filter((a) => a.status === 'ACTIVE')
                          .map((a) => a.userDisplayName)
                          .join(', ') || t('task.detail.notRecorded')}
                      </dd>
                    </div>
                    <div>
                      <dt>{t('task.detail.created')}</dt>
                      <dd>{formatDateTime(task.createdAt)}</dd>
                    </div>
                    <div>
                      <dt>{t('task.detail.updated')}</dt>
                      <dd>{formatDateTime(task.updatedAt)}</dd>
                    </div>
                  </dl>
                  <section>
                    <h3>{t('task.detail.description')}</h3>
                    <p className="tasks__prose">
                      {task.description || t('task.detail.notRecorded')}
                    </p>
                  </section>
                  {context.length ? (
                    <section>
                      <h3>{t('task.detail.context')}</h3>
                      <dl className="tasks__context">
                        {context.map(([key, value]) => (
                          <div key={key}>
                            <dt>{key}</dt>
                            <dd>{value}</dd>
                          </div>
                        ))}
                      </dl>
                    </section>
                  ) : null}

                  {editing ? (
                    <form
                      className="tasks__form-grid tasks__inline-form"
                      onSubmit={(event) => {
                        event.preventDefault();
                        const form = event.currentTarget;
                        void props.onUpdate(form).then((ok) => {
                          if (ok) setEditing(false);
                        });
                      }}
                    >
                      <TextField
                        defaultValue={task.title}
                        label={t('task.fields.title')}
                        name="title"
                        required
                      />
                      <Select
                        defaultValue={task.priority}
                        label={t('task.fields.priority')}
                        name="priority"
                      >
                        {TASK_PRIORITIES.map((p) => (
                          <option key={p} value={p}>
                            {t(taskPriorityLabelKey(p))}
                          </option>
                        ))}
                      </Select>
                      <TextArea
                        className="tasks__span"
                        defaultValue={task.description ?? ''}
                        label={t('task.fields.description')}
                        name="description"
                      />
                      <TextField
                        defaultValue={task.dueAt ? task.dueAt.slice(0, 16) : ''}
                        label={t('task.fields.dueAt')}
                        name="dueAt"
                        type="datetime-local"
                      />
                      <TextField
                        defaultValue={task.timezone ?? ''}
                        label={t('task.fields.timezone')}
                        name="timezone"
                      />
                      <FormActions
                        busy={props.pending === 'update'}
                        cancel={() => setEditing(false)}
                        label={t('task.actions.save')}
                      />
                    </form>
                  ) : null}

                  {props.access.canTransition && targets.length ? (
                    <form
                      className="tasks__compact-form"
                      onSubmit={(event) => {
                        event.preventDefault();
                        const status = formValue(event.currentTarget, 'status') as TaskStatus;
                        const reason = formValue(event.currentTarget, 'reason');
                        props.onTransition(status, reason || null);
                      }}
                    >
                      <Select
                        label={t('task.fields.status')}
                        name="status"
                        onChange={(event) => setTransitionStatus(event.target.value as TaskStatus)}
                        value={selectedTransition}
                      >
                        {targets.map((s) => (
                          <option key={s} value={s}>
                            {t(taskStatusLabelKey(s))}
                          </option>
                        ))}
                      </Select>
                      <TextField
                        hint={
                          transitionReasonRequired ? t('task.validation.reasonRequired') : undefined
                        }
                        label={t('task.fields.reason')}
                        name="reason"
                        required={transitionReasonRequired}
                      />
                      <Button disabled={busy} type="submit">
                        {t('task.actions.transition')}
                      </Button>
                    </form>
                  ) : null}
                  {props.access.canArchive && task.status !== 'ARCHIVED' ? (
                    <form
                      className="tasks__compact-form"
                      onSubmit={(event) => {
                        event.preventDefault();
                        const reason = formValue(event.currentTarget, 'reason');
                        if (reason) props.onArchive(reason);
                      }}
                    >
                      <TextField label={t('task.fields.reason')} name="reason" required />
                      <Button disabled={busy} type="submit" variant="danger">
                        {t('task.actions.archive')}
                      </Button>
                    </form>
                  ) : null}
                  {props.access.canAssign &&
                  task.status !== 'ARCHIVED' &&
                  task.status !== 'COMPLETED' &&
                  task.status !== 'CANCELED' ? (
                    <section>
                      <h3>{t('task.detail.assignments')}</h3>
                      <div className="tasks__operation-grid">
                        <form
                          className="tasks__compact-form"
                          onSubmit={(e) => {
                            e.preventDefault();
                            props.onChangeOwner(e.currentTarget);
                          }}
                        >
                          <TextField label={t('task.fields.owner')} name="ownerUserId" required />
                          <TextField label={t('task.fields.reason')} name="reason" />
                          <Button disabled={busy} type="submit">
                            {t('task.actions.changeOwner')}
                          </Button>
                        </form>
                        <form
                          className="tasks__compact-form"
                          onSubmit={(e) => {
                            e.preventDefault();
                            props.onAddAssignment(e.currentTarget);
                          }}
                        >
                          <TextField label={t('task.fields.assignee')} name="userId" required />
                          <TextField label={t('task.fields.reason')} name="reason" />
                          <Button disabled={busy} type="submit">
                            {t('task.actions.addAssignee')}
                          </Button>
                        </form>
                      </div>
                    </section>
                  ) : null}
                  <section>
                    <h3>{t('task.comments.title')}</h3>
                    {task.comments.length ? (
                      <ol className="tasks__timeline">
                        {task.comments.map((comment) => (
                          <li key={comment.id}>
                            <div>
                              <strong>{comment.authorDisplayName}</strong>
                              <time dateTime={comment.createdAt}>
                                {formatDateTime(comment.createdAt)}
                              </time>
                            </div>
                            <p>{comment.body}</p>
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <p>{t('task.comments.empty')}</p>
                    )}
                    {props.access.canComment &&
                    task.status !== 'ARCHIVED' &&
                    task.status !== 'COMPLETED' &&
                    task.status !== 'CANCELED' ? (
                      <form
                        className="tasks__compact-form"
                        onSubmit={(e) => {
                          e.preventDefault();
                          props.onAddComment(e.currentTarget);
                        }}
                      >
                        <TextArea label={t('task.comments.body')} name="body" required />
                        <TextField
                          hint={t('task.comments.mentionsHint')}
                          label={t('task.comments.mentions')}
                          name="mentionedUserIds"
                        />
                        <Button disabled={busy} type="submit">
                          {t('task.actions.addComment')}
                        </Button>
                      </form>
                    ) : null}
                  </section>
                  <section>
                    <h3>{t('task.reminders.title')}</h3>
                    {task.reminders.length ? (
                      <ul className="tasks__reminders">
                        {task.reminders.map((reminder) => (
                          <li key={reminder.id}>
                            <span>{reminder.recipientDisplayName}</span>
                            <time dateTime={reminder.remindAt}>
                              {formatDateTime(reminder.remindAt)}
                            </time>
                            <StatusBadge>{reminder.status}</StatusBadge>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p>{t('task.reminders.empty')}</p>
                    )}
                    {props.access.canManageReminders && task.status !== 'ARCHIVED' ? (
                      <form
                        className="tasks__compact-form"
                        onSubmit={(e) => {
                          e.preventDefault();
                          props.onAddReminder(e.currentTarget);
                        }}
                      >
                        <TextField
                          label={t('task.reminders.recipient')}
                          name="recipientUserId"
                          required
                        />
                        <TextField
                          label={t('task.reminders.remindAt')}
                          name="remindAt"
                          required
                          type="datetime-local"
                        />
                        <Button disabled={busy} type="submit">
                          {t('task.actions.addReminder')}
                        </Button>
                      </form>
                    ) : null}
                  </section>
                </div>
              );
            })()
          )}
        </section>
      </div>

      {props.access.canViewNotifications ? (
        <section className="tasks__notifications">
          <div className="tasks__section-heading">
            <h2>{t('task.notifications.title')}</h2>
            <span>{props.notificationTotal}</span>
          </div>
          <div className="tasks__filter-actions">
            <Select
              label={t('task.notifications.status')}
              onChange={(event) =>
                props.onNotificationFilter(event.target.value as '' | 'UNREAD' | 'READ')
              }
              value={props.notificationStatus}
            >
              <option value="">{t('task.notifications.anyStatus')}</option>
              <option value="UNREAD">{t('task.notifications.unread')}</option>
              <option value="READ">{t('task.notifications.read')}</option>
            </Select>
            {props.access.canManageNotifications ? (
              <Button
                disabled={busy}
                onClick={props.onNotificationsReadAll}
                size="compact"
                variant="secondary"
              >
                {t('task.actions.markAllRead')}
              </Button>
            ) : null}
          </div>
          {props.notifications.length ? (
            <ul className="tasks__notification-list">
              {props.notifications.map((notification) => (
                <li key={notification.id}>
                  <div>
                    <strong>{notification.title}</strong>
                    <span>{notification.bodySummary}</span>
                  </div>
                  <StatusBadge>{notification.status}</StatusBadge>
                  {notification.status === 'UNREAD' && props.access.canManageNotifications ? (
                    <Button
                      onClick={() => props.onNotificationRead(notification.id)}
                      size="compact"
                      variant="quiet"
                    >
                      {t('task.actions.markRead')}
                    </Button>
                  ) : null}
                  {props.access.canManageNotifications ? (
                    <Button
                      disabled={busy}
                      onClick={() => props.onNotificationArchive(notification.id)}
                      size="compact"
                      variant="quiet"
                    >
                      {t('task.actions.archiveNotification')}
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p>{t('task.notifications.empty')}</p>
          )}
        </section>
      ) : null}
    </div>
  );
}
