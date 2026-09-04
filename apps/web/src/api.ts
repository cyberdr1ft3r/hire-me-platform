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
  DocumentDetailResponseSchema,
  DocumentListResponseSchema,
  DocumentVersionListResponseSchema,
  CandidateEducationDetailResponseSchema,
  CandidateLanguageDetailResponseSchema,
  CandidateListResponseSchema,
  CandidateSkillDetailResponseSchema,
  CandidateWorkExperienceDetailResponseSchema,
  MissionAssignmentDetailResponseSchema,
  MissionAssignmentListResponseSchema,
  MissionCandidateDetailResponseSchema,
  MissionCandidateListResponseSchema,
  OfferDetailResponseSchema,
  OfferListResponseSchema,
  PlacementDetailResponseSchema,
  MissionDetailResponseSchema,
  InternalPublicApplicationListResponseSchema,
  InternalPublicOpportunityDetailResponseSchema,
  InterviewDetailResponseSchema,
  InterviewListResponseSchema,
  EvaluationDetailResponseSchema,
  EvaluationListResponseSchema,
  MissionListResponseSchema,
  PublicApplicationSubmitResponseSchema,
  PublicOpportunityDetailResponseSchema,
  PublicOpportunityListResponseSchema,
  NotificationDetailResponseSchema,
  NotificationListQuerySchema,
  NotificationListResponseSchema,
  NotificationReadAllRequestSchema,
  NotificationReadAllResponseSchema,
  ReportingBreakdownsResponseSchema,
  ReportingDrilldownResponseSchema,
  ReportingPipelineResponseSchema,
  ReportingSummaryResponseSchema,
  ReportingTrendsResponseSchema,
  TaskAssignmentCreateRequestSchema,
  TaskCommentCreateRequestSchema,
  TaskCommentDetailResponseSchema,
  TaskCreateRequestSchema,
  TaskDetailResponseSchema,
  TaskListResponseSchema,
  TaskListQuerySchema,
  TaskOwnerChangeRequestSchema,
  TaskReminderCreateRequestSchema,
  TaskReminderDetailResponseSchema,
  TaskReminderProcessResponseSchema,
  TaskStatusChangeRequestSchema,
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
  type DocumentCreateRequest,
  type DocumentDetailResponse,
  type DocumentListResponse,
  type DocumentUpdateRequest,
  type DocumentVersionCreateRequest,
  type DocumentVersionListResponse,
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
  type MissionCandidateCreateRequest,
  type MissionCandidateDetailResponse,
  type MissionCandidateListResponse,
  type MissionCandidatePresentationRequest,
  type MissionCandidateTransferRequest,
  type MissionCandidateTransitionRequest,
  type OfferCreateRequest,
  type OfferDetailResponse,
  type OfferListResponse,
  type OfferMarkSentRequest,
  type OfferResponseRequest,
  type OfferReviseRequest,
  type OfferWithdrawRequest,
  type PlacementConfirmRequest,
  type PlacementCorrectRequest,
  type PlacementDetailResponse,
  type InternalPublicApplicationListResponse,
  type InternalPublicOpportunityDetailResponse,
  type InternalPublicOpportunityUpdateRequest,
  type InterviewScheduleRequest,
  type InterviewRescheduleRequest,
  type InterviewPostponeRequest,
  type InterviewCompletionRequest,
  type InterviewCancellationRequest,
  type InterviewParticipantCreateRequest,
  type InterviewDetailResponse,
  type InterviewListResponse,
  type EvaluationCreateRequest,
  type EvaluationUpdateRequest,
  type EvaluationDetailResponse,
  type EvaluationListResponse,
  type MissionClosureRequest,
  type MissionCreateRequest,
  type MissionDetailResponse,
  type MissionLeadRecruiterRequest,
  type MissionListResponse,
  type MissionStatusUpdateRequest,
  type MissionUpdateRequest,
  type PublicApplicationSubmitRequest,
  type PublicApplicationSubmitResponse,
  type PublicOpportunityDetailResponse,
  type PublicOpportunityListResponse,
  type NotificationDetailResponse,
  type NotificationListResponse,
  type NotificationListQuery,
  type NotificationReadAllRequest,
  type NotificationReadAllResponse,
  type ReportingBreakdownsResponse,
  type ReportingDrilldownResponse,
  type ReportingFilterQuery,
  type ReportingPipelineResponse,
  type ReportingSummaryResponse,
  type ReportingTrendsResponse,
  type TaskAssignmentCreateRequest,
  type TaskCommentCreateRequest,
  type TaskCommentDetailResponse,
  type TaskCreateRequest,
  type TaskDetailResponse,
  type TaskListResponse,
  type TaskListQuery,
  type TaskOwnerChangeRequest,
  type TaskReminderCreateRequest,
  type TaskReminderDetailResponse,
  type TaskReminderProcessResponse,
  type TaskStatusChangeRequest,
  TrainingEnrollmentDetailResponseSchema,
  TrainingEnrollmentListResponseSchema,
  TrainingParticipationDetailResponseSchema,
  TrainingParticipationListResponseSchema,
  TrainingProgramDetailResponseSchema,
  TrainingProgramListResponseSchema,
  TrainingSessionDetailResponseSchema,
  TrainingSessionListResponseSchema,
  type TrainingAttendanceCorrectionRequest,
  type TrainingAttendanceUpdateRequest,
  type TrainingEnrollmentCreateRequest,
  type TrainingEnrollmentDetailResponse,
  type TrainingEnrollmentListResponse,
  type TrainingEnrollmentStatusUpdateRequest,
  type TrainingEnrollmentWithdrawRequest,
  type TrainingParticipationCreateRequest,
  type TrainingParticipationDetailResponse,
  type TrainingParticipationListResponse,
  type TrainingProgramCreateRequest,
  type TrainingProgramDetailResponse,
  type TrainingProgramListResponse,
  type TrainingProgramStatusUpdateRequest,
  type TrainingProgramUpdateRequest,
  type TrainingSessionCancelRequest,
  type TrainingSessionCreateRequest,
  type TrainingSessionDetailResponse,
  type TrainingSessionListResponse,
  type TrainingSessionRescheduleRequest,
  type TrainingSessionStatusUpdateRequest,
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

