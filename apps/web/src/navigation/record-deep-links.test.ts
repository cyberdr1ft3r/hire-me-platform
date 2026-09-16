import { describe, expect, it } from 'vitest';

import { candidateDeepLink, missionDeepLink, recordNavigationIntent } from './record-deep-links.js';

const CANDIDATE_ID = '11111111-1111-4111-8111-111111111111';
const MISSION_ID = '22222222-2222-4222-8222-222222222222';

describe('record deep-link contract', () => {
  it('accepts only the route-specific UUID key', () => {
    expect(
      recordNavigationIntent(
        'candidates',
        `?candidate=${CANDIDATE_ID}&mission=${MISSION_ID}&unknown=value`,
      ),
    ).toEqual({ candidateId: CANDIDATE_ID, missionId: null });
    expect(recordNavigationIntent('missions', `?mission=${MISSION_ID}`)).toEqual({
      candidateId: null,
      missionId: MISSION_ID,
    });
  });

  it('ignores malformed, misplaced, and ambiguous identifiers', () => {
    expect(recordNavigationIntent('candidates', '?candidate=not-a-uuid&id=secret')).toEqual({
      candidateId: null,
      missionId: null,
    });
    expect(recordNavigationIntent('reporting', `?candidate=${CANDIDATE_ID}`)).toEqual({
      candidateId: null,
      missionId: null,
    });
    expect(
      recordNavigationIntent(
        'candidates',
        `?candidate=${CANDIDATE_ID}&candidate=33333333-3333-4333-8333-333333333333`,
      ),
    ).toEqual({ candidateId: null, missionId: null });
  });

  it('generates language-neutral record URLs containing IDs only', () => {
    expect(candidateDeepLink(CANDIDATE_ID)).toBe(`/candidates?candidate=${CANDIDATE_ID}`);
    expect(missionDeepLink(MISSION_ID)).toBe(`/missions?mission=${MISSION_ID}`);
  });
});
