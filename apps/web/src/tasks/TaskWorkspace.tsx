import type { Notification, TaskStatus } from '@hire-me/contracts';
import { useEffect, useRef, useState } from 'react';

import { useI18n } from '../i18n/index.js';
import { Button, InlineMessage, PageHeader } from '../ui/index.js';
import { TaskBoard } from './TaskBoard.js';
import { TaskCreateForm, type TaskCreateValues } from './TaskCreateForm.js';
import { TaskDetailPanel, type TaskUpdateValues } from './TaskDetail.js';
import { TaskFilterBar } from './TaskFilters.js';
import { TaskListView } from './TaskListView.js';
import {
  ReminderDiagnostics,
  TaskNotifications,
  type NotificationFilter,
} from './TaskNotifications.js';
import {
  TASK_BOARD_COLUMNS,
  hasTaskFilters,
  type LoadOptions,
  type PickerOption,
  type TaskAccess,
  type TaskBoardColumn,
  type TaskBoardState,
  type TaskDetailState,
  type TaskFeedback,
  type TaskFilters,
  type TaskListState,
  type TaskView,
} from './task-state.js';
import './task.css';

export interface TaskWorkspaceProps {
  access: TaskAccess;
  appliedFilters: TaskFilters;
  board: TaskBoardState;
  contextLabels: Readonly<Record<string, string | null>>;
  currentUser: PickerOption;
  detail: TaskDetailState;
  feedback: TaskFeedback | null;
  filters: TaskFilters;
  list: TaskListState;
  loadOptions: LoadOptions;
  notificationStatus: NotificationFilter;
  notificationTotal: number;
  notifications: Notification[];
  /** Changes when the session changes, so every selector reloads its options. */
  optionsKey: string;
  pending: string | null;
  selectedId: string | null;
  view: TaskView;
  onAddAssignment: (values: { reason: string | null; userId: string }) => Promise<boolean>;
  onAddComment: (values: { body: string; mentionedUserIds: string[] }) => Promise<boolean>;
  onAddReminder: (values: { recipientUserId: string; remindAt: string }) => Promise<boolean>;
  onApplyFilters: () => void;
  onArchive: (reason: string) => Promise<boolean>;
  onChangeOwner: (values: { ownerUserId: string; reason: string | null }) => Promise<boolean>;
  onCloseDetail: () => void;
  onCreate: (values: TaskCreateValues) => Promise<boolean>;
  onFiltersChange: (filters: TaskFilters) => void;
  onListPage: (page: number) => void;
  onLoadMore: (column: TaskBoardColumn) => void;
  onNotificationArchive: (id: string) => void;
  onNotificationFilter: (status: NotificationFilter) => void;
  onNotificationRead: (id: string) => void;
  onNotificationsReadAll: () => void;
  onProcessReminders: () => void;
  onResetFilters: () => void;
  onRetryBoard: () => void;
  onRetryDetail: () => void;
  onRetryList: () => void;
  onSelect: (id: string) => void;
  onTransition: (status: TaskStatus, reason: string | null) => Promise<boolean>;
  onUpdate: (values: TaskUpdateValues) => Promise<boolean>;
  onViewChange: (view: TaskView) => void;
}

function boardIsEmpty(board: TaskBoardState): boolean {
  return TASK_BOARD_COLUMNS.every((column) => {
    const state = board[column];
    return state.status === 'ready' && state.total === 0;
  });
}

/**
 * The Task pipeline. The board is the primary view: scan work by status, open
 * a card for its detail, move it through the transitions the server allows.
 * The compact list is kept for closed work and paged scanning.
 */