type DocumentListOptions = {
  accessToken: string;
  page?: number;
  pageSize?: number;
  search?: string;
  documentType?: string;
  status?: string;
  apiBaseUrl?: string;
};

async function documentRequest(
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

  const response = await fetch(`${apiBaseUrl}/v1/documents${path}`, {
    ...init,
    credentials: 'include',
    headers,
  });

  if (!response.ok) {
    throw new Error(`Document request failed with status ${response.status}`);
  }

  return response;
}

export async function listDocuments(options: DocumentListOptions): Promise<DocumentListResponse> {
  const parameters = new URLSearchParams({
    page: String(options.page ?? 1),
    pageSize: String(options.pageSize ?? 20),
  });
  if (options.search) {
    parameters.set('search', options.search);
  }
  if (options.documentType) {
    parameters.set('documentType', options.documentType);
  }
  if (options.status) {
    parameters.set('status', options.status);
  }

  const response = await documentRequest(
    options.accessToken,
    `?${parameters.toString()}`,
    {},
    options.apiBaseUrl,
  );
  return DocumentListResponseSchema.parse(await response.json());
}

export async function getDocument(
  accessToken: string,
  documentId: string,
  apiBaseUrl = getApiBaseUrl(),
): Promise<DocumentDetailResponse> {
  const response = await documentRequest(accessToken, `/${documentId}`, {}, apiBaseUrl);
  return DocumentDetailResponseSchema.parse(await response.json());
}

export async function createDocument(
  accessToken: string,
  input: DocumentCreateRequest,
  apiBaseUrl = getApiBaseUrl(),
): Promise<DocumentDetailResponse> {
  const response = await documentRequest(
    accessToken,
    '',
    { method: 'POST', body: JSON.stringify(input) },
    apiBaseUrl,
  );
  return DocumentDetailResponseSchema.parse(await response.json());
}

export async function updateDocument(
  accessToken: string,
  documentId: string,
  input: DocumentUpdateRequest,
  apiBaseUrl = getApiBaseUrl(),
): Promise<DocumentDetailResponse> {
  const response = await documentRequest(
    accessToken,
    `/${documentId}`,
    { method: 'PATCH', body: JSON.stringify(input) },
    apiBaseUrl,
  );
  return DocumentDetailResponseSchema.parse(await response.json());
}

export async function archiveDocument(
  accessToken: string,
  documentId: string,
  apiBaseUrl = getApiBaseUrl(),
): Promise<DocumentDetailResponse> {
  const response = await documentRequest(
    accessToken,
    `/${documentId}/archive`,
    { method: 'POST' },
    apiBaseUrl,
  );
  return DocumentDetailResponseSchema.parse(await response.json());
}

export async function addDocumentVersion(
  accessToken: string,
  documentId: string,
  input: DocumentVersionCreateRequest,
  apiBaseUrl = getApiBaseUrl(),
): Promise<DocumentDetailResponse> {
  const response = await documentRequest(
    accessToken,
    `/${documentId}/versions`,
    { method: 'POST', body: JSON.stringify(input) },
    apiBaseUrl,
  );
  return DocumentDetailResponseSchema.parse(await response.json());
}

export async function listDocumentVersions(
  accessToken: string,
  documentId: string,
  apiBaseUrl = getApiBaseUrl(),
): Promise<DocumentVersionListResponse> {
  const response = await documentRequest(accessToken, `/${documentId}/versions`, {}, apiBaseUrl);
  return DocumentVersionListResponseSchema.parse(await response.json());
}

export async function downloadDocumentVersion(
  accessToken: string,
  documentId: string,
  versionId: string,
  apiBaseUrl = getApiBaseUrl(),
): Promise<Blob> {
  const response = await documentRequest(
    accessToken,
    `/${documentId}/versions/${versionId}/download`,
    {},
    apiBaseUrl,
  );
  return response.blob();
}

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

export async function listMissionCandidates(
  accessToken: string,
  missionId: string,
  apiBaseUrl = getApiBaseUrl(),
): Promise<MissionCandidateListResponse> {
  const response = await missionRequest(accessToken, `/${missionId}/candidates`, {}, apiBaseUrl);
  return MissionCandidateListResponseSchema.parse(await response.json());
}

export async function createMissionCandidate(
  accessToken: string,
  missionId: string,
  input: MissionCandidateCreateRequest,
  apiBaseUrl = getApiBaseUrl(),
): Promise<MissionCandidateDetailResponse> {
  const response = await missionRequest(
    accessToken,
    `/${missionId}/candidates`,
    { method: 'POST', body: JSON.stringify(input) },
    apiBaseUrl,
  );
  return MissionCandidateDetailResponseSchema.parse(await response.json());
}

export async function transitionMissionCandidate(
  accessToken: string,
  missionId: string,
  processId: string,
  input: MissionCandidateTransitionRequest,
  apiBaseUrl = getApiBaseUrl(),
): Promise<MissionCandidateDetailResponse> {
  const response = await missionRequest(
    accessToken,
    `/${missionId}/candidates/${processId}/transition`,
    { method: 'POST', body: JSON.stringify(input) },
    apiBaseUrl,
  );
  return MissionCandidateDetailResponseSchema.parse(await response.json());
}

export async function transferMissionCandidate(
  accessToken: string,
  missionId: string,
  processId: string,
  input: MissionCandidateTransferRequest,
  apiBaseUrl = getApiBaseUrl(),
): Promise<MissionCandidateDetailResponse> {
  const response = await missionRequest(
    accessToken,
    `/${missionId}/candidates/${processId}/transfer`,
    { method: 'POST', body: JSON.stringify(input) },
    apiBaseUrl,
  );
  return MissionCandidateDetailResponseSchema.parse(await response.json());
}

