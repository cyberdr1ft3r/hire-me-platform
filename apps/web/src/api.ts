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
  ClientContactDetailResponseSchema,
  ClientContactListResponseSchema,
  ClientDetailResponseSchema,
  ClientListResponseSchema,
  CandidateDetailResponseSchema,
  CandidateEducationDetailResponseSchema,
  CandidateLanguageDetailResponseSchema,
  CandidateListResponseSchema,
  CandidateSkillDetailResponseSchema,
  CandidateWorkExperienceDetailResponseSchema,
  MissionAssignmentDetailResponseSchema,
  MissionAssignmentListResponseSchema,
  MissionDetailResponseSchema,
  MissionListResponseSchema,
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
  type ClientContactCreateRequest,
  type ClientContactDetailResponse,
  type ClientContactListResponse,
  type ClientContactStatusUpdateRequest,
  type ClientContactUpdateRequest,
  type ClientCreateRequest,
  type ClientDetailResponse,
  type ClientListResponse,
  type ClientStatusUpdateRequest,
  type ClientUpdateRequest,
  type CandidateCreateRequest,
  type CandidateDetailResponse,
  type CandidateEducationCreateRequest,
  type CandidateEducationDetailResponse,
  type CandidateLanguageCreateRequest,
  type CandidateLanguageDetailResponse,
  type CandidateListResponse,
  type CandidateSkillCreateRequest,
  type CandidateSkillDetailResponse,
  type CandidateStatusUpdateRequest,
  type CandidateUpdateRequest,
  type CandidateWorkExperienceCreateRequest,
  type CandidateWorkExperienceDetailResponse,
  type MissionAssignmentCreateRequest,
  type MissionAssignmentDetailResponse,
  type MissionAssignmentListResponse,
  type MissionAssignmentUpdateRequest,
  type MissionClosureRequest,
  type MissionCreateRequest,
  type MissionDetailResponse,
  type MissionLeadRecruiterRequest,
  type MissionListResponse,
  type MissionStatusUpdateRequest,
  type MissionUpdateRequest,
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

type ClientListOptions = {
  accessToken: string;
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
  apiBaseUrl?: string;
};

type ContactListOptions = {
  accessToken: string;
  clientId: string;
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
  apiBaseUrl?: string;
};

async function clientRequest(
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

  const response = await fetch(`${apiBaseUrl}/v1/clients${path}`, {
    ...init,
    credentials: 'include',
    headers,
  });

  if (!response.ok) {
    throw new Error(`Client CRM request failed with status ${response.status}`);
  }

  return response;
}

export async function listClients(options: ClientListOptions): Promise<ClientListResponse> {
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

  const response = await clientRequest(
    options.accessToken,
    `?${parameters.toString()}`,
    {},
    options.apiBaseUrl,
  );
  return ClientListResponseSchema.parse(await response.json());
}

export async function getClient(
  accessToken: string,
  clientId: string,
  apiBaseUrl = getApiBaseUrl(),
): Promise<ClientDetailResponse> {
  const response = await clientRequest(accessToken, `/${clientId}`, {}, apiBaseUrl);
  return ClientDetailResponseSchema.parse(await response.json());
}

export async function createClient(
  accessToken: string,
  input: ClientCreateRequest,
  apiBaseUrl = getApiBaseUrl(),
): Promise<ClientDetailResponse> {
  const response = await clientRequest(
    accessToken,
    '',
    { method: 'POST', body: JSON.stringify(input) },
    apiBaseUrl,
  );
  return ClientDetailResponseSchema.parse(await response.json());
}

export async function updateClient(
  accessToken: string,
  clientId: string,
  input: ClientUpdateRequest,
  apiBaseUrl = getApiBaseUrl(),
): Promise<ClientDetailResponse> {
  const response = await clientRequest(
    accessToken,
    `/${clientId}`,
    { method: 'PATCH', body: JSON.stringify(input) },
    apiBaseUrl,
  );
  return ClientDetailResponseSchema.parse(await response.json());
}

export async function updateClientStatus(
  accessToken: string,
  clientId: string,
  input: ClientStatusUpdateRequest,
  apiBaseUrl = getApiBaseUrl(),
): Promise<ClientDetailResponse> {
  const response = await clientRequest(
    accessToken,
    `/${clientId}/status`,
    { method: 'PATCH', body: JSON.stringify(input) },
    apiBaseUrl,
  );
  return ClientDetailResponseSchema.parse(await response.json());
}

