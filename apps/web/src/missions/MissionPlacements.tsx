import type { MissionPlacement } from '@hire-me/contracts';

import { useI18n } from '../i18n/index.js';
import { Button, StatusBadge } from '../ui/index.js';
import { SectionStatus } from './MissionBits.js';
import type { MissionAccess } from './mission-access.js';
import { placementStatusLabelKey, placementStatusTone } from './mission-labels.js';
import type { SectionState } from './mission-state.js';

export function MissionPlacements({
  access,
  editable,
  onCorrect,
  onRetry,
  placement,
  writesLocked,
}: {
  access: MissionAccess;
  editable: boolean;
  onCorrect: () => void;
  onRetry: () => void;
  placement: SectionState<MissionPlacement | null>;
  writesLocked: boolean;
}) {
  const { formatDate, t } = useI18n();
  return (
    <section aria-labelledby="mission-placement-title" className="mission-subsection">
      <h4 className="mission-subtitle" id="mission-placement-title">
        {t('missions.placements.title')}
      </h4>
      <SectionStatus onRetry={onRetry} section={placement}>
        {(record) =>
          record ? (
            <div className="mission-group">
              <p className="mission-inline">
                <StatusBadge tone={placementStatusTone(record.status)}>
                  {t(placementStatusLabelKey(record.status))}
                </StatusBadge>
                <span>
                  {t('missions.placements.integrationStart', {
                    date: formatDate(record.integrationStartDate),
                  })}
                </span>
              </p>
              <ul className="mission-flags">
                {record.closureEligible ? <li>{t('missions.placements.closureEligible')}</li> : null}
                {access.canViewPlacementCommercialEligibility && record.eligibleForInvoicing ? (
                  <li>{t('missions.placements.invoicingEligible')}</li>
                ) : null}
              </ul>
              {editable && access.canCorrectPlacements && record.status === 'CONFIRMED' ? (
                <div className="mission-actions">
                  <Button disabled={writesLocked} onClick={onCorrect} size="compact" variant="danger">
                    {t('missions.placements.correct')}
                  </Button>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="mission-muted">{t('missions.placements.empty')}</p>
          )
        }
      </SectionStatus>
    </section>
  );
}
