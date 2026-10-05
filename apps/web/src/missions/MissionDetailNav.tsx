import { useCallback, useRef, type KeyboardEvent } from 'react';

import { useI18n } from '../i18n/index.js';
import type { MissionAccess } from './mission-access.js';
import {
  missionDetailSectionPanelId,
  missionDetailSectionTabId,
  nextMissionDetailSection,
  type MissionDetailSection,
  visibleMissionDetailSections,
} from './mission-detail-section.js';

const LABEL_KEYS: Record<
  MissionDetailSection,
  | 'missions.detail.nav.overview'
  | 'missions.detail.nav.team'
  | 'missions.detail.nav.pipeline'
  | 'missions.detail.nav.public'
> = {
  overview: 'missions.detail.nav.overview',
  team: 'missions.detail.nav.team',
  pipeline: 'missions.detail.nav.pipeline',
  public: 'missions.detail.nav.public',
};

export function MissionDetailNav({
  access,
  active,
  onChange,
}: {
  access: MissionAccess;
  active: MissionDetailSection;
  onChange: (section: MissionDetailSection) => void;
}) {
  const { t } = useI18n();
  const sections = visibleMissionDetailSections(access);
  const tablistRef = useRef<HTMLDivElement>(null);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>, section: MissionDetailSection) => {
      if (
        event.key !== 'ArrowLeft' &&
        event.key !== 'ArrowRight' &&
        event.key !== 'Home' &&
        event.key !== 'End'
      ) {
        return;
      }
      event.preventDefault();
      let next = section;
      if (event.key === 'Home') {
        next = sections[0] ?? 'overview';
      } else if (event.key === 'End') {
        next = sections[sections.length - 1] ?? 'overview';
      } else if (event.key === 'ArrowLeft') {
        next = nextMissionDetailSection(section, -1, access);
      } else {
        next = nextMissionDetailSection(section, 1, access);
      }
      onChange(next);
      const tab = tablistRef.current?.querySelector<HTMLButtonElement>(
        `#${missionDetailSectionTabId(next)}`,
      );
      tab?.focus();
    },
    [access, onChange, sections],
  );

  if (sections.length <= 1) {
    return null;
  }

  return (
    <div
      aria-label={t('missions.detail.nav.region')}
      className="mission-detail-nav accounting-segments"
      ref={tablistRef}
      role="tablist"
    >
      {sections.map((section) => {
        const selected = section === active;
        return (
          <button
            aria-controls={missionDetailSectionPanelId(section)}
            aria-selected={selected}
            className="accounting-segments__option mission-detail-nav__tab"
            id={missionDetailSectionTabId(section)}
            key={section}
            onClick={() => onChange(section)}
            onKeyDown={(event) => onKeyDown(event, section)}
            role="tab"
            tabIndex={selected ? 0 : -1}
            type="button"
          >
            {t(LABEL_KEYS[section])}
          </button>
        );
      })}
    </div>
  );
}
