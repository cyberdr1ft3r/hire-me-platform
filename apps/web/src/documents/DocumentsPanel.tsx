import type {
  DocumentContextOptionKind,
  DocumentDetail,
  DocumentVersion,
} from '@hire-me/contracts';
import type { FormEvent } from 'react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import {
  addDocumentVersion,
  archiveDocument,
  createDocument,
  DocumentRequestError,
  downloadDocumentVersion,
  getDocument,
  listDocumentContextOptions,
  listDocuments,
  updateDocument,
} from '../api.js';
import { useI18n } from '../i18n/index.js';
import { resolveDocumentAccess } from './document-access.js';
import {
  DOCUMENT_LIST_PAGE_SIZE,
  documentFailureKey,
  EMPTY_DOCUMENT_FILTERS,
  EMPTY_REGISTER_VALUES,
  FIRST_DOCUMENT_PAGE,
  MAX_DOCUMENT_FILE_BYTES,
  metadataFrom,
  pageCount,
  registerProblem,
  toCreateRequest,
  toListParameters,
  toVersionInput,
  type DocumentDetailState,
  type DocumentFeedback,
  type DocumentListQuery,
  type DocumentListState,
  type DocumentPendingAction,
  type DocumentWriteAction,
  type MetadataValues,
} from './document-state.js';
import type { LoadDocumentOptions } from './DocumentOptionPicker.js';
import { DocumentsWorkspace } from './DocumentsWorkspace.js';

