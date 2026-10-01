import { describe, expect, it } from 'vitest';
import type { TrainingSessionSummary } from '@hire-me/contracts';

import { TrainingRequestError } from '../api.js';
import { resolveTrainingAccess } from './training-access.js';
import {
  enrollmentArchivable,
  enrollmentIsTerminal,
  nextEnrollmentStatuses,
  nextParticipationStatuses,
  nextProgramStatuses,
  nextSessionStatuses,
  programAcceptsOperations,
  sessionAcceptsAttendance,
  sessionArchivable,
  sessionCancelable,
  sessionReschedulable,
} from './training-labels.js';
import {
  EMPTY_PROGRAM_FILTERS,
  EMPTY_SESSION_FILTERS,
  programFormFrom,
  toProgramListParameters,
  toProgramUpdateRequest,
  toSessionListParameters,
  toSessionUpdateRequest,
  sessionFormFrom,
  trainingFailureKey,
} from './training-state.js';
import {
  ACTOR_ID,
  CLIENT_ID,
  OWNER_ID,
  syntheticProgram,
  syntheticSession,
  TRAINER_ID,
} from './training-test-data.js';

describe('Training access', () => {
  it('leaves every write out for a view-only account', () => {
    const access = resolveTrainingAccess([
      'training_programs:view',
      'training_sessions:view',
      'training_enrollments:view',
      'training_participation:view',
    ]);
    expect(access.readOnly).toBe(true);
    expect(access.viewParticipation).toBe(true);
    expect(access.manageSessions || access.manageEnrollments || access.pickClients).toBe(false);
  });

  it('offers each participant source only with its own read permission', () => {
    const base = ['training_programs:view', 'training_enrollments:manage'];
    expect(resolveTrainingAccess(base)).toMatchObject({
      enrollCandidates: false,
      enrollClientContacts: false,
      enrollUsers: true,
    });
    expect(resolveTrainingAccess([...base, 'candidates:view']).enrollCandidates).toBe(true);
    expect(resolveTrainingAccess([...base, 'clients:view']).enrollClientContacts).toBe(false);
    expect(
      resolveTrainingAccess([...base, 'clients:view', 'client_contacts:view']).enrollClientContacts,
    ).toBe(true);
  });

  it('requires session read for attendance, which lives under a selected session', () => {
    expect(
      resolveTrainingAccess(['training_participation:view', 'training_participation:manage']),
    ).toMatchObject({ manageParticipation: false, viewParticipation: false });
  });

  it('gates certificate generation on generation and enrollment read', () => {
    expect(resolveTrainingAccess(['documents:generate']).generateCertificate).toBe(false);
    expect(
      resolveTrainingAccess(['documents:generate', 'training_enrollments:view'])
        .generateCertificate,
    ).toBe(true);
  });
});

describe('Training lifecycles mirror the API', () => {
  it('offers program, session, enrollment, and attendance next steps only', () => {
    expect(nextProgramStatuses('PROGRAM_DRAFT')).toEqual(['PROGRAM_ACTIVE']);
    expect(nextProgramStatuses('PROGRAM_CLOSED')).toEqual([]);
    expect(nextSessionStatuses('SESSION_SCHEDULED')).toEqual([
      'SESSION_IN_PROGRESS',
      'SESSION_POSTPONED',
    ]);
    expect(nextSessionStatuses('SESSION_COMPLETED')).toEqual([]);
    expect(nextEnrollmentStatuses('APPROVAL_PENDING')).toEqual(['APPROVED', 'REJECTED']);
    expect(nextEnrollmentStatuses('CLOSED')).toEqual([]);
    expect(nextParticipationStatuses('EXPECTED')).toEqual(['ATTENDED', 'ABSENT', 'EXCUSED']);
    expect(nextParticipationStatuses('SESSION_OUTCOME_RECORDED')).toEqual([]);
  });

  it('closes child operations once a program is closed or archived', () => {
    expect(programAcceptsOperations(syntheticProgram({ status: 'PROGRAM_ACTIVE' }))).toBe(true);
    expect(programAcceptsOperations(syntheticProgram({ status: 'PROGRAM_CLOSED' }))).toBe(false);
    expect(
      programAcceptsOperations(
        syntheticProgram({ status: 'PROGRAM_ARCHIVED', archivedAt: '2026-09-02T00:00:00.000Z' }),
      ),
    ).toBe(false);
  });

  it('allows reschedule, cancel, archive, and attendance only in their states', () => {
    const at = (status: TrainingSessionSummary['status']) => syntheticSession({ status });
    expect(sessionReschedulable(at('SESSION_POSTPONED'))).toBe(true);
    expect(sessionReschedulable(at('SESSION_IN_PROGRESS'))).toBe(false);
    expect(sessionCancelable(at('SESSION_PLANNED'))).toBe(false);
    expect(sessionCancelable(at('SESSION_SCHEDULED'))).toBe(true);
    expect(sessionArchivable(at('SESSION_CANCELED'))).toBe(true);
    expect(sessionArchivable(at('SESSION_SCHEDULED'))).toBe(false);
    expect(sessionAcceptsAttendance(at('SESSION_PLANNED'))).toBe(false);
    expect(sessionAcceptsAttendance(at('SESSION_COMPLETED'))).toBe(true);
  });

  it('archives an enrollment only once it is terminal', () => {
    const enrollment = { archivedAt: null } as const;
    expect(enrollmentIsTerminal({ ...enrollment, status: 'CANCELED' })).toBe(true);
    expect(enrollmentArchivable({ ...enrollment, status: 'CANCELED' })).toBe(true);
    expect(enrollmentArchivable({ ...enrollment, status: 'ENROLLED' })).toBe(false);
  });
});

