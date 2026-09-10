import type { CandidateDetail } from '@hire-me/contracts';

/**
 * Shapes derived from the shared contract rather than redeclared, so the
 * workspace can never drift from what the API actually returns.
 */
export type CandidateCompensation = NonNullable<CandidateDetail['compensation']>;
export type CandidateConsent = NonNullable<CandidateDetail['consent']>;
export type CandidateWorkExperience = CandidateDetail['workExperiences'][number];
export type CandidateEducation = CandidateDetail['education'][number];
export type CandidateSkill = CandidateDetail['skills'][number];
export type CandidateLanguage = CandidateDetail['languages'][number];