export async function presentMissionCandidate(
  accessToken: string,
  missionId: string,
  processId: string,
  input: MissionCandidatePresentationRequest,
  apiBaseUrl = getApiBaseUrl(),
): Promise<MissionCandidateDetailResponse> {
  const response = await missionRequest(
    accessToken,
    `/${missionId}/candidates/${processId}/present`,
    { method: 'POST', body: JSON.stringify(input) },
    apiBaseUrl,
  );
  return MissionCandidateDetailResponseSchema.parse(await response.json());
}

export async function getMissionCandidateOffers(
  accessToken: string,
  missionId: string,
  processId: string,
  apiBaseUrl = getApiBaseUrl(),
): Promise<OfferListResponse> {
  const response = await missionRequest(
    accessToken,
    `/${missionId}/candidates/${processId}/offers`,
    {},
    apiBaseUrl,
  );
  return OfferListResponseSchema.parse(await response.json());
}

export async function createMissionCandidateOffer(
  accessToken: string,
  missionId: string,
  processId: string,
  input: OfferCreateRequest,
  apiBaseUrl = getApiBaseUrl(),
): Promise<OfferDetailResponse> {
  const response = await missionRequest(
    accessToken,
    `/${missionId}/candidates/${processId}/offers`,
    { method: 'POST', body: JSON.stringify(input) },
    apiBaseUrl,
  );
  return OfferDetailResponseSchema.parse(await response.json());
}

export async function reviseMissionCandidateOffer(
  accessToken: string,
  missionId: string,
  processId: string,
  offerVersionId: string,
  input: OfferReviseRequest,
  apiBaseUrl = getApiBaseUrl(),
): Promise<OfferDetailResponse> {
  const response = await missionRequest(
    accessToken,
    `/${missionId}/candidates/${processId}/offers/${offerVersionId}/revise`,
    { method: 'POST', body: JSON.stringify(input) },
    apiBaseUrl,
  );
  return OfferDetailResponseSchema.parse(await response.json());
}

export async function markMissionCandidateOfferSent(
  accessToken: string,
  missionId: string,
  processId: string,
  offerVersionId: string,
  input: OfferMarkSentRequest,
  apiBaseUrl = getApiBaseUrl(),
): Promise<OfferDetailResponse> {
  const response = await missionRequest(
    accessToken,
    `/${missionId}/candidates/${processId}/offers/${offerVersionId}/mark-sent`,
    { method: 'POST', body: JSON.stringify(input) },
    apiBaseUrl,
  );
  return OfferDetailResponseSchema.parse(await response.json());
}

export async function recordMissionCandidateOfferResponse(
  accessToken: string,
  missionId: string,
  processId: string,
  offerVersionId: string,
  input: OfferResponseRequest,
  apiBaseUrl = getApiBaseUrl(),
): Promise<OfferDetailResponse> {
  const response = await missionRequest(
    accessToken,
    `/${missionId}/candidates/${processId}/offers/${offerVersionId}/response`,
    { method: 'POST', body: JSON.stringify(input) },
    apiBaseUrl,
  );
  return OfferDetailResponseSchema.parse(await response.json());
}

export async function withdrawMissionCandidateOffer(
  accessToken: string,
  missionId: string,
  processId: string,
  offerVersionId: string,
  input: OfferWithdrawRequest,
  apiBaseUrl = getApiBaseUrl(),
): Promise<OfferDetailResponse> {
  const response = await missionRequest(
    accessToken,
    `/${missionId}/candidates/${processId}/offers/${offerVersionId}/withdraw`,
    { method: 'POST', body: JSON.stringify(input) },
    apiBaseUrl,
  );
  return OfferDetailResponseSchema.parse(await response.json());
}

export async function getMissionCandidatePlacement(
  accessToken: string,
  missionId: string,
  processId: string,
  apiBaseUrl = getApiBaseUrl(),
): Promise<PlacementDetailResponse> {
  const response = await missionRequest(
    accessToken,
    `/${missionId}/candidates/${processId}/placement`,
    {},
    apiBaseUrl,
  );
  return PlacementDetailResponseSchema.parse(await response.json());
}

export async function confirmMissionCandidatePlacement(
  accessToken: string,
  missionId: string,
  processId: string,
  offerVersionId: string,
  input: PlacementConfirmRequest,
  apiBaseUrl = getApiBaseUrl(),
): Promise<PlacementDetailResponse> {
  const response = await missionRequest(
    accessToken,
    `/${missionId}/candidates/${processId}/offers/${offerVersionId}/confirm-placement`,
    { method: 'POST', body: JSON.stringify(input) },
    apiBaseUrl,
  );
  return PlacementDetailResponseSchema.parse(await response.json());
}

export async function correctMissionCandidatePlacement(
  accessToken: string,
  missionId: string,
  processId: string,
  input: PlacementCorrectRequest,
  apiBaseUrl = getApiBaseUrl(),
): Promise<PlacementDetailResponse> {
  const response = await missionRequest(
    accessToken,
    `/${missionId}/candidates/${processId}/placement/correct`,
    { method: 'POST', body: JSON.stringify(input) },
    apiBaseUrl,
  );
  return PlacementDetailResponseSchema.parse(await response.json());
}

export async function listInterviews(
  accessToken: string,
  missionId: string,
  processId: string,
  apiBaseUrl = getApiBaseUrl(),
): Promise<InterviewListResponse> {
  const response = await missionRequest(
    accessToken,
    `/${missionId}/candidates/${processId}/interviews`,
    {},
    apiBaseUrl,
  );
  return InterviewListResponseSchema.parse(await response.json());
}

export async function scheduleInterview(
  accessToken: string,
  missionId: string,
  processId: string,
  input: InterviewScheduleRequest,
  apiBaseUrl = getApiBaseUrl(),
): Promise<InterviewDetailResponse> {
  const response = await missionRequest(
    accessToken,
    `/${missionId}/candidates/${processId}/interviews`,
    { method: 'POST', body: JSON.stringify(input) },
    apiBaseUrl,
  );
  return InterviewDetailResponseSchema.parse(await response.json());
}

