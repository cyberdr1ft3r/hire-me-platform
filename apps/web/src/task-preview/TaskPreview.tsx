import type { Notification, TaskDetail, TaskSummary } from '@hire-me/contracts';
import { useMemo, useState } from 'react';

import { I18nProvider, useI18n } from '../i18n/index.js';
import { Select } from '../ui/index.js';
import { AppShell } from '../ui/shell/AppShell.js';
import {
  EMPTY_TASK_FILTERS,
  TASK_BOARD_COLUMNS,
  resolveTaskAccess,
  type LoadOptions,
  type PickerOption,
  type TaskBoardState,
  type TaskFilters,
  type TaskView,
} from '../tasks/task-state.js';
import { taskDetail, taskSummary, taskUser } from '../tasks/task-test-data.js';
import { TaskWorkspace } from '../tasks/TaskWorkspace.js';

/**
 * Development-only review surface for the Task pipeline.
 *
 * It renders the real `TaskWorkspace` inside the real `AppShell` and
 * `I18nProvider` with synthetic records only. It makes no request: selectors
 * search a fixed synthetic list, and writes resolve locally. It is not linked
 * from product navigation and is excluded from the production build.
 *
 * `?task=<id>` opens a task and `?view=list` starts in the list, for review
 * captures.
 */
type Dataset = 'empty' | 'filtered' | 'populated';

const PEOPLE: PickerOption[] = [
  {
    detail: 'amina.berrada@example.test',
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001',
    label: 'Amina Berrada',
  },
  {
    detail: 'karim.idrissi@example.test',
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000002',
    label: 'Karim Idrissi',
  },
  {
    detail: 'lea.martin@example.test',
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000003',
    label: 'Léa Martin',
  },
  {
    detail: 'omar.tazi@example.test',
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000004',
    label: 'Omar Tazi',
  },
  {
    detail: 'omar.tazi.sales@example.test',
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000005',
    label: 'Omar Tazi',
  },
  { detail: taskUser.email, id: taskUser.id, label: taskUser.displayName, self: true },
];

const MISSIONS: PickerOption[] = [
  {
    detail: 'Synthetic Client A',
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001',
    label: 'Synthetic data engineer mission',
  },
  {
    detail: 'Synthetic Client B',
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-000000000002',
    label: 'Synthetic finance controller mission',
  },
];

function summary(overrides: Partial<TaskSummary>): TaskSummary {
  return { ...taskSummary, ...overrides };
}

const TASKS: TaskSummary[] = [
  taskSummary,
  summary({
    assigneeUserIds: [],
    dueAt: '2026-09-18T14:00:00.000Z',
    id: '22222222-2222-4222-8222-000000000002',
    ownerDisplayName: 'Amina Berrada',
    priority: 'NORMAL',
    title: 'Collect references for the finance shortlist',
  }),
  summary({
    context: { ...taskSummary.context, recruitmentMissionId: MISSIONS[0]!.id },
    dueAt: '2026-09-15T14:00:00.000Z',
    id: '22222222-2222-4222-8222-000000000003',
    priority: 'HIGH',
    status: 'IN_PROGRESS',
    title: 'Prepare interview briefing for the hiring manager',
  }),
  summary({
    assigneeUserIds: [PEOPLE[1]!.id, PEOPLE[2]!.id],
    dueAt: null,
    id: '22222222-2222-4222-8222-000000000004',
    ownerDisplayName: 'Karim Idrissi',
    priority: 'NORMAL',
    status: 'WAITING',
    title: 'Confirm consultant availability',
  }),
  summary({
    dueAt: '2026-09-20T09:00:00.000Z',
    id: '22222222-2222-4222-8222-000000000005',
    priority: 'URGENT',
    status: 'BLOCKED',
    title: 'Obtain signed client brief before sourcing',
  }),
  summary({
    dueAt: '2026-09-09T09:00:00.000Z',
    id: '22222222-2222-4222-8222-000000000006',
    priority: 'LOW',
    status: 'COMPLETED',
    title: 'Send weekly pipeline update',
  }),
];

const notifications: Notification[] = [
  {
    actorUserId: null,
    archivedAt: null,
    bodySummary: 'A task is overdue.',
    createdAt: '2026-09-12T08:00:00.000Z',
    documentId: null,
    id: '77777777-7777-4777-8777-777777777777',
    interviewId: null,
    missionCandidateId: null,
    readAt: null,
    recipientUserId: taskUser.id,
    recruitmentMissionId: null,
    status: 'UNREAD',
    taskId: taskDetail.id,
    title: 'Task overdue',
    trainingEnrollmentId: null,
    trainingSessionId: null,
    type: 'tasks.overdue',
    updatedAt: '2026-09-12T08:00:00.000Z',
  },
];

function detailFor(task: TaskSummary): TaskDetail {
  if (task.id === taskDetail.id) return taskDetail;
  return { ...taskDetail, ...task, assignments: [], comments: [], history: [], reminders: [] };
}

