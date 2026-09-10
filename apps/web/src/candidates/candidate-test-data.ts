import type { CandidateDetail } from '@hire-me/contracts';

import { CANDIDATE_PERMISSIONS } from './candidate-access.js';

/** Synthetic fixtures for Candidate tests. No real person or dataset is represented. */

export const CANDIDATE_ID = '8a68ec11-453b-4f33-b65e-c09642ebc69b';
export const SECOND_CANDIDATE_ID = '9b79fd22-564c-4a44-8c76-d1a753fcd7a0';

export const P = CANDIDATE_PERMISSIONS;

export const ORDINARY_PERMISSIONS = [
  P.view,
  P.create,
  P.update,
  P.statusManage,
  P.archive,
  P.profileView,
  P.profileManage,
];

export const FULL_PERMISSIONS = [
  ...ORDINARY_PERMISSIONS,
  P.compensationView,
  P.compensationUpdate,
  P.consentView,
  P.consentManage,
];

const TIMESTAMP = '2026-07-21T12:00:00.000Z';

export function syntheticCandidate(overrides: Partial<CandidateDetail> = {}): CandidateDetail {
  const id = overrides.id ?? CANDIDATE_ID;
  return {
    archivedAt: null,
    availabilityNotice: 'Available in one month',
    city: 'Lyon',
    compensation: { salaryExpectationCents: 5_400_000, salaryExpectationCurrency: 'EUR' },
    consent: { consentRecordedAt: TIMESTAMP, consentStatus: 'GRANTED' },
    country: 'France',
    createdAt: TIMESTAMP,
    currentJobTitle: 'Recruiter',
    displayName: 'Synthetic Candidate',
    education: [
      {
        archivedAt: null,
        candidateId: id,
        createdAt: TIMESTAMP,
        description: null,
        endDate: '2014',
        field: 'Psychology',
        id: 'e0000000-0000-4000-8000-000000000001',
        institution: 'Example University',
        qualification: 'MSc Work Psychology',
        startDate: '2012',
        updatedAt: TIMESTAMP,
      },
    ],
    email: 'candidate@example.test',
    firstName: null,
    id,
    languages: [
      {
        archivedAt: null,
        candidateId: id,
        createdAt: TIMESTAMP,
        id: 'c0000000-0000-4000-8000-000000000001',
        language: 'French',
        proficiency: 'Native',
        updatedAt: TIMESTAMP,
      },
    ],
    lastName: null,
    linkedinUrl: null,
    normalizedEmail: 'candidate@example.test',
    phone: '+33 1 99 00 00 02',
    professionalSummary: 'Synthetic summary.',
    skills: [
      {
        archivedAt: null,
        candidateId: id,
        createdAt: TIMESTAMP,
        id: 'a0000000-0000-4000-8000-000000000001',
        lastUsed: null,
        level: 'Advanced',
        name: 'Sourcing',
        updatedAt: TIMESTAMP,
        years: 4,
      },
    ],
    source: 'Synthetic',
    sourceDetail: null,
    status: 'ACTIVE',
    updatedAt: TIMESTAMP,
    workExperiences: [
      {
        archivedAt: null,
        candidateId: id,
        createdAt: TIMESTAMP,
        description: null,
        employer: 'Example Staffing',
        endDate: '2019-12',
        id: 'b0000000-0000-4000-8000-000000000001',
        isCurrent: false,
        startDate: '2016-01',
        title: 'Junior Recruiter',
        updatedAt: TIMESTAMP,
      },
      {
        archivedAt: null,
        candidateId: id,
        createdAt: TIMESTAMP,
        description: 'Leads technical sourcing.',
        employer: 'Example Talent',
        endDate: null,
        id: 'b0000000-0000-4000-8000-000000000002',
        isCurrent: true,
        startDate: '2020-01',
        title: 'Senior Recruiter',
        updatedAt: TIMESTAMP,
      },
    ],
    ...overrides,
  };
}

/** The shape the API returns for the given permissions, mirroring server redaction. */
export function asServerWouldReturn(
  candidate: CandidateDetail,
  permissions: readonly string[],
): CandidateDetail {
  const profile = permissions.includes(P.profileView);
  return {
    ...candidate,
    compensation: permissions.includes(P.compensationView) ? candidate.compensation : null,
    consent: permissions.includes(P.consentView) ? candidate.consent : null,
    education: profile ? candidate.education : [],
    languages: profile ? candidate.languages : [],
    skills: profile ? candidate.skills : [],
    workExperiences: profile ? candidate.workExperiences : [],
  };
}
