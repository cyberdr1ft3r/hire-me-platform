import type { DocumentSummary, TaskSummary } from '@hire-me/contracts';
import { useEffect, useState, type MouseEvent, type ReactNode } from 'react';

import { useI18n } from '../i18n/index.js';
import {
  classifyDueDate,
  taskPriorityLabelKey,
  taskStatusLabelKey,
  taskStatusTone,
} from '../tasks/task-labels.js';
import { Button, EmptyState, InlineMessage, Skeleton, StatusBadge } from '../ui/index.js';
import type { CandidateRelatedPage } from './candidate-state.js';

type RelatedState<Item> =
  | { status: 'error' }
  | { status: 'loading' }
  | { page: CandidateRelatedPage<Item>; status: 'ready' };

/**
 * Reads one bounded page the first time a section is shown. The section stays
 * mounted afterwards, so returning to it does not read again, and nothing polls.
 * A result that arrives after the section left the screen is dropped.
 */
function useRelatedPage<Item>(load: () => Promise<CandidateRelatedPage<Item>>) {
  const [state, setState] = useState<RelatedState<Item>>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    setState({ status: 'loading' });
    load().then(
      (page) => {
        if (current) setState({ page, status: 'ready' });
      },
      () => {
        if (current) setState({ status: 'error' });
      },
    );
    return () => {
      current = false;
    };
    // `load` is bound to one candidate and session by the record, which is keyed by candidate.
  }, [attempt]);

  return { retry: () => setAttempt((value) => value + 1), state };
}

