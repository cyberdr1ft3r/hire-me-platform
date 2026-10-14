import type { MissionSummary } from '@hire-me/contracts';

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

/**
 * The mission directory: one server page of the matches as a full-width table.
 *
 * Each row names the mission with a real button that opens the quick preview, so
 * the action is keyboard reachable and announced by the title alone; the whole row
 * is its pointer target. The previewed row carries `aria-current` and a visible
 * inline-start bar, never color alone.
 *
 * Columns hold ordinary mission summary fields only; commercial terms never appear
 * here. The order is the server's (newest first); the list API offers no other sort.
 */
export function MissionDirectory({
  filtered,
  list,
  onPage,
  onPreview,
  onReset,
  onRetry,
  previewId,
  tableLabelId,
}: {
  filtered: boolean;
  list: MissionListState;
  onPage: (page: number) => void;
  onPreview: (mission: MissionSummary) => void;
  onReset: () => void;
  onRetry: () => void;
  previewId: string | null;
  /** The pane heading that names the table. */
  tableLabelId: string;
}) {
  const { formatDate, formatNumber, t } = useI18n();

  if (list.status === 'loading') {
    return (
      <div aria-busy="true" className="mission-directory__loading">
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
    <div className="mission-directory">
      <p className="mission-directory__count" role="status">
        <span>{t('missions.list.count', { count: list.total })}</span>
        <span className="mission-directory__order">{t('missions.directory.order')}</span>
      </p>
      <table aria-labelledby={tableLabelId} className="mission-directory__table">
        <thead>
          <tr>
            <th scope="col">{t('missions.directory.columns.mission')}</th>
            <th data-column="client" scope="col">
              {t('missions.profile.fields.client')}
            </th>
            <th data-column="state" scope="col">
              {t('missions.filters.state')}
            </th>
            <th data-column="priority" scope="col">
              {t('missions.profile.fields.priority')}
            </th>
            <th data-column="positions" scope="col">
              {t('missions.profile.fields.positions')}
            </th>
            <th data-column="deadline" scope="col">
              {t('missions.profile.fields.applicationDeadline')}
            </th>
            <th data-column="location" scope="col">
              {t('missions.profile.fields.location')}
            </th>
          </tr>
        </thead>
        <tbody>
          {list.missions.map((mission) => {
            const previewed = mission.id === previewId;
            return (
              <tr
                className="mission-directory__row"
                data-previewed={previewed ? 'true' : undefined}
                key={mission.id}
              >
                <th scope="row">
                  <button
                    aria-current={previewed ? 'true' : undefined}
                    className="mission-directory__open"
                    data-mission-id={mission.id}
                    onClick={() => onPreview(mission)}
                    type="button"
                  >
                    {mission.title}
                  </button>
                </th>
                <td data-column="client">{mission.clientName}</td>
                <td data-column="state">
                  <StatusBadge tone={missionStateTone(mission.state)}>
                    {t(missionStateLabelKey(mission.state))}
                  </StatusBadge>
                </td>
                <td data-column="priority">
                  <StatusBadge tone={missionPriorityTone(mission.priority)}>
                    {t(missionPriorityLabelKey(mission.priority))}
                  </StatusBadge>
                </td>
                <td className="u-tabular" data-column="positions">
                  {t('missions.profile.positionsValue', {
                    filled: formatNumber(mission.filledPlacementCount),
                    total: formatNumber(mission.numberOfPositions),
                  })}
                </td>
                <td className="u-tabular" data-column="deadline">
                  {mission.applicationDeadline ? formatDate(mission.applicationDeadline) : '—'}
                </td>
                <td data-column="location">{mission.location?.trim() || '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
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