const loadOptions: LoadOptions = (source, search) => {
  const needle = search.toLowerCase();
  const pool =
    source.type === 'person'
      ? PEOPLE
      : source.type === 'record' && source.kind === 'mission'
        ? MISSIONS
        : [];
  return Promise.resolve(
    pool.filter((option) =>
      `${option.label} ${option.detail ?? ''}`.toLowerCase().includes(needle),
    ),
  );
};

function matches(filters: TaskFilters, task: TaskSummary): boolean {
  const search = filters.search.trim().toLowerCase();
  return (
    (!search || task.title.toLowerCase().includes(search)) &&
    (!filters.priority || task.priority === filters.priority) &&
    (!filters.owner || task.ownerUserId === filters.owner.id) &&
    (!filters.assignee || task.assigneeUserIds.includes(filters.assignee.id))
  );
}

export function TaskPreview() {
  return (
    <I18nProvider>
      <TaskPreviewContent />
    </I18nProvider>
  );
}

function TaskPreviewContent() {
  const { t } = useI18n();
  const params = new URLSearchParams(window.location.search);
  const [dataset, setDataset] = useState<Dataset>('populated');
  const [view, setView] = useState<TaskView>(params.get('view') === 'list' ? 'list' : 'board');
  const [filters, setFilters] = useState<TaskFilters>(EMPTY_TASK_FILTERS);
  const [applied, setApplied] = useState<TaskFilters>(EMPTY_TASK_FILTERS);
  const [selectedId, setSelectedId] = useState<string | null>(params.get('task'));
  const access = useMemo(
    () => resolveTaskAccess([...taskUser.permissions, 'tasks:view_all', 'missions:view']),
    [],
  );
  const effective = dataset === 'filtered' ? { ...applied, search: 'no synthetic match' } : applied;
  const visible = (dataset === 'empty' ? [] : TASKS).filter((task) => matches(effective, task));
  const board = Object.fromEntries(
    TASK_BOARD_COLUMNS.map((column) => {
      const tasks = visible.filter((task) => task.status === column);
      return [
        column,
        {
          loadingMore: false,
          loadMoreFailed: false,
          page: 1,
          status: 'ready',
          tasks,
          total: tasks.length,
        },
      ];
    }),
  ) as unknown as TaskBoardState;
  const selected = TASKS.find((task) => task.id === selectedId);
  const ok = () => Promise.resolve(true);

  return (
    <AppShell
      apiState={{ message: 'hire-me-api is ok', status: 'ready' }}
      currentRoute="tasks"
      onLogout={() => undefined}
      onNavigate={() => undefined}
      onRefreshUser={() => undefined}
      user={taskUser}
    >
      <div className="task-preview__switches">
        <Select
          label={t('preview.task.dataset')}
          onChange={(event) => setDataset(event.target.value as Dataset)}
          value={dataset}
        >
          <option value="populated">{t('preview.task.populated')}</option>
          <option value="empty">{t('preview.task.empty')}</option>
          <option value="filtered">{t('preview.task.filtered')}</option>
        </Select>
      </div>
      <TaskWorkspace
        access={access}
        appliedFilters={effective}
        board={board}
        contextLabels={{
          [`recruitmentMissionId:${MISSIONS[0]!.id}`]: `${MISSIONS[0]!.label} · ${MISSIONS[0]!.detail}`,
        }}
        currentUser={PEOPLE.at(-1)!}
        detail={selected ? { status: 'ready', task: detailFor(selected) } : { status: 'idle' }}
        feedback={null}
        filters={filters}
        list={{ page: 1, status: 'ready', tasks: visible, total: visible.length }}
        loadOptions={loadOptions}
        notificationStatus=""
        notificationTotal={notifications.length}
        notifications={notifications}
        onAddAssignment={ok}
        onAddComment={ok}
        onAddReminder={ok}
        onApplyFilters={() => setApplied(filters)}
        onArchive={ok}
        onChangeOwner={ok}
        onCloseDetail={() => setSelectedId(null)}
        onCreate={ok}
        onFiltersChange={setFilters}
        onListPage={() => undefined}
        onLoadMore={() => undefined}
        onNotificationArchive={() => undefined}
        onNotificationFilter={() => undefined}
        onNotificationRead={() => undefined}
        onNotificationsReadAll={() => undefined}
        onProcessReminders={() => undefined}
        onResetFilters={() => {
          setFilters(EMPTY_TASK_FILTERS);
          setApplied(EMPTY_TASK_FILTERS);
        }}
        onRetryBoard={() => undefined}
        onRetryDetail={() => undefined}
        onRetryList={() => undefined}
        onSelect={setSelectedId}
        onTransition={ok}
        onUpdate={ok}
        onViewChange={setView}
        optionsKey="preview"
        pending={null}
        selectedId={selectedId}
        view={view}
      />
    </AppShell>
  );
}