function ModuleLink({
  children,
  onNavigatePath,
  path,
}: {
  children: ReactNode;
  onNavigatePath?: (path: string) => void;
  path: string;
}) {
  function follow(event: MouseEvent<HTMLAnchorElement>): void {
    if (
      !onNavigatePath ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    event.preventDefault();
    onNavigatePath(path);
  }
  return (
    <a href={path} onClick={follow}>
      {children}
    </a>
  );
}

/**
 * One related section: a summary line (how many, and the way to the owning module),
 * then the loading, failure, empty or listed state. Loading, failure and a genuinely
 * empty result never share one blank area.
 */
function RelatedSection<Item>({
  count,
  empty,
  emptyTitle,
  errorText,
  label,
  loadingText,
  moduleLink,
  renderItems,
  retry,
  state,
}: {
  count: (total: number) => string;
  empty: string;
  emptyTitle: string;
  errorText: string;
  label: string;
  loadingText: string;
  moduleLink: ReactNode;
  renderItems: (items: Item[]) => ReactNode;
  retry: () => void;
  state: RelatedState<Item>;
}) {
  const { formatNumber, t } = useI18n();
  let body: ReactNode;
  if (state.status === 'loading') {
    body = (
      <div aria-busy="true" className="candidate-related__loading">
        <Skeleton label={loadingText} />
      </div>
    );
  } else if (state.status === 'error') {
    body = (
      <InlineMessage announce title={t('candidate.record.related.errorTitle')} tone="danger">
        <p className="candidate-message__text">{errorText}</p>
        <Button onClick={retry} size="compact" variant="secondary">
          {t('common.actions.retry')}
        </Button>
      </InlineMessage>
    );
  } else if (state.page.items.length === 0) {
    body = (
      <EmptyState action={moduleLink} title={emptyTitle}>
        {empty}
      </EmptyState>
    );
  } else {
    body = (
      <>
        {renderItems(state.page.items)}
        {state.page.total > state.page.items.length ? (
          <p className="candidate-related__partial u-tabular">
            {t('candidate.record.related.partial', {
              shown: formatNumber(state.page.items.length),
              total: formatNumber(state.page.total),
            })}
          </p>
        ) : null}
      </>
    );
  }

  return (
    <section aria-label={label} className="candidate-related">
      {state.status === 'ready' && state.page.items.length > 0 ? (
        <div className="candidate-related__summary">
          <p className="candidate-related__count" role="status">
            {count(state.page.total)}
          </p>
          {moduleLink}
        </div>
      ) : null}
      {body}
    </section>
  );
}

/**
 * Documents attached to this candidate, read through the Documents list with its
 * candidate filter. The server applies document visibility; nothing is downloaded
 * here. The full document workspace stays in Documents.
 */
export function CandidateRelatedDocuments({
  load,
  onNavigatePath,
}: {
  load: () => Promise<CandidateRelatedPage<DocumentSummary>>;
  onNavigatePath?: (path: string) => void;
}) {
  const { formatDate, t } = useI18n();
  const { retry, state } = useRelatedPage(load);

  return (
    <RelatedSection
      count={(total) => t('candidate.record.documents.count', { count: total })}
      empty={t('candidate.record.documents.empty')}
      emptyTitle={t('candidate.record.documents.emptyTitle')}
      errorText={t('candidate.record.documents.error')}
      label={t('candidate.record.sections.documents')}
      loadingText={t('candidate.record.documents.loading')}
      moduleLink={
        <ModuleLink onNavigatePath={onNavigatePath} path="/documents">
          {t('candidate.record.documents.open')}
        </ModuleLink>
      }
      renderItems={(documents) => (
        <ul className="candidate-related__rows">
          {documents.map((document) => (
            <li className="candidate-related__row" key={document.id}>
              <div className="candidate-related__main">
                <strong className="candidate-related__title">{document.title}</strong>
              </div>
              <span className="candidate-related__meta u-tabular">
                {t('candidate.profile.updated', { date: formatDate(document.updatedAt) })}
              </span>
            </li>
          ))}
        </ul>
      )}
      retry={retry}
      state={state}
    />
  );
}

/**
 * Tasks linked to this candidate, read through the Tasks list with its candidate
 * filter. The server returns only the tasks this actor may see; each opens in Tasks.
 * Status, priority and due-date wording reuse the Tasks module's own labels and tones.
 */
export function CandidateRelatedTasks({
  load,
  onNavigatePath,
}: {
  load: () => Promise<CandidateRelatedPage<TaskSummary>>;
  onNavigatePath?: (path: string) => void;
}) {
  const { formatDate, t } = useI18n();
  const { retry, state } = useRelatedPage(load);

  return (
    <RelatedSection
      count={(total) => t('candidate.record.tasks.count', { count: total })}
      empty={t('candidate.record.tasks.empty')}
      emptyTitle={t('candidate.record.tasks.emptyTitle')}
      errorText={t('candidate.record.tasks.error')}
      label={t('candidate.record.sections.tasks')}
      loadingText={t('candidate.record.tasks.loading')}
      moduleLink={
        <ModuleLink onNavigatePath={onNavigatePath} path="/tasks">
          {t('candidate.record.tasks.open')}
        </ModuleLink>
      }
      renderItems={(tasks) => (
        <ul className="candidate-related__rows">
          {tasks.map((task) => {
            const path = `/tasks?task=${encodeURIComponent(task.id)}`;
            const due = classifyDueDate(task.dueAt, task.status);
            return (
              <li className="candidate-related__row" key={task.id}>
                <div className="candidate-related__main">
                  <ModuleLink onNavigatePath={onNavigatePath} path={path}>
                    <span className="candidate-related__title">{task.title}</span>
                  </ModuleLink>
                  <span className="candidate-related__meta">
                    {t(taskPriorityLabelKey(task.priority))}
                  </span>
                </div>
                <div className="candidate-related__aside">
                  <StatusBadge tone={taskStatusTone(task.status)}>
                    {t(taskStatusLabelKey(task.status))}
                  </StatusBadge>
                  <span className="candidate-related__due u-tabular" data-due={due}>
                    {task.dueAt === null
                      ? t('candidate.record.tasks.noDue')
                      : due === 'overdue'
                        ? `${t('candidate.record.tasks.overdue')} · ${formatDate(task.dueAt)}`
                        : due === 'today'
                          ? t('candidate.record.tasks.today')
                          : t('candidate.record.tasks.due', { date: formatDate(task.dueAt) })}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      retry={retry}
      state={state}
    />
  );
}
