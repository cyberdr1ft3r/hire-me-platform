import { describe, expect, it } from 'vitest';

import {
  candidateDeepLink,
  clientDeepLink,
  conversationDeepLink,
  missionDeepLink,
  recordNavigationIntent,
  trainingDeepLink,
} from './record-deep-links.js';

const CANDIDATE_ID = '11111111-1111-4111-8111-111111111111';
const CLIENT_ID = '77777777-7777-4777-8777-777777777777';
const MISSION_ID = '22222222-2222-4222-8222-222222222222';
const MEETING_ID = '33333333-3333-4333-8333-333333333333';
const PROGRAM_ID = '44444444-4444-4444-8444-444444444444';
const SESSION_ID = '55555555-5555-4555-8555-555555555555';
const CONVERSATION_ID = '66666666-6666-4666-8666-666666666666';

describe('record deep-link contract', () => {
  it('accepts only the route-specific UUID key', () => {
    expect(
      recordNavigationIntent(
        'candidates',
        `?candidate=${CANDIDATE_ID}&mission=${MISSION_ID}&unknown=value`,
      ),
    ).toEqual({
      candidateId: CANDIDATE_ID,
      clientId: null,
      conversationId: null,
      missionId: null,
      processId: null,
      interviewId: null,
      taskId: null,
      meetingId: null,
      programId: null,
      sessionId: null,
    });
    expect(recordNavigationIntent('clients', `?client=${CLIENT_ID}`)).toEqual({
      candidateId: null,
      clientId: CLIENT_ID,
      conversationId: null,
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
      clientId: null,
      conversationId: null,
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
      clientId: null,
      conversationId: null,
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
      clientId: null,
      conversationId: null,
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
      clientId: null,
      conversationId: null,
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
      clientId: null,
      conversationId: null,
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
      clientId: null,
      conversationId: null,
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
      clientId: null,
      conversationId: null,
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
    expect(clientDeepLink(CLIENT_ID)).toBe(`/clients?client=${CLIENT_ID}`);
    expect(missionDeepLink(MISSION_ID)).toBe(`/missions?mission=${MISSION_ID}`);
    expect(trainingDeepLink(PROGRAM_ID)).toBe(`/training?program=${PROGRAM_ID}`);
    expect(trainingDeepLink(PROGRAM_ID, SESSION_ID)).toBe(
      `/training?program=${PROGRAM_ID}&session=${SESSION_ID}`,
    );
    expect(conversationDeepLink(CONVERSATION_ID)).toBe(`/messages?conversation=${CONVERSATION_ID}`);
  });

  it('accepts an exact conversation only on the Messages route', () => {
    expect(
      recordNavigationIntent('messages', `?conversation=${CONVERSATION_ID}`).conversationId,
    ).toBe(CONVERSATION_ID);
    expect(
      recordNavigationIntent('tasks', `?conversation=${CONVERSATION_ID}`).conversationId,
    ).toBeNull();
  });
});