function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function DocumentsPanel({
  accessToken,
  permissions,
}: {
  accessToken: string;
  permissions: string[];
}) {
  const { t } = useI18n();
  const access = resolveDocumentAccess(permissions);

  const listRequest = useRef(0);
  const detailRequest = useRef(0);
  const contextGeneration = useRef(0);
  const writeInFlight = useRef(false);
  const selectedRef = useRef<string | null>(null);
  const appliedQueryRef = useRef<DocumentListQuery>(FIRST_DOCUMENT_PAGE);
  const sessionToken = useRef(accessToken);

  useLayoutEffect(() => {
    sessionToken.current = accessToken;
  }, [accessToken]);

  const principal = permissions.join(' ');
  const [session, setSession] = useState({ key: 0, principal, token: accessToken });

  const [filters, setFilters] = useState(EMPTY_DOCUMENT_FILTERS);
  const [appliedQuery, setAppliedQuery] = useState(FIRST_DOCUMENT_PAGE);
  const [list, setList] = useState<DocumentListState>({ status: 'loading' });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DocumentDetailState>({ status: 'idle' });
  const [metadata, setMetadata] = useState<MetadataValues | null>(null);
  const [versionFile, setVersionFile] = useState<File | null>(null);
  const [versionInputKey, setVersionInputKey] = useState(0);
  const [registerValues, setRegisterValues] = useState(EMPTY_REGISTER_VALUES);
  const [registerFormKey, setRegisterFormKey] = useState(0);
  const [focusToken, setFocusToken] = useState(0);
  const [feedback, setFeedback] = useState<DocumentFeedback | null>(null);
  const [pending, setPending] = useState<DocumentPendingAction | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);

  if (session.token !== accessToken || session.principal !== principal) {
    listRequest.current += 1;
    detailRequest.current += 1;
    contextGeneration.current += 1;
    selectedRef.current = null;
    appliedQueryRef.current = FIRST_DOCUMENT_PAGE;
    setSession({ key: session.key + 1, principal, token: accessToken });
    setFilters(EMPTY_DOCUMENT_FILTERS);
    setAppliedQuery(FIRST_DOCUMENT_PAGE);
    setList({ status: 'loading' });
    setSelectedId(null);
    setDetail({ status: 'idle' });
    setMetadata(null);
    setVersionFile(null);
    setRegisterValues(EMPTY_REGISTER_VALUES);
    setFeedback(null);
    setDownloading(null);
  }

  useEffect(() => {
    void loadList(appliedQuery);
    return () => {
      listRequest.current += 1;
    };
  }, [accessToken, appliedQuery]);

  function beginWrite(action: DocumentPendingAction): boolean {
    if (writeInFlight.current) {
      return false;
    }
    writeInFlight.current = true;
    setPending(action);
    return true;
  }

  function endWrite(): void {
    writeInFlight.current = false;
    setPending(null);
  }

  /** A response may only land on the document and session it was started for. */
  function captureContext(documentId: string | null): () => boolean {
    const generation = contextGeneration.current;
    const startedSession = sessionToken.current;
    return () =>
      contextGeneration.current === generation &&
      sessionToken.current === startedSession &&
      selectedRef.current === documentId;
  }

  function refreshListAfterWrite(startedSession: string): void {
    if (startedSession !== sessionToken.current) {
      return;
    }
    void loadList(appliedQueryRef.current, true);
  }

  function commitDetail(document: DocumentDetail, isCurrent: () => boolean): void {
    if (!isCurrent()) {
      return;
    }
    setDetail({ status: 'ready', document });
    setMetadata(metadataFrom(document));
  }

  function fail(error: unknown, action: DocumentWriteAction): void {
    setFeedback({ tone: 'danger', messageKey: documentFailureKey(error, action) });
  }

  async function loadList(query: DocumentListQuery, quiet = false): Promise<void> {
    const request = ++listRequest.current;
    if (!quiet) {
      setList({ status: 'loading' });
    }
    try {
      const response = await listDocuments({
        accessToken,
        page: query.page,
        pageSize: DOCUMENT_LIST_PAGE_SIZE,
        ...toListParameters(query.filters),
      });
      if (request !== listRequest.current) {
        return;
      }
      const { page, pageSize, total } = response.pagination;
      if (response.documents.length === 0 && total > 0 && page > 1) {
        const nextQuery = { ...query, page: Math.min(page - 1, pageCount(total, pageSize)) };
        appliedQueryRef.current = nextQuery;
        setAppliedQuery(nextQuery);
        return;
      }
      setList({ documents: response.documents, page, pageSize, status: 'ready', total });
    } catch {
      if (request === listRequest.current && !quiet) {
        setList({ status: 'error' });
      }
    }
  }

  async function loadDetail(documentId: string): Promise<void> {
    const isCurrent = captureContext(documentId);
    const request = ++detailRequest.current;
    setDetail({ status: 'loading' });
    try {
      const response = await getDocument(accessToken, documentId);
      if (request !== detailRequest.current) {
        return;
      }
      commitDetail(response.document, isCurrent);
    } catch (error) {
      if (request !== detailRequest.current || !isCurrent()) {
        return;
      }
      setDetail({
        status: error instanceof DocumentRequestError && error.status === 404 ? 'missing' : 'error',
      });
    }
  }

  function selectDocument(documentId: string): void {
    contextGeneration.current += 1;
    detailRequest.current += 1;
    selectedRef.current = documentId;
    setSelectedId(documentId);
    setVersionFile(null);
    setVersionInputKey((key) => key + 1);
    setFeedback(null);
    setFocusToken((token) => token + 1);
    void loadDetail(documentId);
  }

  function applyQuery(next: DocumentListQuery): void {
    appliedQueryRef.current = next;
    setAppliedQuery(next);
  }

  function loadOptions(
    kind: DocumentContextOptionKind,
    purpose: 'filter' | 'attach',
    missionCandidateId?: string,
  ): LoadDocumentOptions {
    return async (search) => {
      const response = await listDocumentContextOptions({
        accessToken,
        kind,
        missionCandidateId,
        purpose,
        search: search || undefined,
      });
      return response.options;
    };
  }

  async function handleRegister(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!access.canCreate || registerProblem(registerValues, access)) {
      return;
    }
    if (registerValues.file && registerValues.file.size > MAX_DOCUMENT_FILE_BYTES) {
      setFeedback({ tone: 'danger', messageKey: 'documents.feedback.failure.fileTooLarge' });
      return;
    }
    if (!beginWrite('register')) {
      return;
    }
    const isCurrent = captureContext(selectedRef.current);
    const startedSession = sessionToken.current;
    setFeedback(null);
    try {
      const created = await createDocument(accessToken, await toCreateRequest(registerValues));
      refreshListAfterWrite(startedSession);
      if (isCurrent()) {
        setRegisterValues(EMPTY_REGISTER_VALUES);
        setRegisterFormKey((key) => key + 1);
        contextGeneration.current += 1;
        detailRequest.current += 1;
        selectedRef.current = created.document.id;
        setSelectedId(created.document.id);
        setVersionFile(null);
        setVersionInputKey((key) => key + 1);
        setDetail({ status: 'ready', document: created.document });
        setMetadata(metadataFrom(created.document));
        setFocusToken((token) => token + 1);
        setFeedback({ tone: 'success', messageKey: 'documents.feedback.registered' });
      }
    } catch (error) {
      if (isCurrent()) {
        fail(error, 'register');
      }
    } finally {
      endWrite();
    }
  }

  async function handleSaveMetadata(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selectedId || !metadata || !access.canUpdate) {
      return;
    }
    const documentId = selectedId;
    if (!beginWrite('update')) {
      return;
    }
    const isCurrent = captureContext(documentId);
    const startedSession = sessionToken.current;
    setFeedback(null);
    try {
      const updated = await updateDocument(accessToken, documentId, {
        title: metadata.title.trim(),
        visibility: metadata.visibility,
      });
      refreshListAfterWrite(startedSession);
      if (isCurrent()) {
        commitDetail(updated.document, isCurrent);
        setFeedback({ tone: 'success', messageKey: 'documents.feedback.updated' });
      }
    } catch (error) {
      if (isCurrent()) {
        fail(error, 'update');
      }
    } finally {
      endWrite();
    }
  }

  async function handleAddVersion(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selectedId || !versionFile || !access.canAddVersion) {
      return;
    }
    if (versionFile.size > MAX_DOCUMENT_FILE_BYTES) {
      setFeedback({ tone: 'danger', messageKey: 'documents.feedback.failure.fileTooLarge' });
      return;
    }
    const documentId = selectedId;
    const file = versionFile;
    if (!beginWrite('addVersion')) {
      return;
    }
    const isCurrent = captureContext(documentId);
    const startedSession = sessionToken.current;
    setFeedback(null);
    try {
      const updated = await addDocumentVersion(accessToken, documentId, await toVersionInput(file));
      refreshListAfterWrite(startedSession);
      if (isCurrent()) {
        commitDetail(updated.document, isCurrent);
        setVersionFile(null);
        setVersionInputKey((key) => key + 1);
        setFeedback({ tone: 'success', messageKey: 'documents.feedback.versionAdded' });
      }
    } catch (error) {
      if (isCurrent()) {
        fail(error, 'addVersion');
      }
    } finally {
      endWrite();
    }
  }

  async function handleArchive(): Promise<void> {
    if (!selectedId || !access.canArchive || writeInFlight.current) {
      return;
    }
    const documentId = selectedId;
    if (!window.confirm(t('documents.archive.confirm'))) {
      return;
    }
    if (!beginWrite('archive')) {
      return;
    }
    const isCurrent = captureContext(documentId);
    const startedSession = sessionToken.current;
    setFeedback(null);
    try {
      const archived = await archiveDocument(accessToken, documentId);
      refreshListAfterWrite(startedSession);
      if (isCurrent()) {
        commitDetail(archived.document, isCurrent);
        setFeedback({ tone: 'success', messageKey: 'documents.feedback.archived' });
      }
    } catch (error) {
      if (isCurrent()) {
        fail(error, 'archive');
      }
    } finally {
      endWrite();
    }
  }

  async function handleDownload(version: DocumentVersion): Promise<void> {
    if (!selectedId || !access.canDownload || downloading) {
      return;
    }
    const documentId = selectedId;
    const startedSession = sessionToken.current;
    setDownloading(version.id);
    setFeedback(null);
    try {
      const blob = await downloadDocumentVersion(accessToken, documentId, version.id);
      if (startedSession !== sessionToken.current) {
        return;
      }
      saveBlob(blob, version.filename);
      if (selectedRef.current === documentId) {
        setFeedback({ tone: 'success', messageKey: 'documents.feedback.downloadStarted' });
      }
    } catch (error) {
      if (startedSession === sessionToken.current && selectedRef.current === documentId) {
        fail(error, 'download');
      }
    } finally {
      if (startedSession === sessionToken.current) {
        setDownloading(null);
      }
    }
  }

  return (
    <DocumentsWorkspace
      key={session.key}
      access={access}
      appliedFilters={appliedQuery.filters}
      detail={detail}
      downloading={downloading}
      feedback={feedback}
      filters={filters}
      focusToken={focusToken}
      list={list}
      loadOptions={loadOptions}
      metadata={metadata}
      onAddVersion={(event) => void handleAddVersion(event)}
      onApplyFilters={() => applyQuery({ filters, page: 1 })}
      onArchive={() => void handleArchive()}
      onDownload={(version) => void handleDownload(version)}
      onFiltersChange={setFilters}
      onMetadataChange={setMetadata}
      onPage={(page) => applyQuery({ ...appliedQueryRef.current, page })}
      onRegister={(event) => void handleRegister(event)}
      onRegisterValuesChange={setRegisterValues}
      onResetFilters={() => {
        setFilters(EMPTY_DOCUMENT_FILTERS);
        applyQuery(FIRST_DOCUMENT_PAGE);
      }}
      onRetryDetail={() => {
        if (selectedRef.current) {
          void loadDetail(selectedRef.current);
        }
      }}
      onRetryList={() => void loadList(appliedQueryRef.current)}
      onSaveMetadata={(event) => void handleSaveMetadata(event)}
      onSelect={selectDocument}
      onVersionFileChange={setVersionFile}
      registerFormKey={registerFormKey}
      registerValues={registerValues}
      selectedId={selectedId}
      sessionKey={session.key}
      versionFile={versionFile}
      versionInputKey={versionInputKey}
      writesLocked={pending !== null}
    />
  );
}
