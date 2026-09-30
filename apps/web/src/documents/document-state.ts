import type {
  DocumentContext,
  DocumentContextOption,
  DocumentCreateRequest,
  DocumentDetail,
  DocumentStatus,
  DocumentSummary,
  DocumentType,
  DocumentVersionInput,
  DocumentVersionSource,
  DocumentVisibility,
} from '@hire-me/contracts';

import { DocumentRequestError } from '../api.js';
import type { MessageKey } from '../i18n/index.js';
import type { DocumentAccess } from './document-access.js';
import type { CreatableDocumentType } from './document-labels.js';

export const DOCUMENT_LIST_PAGE_SIZE = 20;
/** Mirrors the API's decoded-size limit so an oversized file fails before upload. */
export const MAX_DOCUMENT_FILE_BYTES = 4_000_000;

/**
 * A chosen record, kept as the label the option source returned. Labels are
 * record data, so they survive a locale switch without a refetch.
 */
export type PickerOption = Pick<DocumentContextOption, 'id' | 'label' | 'detail' | 'interview'>;

export type DocumentLifecycleFilter = 'current' | 'archived' | 'all';

export type DocumentFilterValues = {
  search: string;
  documentType: '' | DocumentType;
  status: '' | DocumentStatus;
  source: '' | DocumentVersionSource;
  lifecycle: DocumentLifecycleFilter;
  client: PickerOption | null;
  candidate: PickerOption | null;
  mission: PickerOption | null;
};

export const EMPTY_DOCUMENT_FILTERS: DocumentFilterValues = {
  search: '',
  documentType: '',
  status: '',
  source: '',
  lifecycle: 'current',
  client: null,
  candidate: null,
  mission: null,
};

export type DocumentListQuery = { filters: DocumentFilterValues; page: number };

export const FIRST_DOCUMENT_PAGE: DocumentListQuery = {
  filters: EMPTY_DOCUMENT_FILTERS,
  page: 1,
};

export function hasActiveDocumentFilters(filters: DocumentFilterValues): boolean {
  return (
    filters.search.trim().length > 0 ||
    filters.documentType !== '' ||
    filters.status !== '' ||
    filters.source !== '' ||
    filters.lifecycle !== 'current' ||
    filters.client !== null ||
    filters.candidate !== null ||
    filters.mission !== null
  );
}

/** Only IDs chosen through a permission-checked picker ever reach the query. */
export function toListParameters(filters: DocumentFilterValues) {
  return {
    search: filters.search.trim() || undefined,
    documentType: filters.documentType || undefined,
    status: filters.status || undefined,
    source: filters.source || undefined,
    lifecycle: filters.lifecycle === 'all' ? undefined : filters.lifecycle,
    clientId: filters.client?.id,
    candidateId: filters.candidate?.id,
    recruitmentMissionId: filters.mission?.id,
  };
}

export function pageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

export type DocumentListState =
  | { status: 'loading' }
  | { status: 'error' }
  | {
      status: 'ready';
      documents: DocumentSummary[];
      page: number;
      pageSize: number;
      total: number;
    };

export type DocumentDetailState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'missing' }
  | { status: 'ready'; document: DocumentDetail };

export type DocumentFeedback = { tone: 'success' | 'danger'; messageKey: MessageKey };

/** One write at a time: every document mutation takes the same lock. */
export type DocumentPendingAction = 'register' | 'update' | 'addVersion' | 'archive';

export type AttachTarget =
  'UNLINKED' | 'CLIENT' | 'CANDIDATE' | 'MISSION' | 'PROCESS' | 'INTERVIEW';

export type RegisterValues = {
  title: string;
  documentType: CreatableDocumentType;
  target: AttachTarget;
  client: PickerOption | null;
  candidate: PickerOption | null;
  mission: PickerOption | null;
  process: PickerOption | null;
  interview: PickerOption | null;
  file: File | null;
};

export const EMPTY_REGISTER_VALUES: RegisterValues = {
  title: '',
  documentType: 'OTHER',
  target: 'UNLINKED',
  client: null,
  candidate: null,
  mission: null,
  process: null,
  interview: null,
  file: null,
};

export type MetadataValues = { title: string; visibility: DocumentVisibility };

export function metadataFrom(document: DocumentSummary): MetadataValues {
  return { title: document.title, visibility: document.visibility };
}

/**
 * Targets offered for a type, limited to pickers this account may use.
 * Recruitment contracts need a mission and training contracts may not sit on
 * recruitment records; the API enforces both, this only avoids a dead end.
 */
