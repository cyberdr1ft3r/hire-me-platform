import { useI18n } from '../i18n/index.js';
import { Button, EmptyState, Skeleton } from '../ui/index.js';
import { TASK_PAGE_SIZE, type TaskListState } from './task-state.js';
import { DueLabel, PriorityBadge, StatusText } from './TaskBits.js';

/**
 * The compact list: every visible status, including canceled and archived work
 * that the board leaves out, in the API's deterministic order with real pages.
 */
export function TaskListView({
  filtered,
  list,
  onPage,
  onReset,
  onRetry,
  onSelect,
  selectedId,
}: {
  filtered: boolean;
  list: TaskListState;
  onPage: (page: number) => void;
  onReset: () => void;
  onRetry: () => void;
  onSelect: (taskId: string) => void;
  selectedId: string | null;
}) {
  const { t } = useI18n();

  if (list.status === 'loading') return <Skeleton label={t('task.states.loadingList')} />;
  if (list.status === 'error') {
    return (
      <EmptyState
        action={<Button onClick={onRetry}>{t('task.actions.retry')}</Button>}
        title={t('task.states.listError')}
      >
        {t('task.feedback.failed')}
      </EmptyState>
    );
  }
  if (list.tasks.length === 0) {
    return (
      <EmptyState
        action={filtered ? <Button onClick={onReset}>{t('task.actions.reset')}</Button> : undefined}
        title={filtered ? t('task.list.filteredEmpty') : t('task.list.empty')}
      >
        {t('task.header.description')}
      </EmptyState>
    );
  }

  const pages = Math.max(1, Math.ceil(list.total / TASK_PAGE_SIZE));
  return (
    <section aria-label={t('task.list.region')} className="task-list">
      <ul className="task-list__rows">
        {list.tasks.map((task) => (
          <li
            className="task-list__row"
            data-selected={selectedId === task.id || undefined}
            key={task.id}
          >
            <button
              aria-current={selectedId === task.id ? 'true' : undefined}
              aria-haspopup="dialog"
              className="task-list__open"
              data-task-card={task.id}
              onClick={() => onSelect(task.id)}
              type="button"
            >
              {task.title}
            </button>
            <span className="task-list__meta">
              <StatusText status={task.status} />
              <PriorityBadge priority={task.priority} />
              <DueLabel dueAt={task.dueAt} status={task.status} />
            </span>
            <span className="task-list__owner">
              {task.ownerDisplayName ?? t('task.detail.notRecorded')}
            </span>
          </li>
        ))}
      </ul>
      <nav aria-label={t('task.list.pagination')} className="task-list__pages">
        <span>{t('task.list.showing', { shown: list.tasks.length, total: list.total })}</span>
        <Button
          disabled={list.page <= 1}
          onClick={() => onPage(list.page - 1)}
          size="compact"
          variant="secondary"
        >
          {t('task.actions.previousPage')}
        </Button>
        <span>{t('task.list.page', { page: list.page, pages })}</span>
        <Button
          disabled={list.page >= pages}
          onClick={() => onPage(list.page + 1)}
          size="compact"
          variant="secondary"
        >
          {t('task.actions.nextPage')}
        </Button>
      </nav>
    </section>
  );
}
