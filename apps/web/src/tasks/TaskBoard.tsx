import type { TaskSummary } from '@hire-me/contracts';
import { useId, useState } from 'react';

import { useI18n } from '../i18n/index.js';
import { Button, Skeleton } from '../ui/index.js';
import {
  primaryContextField,
  taskContextFieldLabelKey,
  taskStatusLabelKey,
} from './task-labels.js';
import {
  TASK_BOARD_COLUMNS,
  type TaskBoardColumn,
  type TaskBoardState,
  type TaskColumnState,
} from './task-state.js';
import { DueLabel, PriorityBadge } from './TaskBits.js';

export interface TaskBoardProps {
  board: TaskBoardState;
  currentUserId: string;
  onLoadMore: (column: TaskBoardColumn) => void;
  onRetry: () => void;
  onSelect: (taskId: string) => void;
  selectedId: string | null;
}

/**
 * The Task pipeline as a lightweight board: one column per active stored
 * status, in workflow order. Cards carry only what helps someone decide what
 * to open next; everything else lives in the task detail.
 *
 * There is no drag and drop. Moving a task happens in its detail through the
 * transitions the server allows from its current status, so a card can never
 * be dropped into a column the workflow forbids.
 *
 * On a narrow container the columns become one-at-a-time views chosen from a
 * row of toggle buttons, so five columns are never squeezed into a phone.
 */
export function TaskBoard(props: TaskBoardProps) {
  const { t } = useI18n();
  const [active, setActive] = useState<TaskBoardColumn>('OPEN');

  return (
    <section aria-label={t('task.board.region')} className="task-board">
      <div aria-label={t('task.board.switcher')} className="task-board__switcher" role="group">
        {TASK_BOARD_COLUMNS.map((column) => {
          const state = props.board[column];
          return (
            <button
              aria-pressed={active === column}
              className="task-board__switch"
              key={column}
              onClick={() => setActive(column)}
              type="button"
            >
              <span>{t(taskStatusLabelKey(column))}</span>
              {state.status === 'ready' ? (
                <span className="task-board__switch-count">{state.total}</span>
              ) : null}
            </button>
          );
        })}
      </div>
      {/* Focusable so the columns can be scrolled from the keyboard when they overflow. */}
      <div className="task-board__columns" tabIndex={0}>
        {TASK_BOARD_COLUMNS.map((column) => (
          <TaskColumn
            active={active === column}
            column={column}
            currentUserId={props.currentUserId}
            key={column}
            onLoadMore={() => props.onLoadMore(column)}
            onRetry={props.onRetry}
            onSelect={props.onSelect}
            selectedId={props.selectedId}
            state={props.board[column]}
          />
        ))}
      </div>
    </section>
  );
}

function TaskColumn({
  active,
  column,
  currentUserId,
  onLoadMore,
  onRetry,
  onSelect,
  selectedId,
  state,
}: {
  active: boolean;
  column: TaskBoardColumn;
  currentUserId: string;
  onLoadMore: () => void;
  onRetry: () => void;
  onSelect: (taskId: string) => void;
  selectedId: string | null;
  state: TaskColumnState;
}) {
  const { t } = useI18n();
  const headingId = useId();

  return (
    <section
      aria-labelledby={headingId}
      className="task-column"
      data-active={active || undefined}
      data-status={column}
    >
      <div className="task-column__head">
        <h2 id={headingId}>{t(taskStatusLabelKey(column))}</h2>
        {state.status === 'ready' ? (
          <span className="task-column__count">
            {t('task.board.columnCount', { count: state.total })}
          </span>
        ) : null}
      </div>
      {state.status === 'loading' ? (
        <Skeleton label={t('task.states.loadingList')} />
      ) : state.status === 'error' ? (
        <div className="task-column__state">
          <p role="alert">{t('task.board.columnError')}</p>
          <Button onClick={onRetry} size="compact" variant="secondary">
            {t('task.actions.retry')}
          </Button>
        </div>
      ) : state.tasks.length === 0 ? (
        <p className="task-column__state">{t('task.board.columnEmpty')}</p>
      ) : (
        <>
          <ul className="task-column__cards">
            {state.tasks.map((task) => (
              <li key={task.id}>
                <TaskCard
                  currentUserId={currentUserId}
                  onSelect={onSelect}
                  selected={selectedId === task.id}
                  task={task}
                />
              </li>
            ))}
          </ul>
          {state.tasks.length < state.total ? (
            <div className="task-column__more">
              <span>
                {t('task.board.showing', { shown: state.tasks.length, total: state.total })}
              </span>
              <Button
                loading={state.loadingMore}
                loadingLabel={t('task.states.loadingList')}
                onClick={onLoadMore}
                size="compact"
                variant="quiet"
              >
                {t('task.actions.loadMore')}
              </Button>
              {state.loadMoreFailed ? <p role="alert">{t('task.board.loadMoreFailed')}</p> : null}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

/**
 * The title is the card's real button; its pseudo-element covers the card so
 * the whole card is one pointer target while the accessible name stays the
 * title. Status is stated in text for assistive technology, and priority and
 * due state are words, never color alone.
 */
export function TaskCard({
  currentUserId,
  onSelect,
  selected,
  task,
}: {
  currentUserId: string;
  onSelect: (taskId: string) => void;
  selected: boolean;
  task: TaskSummary;
}) {
  const { t } = useI18n();
  const contextField = primaryContextField(task.context);
  const assignedToMe = task.assigneeUserIds.includes(currentUserId);

  return (
    <article className="task-card" data-selected={selected || undefined}>
      <h3 className="task-card__title">
        <button
          aria-current={selected ? 'true' : undefined}
          aria-haspopup="dialog"
          className="task-card__open"
          data-task-card={task.id}
          onClick={() => onSelect(task.id)}
          type="button"
        >
          {task.title}
        </button>
      </h3>
      <span className="sr-only">
        {t('task.card.status', { status: t(taskStatusLabelKey(task.status)) })}
      </span>
      <div className="task-card__meta">
        <PriorityBadge priority={task.priority} />
        <DueLabel dueAt={task.dueAt} status={task.status} />
      </div>
      <p className="task-card__people">
        {task.ownerDisplayName ? (
          <span>{t('task.card.owner', { name: task.ownerDisplayName })}</span>
        ) : null}
        <span>
          {assignedToMe
            ? t('task.card.assignedToYou')
            : task.assigneeUserIds.length === 0
              ? t('task.card.noAssignee')
              : t('task.card.assignees', { count: task.assigneeUserIds.length })}
        </span>
      </p>
      {contextField ? (
        <p className="task-card__context">{t(taskContextFieldLabelKey(contextField))}</p>
      ) : null}
    </article>
  );
}
