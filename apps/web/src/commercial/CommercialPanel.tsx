import type {
  DocumentVersion,
  GeneratedVersionProvenance,
  GenerationLanguage,
  GenerationOutputFamily,
  MissionLifecycleState,
} from '@hire-me/contracts';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import {
  downloadDocumentVersion,
  listClients,
  listCommercialPlacementOptions,
  listDocumentVersions,
  listMissions,
} from '../api.js';
import type { MessageKey } from '../i18n/index.js';
import { resolveCommercialAccess, visibleKinds } from './commercial-access.js';
import {
  createCommercialRecord,
  fetchCommercialDetail,
  fetchCommercialList,
  generateCommercialDocument,
  runCommercialAction,
  type LifecycleInput,
} from './commercial-api.js';
import type {
  CommercialDetail,
  CommercialKind,
  CommercialSummary,
  LifecycleAction,
} from './commercial-kinds.js';
import {
  commercialFailureKey,
  EMPTY_LIST_FILTERS,
  FIRST_LIST_QUERY,
  followUpForm,
  emptyCreateForm,
  OPTION_LIMIT,
  SOURCE_STATUS,
  sourceOption,
  toListParameters,
  type CommercialFeedback,
  type CommercialListQuery,
  type CreateFormValues,
  type CreateRequest,
  type DetailState,
  type ListState,
  type LoadCommercialOptions,
} from './commercial-state.js';
import { CommercialWorkspace, type CommercialLoaders } from './CommercialWorkspace.js';

/** Which selection a response must still match before it may update the screen. */
type Scope = 'workspace' | 'record';

export type CommercialWriteAction = 'create' | 'lifecycle' | 'generate';

export type CreateDraft = { kind: CommercialKind; values: CreateFormValues; focusToken: number };

/** Missions that can no longer take new commercial records (mirrors the server block list). */
const CLOSED_MISSION_STATES: ReadonlySet<MissionLifecycleState> = new Set([
  'ARCHIVED',
  'CANCELED',
  'CLOSED_WITH_RECRUITMENT',
  'CLOSED_WITHOUT_RECRUITMENT',
  'DEADLINE_EXPIRED_WITHOUT_RENEWAL',
]);

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