export function TaskWorkspace(props: TaskWorkspaceProps) {
  const { t } = useI18n();
  const [creating, setCreating] = useState(false);
  const wasCreating = useRef(false);
  const busy = props.pending !== null;
  const drawerOpen = props.detail.status !== 'idle';
  const filtered = hasTaskFilters(props.appliedFilters);

  useEffect(() => {
    if (!creating && wasCreating.current) {
      document.querySelector<HTMLButtonElement>('[data-task-create-toggle]')?.focus();
    }
    wasCreating.current = creating;
  }, [creating]);

  return (
    <div className="tasks" data-density="internal-standard">
      <div className="tasks__page" inert={drawerOpen ? true : undefined}>
        <PageHeader
          primaryAction={
            props.access.canCreate ? (
              <Button
                aria-expanded={creating}
                data-task-create-toggle=""
                disabled={busy || creating}
                onClick={() => setCreating(true)}
                size="compact"
              >
                {t('task.actions.newTask')}
              </Button>
            ) : null
          }
          description={t('task.header.description')}
          title={t('task.header.title')}
        />

        {props.feedback?.scope === 'page' ? (
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

        {creating ? (
          <TaskCreateForm
            access={props.access}
            busy={busy}
            loadOptions={props.loadOptions}
            onCancel={() => setCreating(false)}
            onCreate={(values) =>
              props.onCreate(values).then((ok) => {
                if (ok) setCreating(false);
                return ok;
              })
            }
            optionsKey={props.optionsKey}
            submitting={props.pending === 'create'}
          />
        ) : null}

        <div className="tasks__toolbar">
          <div aria-label={t('task.views.label')} className="tasks__views" role="group">
            {(['board', 'list'] as const).map((view) => (
              <button
                aria-pressed={props.view === view}
                className="tasks__view"
                key={view}
                onClick={() => props.onViewChange(view)}
                type="button"
              >
                {t(`task.views.${view}`)}
              </button>
            ))}
          </div>
        </div>

        <TaskFilterBar
          access={props.access}
          appliedFilters={props.appliedFilters}
          filters={props.filters}
          loadOptions={props.loadOptions}
          me={props.currentUser}
          onApply={props.onApplyFilters}
          onChange={props.onFiltersChange}
          onReset={props.onResetFilters}
          optionsKey={props.optionsKey}
          view={props.view}
        />

        {props.view === 'board' ? (
          <>
            {boardIsEmpty(props.board) ? (
              <p className="tasks__board-empty" role="status">
                {filtered ? t('task.list.filteredEmpty') : t('task.list.empty')}
              </p>
            ) : null}
            <TaskBoard
              board={props.board}
              currentUserId={props.currentUser.id}
              onLoadMore={props.onLoadMore}
              onRetry={props.onRetryBoard}
              onSelect={props.onSelect}
              selectedId={props.selectedId}
            />
          </>
        ) : (
          <TaskListView
            filtered={filtered}
            list={props.list}
            onPage={props.onListPage}
            onReset={props.onResetFilters}
            onRetry={props.onRetryList}
            onSelect={props.onSelect}
            selectedId={props.selectedId}
          />
        )}

        {props.access.canViewNotifications ? (
          <TaskNotifications
            access={props.access}
            busy={busy}
            filter={props.notificationStatus}
            notifications={props.notifications}
            onArchive={props.onNotificationArchive}
            onFilter={props.onNotificationFilter}
            onRead={props.onNotificationRead}
            onReadAll={props.onNotificationsReadAll}
            pending={props.pending}
            total={props.notificationTotal}
          />
        ) : null}

        {props.access.canManageReminders && props.access.canViewAll ? (
          <ReminderDiagnostics
            busy={busy}
            onProcess={props.onProcessReminders}
            pending={props.pending === 'process-reminders'}
          />
        ) : null}
      </div>

      <TaskDetailPanel
        access={props.access}
        contextLabels={props.contextLabels}
        detail={props.detail}
        feedback={props.feedback?.scope === 'task' ? props.feedback : null}
        loadOptions={props.loadOptions}
        onAddAssignment={props.onAddAssignment}
        onAddComment={props.onAddComment}
        onAddReminder={props.onAddReminder}
        onArchive={props.onArchive}
        onChangeOwner={props.onChangeOwner}
        onClose={props.onCloseDetail}
        onRetry={props.onRetryDetail}
        onTransition={props.onTransition}
        onUpdate={props.onUpdate}
        optionsKey={props.optionsKey}
        pending={props.pending}
      />
    </div>
  );
}
