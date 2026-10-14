import type { MissionSummary } from '@hire-me/contracts';
import { useEffect, useState } from 'react';

import { missionDeepLink } from '../navigation/record-deep-links.js';
import { useI18n } from '../i18n/index.js';
import { EmptyState, InlineMessage, Skeleton, StatusBadge } from '../ui/index.js';
import {
  missionStateLabelKey,
  missionStateTone,
} from '../missions/mission-labels.js';

export type ClientMissionsLoad = () => Promise<{
  missions: MissionSummary[];
  total: number;
}>;

/**
 * Recruitment missions linked to this client (first page). Loads only when the
 * missions tab is opened; the server applies mission visibility and client scope.
 */
export function ClientRelatedMissions({
  load,
  onNavigatePath,
}: {
  load: ClientMissionsLoad;
  onNavigatePath?: (path: string) => void;
}) {
  const { t } = useI18n();
  const [state, setState] = useState<
    { status: 'loading' } | { status: 'error' } | { status: 'ready'; missions: MissionSummary[]; total: number }
  >({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    void load()
      .then((result) => {
        if (!cancelled) {
          setState({ status: 'ready', ...result });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setState({ status: 'error' });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [load]);

  if (state.status === 'loading') {
    return (
      <div aria-busy="true">
        <Skeleton label={t('clients.record.missions.loading')} />
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <InlineMessage announce title={t('clients.record.missions.errorTitle')} tone="danger">
        <p>{t('clients.record.missions.error')}</p>
      </InlineMessage>
    );
  }

  if (state.missions.length === 0) {
    return (
      <EmptyState title={t('clients.record.missions.emptyTitle')}>
        {t('clients.record.missions.empty')}
      </EmptyState>
    );
  }

  return (
    <section aria-label={t('clients.record.missions.title')} className="client-related-missions">
      <p className="client-related-missions__count" role="status">
        {t('clients.record.missions.count', { count: state.total })}
      </p>
      <ul className="client-related-missions__list">
        {state.missions.map((mission) => (
          <li key={mission.id}>
            {onNavigatePath ? (
              <button
                className="client-related-missions__link"
                onClick={() => onNavigatePath(missionDeepLink(mission.id))}
                type="button"
              >
                {mission.title}
              </button>
            ) : (
              <span className="client-related-missions__name">{mission.title}</span>
            )}
            <StatusBadge tone={missionStateTone(mission.state)}>
              {t(missionStateLabelKey(mission.state))}
            </StatusBadge>
          </li>
        ))}
      </ul>
      {state.total > state.missions.length ? (
        <p className="client-related-missions__more">{t('clients.record.missions.more')}</p>
      ) : null}
    </section>
  );
}
