import {
  AuthResponseSchema,
  HealthResponseSchema,
  MeResponseSchema,
  AdminEffectivePermissionsResponseSchema,
  AdminPermissionListResponseSchema,
  AdminRoleListResponseSchema,
  AdminSessionListResponseSchema,
  AdminUserDetailResponseSchema,
  AdminUserListResponseSchema,
  type AuthResponse,
  type HealthResponse,
  type MeResponse,
  type AdminAssignRoleRequest,
  type AdminCreateUserRequest,
  type AdminEffectivePermissionsResponse,
  type AdminPermissionListResponse,
  type AdminRoleListResponse,
  type AdminSessionListResponse,
  type AdminUpdateUserRequest,
  type AdminUpdateUserStatusRequest,
  type AdminUserDetailResponse,
  type AdminUserListResponse,
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

type AdminListUsersOptions = {
  accessToken: string;
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
  apiBaseUrl?: string;
};

async function adminRequest(
  accessToken: string,
  path: string,
  init: RequestInit = {},
  apiBaseUrl = getApiBaseUrl(),
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${accessToken}`);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${apiBaseUrl}/v1/admin${path}`, {
    ...init,
    credentials: 'include',
    headers,
  });

  if (!response.ok) {
    throw new Error(`Administration request failed with status ${response.status}`);
  }

  return response;
}

export async function listAdminUsers(
  options: AdminListUsersOptions,
): Promise<AdminUserListResponse> {
  const parameters = new URLSearchParams({
    page: String(options.page ?? 1),
    pageSize: String(options.pageSize ?? 20),
  });
  if (options.search) {
    parameters.set('search', options.search);
  }
  if (options.status) {
    parameters.set('status', options.status);
  }

  const response = await adminRequest(
    options.accessToken,
    `/users?${parameters.toString()}`,
    {},
    options.apiBaseUrl,
  );
  return AdminUserListResponseSchema.parse(await response.json());
}

export async function getAdminUser(
  accessToken: string,
  userId: string,
  apiBaseUrl = getApiBaseUrl(),
): Promise<AdminUserDetailResponse> {
  const response = await adminRequest(accessToken, `/users/${userId}`, {}, apiBaseUrl);
  return AdminUserDetailResponseSchema.parse(await response.json());
}

export async function createAdminUser(
  accessToken: string,
  input: AdminCreateUserRequest,
  apiBaseUrl = getApiBaseUrl(),
): Promise<AdminUserDetailResponse> {
  const response = await adminRequest(
    accessToken,
    '/users',
    { method: 'POST', body: JSON.stringify(input) },
    apiBaseUrl,
  );
  return AdminUserDetailResponseSchema.parse(await response.json());
}

export async function updateAdminUser(
  accessToken: string,
  userId: string,
  input: AdminUpdateUserRequest,
  apiBaseUrl = getApiBaseUrl(),
): Promise<AdminUserDetailResponse> {
  const response = await adminRequest(
    accessToken,
    `/users/${userId}`,
    { method: 'PATCH', body: JSON.stringify(input) },
    apiBaseUrl,
  );
  return AdminUserDetailResponseSchema.parse(await response.json());
}

export async function assignAdminRole(
  accessToken: string,
  userId: string,
  input: AdminAssignRoleRequest,
  apiBaseUrl = getApiBaseUrl(),
): Promise<AdminUserDetailResponse> {
  const response = await adminRequest(
    accessToken,
    `/users/${userId}/roles`,
    { method: 'POST', body: JSON.stringify(input) },
    apiBaseUrl,
  );
  return AdminUserDetailResponseSchema.parse(await response.json());
}

export async function removeAdminRole(
  accessToken: string,
  userId: string,
  roleName: string,
  apiBaseUrl = getApiBaseUrl(),
): Promise<AdminUserDetailResponse> {
  const response = await adminRequest(
    accessToken,
    `/users/${userId}/roles/${roleName}`,
    { method: 'DELETE' },
    apiBaseUrl,
  );
  return AdminUserDetailResponseSchema.parse(await response.json());
}

export async function updateAdminUserStatus(
  accessToken: string,
  userId: string,
  input: AdminUpdateUserStatusRequest,
  apiBaseUrl = getApiBaseUrl(),
): Promise<AdminUserDetailResponse> {
  const response = await adminRequest(
    accessToken,
    `/users/${userId}/status`,
    { method: 'PATCH', body: JSON.stringify(input) },
    apiBaseUrl,
  );
  return AdminUserDetailResponseSchema.parse(await response.json());
}

export async function listAdminRoles(
  accessToken: string,
  apiBaseUrl = getApiBaseUrl(),
): Promise<AdminRoleListResponse> {
  const response = await adminRequest(accessToken, '/roles', {}, apiBaseUrl);
  return AdminRoleListResponseSchema.parse(await response.json());
}

export async function listAdminPermissions(
  accessToken: string,
  apiBaseUrl = getApiBaseUrl(),
): Promise<AdminPermissionListResponse> {
  const response = await adminRequest(accessToken, '/permissions', {}, apiBaseUrl);
  return AdminPermissionListResponseSchema.parse(await response.json());
}

export async function listAdminSessions(
  accessToken: string,
  userId: string,
  apiBaseUrl = getApiBaseUrl(),
): Promise<AdminSessionListResponse> {
  const response = await adminRequest(accessToken, `/users/${userId}/sessions`, {}, apiBaseUrl);
  return AdminSessionListResponseSchema.parse(await response.json());
}

export async function revokeAdminSession(
  accessToken: string,
  userId: string,
  sessionId: string,
  apiBaseUrl = getApiBaseUrl(),
): Promise<AdminSessionListResponse> {
  const response = await adminRequest(
    accessToken,
    `/users/${userId}/sessions/${sessionId}`,
    { method: 'DELETE' },
    apiBaseUrl,
  );
  return AdminSessionListResponseSchema.parse(await response.json());
}

export async function revokeAllAdminSessions(
  accessToken: string,
  userId: string,
  apiBaseUrl = getApiBaseUrl(),
): Promise<AdminSessionListResponse> {
  const response = await adminRequest(
    accessToken,
    `/users/${userId}/sessions`,
    { method: 'DELETE' },
    apiBaseUrl,
  );
  return AdminSessionListResponseSchema.parse(await response.json());
}

export async function getAdminEffectivePermissions(
  accessToken: string,
  userId: string,
  apiBaseUrl = getApiBaseUrl(),
): Promise<AdminEffectivePermissionsResponse> {
  const response = await adminRequest(
    accessToken,
    `/users/${userId}/effective-permissions`,
    {},
    apiBaseUrl,
  );
  return AdminEffectivePermissionsResponseSchema.parse(await response.json());
}
