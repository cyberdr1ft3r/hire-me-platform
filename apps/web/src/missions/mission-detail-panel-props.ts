import type { MissionAccess } from './mission-access.js';
import {
  MISSION_DETAIL_SECTION_LABEL_KEY,
  missionDetailSectionPanelId,
  missionDetailSectionTabId,
  missionDetailUsesTabNavigation,
  type MissionDetailSection,
} from './mission-detail-section.js';

type PanelLabel = (key: (typeof MISSION_DETAIL_SECTION_LABEL_KEY)[MissionDetailSection]) => string;

/** Accessible wrapper props when the local tablist is shown vs a single bounded region. */
export function missionDetailPanelProps(
  section: MissionDetailSection,
  access: MissionAccess,
  activeSection: MissionDetailSection,
  label: PanelLabel,
): {
  'aria-label'?: string;
  'aria-labelledby'?: string;
  hidden?: boolean;
  id: string;
  role: 'region' | 'tabpanel';
} {
  const id = missionDetailSectionPanelId(section);
  if (missionDetailUsesTabNavigation(access)) {
    return {
      'aria-labelledby': missionDetailSectionTabId(section),
      hidden: section !== activeSection,
      id,
      role: 'tabpanel',
    };
  }
  return {
    'aria-label': label(MISSION_DETAIL_SECTION_LABEL_KEY[section]),
    id,
    role: 'region',
  };
}
