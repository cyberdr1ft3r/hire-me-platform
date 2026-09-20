import { describe, expect, it } from 'vitest';

import { CANDIDATE_SALARY_EXPECTATION_CENTS_MAX } from './candidates.js';
import { PublicApplicationSubmitRequestSchema } from './public-applications.js';

/**
 * `salaryExpectationCents` is a minor-unit integer for every caller of the
 * public endpoint. A browser form converts what a person typed before it gets
 * here; a direct API caller keeps sending cents. These tests hold that meaning
 * and the storage bound, not the browser's conversion.
 */
function submission(extra: Record<string, unknown> = {}) {
  return {
    consentGranted: true,
    email: 'ada@example.test',
    files: [],
    fullName: 'Ada Example',
    ...extra,
  };
}

describe('public application salary expectation', () => {
  it('accepts whole minor units from zero up to what the integer column holds', () => {
    for (const salaryExpectationCents of [
      0,
      3_600_050,
      1_500_000,
      CANDIDATE_SALARY_EXPECTATION_CENTS_MAX,
    ]) {
      expect(
        PublicApplicationSubmitRequestSchema.parse(submission({ salaryExpectationCents })),
      ).toMatchObject({ salaryExpectationCents });
    }
  });

  it('treats the amount as optional and never invents one', () => {
    const parsed = PublicApplicationSubmitRequestSchema.parse(submission());
    expect(parsed.salaryExpectationCents).toBeUndefined();
    expect('salaryExpectationCents' in parsed).toBe(false);
  });

  it('rejects negative, fractional, textual, and out-of-range amounts', () => {
    for (const salaryExpectationCents of [
      -1,
      -0.5,
      36_000.5,
      '3600000',
      Number.NaN,
      CANDIDATE_SALARY_EXPECTATION_CENTS_MAX + 1,
      Number.MAX_SAFE_INTEGER,
    ]) {
      expect(
        PublicApplicationSubmitRequestSchema.safeParse(submission({ salaryExpectationCents }))
          .success,
        String(salaryExpectationCents),
      ).toBe(false);
    }
  });

  it('keeps the optional recorded currency exactly as the endpoint always did', () => {
    expect(
      PublicApplicationSubmitRequestSchema.parse(
        submission({ salaryExpectationCurrency: ' MAD ' }),
      ),
    ).toMatchObject({ salaryExpectationCurrency: 'MAD' });
    expect(
      PublicApplicationSubmitRequestSchema.parse(submission()).salaryExpectationCurrency,
    ).toBeUndefined();
  });
});
