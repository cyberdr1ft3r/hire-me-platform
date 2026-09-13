import type {
  TaskAssignment,
  TaskComment,
  TaskDetail as TaskRecord,
  TaskPriority,
  TaskReminder,
  TaskStatus,
} from '@hire-me/contracts';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';

import { useI18n } from '../i18n/index.js';
import {
  Button,
  EmptyState,
  InlineMessage,
  Select,
  Skeleton,
  StatusBadge,
  TextArea,
  TextField,
} from '../ui/index.js';
import { isoToLocalInput, localInputToIso } from './task-datetime.js';
import {
  taskContextFieldLabelKey,
  taskPriorityLabelKey,
  taskReminderStatusLabelKey,
  taskReminderTone,
  taskStatusLabelKey,
  type TaskContextField,
} from './task-labels.js';
import {
  ALLOWED_TASK_TRANSITIONS,
  TASK_PRIORITIES,
  isTaskWritable,
  transitionNeedsReason,
  type LoadOptions,
  type TaskAccess,
  type TaskDetailState,
  type TaskFeedback,
} from './task-state.js';
import { DueLabel, PriorityBadge, StatusText } from './TaskBits.js';
import { MentionPicker, SearchPicker } from './TaskPickers.js';

export interface TaskUpdateValues {
  description: string | null;
  /** `undefined` means the due date was left untouched and must not be sent. */
  dueAt: string | null | undefined;
  priority: TaskPriority;
  timezone: string | null;
  title: string;
}

/**
 * Every write the detail can start. Child records (assignments, comments,
 * reminders) are addressed by their ID internally; the operator only ever sees
 * names, text, and times.
 */
export interface TaskDetailActions {
  onAddAssignment: (values: { reason: string | null; userId: string }) => Promise<boolean>;
  onAddComment: (values: { body: string; mentionedUserIds: string[] }) => Promise<boolean>;
  onAddReminder: (values: { recipientUserId: string; remindAt: string }) => Promise<boolean>;
  onArchive: (reason: string) => Promise<boolean>;
  onArchiveComment: (commentId: string) => Promise<boolean>;
  onCancelReminder: (reminderId: string) => Promise<boolean>;
  onChangeOwner: (values: { ownerUserId: string; reason: string | null }) => Promise<boolean>;
  onEditComment: (values: { body: string; commentId: string }) => Promise<boolean>;
  onRemoveAssignment: (values: { assignmentId: string; reason: string }) => Promise<boolean>;
  onRescheduleReminder: (values: { remindAt: string; reminderId: string }) => Promise<boolean>;
  onTransition: (status: TaskStatus, reason: string | null) => Promise<boolean>;
  onUpdate: (values: TaskUpdateValues) => Promise<boolean>;
}

/** Reminder states the API lets a manager reschedule or cancel. */
const REMINDER_CHANGEABLE: ReadonlySet<TaskReminder['status']> = new Set(['PENDING', 'FAILED']);

function text(form: HTMLFormElement, name: string): string {
  const entry = new FormData(form).get(name);
  return typeof entry === 'string' ? entry.trim() : '';
}

/**
 * The selected task as a dialog over the board.
 *
 * It is modal: focus moves in when it opens, Tab stays inside, Escape and the
 * close button close it, and focus returns to whatever opened it (a card, or a
 * notification's Open task button), or to the task's card when that control is
 * gone. The board behind it is inert while it is open.
 */
export function TaskDrawer({
  children,
  labelledBy,
  onClose,
  returnFocusTo,
}: {
  children: ReactNode;
  labelledBy: string;
  onClose: () => void;
  returnFocusTo: string | null;
}) {
  const panelRef = useRef<HTMLElement>(null);
  const returnTo = useRef(returnFocusTo);

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panelRef.current?.querySelector<HTMLElement>('[data-drawer-focus]')?.focus();
    const target = returnTo.current;
    return () => {
      if (opener?.isConnected && opener !== document.body) {
        opener.focus();
      } else if (target) {
        // Some browsers do not focus a clicked button: fall back to the task's
        // card, then to a notification action that opens it.
        document
          .querySelector<HTMLElement>(
            `[data-task-card="${target}"], [data-task-opener="${target}"]`,
          )
          ?.focus();
      }
    };
  }, []);

  function handleKeyDown(event: KeyboardEvent<HTMLElement>): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = Array.from(
      panelRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
      ) ?? [],
    );
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div className="task-drawer">
      <div aria-hidden="true" className="task-drawer__scrim" onClick={onClose} />
      <section
        aria-labelledby={labelledBy}
        aria-modal="true"
        className="task-drawer__panel"
        onKeyDown={handleKeyDown}
        ref={panelRef}
        role="dialog"
      >
        {children}
      </section>
    </div>
  );
}

