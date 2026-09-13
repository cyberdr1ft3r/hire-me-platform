import type {
  TaskDetail,
  TaskListQuery,
  TaskPriority,
  TaskStatus,
  TaskSummary,
  TaskUserOptionPurpose,
} from '@hire-me/contracts';

import { dateInputEndIso, dateInputStartIso } from './task-datetime.js';

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

/**
 * The board shows the active workflow as columns, in the order work moves.
 * Each column is exactly one stored status: WAITING and BLOCKED sit side by
 * side but are never merged. CANCELED and ARCHIVED are closed states and live
 * in the list view instead of cluttering the board.
 */
export const TASK_BOARD_COLUMNS = [
  'OPEN',
  'IN_PROGRESS',
  'WAITING',
  'BLOCKED',
  'COMPLETED',
] as const;
export type TaskBoardColumn = (typeof TASK_BOARD_COLUMNS)[number];

export const TASK_PRIORITIES: readonly TaskPriority[] = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];

export type TaskView = 'board' | 'list';
export type TaskDueFilter = '' | 'dueSoon' | 'overdue';
export type TaskSort = 'dueAt' | 'updatedAt' | 'priority';
export const TASK_SORTS: readonly TaskSort[] = ['dueAt', 'updatedAt', 'priority'];

/**
 * Linked-record kinds a person can choose through an existing, permission-gated
 * list. The value sent to the API is always the record ID; the label is only
 * what the operator reads.
 */
export type TaskContextKind = 'client' | 'candidate' | 'mission' | 'document';
export const TASK_CONTEXT_KINDS: readonly TaskContextKind[] = [
  'client',
  'candidate',
  'mission',
  'document',
];

export const TASK_CONTEXT_FIELD: Readonly<
  Record<TaskContextKind, 'clientId' | 'candidateId' | 'recruitmentMissionId' | 'documentId'>
> = {
  candidate: 'candidateId',
  client: 'clientId',
  document: 'documentId',
  mission: 'recruitmentMissionId',
};

/** A human choice: what is shown, and the ID that is sent. */
export interface PickerOption {
  id: string;
  label: string;
  detail?: string;
  /** The signed-in user, marked "(you)" in the interface language at render time. */
  self?: boolean;
}

/**
 * Where a selector's options come from. People come from the purpose-scoped
 * Task lookup; linked records come from each module's own list endpoint.
 */
export type OptionSource =
  | { type: 'person'; purpose: TaskUserOptionPurpose; taskId?: string }
  | { type: 'record'; kind: TaskContextKind }
  | { type: 'missionCandidate'; missionId: string };

export type LoadOptions = (source: OptionSource, search: string) => Promise<PickerOption[]>;

export interface TaskContextFilter {
  kind: TaskContextKind;
  option: PickerOption;
}

export interface TaskFilters {
  assignee: PickerOption | null;
  context: TaskContextFilter | null;
  /** Only tasks the signed-in actor created; the server binds it to the actor. */
  createdByMe: boolean;
  due: TaskDueFilter;
  dueFrom: string;
  dueTo: string;
  owner: PickerOption | null;
  priority: '' | TaskPriority;
  search: string;
  sort: TaskSort;
  /** List view only: the board already separates statuses into columns. */
  status: '' | TaskStatus;
}

export const EMPTY_TASK_FILTERS: TaskFilters = {
  assignee: null,
  context: null,
  createdByMe: false,
  due: '',
  dueFrom: '',
  dueTo: '',
  owner: null,
  priority: '',
  search: '',
  sort: 'dueAt',
  status: '',
};

export function hasTaskFilters(filters: TaskFilters): boolean {
  return (
    Boolean(filters.search.trim()) ||
    Boolean(filters.priority) ||
    Boolean(filters.status) ||
    Boolean(filters.due) ||
    Boolean(filters.dueFrom) ||
    Boolean(filters.dueTo) ||
    filters.owner !== null ||
    filters.assignee !== null ||
    filters.createdByMe ||
    filters.context !== null
  );
}

