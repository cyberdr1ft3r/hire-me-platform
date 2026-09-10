import { describe, expect, it } from 'vitest';

import { createFormatters } from '../i18n/index.js';
import { CandidateRequestError } from '../api.js';
import { classifyCandidateFailure } from './candidate-errors.js';
import {
  formatCandidateLocation,
  formatSalaryExpectation,
  orderEducation,
  orderWorkExperiences,
  safeProfileUrl,
} from './candidate-format.js';
import type { CandidateEducation, CandidateWorkExperience } from './candidate-types.js';

const normalizeSpaces = (value: string | null) => value?.replace(/\s/gu, ' ') ?? null;

function experience(
  id: string,
  startDate: string | null,
  isCurrent = false,
): CandidateWorkExperience {
  return {
    archivedAt: null,
    candidateId: '00000000-0000-4000-8000-000000000001',
    createdAt: '2026-09-01T00:00:00.000Z',
    description: null,
    employer: `Employer ${id}`,
    endDate: null,
    id,
    isCurrent,
    startDate,
    title: `Title ${id}`,
    updatedAt: '2026-09-01T00:00:00.000Z',
  };
}

describe('candidate presentation helpers', () => {
  it('joins only the recorded parts of a location', () => {
    expect(formatCandidateLocation('Lyon', 'France')).toBe('Lyon, France');
    expect(formatCandidateLocation(null, 'France')).toBe('France');
    expect(formatCandidateLocation('  ', null)).toBeNull();
  });

  it('orders experience with current roles first, then by comparable start date', () => {
    const ordered = orderWorkExperiences([
      experience('a', '2016-09'),
      experience('b', '2021-03', true),
      experience('c', '2018-06'),
    ]);
    expect(ordered.map((item) => item.id)).toEqual(['b', 'c', 'a']);
  });

  it('keeps API order when recorded dates cannot be compared', () => {
    const ordered = orderWorkExperiences([
      experience('a', 'Spring 2016'),
      experience('b', 'Autumn 2019'),
      experience('c', null),
    ]);
    expect(ordered.map((item) => item.id)).toEqual(['a', 'b', 'c']);
  });

  it('orders education most recent first', () => {
    const base = experience('x', null);
    const education = (id: string, startDate: string): CandidateEducation => ({
      archivedAt: null,
      candidateId: base.candidateId,
      createdAt: base.createdAt,
      description: null,
      endDate: null,
      field: null,
      id,
      institution: 'Example University',
      qualification: id,
      startDate,
      updatedAt: base.updatedAt,
    });
    expect(
      orderEducation([education('bsc', '2011'), education('msc', '2014')]).map((item) => item.id),
    ).toEqual(['msc', 'bsc']);
  });

  it('formats a salary expectation in its own currency from minor units, without conversion', () => {
    const en = createFormatters('en-GB');
    const fr = createFormatters('fr-FR');
    const value = { salaryExpectationCents: 3_600_000, salaryExpectationCurrency: 'MAD' };
    expect(normalizeSpaces(formatSalaryExpectation(value, en))).toBe('MAD 36,000.00');
    expect(normalizeSpaces(formatSalaryExpectation(value, fr))).toBe('36 000,00 MAD');
  });

  it('shows zero as a real value and null as not recorded', () => {
    const en = createFormatters('en-GB');
    expect(
      normalizeSpaces(
        formatSalaryExpectation(
          { salaryExpectationCents: 0, salaryExpectationCurrency: 'EUR' },
          en,
        ),
      ),
    ).toBe('€0.00');
    expect(
      formatSalaryExpectation(
        { salaryExpectationCents: null, salaryExpectationCurrency: 'EUR' },
        en,
      ),
    ).toBeNull();
    expect(
      formatSalaryExpectation(
        { salaryExpectationCents: 150_000, salaryExpectationCurrency: null },
        en,
      ),
    ).toBe('1,500.00');
  });

  it('links only http(s) profile URLs', () => {
    expect(safeProfileUrl('https://www.linkedin.com/in/example')).toBe(
      'https://www.linkedin.com/in/example',
    );
    expect(safeProfileUrl('javascript:alert(1)')).toBeNull();
    expect(safeProfileUrl('linkedin.com/in/example')).toBeNull();
    expect(safeProfileUrl(null)).toBeNull();
  });

  it('classifies failures by stable code and status only', () => {
    expect(
      classifyCandidateFailure(new CandidateRequestError(409, 'CANDIDATE_EMAIL_ALREADY_EXISTS')),
    ).toBe('duplicateEmail');
    expect(classifyCandidateFailure(new CandidateRequestError(409, 'CANDIDATE_ARCHIVED'))).toBe(
      'archived',
    );
    expect(classifyCandidateFailure(new CandidateRequestError(409, null))).toBe('conflict');
    expect(classifyCandidateFailure(new CandidateRequestError(400, null))).toBe('invalid');
    expect(classifyCandidateFailure(new CandidateRequestError(403, 'ANY'))).toBe('forbidden');
    expect(classifyCandidateFailure(new CandidateRequestError(404, null))).toBe('notFound');
    expect(classifyCandidateFailure(new CandidateRequestError(500, null))).toBe('unavailable');
    expect(classifyCandidateFailure(new Error('network down'))).toBe('unavailable');
  });
});