export interface TaskDetailPanelProps extends TaskDetailActions {
  access: TaskAccess;
  contextLabels: Readonly<Record<string, string | null>>;
  /** The signed-in user, to offer comment edit/archive on their own comments. */
  currentUserId: string;
  detail: TaskDetailState;
  feedback: TaskFeedback | null;
  loadOptions: LoadOptions;
  onClose: () => void;
  onRetry: () => void;
  optionsKey: string;
  pending: string | null;
}

export function TaskDetailPanel(props: TaskDetailPanelProps) {
  const { t } = useI18n();
  const titleId = useId();
  if (props.detail.status === 'idle') return null;

  const title =
    props.detail.status === 'ready'
      ? props.detail.task.title
      : props.detail.status === 'loading'
        ? t('task.states.loadingDetail')
        : t('task.states.detailError');

  // The header stays mounted across loading, error, and ready so focus on the
  // close button is never lost when the content underneath changes.
  return (
    <TaskDrawer
      labelledBy={titleId}
      onClose={props.onClose}
      returnFocusTo={props.detail.status === 'ready' ? props.detail.task.id : props.detail.taskId}
    >
      <div className="task-drawer__head">
        <h2 id={titleId}>{title}</h2>
        <Button
          aria-label={t('task.actions.close')}
          className="task-drawer__close"
          data-drawer-focus=""
          onClick={props.onClose}
          size="compact"
          variant="quiet"
        >
          ✕
        </Button>
      </div>
      {props.detail.status === 'loading' ? (
        <Skeleton label={t('task.states.loadingDetail')} />
      ) : props.detail.status === 'error' ? (
        <EmptyState
          action={<Button onClick={props.onRetry}>{t('task.actions.retry')}</Button>}
          title={t('task.states.detailError')}
        >
          {t('task.feedback.failed')}
        </EmptyState>
      ) : (
        <TaskRecordView {...props} task={props.detail.task} titleId={titleId} />
      )}
    </TaskDrawer>
  );
}

