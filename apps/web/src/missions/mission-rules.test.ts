import { describe, expect, it } from 'vitest';

import { MissionRequestError } from '../api.js';
import { resolveMissionAccess } from './mission-access.js';
import { classifyMissionFailure } from './mission-errors.js';
import { toMissionCreateRequest, toMissionUpdateRequest } from './mission-form.js';
import {
  CLOSURE_REASON_BY_STATE,
  MISSION_CLOSURE_STATES,
  canArchiveMissionState,
  canBecomeLead,
  canCreateOfferInState,
  canPresentInState,
  isMissionWritable,
  isProcessWritable,
  nextProcessStates,
} from './mission-labels.js';
import { EMPTY_MISSION_CREATE, publicOpportunityWritable } from './mission-state.js';
import { MISSION_A_ID, syntheticPublicOpportunity } from './mission-test-data.js';

describe('resolveMissionAccess', () => {
  it('grants nothing without missions:view, whatever else is held', () => {
    const access = resolveMissionAccess(['missions:update', 'mission_assignments:manage']);
    expect(access.canView).toBe(false);
    expect(access.canUpdate).toBe(false);
    expect(access.canManageAssignments).toBe(false);
    expect(access.readOnly).toBe(false);
  });

  it('marks a view-only actor as read-only', () => {
    const access = resolveMissionAccess(['missions:view', 'mission_candidates:view']);
    expect(access.canView).toBe(true);
    expect(access.canViewProcesses).toBe(true);
    expect(access.readOnly).toBe(true);
    expect(access.canCreate).toBe(false);
  });

  it('maps each capability to its own backend permission, never a broader one', () => {
    const access = resolveMissionAccess(['missions:view', 'mission_assignments:view']);
    expect(access.canViewAssignments).toBe(true);
    expect(access.canManageAssignments).toBe(false);
    expect(resolveMissionAccess(['missions:view', 'missions:status:manage']).canClose).toBe(false);
    expect(resolveMissionAccess(['missions:view', 'missions:closure:manage']).canClose).toBe(true);
    expect(resolveMissionAccess(['missions:view', 'clients:view']).canViewClientContacts).toBe(
      false,
    );
  });
});

describe('mission rules mirrored from the API', () => {
  it('derives exactly one closure reason per closure state', () => {
    for (const state of MISSION_CLOSURE_STATES) {
      expect(CLOSURE_REASON_BY_STATE[state]).toBeTruthy();
    }
    expect(CLOSURE_REASON_BY_STATE.CLOSED_WITH_RECRUITMENT).toBe(
      'POSITIONS_FILLED_AND_CANDIDATES_INTEGRATED',
    );
  });

  it('treats closed missions as read-only but archivable', () => {
    expect(isMissionWritable({ state: 'ACTIVE', archivedAt: null })).toBe(true);
    expect(isMissionWritable({ state: 'CANCELED', archivedAt: null })).toBe(false);
    expect(canArchiveMissionState({ state: 'ACTIVE', archivedAt: null })).toBe(false);
    expect(canArchiveMissionState({ state: 'CANCELED', archivedAt: null })).toBe(true);
    expect(
      canArchiveMissionState({ state: 'ARCHIVED', archivedAt: '2026-09-15T10:00:00.000Z' }),
    ).toBe(false);
  });

  it('allows process writes and offers only in the stages the API accepts', () => {
    expect(isProcessWritable({ state: 'CLIENT_OFFER', archivedAt: null })).toBe(true);
    expect(isProcessWritable({ state: 'WITHDRAWN', archivedAt: null })).toBe(false);
    expect(canCreateOfferInState('CLIENT_OFFER')).toBe(true);
    expect(canCreateOfferInState('HR_PRESELECTION')).toBe(false);
  });

  it('presents only through the presentation action, from the stages that allow it', () => {
    for (const state of ['INTERNAL_VALIDATION', 'WAITING'] as const) {
      expect(nextProcessStates(state)).not.toContain('PRESENTED_TO_CLIENT');
      expect(canPresentInState(state)).toBe(true);
    }
    expect(canPresentInState('NEW')).toBe(false);
    expect(nextProcessStates('ACCEPTED')).not.toContain('INTEGRATED');
  });

  it('offers lead only to an active lead-recruiter assignment that is not already lead', () => {
    expect(canBecomeLead({ isLead: false, role: 'LEAD_RECRUITER', status: 'ACTIVE' })).toBe(true);
    expect(canBecomeLead({ isLead: true, role: 'LEAD_RECRUITER', status: 'ACTIVE' })).toBe(false);
    expect(canBecomeLead({ isLead: false, role: 'RECRUITER', status: 'ACTIVE' })).toBe(false);
    expect(canBecomeLead({ isLead: false, role: 'LEAD_RECRUITER', status: 'INACTIVE' })).toBe(
      false,
    );
  });
});

describe('mission form mapping', () => {
  it('sends the chosen client ID and never a typed one', () => {
    expect(toMissionCreateRequest({ ...EMPTY_MISSION_CREATE, title: 'Role' })).toBeNull();
    const request = toMissionCreateRequest({
      ...EMPTY_MISSION_CREATE,
      client: { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', label: 'Synthetic Client' },
      title: '  Synthetic role  ',
      location: '  ',
    });
    expect(request).toEqual(
      expect.objectContaining({
        clientId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        title: 'Synthetic role',
        numberOfPositions: 1,
        location: undefined,
      }),
    );
  });

  it('clears emptied optional profile fields to null on update', () => {
    expect(
      toMissionUpdateRequest({
        title: 'Role',
        priority: 'HIGH',
        numberOfPositions: '3',
        location: '',
        workArrangement: 'Remote',
        engagementType: ' ',
      }),
    ).toEqual({
      title: 'Role',
      priority: 'HIGH',
      numberOfPositions: 3,
      location: null,
      workArrangement: 'Remote',
      engagementType: null,
    });
  });
});

describe('public opportunity section state', () => {
  it('allows writes only in ready or missing states', () => {
    expect(publicOpportunityWritable({ status: 'missing' })).toBe(true);
    expect(
      publicOpportunityWritable({
        status: 'ready',
        data: syntheticPublicOpportunity(MISSION_A_ID),
      }),
    ).toBe(true);
    expect(publicOpportunityWritable({ status: 'loading' })).toBe(false);
    expect(publicOpportunityWritable({ status: 'error' })).toBe(false);
  });
});

describe('classifyMissionFailure', () => {
  it('reads only the HTTP status', () => {
    expect(classifyMissionFailure(new MissionRequestError(409, 'MISSION_TERMINAL'))).toBe(
      'conflict',
    );
    expect(classifyMissionFailure(new MissionRequestError(404, null))).toBe('notFound');
    expect(classifyMissionFailure(new MissionRequestError(403, null))).toBe('forbidden');
    expect(classifyMissionFailure(new MissionRequestError(400, null))).toBe('invalid');
    expect(classifyMissionFailure(new Error('network'))).toBe('unavailable');
  });
});