const SORT_QUERY: Readonly<Record<TaskSort, Pick<TaskListQuery, 'sortBy' | 'sortDirection'>>> = {
  dueAt: { sortBy: 'dueAt', sortDirection: 'asc' },
  priority: { sortBy: 'priority', sortDirection: 'desc' },
  updatedAt: { sortBy: 'updatedAt', sortDirection: 'desc' },
};

/**
 * The list query for the current filters. Only language-neutral values reach
 * the API: IDs, stored enums, ISO instants, and booleans.
 */
export function taskListQuery(
  filters: TaskFilters,
  page: { page: number; status?: TaskStatus },
): Partial<TaskListQuery> {
  const status = page.status ?? (filters.status || undefined);
  return {
    ...SORT_QUERY[filters.sort],
    assigneeUserId: filters.assignee?.id,
    createdByMe: filters.createdByMe ? true : undefined,
    dueFrom: filters.dueFrom ? dateInputStartIso(filters.dueFrom) : undefined,
    dueSoon: filters.due === 'dueSoon' ? true : undefined,
    dueTo: filters.dueTo ? dateInputEndIso(filters.dueTo) : undefined,
    overdue: filters.due === 'overdue' ? true : undefined,
    ownerUserId: filters.owner?.id,
    page: page.page,
    pageSize: TASK_PAGE_SIZE,
    priority: filters.priority || undefined,
    search: filters.search.trim() || undefined,
    status,
    ...(filters.context
      ? { [TASK_CONTEXT_FIELD[filters.context.kind]]: filters.context.option.id }
      : {}),
  };
}

export type TaskColumnState =
  | { status: 'loading' }
  | { status: 'error' }
  | {
      loadingMore: boolean;
      loadMoreFailed: boolean;
      page: number;
      status: 'ready';
      tasks: TaskSummary[];
      total: number;
    };

export type TaskBoardState = Readonly<Record<TaskBoardColumn, TaskColumnState>>;

export function boardState(column: TaskColumnState): TaskBoardState {
  return {
    BLOCKED: column,
    COMPLETED: column,
    IN_PROGRESS: column,
    OPEN: column,
    WAITING: column,
  };
}

export type TaskListState =
  | { status: 'loading' }
  | { status: 'error' }
  | { page: number; status: 'ready'; tasks: TaskSummary[]; total: number };

export type TaskDetailState =
  | { status: 'idle' }
  | { status: 'loading'; taskId: string }
  | { status: 'error'; taskId: string }
  | { status: 'ready'; task: TaskDetail };

export interface TaskFeedback {
  message: string;
  /** Task-scoped feedback belongs in the open task; page feedback above the board. */
  scope: 'page' | 'task';
  tone: 'success' | 'danger';
}

export interface TaskAccess {
  canArchive: boolean;
  canAssign: boolean;
  canComment: boolean;
  canCreate: boolean;
  canManageNotifications: boolean;
  canManageReminders: boolean;
  canTransition: boolean;
  canUpdate: boolean;
  canViewAll: boolean;
  canViewNotifications: boolean;
  /** Linked-record kinds whose own list the actor may read, for selectors and filters. */
  contextKinds: readonly TaskContextKind[];
  canViewMissionCandidates: boolean;
}

const CONTEXT_PERMISSION: Readonly<Record<TaskContextKind, string>> = {
  candidate: 'candidates:view',
  client: 'clients:view',
  document: 'documents:view',
  mission: 'missions:view',
};

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
    canViewAll: has('tasks:view_all'),
    canViewMissionCandidates: has('mission_candidates:view'),
    canViewNotifications: has('notifications:view_own'),
    contextKinds: TASK_CONTEXT_KINDS.filter((kind) => has(CONTEXT_PERMISSION[kind])),
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

/** Mirrors the server: blocking, canceling, and reopening a closed task need a reason. */
export function transitionNeedsReason(from: TaskStatus, to: TaskStatus): boolean {
  return (
    to === 'BLOCKED' ||
    to === 'CANCELED' ||
    (to === 'OPEN' && (from === 'COMPLETED' || from === 'CANCELED'))
  );
}

export function isTaskWritable(status: TaskStatus): boolean {
  return status !== 'COMPLETED' && status !== 'CANCELED' && status !== 'ARCHIVED';
}
