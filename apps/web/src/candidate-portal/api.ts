import {
  CandidateApplicationsResponseSchema,
  CandidatePortalConfigSchema,
  CandidateSessionResponseSchema,
} from '@hire-me/contracts';

import { getApiBaseUrl } from '../api.js';

export async function candidateRequest(route: string, payload?: object): Promise<unknown> {
  const response = await fetch(getApiBaseUrl() + '/v1/candidate/' + route, {
    credentials: 'include',
    cache: 'no-store',
    ...(payload
      ? {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      : {}),
  });
  if (!response.ok) throw new Error('Candidate request failed');
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
