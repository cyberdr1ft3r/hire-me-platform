import { ListPagination } from '../clients/ListPagination.js';
import { useI18n } from '../i18n/index.js';
import { Button, EmptyState, InlineMessage, Skeleton, StatusBadge } from '../ui/index.js';
import {
  missionPriorityLabelKey,
  missionPriorityTone,
  missionStateLabelKey,
  missionStateTone,
} from './mission-labels.js';
import type { MissionListState } from './mission-state.js';

export function MissionList({
  filtered,
  list,
  onPage,
  onReset,
  onRetry,
  onSelect,
  selectedId,
}: {
  filtered: boolean;
  list: MissionListState;
  onPage: (page: number) => void;
  onReset: () => void;
  onRetry: () => void;
  onSelect: (missionId: string) => void;
  selectedId: string | null;
}) {
  const { formatNumber, t } = useI18n();

  if (list.status === 'loading') {
    return (
      <div aria-busy="true">
        <Skeleton label={t('missions.states.loadingList')} />
      </div>
    );
  }

  if (list.status === 'error') {
    return (
      <InlineMessage announce title={t('missions.states.listErrorTitle')} tone="danger">
        <p className="mission-message__text">{t('missions.states.listError')}</p>
        <Button onClick={onRetry} size="compact" variant="secondary">
          {t('common.actions.retry')}
        </Button>
      </InlineMessage>
    );
  }

  if (list.missions.length === 0) {
    return filtered ? (
      <EmptyState
        action={
          <Button onClick={onReset} size="compact" variant="secondary">
            {t('missions.filters.reset')}
          </Button>
        }
        title={t('missions.empty.noMatchesTitle')}
      >
        {t('missions.empty.noMatches')}
      </EmptyState>
    ) : (
      <EmptyState title={t('missions.empty.noMissionsTitle')}>
        {t('missions.empty.noMissions')}
      </EmptyState>
    );
  }

  return (
    <div className="mission-list">
      <p aria-live="polite" className="mission-list__count">
        {t('missions.list.count', { count: list.total })}
      </p>
      <ul aria-label={t('missions.list.region')} className="mission-list__rows">
        {list.missions.map((mission) => {
          const selected = mission.id === selectedId;
          return (
            <li
              className={`mission-list__row${selected ? ' mission-list__row--selected' : ''}`}
              key={mission.id}
            >
              <button
                aria-current={selected ? 'true' : undefined}
                className="mission-list__select"
                onClick={() => onSelect(mission.id)}
                type="button"
              >
                <span className="mission-list__title">{mission.title}</span>
                <span className="mission-list__meta">{mission.clientName}</span>
                <span className="mission-list__badges">
                  <StatusBadge tone={missionStateTone(mission.state)}>
                    {t(missionStateLabelKey(mission.state))}
                  </StatusBadge>
                  <StatusBadge tone={missionPriorityTone(mission.priority)}>
                    {t(missionPriorityLabelKey(mission.priority))}
                  </StatusBadge>
                </span>
                <span className="mission-list__meta u-tabular">
                  {t('missions.list.positions', {
                    filled: formatNumber(mission.filledPlacementCount),
                    total: formatNumber(mission.numberOfPositions),
                  })}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <ListPagination
        labels={{
          next: t('missions.list.pagination.next'),
          page: (values) => t('missions.list.pagination.page', values),
          previous: t('missions.list.pagination.previous'),
          range: (values) => t('missions.list.pagination.range', values),
          region: t('missions.list.pagination.region'),
        }}
        onPage={onPage}
        page={list.page}
        pageSize={list.pageSize}
        total={list.total}
      />
    </div>
  );
}