function TaskRecordView(props: TaskDetailPanelProps & { task: TaskRecord; titleId: string }) {
  const { formatDateTime, t } = useI18n();
  const { access, task } = props;
  const busy = props.pending !== null;
  const writable = isTaskWritable(task.status);
  const [editing, setEditing] = useState(false);
  const activeAssignees = task.assignments.filter((assignment) => assignment.status === 'ACTIVE');
  const context = (Object.entries(task.context) as [TaskContextField, string | null][]).filter(
    (entry): entry is [TaskContextField, string] => Boolean(entry[1]),
  );

  return (
    <article aria-labelledby={props.titleId} className="task-record">
      <div className="task-record__badges">
        <StatusText status={task.status} />
        <PriorityBadge priority={task.priority} />
        <DueLabel dueAt={task.dueAt} status={task.status} />
      </div>

      {props.feedback ? (
        <InlineMessage
          announce
          title={
            props.feedback.tone === 'success'
              ? t('task.feedback.successTitle')
              : t('task.feedback.errorTitle')
          }
          tone={props.feedback.tone}
        >
          {props.feedback.message}
        </InlineMessage>
      ) : null}

      {access.canTransition && ALLOWED_TASK_TRANSITIONS[task.status].length ? (
        <MoveTask
          busy={busy}
          hasAssignee={activeAssignees.length > 0}
          key={task.status}
          onTransition={props.onTransition}
          pending={props.pending === 'transition'}
          status={task.status}
        />
      ) : null}

      <section aria-labelledby={`${props.titleId}-details`} className="task-record__section">
        <h3 id={`${props.titleId}-details`}>{t('task.detail.people')}</h3>
        <dl className="task-record__facts">
          <div className="task-record__fact--wide">
            <dt>{t('task.detail.owner')}</dt>
            <dd>{task.ownerDisplayName ?? t('task.detail.notRecorded')}</dd>
          </div>
          <div className="task-record__fact--wide">
            <dt>{t('task.detail.assignees')}</dt>
            <dd>
              <Assignees
                assignments={activeAssignees}
                busy={busy}
                canRemove={access.canAssign && writable}
                onRemove={props.onRemoveAssignment}
                pending={props.pending}
              />
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
        {access.canAssign && writable ? (
          <PeopleForms
            busy={busy}
            loadOptions={props.loadOptions}
            onAddAssignment={props.onAddAssignment}
            onChangeOwner={props.onChangeOwner}
            optionsKey={props.optionsKey}
            pending={props.pending}
            taskId={task.id}
          />
        ) : null}
      </section>

      <section className="task-record__section">
        <div className="task-record__section-head">
          <h3>{t('task.detail.description')}</h3>
          {access.canUpdate && writable && !editing ? (
            <Button
              disabled={busy}
              onClick={() => setEditing(true)}
              size="compact"
              variant="secondary"
            >
              {t('task.actions.edit')}
            </Button>
          ) : null}
        </div>
        {editing ? (
          <EditTask
            busy={busy}
            onCancel={() => setEditing(false)}
            onUpdate={(values) =>
              props.onUpdate(values).then((ok) => {
                if (ok) setEditing(false);
                return ok;
              })
            }
            pending={props.pending === 'update'}
            task={task}
          />
        ) : (
          <p className="tasks__prose">{task.description || t('task.detail.noDescription')}</p>
        )}
      </section>

      {context.length ? (
        <section className="task-record__section">
          <h3>{t('task.context.title')}</h3>
          <dl className="task-record__facts">
            {context.map(([field, id]) => {
              const label = props.contextLabels[`${field}:${id}`];
              return (
                <div key={field}>
                  <dt>{t(taskContextFieldLabelKey(field))}</dt>
                  <dd>
                    {label === undefined
                      ? t('task.picker.loading')
                      : label === null
                        ? t('task.context.unavailable')
                        : label}
                  </dd>
                </div>
              );
            })}
          </dl>
        </section>
      ) : null}

      <Comments {...props} busy={busy} writable={writable} />
      <Reminders {...props} busy={busy} />

      {access.canArchive && task.status !== 'ARCHIVED' ? (
        <ArchiveTask
          busy={busy}
          onArchive={props.onArchive}
          pending={props.pending === 'archive'}
        />
      ) : null}
    </article>
  );
}

function MoveTask({
  busy,
  hasAssignee,
  onTransition,
  pending,
  status,
}: {
  busy: boolean;
  hasAssignee: boolean;
  onTransition: TaskDetailActions['onTransition'];
  pending: boolean;
  status: TaskStatus;
}) {
  const { t } = useI18n();
  const targets = ALLOWED_TASK_TRANSITIONS[status];
  const [target, setTarget] = useState<TaskStatus>(targets[0]!);
  const [formKey, setFormKey] = useState(0);
  const needsReason = transitionNeedsReason(status, target);

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (busy) return;
    const reason = text(event.currentTarget, 'reason');
    if (needsReason && !reason) return;
    void onTransition(target, reason || null).then((ok) => {
      if (ok) setFormKey((value) => value + 1);
    });
  }

  return (
    <form
      aria-label={t('task.detail.workflow')}
      className="task-move"
      key={formKey}
      onSubmit={submit}
    >
      <Select
        label={t('task.fields.moveTo')}
        name="status"
        onChange={(event) => setTarget(event.target.value as TaskStatus)}
        value={target}
      >
        {targets.map((option) => (
          <option key={option} value={option}>
            {t(taskStatusLabelKey(option))}
          </option>
        ))}
      </Select>
      <TextField
        hint={
          needsReason
            ? t('task.validation.reasonRequired')
            : target === 'IN_PROGRESS' && !hasAssignee
              ? t('task.validation.assigneeRequired')
              : undefined
        }
        label={t('task.fields.reason')}
        maxLength={1000}
        name="reason"
        required={needsReason}
      />
      <Button disabled={busy} loading={pending} loadingLabel={t('task.actions.move')} type="submit">
        {t('task.actions.move')}
      </Button>
    </form>
  );
}

