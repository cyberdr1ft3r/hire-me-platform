import type {
  DocumentContextDisplay,
  DocumentContextOption,
  DocumentDetail,
  DocumentSummary,
  DocumentVersion,
} from '@hire-me/contracts';
import { vi } from 'vitest';

/** Synthetic fixtures for Document Center tests. No real person, client, or file is represented. */

export const ACTOR_ID = '12121212-1212-4121-8121-121212121212';
export const DOCUMENT_A_ID = 'a0a0a0a0-a0a0-4a0a-8a0a-a0a0a0a0a0a0';
export const DOCUMENT_B_ID = 'b0b0b0b0-b0b0-4b0b-8b0b-b0b0b0b0b0b0';
export const CLIENT_ID = 'c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1';
export const CANDIDATE_ID = 'c2c2c2c2-c2c2-4c2c-8c2c-c2c2c2c2c2c2';
export const MISSION_ID = 'c3c3c3c3-c3c3-4c3c-8c3c-c3c3c3c3c3c3';
export const PROCESS_ID = 'c4c4c4c4-c4c4-4c4c-8c4c-c4c4c4c4c4c4';
export const INTERVIEW_ID = 'c5c5c5c5-c5c5-4c5c-8c5c-c5c5c5c5c5c5';

/** Every fixture ID, so a test can prove none of them is ever rendered as text. */
export const FIXTURE_IDS = [
  ACTOR_ID,
  DOCUMENT_A_ID,
  DOCUMENT_B_ID,
  CLIENT_ID,
  CANDIDATE_ID,
  MISSION_ID,
  PROCESS_ID,
  INTERVIEW_ID,
];

const TIMESTAMP = '2026-09-15T10:00:00.000Z';

export const EMPTY_DISPLAY: DocumentContextDisplay = {
  client: null,
  candidate: null,
  mission: null,
  missionCandidate: null,
  interview: null,
};

function scopedId(documentId: string, suffix: string): string {
  return `${documentId.slice(0, 24)}${suffix}`;
}

export function syntheticVersion(
  documentId: string,
  versionNumber: number,
  overrides: Partial<DocumentVersion> = {},
): DocumentVersion {
  return {
    id: scopedId(documentId, `00000000000${versionNumber}`),
    documentId,
    versionNumber,
    filename: `synthetic-v${versionNumber}.pdf`,
    originalFilename: null,
    mimeType: 'application/pdf',
    sizeBytes: 2048 * versionNumber,
    checksumSha256: 'a'.repeat(64),
    outputFamily: 'PDF',
    source: 'UPLOADED',
    templateId: null,
    templateVersion: null,
    generationLanguage: null,
    status: 'ACTIVE',
    archivedAt: null,
    createdByUserId: ACTOR_ID,
    createdByDisplayName: 'Synthetic Operator',
    createdAt: TIMESTAMP,
    ...overrides,
  };
}

export function syntheticDocument(
  id: string,
  title: string,
  overrides: Partial<DocumentDetail> = {},
): DocumentDetail {
  const versions = overrides.versions ?? [syntheticVersion(id, 1)];
  const current = versions.reduce<DocumentVersion | null>(
    (latest, version) =>
      !latest || version.versionNumber > latest.versionNumber ? version : latest,
    null,
  );
  return {
    id,
    title,
    documentType: 'OTHER',
    visibility: 'INTERNAL_ONLY',
    status: 'ACTIVE',
    outputFamily: 'PDF',
    ownerUserId: ACTOR_ID,
    ownerDisplayName: 'Synthetic Owner',
    createdByUserId: ACTOR_ID,
    createdByDisplayName: 'Synthetic Operator',
    context: {},
    contextDisplay: EMPTY_DISPLAY,
    generatedSourceType: null,
    currentVersionId: current?.id ?? null,
    currentVersion: current
      ? {
          id: current.id,
          versionNumber: current.versionNumber,
          filename: current.filename,
          source: current.source,
        }
      : null,
    archivedAt: null,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    versions,
    ...overrides,
  };
}

export function summaryOf(document: DocumentDetail): DocumentSummary {
  const summary: Partial<DocumentDetail> = { ...document };
  delete summary.versions;
  return summary as DocumentSummary;
}

export function option(
  id: string,
  label: string,
  overrides: Partial<DocumentContextOption> = {},
): DocumentContextOption {
  return { id, label, detail: null, interview: null, ...overrides };
}

export function listPage(documents: DocumentDetail[], total = documents.length, page = 1) {
  return { documents: documents.map(summaryOf), pagination: { page, pageSize: 20, total } };
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function errorResponse(status: number, code: string): Response {
  return jsonResponse({ error: { code, message: 'Synthetic failure.' } }, status);
}

export interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

export function deferred<T = Response>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

export interface RecordedCall {
  authorization: string | null;
  body: Record<string, unknown> | null;
  method: string;
  path: string;
  search: URLSearchParams;
}

/**
 * Routes every `fetch` to `handler` by method and pathname. An unrouted
 * request rejects, so a test fails loudly on a read it did not expect.
 */
export function mockDocumentApi(
  handler: (call: RecordedCall) => Promise<Response> | Response | undefined,
): RecordedCall[] {
  const calls: RecordedCall[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    const rawBody = typeof init?.body === 'string' ? init.body : null;
    const call: RecordedCall = {
      authorization: new Headers(init?.headers).get('Authorization'),
      body: rawBody ? (JSON.parse(rawBody) as Record<string, unknown>) : null,
      method: init?.method ?? 'GET',
      path: url.pathname,
      search: url.searchParams,
    };
    calls.push(call);
    const response = handler(call);
    return response === undefined
      ? Promise.reject(new Error(`Unexpected request ${call.method} ${call.path}`))
      : Promise.resolve(response);
  });
  return calls;
}

export const FULL_ACCESS = [
  'documents:view',
  'documents:create',
  'documents:update',
  'documents:versions:create',
  'documents:archive',
  'documents:download',
  'clients:view',
  'candidates:view',
  'missions:view',
  'mission_candidates:view',
  'interviews:view',
];
