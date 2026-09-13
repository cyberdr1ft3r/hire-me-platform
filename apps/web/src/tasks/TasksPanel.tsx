import type { AuthenticatedUser, Notification, TaskDetail, TaskStatus } from '@hire-me/contracts';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import {
  addTaskAssignment,
  archiveNotification,
  archiveTask,
  archiveTaskComment,
  cancelTaskReminder,
  changeTaskOwner,
  createTask,
  createTaskComment,
  createTaskReminder,
  getCandidate,
  getClient,
  getDocument,
  getMission,
  getTask,
  listCandidates,
  listClients,
  listDocuments,
  listMissionCandidates,
  listMissions,
  listNotifications,
  listTaskUserOptions,
  listTasks,
  markAllNotificationsRead,
  markNotificationRead,
  processDueTaskReminders,
  removeTaskAssignment,
  updateTask,
  updateTaskComment,
  updateTaskReminder,
  updateTaskStatus,
} from '../api.js';
import { useI18n } from '../i18n/index.js';
import { taskStatusLabelKey, type TaskContextField } from './task-labels.js';
import {
  EMPTY_TASK_FILTERS,
  TASK_BOARD_COLUMNS,
  boardState,
  resolveTaskAccess,
  taskListQuery,
  type LoadOptions,
  type OptionSource,
  type PickerOption,
  type TaskBoardColumn,
  type TaskBoardState,
  type TaskDetailState,
  type TaskFeedback,
  type TaskFilters,
  type TaskListState,
  type TaskView,
} from './task-state.js';
import type { TaskCreateValues } from './TaskCreateForm.js';
import type { TaskUpdateValues } from './TaskDetail.js';
import type { NotificationFilter } from './TaskNotifications.js';
import { TaskWorkspace } from './TaskWorkspace.js';

const OPTION_PAGE_SIZE = 20;

/**
 * Container for the Task pipeline. It owns every read, write, and guard; the
 * presentation receives state and callbacks only.
 *
 * Concurrency rules:
 *
 * - Every read carries a request number and commits only while it is the
 *   latest of its kind and the session that started it is still current.
 * - Writes are serialized by one global lock that is owned by an operation.
 *   Only the owning operation can release it, and a session change clears
 *   ownership, so an old session's late completion can neither unlock nor
 *   report into a newer session's write.
 * - A task-scoped result commits only while its task is still the selection.
 * - Post-write refreshes read the latest committed filters, never the filters
 *   captured when the write began.
 * - The unread notification count is its own read (unread only, one row, the
 *   total), so it stays correct whatever the notification filter shows.
 *
 * The locale is never an effect dependency: switching language re-renders and
 * never refetches.
 */