export async function rescheduleInterview(
  accessToken: string,
  missionId: string,
  processId: string,
  interviewId: string,
  input: InterviewRescheduleRequest,
  apiBaseUrl = getApiBaseUrl(),
): Promise<InterviewDetailResponse> {
  const response = await missionRequest(
    accessToken,
    `/${missionId}/candidates/${processId}/interviews/${interviewId}/reschedule`,
    { method: 'POST', body: JSON.stringify(input) },
    apiBaseUrl,
  );
  return InterviewDetailResponseSchema.parse(await response.json());
}

export async function postponeInterview(
  accessToken: string,
  missionId: string,
  processId: string,
  interviewId: string,
  input: InterviewPostponeRequest,
  apiBaseUrl = getApiBaseUrl(),
): Promise<InterviewDetailResponse> {
  const response = await missionRequest(
    accessToken,
    `/${missionId}/candidates/${processId}/interviews/${interviewId}/postpone`,
    { method: 'POST', body: JSON.stringify(input) },
    apiBaseUrl,
  );
  return InterviewDetailResponseSchema.parse(await response.json());
}

export async function completeInterview(
  accessToken: string,
  missionId: string,
  processId: string,
  interviewId: string,
  input: InterviewCompletionRequest,
  apiBaseUrl = getApiBaseUrl(),
): Promise<InterviewDetailResponse> {
  const response = await missionRequest(
    accessToken,
    `/${missionId}/candidates/${processId}/interviews/${interviewId}/complete`,
    { method: 'POST', body: JSON.stringify(input) },
    apiBaseUrl,
  );
  return InterviewDetailResponseSchema.parse(await response.json());
}

export async function cancelInterview(
  accessToken: string,
  missionId: string,
  processId: string,
  interviewId: string,
  input: InterviewCancellationRequest,
  apiBaseUrl = getApiBaseUrl(),
): Promise<InterviewDetailResponse> {
  const response = await missionRequest(
    accessToken,
    `/${missionId}/candidates/${processId}/interviews/${interviewId}/cancel`,
    { method: 'POST', body: JSON.stringify(input) },
    apiBaseUrl,
  );
  return InterviewDetailResponseSchema.parse(await response.json());
}

export async function archiveInterview(
  accessToken: string,
  missionId: string,
  processId: string,
  interviewId: string,
  apiBaseUrl = getApiBaseUrl(),
): Promise<InterviewDetailResponse> {
  const response = await missionRequest(
    accessToken,
    `/${missionId}/candidates/${processId}/interviews/${interviewId}/archive`,
    { method: 'POST' },
    apiBaseUrl,
  );
  return InterviewDetailResponseSchema.parse(await response.json());
}

export async function addInterviewParticipant(
  accessToken: string,
  missionId: string,
  processId: string,
  interviewId: string,
  input: InterviewParticipantCreateRequest,
  apiBaseUrl = getApiBaseUrl(),
): Promise<InterviewDetailResponse> {
  const response = await missionRequest(
    accessToken,
    `/${missionId}/candidates/${processId}/interviews/${interviewId}/participants`,
    { method: 'POST', body: JSON.stringify(input) },
    apiBaseUrl,
  );
  return InterviewDetailResponseSchema.parse(await response.json());
}

export async function listEvaluations(
  accessToken: string,
  missionId: string,
  processId: string,
  interviewId: string,
  apiBaseUrl = getApiBaseUrl(),
): Promise<EvaluationListResponse> {
  const response = await missionRequest(
    accessToken,
    `/${missionId}/candidates/${processId}/interviews/${interviewId}/evaluations`,
    {},
    apiBaseUrl,
  );
  return EvaluationListResponseSchema.parse(await response.json());
}

export async function createEvaluation(
  accessToken: string,
  missionId: string,
  processId: string,
  interviewId: string,
  input: EvaluationCreateRequest,
  apiBaseUrl = getApiBaseUrl(),
): Promise<EvaluationDetailResponse> {
  const response = await missionRequest(
    accessToken,
    `/${missionId}/candidates/${processId}/interviews/${interviewId}/evaluations`,
    { method: 'POST', body: JSON.stringify(input) },
    apiBaseUrl,
  );
  return EvaluationDetailResponseSchema.parse(await response.json());
}

export async function updateEvaluation(
  accessToken: string,
  missionId: string,
  processId: string,
  interviewId: string,
  evaluationId: string,
  input: EvaluationUpdateRequest,
  apiBaseUrl = getApiBaseUrl(),
): Promise<EvaluationDetailResponse> {
  const response = await missionRequest(
    accessToken,
    `/${missionId}/candidates/${processId}/interviews/${interviewId}/evaluations/${evaluationId}`,
    { method: 'PATCH', body: JSON.stringify(input) },
    apiBaseUrl,
  );
  return EvaluationDetailResponseSchema.parse(await response.json());
}

export async function finalizeEvaluation(
  accessToken: string,
  missionId: string,
  processId: string,
  interviewId: string,
  evaluationId: string,
  apiBaseUrl = getApiBaseUrl(),
): Promise<EvaluationDetailResponse> {
  const response = await missionRequest(
    accessToken,
    `/${missionId}/candidates/${processId}/interviews/${interviewId}/evaluations/${evaluationId}/finalize`,
    { method: 'POST' },
    apiBaseUrl,
  );
  return EvaluationDetailResponseSchema.parse(await response.json());
}

export async function listPublicOpportunities(
  apiBaseUrl = getApiBaseUrl(),
): Promise<PublicOpportunityListResponse> {
  const response = await fetch(`${apiBaseUrl}/v1/public/opportunities`);
  if (!response.ok) {
    throw new Error(`Public opportunities request failed with status ${response.status}`);
  }
  return PublicOpportunityListResponseSchema.parse(await response.json());
}

export async function getPublicOpportunity(
  publicSlug: string,
  apiBaseUrl = getApiBaseUrl(),
): Promise<PublicOpportunityDetailResponse> {
  const response = await fetch(`${apiBaseUrl}/v1/public/opportunities/${publicSlug}`);
  if (!response.ok) {
    throw new Error(`Public opportunity request failed with status ${response.status}`);
  }
  return PublicOpportunityDetailResponseSchema.parse(await response.json());
}

