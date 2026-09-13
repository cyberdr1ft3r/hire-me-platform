import type { TaskPriority, TaskStatus } from '@hire-me/contracts';

import { useI18n } from '../i18n/index.js';
import { StatusBadge } from '../ui/index.js';
import {
  classifyDueDate,
  taskPriorityLabelKey,
  taskPriorityTone,
  taskStatusLabelKey,
  taskStatusTone,
} from './task-labels.js';

/** The due date in words, with overdue and due-today stated as text, not only color. */
export function DueLabel({ dueAt, status }: { dueAt: string | null; status: TaskStatus }) {
  const { formatDateTime, t } = useI18n();
  if (!dueAt) return <span className="tasks__due">{t('task.values.dueNone')}</span>;
  const state = classifyDueDate(dueAt, status);
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

export function PriorityBadge({ priority }: { priority: TaskPriority }) {
  const { t } = useI18n();
  return (
    <StatusBadge tone={taskPriorityTone(priority)}>{t(taskPriorityLabelKey(priority))}</StatusBadge>
  );
}

export function StatusText({ status }: { status: TaskStatus }) {
  const { t } = useI18n();
  return <StatusBadge tone={taskStatusTone(status)}>{t(taskStatusLabelKey(status))}</StatusBadge>;
}
