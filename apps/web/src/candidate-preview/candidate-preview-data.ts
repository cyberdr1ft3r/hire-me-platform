import type { AuthenticatedUser, CandidateDetail } from '@hire-me/contracts';

import { CANDIDATE_PERMISSIONS, resolveCandidateAccess } from '../candidates/index.js';

/**
 * Entirely synthetic review data for the development-only Candidate preview.
 *
 * Every name, employer, email, and phone number is invented and uses reserved
 * `example.test` addresses and fictitious numbers. Nothing here comes from a
 * real person, a questionnaire, or a production dataset.
 */

export type PreviewAccessProfile = 'full' | 'recruiter' | 'viewer';

const ORDINARY = [
  CANDIDATE_PERMISSIONS.view,
  CANDIDATE_PERMISSIONS.create,
  CANDIDATE_PERMISSIONS.update,
  CANDIDATE_PERMISSIONS.statusManage,
  CANDIDATE_PERMISSIONS.archive,
  CANDIDATE_PERMISSIONS.profileView,
  CANDIDATE_PERMISSIONS.profileManage,
];

/** Permission sets that mirror the seeded role shapes the preview reviews. */
export const PREVIEW_PERMISSIONS: Record<PreviewAccessProfile, readonly string[]> = {
  // SUPER_ADMIN shape: ordinary candidate work plus both restricted areas.
  full: [
    ...ORDINARY,
    CANDIDATE_PERMISSIONS.compensationView,
    CANDIDATE_PERMISSIONS.compensationUpdate,
    CANDIDATE_PERMISSIONS.consentView,
    CANDIDATE_PERMISSIONS.consentManage,
  ],
  // ADMIN / HR_MANAGER shape: ordinary candidate work, no restricted areas.
  recruiter: ORDINARY,
  // A synthetic read-only shape: list and detail, nothing else.
  viewer: [CANDIDATE_PERMISSIONS.view],
};

export const previewUser: AuthenticatedUser = {
  displayName: 'Preview Reviewer',
  email: 'preview@example.test',
  id: '00000000-0000-4000-8000-000000000060',
  permissions: [...PREVIEW_PERMISSIONS.full],
};

const BASE = '2026-09-0';

function candidate(
  index: number,
  overrides: Partial<CandidateDetail> & Pick<CandidateDetail, 'displayName'>,
): CandidateDetail {
  const id = `6a0c0000-0000-4000-8000-${String(index).padStart(12, '0')}`;
  return {
    archivedAt: null,
    availabilityNotice: null,
    city: null,
    compensation: { salaryExpectationCents: null, salaryExpectationCurrency: null },
    consent: { consentRecordedAt: null, consentStatus: 'UNKNOWN' },
    country: null,
    createdAt: `${BASE}${Math.min(index, 9)}T08:30:00.000Z`,
    currentJobTitle: null,
    education: [],
    email: null,
    firstName: null,
    id,
    languages: [],
    lastName: null,
    linkedinUrl: null,
    normalizedEmail: null,
    phone: null,
    professionalSummary: null,
    skills: [],
    source: null,
    sourceDetail: null,
    status: 'ACTIVE',
    updatedAt: `${BASE}${Math.min(index + 1, 9)}T14:10:00.000Z`,
    workExperiences: [],
    ...overrides,
  };
}

function child<T>(candidateId: string, index: number, value: T) {
  return {
    archivedAt: null,
    candidateId,
    createdAt: '2026-09-02T09:00:00.000Z',
    id: `6a0c1111-0000-4000-8000-${String(index).padStart(12, '0')}`,
    updatedAt: '2026-09-02T09:00:00.000Z',
    ...value,
  };
}

const featuredId = '6a0c0000-0000-4000-8000-000000000001';

