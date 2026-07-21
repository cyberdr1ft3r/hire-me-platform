import {
  AuthResponseSchema,
  HealthResponseSchema,
  MeResponseSchema,
  type AuthResponse,
  type HealthResponse,
  type MeResponse,
} from '@hire-me/contracts';

const DEFAULT_API_BASE_URL = 'http://127.0.0.1:3000';

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

export async function login(
  email: string,
  password: string,
  apiBaseUrl = getApiBaseUrl(),
): Promise<AuthResponse> {
  const response = await fetch(`${apiBaseUrl}/auth/login`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    throw new Error('Authentication failed');
  }

  return AuthResponseSchema.parse(await response.json());
}

export async function refresh(apiBaseUrl = getApiBaseUrl()): Promise<AuthResponse> {
  const response = await fetch(`${apiBaseUrl}/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error('Refresh failed');
  }

  return AuthResponseSchema.parse(await response.json());
}

export async function fetchMe(
  accessToken: string,
  apiBaseUrl = getApiBaseUrl(),
): Promise<MeResponse> {
  const response = await fetch(`${apiBaseUrl}/auth/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (response.status === 401) {
    const refreshed = await refresh(apiBaseUrl);
    return fetchMe(refreshed.accessToken, apiBaseUrl);
  }

  if (!response.ok) {
    throw new Error('Current user request failed');
  }

  return MeResponseSchema.parse(await response.json());
}

export async function fetchMeWithRefresh(
  accessToken: string,
  apiBaseUrl = getApiBaseUrl(),
): Promise<{ accessToken: string; me: MeResponse }> {
  const response = await fetch(`${apiBaseUrl}/auth/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (response.status === 401) {
    const refreshed = await refresh(apiBaseUrl);
    return {
      accessToken: refreshed.accessToken,
      me: { user: refreshed.user },
    };
  }

  if (!response.ok) {
    throw new Error('Current user request failed');
  }

  return {
    accessToken,
    me: MeResponseSchema.parse(await response.json()),
  };
}

export async function logout(accessToken: string, apiBaseUrl = getApiBaseUrl()): Promise<void> {
  await fetch(`${apiBaseUrl}/auth/logout`, {
    method: 'POST',
    credentials: 'include',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}