function EditTask({
  busy,
  onCancel,
  onUpdate,
  pending,
  task,
}: {
  busy: boolean;
  onCancel: () => void;
  onUpdate: (values: TaskUpdateValues) => Promise<boolean>;
  pending: boolean;
  task: TaskRecord;
}) {
  const { t } = useI18n();
  const initialDue = isoToLocalInput(task.dueAt);

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const due = text(form, 'dueAt');
    void onUpdate({
      description: text(form, 'description') || null,
      // An untouched due date is not sent, so its exact stored instant is kept.
      dueAt: due === initialDue ? undefined : localInputToIso(due),
      priority: text(form, 'priority') as TaskPriority,
      timezone: text(form, 'timezone') || null,
      title: text(form, 'title'),
    });
  }

  return (
    <form aria-label={t('task.actions.edit')} className="tasks__form-grid" onSubmit={submit}>
      <TextField
        defaultValue={task.title}
        label={t('task.fields.title')}
        maxLength={200}
        name="title"
        required
      />
      <Select defaultValue={task.priority} label={t('task.fields.priority')} name="priority">
        {TASK_PRIORITIES.map((priority) => (
          <option key={priority} value={priority}>
            {t(taskPriorityLabelKey(priority))}
          </option>
        ))}
      </Select>
      <TextArea
        className="tasks__span"
        defaultValue={task.description ?? ''}
        label={t('task.fields.description')}
        maxLength={4000}
        name="description"
      />
      <TextField
        defaultValue={initialDue}
        label={t('task.fields.dueAt')}
        name="dueAt"
        type="datetime-local"
      />
      <TextField
        defaultValue={task.timezone ?? ''}
        label={t('task.fields.timezone')}
        maxLength={80}
        name="timezone"
      />
      <div className="tasks__form-actions tasks__span">
        <Button
          disabled={busy}
          loading={pending}
          loadingLabel={t('task.actions.save')}
          type="submit"
        >
          {t('task.actions.save')}
        </Button>
        <Button disabled={pending} onClick={onCancel} variant="quiet">
          {t('task.actions.cancel')}
        </Button>
      </div>
    </form>
  );
}

function PeopleForms({
  busy,
  loadOptions,
  onAddAssignment,
  onChangeOwner,
  optionsKey,
  pending,
  taskId,
}: {
  busy: boolean;
  loadOptions: LoadOptions;
  onAddAssignment: TaskDetailActions['onAddAssignment'];
  onChangeOwner: TaskDetailActions['onChangeOwner'];
  optionsKey: string;
  pending: string | null;
  taskId: string;
}) {
  const { t } = useI18n();
  const [ownerKey, setOwnerKey] = useState(0);
  const [assigneeKey, setAssigneeKey] = useState(0);

  return (
    <div className="task-record__forms">
      <form
        aria-label={t('task.actions.changeOwner')}
        className="task-record__form"
        key={`owner-${ownerKey}`}
        onSubmit={(event) => {
          event.preventDefault();
          if (busy) return;
          const form = event.currentTarget;
          const ownerUserId = text(form, 'ownerUserId');
          if (!ownerUserId) return;
          void onChangeOwner({ ownerUserId, reason: text(form, 'reason') || null }).then((ok) => {
            if (ok) setOwnerKey((value) => value + 1);
          });
        }}
      >
        <SearchPicker
          disabled={busy}
          hint={t('task.picker.searchPeopleHint')}
          label={t('task.fields.owner')}
          loadOptions={loadOptions}
          name="ownerUserId"
          required
          source={{ purpose: 'owner', taskId, type: 'person' }}
          sourceKey={`${optionsKey}:owner:${taskId}`}
        />
        <TextField label={t('task.fields.reason')} maxLength={1000} name="reason" />
        <Button
          disabled={busy}
          loading={pending === 'owner'}
          loadingLabel={t('task.actions.changeOwner')}
          type="submit"
        >
          {t('task.actions.changeOwner')}
        </Button>
      </form>
      <form
        aria-label={t('task.actions.addAssignee')}
        className="task-record__form"
        key={`assignee-${assigneeKey}`}
        onSubmit={(event) => {
          event.preventDefault();
          if (busy) return;
          const form = event.currentTarget;
          const userId = text(form, 'userId');
          if (!userId) return;
          void onAddAssignment({ reason: text(form, 'reason') || null, userId }).then((ok) => {
            if (ok) setAssigneeKey((value) => value + 1);
          });
        }}
      >
        <SearchPicker
          disabled={busy}
          hint={t('task.picker.searchPeopleHint')}
          label={t('task.fields.assignee')}
          loadOptions={loadOptions}
          name="userId"
          required
          source={{ purpose: 'assignee', taskId, type: 'person' }}
          sourceKey={`${optionsKey}:assignee:${taskId}`}
        />
        <TextField label={t('task.fields.reason')} maxLength={1000} name="reason" />
        <Button
          disabled={busy}
          loading={pending === 'assignment'}
          loadingLabel={t('task.actions.addAssignee')}
          type="submit"
        >
          {t('task.actions.addAssignee')}
        </Button>
      </form>
    </div>
  );
}

