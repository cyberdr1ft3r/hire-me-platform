import type { DocumentSummary, TaskSummary } from '@hire-me/contracts';
import { useEffect, useState, type MouseEvent } from 'react';

import { useI18n } from '../i18n/index.js';
import { Button, EmptyState, InlineMessage, Skeleton } from '../ui/index.js';
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

function followLink(
  event: MouseEvent<HTMLAnchorElement>,
  path: string,
  onNavigatePath: ((path: string) => void) | undefined,
): void {
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

function RelatedStatus<Item>({
  emptyTitle,
  empty,
  errorText,
  loadingText,
  retry,
  state,
}: {
  empty: string;
  emptyTitle: string;
  errorText: string;
  loadingText: string;
  retry: () => void;
  state: RelatedState<Item>;
}) {
  const { t } = useI18n();
  if (state.status === 'loading') {
    return (
      <div aria-busy="true" className="candidate-related__loading">
        <Skeleton label={loadingText} />
      </div>
    );
  }
  if (state.status === 'error') {
    return (
      <InlineMessage announce title={t('candidate.record.related.errorTitle')} tone="danger">
        <p className="candidate-message__text">{errorText}</p>
        <Button onClick={retry} size="compact" variant="secondary">
          {t('common.actions.retry')}
        </Button>
      </InlineMessage>
    );
  }
  if (state.page.items.length === 0) {
    return <EmptyState title={emptyTitle}>{empty}</EmptyState>;
  }
  return null;
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
  const { formatDate, formatNumber, t } = useI18n();
  const { retry, state } = useRelatedPage(load);

  return (
    <section aria-label={t('candidate.record.sections.documents')} className="candidate-related">
      <RelatedStatus
        empty={t('candidate.record.documents.empty')}
        emptyTitle={t('candidate.record.documents.emptyTitle')}
        errorText={t('candidate.record.documents.error')}
        loadingText={t('candidate.record.documents.loading')}
        retry={retry}
        state={state}
      />
      {state.status === 'ready' && state.page.items.length > 0 ? (
        <>
          <ul className="candidate-related__rows">
            {state.page.items.map((document) => (
              <li className="candidate-related__row" key={document.id}>
                <strong>{document.title}</strong>
                <span>
                  {t('candidate.profile.updated', { date: formatDate(document.updatedAt) })}
                </span>
              </li>
            ))}
          </ul>
          <p className="candidate-related__footer">
            {state.page.total > state.page.items.length ? (
              <span className="u-tabular">
                {t('candidate.record.related.partial', {
                  shown: formatNumber(state.page.items.length),
                  total: formatNumber(state.page.total),
                })}
              </span>
            ) : null}
            <a
              href="/documents"
              onClick={(event) => followLink(event, '/documents', onNavigatePath)}
            >
              {t('candidate.record.documents.open')}
            </a>
          </p>
        </>
      ) : null}
    </section>
  );
}

/**
 * Tasks linked to this candidate, read through the Tasks list with its candidate
 * filter. The server returns only the tasks this actor may see; each opens in Tasks.
 */
export function CandidateRelatedTasks({
  load,
  onNavigatePath,
}: {
  load: () => Promise<CandidateRelatedPage<TaskSummary>>;
  onNavigatePath?: (path: string) => void;
}) {
  const { formatDate, formatNumber, t } = useI18n();
  const { retry, state } = useRelatedPage(load);

  return (
    <section aria-label={t('candidate.record.sections.tasks')} className="candidate-related">
      <RelatedStatus
        empty={t('candidate.record.tasks.empty')}
        emptyTitle={t('candidate.record.tasks.emptyTitle')}
        errorText={t('candidate.record.tasks.error')}
        loadingText={t('candidate.record.tasks.loading')}
        retry={retry}
        state={state}
      />
      {state.status === 'ready' && state.page.items.length > 0 ? (
        <>
          <ul className="candidate-related__rows">
            {state.page.items.map((task) => {
              const path = `/tasks?task=${encodeURIComponent(task.id)}`;
              return (
                <li className="candidate-related__row" key={task.id}>
                  <a href={path} onClick={(event) => followLink(event, path, onNavigatePath)}>
                    {task.title}
                  </a>
                  <span>
                    {t(`domain.taskStatus.${task.status}`)}
                    {' · '}
                    {task.dueAt
                      ? t('candidate.record.tasks.due', { date: formatDate(task.dueAt) })
                      : t('candidate.record.tasks.noDue')}
                  </span>
                </li>
              );
            })}
          </ul>
          {state.page.total > state.page.items.length ? (
            <p className="candidate-related__footer u-tabular">
              {t('candidate.record.related.partial', {
                shown: formatNumber(state.page.items.length),
                total: formatNumber(state.page.total),
              })}
            </p>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
