import type { MissionAccess } from './mission-access.js';

/** Bounded local areas inside the selected mission detail pane. */
export type MissionDetailSection = 'overview' | 'team' | 'pipeline' | 'public';

const SECTION_ORDER: readonly MissionDetailSection[] = ['overview', 'team', 'pipeline', 'public'];

export function visibleMissionDetailSections(access: MissionAccess): MissionDetailSection[] {
  const sections: MissionDetailSection[] = ['overview'];
  if (access.canViewAssignments || access.canManageAssignments) {
    sections.push('team');
  }
  if (access.canViewProcesses) {
    sections.push('pipeline');
  }
  if (access.canViewPublicOpportunity || access.canViewPublicApplications) {
    sections.push('public');
  }
  return sections;
}

export function normalizeMissionDetailSection(
  section: MissionDetailSection,
  access: MissionAccess,
): MissionDetailSection {
  const visible = visibleMissionDetailSections(access);
  return visible.includes(section) ? section : (visible[0] ?? 'overview');
}

export function missionDetailSectionPanelId(section: MissionDetailSection): string {
  return `mission-detail-panel-${section}`;
}

export function missionDetailSectionTabId(section: MissionDetailSection): string {
  return `mission-detail-tab-${section}`;
}

export function nextMissionDetailSection(
  current: MissionDetailSection,
  direction: 1 | -1,
  access: MissionAccess,
): MissionDetailSection {
  const visible = visibleMissionDetailSections(access);
  const index = visible.indexOf(current);
  if (index < 0) {
    return visible[0] ?? 'overview';
  }
  const next = visible[index + direction];
  return next ?? current;
}

export function defaultMissionDetailSectionForIntent(options: {
  hasProcessIntent: boolean;
  hasInterviewIntent: boolean;
  access: MissionAccess;
}): MissionDetailSection {
  if ((options.hasProcessIntent || options.hasInterviewIntent) && options.access.canViewProcesses) {
    return 'pipeline';
  }
  return 'overview';
}

export { SECTION_ORDER as MISSION_DETAIL_SECTION_ORDER };