export async function submitPublicApplication(
  publicSlug: string,
  input: PublicApplicationSubmitRequest,
  apiBaseUrl = getApiBaseUrl(),
): Promise<PublicApplicationSubmitResponse> {
  const response = await fetch(`${apiBaseUrl}/v1/public/opportunities/${publicSlug}/applications`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(`Public application request failed with status ${response.status}`);
  }
  return PublicApplicationSubmitResponseSchema.parse(await response.json());
}

export async function getInternalPublicOpportunity(
  accessToken: string,
  missionId: string,
  apiBaseUrl = getApiBaseUrl(),
): Promise<InternalPublicOpportunityDetailResponse> {
  const response = await missionRequest(
    accessToken,
    `/${missionId}/public-opportunity`,
    {},
    apiBaseUrl,
  );
  return InternalPublicOpportunityDetailResponseSchema.parse(await response.json());
}

export async function updateInternalPublicOpportunity(
  accessToken: string,
  missionId: string,
  input: InternalPublicOpportunityUpdateRequest,
  apiBaseUrl = getApiBaseUrl(),
): Promise<InternalPublicOpportunityDetailResponse> {
  const response = await missionRequest(
    accessToken,
    `/${missionId}/public-opportunity`,
    { method: 'PATCH', body: JSON.stringify(input) },
    apiBaseUrl,
  );
  return InternalPublicOpportunityDetailResponseSchema.parse(await response.json());
}

export async function listInternalPublicApplications(
  accessToken: string,
  missionId: string,
  apiBaseUrl = getApiBaseUrl(),
): Promise<InternalPublicApplicationListResponse> {
  const response = await missionRequest(
    accessToken,
    `/${missionId}/public-opportunity/applications`,
    {},
    apiBaseUrl,
  );
  return InternalPublicApplicationListResponseSchema.parse(await response.json());
}

async function taskRequest(
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

  const response = await fetch(`${apiBaseUrl}/v1/tasks${path}`, {
    ...init,
    credentials: 'include',
    headers,
  });

  if (!response.ok) {
    throw new Error(`Task request failed with status ${response.status}`);
  }

  return response;
}

