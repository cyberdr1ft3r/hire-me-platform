import type { AgendaItem, AgendaView } from '@hire-me/contracts';

import { useI18n } from '../i18n/index.js';
import { Button, EmptyState, InlineMessage, PageHeader, Select } from '../ui/index.js';
import type { AgendaFilters, AgendaListState } from './agenda-state.js';
import { groupAgendaByDay } from './agenda-rules.js';
import type { AgendaSourceFilter } from './agenda-rules.js';

const VIEW_OPTIONS: AgendaView[] = ['today', 'week', 'month', 'upcoming', 'overdue', 'past'];
const SOURCE_OPTIONS: AgendaSourceFilter[] = [
  'all',
  'task',
  'follow_up',
  'meeting',
  'interview',
  'training',
];

export function AgendaWorkspace({
  filters,
  items,
  listState,
  onFiltersChange,
  onOpenItem,
  onRefresh,
  pending,
}: {
  filters: AgendaFilters;
  items: readonly AgendaItem[];
  listState: AgendaListState;
  onFiltersChange: (filters: AgendaFilters) => void;
  onOpenItem: (item: AgendaItem) => void;
  onRefresh: () => void;
  pending: boolean;
}) {
  const { t, formatDate, formatDateTime } = useI18n();
  const grouped = groupAgendaByDay(items);

  return (
    <section className="agenda-panel" aria-label={t('agenda.region')}>
      <PageHeader title={t('agenda.title')} description={t('agenda.description')} />
      <div className="agenda-toolbar">
        <Select
          label={t('agenda.filters.view')}
          value={filters.view}
          onChange={(event) =>
            onFiltersChange({ ...filters, view: event.target.value as AgendaView })
          }
        >
          {VIEW_OPTIONS.map((view) => (
            <option key={view} value={view}>
              {t(`agenda.views.${view}`)}
            </option>
          ))}
        </Select>
        <Select
          label={t('agenda.filters.source')}
          value={filters.source}
          onChange={(event) =>
            onFiltersChange({ ...filters, source: event.target.value as AgendaSourceFilter })
          }
        >
          {SOURCE_OPTIONS.map((source) => (
            <option key={source} value={source}>
              {t(`agenda.sources.${source}`)}
            </option>
          ))}
        </Select>
        <Button type="button" onClick={onRefresh} disabled={pending}>
          {t('agenda.refresh')}
        </Button>
      </div>
      {listState.status === 'error' ? (
        <InlineMessage tone="danger" title={t('agenda.emptyTitle')}>
          {listState.message}
        </InlineMessage>
      ) : null}
      {listState.status === 'loading' ? <p>{t('common.status.working')}</p> : null}
      {listState.status === 'ready' && items.length === 0 ? (
        <EmptyState title={t('agenda.emptyTitle')}>{t('agenda.emptyDescription')}</EmptyState>
      ) : null}
      {listState.status === 'ready' && items.length > 0
        ? [...grouped.entries()].map(([day, dayItems]) => (
            <section key={day} className="agenda-day-group">
              <h3 className="agenda-day-heading">
                {day === 'undated' ? t('agenda.undated') : formatDate(day)}
              </h3>
              {dayItems.map((item) => {
                const when = item.startAt ?? item.dueAt;
                return (
                  <div key={item.id} className="agenda-item-row">
                    <div>
                      <div>
                        {item.overdue ? (
                          <span className="agenda-item-overdue">{t('agenda.overdue')}</span>
                        ) : null}
                        <strong>{item.title}</strong>
                      </div>
                      <div className="agenda-item-meta">
                        {t(`agenda.sources.${item.sourceType}`)}
                        {when ? ` · ${formatDateTime(when)}` : null}
                      </div>
                    </div>
                    <Button type="button" onClick={() => onOpenItem(item)}>
                      {t('agenda.open')}
                    </Button>
                  </div>
                );
              })}
            </section>
          ))
        : null}
    </section>
  );
}