/**
 * A short form opened inside one row: remove an assignee, edit or archive a
 * comment, reschedule or cancel a reminder. Its first field (or the element
 * marked `data-autofocus`) takes focus when it opens. When it closes and the
 * row is still there, focus goes back to the row's action named `returnTo`
 * (the button that opened it, shown again once the form is gone).
 */
function RowForm({
  children,
  label,
  onSubmit,
  returnTo,
}: {
  children: ReactNode;
  label: string;
  onSubmit: (form: HTMLFormElement) => void;
  returnTo: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const row = formRef.current?.closest('li');
    formRef.current
      ?.querySelector<HTMLElement>('[data-autofocus], input, textarea, select')
      ?.focus();
    return () => {
      if (row?.isConnected) {
        row.querySelector<HTMLElement>(`[data-row-action="${returnTo}"]`)?.focus();
      }
    };
  }, [returnTo]);

  return (
    <form
      aria-label={label}
      className="task-record__form task-record__inline"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(event.currentTarget);
      }}
      ref={formRef}
    >
      {children}
    </form>
  );
}

/**
 * Active assignees, one per row. Removing one asks for the reason the API
 * requires and sends the assignment's ID; the operator sees only the name.
 */
function Assignees({
  assignments,
  busy,
  canRemove,
  onRemove,
  pending,
}: {
  assignments: TaskAssignment[];
  busy: boolean;
  canRemove: boolean;
  onRemove: TaskDetailActions['onRemoveAssignment'];
  pending: string | null;
}) {
  const { t } = useI18n();
  const [removing, setRemoving] = useState<string | null>(null);
  const target = canRemove
    ? assignments.find((assignment) => assignment.id === removing)
    : undefined;

  if (!assignments.length) return <>{t('task.detail.noAssignees')}</>;

  return (
    <ul className="task-assignees">
      {assignments.map((assignment) =>
        assignment.id === target?.id ? (
          <li key={assignment.id}>
            <span>{assignment.userDisplayName}</span>
            <RowForm
              label={t('task.assignees.removeNamed', { name: assignment.userDisplayName })}
              onSubmit={(form) => {
                if (busy) return;
                const reason = text(form, 'reason');
                if (!reason) return;
                void onRemove({ assignmentId: assignment.id, reason }).then((ok) => {
                  if (ok) setRemoving(null);
                });
              }}
              returnTo="remove"
            >
              <p>{t('task.assignees.removeConfirm', { name: assignment.userDisplayName })}</p>
              <TextField
                hint={t('task.assignees.reasonHint')}
                label={t('task.fields.reason')}
                maxLength={1000}
                name="reason"
                required
              />
              <div className="tasks__form-actions">
                <Button
                  disabled={busy}
                  loading={pending === 'removeAssignment'}
                  loadingLabel={t('task.assignees.confirmRemove')}
                  type="submit"
                  variant="danger"
                >
                  {t('task.assignees.confirmRemove')}
                </Button>
                <Button
                  disabled={pending === 'removeAssignment'}
                  onClick={() => setRemoving(null)}
                  variant="quiet"
                >
                  {t('task.actions.cancel')}
                </Button>
              </div>
            </RowForm>
          </li>
        ) : (
          <li key={assignment.id}>
            <span>{assignment.userDisplayName}</span>
            {canRemove ? (
              <Button
                aria-label={t('task.assignees.removeNamed', { name: assignment.userDisplayName })}
                data-row-action="remove"
                disabled={busy}
                onClick={() => setRemoving(assignment.id)}
                size="compact"
                variant="quiet"
              >
                {t('task.assignees.remove')}
              </Button>
            ) : null}
          </li>
        ),
      )}
    </ul>
  );
}

