import type {
  Notification,
  TaskPriority,
  TaskReminder,
  TaskStatus,
  TaskSummary,
} from '@hire-me/contracts';

import type { PlainMessageKey } from '../i18n/index.js';
import type { StatusTone } from '../ui/index.js';
import type { TaskContextFilterKind, TaskDueFilter, TaskSort } from './task-state.js';

/**
 * Presentation labels for language-neutral Task values.
 *
 * The stored value stays authoritative: it is what the API returned and what a
 * write sends back. These helpers only choose the dictionary key describing it,
 * so a localized label never reaches the API and no branch reads display text.
 */

export type TaskReminderStatus = TaskReminder['status'];
export type TaskContextField = keyof TaskSummary['context'];

export function taskStatusLabelKey(status: TaskStatus): PlainMessageKey {
  return `domain.taskStatus.${status}`;
}

export function taskPriorityLabelKey(priority: TaskPriority): PlainMessageKey {
  return `domain.taskPriority.${priority}`;
}

export function taskReminderStatusLabelKey(status: TaskReminderStatus): PlainMessageKey {
  return `domain.taskReminderStatus.${status}`;
}

export function notificationStatusLabelKey(status: Notification['status']): PlainMessageKey {
  return `domain.notificationStatus.${status}`;
}

export function taskContextFieldLabelKey(field: TaskContextField): PlainMessageKey {
  return `task.context.fields.${field}`;
}

export function taskContextKindLabelKey(kind: TaskContextFilterKind): PlainMessageKey {
  return `task.context.kinds.${kind}`;
}

export function taskDueFilterLabelKey(due: Exclude<TaskDueFilter, ''>): PlainMessageKey {
  return `task.filters.due.${due}`;
}

export function taskSortLabelKey(sort: TaskSort): PlainMessageKey {
  return `task.filters.sort.${sort}`;
}

/** Task notification types the server creates, with HireMe-owned wording for each. */
const NOTIFICATION_TYPES = [
  'tasks.assignment.created',
  'tasks.comment.mention',
  'tasks.overdue',
  'tasks.owner.changed',
  'tasks.reminder.due',
] as const;
type KnownNotificationType = (typeof NOTIFICATION_TYPES)[number];

const NOTIFICATION_COPY: Readonly<
  Record<KnownNotificationType, { body: PlainMessageKey; title: PlainMessageKey }>
> = {
  'tasks.assignment.created': {
    body: 'task.notifications.types.assigned.body',
    title: 'task.notifications.types.assigned.title',
  },
  'tasks.comment.mention': {
    body: 'task.notifications.types.mentioned.body',
    title: 'task.notifications.types.mentioned.title',
  },
  'tasks.overdue': {
    body: 'task.notifications.types.overdue.body',
    title: 'task.notifications.types.overdue.title',
  },
  'tasks.owner.changed': {
    body: 'task.notifications.types.ownerChanged.body',
    title: 'task.notifications.types.ownerChanged.title',
  },
  'tasks.reminder.due': {
    body: 'task.notifications.types.reminderDue.body',
    title: 'task.notifications.types.reminderDue.title',
  },
};

/**
 * Localized wording for a notification, chosen by its stable `type`. An
 * unknown type falls back to the server's own summary text, unchanged.
 */
export function notificationCopyKeys(
  type: string,
): { body: PlainMessageKey; title: PlainMessageKey } | null {
  return (NOTIFICATION_TYPES as readonly string[]).includes(type)
    ? NOTIFICATION_COPY[type as KnownNotificationType]
    : null;
}

/** The first linked record on a task, for a compact card label. */
export function primaryContextField(context: TaskSummary['context']): TaskContextField | null {
  const entry = (Object.entries(context) as [TaskContextField, string | null][]).find(([, value]) =>
    Boolean(value),
  );
  return entry ? entry[0] : null;
}

/**
 * Tone supports the text label and never replaces it: every status and
 * priority is also stated in words.
 */
export function taskStatusTone(status: TaskStatus): StatusTone {
  switch (status) {
    case 'COMPLETED':
      return 'success';
    case 'BLOCKED':
      return 'danger';
    case 'WAITING':
      return 'warning';
    case 'IN_PROGRESS':
      return 'info';
    default:
      return 'neutral';
  }
}

export function taskPriorityTone(priority: TaskPriority): StatusTone {
  return priority === 'URGENT' ? 'danger' : priority === 'HIGH' ? 'warning' : 'neutral';
}

export function taskReminderTone(status: TaskReminderStatus): StatusTone {
  switch (status) {
    case 'SENT':
      return 'success';
    case 'FAILED':
      return 'danger';
    case 'CANCELED':
      return 'neutral';
    default:
      return 'info';
  }
}

export type DueState = 'none' | 'future' | 'today' | 'overdue';

export function classifyDueDate(
  dueAt: string | null,
  status: TaskStatus,
  now = new Date(),
): DueState {
  if (!dueAt) return 'none';
  const due = new Date(dueAt);
  const terminal = status === 'COMPLETED' || status === 'CANCELED' || status === 'ARCHIVED';
  if (!terminal && due.getTime() < now.getTime()) return 'overdue';
  if (
    due.getFullYear() === now.getFullYear() &&
    due.getMonth() === now.getMonth() &&
    due.getDate() === now.getDate()
  ) {
    return 'today';
  }
  return 'future';
}
