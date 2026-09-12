import type { TaskDetail, TaskPriority, TaskStatus, TaskSummary } from '@hire-me/contracts';

export const TASK_PAGE_SIZE = 25;

export const TASK_STATUSES: readonly TaskStatus[] = [
  'OPEN',
  'IN_PROGRESS',
  'WAITING',
  'BLOCKED',
  'COMPLETED',
  'CANCELED',
  'ARCHIVED',
];

export const TASK_PRIORITIES: readonly TaskPriority[] = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];

export interface TaskFilters {
  search: string;
  status: '' | TaskStatus;
  priority: '' | TaskPriority;
  ownerUserId: string;
  assigneeUserId: string;
}

export const EMPTY_TASK_FILTERS: TaskFilters = {
  assigneeUserId: '',
  ownerUserId: '',
  priority: '',
  search: '',
  status: '',
};

export type TaskListState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; tasks: TaskSummary[]; total: number };

export type TaskDetailState =
  | { status: 'idle' }
  | { status: 'loading'; taskId: string }
  | { status: 'error'; taskId: string }
  | { status: 'ready'; task: TaskDetail };

export interface TaskAccess {
  canArchive: boolean;
  canAssign: boolean;
  canComment: boolean;
  canCreate: boolean;
  canManageNotifications: boolean;
  canManageReminders: boolean;
  canTransition: boolean;
  canUpdate: boolean;
  canViewNotifications: boolean;
}

export function resolveTaskAccess(permissions: readonly string[]): TaskAccess {
  const has = (permission: string) => permissions.includes(permission);
  return {
    canArchive: has('tasks:archive'),
    canAssign: has('tasks:assign'),
    canComment: has('tasks:comment'),
    canCreate: has('tasks:create'),
    canManageNotifications: has('notifications:update_own'),
    canManageReminders: has('tasks:reminders:manage'),
    canTransition: has('tasks:transition'),
    canUpdate: has('tasks:update'),
    canViewNotifications: has('notifications:view_own'),
  };
}

export const ALLOWED_TASK_TRANSITIONS: Readonly<Record<TaskStatus, readonly TaskStatus[]>> = {
  ARCHIVED: [],
  BLOCKED: ['OPEN', 'IN_PROGRESS', 'WAITING', 'CANCELED'],
  CANCELED: ['OPEN'],
  COMPLETED: ['OPEN'],
  IN_PROGRESS: ['WAITING', 'BLOCKED', 'COMPLETED', 'CANCELED'],
  OPEN: ['IN_PROGRESS', 'WAITING', 'BLOCKED', 'COMPLETED', 'CANCELED'],
  WAITING: ['OPEN', 'IN_PROGRESS', 'BLOCKED', 'CANCELED'],
};

export function hasTaskFilters(filters: TaskFilters): boolean {
  return Object.values(filters).some(Boolean);
}
