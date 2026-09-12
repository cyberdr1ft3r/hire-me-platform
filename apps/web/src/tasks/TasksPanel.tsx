import type { AuthenticatedUser, TaskDetail, TaskStatus } from '@hire-me/contracts';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import {
  addTaskAssignment,
  archiveNotification,
  archiveTask,
  changeTaskOwner,
  createTask,
  createTaskComment,
  createTaskReminder,
  getTask,
  listNotifications,
  listTasks,
  markAllNotificationsRead,
  markNotificationRead,
  processDueTaskReminders,
  updateTask,
  updateTaskStatus,
} from '../api.js';
import { useI18n } from '../i18n/index.js';
import { taskStatusLabelKey } from './task-labels.js';
import {
  EMPTY_TASK_FILTERS,
  TASK_PAGE_SIZE,
  resolveTaskAccess,
  type TaskDetailState,
  type TaskFilters,
  type TaskListState,
} from './task-state.js';
import { TaskWorkspace } from './TaskWorkspace.js';

function value(form: HTMLFormElement, name: string): string {
  const entry = new FormData(form).get(name);
  return typeof entry === 'string' ? entry.trim() : '';
}

function localDateTimeToIso(input: string): string | null {
  if (!input) return null;
  const date = new Date(input);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function TasksPanel({
  accessToken,
  user,
}: {
  accessToken: string;
  user: AuthenticatedUser;
}) {
  const { t } = useI18n();
  const access = useMemo(() => resolveTaskAccess(user.permissions), [user.permissions]);
  const [filters, setFilters] = useState<TaskFilters>(EMPTY_TASK_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<TaskFilters>(EMPTY_TASK_FILTERS);
  const [list, setList] = useState<TaskListState>({ status: 'loading' });
  const [detail, setDetail] = useState<TaskDetailState>({ status: 'idle' });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<
    Awaited<ReturnType<typeof listNotifications>>['notifications']
  >([]);
  const [notificationTotal, setNotificationTotal] = useState(0);
  const [notificationStatus, setNotificationStatus] = useState<'' | 'UNREAD' | 'READ'>('');
  const [pending, setPending] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; tone: 'success' | 'danger' } | null>(
    null,
  );

  const listRequest = useRef(0);
  const detailRequest = useRef(0);
  const notificationRequest = useRef(0);
  const selectedRef = useRef<string | null>(null);
  const contextGeneration = useRef(0);
  const writeInFlight = useRef(false);
  const appliedFiltersRef = useRef<TaskFilters>(EMPTY_TASK_FILTERS);
  const sessionToken = useRef(accessToken);

  useLayoutEffect(() => {
    if (sessionToken.current !== accessToken) {
      contextGeneration.current += 1;
      listRequest.current += 1;
      detailRequest.current += 1;
      notificationRequest.current += 1;
      selectedRef.current = null;
      writeInFlight.current = false;
      setSelectedId(null);
      setDetail({ status: 'idle' });
      setNotifications([]);
      setNotificationTotal(0);
      setPending(null);
      setFeedback(null);
    }
    sessionToken.current = accessToken;
  }, [accessToken]);

  async function loadList(next: TaskFilters, quiet = false): Promise<void> {
    const request = ++listRequest.current;
    if (!quiet) setList({ status: 'loading' });
    try {
      const response = await listTasks(accessToken, {
        assigneeUserId: next.assigneeUserId || undefined,
        ownerUserId: next.ownerUserId || undefined,
        pageSize: TASK_PAGE_SIZE,
        priority: next.priority || undefined,
        search: next.search || undefined,
        status: next.status || undefined,
      });
      if (request !== listRequest.current || accessToken !== sessionToken.current) return;
      setList({ status: 'ready', tasks: response.tasks, total: response.pageInfo.total });
      const current = selectedRef.current;
      if (!current && response.tasks[0]) select(response.tasks[0].id);
      else if (current && !response.tasks.some((task) => task.id === current)) {
        contextGeneration.current += 1;
        selectedRef.current = null;
        setSelectedId(null);
        setDetail({ status: 'idle' });
      }
    } catch {
      if (request === listRequest.current && !quiet && accessToken === sessionToken.current)
        setList({ status: 'error' });
    }
  }

  async function loadDetail(taskId: string, quiet = false): Promise<void> {
    const request = ++detailRequest.current;
    if (!quiet) setDetail({ status: 'loading', taskId });
    try {
      const response = await getTask(accessToken, taskId);
      if (
        request === detailRequest.current &&
        selectedRef.current === taskId &&
        accessToken === sessionToken.current
      )
        setDetail({ status: 'ready', task: response.task });
    } catch {
      if (
        request === detailRequest.current &&
        selectedRef.current === taskId &&
        !quiet &&
        accessToken === sessionToken.current
      )
        setDetail({ status: 'error', taskId });
    }
  }

  function select(taskId: string): void {
    contextGeneration.current += 1;
    selectedRef.current = taskId;
    setSelectedId(taskId);
    setFeedback(null);
    void loadDetail(taskId);
  }

  useEffect(() => {
    void loadList(appliedFilters);
    return () => {
      listRequest.current += 1;
    };
  }, [accessToken, appliedFilters]);

  useEffect(() => {
    if (!access.canViewNotifications) return;
    let current = true;
    const request = ++notificationRequest.current;
    void listNotifications(accessToken, { pageSize: 25, status: notificationStatus || undefined })
      .then((response) => {
        if (
          current &&
          request === notificationRequest.current &&
          accessToken === sessionToken.current
        ) {
          setNotifications(response.notifications);
          setNotificationTotal(response.pageInfo.total);
        }
      })
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [accessToken, access.canViewNotifications, notificationStatus]);

  useEffect(
    () => () => {
      contextGeneration.current += 1;
      detailRequest.current += 1;
    },
    [accessToken],
  );

  function applyFilters(next: TaskFilters): void {
    appliedFiltersRef.current = next;
    setAppliedFilters(next);
  }

  function refreshAfterWrite(session: string): void {
    if (session === sessionToken.current) void loadList(appliedFiltersRef.current, true);
  }

  function begin(action: string): boolean {
    if (writeInFlight.current) return false;
    writeInFlight.current = true;
    setPending(action);
    setFeedback(null);
    return true;
  }

  function end(): void {
    writeInFlight.current = false;
    setPending(null);
  }

  function capture(taskId: string | null) {
    const generation = contextGeneration.current;
    return () =>
      generation === contextGeneration.current &&
      selectedRef.current === taskId &&
      accessToken === sessionToken.current;
  }

  function commit(task: TaskDetail, isCurrent: () => boolean): void {
    if (!isCurrent()) return;
    detailRequest.current += 1;
    setDetail({ status: 'ready', task });
  }

  async function mutateSelected(
    action: string,
    request: (taskId: string) => Promise<{ task: TaskDetail }>,
    success: (task: TaskDetail) => string,
  ): Promise<boolean> {
    const taskId = selectedRef.current;
    if (!taskId || !begin(action)) return false;
    const isCurrent = capture(taskId);
    try {
      const response = await request(taskId);
      refreshAfterWrite(accessToken);
      if (isCurrent()) {
        commit(response.task, isCurrent);
        setFeedback({ message: success(response.task), tone: 'success' });
      }
      return true;
    } catch {
      if (isCurrent()) setFeedback({ message: t('task.feedback.failed'), tone: 'danger' });
      return false;
    } finally {
      end();
    }
  }

  async function handleCreate(form: HTMLFormElement): Promise<boolean> {
    if (!begin('create')) return false;
    const previousSelection = selectedRef.current;
    const isCurrent = capture(previousSelection);
    try {
      const assignee = value(form, 'assigneeUserId');
      const response = await createTask(accessToken, {
        assigneeUserIds: assignee ? [assignee] : [],
        context: {
          missionCandidateId: value(form, 'missionCandidateId') || null,
          recruitmentMissionId: value(form, 'recruitmentMissionId') || null,
        },
        description: value(form, 'description') || null,
        dueAt: localDateTimeToIso(value(form, 'dueAt')),
        ownerUserId: user.id,
        priority: value(form, 'priority') as TaskDetail['priority'],
        title: value(form, 'title'),
      });
      refreshAfterWrite(accessToken);
      if (isCurrent()) {
        contextGeneration.current += 1;
        selectedRef.current = response.task.id;
        setSelectedId(response.task.id);
        setDetail({ status: 'ready', task: response.task });
        setFeedback({ message: t('task.feedback.created'), tone: 'success' });
      }
      form.reset();
      return true;
    } catch {
      if (isCurrent()) setFeedback({ message: t('task.feedback.failed'), tone: 'danger' });
      return false;
    } finally {
      end();
    }
  }

  async function handleUpdate(form: HTMLFormElement): Promise<boolean> {
    return mutateSelected(
      'update',
      (taskId) =>
        updateTask(accessToken, taskId, {
          description: value(form, 'description') || null,
          dueAt: localDateTimeToIso(value(form, 'dueAt')),
          priority: value(form, 'priority') as TaskDetail['priority'],
          timezone: value(form, 'timezone') || null,
          title: value(form, 'title'),
        }),
      () => t('task.feedback.updated'),
    );
  }

  async function refreshNotifications(status = notificationStatus): Promise<void> {
    if (!access.canViewNotifications || accessToken !== sessionToken.current) return;
    const request = ++notificationRequest.current;
    try {
      const response = await listNotifications(accessToken, {
        pageSize: 25,
        status: status || undefined,
      });
      if (request === notificationRequest.current && accessToken === sessionToken.current) {
        setNotifications(response.notifications);
        setNotificationTotal(response.pageInfo.total);
      }
    } catch {
      /* task actions remain successful if notification refresh fails */
    }
  }

  return (
    <TaskWorkspace
      access={access}
      appliedFilters={appliedFilters}
      detail={detail}
      feedback={feedback}
      filters={filters}
      list={list}
      notificationStatus={notificationStatus}
      notificationTotal={notificationTotal}
      notifications={notifications}
      onAddAssignment={(form) =>
        void mutateSelected(
          'assignment',
          (id) =>
            addTaskAssignment(accessToken, id, {
              userId: value(form, 'userId'),
              reason: value(form, 'reason') || null,
            }),
          () => t('task.feedback.assignmentAdded'),
        ).then((ok) => {
          if (ok) {
            form.reset();
            void refreshNotifications();
          }
        })
      }
      onAddComment={(form) => {
        const taskId = selectedRef.current;
        if (!taskId || !begin('comment')) return;
        const isCurrent = capture(taskId);
        void createTaskComment(accessToken, taskId, {
          body: value(form, 'body'),
          mentionedUserIds: value(form, 'mentionedUserIds')
            .split(',')
            .map((id) => id.trim())
            .filter(Boolean),
        })
          .then(() => {
            if (isCurrent()) {
              form.reset();
              setFeedback({ message: t('task.feedback.commentAdded'), tone: 'success' });
              void loadDetail(taskId, true);
            }
            void refreshNotifications();
          })
          .catch(() => {
            if (isCurrent()) setFeedback({ message: t('task.feedback.failed'), tone: 'danger' });
          })
          .finally(end);
      }}
      onAddReminder={(form) => {
        const taskId = selectedRef.current;
        if (!taskId || !begin('reminder')) return;
        const isCurrent = capture(taskId);
        void createTaskReminder(accessToken, taskId, {
          recipientUserId: value(form, 'recipientUserId'),
          remindAt: localDateTimeToIso(value(form, 'remindAt')) ?? new Date().toISOString(),
        })
          .then(() => {
            if (isCurrent()) {
              form.reset();
              setFeedback({ message: t('task.feedback.reminderAdded'), tone: 'success' });
              void loadDetail(taskId, true);
            }
          })
          .catch(() => {
            if (isCurrent()) setFeedback({ message: t('task.feedback.failed'), tone: 'danger' });
          })
          .finally(end);
      }}
      onArchive={(reason) =>
        void mutateSelected(
          'archive',
          (id) => archiveTask(accessToken, id, reason),
          () => t('task.feedback.archived'),
        )
      }
      onChangeOwner={(form) =>
        void mutateSelected(
          'owner',
          (id) =>
            changeTaskOwner(accessToken, id, {
              ownerUserId: value(form, 'ownerUserId'),
              reason: value(form, 'reason') || null,
            }),
          () => t('task.feedback.ownerChanged'),
        ).then((ok) => {
          if (ok) {
            form.reset();
            void refreshNotifications();
          }
        })
      }
      onCreate={handleCreate}
      onFiltersChange={setFilters}
      onNotificationArchive={(id) => {
        if (!begin('notification')) return;
        void archiveNotification(accessToken, id)
          .then(() => refreshNotifications())
          .catch(() => setFeedback({ message: t('task.feedback.failed'), tone: 'danger' }))
          .finally(end);
      }}
      onNotificationFilter={(status) => {
        setNotificationStatus(status);
      }}
      onNotificationRead={(id) => {
        if (!begin('notification')) return;
        void markNotificationRead(accessToken, id)
          .then(() => refreshNotifications())
          .catch(() => setFeedback({ message: t('task.feedback.failed'), tone: 'danger' }))
          .finally(end);
      }}
      onNotificationsReadAll={() => {
        if (!begin('notifications')) return;
        void markAllNotificationsRead(accessToken)
          .then(() => refreshNotifications())
          .catch(() => setFeedback({ message: t('task.feedback.failed'), tone: 'danger' }))
          .finally(end);
      }}
      onProcessReminders={() => {
        if (!begin('process-reminders')) return;
        void processDueTaskReminders(accessToken)
          .then((response) => {
            setFeedback({
              message: t('task.feedback.remindersProcessed', {
                delivered: response.remindersDelivered,
                overdue: response.overdueNotificationsCreated,
              }),
              tone: 'success',
            });
            void refreshNotifications();
          })
          .catch(() => setFeedback({ message: t('task.feedback.failed'), tone: 'danger' }))
          .finally(end);
      }}
      onResetFilters={() => {
        setFilters({ ...EMPTY_TASK_FILTERS });
        applyFilters({ ...EMPTY_TASK_FILTERS });
      }}
      onRetryDetail={() => {
        if (selectedRef.current) void loadDetail(selectedRef.current);
      }}
      onRetryList={() => applyFilters({ ...appliedFiltersRef.current })}
      onSearch={() => applyFilters({ ...filters })}
      onSelect={select}
      onTransition={(status: TaskStatus, reason) =>
        void mutateSelected(
          'transition',
          (id) => updateTaskStatus(accessToken, id, { status, reason }),
          (task) =>
            t('task.feedback.statusChanged', { status: t(taskStatusLabelKey(task.status)) }),
        ).then((ok) => {
          if (ok) void refreshNotifications();
        })
      }
      onUpdate={handleUpdate}
      pending={pending}
      selectedId={selectedId}
    />
  );
}
