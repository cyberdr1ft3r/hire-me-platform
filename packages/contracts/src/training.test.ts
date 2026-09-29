import { describe, expect, it } from 'vitest';

import {
  TrainingEnrollmentOptionsResponseSchema,
  TrainingInternalUserOptionQuerySchema,
  TrainingInternalUserOptionsResponseSchema,
  TrainingEnrollmentListQuerySchema,
  TrainingParticipationSummarySchema,
  TrainingParticipationListQuerySchema,
  TrainingProgramListQuerySchema,
  TrainingQueryBooleanSchema,
  TrainingSessionListQuerySchema,
} from './training.js';

describe('training query booleans', () => {
  it('defaults to false when the flag is omitted', () => {
    expect(TrainingProgramListQuerySchema.parse({}).includeArchived).toBe(false);
    expect(TrainingSessionListQuerySchema.parse({}).includeArchived).toBe(false);
    expect(TrainingEnrollmentListQuerySchema.parse({}).certificateReadyOnly).toBe(false);
    expect(TrainingParticipationListQuerySchema.parse({}).includeArchived).toBe(false);
  });

  it('parses the string "true" and "false" explicitly', () => {
    expect(TrainingProgramListQuerySchema.parse({ includeArchived: 'true' }).includeArchived).toBe(
      true,
    );
    // Plain coercion would make this true, which is the bug this schema prevents.
    expect(TrainingProgramListQuerySchema.parse({ includeArchived: 'false' }).includeArchived).toBe(
      false,
    );
    expect(
      TrainingEnrollmentListQuerySchema.parse({ certificateReadyOnly: 'false' })
        .certificateReadyOnly,
    ).toBe(false);
    expect(
      TrainingEnrollmentListQuerySchema.parse({ certificateReadyOnly: 'true' })
        .certificateReadyOnly,
    ).toBe(true);
  });

  it('rejects values that are not exactly true or false', () => {
    for (const invalid of ['1', '0', 'yes', 'no', 'TRUE', 'False', '', 'null']) {
      expect(TrainingProgramListQuerySchema.safeParse({ includeArchived: invalid }).success).toBe(
        false,
      );
      expect(
        TrainingEnrollmentListQuerySchema.safeParse({ certificateReadyOnly: invalid }).success,
      ).toBe(false);
    }
  });

  it('accepts real booleans for programmatic callers', () => {
    expect(TrainingQueryBooleanSchema.parse(true)).toBe(true);
    expect(TrainingQueryBooleanSchema.parse(false)).toBe(false);
  });
});

describe('training option and participant presentation contracts', () => {
  it('trims bounded option searches and rejects empty or oversized values', () => {
    expect(TrainingInternalUserOptionQuerySchema.parse({ search: '  trainer  ' })).toEqual({
      search: 'trainer',
    });
    expect(TrainingInternalUserOptionQuerySchema.safeParse({ search: '   ' }).success).toBe(false);
    expect(
      TrainingInternalUserOptionQuerySchema.safeParse({ search: 'x'.repeat(121) }).success,
    ).toBe(false);
  });

  it('keeps internal-user option responses bounded to safe fields', () => {
    const parsed = TrainingInternalUserOptionsResponseSchema.parse({
      users: [
        {
          id: '00000000-0000-4000-8000-000000000001',
          displayName: 'Ada Trainer',
          email: 'ada@example.test',
          locale: 'fr',
          permissions: ['admin'],
        },
      ],
    });

    expect(parsed.users[0]).toEqual({
      id: '00000000-0000-4000-8000-000000000001',
      displayName: 'Ada Trainer',
      email: 'ada@example.test',
    });
    expect(
      TrainingInternalUserOptionsResponseSchema.safeParse({
        users: Array.from({ length: 21 }, (_, index) => ({
          id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
          displayName: `User ${index}`,
          email: `user-${index}@example.test`,
        })),
      }).success,
    ).toBe(false);
  });

  it('models enrollment options and nullable redaction-safe participation display', () => {
    const enrollmentId = '00000000-0000-4000-8000-000000000010';
    expect(
      TrainingEnrollmentOptionsResponseSchema.parse({
        enrollments: [
          {
            id: enrollmentId,
            participantType: 'USER',
            participant: { displayName: 'Internal Learner', email: null },
          },
        ],
      }).enrollments[0]?.participant.displayName,
    ).toBe('Internal Learner');

    const participation = TrainingParticipationSummarySchema.parse({
      id: '00000000-0000-4000-8000-000000000011',
      trainingSessionId: '00000000-0000-4000-8000-000000000012',
      trainingEnrollmentId: enrollmentId,
      status: 'EXPECTED',
      attendanceRecordedAt: null,
      recordedByUserId: null,
      sessionOutcome: null,
      completionStatus: null,
      trainerNotes: null,
      correctionCount: 0,
      lastCorrectedAt: null,
      lastCorrectionReason: null,
      enrollment: {
        id: enrollmentId,
        participantType: 'CANDIDATE',
        participantDisplay: null,
      },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      archivedAt: null,
    });
    expect(participation.enrollment.participantDisplay).toBeNull();
  });
});