/** Bounded, per-request idempotency key. Regeneration deliberately uses a new key. */
function generationIdempotencyKey(): string {
  const random = globalThis.crypto?.randomUUID?.();
  return random ?? `gen-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function pageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

const ACTION_SUCCESS: Record<LifecycleAction, MessageKey> = {
  accept: 'commercial.feedback.accepted',
  activate: 'commercial.feedback.activated',
  archive: 'commercial.feedback.archived',
  cancel: 'commercial.feedback.canceled',
  complete: 'commercial.feedback.completed',
  expire: 'commercial.feedback.expired',
  issue: 'commercial.feedback.issued',
  receive: 'commercial.feedback.received',
  reject: 'commercial.feedback.rejected',
};

const CREATE_SUCCESS: Record<CommercialKind, MessageKey> = {
  contract: 'commercial.feedback.created.contract',
  invoice: 'commercial.feedback.created.invoice',
  purchaseOrder: 'commercial.feedback.created.purchaseOrder',
  quotation: 'commercial.feedback.created.quotation',
};

export function CommercialPanel({
  accessToken,
  actorUserId,
  permissions,
}: {
  accessToken: string;
  actorUserId: string;
  permissions: string[];
}) {
  const access = resolveCommercialAccess(permissions);
  const kinds = visibleKinds(access);
  const defaultKind = kinds[0] ?? 'quotation';

  const listRequest = useRef(0);
  const detailRequest = useRef(0);
  const recordGeneration = useRef(0);
  const writeOwner = useRef<number | null>(null);
  const writeSequence = useRef(0);
  const kindRef = useRef<CommercialKind>(defaultKind);
  const selectedRef = useRef<string | null>(null);
  const queryRef = useRef<CommercialListQuery>(FIRST_LIST_QUERY);
  // A different token or permission set is a different session: nothing from
  // the previous one may be shown, reused, or completed into this one.
  const principal = `${actorUserId} ${permissions.join(' ')}`;
  const sessionToken = useRef(accessToken);
  const sessionIdentity = useRef(`${accessToken}\n${principal}`);

  useLayoutEffect(() => {
    sessionToken.current = accessToken;
    sessionIdentity.current = `${accessToken}\n${principal}`;
  }, [accessToken, principal]);
  const [session, setSession] = useState({ key: 0, principal, token: accessToken });

  const [kind, setKind] = useState<CommercialKind>(defaultKind);
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);
  const [query, setQuery] = useState(FIRST_LIST_QUERY);
  const [list, setList] = useState<ListState<CommercialSummary>>({
    status: kinds.length ? 'loading' : 'idle',
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailState<CommercialDetail>>({ status: 'idle' });
  const [focusToken, setFocusToken] = useState(0);
  const [draft, setDraft] = useState<CreateDraft | null>(null);
  const [feedback, setFeedback] = useState<CommercialFeedback | null>(null);
  const [pending, setPending] = useState<CommercialWriteAction | null>(null);

  if (session.token !== accessToken || session.principal !== principal) {
    listRequest.current += 1;
    detailRequest.current += 1;
    recordGeneration.current += 1;
    writeOwner.current = null;
    kindRef.current = defaultKind;
    selectedRef.current = null;
    queryRef.current = FIRST_LIST_QUERY;
    setSession({ key: session.key + 1, principal, token: accessToken });
    setKind(defaultKind);
    setFilters(EMPTY_LIST_FILTERS);
    setQuery(FIRST_LIST_QUERY);
    setList({ status: kinds.length ? 'loading' : 'idle' });
    setSelectedId(null);
    setDetail({ status: 'idle' });
    setDraft(null);
    setFeedback(null);
    setPending(null);
  }

  const kindVisible = access.view[kind];

  useEffect(() => {
    if (!kindVisible) return;
    void loadList(kind, query);
    return () => {
      listRequest.current += 1;
    };
  }, [accessToken, principal, kind, kindVisible, query]);

  // ---------------------------------------------------------------------------
  // Context and write lock
  // ---------------------------------------------------------------------------

  function captureContext(scope: Scope): () => boolean {
    const startedIdentity = sessionIdentity.current;
    const startedKind = kindRef.current;
    const record = recordGeneration.current;
    return () =>
      sessionIdentity.current === startedIdentity &&
      (scope === 'workspace' ||
        (kindRef.current === startedKind && recordGeneration.current === record));
  }

  function beginWrite(action: CommercialWriteAction): number | null {
    if (writeOwner.current !== null) return null;
    const owner = ++writeSequence.current;
    writeOwner.current = owner;
    setPending(action);
    return owner;
  }

  function endWrite(owner: number): void {
    // A write from a replaced session no longer owns the lock and must not release it.
    if (writeOwner.current !== owner) return;
    writeOwner.current = null;
    setPending(null);
  }

  // ---------------------------------------------------------------------------
  // Reads
  // ---------------------------------------------------------------------------

  async function loadList(
    forKind: CommercialKind,
    forQuery: CommercialListQuery,
    quiet = false,
  ): Promise<void> {
    const request = ++listRequest.current;
    const isCurrent = captureContext('workspace');
    if (!quiet) setList({ status: 'loading' });
    try {
      const page = await fetchCommercialList(
        sessionToken.current,
        forKind,
        toListParameters(forQuery),
      );
      if (request !== listRequest.current || !isCurrent() || kindRef.current !== forKind) return;
      if (page.items.length === 0 && page.total > 0 && page.page > 1) {
        applyQuery({
          ...forQuery,
          page: Math.min(page.page - 1, pageCount(page.total, page.pageSize)),
        });
        return;
      }
      setList({ status: 'ready', ...page });
    } catch {
      if (request === listRequest.current && isCurrent() && !quiet) setList({ status: 'error' });
    }
  }

  async function loadDetail(forKind: CommercialKind, id: string): Promise<void> {
    const request = ++detailRequest.current;
    const isCurrent = captureContext('record');
    setDetail({ status: 'loading' });
    try {
      const next = await fetchCommercialDetail(sessionToken.current, forKind, id);
      if (request !== detailRequest.current || !isCurrent() || selectedRef.current !== id) return;
      setDetail({ status: 'ready', detail: next });
    } catch (error) {
      if (request !== detailRequest.current || !isCurrent() || selectedRef.current !== id) return;
      setDetail({ status: 'error', messageKey: commercialFailureKey(error) });
    }
  }

  // ---------------------------------------------------------------------------
  // Queries and selection
  // ---------------------------------------------------------------------------

  function applyQuery(next: CommercialListQuery): void {
    queryRef.current = next;
    setQuery(next);
  }

  function clearSelection(): void {
    recordGeneration.current += 1;
    detailRequest.current += 1;
    selectedRef.current = null;
    setSelectedId(null);
    setDetail({ status: 'idle' });
  }

  function selectKind(next: CommercialKind): void {
    if (next === kindRef.current || !access.view[next]) return;
    listRequest.current += 1;
    kindRef.current = next;
    clearSelection();
    setKind(next);
    setFilters(EMPTY_LIST_FILTERS);
    applyQuery(FIRST_LIST_QUERY);
    setList({ status: 'loading' });
    setFeedback(null);
  }

  function selectRecord(summary: CommercialSummary): void {
    clearSelection();
    selectedRef.current = summary.id;
    setSelectedId(summary.id);
    setFocusToken((token) => token + 1);
    setFeedback(null);
    void loadDetail(kindRef.current, summary.id);
  }

  function showCreated(created: CommercialDetail): void {
    if (created.kind !== kindRef.current) {
      listRequest.current += 1;
      kindRef.current = created.kind;
      setKind(created.kind);
      setFilters(EMPTY_LIST_FILTERS);
      applyQuery(FIRST_LIST_QUERY);
      setList({ status: 'loading' });
    } else {
      void loadList(created.kind, queryRef.current, true);
    }
    clearSelection();
    selectedRef.current = created.record.id;
    setSelectedId(created.record.id);
    setDetail({ status: 'ready', detail: created });
    setFocusToken((token) => token + 1);
  }

  // ---------------------------------------------------------------------------
  // Option sources (D-079; IDs never leave the picker)
  // ---------------------------------------------------------------------------

  const loadClients: LoadCommercialOptions = async (search) => {
    const response = await listClients({
      accessToken: sessionToken.current,
      pageSize: OPTION_LIMIT,
      search: search || undefined,
    });
    return response.clients
      .filter((client) => client.status !== 'ARCHIVED' && client.archivedAt === null)
      .map((client) => ({ id: client.id, label: client.name, detail: client.city }));
  };

  const loadMissions =
    (clientId: string): LoadCommercialOptions =>
    async (search) => {
      const response = await listMissions({
        accessToken: sessionToken.current,
        // Without transfer the Commercial mission scope is the actor's own active assignments.
        assigneeUserId: access.missionsAssignedOnly ? actorUserId : undefined,
        clientId,
        pageSize: OPTION_LIMIT,
        search: search || undefined,
      });
      return response.missions
        .filter(
          (mission) => mission.archivedAt === null && !CLOSED_MISSION_STATES.has(mission.state),
        )
        .map((mission) => ({
          id: mission.id,
          label: mission.title,
          detail: null,
          context: {
            currency: null,
            missionTitle: mission.title,
            recruitmentMissionId: mission.id,
          },
        }));
    };

  const loadSources =
    (source: 'quotation' | 'contract' | 'purchaseOrder', clientId: string): LoadCommercialOptions =>
    async (search) => {
      const page = await fetchCommercialList(sessionToken.current, source, {
        clientId,
        page: 1,
        pageSize: OPTION_LIMIT,
        status: SOURCE_STATUS[source],
        ...(search ? { reference: search.slice(0, 80) } : {}),
      });
      return page.items.map(sourceOption);
    };

  const loadPlacements =
    (clientId: string, recruitmentMissionId: string | null): LoadCommercialOptions =>
    async (search) => {
      const response = await listCommercialPlacementOptions(sessionToken.current, {
        clientId,
        ...(recruitmentMissionId ? { recruitmentMissionId } : {}),
        ...(search ? { search } : {}),
      });
      return response.options.map((option) => ({
        id: option.id,
        label: option.missionTitle,
        detail: null,
        context: {
          currency: null,
          missionTitle: option.missionTitle,
          recruitmentMissionId: option.recruitmentMissionId,
        },
        placement: {
          confirmedAt: option.confirmedAt,
          integrationStartDate: option.integrationStartDate,
        },
      }));
    };

  const loaders: CommercialLoaders = {
    clients: loadClients,
    missions: loadMissions,
    placements: loadPlacements,
    sources: loadSources,
  };

  // ---------------------------------------------------------------------------
  // Writes
  // ---------------------------------------------------------------------------

  async function createRecord(request: CreateRequest): Promise<boolean> {
    const owner = beginWrite('create');
    if (owner === null) return false;
    const isCurrent = captureContext('workspace');
    setFeedback(null);
    try {
      const created = await createCommercialRecord(sessionToken.current, request);
      if (!isCurrent()) return false;
      setDraft(null);
      showCreated(created);
      setFeedback({ tone: 'success', messageKey: CREATE_SUCCESS[created.kind] });
      return true;
    } catch (error) {
      if (isCurrent()) setFeedback({ tone: 'danger', messageKey: commercialFailureKey(error) });
      return false;
    } finally {
      endWrite(owner);
    }
  }

  async function runAction(action: LifecycleAction, input: LifecycleInput): Promise<boolean> {
    if (detail.status !== 'ready') return false;
    const { kind: recordKind, record } = detail.detail;
    if (!access.manage[recordKind]) return false;
    const owner = beginWrite('lifecycle');
    if (owner === null) return false;
    const isCurrent = captureContext('record');
    const sameSession = captureContext('workspace');
    setFeedback(null);
    try {
      const next = await runCommercialAction(
        sessionToken.current,
        recordKind,
        record.id,
        action,
        input,
      );
      if (sameSession() && kindRef.current === recordKind) {
        void loadList(recordKind, queryRef.current, true);
      }
      if (!isCurrent() || selectedRef.current !== record.id) return false;
      setDetail({ status: 'ready', detail: next });
      setFeedback({ tone: 'success', messageKey: ACTION_SUCCESS[action] });
      return true;
    } catch (error) {
      if (!isCurrent() || selectedRef.current !== record.id) return false;
      setFeedback({ tone: 'danger', messageKey: commercialFailureKey(error) });
      // A conflict means the record moved on; show its current state.
      void refreshDetail(recordKind, record.id);
      return false;
    } finally {
      endWrite(owner);
    }
  }

  async function refreshDetail(forKind: CommercialKind, id: string): Promise<void> {
    const request = ++detailRequest.current;
    const isCurrent = captureContext('record');
    try {
      const next = await fetchCommercialDetail(sessionToken.current, forKind, id);
      if (request !== detailRequest.current || !isCurrent() || selectedRef.current !== id) return;
      setDetail({ status: 'ready', detail: next });
    } catch {
      // The visible record stays; the failure message is already shown.
    }
  }

  async function generate(
    outputFamily: GenerationOutputFamily,
    language: GenerationLanguage,
  ): Promise<GeneratedVersionProvenance | null> {
    if (detail.status !== 'ready') return null;
    const { kind: recordKind, record } = detail.detail;
    const owner = beginWrite('generate');
    if (owner === null) return null;
    const isCurrent = captureContext('record');
    setFeedback(null);
    try {
      const result = await generateCommercialDocument(sessionToken.current, recordKind, record.id, {
        idempotencyKey: generationIdempotencyKey(),
        language,
        outputFamily,
      });
      if (!isCurrent() || selectedRef.current !== record.id) return null;
      setFeedback({ tone: 'success', messageKey: 'commercial.feedback.generated' });
      return result.generated;
    } catch {
      if (isCurrent()) {
        setFeedback({ tone: 'danger', messageKey: 'commercial.feedback.failure.generation' });
      }
      return null;
    } finally {
      endWrite(owner);
    }
  }

  async function loadVersions(documentId: string): Promise<DocumentVersion[] | null> {
    const isCurrent = captureContext('record');
    try {
      const response = await listDocumentVersions(sessionToken.current, documentId);
      return isCurrent() ? response.versions : null;
    } catch {
      return null;
    }
  }

  function download(documentId: string, version: { id: string; filename: string }): void {
    const isCurrent = captureContext('record');
    void downloadDocumentVersion(sessionToken.current, documentId, version.id)
      .then((blob) => {
        if (!isCurrent()) return;
        saveBlob(blob, version.filename);
        setFeedback({ tone: 'success', messageKey: 'commercial.feedback.downloadStarted' });
      })
      .catch(() => {
        if (isCurrent()) {
          setFeedback({ tone: 'danger', messageKey: 'commercial.feedback.failure.download' });
        }
      });
  }

  function openCreate(target: CommercialKind, from?: CommercialDetail): void {
    if (!access.manage[target]) return;
    setFeedback(null);
    setDraft((current) => ({
      focusToken: (current?.focusToken ?? 0) + 1,
      kind: target,
      values: from ? followUpForm(from) : emptyCreateForm(),
    }));
  }

  return (
    <CommercialWorkspace
      access={access}
      create={{
        draft,
        onCancel: () => setDraft(null),
        onChange: (values) => setDraft((current) => (current ? { ...current, values } : current)),
        onOpen: openCreate,
        onSubmit: createRecord,
      }}
      detail={{
        focusToken,
        state: detail,
        generation: { onDownload: download, onGenerate: generate, onLoadVersions: loadVersions },
        onAction: runAction,
        onRetry: () => {
          const id = selectedRef.current;
          if (id) void loadDetail(kindRef.current, id);
        },
      }}
      feedback={feedback}
      key={session.key}
      kind={kind}
      kinds={kinds}
      list={{
        appliedFilters: query.filters,
        filters,
        state: list,
        selectedId,
        onApply: () => {
          clearSelection();
          applyQuery({ filters, page: 1 });
        },
        onFiltersChange: setFilters,
        onPage: (page) => applyQuery({ ...queryRef.current, page }),
        onReset: () => {
          clearSelection();
          setFilters(EMPTY_LIST_FILTERS);
          applyQuery(FIRST_LIST_QUERY);
        },
        onRetry: () => void loadList(kindRef.current, queryRef.current),
        onSelect: selectRecord,
      }}
      loaders={loaders}
      onKind={selectKind}
      pending={pending}
      sessionKey={session.key}
    />
  );
}