export async function archiveClient(
  accessToken: string,
  clientId: string,
  apiBaseUrl = getApiBaseUrl(),
): Promise<ClientDetailResponse> {
  const response = await clientRequest(
    accessToken,
    `/${clientId}/archive`,
    { method: 'POST' },
    apiBaseUrl,
  );
  return ClientDetailResponseSchema.parse(await response.json());
}

export async function listClientContacts(
  options: ContactListOptions,
): Promise<ClientContactListResponse> {
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

  const response = await clientRequest(
    options.accessToken,
    `/${options.clientId}/contacts?${parameters.toString()}`,
    {},
    options.apiBaseUrl,
  );
  return ClientContactListResponseSchema.parse(await response.json());
}

export async function createClientContact(
  accessToken: string,
  clientId: string,
  input: ClientContactCreateRequest,
  apiBaseUrl = getApiBaseUrl(),
): Promise<ClientContactDetailResponse> {
  const response = await clientRequest(
    accessToken,
    `/${clientId}/contacts`,
    { method: 'POST', body: JSON.stringify(input) },
    apiBaseUrl,
  );
  return ClientContactDetailResponseSchema.parse(await response.json());
}

export async function updateClientContact(
  accessToken: string,
  clientId: string,
  contactId: string,
  input: ClientContactUpdateRequest,
  apiBaseUrl = getApiBaseUrl(),
): Promise<ClientContactDetailResponse> {
  const response = await clientRequest(
    accessToken,
    `/${clientId}/contacts/${contactId}`,
    { method: 'PATCH', body: JSON.stringify(input) },
    apiBaseUrl,
  );
  return ClientContactDetailResponseSchema.parse(await response.json());
}

export async function updateClientContactStatus(
  accessToken: string,
  clientId: string,
  contactId: string,
  input: ClientContactStatusUpdateRequest,
  apiBaseUrl = getApiBaseUrl(),
): Promise<ClientContactDetailResponse> {
  const response = await clientRequest(
    accessToken,
    `/${clientId}/contacts/${contactId}/status`,
    { method: 'PATCH', body: JSON.stringify(input) },
    apiBaseUrl,
  );
  return ClientContactDetailResponseSchema.parse(await response.json());
}

export async function archiveClientContact(
  accessToken: string,
  clientId: string,
  contactId: string,
  apiBaseUrl = getApiBaseUrl(),
): Promise<ClientContactDetailResponse> {
  const response = await clientRequest(
    accessToken,
    `/${clientId}/contacts/${contactId}/archive`,
    { method: 'POST' },
    apiBaseUrl,
  );
  return ClientContactDetailResponseSchema.parse(await response.json());
}

type CandidateListOptions = {
  accessToken: string;
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
  source?: string;
  apiBaseUrl?: string;
};

async function candidateRequest(
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

  const response = await fetch(`${apiBaseUrl}/v1/candidates${path}`, {
    ...init,
    credentials: 'include',
    headers,
  });

  if (!response.ok) {
    throw new Error(`Candidate request failed with status ${response.status}`);
  }

  return response;
}

export async function listCandidates(
  options: CandidateListOptions,
): Promise<CandidateListResponse> {
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
  if (options.source) {
    parameters.set('source', options.source);
  }

  const response = await candidateRequest(
    options.accessToken,
    `?${parameters.toString()}`,
    {},
    options.apiBaseUrl,
  );
  return CandidateListResponseSchema.parse(await response.json());
}

export async function getCandidate(
  accessToken: string,
  candidateId: string,
  apiBaseUrl = getApiBaseUrl(),
): Promise<CandidateDetailResponse> {
  const response = await candidateRequest(accessToken, `/${candidateId}`, {}, apiBaseUrl);
  return CandidateDetailResponseSchema.parse(await response.json());
}

export async function createCandidate(
  accessToken: string,
  input: CandidateCreateRequest,
  apiBaseUrl = getApiBaseUrl(),
): Promise<CandidateDetailResponse> {
  const response = await candidateRequest(
    accessToken,
    '',
    { method: 'POST', body: JSON.stringify(input) },
    apiBaseUrl,
  );
  return CandidateDetailResponseSchema.parse(await response.json());
}

export async function updateCandidate(
  accessToken: string,
  candidateId: string,
  input: CandidateUpdateRequest,
  apiBaseUrl = getApiBaseUrl(),
): Promise<CandidateDetailResponse> {
  const response = await candidateRequest(
    accessToken,
    `/${candidateId}`,
    { method: 'PATCH', body: JSON.stringify(input) },
    apiBaseUrl,
  );
  return CandidateDetailResponseSchema.parse(await response.json());
}

