import { describe, expect, it } from 'vitest';

import { candidateDeepLink, missionDeepLink, recordNavigationIntent } from './record-deep-links.js';

const CANDIDATE_ID = '11111111-1111-4111-8111-111111111111';
const MISSION_ID = '22222222-2222-4222-8222-222222222222';
const MEETING_ID = '33333333-3333-4333-8333-333333333333';
const PROGRAM_ID = '44444444-4444-4444-8444-444444444444';
const SESSION_ID = '55555555-5555-4555-8555-555555555555';

describe('record deep-link contract', () => {
  it('accepts only the route-specific UUID key', () => {
    expect(
      recordNavigationIntent(
        'candidates',
        `?candidate=${CANDIDATE_ID}&mission=${MISSION_ID}&unknown=value`,
      ),
    ).toEqual({
      candidateId: CANDIDATE_ID,
      missionId: null,
      processId: null,
      interviewId: null,
      taskId: null,
      meetingId: null,
      programId: null,
      sessionId: null,
    });
    expect(recordNavigationIntent('missions', `?mission=${MISSION_ID}`)).toEqual({
      candidateId: null,
      missionId: MISSION_ID,
      processId: null,
      interviewId: null,
      taskId: null,
      meetingId: null,
      programId: null,
      sessionId: null,
    });
  });

  it('ignores malformed, misplaced, and ambiguous identifiers', () => {
    expect(recordNavigationIntent('candidates', '?candidate=not-a-uuid&id=secret')).toEqual({
      candidateId: null,
      missionId: null,
      processId: null,
      interviewId: null,
      taskId: null,
      meetingId: null,
      programId: null,
      sessionId: null,
    });
    expect(recordNavigationIntent('reporting', `?candidate=${CANDIDATE_ID}`)).toEqual({
      candidateId: null,
      missionId: null,
      processId: null,
      interviewId: null,
      taskId: null,
      meetingId: null,
      programId: null,
      sessionId: null,
    });
    expect(
      recordNavigationIntent(
        'candidates',
        `?candidate=${CANDIDATE_ID}&candidate=33333333-3333-4333-8333-333333333333`,
      ),
    ).toEqual({
      candidateId: null,
      missionId: null,
      processId: null,
      interviewId: null,
      taskId: null,
      meetingId: null,
      programId: null,
      sessionId: null,
    });
  });

  it('parses meetings and training deep-link query keys on their routes', () => {
    expect(recordNavigationIntent('meetings', `?meeting=${MEETING_ID}`)).toEqual({
      candidateId: null,
      missionId: null,
      processId: null,
      interviewId: null,
      taskId: null,
      meetingId: MEETING_ID,
      programId: null,
      sessionId: null,
    });
    expect(
      recordNavigationIntent('training', `?program=${PROGRAM_ID}&session=${SESSION_ID}`),
    ).toEqual({
      candidateId: null,
      missionId: null,
      processId: null,
      interviewId: null,
      taskId: null,
      meetingId: null,
      programId: PROGRAM_ID,
      sessionId: SESSION_ID,
    });
    expect(recordNavigationIntent('agenda', `?meeting=${MEETING_ID}`)).toEqual({
      candidateId: null,
      missionId: null,
      processId: null,
      interviewId: null,
      taskId: null,
      meetingId: null,
      programId: null,
      sessionId: null,
    });
  });

  it('generates language-neutral record URLs containing IDs only', () => {
    expect(candidateDeepLink(CANDIDATE_ID)).toBe(`/candidates?candidate=${CANDIDATE_ID}`);
    expect(missionDeepLink(MISSION_ID)).toBe(`/missions?mission=${MISSION_ID}`);
  });
});
