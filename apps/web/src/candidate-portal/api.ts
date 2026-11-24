import {
  CandidateApplicationsResponseSchema,
  CandidatePortalConfigSchema,
  CandidateSessionResponseSchema,
  CandidateProfileResponseSchema,
  CandidateCvsResponseSchema,
  CandidateCvSchema,
  CandidateSubmissionResponseSchema,
  type CandidateProfileFields,
} from '@hire-me/contracts';

import { getApiBaseUrl } from '../api.js';

export class CandidateRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code?: string,
  ) {
    super('Candidate request failed');
  }
}

export async function candidateRequest(route: string, payload?: object): Promise<unknown> {
  const multipart = payload instanceof FormData;
  const response = await fetch(getApiBaseUrl() + '/v1/candidate/' + route, {
    credentials: 'include',
    cache: 'no-store',
    ...(payload
      ? {
          method: 'POST',
          ...(multipart ? {} : { headers: { 'Content-Type': 'application/json' } }),
          body: multipart ? payload : JSON.stringify(payload),
        }
      : {}),
  });
  if (!response.ok) {
    const data: unknown = await response.json().catch(() => null);
    const error = data && typeof data === 'object' && 'error' in data ? data.error : null;
    const code =
      error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
        ? error.code
        : undefined;
    throw new CandidateRequestError(response.status, code);
  }
  return response.status === 204 || response.status === 202 ? null : await response.json();
}

export async function candidateSession() {
  return CandidateSessionResponseSchema.parse(await candidateRequest('session')).candidate;
}

export async function candidateConfig() {
  return CandidatePortalConfigSchema.parse(await candidateRequest('config'));
}

export async function candidateApplications(cursor?: string) {
  return CandidateApplicationsResponseSchema.parse(
    await candidateRequest(
      cursor ? 'applications?cursor=' + encodeURIComponent(cursor) : 'applications',
    ),
  );
}

export async function candidateProfile() {
  return CandidateProfileResponseSchema.parse(await candidateRequest('profile'));
}

export async function saveCandidateProfile(profile: CandidateProfileFields, revision: number) {
  return CandidateProfileResponseSchema.parse(
    await candidateRequest('profile', { profile, revision }),
  );
}

export async function candidateCvs() {
  return CandidateCvsResponseSchema.parse(await candidateRequest('documents')).cvs;
}

export async function uploadCandidateCv(file: File, replaceId?: string) {
  const form = new FormData();
  form.set('file', file);
  const route = replaceId ? 'documents/' + encodeURIComponent(replaceId) + '/replace' : 'documents';
  return CandidateCvSchema.parse(await candidateRequest(route, form));
}

export function candidateCvDownload(id: string) {
  return getApiBaseUrl() + '/v1/candidate/documents/versions/' + encodeURIComponent(id);
}

export async function candidateSubmission(id: string) {
  return CandidateSubmissionResponseSchema.parse(
    await candidateRequest('applications/' + encodeURIComponent(id) + '/submission'),
  );
}