const featured = candidate(1, {
  displayName: 'Nadia Example',
  availabilityNotice: 'Available after a one-month notice period',
  city: 'Casablanca',
  compensation: { salaryExpectationCents: 3_600_000, salaryExpectationCurrency: 'MAD' },
  consent: { consentRecordedAt: '2026-08-18T10:00:00.000Z', consentStatus: 'GRANTED' },
  country: 'Morocco',
  currentJobTitle: 'Senior Backend Engineer',
  education: [
    child(featuredId, 20, {
      description: null,
      endDate: '2016',
      field: 'Computer science',
      institution: 'Example Institute of Technology',
      qualification: 'MSc Software Engineering',
      startDate: '2014',
    }),
    child(featuredId, 21, {
      description: null,
      endDate: '2014',
      field: 'Mathematics and computing',
      institution: 'Example University',
      qualification: 'BSc Computer Science',
      startDate: '2011',
    }),
  ],
  email: 'nadia.example@example.test',
  languages: [
    child(featuredId, 10, { language: 'French', proficiency: 'Native' }),
    child(featuredId, 11, { language: 'English', proficiency: 'Professional (C1)' }),
    child(featuredId, 12, { language: 'Arabic', proficiency: 'Native' }),
  ],
  linkedinUrl: 'https://www.linkedin.com/in/example-candidate',
  // From the French 01 99 00 range reserved for fiction, so it cannot reach anyone.
  phone: '+33 1 99 00 00 01',
  professionalSummary:
    'Backend engineer focused on payment and scheduling platforms. Leads API design reviews and mentors a team of four engineers.\nComfortable with PostgreSQL performance work and incident response.',
  skills: [
    child(featuredId, 1, { lastUsed: null, level: 'Expert', name: 'TypeScript', years: 7 }),
    child(featuredId, 2, { lastUsed: null, level: 'Advanced', name: 'PostgreSQL', years: 6 }),
    child(featuredId, 3, { lastUsed: null, level: 'Advanced', name: 'NestJS', years: 4 }),
    child(featuredId, 4, { lastUsed: null, level: 'Intermediate', name: 'Kubernetes', years: 2 }),
  ],
  source: 'Referral',
  sourceDetail: 'Referred by an existing placement',
  workExperiences: [
    child(featuredId, 30, {
      description: 'Owns the settlement API and its PostgreSQL schema.',
      employer: 'Example Payments',
      endDate: null,
      isCurrent: true,
      startDate: '2021-03',
      title: 'Senior Backend Engineer',
    }),
    child(featuredId, 31, {
      description: null,
      employer: 'Example Logistics',
      endDate: '2021-02',
      isCurrent: false,
      startDate: '2018-06',
      title: 'Backend Engineer',
    }),
    child(featuredId, 32, {
      description: null,
      employer: 'Example Studio',
      endDate: '2018-05',
      isCurrent: false,
      startDate: '2016-09',
      title: 'Junior Developer',
    }),
  ],
});

export const PREVIEW_CANDIDATES: readonly CandidateDetail[] = [
  featured,
  candidate(2, {
    displayName: 'Omar Example',
    city: 'Rabat',
    country: 'Morocco',
    currentJobTitle: 'Data Analyst',
    email: 'omar.example@example.test',
    source: 'Public opportunity',
    status: 'TALENT_POOL',
  }),
  candidate(3, {
    displayName: 'Sara Example',
    city: 'Lyon',
    country: 'France',
    currentJobTitle: 'Chargée de recrutement',
    email: 'sara.example@example.test',
    source: 'LinkedIn',
  }),
  candidate(4, {
    displayName: 'Karim Example',
    city: 'Tangier',
    country: 'Morocco',
    currentJobTitle: 'Field Technician',
    source: 'Direct application',
    status: 'INACTIVE',
  }),
  candidate(5, {
    displayName: 'Leila Example',
    currentJobTitle: 'Product Designer',
    email: 'leila.example@example.test',
    source: 'Referral',
  }),
  candidate(6, {
    displayName: 'Hamza Example',
    archivedAt: '2026-09-05T11:00:00.000Z',
    city: 'Marrakesh',
    country: 'Morocco',
    currentJobTitle: 'Accountant',
    source: 'Job board',
    status: 'ARCHIVED',
  }),
  candidate(7, {
    displayName: 'Youssef Example',
    city: 'Paris',
    country: 'France',
    currentJobTitle: 'Développeur full-stack confirmé',
    source: 'Public opportunity',
  }),
];

/**
 * Shapes a synthetic record the way the API would for the given permissions:
 * compensation and consent are `null` without their view permissions, and the
 * structured arrays are empty without `candidate_profile:view`. The preview
 * therefore never hands the real components data the server would withhold.
 */
export function shapeForAccess(
  record: CandidateDetail,
  permissions: readonly string[],
): CandidateDetail {
  const access = resolveCandidateAccess(permissions);
  return {
    ...record,
    compensation: access.canViewCompensation ? record.compensation : null,
    consent: access.canViewConsent ? record.consent : null,
    education: access.canViewProfile ? record.education : [],
    languages: access.canViewProfile ? record.languages : [],
    skills: access.canViewProfile ? record.skills : [],
    workExperiences: access.canViewProfile ? record.workExperiences : [],
  };
}
