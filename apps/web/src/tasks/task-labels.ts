import type { TaskPriority, TaskStatus } from '@hire-me/contracts';

import type { PlainMessageKey } from '../i18n/index.js';
import type { StatusTone } from '../ui/index.js';

export function taskStatusLabelKey(status: TaskStatus): PlainMessageKey {
  return `domain.taskStatus.${status}`;
}

export function taskPriorityLabelKey(priority: TaskPriority): PlainMessageKey {
  return `domain.taskPriority.${priority}`;
}

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