describe('Training queries carry only picker-chosen or signed-in identifiers', () => {
  it('maps program filters, owner scope, and archived history to API parameters', () => {
    expect(
      toProgramListParameters(
        {
          ...EMPTY_PROGRAM_FILTERS,
          search: '  onboarding ',
          client: { id: CLIENT_ID, label: 'Synthetic Client', detail: null },
          ownerScope: 'me',
          sort: 'name',
        },
        ACTOR_ID,
      ),
    ).toEqual({
      search: 'onboarding',
      status: undefined,
      includeArchived: undefined,
      clientId: CLIENT_ID,
      ownerUserId: ACTOR_ID,
      sortBy: 'name',
      sortDirection: 'asc',
    });
    expect(
      toProgramListParameters({ ...EMPTY_PROGRAM_FILTERS, status: 'PROGRAM_ARCHIVED' }, ACTOR_ID)
        .includeArchived,
    ).toBe(true);
  });

  it('turns session dates into whole-day bounds and a chosen trainer into its ID', () => {
    const parameters = toSessionListParameters(
      {
        ...EMPTY_SESSION_FILTERS,
        from: '2026-09-01',
        to: '2026-09-30',
        trainerScope: 'selected',
        trainer: { id: TRAINER_ID, label: 'Synthetic Trainer', detail: null },
      },
      ACTOR_ID,
    );
    expect(parameters.trainerUserId).toBe(TRAINER_ID);
    expect(Date.parse(parameters.scheduledFrom!)).toBeLessThan(Date.parse(parameters.scheduledTo!));
  });
});

describe('Training forms send only what changed', () => {
  it('sends nothing for an untouched program and only the changed owner otherwise', () => {
    const program = syntheticProgram({
      ownerUserId: OWNER_ID,
      ownerDisplayName: 'Synthetic Owner',
    });
    expect(toProgramUpdateRequest(programFormFrom(program), program)).toBeNull();
    expect(toProgramUpdateRequest({ ...programFormFrom(program), owner: null }, program)).toEqual({
      ownerUserId: null,
    });
  });

  it('never rewrites the schedule through a session detail edit', () => {
    const session = syntheticSession({});
    const update = toSessionUpdateRequest(
      { ...sessionFormFrom(session), title: 'Renamed' },
      session,
    );
    expect(update).toEqual({ title: 'Renamed' });
  });
});

describe('Training failures map to localized copy by stable code', () => {
  it('prefers the code, then falls back by status', () => {
    expect(trainingFailureKey(new TrainingRequestError(409, 'TRAINING_PROGRAM_CLOSED'))).toBe(
      'training.feedback.failure.programClosed',
    );
    expect(trainingFailureKey(new TrainingRequestError(409, 'UNKNOWN_CODE'))).toBe(
      'training.feedback.failure.lifecycle',
    );
    expect(trainingFailureKey(new TrainingRequestError(404, null))).toBe(
      'training.feedback.failure.notFound',
    );
    expect(trainingFailureKey(new Error('network'))).toBe('training.feedback.failure.generic');
  });
});