type RowAction<Kind extends string> = { id: string; kind: Kind } | null;

function Comments(
  props: TaskDetailPanelProps & { busy: boolean; task: TaskRecord; writable: boolean },
) {
  const { formatDateTime, t } = useI18n();
  const [formKey, setFormKey] = useState(0);
  const [action, setAction] = useState<RowAction<'archive' | 'edit'>>(null);
  const { task } = props;

  // Mirrors what the API accepts: comment permission on a writable task, by the
  // author or by a manager who oversees all tasks. The API still decides; any
  // refusal is reported with the same generic failure message.
  const canChange = (comment: TaskComment) =>
    props.access.canComment &&
    props.writable &&
    (comment.authorUserId === props.currentUserId || props.access.canViewAll);

  return (
    <section className="task-record__section">
      <h3>{t('task.comments.title')}</h3>
      {task.comments.length ? (
        <ol className="tasks__timeline">
          {task.comments.map((comment) => {
            const editing = action?.id === comment.id && action.kind === 'edit';
            const archiving = action?.id === comment.id && action.kind === 'archive';
            return (
              <li key={comment.id}>
                <div>
                  <strong>{comment.authorDisplayName}</strong>
                  <time dateTime={comment.createdAt}>{formatDateTime(comment.createdAt)}</time>
                </div>
                {editing ? (
                  <RowForm
                    label={t('task.comments.edit')}
                    returnTo="edit"
                    onSubmit={(form) => {
                      if (props.busy) return;
                      const body = text(form, 'body');
                      if (!body) return;
                      void props.onEditComment({ body, commentId: comment.id }).then((ok) => {
                        if (ok) setAction(null);
                      });
                    }}
                  >
                    <TextArea
                      defaultValue={comment.body}
                      hint={t('task.comments.editHint')}
                      label={t('task.comments.body')}
                      maxLength={4000}
                      name="body"
                      required
                    />
                    <div className="tasks__form-actions">
                      <Button
                        disabled={props.busy}
                        loading={props.pending === 'editComment'}
                        loadingLabel={t('task.comments.save')}
                        type="submit"
                      >
                        {t('task.comments.save')}
                      </Button>
                      <Button
                        disabled={props.pending === 'editComment'}
                        onClick={() => setAction(null)}
                        variant="quiet"
                      >
                        {t('task.actions.cancel')}
                      </Button>
                    </div>
                  </RowForm>
                ) : (
                  <p>{comment.body}</p>
                )}
                {comment.status === 'EDITED' && !editing ? (
                  <span className="task-record__note">{t('task.comments.edited')}</span>
                ) : null}
                {archiving ? (
                  <RowForm
                    label={t('task.comments.archive')}
                    returnTo="archive"
                    onSubmit={() => {
                      if (props.busy) return;
                      void props.onArchiveComment(comment.id).then((ok) => {
                        if (ok) setAction(null);
                      });
                    }}
                  >
                    <p>{t('task.comments.archiveConfirm')}</p>
                    <div className="tasks__form-actions">
                      <Button
                        disabled={props.busy}
                        loading={props.pending === 'archiveComment'}
                        loadingLabel={t('task.comments.archive')}
                        type="submit"
                        variant="danger"
                      >
                        {t('task.comments.archive')}
                      </Button>
                      <Button
                        data-autofocus=""
                        disabled={props.pending === 'archiveComment'}
                        onClick={() => setAction(null)}
                        variant="quiet"
                      >
                        {t('task.comments.keep')}
                      </Button>
                    </div>
                  </RowForm>
                ) : null}
                {canChange(comment) && !editing && !archiving ? (
                  <div className="task-record__row-actions">
                    <Button
                      data-row-action="edit"
                      disabled={props.busy}
                      onClick={() => setAction({ id: comment.id, kind: 'edit' })}
                      size="compact"
                      variant="quiet"
                    >
                      {t('task.comments.edit')}
                    </Button>
                    <Button
                      data-row-action="archive"
                      disabled={props.busy}
                      onClick={() => setAction({ id: comment.id, kind: 'archive' })}
                      size="compact"
                      variant="quiet"
                    >
                      {t('task.comments.archive')}
                    </Button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : (
        <p>{t('task.comments.empty')}</p>
      )}
      {props.access.canComment && props.writable ? (
        <form
          aria-label={t('task.actions.addComment')}
          className="task-record__form"
          key={formKey}
          onSubmit={(event) => {
            event.preventDefault();
            if (props.busy) return;
            const form = event.currentTarget;
            const body = text(form, 'body');
            if (!body) return;
            const mentionedUserIds = new FormData(form)
              .getAll('mentionedUserIds')
              .filter((value): value is string => typeof value === 'string');
            void props.onAddComment({ body, mentionedUserIds }).then((ok) => {
              if (ok) setFormKey((value) => value + 1);
            });
          }}
        >
          <TextArea label={t('task.comments.body')} maxLength={4000} name="body" required />
          <MentionPicker
            disabled={props.busy}
            loadOptions={props.loadOptions}
            source={{ purpose: 'mention', taskId: task.id, type: 'person' }}
            sourceKey={`${props.optionsKey}:mention:${task.id}`}
          />
          <Button
            disabled={props.busy}
            loading={props.pending === 'comment'}
            loadingLabel={t('task.actions.addComment')}
            type="submit"
          >
            {t('task.actions.addComment')}
          </Button>
        </form>
      ) : null}
    </section>
  );
}

function Reminders(props: TaskDetailPanelProps & { busy: boolean; task: TaskRecord }) {
  const { formatDateTime, t } = useI18n();
  const [formKey, setFormKey] = useState(0);
  const [action, setAction] = useState<RowAction<'cancel' | 'reschedule'>>(null);
  const { task } = props;
  const canManage = props.access.canManageReminders && task.status !== 'ARCHIVED';
  // Only the states the API reschedules or cancels: pending and failed.
  const canChange = (reminder: TaskReminder) =>
    canManage && REMINDER_CHANGEABLE.has(reminder.status);

  return (
    <section className="task-record__section">
      <h3>{t('task.reminders.title')}</h3>
      {task.reminders.length ? (
        <ul className="tasks__reminders">
          {task.reminders.map((reminder) => {
            const open = action?.id === reminder.id && canChange(reminder) ? action.kind : null;
            return (
              <li key={reminder.id}>
                <span>{reminder.recipientDisplayName}</span>
                <time dateTime={reminder.remindAt}>{formatDateTime(reminder.remindAt)}</time>
                <StatusBadge tone={taskReminderTone(reminder.status)}>
                  {t(taskReminderStatusLabelKey(reminder.status))}
                </StatusBadge>
                {open === 'reschedule' ? (
                  <RowForm
                    label={t('task.reminders.reschedule')}
                    returnTo="reschedule"
                    onSubmit={(form) => {
                      if (props.busy) return;
                      const remindAt = localInputToIso(text(form, 'remindAt'));
                      if (!remindAt) return;
                      void props
                        .onRescheduleReminder({ remindAt, reminderId: reminder.id })
                        .then((ok) => {
                          if (ok) setAction(null);
                        });
                    }}
                  >
                    <TextField
                      defaultValue={isoToLocalInput(reminder.remindAt)}
                      label={t('task.reminders.newTime')}
                      name="remindAt"
                      required
                      type="datetime-local"
                    />
                    <div className="tasks__form-actions">
                      <Button
                        disabled={props.busy}
                        loading={props.pending === 'rescheduleReminder'}
                        loadingLabel={t('task.reminders.saveTime')}
                        type="submit"
                      >
                        {t('task.reminders.saveTime')}
                      </Button>
                      <Button
                        disabled={props.pending === 'rescheduleReminder'}
                        onClick={() => setAction(null)}
                        variant="quiet"
                      >
                        {t('task.actions.cancel')}
                      </Button>
                    </div>
                  </RowForm>
                ) : open === 'cancel' ? (
                  <RowForm
                    label={t('task.reminders.cancel')}
                    returnTo="cancel"
                    onSubmit={() => {
                      if (props.busy) return;
                      void props.onCancelReminder(reminder.id).then((ok) => {
                        if (ok) setAction(null);
                      });
                    }}
                  >
                    <p>{t('task.reminders.cancelConfirm')}</p>
                    <div className="tasks__form-actions">
                      <Button
                        disabled={props.busy}
                        loading={props.pending === 'cancelReminder'}
                        loadingLabel={t('task.reminders.cancel')}
                        type="submit"
                        variant="danger"
                      >
                        {t('task.reminders.cancel')}
                      </Button>
                      <Button
                        data-autofocus=""
                        disabled={props.pending === 'cancelReminder'}
                        onClick={() => setAction(null)}
                        variant="quiet"
                      >
                        {t('task.reminders.keep')}
                      </Button>
                    </div>
                  </RowForm>
                ) : canChange(reminder) ? (
                  <div className="task-record__row-actions">
                    <Button
                      data-row-action="reschedule"
                      disabled={props.busy}
                      onClick={() => setAction({ id: reminder.id, kind: 'reschedule' })}
                      size="compact"
                      variant="quiet"
                    >
                      {t('task.reminders.reschedule')}
                    </Button>
                    <Button
                      data-row-action="cancel"
                      disabled={props.busy}
                      onClick={() => setAction({ id: reminder.id, kind: 'cancel' })}
                      size="compact"
                      variant="quiet"
                    >
                      {t('task.reminders.cancel')}
                    </Button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p>{t('task.reminders.empty')}</p>
      )}
      {canManage ? (
        <form
          aria-label={t('task.actions.addReminder')}
          className="task-record__form"
          key={formKey}
          onSubmit={(event) => {
            event.preventDefault();
            if (props.busy) return;
            const form = event.currentTarget;
            const recipientUserId = text(form, 'recipientUserId');
            const remindAt = localInputToIso(text(form, 'remindAt'));
            if (!recipientUserId || !remindAt) return;
            void props.onAddReminder({ recipientUserId, remindAt }).then((ok) => {
              if (ok) setFormKey((value) => value + 1);
            });
          }}
        >
          <SearchPicker
            disabled={props.busy}
            hint={t('task.picker.searchPeopleHint')}
            label={t('task.reminders.recipient')}
            loadOptions={props.loadOptions}
            name="recipientUserId"
            required
            source={{ purpose: 'reminder', taskId: task.id, type: 'person' }}
            sourceKey={`${props.optionsKey}:reminder:${task.id}`}
          />
          <TextField
            label={t('task.reminders.remindAt')}
            name="remindAt"
            required
            type="datetime-local"
          />
          <Button
            disabled={props.busy}
            loading={props.pending === 'reminder'}
            loadingLabel={t('task.actions.addReminder')}
            type="submit"
          >
            {t('task.actions.addReminder')}
          </Button>
        </form>
      ) : null}
    </section>
  );
}

function ArchiveTask({
  busy,
  onArchive,
  pending,
}: {
  busy: boolean;
  onArchive: (reason: string) => Promise<boolean>;
  pending: boolean;
}) {
  const { t } = useI18n();
  return (
    <form
      aria-label={t('task.actions.archive')}
      className="task-record__form task-record__archive"
      onSubmit={(event) => {
        event.preventDefault();
        if (busy) return;
        const reason = text(event.currentTarget, 'reason');
        if (reason) void onArchive(reason);
      }}
    >
      <TextField label={t('task.fields.reason')} maxLength={1000} name="reason" required />
      <Button
        disabled={busy}
        loading={pending}
        loadingLabel={t('task.actions.archive')}
        type="submit"
        variant="danger"
      >
        {t('task.actions.archive')}
      </Button>
    </form>
  );
}
