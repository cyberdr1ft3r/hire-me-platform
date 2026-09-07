import { describe, expect, it } from 'vitest';

import {
  TrainingEnrollmentListQuerySchema,
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
