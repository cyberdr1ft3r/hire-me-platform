import { describe, expect, it } from 'vitest';

import {
  CANDIDATE_SALARY_EXPECTATION_CENTS_MAX,
  CandidateCreateRequestSchema,
  CandidateUpdateRequestSchema,
} from './candidates.js';

describe('Candidate salary expectation requests', () => {
  it('accept whole minor units from zero up to what the integer column holds', () => {
    expect(CANDIDATE_SALARY_EXPECTATION_CENTS_MAX).toBe(2_147_483_647);
    for (const salaryExpectationCents of [0, 3_600_050, CANDIDATE_SALARY_EXPECTATION_CENTS_MAX]) {
      expect(CandidateUpdateRequestSchema.parse({ salaryExpectationCents })).toEqual({
        salaryExpectationCents,
      });
      expect(
        CandidateCreateRequestSchema.parse({ displayName: 'Synthetic', salaryExpectationCents }),
      ).toMatchObject({ salaryExpectationCents });
    }
    expect(CandidateUpdateRequestSchema.parse({ salaryExpectationCents: null })).toEqual({
      salaryExpectationCents: null,
    });
  });

  it('reject negative, fractional, textual, and out-of-range amounts', () => {
    for (const salaryExpectationCents of [
      -1,
      36000.5,
      '3600000',
      CANDIDATE_SALARY_EXPECTATION_CENTS_MAX + 1,
    ]) {
      expect(CandidateUpdateRequestSchema.safeParse({ salaryExpectationCents }).success).toBe(
        false,
      );
      expect(
        CandidateCreateRequestSchema.safeParse({ displayName: 'Synthetic', salaryExpectationCents })
          .success,
      ).toBe(false);
    }
  });

  it('keep the three-character currency and the four consent statuses unchanged', () => {
    expect(CandidateUpdateRequestSchema.parse({ salaryExpectationCurrency: ' MAD ' })).toEqual({
      salaryExpectationCurrency: 'MAD',
    });
    expect(
      CandidateUpdateRequestSchema.safeParse({ salaryExpectationCurrency: 'EURO' }).success,
    ).toBe(false);
    for (const consentStatus of ['UNKNOWN', 'GRANTED', 'REVOKED', 'EXPIRED']) {
      expect(CandidateUpdateRequestSchema.parse({ consentStatus })).toEqual({ consentStatus });
    }
    expect(CandidateUpdateRequestSchema.safeParse({ consentStatus: 'granted' }).success).toBe(
      false,
    );
  });
});