export async function updateCandidateStatus(
  accessToken: string,
  candidateId: string,
  input: CandidateStatusUpdateRequest,
  apiBaseUrl = getApiBaseUrl(),
): Promise<CandidateDetailResponse> {
  const response = await candidateRequest(
    accessToken,
    `/${candidateId}/status`,
    { method: 'PATCH', body: JSON.stringify(input) },
    apiBaseUrl,
  );
  return CandidateDetailResponseSchema.parse(await response.json());
}

export async function archiveCandidate(
  accessToken: string,
  candidateId: string,
  apiBaseUrl = getApiBaseUrl(),
): Promise<CandidateDetailResponse> {
  const response = await candidateRequest(
    accessToken,
    `/${candidateId}/archive`,
    { method: 'POST' },
    apiBaseUrl,
  );
  return CandidateDetailResponseSchema.parse(await response.json());
}

export async function createCandidateSkill(
  accessToken: string,
  candidateId: string,
  input: CandidateSkillCreateRequest,
  apiBaseUrl = getApiBaseUrl(),
): Promise<CandidateSkillDetailResponse> {
  const response = await candidateRequest(
    accessToken,
    `/${candidateId}/skills`,
    { method: 'POST', body: JSON.stringify(input) },
    apiBaseUrl,
  );
  return CandidateSkillDetailResponseSchema.parse(await response.json());
}

export async function createCandidateLanguage(
  accessToken: string,
  candidateId: string,
  input: CandidateLanguageCreateRequest,
  apiBaseUrl = getApiBaseUrl(),
): Promise<CandidateLanguageDetailResponse> {
  const response = await candidateRequest(
    accessToken,
    `/${candidateId}/languages`,
    { method: 'POST', body: JSON.stringify(input) },
    apiBaseUrl,
  );
  return CandidateLanguageDetailResponseSchema.parse(await response.json());
}

export async function createCandidateWorkExperience(
  accessToken: string,
  candidateId: string,
  input: CandidateWorkExperienceCreateRequest,
  apiBaseUrl = getApiBaseUrl(),
): Promise<CandidateWorkExperienceDetailResponse> {
  const response = await candidateRequest(
    accessToken,
    `/${candidateId}/work-experiences`,
    { method: 'POST', body: JSON.stringify(input) },
    apiBaseUrl,
  );
  return CandidateWorkExperienceDetailResponseSchema.parse(await response.json());
}

export async function createCandidateEducation(
  accessToken: string,
  candidateId: string,
  input: CandidateEducationCreateRequest,
  apiBaseUrl = getApiBaseUrl(),
): Promise<CandidateEducationDetailResponse> {
  const response = await candidateRequest(
    accessToken,
    `/${candidateId}/education`,
    { method: 'POST', body: JSON.stringify(input) },
    apiBaseUrl,
  );
  return CandidateEducationDetailResponseSchema.parse(await response.json());
}

type MissionListOptions = {
  accessToken: string;
  page?: number;
  pageSize?: number;
  search?: string;
  clientId?: string;
  state?: string;
  priority?: string;
  assigneeUserId?: string;
  apiBaseUrl?: string;
};

async function missionRequest(
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

  const response = await fetch(`${apiBaseUrl}/v1/missions${path}`, {
    ...init,
    credentials: 'include',
    headers,
  });

  if (!response.ok) {
    throw new Error(`Mission request failed with status ${response.status}`);
  }

  return response;
}

export async function listMissions(options: MissionListOptions): Promise<MissionListResponse> {
  const parameters = new URLSearchParams({
    page: String(options.page ?? 1),
    pageSize: String(options.pageSize ?? 20),
  });
  if (options.search) {
    parameters.set('search', options.search);
  }
  if (options.clientId) {
    parameters.set('clientId', options.clientId);
  }
  if (options.state) {
    parameters.set('state', options.state);
  }
  if (options.priority) {
    parameters.set('priority', options.priority);
  }
  if (options.assigneeUserId) {
    parameters.set('assigneeUserId', options.assigneeUserId);
  }

  const response = await missionRequest(
    options.accessToken,
    `?${parameters.toString()}`,
    {},
    options.apiBaseUrl,
  );
  return MissionListResponseSchema.parse(await response.json());
}

export async function getMission(
  accessToken: string,
  missionId: string,
  apiBaseUrl = getApiBaseUrl(),
): Promise<MissionDetailResponse> {
  const response = await missionRequest(accessToken, `/${missionId}`, {}, apiBaseUrl);
  return MissionDetailResponseSchema.parse(await response.json());
}

