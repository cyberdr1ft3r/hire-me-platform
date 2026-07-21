import { HealthResponseSchema, type HealthResponse } from '@hire-me/contracts';

const DEFAULT_API_BASE_URL = 'http://localhost:3000';

export function getApiBaseUrl(): string {
  const configuredUrl: unknown = import.meta.env.VITE_API_BASE_URL;

  return typeof configuredUrl === 'string' && configuredUrl.length > 0
    ? configuredUrl
    : DEFAULT_API_BASE_URL;
}

export async function fetchHealthStatus(apiBaseUrl = getApiBaseUrl()): Promise<HealthResponse> {
  const response = await fetch(`${apiBaseUrl}/health`);

  if (!response.ok) {
    throw new Error(`API health request failed with status ${response.status}`);
  }

  return HealthResponseSchema.parse(await response.json());
}
