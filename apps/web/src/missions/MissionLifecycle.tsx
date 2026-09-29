import type { MissionLifecycleState, MissionSummary } from '@hire-me/contracts';
import { useState, type FormEvent } from 'react';

import { useI18n } from '../i18n/index.js';
import { Button, Select, StatusBadge, TextField } from '../ui/index.js';
import type { MissionAccess } from './mission-access.js';
import {
  CLOSURE_REASON_BY_STATE,
  MISSION_CLOSURE_STATES,
  canArchiveMissionState,
  closureReasonLabelKey,
  isMissionWritable,
  missionStateLabelKey,
  missionStateTone,
  nextMissionStates,
  type MissionClosureState,
} from './mission-labels.js';

export interface MissionClosureValues {
  state: MissionClosureState;
  filledPlacementCount: number;
}

export function MissionLifecycle({
  access,
  mission,
  onArchive,
  onClose,
  onMove,
  writesLocked,
}: {
  access: MissionAccess;
  mission: MissionSummary;
  onArchive: () => void;
  onClose: (values: MissionClosureValues) => void;
  onMove: (state: MissionLifecycleState) => void;
  writesLocked: boolean;
}) {
  const { formatNumber, t } = useI18n();
  const writable = isMissionWritable(mission);
  const transitions = nextMissionStates(mission.state);
  const [closureState, setClosureState] = useState<MissionClosureState>(
    'CLOSED_WITHOUT_RECRUITMENT',
  );
  const [filled, setFilled] = useState(String(mission.filledPlacementCount));

  function handleClose(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    onClose({ state: closureState, filledPlacementCount: Number(filled.trim()) });
  }

  return (
    <section aria-labelledby="mission-lifecycle-title" className="mission-section">
      <h3 className="mission-section__title" id="mission-lifecycle-title">
        {t('missions.lifecycle.title')}
      </h3>
      <p className="mission-inline">
        <span>{t('missions.lifecycle.current')}</span>
        <StatusBadge tone={missionStateTone(mission.state)}>
          {t(missionStateLabelKey(mission.state))}
        </StatusBadge>
      </p>

      {access.canManageStatus && writable ? (
        transitions.length > 0 ? (
          <div className="mission-actions">
            {transitions.map((state) => (
              <Button
                disabled={writesLocked}
                key={state}
                onClick={() => onMove(state)}
                size="compact"
                variant="secondary"
              >
                {t('missions.lifecycle.moveTo', { state: t(missionStateLabelKey(state)) })}
              </Button>
            ))}
          </div>
        ) : (
          <p className="mission-muted">{t('missions.lifecycle.noTransitions')}</p>
        )
      ) : null}

      {access.canClose && writable ? (
        <form
          aria-label={t('missions.lifecycle.close.title')}
          className="mission-form"
          onSubmit={handleClose}
        >
          <h4 className="mission-subtitle">{t('missions.lifecycle.close.title')}</h4>
          <div className="mission-form__grid">
            <Select
              label={t('missions.lifecycle.close.state')}
              name="closureState"
              onChange={(event) =>
                setClosureState(
                  MISSION_CLOSURE_STATES.find((state) => state === event.currentTarget.value) ??
                    closureState,
                )
              }
              value={closureState}
            >
              {MISSION_CLOSURE_STATES.map((state) => (
                <option key={state} value={state}>
                  {t(missionStateLabelKey(state))}
                </option>
              ))}
            </Select>
            <TextField
              inputMode="numeric"
              label={t('missions.lifecycle.close.filled')}
              max={mission.numberOfPositions}
              min={0}
              name="filledPlacementCount"
              onChange={(event) => setFilled(event.currentTarget.value)}
              required
              type="number"
              value={filled}
            />
          </div>
          <dl className="mission-summary">
            <div className="mission-summary__item">
              <dt>{t('missions.lifecycle.close.reason')}</dt>
              <dd>{t(closureReasonLabelKey(CLOSURE_REASON_BY_STATE[closureState]))}</dd>
            </div>
            <div className="mission-summary__item">
              <dt>{t('missions.profile.fields.positions')}</dt>
              <dd className="u-tabular">{formatNumber(mission.numberOfPositions)}</dd>
            </div>
          </dl>
          <div className="mission-actions">
            <Button disabled={writesLocked} type="submit" variant="danger">
              {t('missions.lifecycle.close.submit')}
            </Button>
          </div>
        </form>
      ) : null}

      {access.canArchive && mission.archivedAt === null && mission.state !== 'ARCHIVED' ? (
        canArchiveMissionState(mission) ? (
          <div className="mission-actions">
            <Button disabled={writesLocked} onClick={onArchive} variant="danger">
              {t('missions.lifecycle.archive.action')}
            </Button>
          </div>
        ) : (
          <p className="mission-muted">{t('missions.lifecycle.archive.closeFirst')}</p>
        )
      ) : null}
    </section>
  );
}