export async function createMission(
  accessToken: string,
  input: MissionCreateRequest,
  apiBaseUrl = getApiBaseUrl(),
): Promise<MissionDetailResponse> {
  const response = await missionRequest(
    accessToken,
    '',
    { method: 'POST', body: JSON.stringify(input) },
    apiBaseUrl,
  );
  return MissionDetailResponseSchema.parse(await response.json());
}

export async function updateMission(
  accessToken: string,
  missionId: string,
  input: MissionUpdateRequest,
  apiBaseUrl = getApiBaseUrl(),
): Promise<MissionDetailResponse> {
  const response = await missionRequest(
    accessToken,
    `/${missionId}`,
    { method: 'PATCH', body: JSON.stringify(input) },
    apiBaseUrl,
  );
  return MissionDetailResponseSchema.parse(await response.json());
}

export async function updateMissionStatus(
  accessToken: string,
  missionId: string,
  input: MissionStatusUpdateRequest,
  apiBaseUrl = getApiBaseUrl(),
): Promise<MissionDetailResponse> {
  const response = await missionRequest(
    accessToken,
    `/${missionId}/status`,
    { method: 'PATCH', body: JSON.stringify(input) },
    apiBaseUrl,
  );
  return MissionDetailResponseSchema.parse(await response.json());
}

export async function closeMission(
  accessToken: string,
  missionId: string,
  input: MissionClosureRequest,
  apiBaseUrl = getApiBaseUrl(),
): Promise<MissionDetailResponse> {
  const response = await missionRequest(
    accessToken,
    `/${missionId}/close`,
    { method: 'POST', body: JSON.stringify(input) },
    apiBaseUrl,
  );
  return MissionDetailResponseSchema.parse(await response.json());
}

export async function archiveMission(
  accessToken: string,
  missionId: string,
  apiBaseUrl = getApiBaseUrl(),
): Promise<MissionDetailResponse> {
  const response = await missionRequest(
    accessToken,
    `/${missionId}/archive`,
    { method: 'POST' },
    apiBaseUrl,
  );
  return MissionDetailResponseSchema.parse(await response.json());
}

export async function listMissionAssignments(
  accessToken: string,
  missionId: string,
  apiBaseUrl = getApiBaseUrl(),
): Promise<MissionAssignmentListResponse> {
  const response = await missionRequest(accessToken, `/${missionId}/assignments`, {}, apiBaseUrl);
  return MissionAssignmentListResponseSchema.parse(await response.json());
}

export async function createMissionAssignment(
  accessToken: string,
  missionId: string,
  input: MissionAssignmentCreateRequest,
  apiBaseUrl = getApiBaseUrl(),
): Promise<MissionAssignmentDetailResponse> {
  const response = await missionRequest(
    accessToken,
    `/${missionId}/assignments`,
    { method: 'POST', body: JSON.stringify(input) },
    apiBaseUrl,
  );
  return MissionAssignmentDetailResponseSchema.parse(await response.json());
}

export async function updateMissionAssignment(
  accessToken: string,
  missionId: string,
  assignmentId: string,
  input: MissionAssignmentUpdateRequest,
  apiBaseUrl = getApiBaseUrl(),
): Promise<MissionAssignmentDetailResponse> {
  const response = await missionRequest(
    accessToken,
    `/${missionId}/assignments/${assignmentId}`,
    { method: 'PATCH', body: JSON.stringify(input) },
    apiBaseUrl,
  );
  return MissionAssignmentDetailResponseSchema.parse(await response.json());
}

export async function setMissionLeadRecruiter(
  accessToken: string,
  missionId: string,
  input: MissionLeadRecruiterRequest,
  apiBaseUrl = getApiBaseUrl(),
): Promise<MissionAssignmentDetailResponse> {
  const response = await missionRequest(
    accessToken,
    `/${missionId}/assignments/lead`,
    { method: 'POST', body: JSON.stringify(input) },
    apiBaseUrl,
  );
  return MissionAssignmentDetailResponseSchema.parse(await response.json());
}

export async function archiveMissionAssignment(
  accessToken: string,
  missionId: string,
  assignmentId: string,
  apiBaseUrl = getApiBaseUrl(),
): Promise<MissionAssignmentDetailResponse> {
  const response = await missionRequest(
    accessToken,
    `/${missionId}/assignments/${assignmentId}/archive`,
    { method: 'POST' },
    apiBaseUrl,
  );
  return MissionAssignmentDetailResponseSchema.parse(await response.json());
}
