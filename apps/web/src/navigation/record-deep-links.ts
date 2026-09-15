import type { InternalRoute } from './internal-navigation.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface RecordNavigationIntent {
  candidateId: string | null;
  missionId: string | null;
}

function validUuid(value: string | null): string | null {
  return value && UUID_PATTERN.test(value) ? value : null;
}

function uniqueValidUuid(parameters: URLSearchParams, key: string): string | null {
  const values = parameters.getAll(key);
  return values.length === 1 ? validUuid(values[0] ?? null) : null;
}

/**
 * Route-specific query values are navigation intent only. Unknown and malformed
 * values are ignored before any operational read is attempted.
 */
export function recordNavigationIntent(
  route: InternalRoute,
  search: string,
): RecordNavigationIntent {
  const parameters = new URLSearchParams(search);
  return {
    candidateId: route === 'candidates' ? uniqueValidUuid(parameters, 'candidate') : null,
    missionId: route === 'missions' ? uniqueValidUuid(parameters, 'mission') : null,
  };
}

export function candidateDeepLink(candidateId: string): string {
  return `/candidates?candidate=${encodeURIComponent(candidateId)}`;
}

export function missionDeepLink(missionId: string): string {
  return `/missions?mission=${encodeURIComponent(missionId)}`;
}
