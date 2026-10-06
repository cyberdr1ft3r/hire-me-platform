import { describe, expect, it } from 'vitest';

import { resolveMissionAccess } from './mission-access.js';
import {
  defaultMissionDetailSectionForIntent,
  missionDetailUsesTabNavigation,
  normalizeMissionDetailSection,
  visibleMissionDetailSections,
} from './mission-detail-section.js';

const FULL = resolveMissionAccess([
  'missions:view',
  'missions:update',
  'mission_assignments:view',
  'mission_candidates:view',
  'public_opportunities:view',
  'public_applications:view',
]);

describe('mission detail sections', () => {
  it('lists only sections the actor may use', () => {
    const limited = resolveMissionAccess(['missions:view', 'mission_candidates:view']);
    expect(visibleMissionDetailSections(limited)).toEqual(['overview', 'pipeline']);
  });

  it('defaults process and interview intents to pipeline when allowed', () => {
    expect(
      defaultMissionDetailSectionForIntent({
        access: FULL,
        hasInterviewIntent: true,
        hasProcessIntent: false,
      }),
    ).toBe('pipeline');
    expect(
      defaultMissionDetailSectionForIntent({
        access: FULL,
        hasProcessIntent: true,
        hasInterviewIntent: false,
      }),
    ).toBe('pipeline');
  });

  it('omits tab navigation when only overview is visible', () => {
    const overviewOnly = resolveMissionAccess(['missions:view']);
    expect(missionDetailUsesTabNavigation(overviewOnly)).toBe(false);
    expect(visibleMissionDetailSections(overviewOnly)).toEqual(['overview']);
  });

  it('falls back to overview when pipeline is not visible', () => {
    const overviewOnly = resolveMissionAccess(['missions:view']);
    expect(
      defaultMissionDetailSectionForIntent({
        access: overviewOnly,
        hasProcessIntent: true,
        hasInterviewIntent: false,
      }),
    ).toBe('overview');
    expect(normalizeMissionDetailSection('pipeline', overviewOnly)).toBe('overview');
  });
});
