import type { TrainingProgramSummary } from '@hire-me/contracts';

import { ListPagination } from '../clients/ListPagination.js';
import { useI18n } from '../i18n/index.js';
import { Button, EmptyState, InlineMessage, Skeleton, StatusBadge } from '../ui/index.js';
import { programStatusTone } from './training-labels.js';
import type { ListState } from './training-state.js';

export function ProgramList({
  filtered,
  list,
  onPage,
  onReset,
  onRetry,
  onSelect,
  selectedId,
  showClient,
}: {
  filtered: boolean;
  list: ListState<TrainingProgramSummary>;
  onPage: (page: number) => void;
  onReset: () => void;
  onRetry: () => void;
  onSelect: (program: TrainingProgramSummary) => void;
  selectedId: string | null;
  showClient: boolean;
}) {
  const { formatDate, t } = useI18n();

  if (list.status === 'loading' || list.status === 'idle') {
    return (
      <div aria-busy="true">
        <Skeleton label={t('training.programs.states.loading')} />
      </div>
    );
  }

  if (list.status === 'error') {
    return (
      <InlineMessage announce title={t('training.programs.states.errorTitle')} tone="danger">
        <p className="training-message__text">{t('training.programs.states.error')}</p>
        <Button onClick={onRetry} size="compact" variant="secondary">
          {t('common.actions.retry')}
        </Button>
      </InlineMessage>
    );
  }

  if (list.items.length === 0) {
    return filtered ? (
      <EmptyState
        action={
          <Button onClick={onReset} size="compact" variant="secondary">
            {t('training.filters.reset')}
          </Button>
        }
        title={t('training.programs.empty.noMatchesTitle')}
      >
        {t('training.programs.empty.noMatches')}
      </EmptyState>
    ) : (
      <EmptyState title={t('training.programs.empty.noneTitle')}>
        {t('training.programs.empty.none')}
      </EmptyState>
    );
  }

  return (
    <div className="training-list">
      <p aria-live="polite" className="training-list__count">
        {t('training.programs.count', { count: list.total })}
      </p>
      <table aria-label={t('training.programs.tableLabel')} className="training-table">
        <thead>
          <tr>
            <th scope="col">{t('training.programs.columns.program')}</th>
            <th scope="col">{t('training.programs.columns.status')}</th>
            <th scope="col">{t('training.programs.columns.owner')}</th>
            {showClient ? <th scope="col">{t('training.programs.columns.client')}</th> : null}
            <th scope="col">{t('training.programs.columns.planned')}</th>
          </tr>
        </thead>
        <tbody>
          {list.items.map((program) => {
            const selected = program.id === selectedId;
            return (
              <tr data-selected={selected ? 'true' : undefined} key={program.id}>
                <th scope="row">
                  <button
                    aria-current={selected ? 'true' : undefined}
                    className="training-table__select"
                    onClick={() => onSelect(program)}
                    type="button"
                  >
                    {program.name}
                  </button>
                  <span className="training-table__secondary">{program.reference}</span>
                </th>
                <td data-label={t('training.programs.columns.status')}>
                  <StatusBadge tone={programStatusTone(program.status)}>
                    {t(`training.status.program.${program.status}`)}
                  </StatusBadge>
                </td>
                <td data-label={t('training.programs.columns.owner')}>
                  {program.ownerDisplayName ?? (
                    <span className="training-muted">{t('training.common.unassigned')}</span>
                  )}
                </td>
                {showClient ? (
                  <td data-label={t('training.programs.columns.client')}>
                    {program.clientDisplayName ?? (
                      <span className="training-muted">{t('training.programs.noClient')}</span>
                    )}
                  </td>
                ) : null}
                <td className="u-tabular" data-label={t('training.programs.columns.planned')}>
                  {program.plannedStartDate ? (
                    <time dateTime={program.plannedStartDate}>
                      {formatDate(program.plannedStartDate)}
                    </time>
                  ) : (
                    <span className="training-muted">{t('training.common.notSet')}</span>
                  )}
                  {program.plannedEndDate ? (
                    <>
                      {' – '}
                      <time dateTime={program.plannedEndDate}>
                        {formatDate(program.plannedEndDate)}
                      </time>
                    </>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <ListPagination
        labels={{
          next: t('training.pagination.next'),
          page: (values) => t('training.pagination.page', values),
          previous: t('training.pagination.previous'),
          range: (values) => t('training.pagination.range', values),
          region: t('training.programs.paginationRegion'),
        }}
        onPage={onPage}
        page={list.page}
        pageSize={list.pageSize}
        total={list.total}
      />
    </div>
  );
}
