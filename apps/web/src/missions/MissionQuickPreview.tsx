import type { MissionSummary } from '@hire-me/contracts';
import { useEffect, useId, useRef, type KeyboardEvent } from 'react';

import { useI18n } from '../i18n/index.js';
import { Button, Drawer, StatusBadge } from '../ui/index.js';
import {
  missionPriorityLabelKey,
  missionPriorityTone,
  missionStateLabelKey,
  missionStateTone,
} from './mission-labels.js';

/**
 * A lightweight look at one directory row without leaving the directory.
 *
 * It is built only from the list row the directory already holds, so opening it
 * sends no request and starts no timer (the record's team, pipeline and public
 * reads wait until the record is opened). Commercial terms are never shown here,
 * whatever the actor's access. There are no write actions.
 *
 * Two presentations of the same content, as in Candidates:
 * - `pane` (wide workspaces): not modal, beside the directory.
 * - `sheet` (narrow workspaces): the shared drawer as a bottom sheet; modal, Tab
 *   kept inside, Escape/Close/scrim return focus to the row.
 */
export function MissionQuickPreview({
  mission,
  onClose,
  onOpenRecord,
  presentation = 'pane',
}: {
  mission: MissionSummary;
  onClose: () => void;
  onOpenRecord: () => void;
  presentation?: 'pane' | 'sheet';
}) {
  const { t } = useI18n();

  if (presentation === 'sheet') {
    return (
      <Drawer
        description={mission.clientName}
        footer={(requestClose) => (
          <>
            <Button onClick={requestClose} variant="secondary">
              {t('common.actions.close')}
            </Button>
            <Button onClick={onOpenRecord}>{t('missions.preview.openRecord')}</Button>
          </>
        )}
        initialFocus="title"
        onClose={onClose}
        placement="bottom"
        title={mission.title}
      >
        <div className="mission-preview mission-preview--sheet" data-mission-id={mission.id}>
          <p className="mission-preview__eyebrow">{t('missions.preview.eyebrow')}</p>
          <PreviewBadges mission={mission} />
          <PreviewDetails mission={mission} />
        </div>
      </Drawer>
    );
  }

  return <PreviewPane mission={mission} onClose={onClose} onOpenRecord={onOpenRecord} />;
}

function PreviewPane({
  mission,
  onClose,
  onOpenRecord,
}: {
  mission: MissionSummary;
  onClose: () => void;
  onOpenRecord: () => void;
}) {
  const { t } = useI18n();
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);

  // A different row opened while the preview was showing moves focus to its heading too.
  useEffect(() => {
    headingRef.current?.focus();
  }, [mission.id]);

  function handleKeyDown(event: KeyboardEvent<HTMLElement>): void {
    if (event.key === 'Escape' && !event.defaultPrevented) {
      event.preventDefault();
      onClose();
    }
  }

  return (
    <section
      aria-labelledby={headingId}
      className="mission-preview"
      data-mission-id={mission.id}
      onKeyDown={handleKeyDown}
    >
      <header className="mission-preview__header">
        <p className="mission-preview__eyebrow">{t('missions.preview.eyebrow')}</p>
        <Button
          aria-label={t('missions.preview.close')}
          onClick={onClose}
          size="compact"
          variant="quiet"
        >
          {t('common.actions.close')}
        </Button>
      </header>
      <div className="mission-preview__identity">
        <h2 id={headingId} ref={headingRef} tabIndex={-1}>
          {mission.title}
        </h2>
        <p className="mission-preview__client">{mission.clientName}</p>
        <PreviewBadges mission={mission} />
      </div>
      <PreviewDetails mission={mission} />
      <div className="mission-preview__actions">
        <Button onClick={onOpenRecord}>{t('missions.preview.openRecord')}</Button>
      </div>
    </section>
  );
}

function PreviewBadges({ mission }: { mission: MissionSummary }) {
  const { t } = useI18n();
  return (
    <p className="mission-badges">
      <StatusBadge tone={missionStateTone(mission.state)}>
        {t(missionStateLabelKey(mission.state))}
      </StatusBadge>
      <StatusBadge tone={missionPriorityTone(mission.priority)}>
        {t(missionPriorityLabelKey(mission.priority))}
      </StatusBadge>
    </p>
  );
}

/** Ordinary mission summary fields the row carries; never commercial terms. */
function PreviewDetails({ mission }: { mission: MissionSummary }) {
  const { formatDate, formatNumber, t } = useI18n();
  const notRecorded = t('missions.notRecorded');
  const facts: [string, string | null][] = [
    [
      t('missions.profile.fields.positions'),
      t('missions.profile.positionsValue', {
        filled: formatNumber(mission.filledPlacementCount),
        total: formatNumber(mission.numberOfPositions),
      }),
    ],
    [t('missions.profile.fields.location'), mission.location],
    [t('missions.profile.fields.workArrangement'), mission.workArrangement],
    [t('missions.profile.fields.engagementType'), mission.engagementType],
    [
      t('missions.profile.fields.targetStartDate'),
      mission.targetStartDate ? formatDate(mission.targetStartDate) : null,
    ],
    [
      t('missions.profile.fields.applicationDeadline'),
      mission.applicationDeadline ? formatDate(mission.applicationDeadline) : null,
    ],
    [t('missions.preview.updated'), formatDate(mission.updatedAt)],
  ];

  return (
    <>
      <dl className="mission-preview__facts">
        {facts.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd data-recorded={value?.trim() ? undefined : 'false'}>
              {value?.trim() || notRecorded}
            </dd>
          </div>
        ))}
      </dl>
      {mission.description?.trim() ? (
        <div className="mission-preview__summary">
          <h3>{t('missions.profile.fields.description')}</h3>
          <p>{mission.description}</p>
        </div>
      ) : null}
    </>
  );
}