export function attachTargetsFor(
  documentType: DocumentType,
  access: DocumentAccess,
): AttachTarget[] {
  const available: AttachTarget[] = [
    'UNLINKED',
    ...(access.pickClients ? (['CLIENT'] as const) : []),
    ...(access.pickCandidates ? (['CANDIDATE'] as const) : []),
    ...(access.pickMissions ? (['MISSION'] as const) : []),
    ...(access.pickProcesses ? (['PROCESS'] as const) : []),
    ...(access.pickInterviews ? (['INTERVIEW'] as const) : []),
  ];
  if (documentType === 'CONTRAT_RECRUTEMENT') {
    return available.filter((target) => target === 'MISSION');
  }
  if (documentType === 'CONTRAT_FORMATION') {
    return available.filter(
      (target) => target === 'UNLINKED' || target === 'CLIENT' || target === 'CANDIDATE',
    );
  }
  return available;
}

/** The chosen record for the target, or null when one is still required. */
function selectedContext(values: RegisterValues): DocumentContext | null {
  switch (values.target) {
    case 'UNLINKED':
      return {};
    case 'CLIENT':
      return values.client ? { clientId: values.client.id } : null;
    case 'CANDIDATE':
      return values.candidate ? { candidateId: values.candidate.id } : null;
    case 'MISSION':
      return values.mission ? { recruitmentMissionId: values.mission.id } : null;
    case 'PROCESS':
      return values.process ? { missionCandidateId: values.process.id } : null;
    case 'INTERVIEW':
      return values.interview ? { interviewId: values.interview.id } : null;
  }
}

export type RegisterProblem =
  | 'documents.register.selectionRequired'
  | 'documents.register.recruitmentContractNeedsMission'
  | 'documents.register.trainingContractLimits';

export function registerProblem(
  values: RegisterValues,
  access: DocumentAccess,
): RegisterProblem | null {
  const targets = attachTargetsFor(values.documentType, access);
  if (!targets.includes(values.target)) {
    return values.documentType === 'CONTRAT_RECRUTEMENT'
      ? 'documents.register.recruitmentContractNeedsMission'
      : values.documentType === 'CONTRAT_FORMATION'
        ? 'documents.register.trainingContractLimits'
        : 'documents.register.selectionRequired';
  }
  return selectedContext(values) ? null : 'documents.register.selectionRequired';
}

/**
 * The create request. Only the leaf record is linked: Documents stores the
 * link the operator chose and never infers business relationships. No owner is
 * sent, so the server records the actor.
 */
export async function toCreateRequest(values: RegisterValues): Promise<DocumentCreateRequest> {
  return {
    title: values.title.trim(),
    documentType: values.documentType,
    visibility: 'INTERNAL_ONLY',
    context: selectedContext(values) ?? {},
    version: values.file ? await toVersionInput(values.file) : undefined,
  };
}

export async function toVersionInput(file: File): Promise<DocumentVersionInput> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return {
    filename: file.name,
    contentType: file.type || 'application/octet-stream',
    base64Content: btoa(binary),
  };
}

export type DocumentWriteAction = 'register' | 'update' | 'addVersion' | 'archive' | 'download';

const ACTION_FAILURE: Record<DocumentWriteAction, MessageKey> = {
  addVersion: 'documents.feedback.failure.addVersion',
  archive: 'documents.feedback.failure.archive',
  download: 'documents.feedback.failure.download',
  register: 'documents.feedback.failure.register',
  update: 'documents.feedback.failure.update',
};

/** Localized copy for a failed request, from the stable API code only. */
export function documentFailureKey(error: unknown, action: DocumentWriteAction): MessageKey {
  if (!(error instanceof DocumentRequestError)) {
    return ACTION_FAILURE[action];
  }
  const code = error.code ?? '';
  if (code === 'DOCUMENT_FILE_SIZE_REJECTED') return 'documents.feedback.failure.fileTooLarge';
  if (
    code === 'DOCUMENT_FILE_TYPE_REJECTED' ||
    code === 'DOCUMENT_FILE_SIGNATURE_REJECTED' ||
    code === 'DOCUMENT_FILE_BASE64_INVALID'
  ) {
    return 'documents.feedback.failure.fileRejected';
  }
  if (code === 'DOCUMENT_CONTEXT_MISMATCH') return 'documents.feedback.failure.contextMismatch';
  if (code === 'DOCUMENT_RECRUITMENT_CONTRACT_CONTEXT_REQUIRED') {
    return 'documents.register.recruitmentContractNeedsMission';
  }
  if (code === 'DOCUMENT_TRAINING_CONTRACT_CONTEXT_INVALID') {
    return 'documents.register.trainingContractLimits';
  }
  if (/^DOCUMENT_[A-Z]+_CONTEXT_INVALID$/.test(code)) {
    return 'documents.feedback.failure.contextInvalid';
  }
  if (code === 'DOCUMENT_ARCHIVED') return 'documents.feedback.failure.archived';
  if (code === 'DOCUMENT_VERSION_ARCHIVED') return 'documents.feedback.failure.versionArchived';
  if (error.status === 404) return 'documents.feedback.failure.notFound';
  if (error.status === 403) return 'documents.feedback.failure.scope';
  return ACTION_FAILURE[action];
}