async function notificationRequest(
  accessToken: string,
  path: string,
  init: RequestInit = {},
  apiBaseUrl = getApiBaseUrl(),
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${accessToken}`);

  const response = await fetch(`${apiBaseUrl}/v1/notifications${path}`, {
    ...init,
    credentials: 'include',
    headers,
  });

  if (!response.ok) {
    throw new Error(`Notification request failed with status ${response.status}`);
  }

  return response;
}

export async function listTasks(
  accessToken: string,
  query: Partial<TaskListQuery> = {},
  apiBaseUrl = getApiBaseUrl(),
): Promise<TaskListResponse> {
  const parsed = TaskListQuerySchema.partial().parse(query);
  const path = queryPath('', parsed);
  const response = await taskRequest(accessToken, path, {}, apiBaseUrl);
  return TaskListResponseSchema.parse(await response.json());
}

export async function createTask(
  accessToken: string,
  input: TaskCreateRequest,
  apiBaseUrl = getApiBaseUrl(),
): Promise<TaskDetailResponse> {
  const parsed = TaskCreateRequestSchema.parse(input);
  const response = await taskRequest(
    accessToken,
    '',
    { method: 'POST', body: JSON.stringify(parsed) },
    apiBaseUrl,
  );
  return TaskDetailResponseSchema.parse(await response.json());
}

export async function updateTaskStatus(
  accessToken: string,
  taskId: string,
  input: TaskStatusChangeRequest,
  apiBaseUrl = getApiBaseUrl(),
): Promise<TaskDetailResponse> {
  const parsed = TaskStatusChangeRequestSchema.parse(input);
  const response = await taskRequest(
    accessToken,
    `/${taskId}/status`,
    { method: 'POST', body: JSON.stringify(parsed) },
    apiBaseUrl,
  );
  return TaskDetailResponseSchema.parse(await response.json());
}

export async function changeTaskOwner(
  accessToken: string,
  taskId: string,
  input: TaskOwnerChangeRequest,
  apiBaseUrl = getApiBaseUrl(),
): Promise<TaskDetailResponse> {
  const parsed = TaskOwnerChangeRequestSchema.parse(input);
  const response = await taskRequest(
    accessToken,
    `/${taskId}/owner`,
    { method: 'POST', body: JSON.stringify(parsed) },
    apiBaseUrl,
  );
  return TaskDetailResponseSchema.parse(await response.json());
}

export async function addTaskAssignment(
  accessToken: string,
  taskId: string,
  input: TaskAssignmentCreateRequest,
  apiBaseUrl = getApiBaseUrl(),
): Promise<TaskDetailResponse> {
  const parsed = TaskAssignmentCreateRequestSchema.parse(input);
  const response = await taskRequest(
    accessToken,
    `/${taskId}/assignments`,
    { method: 'POST', body: JSON.stringify(parsed) },
    apiBaseUrl,
  );
  return TaskDetailResponseSchema.parse(await response.json());
}

export async function createTaskComment(
  accessToken: string,
  taskId: string,
  input: TaskCommentCreateRequest,
  apiBaseUrl = getApiBaseUrl(),
): Promise<TaskCommentDetailResponse> {
  const parsed = TaskCommentCreateRequestSchema.parse(input);
  const response = await taskRequest(
    accessToken,
    `/${taskId}/comments`,
    { method: 'POST', body: JSON.stringify(parsed) },
    apiBaseUrl,
  );
  return TaskCommentDetailResponseSchema.parse(await response.json());
}

export async function createTaskReminder(
  accessToken: string,
  taskId: string,
  input: TaskReminderCreateRequest,
  apiBaseUrl = getApiBaseUrl(),
): Promise<TaskReminderDetailResponse> {
  const parsed = TaskReminderCreateRequestSchema.parse(input);
  const response = await taskRequest(
    accessToken,
    `/${taskId}/reminders`,
    { method: 'POST', body: JSON.stringify(parsed) },
    apiBaseUrl,
  );
  return TaskReminderDetailResponseSchema.parse(await response.json());
}

export async function processDueTaskReminders(
  accessToken: string,
  apiBaseUrl = getApiBaseUrl(),
): Promise<TaskReminderProcessResponse> {
  const response = await taskRequest(
    accessToken,
    '/reminders/process-due',
    { method: 'POST', body: JSON.stringify({ limit: 25 }) },
    apiBaseUrl,
  );
  return TaskReminderProcessResponseSchema.parse(await response.json());
}

export async function listNotifications(
  accessToken: string,
  query: Partial<NotificationListQuery> = {},
  apiBaseUrl = getApiBaseUrl(),
): Promise<NotificationListResponse> {
  const parsed = NotificationListQuerySchema.partial().parse(query);
  const response = await notificationRequest(accessToken, queryPath('', parsed), {}, apiBaseUrl);
  return NotificationListResponseSchema.parse(await response.json());
}

export async function markNotificationRead(
  accessToken: string,
  notificationId: string,
  apiBaseUrl = getApiBaseUrl(),
): Promise<NotificationDetailResponse> {
  const response = await notificationRequest(
    accessToken,
    `/${notificationId}/read`,
    { method: 'POST' },
    apiBaseUrl,
  );
  return NotificationDetailResponseSchema.parse(await response.json());
}

export async function markAllNotificationsRead(
  accessToken: string,
  input: NotificationReadAllRequest = {},
  apiBaseUrl = getApiBaseUrl(),
): Promise<NotificationReadAllResponse> {
  const parsed = NotificationReadAllRequestSchema.parse(input);
  const response = await notificationRequest(
    accessToken,
    '/read-all',
    { method: 'POST', body: JSON.stringify(parsed) },
    apiBaseUrl,
  );
  return NotificationReadAllResponseSchema.parse(await response.json());
}

export async function archiveNotification(
  accessToken: string,
  notificationId: string,
  apiBaseUrl = getApiBaseUrl(),
): Promise<NotificationDetailResponse> {
  const response = await notificationRequest(
    accessToken,
    `/${notificationId}/archive`,
    { method: 'POST' },
    apiBaseUrl,
  );
  return NotificationDetailResponseSchema.parse(await response.json());
}

function queryPath(
  path: string,
  query: Partial<Record<string, string | number | boolean | null | undefined>>,
): string {
  const parameters = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') {
      parameters.set(key, String(value));
    }
  }
  const serialized = parameters.toString();
  return serialized ? `${path}?${serialized}` : path;
}

async function trainingRequest(
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

  const response = await fetch(`${apiBaseUrl}/v1/training${path}`, {
    ...init,
    credentials: 'include',
    headers,
  });

  if (!response.ok) {
    throw new Error(`Training request failed with status ${response.status}`);
  }

  return response;
}

export type TrainingProgramListOptions = {
  accessToken: string;
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
  clientId?: string;
  ownerUserId?: string;
  includeArchived?: boolean;
  sortBy?: string;
  sortDirection?: string;
  apiBaseUrl?: string;
};

export async function listTrainingPrograms(
  options: TrainingProgramListOptions,
): Promise<TrainingProgramListResponse> {
  const response = await trainingRequest(
    options.accessToken,
    queryPath('/programs', {
      page: options.page ?? 1,
      pageSize: options.pageSize ?? 20,
      search: options.search,
      status: options.status,
      clientId: options.clientId,
      ownerUserId: options.ownerUserId,
      includeArchived: options.includeArchived,
      sortBy: options.sortBy,
      sortDirection: options.sortDirection,
    }),
    {},
    options.apiBaseUrl,
  );
  return TrainingProgramListResponseSchema.parse(await response.json());
}

export async function getTrainingProgram(
  accessToken: string,
  programId: string,
  apiBaseUrl = getApiBaseUrl(),
): Promise<TrainingProgramDetailResponse> {
  const response = await trainingRequest(accessToken, `/programs/${programId}`, {}, apiBaseUrl);
  return TrainingProgramDetailResponseSchema.parse(await response.json());
}

export async function createTrainingProgram(
  accessToken: string,
  input: TrainingProgramCreateRequest,
  apiBaseUrl = getApiBaseUrl(),
): Promise<TrainingProgramDetailResponse> {
  const response = await trainingRequest(
    accessToken,
    '/programs',
    { method: 'POST', body: JSON.stringify(input) },
    apiBaseUrl,
  );
  return TrainingProgramDetailResponseSchema.parse(await response.json());
}

export async function updateTrainingProgram(
  accessToken: string,
  programId: string,
  input: TrainingProgramUpdateRequest,
  apiBaseUrl = getApiBaseUrl(),
): Promise<TrainingProgramDetailResponse> {
  const response = await trainingRequest(
    accessToken,
    `/programs/${programId}`,
    { method: 'PATCH', body: JSON.stringify(input) },
    apiBaseUrl,
  );
  return TrainingProgramDetailResponseSchema.parse(await response.json());
}

export async function updateTrainingProgramStatus(
  accessToken: string,
  programId: string,
  input: TrainingProgramStatusUpdateRequest,
  apiBaseUrl = getApiBaseUrl(),
): Promise<TrainingProgramDetailResponse> {
  const response = await trainingRequest(
    accessToken,
    `/programs/${programId}/status`,
    { method: 'POST', body: JSON.stringify(input) },
    apiBaseUrl,
  );
  return TrainingProgramDetailResponseSchema.parse(await response.json());
}

export async function archiveTrainingProgram(
  accessToken: string,
  programId: string,
  apiBaseUrl = getApiBaseUrl(),
): Promise<TrainingProgramDetailResponse> {
  const response = await trainingRequest(
    accessToken,
    `/programs/${programId}/archive`,
    { method: 'POST' },
    apiBaseUrl,
  );
  return TrainingProgramDetailResponseSchema.parse(await response.json());
}

export type TrainingSessionListOptions = {
  accessToken: string;
  programId: string;
  page?: number;
  pageSize?: number;
  status?: string;
  search?: string;
  includeArchived?: boolean;
  apiBaseUrl?: string;
};

export async function listTrainingSessions(
  options: TrainingSessionListOptions,
): Promise<TrainingSessionListResponse> {
  const response = await trainingRequest(
    options.accessToken,
    queryPath(`/programs/${options.programId}/sessions`, {
      page: options.page ?? 1,
      pageSize: options.pageSize ?? 20,
      status: options.status,
      search: options.search,
      includeArchived: options.includeArchived,
    }),
    {},
    options.apiBaseUrl,
  );
  return TrainingSessionListResponseSchema.parse(await response.json());
}

export async function createTrainingSession(
  accessToken: string,
  programId: string,
  input: TrainingSessionCreateRequest,
  apiBaseUrl = getApiBaseUrl(),
): Promise<TrainingSessionDetailResponse> {
  const response = await trainingRequest(
    accessToken,
    `/programs/${programId}/sessions`,
    { method: 'POST', body: JSON.stringify(input) },
    apiBaseUrl,
  );
  return TrainingSessionDetailResponseSchema.parse(await response.json());
}

export async function rescheduleTrainingSession(
  accessToken: string,
  programId: string,
  sessionId: string,
  input: TrainingSessionRescheduleRequest,
  apiBaseUrl = getApiBaseUrl(),
): Promise<TrainingSessionDetailResponse> {
  const response = await trainingRequest(
    accessToken,
    `/programs/${programId}/sessions/${sessionId}/reschedule`,
    { method: 'POST', body: JSON.stringify(input) },
    apiBaseUrl,
  );
  return TrainingSessionDetailResponseSchema.parse(await response.json());
}

export async function updateTrainingSessionStatus(
  accessToken: string,
  programId: string,
  sessionId: string,
  input: TrainingSessionStatusUpdateRequest,
  apiBaseUrl = getApiBaseUrl(),
): Promise<TrainingSessionDetailResponse> {
  const response = await trainingRequest(
    accessToken,
    `/programs/${programId}/sessions/${sessionId}/status`,
    { method: 'POST', body: JSON.stringify(input) },
    apiBaseUrl,
  );
  return TrainingSessionDetailResponseSchema.parse(await response.json());
}

export async function cancelTrainingSession(
  accessToken: string,
  programId: string,
  sessionId: string,
  input: TrainingSessionCancelRequest,
  apiBaseUrl = getApiBaseUrl(),
): Promise<TrainingSessionDetailResponse> {
  const response = await trainingRequest(
    accessToken,
    `/programs/${programId}/sessions/${sessionId}/cancel`,
    { method: 'POST', body: JSON.stringify(input) },
    apiBaseUrl,
  );
  return TrainingSessionDetailResponseSchema.parse(await response.json());
}

export async function archiveTrainingSession(
  accessToken: string,
  programId: string,
  sessionId: string,
  apiBaseUrl = getApiBaseUrl(),
): Promise<TrainingSessionDetailResponse> {
  const response = await trainingRequest(
    accessToken,
    `/programs/${programId}/sessions/${sessionId}/archive`,
    { method: 'POST' },
    apiBaseUrl,
  );
  return TrainingSessionDetailResponseSchema.parse(await response.json());
}

export type TrainingEnrollmentListOptions = {
  accessToken: string;
  programId: string;
  page?: number;
  pageSize?: number;
  status?: string;
  participantType?: string;
  certificateReadyOnly?: boolean;
  includeArchived?: boolean;
  apiBaseUrl?: string;
};

export async function listTrainingEnrollments(
  options: TrainingEnrollmentListOptions,
): Promise<TrainingEnrollmentListResponse> {
  const response = await trainingRequest(
    options.accessToken,
    queryPath(`/programs/${options.programId}/enrollments`, {
      page: options.page ?? 1,
      pageSize: options.pageSize ?? 20,
      status: options.status,
      participantType: options.participantType,
      certificateReadyOnly: options.certificateReadyOnly,
      includeArchived: options.includeArchived,
    }),
    {},
    options.apiBaseUrl,
  );
  return TrainingEnrollmentListResponseSchema.parse(await response.json());
}

export async function createTrainingEnrollment(
  accessToken: string,
  programId: string,
  input: TrainingEnrollmentCreateRequest,
  apiBaseUrl = getApiBaseUrl(),
): Promise<TrainingEnrollmentDetailResponse> {
  const response = await trainingRequest(
    accessToken,
    `/programs/${programId}/enrollments`,
    { method: 'POST', body: JSON.stringify(input) },
    apiBaseUrl,
  );
  return TrainingEnrollmentDetailResponseSchema.parse(await response.json());
}

export async function updateTrainingEnrollmentStatus(
  accessToken: string,
  programId: string,
  enrollmentId: string,
  input: TrainingEnrollmentStatusUpdateRequest,
  apiBaseUrl = getApiBaseUrl(),
): Promise<TrainingEnrollmentDetailResponse> {
  const response = await trainingRequest(
    accessToken,
    `/programs/${programId}/enrollments/${enrollmentId}/status`,
    { method: 'POST', body: JSON.stringify(input) },
    apiBaseUrl,
  );
  return TrainingEnrollmentDetailResponseSchema.parse(await response.json());
}

export async function withdrawTrainingEnrollment(
  accessToken: string,
  programId: string,
  enrollmentId: string,
  input: TrainingEnrollmentWithdrawRequest,
  apiBaseUrl = getApiBaseUrl(),
): Promise<TrainingEnrollmentDetailResponse> {
  const response = await trainingRequest(
    accessToken,
    `/programs/${programId}/enrollments/${enrollmentId}/withdraw`,
    { method: 'POST', body: JSON.stringify(input) },
    apiBaseUrl,
  );
  return TrainingEnrollmentDetailResponseSchema.parse(await response.json());
}

export type TrainingParticipationListOptions = {
  accessToken: string;
  programId: string;
  sessionId: string;
  page?: number;
  pageSize?: number;
  status?: string;
  includeArchived?: boolean;
  apiBaseUrl?: string;
};

export async function listTrainingParticipations(
  options: TrainingParticipationListOptions,
): Promise<TrainingParticipationListResponse> {
  const response = await trainingRequest(
    options.accessToken,
    queryPath(`/programs/${options.programId}/sessions/${options.sessionId}/participations`, {
      page: options.page ?? 1,
      pageSize: options.pageSize ?? 20,
      status: options.status,
      includeArchived: options.includeArchived,
    }),
    {},
    options.apiBaseUrl,
  );
  return TrainingParticipationListResponseSchema.parse(await response.json());
}

export async function createTrainingParticipation(
  accessToken: string,
  programId: string,
  sessionId: string,
  input: TrainingParticipationCreateRequest,
  apiBaseUrl = getApiBaseUrl(),
): Promise<TrainingParticipationDetailResponse> {
  const response = await trainingRequest(
    accessToken,
    `/programs/${programId}/sessions/${sessionId}/participations`,
    { method: 'POST', body: JSON.stringify(input) },
    apiBaseUrl,
  );
  return TrainingParticipationDetailResponseSchema.parse(await response.json());
}

export async function updateTrainingAttendance(
  accessToken: string,
  programId: string,
  sessionId: string,
  participationId: string,
  input: TrainingAttendanceUpdateRequest,
  apiBaseUrl = getApiBaseUrl(),
): Promise<TrainingParticipationDetailResponse> {
  const response = await trainingRequest(
    accessToken,
    `/programs/${programId}/sessions/${sessionId}/participations/${participationId}/attendance`,
    { method: 'POST', body: JSON.stringify(input) },
    apiBaseUrl,
  );
  return TrainingParticipationDetailResponseSchema.parse(await response.json());
}

export async function correctTrainingAttendance(
  accessToken: string,
  programId: string,
  sessionId: string,
  participationId: string,
  input: TrainingAttendanceCorrectionRequest,
  apiBaseUrl = getApiBaseUrl(),
): Promise<TrainingParticipationDetailResponse> {
  const response = await trainingRequest(
    accessToken,
    `/programs/${programId}/sessions/${sessionId}/participations/${participationId}/correction`,
    { method: 'POST', body: JSON.stringify(input) },
    apiBaseUrl,
  );
  return TrainingParticipationDetailResponseSchema.parse(await response.json());
}

type ReportingQuery = ReportingFilterQuery & {
  interval?: 'day' | 'week';
  page?: number;
  pageSize?: number;
};

async function reportingRequest(
  accessToken: string,
  path: string,
  apiBaseUrl = getApiBaseUrl(),
): Promise<Response> {
  const response = await fetch(`${apiBaseUrl}/v1/reporting/recruitment${path}`, {
    credentials: 'include',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new Error(`Reporting request failed with status ${response.status}`);
  }
  return response;
}

function reportingQueryPath(path: string, query: ReportingQuery): string {
  return queryPath(path, {
    start: query.start,
    end: query.end,
    clientId: query.clientId,
    missionId: query.missionId,
    recruiterUserId: query.recruiterUserId,
    pipelineState: query.pipelineState,
    offerStatus: query.offerStatus,
    placementStatus: query.placementStatus,
    source: query.source,
    interval: query.interval,
    page: query.page,
    pageSize: query.pageSize,
  });
}

export async function getReportingSummary(
  accessToken: string,
  query: ReportingQuery = {},
  apiBaseUrl = getApiBaseUrl(),
): Promise<ReportingSummaryResponse> {
  const response = await reportingRequest(
    accessToken,
    reportingQueryPath('/summary', query),
    apiBaseUrl,
  );
  return ReportingSummaryResponseSchema.parse(await response.json());
}

export async function getReportingPipeline(
  accessToken: string,
  query: ReportingQuery = {},
  apiBaseUrl = getApiBaseUrl(),
): Promise<ReportingPipelineResponse> {
  const response = await reportingRequest(
    accessToken,
    reportingQueryPath('/pipeline', query),
    apiBaseUrl,
  );
  return ReportingPipelineResponseSchema.parse(await response.json());
}

export async function getReportingTrends(
  accessToken: string,
  query: ReportingQuery = {},
  apiBaseUrl = getApiBaseUrl(),
): Promise<ReportingTrendsResponse> {
  const response = await reportingRequest(
    accessToken,
    reportingQueryPath('/trends', query),
    apiBaseUrl,
  );
  return ReportingTrendsResponseSchema.parse(await response.json());
}

export async function getReportingBreakdowns(
  accessToken: string,
  query: ReportingQuery = {},
  apiBaseUrl = getApiBaseUrl(),
): Promise<ReportingBreakdownsResponse> {
  const response = await reportingRequest(
    accessToken,
    reportingQueryPath('/breakdowns', query),
    apiBaseUrl,
  );
  return ReportingBreakdownsResponseSchema.parse(await response.json());
}

export async function getReportingDrilldown(
  accessToken: string,
  query: ReportingQuery = {},
  apiBaseUrl = getApiBaseUrl(),
): Promise<ReportingDrilldownResponse> {
  const response = await reportingRequest(
    accessToken,
    reportingQueryPath('/drilldown', query),
    apiBaseUrl,
  );
  return ReportingDrilldownResponseSchema.parse(await response.json());
}

export async function exportReportingCsv(
  accessToken: string,
  query: ReportingQuery = {},
  apiBaseUrl = getApiBaseUrl(),
): Promise<{ filename: string; content: string }> {
  const response = await reportingRequest(
    accessToken,
    reportingQueryPath('/export.csv', query),
    apiBaseUrl,
  );
  const disposition = response.headers.get('content-disposition') ?? '';
  const match = disposition.match(/filename="([^"]+)"/);
  return {
    filename: match?.[1] ?? 'recruitment-report.csv',
    content: await response.text(),
  };
}
