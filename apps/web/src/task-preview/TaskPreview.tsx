import type { Notification, TaskDetail, TaskSummary } from '@hire-me/contracts';
import { useMemo, useState } from 'react';

import { I18nProvider, useI18n } from '../i18n/index.js';
import { Select } from '../ui/index.js';
import { AppShell } from '../ui/shell/AppShell.js';
import { EMPTY_TASK_FILTERS, resolveTaskAccess, type TaskFilters } from '../tasks/task-state.js';
import { taskDetail, taskSummary, taskUser } from '../tasks/task-test-data.js';
import { TaskWorkspace } from '../tasks/TaskWorkspace.js';

type Dataset = 'empty' | 'filtered' | 'populated';

const taskTwo: TaskSummary = {
  ...taskSummary,
  assigneeUserIds: [],
  description: 'Prepare a concise briefing for the hiring manager.',
  dueAt: '2026-09-15T14:00:00.000Z',
  id: '22222222-2222-4222-8222-222222222222',
  priority: 'HIGH',
  status: 'IN_PROGRESS',
  title: 'Prepare interview briefing',
};

const taskThree: TaskSummary = {
  ...taskSummary,
  description: null,
  dueAt: null,
  id: '66666666-6666-4666-8666-666666666666',
  priority: 'NORMAL',
  status: 'WAITING',
  title: 'Confirm consultant availability',
};

const summaries = [taskSummary, taskTwo, taskThree];
const details = new Map<string, TaskDetail>([
  [taskDetail.id, taskDetail],
  [taskTwo.id, { ...taskDetail, ...taskTwo, assignments: [], comments: [], reminders: [] }],
  [taskThree.id, { ...taskDetail, ...taskThree, comments: [], reminders: [] }],
]);

const notifications: Notification[] = [
  {
    actorUserId: null,
    archivedAt: null,
    bodySummary: 'Review candidate follow-up is overdue.',
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
    type: 'TASK_OVERDUE',
    updatedAt: '2026-09-12T08:00:00.000Z',
  },
];

function matches(filters: TaskFilters, task: TaskSummary): boolean {
  const search = filters.search.trim().toLowerCase();
  return (
    (!search || `${task.title} ${task.description ?? ''}`.toLowerCase().includes(search)) &&
    (!filters.status || task.status === filters.status) &&
    (!filters.priority || task.priority === filters.priority) &&
    (!filters.ownerUserId || task.ownerUserId === filters.ownerUserId) &&
    (!filters.assigneeUserId || task.assigneeUserIds.includes(filters.assigneeUserId))
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
  const [dataset, setDataset] = useState<Dataset>('populated');
  const [filters, setFilters] = useState<TaskFilters>(EMPTY_TASK_FILTERS);
  const [applied, setApplied] = useState<TaskFilters>(EMPTY_TASK_FILTERS);
  const [selectedId, setSelectedId] = useState<string | null>(taskDetail.id);
  const [notificationStatus, setNotificationStatus] = useState<'' | 'UNREAD' | 'READ'>('');
  const access = useMemo(() => resolveTaskAccess(taskUser.permissions), []);
  const source = dataset === 'empty' ? [] : summaries;
  const effectiveFilters =
    dataset === 'filtered' ? { ...applied, search: 'no synthetic match' } : applied;
  const visible = source.filter((task) => matches(effectiveFilters, task));
  const selected = selectedId ? details.get(selectedId) : undefined;
  const visibleNotifications = notifications.filter(
    (item) => !notificationStatus || item.status === notificationStatus,
  );

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
          onChange={(event) => {
            const nextDataset = event.target.value as Dataset;
            setDataset(nextDataset);
            setSelectedId(nextDataset === 'populated' ? taskDetail.id : null);
          }}
          value={dataset}
        >
          <option value="populated">{t('preview.task.populated')}</option>
          <option value="empty">{t('preview.task.empty')}</option>
          <option value="filtered">{t('preview.task.filtered')}</option>
        </Select>
      </div>
      <TaskWorkspace
        access={access}
        appliedFilters={effectiveFilters}
        detail={selected ? { status: 'ready', task: selected } : { status: 'idle' }}
        feedback={null}
        filters={filters}
        list={{ status: 'ready', tasks: visible, total: visible.length }}
        notificationStatus={notificationStatus}
        notificationTotal={visibleNotifications.length}
        notifications={visibleNotifications}
        onAddAssignment={() => undefined}
        onAddComment={() => undefined}
        onAddReminder={() => undefined}
        onArchive={() => undefined}
        onChangeOwner={() => undefined}
        onCreate={() => Promise.resolve(true)}
        onFiltersChange={setFilters}
        onNotificationArchive={() => undefined}
        onNotificationFilter={setNotificationStatus}
        onNotificationRead={() => undefined}
        onNotificationsReadAll={() => undefined}
        onProcessReminders={() => undefined}
        onResetFilters={() => {
          setFilters({ ...EMPTY_TASK_FILTERS });
          setApplied({ ...EMPTY_TASK_FILTERS });
        }}
        onRetryDetail={() => undefined}
        onRetryList={() => undefined}
        onSearch={() => setApplied({ ...filters })}
        onSelect={setSelectedId}
        onTransition={() => undefined}
        onUpdate={() => Promise.resolve(true)}
        pending={null}
        selectedId={selectedId}
      />
    </AppShell>
  );
}