export function TasksPanel({
  accessToken,
  user,
}: {
  accessToken: string;
  user: AuthenticatedUser;
}) {
  const { t } = useI18n();
  const access = useMemo(() => resolveTaskAccess(user.permissions), [user.permissions]);
  const me = useMemo<PickerOption>(
    () => ({ detail: user.email, id: user.id, label: user.displayName, self: true }),
    [user.displayName, user.email, user.id],
  );

  const [view, setView] = useState<TaskView>('board');
  const [filters, setFilters] = useState<TaskFilters>(EMPTY_TASK_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<TaskFilters>(EMPTY_TASK_FILTERS);
  const [board, setBoard] = useState<TaskBoardState>(() => boardState({ status: 'loading' }));
  const [list, setList] = useState<TaskListState>({ status: 'loading' });
  const [listPage, setListPage] = useState(1);
  const [detail, setDetail] = useState<TaskDetailState>({ status: 'idle' });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [contextLabels, setContextLabels] = useState<Record<string, string | null>>({});
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [notificationTotal, setNotificationTotal] = useState(0);
  const [notificationUnread, setNotificationUnread] = useState<number | null>(null);
  const [notificationStatus, setNotificationStatus] = useState<NotificationFilter>('');
  const [pending, setPending] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<TaskFeedback | null>(null);
  const [sessionGeneration, setSessionGeneration] = useState(0);

  const boardGeneration = useRef(0);
  const listRequest = useRef(0);
  const detailRequest = useRef(0);
  const notificationRequest = useRef(0);
  const unreadRequest = useRef(0);
  const selectedRef = useRef<string | null>(null);
  const selectionGeneration = useRef(0);
  const appliedFiltersRef = useRef<TaskFilters>(EMPTY_TASK_FILTERS);
  const notificationStatusRef = useRef<NotificationFilter>('');
  const viewRef = useRef<TaskView>('board');
  const listPageRef = useRef(1);
  const sessionToken = useRef(accessToken);
  const contextLabelsRef = useRef<Record<string, string | null>>({});
  // The operation that currently owns the global write lock, or null.
  const writeOwner = useRef<number | null>(null);
  const operationSequence = useRef(0);

  useLayoutEffect(() => {
    if (sessionToken.current !== accessToken) {
      sessionToken.current = accessToken;
      boardGeneration.current += 1;
      listRequest.current += 1;
      detailRequest.current += 1;
      notificationRequest.current += 1;
      unreadRequest.current += 1;
      selectionGeneration.current += 1;
      selectedRef.current = null;
      writeOwner.current = null;
      contextLabelsRef.current = {};
      setSelectedId(null);
      setDetail({ status: 'idle' });
      setContextLabels({});
      setNotifications([]);
      setNotificationTotal(0);
      setNotificationUnread(null);
      setPending(null);
      setFeedback(null);
      setSessionGeneration((value) => value + 1);
    }
  }, [accessToken]);

  const isSession = (token: string) => token === sessionToken.current;

  // --- Reads ---------------------------------------------------------------

  function loadBoard(next: TaskFilters, quiet = false): void {
    const generation = ++boardGeneration.current;
    const token = accessToken;
    if (!quiet) setBoard(boardState({ status: 'loading' }));
    for (const column of TASK_BOARD_COLUMNS) {
      listTasks(token, taskListQuery(next, { page: 1, status: column }))
        .then((response) => {
          if (generation !== boardGeneration.current || !isSession(token)) return;
          setBoard((current) => ({
            ...current,
            [column]: {
              loadingMore: false,
              loadMoreFailed: false,
              page: 1,
              status: 'ready',
              tasks: response.tasks,
              total: response.pageInfo.total,
            },
          }));
        })
        .catch(() => {
          if (generation !== boardGeneration.current || !isSession(token) || quiet) return;
          setBoard((current) => ({ ...current, [column]: { status: 'error' } }));
        });
    }
  }

  function loadMore(column: TaskBoardColumn): void {
    const state = board[column];
    if (state.status !== 'ready' || state.loadingMore) return;
    const generation = boardGeneration.current;
    const token = accessToken;
    const nextPage = state.page + 1;
    setBoard((current) => ({
      ...current,
      [column]: { ...state, loadMoreFailed: false, loadingMore: true },
    }));
    listTasks(token, taskListQuery(appliedFiltersRef.current, { page: nextPage, status: column }))
      .then((response) => {
        if (generation !== boardGeneration.current || !isSession(token)) return;
        setBoard((current) => {
          const latest = current[column];
          if (latest.status !== 'ready') return current;
          const known = new Set(latest.tasks.map((task) => task.id));
          return {
            ...current,
            [column]: {
              ...latest,
              loadingMore: false,
              page: nextPage,
              tasks: [...latest.tasks, ...response.tasks.filter((task) => !known.has(task.id))],
              total: response.pageInfo.total,
            },
          };
        });
      })
      .catch(() => {
        if (generation !== boardGeneration.current || !isSession(token)) return;
        setBoard((current) => {
          const latest = current[column];
          return latest.status === 'ready'
            ? { ...current, [column]: { ...latest, loadMoreFailed: true, loadingMore: false } }
            : current;
        });
      });
  }

  function loadList(next: TaskFilters, page: number, quiet = false): void {
    const request = ++listRequest.current;
    const token = accessToken;
    if (!quiet) setList({ status: 'loading' });
    listTasks(token, taskListQuery(next, { page }))
      .then((response) => {
        if (request !== listRequest.current || !isSession(token)) return;
        setList({ page, status: 'ready', tasks: response.tasks, total: response.pageInfo.total });
      })
      .catch(() => {
        if (request === listRequest.current && isSession(token) && !quiet) {
          setList({ status: 'error' });
        }
      });
  }

  function resolveContextLabels(task: TaskDetail): void {
    const token = accessToken;
    const entries = (Object.entries(task.context) as [TaskContextField, string | null][]).filter(
      (entry): entry is [TaskContextField, string] => Boolean(entry[1]),
    );
    for (const [field, id] of entries) {
      const key = `${field}:${id}`;
      if (key in contextLabelsRef.current) continue;
      const request = contextLabelRequest(field, id, task);
      const settle = (label: string | null) => {
        if (!isSession(token)) return;
        contextLabelsRef.current = { ...contextLabelsRef.current, [key]: label };
        setContextLabels(contextLabelsRef.current);
      };
      if (!request) {
        settle(null);
        continue;
      }
      request.then(settle, () => settle(null));
    }
  }

  /** The linked record's own name, through its module's permission-checked read. */
  function contextLabelRequest(
    field: TaskContextField,
    id: string,
    task: TaskDetail,
  ): Promise<string> | null {
    const has = (permission: string) => user.permissions.includes(permission);
    switch (field) {
      case 'clientId':
        return has('clients:view')
          ? getClient(accessToken, id).then((response) => response.client.name)
          : null;
      case 'candidateId':
        return has('candidates:view')
          ? getCandidate(accessToken, id).then((response) => response.candidate.displayName)
          : null;
      case 'recruitmentMissionId':
        return has('missions:view')
          ? getMission(accessToken, id).then(
              (response) => `${response.mission.title} · ${response.mission.clientName}`,
            )
          : null;
      case 'documentId':
        return has('documents:view')
          ? getDocument(accessToken, id).then((response) => response.document.title)
          : null;
      case 'missionCandidateId': {
        const missionId = task.context.recruitmentMissionId;
        return missionId && has('mission_candidates:view')
          ? listMissionCandidates(accessToken, missionId).then((response) => {
              const match = response.candidates.find((entry) => entry.id === id);
              if (!match) throw new Error('not found');
              return match.candidate.displayName;
            })
          : null;
      }
      default:
        return null;
    }
  }

  function loadDetail(taskId: string, quiet = false): void {
    const request = ++detailRequest.current;
    const token = accessToken;
    if (!quiet) setDetail({ status: 'loading', taskId });
    getTask(token, taskId)
      .then((response) => {
        if (
          request !== detailRequest.current ||
          selectedRef.current !== taskId ||
          !isSession(token)
        ) {
          return;
        }
        setDetail({ status: 'ready', task: response.task });
        resolveContextLabels(response.task);
      })
      .catch(() => {
        if (
          request === detailRequest.current &&
          selectedRef.current === taskId &&
          isSession(token) &&
          !quiet
        ) {
          setDetail({ status: 'error', taskId });
        }
      });
  }

  function loadNotificationList(): void {
    if (!access.canViewNotifications) return;
    const request = ++notificationRequest.current;
    const token = accessToken;
    // Always the latest committed filter, never the one a write started under.
    const status = notificationStatusRef.current;
    listNotifications(token, { pageSize: 25, status: status || undefined })
      .then((response) => {
        if (request !== notificationRequest.current || !isSession(token)) return;
        setNotifications(response.notifications);
        setNotificationTotal(response.pageInfo.total);
      })
      .catch(() => undefined);
  }

  /** The unread total from the same scoped list, whatever the filter shows. */
  function loadUnreadCount(): void {
    if (!access.canViewNotifications) return;
    const request = ++unreadRequest.current;
    const token = accessToken;
    listNotifications(token, { page: 1, pageSize: 1, status: 'UNREAD' })
      .then((response) => {
        if (request !== unreadRequest.current || !isSession(token)) return;
        setNotificationUnread(response.pageInfo.total);
      })
      .catch(() => undefined);
  }

  function refreshNotifications(): void {
    loadNotificationList();
    loadUnreadCount();
  }

  function reloadCurrentView(quiet = false): void {
    if (viewRef.current === 'board') loadBoard(appliedFiltersRef.current, quiet);
    else loadList(appliedFiltersRef.current, listPageRef.current, quiet);
  }

  useEffect(() => {
    reloadCurrentView();
    return () => {
      boardGeneration.current += 1;
      listRequest.current += 1;
    };
  }, [accessToken, appliedFilters, view, listPage]);

  useEffect(() => {
    loadNotificationList();
  }, [accessToken, access.canViewNotifications, notificationStatus]);

  // Not tied to the filter: changing what the list shows never changes the unread total.
  useEffect(() => {
    loadUnreadCount();
  }, [accessToken, access.canViewNotifications]);

  // --- Selection -----------------------------------------------------------

  function select(taskId: string): void {
    selectionGeneration.current += 1;
    selectedRef.current = taskId;
    setSelectedId(taskId);
    setFeedback((current) => (current?.scope === 'task' ? null : current));
    loadDetail(taskId);
  }

  function closeDetail(): void {
    selectionGeneration.current += 1;
    detailRequest.current += 1;
    selectedRef.current = null;
    setSelectedId(null);
    setDetail({ status: 'idle' });
    setFeedback((current) => (current?.scope === 'task' ? null : current));
  }

  /** True only while the same task is selected in the same session. */
  function captureSelection(taskId: string | null) {
    const generation = selectionGeneration.current;
    const token = accessToken;
    return () =>
      generation === selectionGeneration.current &&
      selectedRef.current === taskId &&
      isSession(token);
  }

  // --- Writes --------------------------------------------------------------

  function begin(action: string): number | null {
    if (writeOwner.current !== null) return null;
    const operation = ++operationSequence.current;
    writeOwner.current = operation;
    setPending(action);
    setFeedback(null);
    return operation;
  }

  /** Only the operation that owns the lock may release it. */
  function end(operation: number): void {
    if (writeOwner.current !== operation) return;
    writeOwner.current = null;
    setPending(null);
  }

  const owns = (operation: number) => writeOwner.current === operation;

  function refreshAfterWrite(): void {
    reloadCurrentView(true);
  }

  async function mutateSelected(
    action: string,
    request: (taskId: string) => Promise<{ task: TaskDetail }>,
    success: (task: TaskDetail) => string,
  ): Promise<boolean> {
    const taskId = selectedRef.current;
    if (!taskId) return false;
    const operation = begin(action);
    if (operation === null) return false;
    const isCurrent = captureSelection(taskId);
    try {
      const response = await request(taskId);
      if (!owns(operation)) return false;
      refreshAfterWrite();
      if (!isCurrent()) return false;
      detailRequest.current += 1;
      setDetail({ status: 'ready', task: response.task });
      resolveContextLabels(response.task);
      setFeedback({ message: success(response.task), scope: 'task', tone: 'success' });
      return true;
    } catch {
      if (owns(operation) && isCurrent()) {
        setFeedback({ message: t('task.feedback.failed'), scope: 'task', tone: 'danger' });
      }
      return false;
    } finally {
      end(operation);
    }
  }

  /** Comment and reminder writes return the child record; the task is re-read quietly. */
  async function mutateChild(
    action: string,
    request: (taskId: string) => Promise<unknown>,
    success: string,
    notify: boolean,
  ): Promise<boolean> {
    const taskId = selectedRef.current;
    if (!taskId) return false;
    const operation = begin(action);
    if (operation === null) return false;
    const isCurrent = captureSelection(taskId);
    try {
      await request(taskId);
      if (!owns(operation)) return false;
      if (notify) refreshNotifications();
      if (!isCurrent()) return false;
      setFeedback({ message: success, scope: 'task', tone: 'success' });
      loadDetail(taskId, true);
      return true;
    } catch {
      if (owns(operation) && isCurrent()) {
        setFeedback({ message: t('task.feedback.failed'), scope: 'task', tone: 'danger' });
      }
      return false;
    } finally {
      end(operation);
    }
  }

  async function handleCreate(values: TaskCreateValues): Promise<boolean> {
    const operation = begin('create');
    if (operation === null) return false;
    const isCurrent = captureSelection(selectedRef.current);
    try {
      const response = await createTask(accessToken, {
        assigneeUserIds: values.assigneeUserId ? [values.assigneeUserId] : [],
        context: values.context,
        description: values.description,
        dueAt: values.dueAt,
        ownerUserId: user.id,
        priority: values.priority,
        title: values.title,
      });
      if (!owns(operation)) return false;
      refreshAfterWrite();
      refreshNotifications();
      if (isCurrent()) {
        selectionGeneration.current += 1;
        detailRequest.current += 1;
        selectedRef.current = response.task.id;
        setSelectedId(response.task.id);
        setDetail({ status: 'ready', task: response.task });
        resolveContextLabels(response.task);
        setFeedback({ message: t('task.feedback.created'), scope: 'task', tone: 'success' });
      } else {
        setFeedback({ message: t('task.feedback.created'), scope: 'page', tone: 'success' });
      }
      return true;
    } catch {
      if (owns(operation)) {
        setFeedback({ message: t('task.feedback.failed'), scope: 'page', tone: 'danger' });
      }
      return false;
    } finally {
      end(operation);
    }
  }

  function handleUpdate(values: TaskUpdateValues): Promise<boolean> {
    return mutateSelected(
      'update',
      (taskId) =>
        updateTask(accessToken, taskId, {
          description: values.description,
          // Omitted when untouched, so the stored instant is preserved exactly.
          ...(values.dueAt === undefined ? {} : { dueAt: values.dueAt }),
          priority: values.priority,
          timezone: values.timezone,
          title: values.title,
        }),
      () => t('task.feedback.updated'),
    );
  }

  function pageWrite(action: string, request: () => Promise<unknown>): void {
    const operation = begin(action);
    if (operation === null) return;
    request()
      .then(() => {
        if (owns(operation)) refreshNotifications();
      })
      .catch(() => {
        if (owns(operation)) {
          setFeedback({ message: t('task.feedback.failed'), scope: 'page', tone: 'danger' });
        }
      })
      .finally(() => end(operation));
  }

  // --- Options ---------------------------------------------------------------

  const loadOptions = useCallback<LoadOptions>(
    (source: OptionSource, search: string) => {
      const query = search || undefined;
      switch (source.type) {
        case 'person':
          return listTaskUserOptions(accessToken, {
            purpose: source.purpose,
            search: query,
            taskId: source.taskId,
          }).then((response) =>
            response.users.map((person) => ({
              detail: person.email,
              id: person.id,
              label: person.displayName,
              self: person.id === user.id,
            })),
          );
        case 'missionCandidate':
          return listMissionCandidates(accessToken, source.missionId).then((response) =>
            response.candidates
              .filter((entry) =>
                query
                  ? entry.candidate.displayName.toLowerCase().includes(query.toLowerCase())
                  : true,
              )
              .slice(0, OPTION_PAGE_SIZE)
              .map((entry) => ({
                detail: entry.candidate.email ?? undefined,
                id: entry.id,
                label: entry.candidate.displayName,
              })),
          );
        default:
          switch (source.kind) {
            case 'client':
              return listClients({ accessToken, pageSize: OPTION_PAGE_SIZE, search: query }).then(
                (response) =>
                  response.clients.map((client) => ({
                    detail: client.city ?? undefined,
                    id: client.id,
                    label: client.name,
                  })),
              );
            case 'candidate':
              return listCandidates({
                accessToken,
                pageSize: OPTION_PAGE_SIZE,
                search: query,
              }).then((response) =>
                response.candidates.map((candidate) => ({
                  detail: candidate.email ?? candidate.currentJobTitle ?? undefined,
                  id: candidate.id,
                  label: candidate.displayName,
                })),
              );
            case 'mission':
              return listMissions({ accessToken, pageSize: OPTION_PAGE_SIZE, search: query }).then(
                (response) =>
                  response.missions.map((mission) => ({
                    detail: mission.clientName,
                    id: mission.id,
                    label: mission.title,
                  })),
              );
            default:
              return listDocuments({ accessToken, pageSize: OPTION_PAGE_SIZE, search: query }).then(
                (response) =>
                  response.documents.map((document) => ({
                    id: document.id,
                    label: document.title,
                  })),
              );
          }
      }
    },
    [accessToken, user.id],
  );

  return (
    <TaskWorkspace
      access={access}
      appliedFilters={appliedFilters}
      board={board}
      contextLabels={contextLabels}
      currentUser={me}
      detail={detail}
      feedback={feedback}
      filters={filters}
      list={list}
      loadOptions={loadOptions}
      notificationStatus={notificationStatus}
      notificationTotal={notificationTotal}
      notificationUnread={notificationUnread}
      notifications={notifications}
      onAddAssignment={(values) =>
        mutateSelected(
          'assignment',
          (taskId) => addTaskAssignment(accessToken, taskId, values),
          () => t('task.feedback.assignmentAdded'),
        ).then((ok) => {
          if (ok) refreshNotifications();
          return ok;
        })
      }
      onAddComment={(values) =>
        mutateChild(
          'comment',
          (taskId) => createTaskComment(accessToken, taskId, values),
          t('task.feedback.commentAdded'),
          true,
        )
      }
      onAddReminder={(values) =>
        mutateChild(
          'reminder',
          (taskId) => createTaskReminder(accessToken, taskId, values),
          t('task.feedback.reminderAdded'),
          false,
        )
      }
      onApplyFilters={() => {
        appliedFiltersRef.current = filters;
        listPageRef.current = 1;
        setListPage(1);
        setAppliedFilters(filters);
      }}
      onArchive={(reason) =>
        mutateSelected(
          'archive',
          (taskId) => archiveTask(accessToken, taskId, reason),
          () => t('task.feedback.archived'),
        )
      }
      onArchiveComment={(commentId) =>
        mutateChild(
          'archiveComment',
          (taskId) => archiveTaskComment(accessToken, taskId, commentId),
          t('task.feedback.commentArchived'),
          false,
        )
      }
      onCancelReminder={(reminderId) =>
        mutateChild(
          'cancelReminder',
          (taskId) => cancelTaskReminder(accessToken, taskId, reminderId),
          t('task.feedback.reminderCanceled'),
          false,
        )
      }
      onChangeOwner={(values) =>
        mutateSelected(
          'owner',
          (taskId) => changeTaskOwner(accessToken, taskId, values),
          () => t('task.feedback.ownerChanged'),
        ).then((ok) => {
          if (ok) refreshNotifications();
          return ok;
        })
      }
      onCloseDetail={closeDetail}
      onCreate={handleCreate}
      onEditComment={(values) =>
        mutateChild(
          'editComment',
          // Only the text is sent: the comment's mentions stay as they were.
          (taskId) =>
            updateTaskComment(accessToken, taskId, values.commentId, { body: values.body }),
          t('task.feedback.commentEdited'),
          false,
        )
      }
      onFiltersChange={setFilters}
      onListPage={(page) => {
        listPageRef.current = page;
        setListPage(page);
      }}
      onLoadMore={loadMore}
      onNotificationArchive={(id) =>
        pageWrite('notification', () => archiveNotification(accessToken, id))
      }
      onNotificationFilter={(status) => {
        notificationStatusRef.current = status;
        setNotificationStatus(status);
      }}
      onNotificationRead={(id) =>
        pageWrite('notification', () => markNotificationRead(accessToken, id))
      }
      onNotificationsReadAll={() =>
        pageWrite('notifications', () => markAllNotificationsRead(accessToken))
      }
      // The notification only says which task; the task read decides access.
      onOpenTask={select}
      onProcessReminders={() => {
        const operation = begin('process-reminders');
        if (operation === null) return;
        processDueTaskReminders(accessToken)
          .then((response) => {
            if (!owns(operation)) return;
            setFeedback({
              message: t('task.feedback.remindersProcessed', {
                delivered: response.remindersDelivered,
                overdue: response.overdueNotificationsCreated,
              }),
              scope: 'page',
              tone: 'success',
            });
            refreshNotifications();
          })
          .catch(() => {
            if (owns(operation)) {
              setFeedback({ message: t('task.feedback.failed'), scope: 'page', tone: 'danger' });
            }
          })
          .finally(() => end(operation));
      }}
      onResetFilters={() => {
        appliedFiltersRef.current = { ...EMPTY_TASK_FILTERS };
        listPageRef.current = 1;
        setFilters({ ...EMPTY_TASK_FILTERS });
        setListPage(1);
        setAppliedFilters(appliedFiltersRef.current);
      }}
      onRemoveAssignment={(values) =>
        mutateSelected(
          'removeAssignment',
          (taskId) =>
            removeTaskAssignment(accessToken, taskId, values.assignmentId, {
              reason: values.reason,
            }),
          () => t('task.feedback.assignmentRemoved'),
        )
      }
      onRescheduleReminder={(values) =>
        mutateChild(
          'rescheduleReminder',
          (taskId) =>
            updateTaskReminder(accessToken, taskId, values.reminderId, {
              remindAt: values.remindAt,
            }),
          t('task.feedback.reminderRescheduled'),
          false,
        )
      }
      onRetryBoard={() => loadBoard(appliedFiltersRef.current)}
      onRetryDetail={() => {
        if (selectedRef.current) loadDetail(selectedRef.current);
      }}
      onRetryList={() => loadList(appliedFiltersRef.current, listPageRef.current)}
      onSelect={select}
      onTransition={(status: TaskStatus, reason) =>
        mutateSelected(
          'transition',
          (taskId) => updateTaskStatus(accessToken, taskId, { reason, status }),
          (task) =>
            t('task.feedback.statusChanged', { status: t(taskStatusLabelKey(task.status)) }),
        ).then((ok) => {
          if (ok) refreshNotifications();
          return ok;
        })
      }
      onUpdate={handleUpdate}
      onViewChange={(next) => {
        viewRef.current = next;
        setView(next);
      }}
      optionsKey={`session-${sessionGeneration}`}
      pending={pending}
      selectedId={selectedId}
      view={view}
    />
  );
}
