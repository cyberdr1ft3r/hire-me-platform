import type { MissionLifecycleState, MissionSummary } from '@hire-me/contracts';
import { useEffect, useState, type FormEvent } from 'react';

import { useI18n } from '../i18n/index.js';
import { Button, Select, StatusBadge, TextField } from '../ui/index.js';
import type { MissionAccess } from './mission-access.js';
import {
  CLOSURE_REASON_BY_STATE,
  canArchiveMissionState,
  closureReasonLabelKey,
  isMissionWritable,
  missionStateLabelKey,
  missionStateTone,
  nextMissionStates,
  type MissionClosureState,
} from './mission-labels.js';
import {
  closureStatesFrom,
  defaultClosureState,
  isLegalClosureTransition,
} from './mission-closure.js';

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
  const legalClosureStates = closureStatesFrom(mission.state);
  const [closureState, setClosureState] = useState<MissionClosureState | null>(() =>
    defaultClosureState(mission.state),
  );
  const [filled, setFilled] = useState(String(mission.filledPlacementCount));
  const [filledError, setFilledError] = useState(false);

  useEffect(() => {
    setFilled(String(mission.filledPlacementCount));
    setFilledError(false);
    const legal = closureStatesFrom(mission.state);
    setClosureState((current) => {
      if (legal.length === 0) {
        return null;
      }
      if (current && legal.includes(current)) {
        return current;
      }
      return legal[0] ?? null;
    });
  }, [mission.id, mission.state, mission.filledPlacementCount]);

  function handleClose(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!closureState || !isLegalClosureTransition(mission.state, closureState)) {
      return;
    }
    const filledPlacementCount = Number(filled.trim());
    if (
      closureState === 'CLOSED_WITH_RECRUITMENT' &&
      filledPlacementCount < mission.numberOfPositions
    ) {
      setFilledError(true);
      return;
    }
    setFilledError(false);
    onClose({ state: closureState, filledPlacementCount });
  }

  const derivedReason = closureState === null ? null : CLOSURE_REASON_BY_STATE[closureState];

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

      {access.canClose && writable && legalClosureStates.length > 0 && closureState ? (
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
              onChange={(event) => {
                const next =
                  legalClosureStates.find((state) => state === event.currentTarget.value) ?? null;
                setClosureState(next);
                setFilledError(false);
              }}
              value={closureState}
            >
              {legalClosureStates.map((state) => (
                <option key={state} value={state}>
                  {t(missionStateLabelKey(state))}
                </option>
              ))}
            </Select>
            <TextField
              error={filledError ? t('missions.lifecycle.close.filledRecruitmentError') : undefined}
              hint={
                closureState === 'CLOSED_WITH_RECRUITMENT'
                  ? t('missions.lifecycle.close.filledRecruitmentHint', {
                      count: mission.numberOfPositions,
                    })
                  : undefined
              }
              inputMode="numeric"
              label={t('missions.lifecycle.close.filled')}
              max={mission.numberOfPositions}
              min={0}
              name="filledPlacementCount"
              onChange={(event) => {
                setFilled(event.currentTarget.value);
                setFilledError(false);
              }}
              required
              type="number"
              value={filled}
            />
          </div>
          {derivedReason ? (
            <dl className="mission-summary">
              <div className="mission-summary__item">
                <dt>{t('missions.lifecycle.close.reason')}</dt>
                <dd>{t(closureReasonLabelKey(derivedReason))}</dd>
              </div>
              <div className="mission-summary__item">
                <dt>{t('missions.profile.fields.positions')}</dt>
                <dd className="u-tabular">{formatNumber(mission.numberOfPositions)}</dd>
              </div>
            </dl>
          ) : null}
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
