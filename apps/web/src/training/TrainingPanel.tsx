import type {
  DocumentVersion,
  GeneratedVersionProvenance,
  GenerationLanguage,
  GenerationOutputFamily,
  TrainingCertificateStatus,
  TrainingEnrollmentStatus,
  TrainingEnrollmentSummary,
  TrainingParticipantType,
  TrainingParticipationSummary,
  TrainingProgramStatus,
  TrainingProgramSummary,
  TrainingSessionStatus,
  TrainingSessionSummary,
} from '@hire-me/contracts';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import {
  archiveTrainingEnrollment,
  archiveTrainingParticipation,
  archiveTrainingProgram,
  archiveTrainingSession,
  cancelTrainingSession,
  correctTrainingAttendance,
  createTrainingEnrollment,
  createTrainingParticipation,
  createTrainingProgram,
  createTrainingSession,
  downloadDocumentVersion,
  generateTrainingCertificateDocument,
  listCandidates,
  listClientContacts,
  listClients,
  listDocumentVersions,
  listTrainingEnrollmentOptions,
  listTrainingEnrollments,
  listTrainingEnrollmentUserOptions,
  listTrainingParticipations,
  listTrainingProgramOwnerUserOptions,
  listTrainingPrograms,
  listTrainingSessions,
  listTrainingSessionTrainerUserOptions,
  rescheduleTrainingSession,
  updateTrainingAttendance,
  updateTrainingEnrollmentCertificateStatus,
  updateTrainingEnrollmentStatus,
  updateTrainingProgram,
  updateTrainingProgramStatus,
  updateTrainingSession,
  updateTrainingSessionStatus,
  withdrawTrainingEnrollment,
} from '../api.js';
import { useI18n, type MessageKey } from '../i18n/index.js';
import { localInputToIso } from '../tasks/task-datetime.js';
import { resolveTrainingAccess } from './training-access.js';
import {
  EMPTY_PROGRAM_FILTERS,
  EMPTY_SESSION_FILTERS,
  ENROLLMENT_PAGE_SIZE,
  FIRST_ENROLLMENT_PAGE,
  FIRST_PARTICIPATION_PAGE,
  FIRST_PROGRAM_PAGE,
  FIRST_SESSION_PAGE,
  pageCount,
  PARTICIPATION_PAGE_SIZE,
  PROGRAM_PAGE_SIZE,
  SESSION_PAGE_SIZE,
  toEnrollmentListParameters,
  toParticipationListParameters,
  toProgramCreateRequest,
  toProgramListParameters,
  toProgramUpdateRequest,
  toSessionCreateRequest,
  toSessionListParameters,
  toSessionUpdateRequest,
  trainingFailureKey,
  type EnrollmentListQuery,
  type ListState,
  type LoadTrainingOptions,
  type ParticipationListQuery,
  type ProgramFormValues,
  type ProgramListQuery,
  type SessionFormValues,
  type SessionListQuery,
  type TrainingFeedback,
  type TrainingPickerOption,
  type TrainingWriteAction,
} from './training-state.js';
import type { AttendanceValues } from './TrainingParticipation.js';
import type { RescheduleValues } from './TrainingSessionDetail.js';
import { TrainingWorkspace } from './TrainingWorkspace.js';

/** Which selection a response must still match before it may update the screen. */
type Scope = 'workspace' | 'program' | 'session';

type Paged<Item> = { items: Item[]; page: number; pageSize: number; total: number };

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

function optional(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function userOptions(users: { id: string; displayName: string; email: string }[]) {
  return users.map((user) => ({ id: user.id, label: user.displayName, detail: user.email }));
}

export function TrainingPanel({
  accessToken,
  actorUserId,
  permissions,
}: {
  accessToken: string;
  actorUserId: string;
  permissions: string[];
}) {
  const { t } = useI18n();
  const access = resolveTrainingAccess(permissions);

  const programRequest = useRef(0);
  const sessionRequest = useRef(0);
  const enrollmentRequest = useRef(0);
  const participationRequest = useRef(0);
  const programGeneration = useRef(0);
  const sessionGeneration = useRef(0);
  const writeOwner = useRef<number | null>(null);
  const writeSequence = useRef(0);
  const selectedProgramRef = useRef<string | null>(null);
  const selectedSessionRef = useRef<string | null>(null);
  const programQueryRef = useRef<ProgramListQuery>(FIRST_PROGRAM_PAGE);
  const sessionQueryRef = useRef<SessionListQuery>(FIRST_SESSION_PAGE);
  const enrollmentQueryRef = useRef<EnrollmentListQuery>(FIRST_ENROLLMENT_PAGE);
  const participationQueryRef = useRef<ParticipationListQuery>(FIRST_PARTICIPATION_PAGE);
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

  const [programFilters, setProgramFilters] = useState(EMPTY_PROGRAM_FILTERS);
  const [programQuery, setProgramQuery] = useState(FIRST_PROGRAM_PAGE);
  const [programList, setProgramList] = useState<ListState<TrainingProgramSummary>>({
    status: 'loading',
  });
  const [selectedProgram, setSelectedProgram] = useState<TrainingProgramSummary | null>(null);
  const [programFocus, setProgramFocus] = useState(0);

  const [sessionFilters, setSessionFilters] = useState(EMPTY_SESSION_FILTERS);
  const [sessionQuery, setSessionQuery] = useState(FIRST_SESSION_PAGE);
  const [sessionList, setSessionList] = useState<ListState<TrainingSessionSummary>>({
    status: 'idle',
  });
  const [selectedSession, setSelectedSession] = useState<TrainingSessionSummary | null>(null);
  const [sessionFocus, setSessionFocus] = useState(0);

  const [enrollmentQuery, setEnrollmentQuery] = useState(FIRST_ENROLLMENT_PAGE);
  const [enrollmentList, setEnrollmentList] = useState<ListState<TrainingEnrollmentSummary>>({
    status: 'idle',
  });
  const [selectedEnrollmentId, setSelectedEnrollmentId] = useState<string | null>(null);

  const [participationQuery, setParticipationQuery] = useState(FIRST_PARTICIPATION_PAGE);
  const [participationList, setParticipationList] = useState<
    ListState<TrainingParticipationSummary>
  >({ status: 'idle' });
  const [selectedParticipationId, setSelectedParticipationId] = useState<string | null>(null);

  const [feedback, setFeedback] = useState<TrainingFeedback | null>(null);
  const [pending, setPending] = useState<TrainingWriteAction | null>(null);

  if (session.token !== accessToken || session.principal !== principal) {
    programRequest.current += 1;
    sessionRequest.current += 1;
    enrollmentRequest.current += 1;
    participationRequest.current += 1;
    programGeneration.current += 1;
    sessionGeneration.current += 1;
    writeOwner.current = null;
    selectedProgramRef.current = null;
    selectedSessionRef.current = null;
    programQueryRef.current = FIRST_PROGRAM_PAGE;
    sessionQueryRef.current = FIRST_SESSION_PAGE;
    enrollmentQueryRef.current = FIRST_ENROLLMENT_PAGE;
    participationQueryRef.current = FIRST_PARTICIPATION_PAGE;
    setSession({ key: session.key + 1, principal, token: accessToken });
    setProgramFilters(EMPTY_PROGRAM_FILTERS);
    setProgramQuery(FIRST_PROGRAM_PAGE);
    setProgramList({ status: 'loading' });
    setSelectedProgram(null);
    setSessionFilters(EMPTY_SESSION_FILTERS);
    setSessionQuery(FIRST_SESSION_PAGE);
    setSessionList({ status: 'idle' });
    setSelectedSession(null);
    setEnrollmentQuery(FIRST_ENROLLMENT_PAGE);
    setEnrollmentList({ status: 'idle' });
    setSelectedEnrollmentId(null);
    setParticipationQuery(FIRST_PARTICIPATION_PAGE);
    setParticipationList({ status: 'idle' });
    setSelectedParticipationId(null);
    setFeedback(null);
    setPending(null);
  }

  const selectedProgramId = selectedProgram?.id ?? null;
  const selectedSessionId = selectedSession?.id ?? null;

  useEffect(() => {
    void loadPrograms(programQuery);
    return () => {
      programRequest.current += 1;
    };
  }, [accessToken, principal, programQuery]);

  useEffect(() => {
    if (!selectedProgramId || !access.viewSessions) return;
    void loadSessions(selectedProgramId, sessionQuery);
    return () => {
      sessionRequest.current += 1;
    };
  }, [accessToken, principal, selectedProgramId, sessionQuery]);

  useEffect(() => {
    if (!selectedProgramId || !access.viewEnrollments) return;
    void loadEnrollments(selectedProgramId, enrollmentQuery);
    return () => {
      enrollmentRequest.current += 1;
    };
  }, [accessToken, principal, selectedProgramId, enrollmentQuery]);

  useEffect(() => {
    if (!selectedProgramId || !selectedSessionId || !access.viewParticipation) return;
    void loadParticipations(selectedProgramId, selectedSessionId, participationQuery);
    return () => {
      participationRequest.current += 1;
    };
  }, [accessToken, principal, selectedProgramId, selectedSessionId, participationQuery]);

  // ---------------------------------------------------------------------------
  // Context and write lock
  // ---------------------------------------------------------------------------

  function captureContext(scope: Scope): () => boolean {
    const startedIdentity = sessionIdentity.current;
    const program = programGeneration.current;
    const sessionGen = sessionGeneration.current;
    return () =>
      sessionIdentity.current === startedIdentity &&
      (scope === 'workspace' || programGeneration.current === program) &&
      (scope !== 'session' || sessionGeneration.current === sessionGen);
  }

  function beginWrite(action: TrainingWriteAction): number | null {
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

  async function runWrite<Result>(
    action: TrainingWriteAction,
    scope: Scope,
    perform: () => Promise<Result>,
    options: {
      success: MessageKey;
      apply: (result: Result) => void;
      refresh: () => void;
    },
  ): Promise<boolean> {
    const owner = beginWrite(action);
    if (owner === null) return false;
    const isCurrent = captureContext(scope);
    const sameSession = captureContext('workspace');
    setFeedback(null);
    try {
      const result = await perform();
      if (sameSession()) void loadPrograms(programQueryRef.current, true);
      if (!isCurrent()) return false;
      options.apply(result);
      options.refresh();
      setFeedback({ tone: 'success', messageKey: options.success });
      return true;
    } catch (error) {
      if (!isCurrent()) return false;
      setFeedback({ tone: 'danger', messageKey: trainingFailureKey(error) });
      // A conflict means the record moved on; show its current state.
      options.refresh();
      return false;
    } finally {
      endWrite(owner);
    }
  }

  // ---------------------------------------------------------------------------
  // Reads
  // ---------------------------------------------------------------------------

  async function loadPaged<Item>(
    counter: { current: number },
    fetchPage: () => Promise<Paged<Item>>,
    isCurrent: () => boolean,
    setList: (state: ListState<Item>) => void,
    onEmptyPage: (page: number) => void,
    quiet: boolean,
  ): Promise<Item[] | null> {
    const request = ++counter.current;
    if (!quiet) setList({ status: 'loading' });
    try {
      const { items, page, pageSize, total } = await fetchPage();
      if (request !== counter.current || !isCurrent()) return null;
      if (items.length === 0 && total > 0 && page > 1) {
        onEmptyPage(Math.min(page - 1, pageCount(total, pageSize)));
        return null;
      }
      setList({ status: 'ready', items, page, pageSize, total });
      return items;
    } catch {
      if (request === counter.current && isCurrent() && !quiet) setList({ status: 'error' });
      return null;
    }
  }

  async function loadPrograms(query: ProgramListQuery, quiet = false): Promise<void> {
    const items = await loadPaged(
      programRequest,
      async () => {
        const response = await listTrainingPrograms({
          accessToken: sessionToken.current,
          page: query.page,
          pageSize: PROGRAM_PAGE_SIZE,
          ...toProgramListParameters(query.filters, actorUserId),
        });
        return { items: response.programs, ...response.pagination };
      },
      captureContext('workspace'),
      setProgramList,
      (page) => applyProgramQuery({ ...query, page }),
      quiet,
    );
    const current = items?.find((program) => program.id === selectedProgramRef.current);
    if (current) setSelectedProgram(current);
  }

  async function loadSessions(
    programId: string,
    query: SessionListQuery,
    quiet = false,
  ): Promise<void> {
    const isCurrent = captureContext('program');
    const items = await loadPaged(
      sessionRequest,
      async () => {
        const response = await listTrainingSessions({
          accessToken: sessionToken.current,
          programId,
          page: query.page,
          pageSize: SESSION_PAGE_SIZE,
          ...toSessionListParameters(query.filters, actorUserId),
        });
        return { items: response.sessions, ...response.pagination };
      },
      () => isCurrent() && selectedProgramRef.current === programId,
      setSessionList,
      (page) => applySessionQuery({ ...query, page }),
      quiet,
    );
    const current = items?.find((item) => item.id === selectedSessionRef.current);
    if (current) setSelectedSession(current);
  }

  async function loadEnrollments(
    programId: string,
    query: EnrollmentListQuery,
    quiet = false,
  ): Promise<void> {
    const isCurrent = captureContext('program');
    await loadPaged(
      enrollmentRequest,
      async () => {
        const response = await listTrainingEnrollments({
          accessToken: sessionToken.current,
          programId,
          page: query.page,
          pageSize: ENROLLMENT_PAGE_SIZE,
          ...toEnrollmentListParameters(query.filters),
        });
        return { items: response.enrollments, ...response.pagination };
      },
      () => isCurrent() && selectedProgramRef.current === programId,
      setEnrollmentList,
      (page) => applyEnrollmentQuery({ ...query, page }),
      quiet,
    );
  }

  async function loadParticipations(
    programId: string,
    sessionId: string,
    query: ParticipationListQuery,
    quiet = false,
  ): Promise<void> {
    const isCurrent = captureContext('session');
    await loadPaged(
      participationRequest,
      async () => {
        const response = await listTrainingParticipations({
          accessToken: sessionToken.current,
          programId,
          sessionId,
          page: query.page,
          pageSize: PARTICIPATION_PAGE_SIZE,
          ...toParticipationListParameters(query.filters),
        });
        return { items: response.participations, ...response.pagination };
      },
      () =>
        isCurrent() &&
        selectedProgramRef.current === programId &&
        selectedSessionRef.current === sessionId,
      setParticipationList,
      (page) => applyParticipationQuery({ ...query, page }),
      quiet,
    );
  }

  function refreshSessions(): void {
    const programId = selectedProgramRef.current;
    if (programId && access.viewSessions)
      void loadSessions(programId, sessionQueryRef.current, true);
  }

  function refreshEnrollments(): void {
    const programId = selectedProgramRef.current;
    if (programId && access.viewEnrollments) {
      void loadEnrollments(programId, enrollmentQueryRef.current, true);
    }
  }

  function refreshParticipations(): void {
    const programId = selectedProgramRef.current;
    const sessionId = selectedSessionRef.current;
    if (programId && sessionId && access.viewParticipation) {
      void loadParticipations(programId, sessionId, participationQueryRef.current, true);
    }
  }

  // ---------------------------------------------------------------------------
  // Queries and selection
  // ---------------------------------------------------------------------------

  function applyProgramQuery(next: ProgramListQuery): void {
    programQueryRef.current = next;
    setProgramQuery(next);
  }

  function applySessionQuery(next: SessionListQuery): void {
    sessionQueryRef.current = next;
    setSessionQuery(next);
  }

  function applyEnrollmentQuery(next: EnrollmentListQuery): void {
    enrollmentQueryRef.current = next;
    setEnrollmentQuery(next);
  }

  function applyParticipationQuery(next: ParticipationListQuery): void {
    participationQueryRef.current = next;
    setParticipationQuery(next);
  }

  function clearSession(): void {
    sessionGeneration.current += 1;
    participationRequest.current += 1;
    selectedSessionRef.current = null;
    setSelectedSession(null);
    participationQueryRef.current = FIRST_PARTICIPATION_PAGE;
    setParticipationQuery(FIRST_PARTICIPATION_PAGE);
    setParticipationList({ status: 'idle' });
    setSelectedParticipationId(null);
  }

  function selectProgram(program: TrainingProgramSummary): void {
    programGeneration.current += 1;
    sessionRequest.current += 1;
    enrollmentRequest.current += 1;
    selectedProgramRef.current = program.id;
    setSelectedProgram(program);
    setProgramFocus((token) => token + 1);
    setFeedback(null);
    setSessionFilters(EMPTY_SESSION_FILTERS);
    sessionQueryRef.current = FIRST_SESSION_PAGE;
    setSessionQuery(FIRST_SESSION_PAGE);
    setSessionList({ status: access.viewSessions ? 'loading' : 'idle' });
    enrollmentQueryRef.current = FIRST_ENROLLMENT_PAGE;
    setEnrollmentQuery(FIRST_ENROLLMENT_PAGE);
    setEnrollmentList({ status: access.viewEnrollments ? 'loading' : 'idle' });
    setSelectedEnrollmentId(null);
    clearSession();
  }

  function selectSession(next: TrainingSessionSummary): void {
    clearSession();
    selectedSessionRef.current = next.id;
    setSelectedSession(next);
    setParticipationList({ status: access.viewParticipation ? 'loading' : 'idle' });
    setSessionFocus((token) => token + 1);
    setFeedback(null);
  }

  // ---------------------------------------------------------------------------
  // Option sources (D-073 and source-domain lists; IDs never leave the picker)
  // ---------------------------------------------------------------------------

  const loadOwners: LoadTrainingOptions = async (search) =>
    userOptions(
      (
        await listTrainingProgramOwnerUserOptions(sessionToken.current, {
          search: search || undefined,
        })
      ).users,
    );

  const loadTrainers: LoadTrainingOptions = async (search) => {
    const programId = selectedProgramRef.current;
    if (!programId) return [];
    return userOptions(
      (
        await listTrainingSessionTrainerUserOptions(sessionToken.current, programId, {
          search: search || undefined,
        })
      ).users,
    );
  };

  const loadEnrollmentUsers: LoadTrainingOptions = async (search) => {
    const programId = selectedProgramRef.current;
    if (!programId) return [];
    return userOptions(
      (
        await listTrainingEnrollmentUserOptions(sessionToken.current, programId, {
          search: search || undefined,
        })
      ).users,
    );
  };

  const loadClients: LoadTrainingOptions = async (search) => {
    const response = await listClients({
      accessToken: sessionToken.current,
      pageSize: 20,
      search: search || undefined,
    });
    return response.clients
      .filter((client) => client.status !== 'ARCHIVED' && client.archivedAt === null)
      .map((client) => ({ id: client.id, label: client.name, detail: client.city }));
  };

  const loadCandidates: LoadTrainingOptions = async (search) => {
    const response = await listCandidates({
      accessToken: sessionToken.current,
      pageSize: 20,
      search: search || undefined,
      status: 'ACTIVE',
    });
    return response.candidates.map((candidate) => ({
      id: candidate.id,
      label: candidate.displayName,
      detail: candidate.email,
    }));
  };

  const loadContacts =
    (clientId: string): LoadTrainingOptions =>
    async (search) => {
      const response = await listClientContacts({
        accessToken: sessionToken.current,
        clientId,
        pageSize: 20,
        search: search || undefined,
        status: 'ACTIVE',
      });
      return response.contacts.map((contact) => ({
        id: contact.id,
        label: contact.displayName,
        detail: contact.email,
      }));
    };

  const loadEnrollmentOptions: LoadTrainingOptions = async (search) => {
    const programId = selectedProgramRef.current;
    const sessionId = selectedSessionRef.current;
    if (!programId || !sessionId) return [];
    const response = await listTrainingEnrollmentOptions(
      sessionToken.current,
      programId,
      sessionId,
      { search: search || undefined },
    );
    return response.enrollments.map((option) => ({
      id: option.id,
      label: option.participant.displayName,
      detail: option.participant.email,
      participantType: option.participantType,
    }));
  };

  // ---------------------------------------------------------------------------
  // Program writes
  // ---------------------------------------------------------------------------

  function createProgram(values: ProgramFormValues): Promise<boolean> {
    return runWrite(
      'createProgram',
      'workspace',
      () => createTrainingProgram(sessionToken.current, toProgramCreateRequest(values)),
      {
        success: 'training.feedback.programCreated',
        apply: ({ program }) => selectProgram(program),
        refresh: () => undefined,
      },
    );
  }

  function saveProgram(values: ProgramFormValues): Promise<boolean> {
    const program = selectedProgram;
    if (!program) return Promise.resolve(false);
    const update = toProgramUpdateRequest(values, program);
    if (!update) return Promise.resolve(true);
    return runWrite(
      'updateProgram',
      'program',
      () => updateTrainingProgram(sessionToken.current, program.id, update),
      {
        success: 'training.feedback.programUpdated',
        apply: ({ program: next }) => setSelectedProgram(next),
        refresh: () => undefined,
      },
    );
  }

  function changeProgramStatus(status: TrainingProgramStatus): void {
    const program = selectedProgram;
    if (!program || status === 'PROGRAM_ARCHIVED') return;
    void runWrite(
      'programStatus',
      'program',
      () => updateTrainingProgramStatus(sessionToken.current, program.id, { status }),
      {
        success: 'training.feedback.programStatusChanged',
        apply: ({ program: next }) => setSelectedProgram(next),
        refresh: () => undefined,
      },
    );
  }

  function archiveProgram(): void {
    const program = selectedProgram;
    if (!program || writeOwner.current !== null) return;
    if (!window.confirm(t('training.profile.archiveConfirm'))) return;
    void runWrite(
      'archiveProgram',
      'program',
      () => archiveTrainingProgram(sessionToken.current, program.id),
      {
        success: 'training.feedback.programArchived',
        apply: ({ program: next }) => setSelectedProgram(next),
        refresh: () => undefined,
      },
    );
  }

  // ---------------------------------------------------------------------------
  // Session writes
  // ---------------------------------------------------------------------------

  function applySessionResult(next: TrainingSessionSummary): void {
    if (selectedSessionRef.current === next.id) setSelectedSession(next);
  }

  function createSession(values: SessionFormValues): Promise<boolean> {
    const programId = selectedProgramRef.current;
    if (!programId) return Promise.resolve(false);
    return runWrite(
      'createSession',
      'program',
      () => createTrainingSession(sessionToken.current, programId, toSessionCreateRequest(values)),
      {
        success: 'training.feedback.sessionCreated',
        apply: () => undefined,
        refresh: refreshSessions,
      },
    );
  }

  function updateSession(values: SessionFormValues): Promise<boolean> {
    const programId = selectedProgramRef.current;
    const current = selectedSession;
    if (!programId || !current) return Promise.resolve(false);
    const update = toSessionUpdateRequest(values, current);
    if (!update) return Promise.resolve(true);
    return runWrite(
      'updateSession',
      'session',
      () => updateTrainingSession(sessionToken.current, programId, current.id, update),
      {
        success: 'training.feedback.sessionUpdated',
        apply: ({ session: next }) => applySessionResult(next),
        refresh: refreshSessions,
      },
    );
  }

  function changeSessionStatus(status: TrainingSessionStatus): void {
    const programId = selectedProgramRef.current;
    const current = selectedSession;
    if (!programId || !current || status === 'SESSION_CANCELED' || status === 'SESSION_ARCHIVED') {
      return;
    }
    void runWrite(
      'sessionStatus',
      'session',
      () => updateTrainingSessionStatus(sessionToken.current, programId, current.id, { status }),
      {
        success: 'training.feedback.sessionStatusChanged',
        apply: ({ session: next }) => applySessionResult(next),
        refresh: () => {
          refreshSessions();
          refreshParticipations();
        },
      },
    );
  }

  function rescheduleSession(values: RescheduleValues): Promise<boolean> {
    const programId = selectedProgramRef.current;
    const current = selectedSession;
    const scheduledAt = localInputToIso(values.scheduledAt);
    const scheduledEndAt = localInputToIso(values.scheduledEndAt);
    if (!programId || !current || !scheduledAt || !scheduledEndAt) return Promise.resolve(false);
    return runWrite(
      'rescheduleSession',
      'session',
      () =>
        rescheduleTrainingSession(sessionToken.current, programId, current.id, {
          scheduledAt,
          scheduledEndAt,
          reason: optional(values.reason) ?? undefined,
        }),
      {
        success: 'training.feedback.sessionRescheduled',
        apply: ({ session: next }) => applySessionResult(next),
        refresh: refreshSessions,
      },
    );
  }

  function cancelSession(reason: string): Promise<boolean> {
    const programId = selectedProgramRef.current;
    const current = selectedSession;
    if (!programId || !current) return Promise.resolve(false);
    return runWrite(
      'cancelSession',
      'session',
      () => cancelTrainingSession(sessionToken.current, programId, current.id, { reason }),
      {
        success: 'training.feedback.sessionCanceled',
        apply: ({ session: next }) => applySessionResult(next),
        refresh: refreshSessions,
      },
    );
  }

  function archiveSession(): void {
    const programId = selectedProgramRef.current;
    const current = selectedSession;
    if (!programId || !current || writeOwner.current !== null) return;
    if (!window.confirm(t('training.sessionDetail.archiveConfirm'))) return;
    void runWrite(
      'archiveSession',
      'session',
      () => archiveTrainingSession(sessionToken.current, programId, current.id),
      {
        success: 'training.feedback.sessionArchived',
        apply: ({ session: next }) => applySessionResult(next),
        refresh: refreshSessions,
      },
    );
  }

  // ---------------------------------------------------------------------------
  // Enrollment writes
  // ---------------------------------------------------------------------------

  function createEnrollment(
    type: Exclude<TrainingParticipantType, 'EXTERNAL'>,
    participant: TrainingPickerOption,
  ): Promise<boolean> {
    const programId = selectedProgramRef.current;
    if (!programId) return Promise.resolve(false);
    const identity =
      type === 'CANDIDATE'
        ? { candidateId: participant.id }
        : type === 'USER'
          ? { userId: participant.id }
          : { clientContactId: participant.id };
    return runWrite(
      'createEnrollment',
      'program',
      () =>
        createTrainingEnrollment(sessionToken.current, programId, {
          participantType: type,
          ...identity,
        }),
      {
        success: 'training.feedback.enrollmentCreated',
        apply: ({ enrollment }) => setSelectedEnrollmentId(enrollment.id),
        refresh: refreshEnrollments,
      },
    );
  }

  function enrollmentWrite(
    action: TrainingWriteAction,
    success: MessageKey,
    perform: (programId: string) => Promise<unknown>,
  ): Promise<boolean> {
    const programId = selectedProgramRef.current;
    if (!programId) return Promise.resolve(false);
    return runWrite(action, 'program', () => perform(programId), {
      success,
      apply: () => undefined,
      refresh: refreshEnrollments,
    });
  }

  function changeEnrollmentStatus(
    enrollment: TrainingEnrollmentSummary,
    status: TrainingEnrollmentStatus,
  ): void {
    if (status === 'CANCELED') return;
    void enrollmentWrite('enrollmentStatus', 'training.feedback.enrollmentStatusChanged', (id) =>
      updateTrainingEnrollmentStatus(sessionToken.current, id, enrollment.id, { status }),
    );
  }

  function withdrawEnrollment(
    enrollment: TrainingEnrollmentSummary,
    reason: string,
  ): Promise<boolean> {
    return enrollmentWrite('withdrawEnrollment', 'training.feedback.enrollmentWithdrawn', (id) =>
      withdrawTrainingEnrollment(sessionToken.current, id, enrollment.id, { reason }),
    );
  }

  function archiveEnrollment(enrollment: TrainingEnrollmentSummary): void {
    if (writeOwner.current !== null) return;
    if (!window.confirm(t('training.enrollments.archiveConfirm'))) return;
    void enrollmentWrite('archiveEnrollment', 'training.feedback.enrollmentArchived', (id) =>
      archiveTrainingEnrollment(sessionToken.current, id, enrollment.id),
    );
  }

  function setCertificateApplicability(
    enrollment: TrainingEnrollmentSummary,
    certificateStatus: Exclude<TrainingCertificateStatus, 'ISSUED'>,
  ): Promise<boolean> {
    return enrollmentWrite(
      'certificateStatus',
      'training.feedback.certificateStatusChanged',
      (id) =>
        updateTrainingEnrollmentCertificateStatus(sessionToken.current, id, enrollment.id, {
          certificateStatus,
        }),
    );
  }

  async function generateCertificate(
    enrollment: TrainingEnrollmentSummary,
    outputFamily: GenerationOutputFamily,
    language: GenerationLanguage,
  ): Promise<GeneratedVersionProvenance | null> {
    const programId = selectedProgramRef.current;
    if (!programId) return null;
    const owner = beginWrite('generateCertificate');
    if (owner === null) return null;
    const isCurrent = captureContext('program');
    setFeedback(null);
    try {
      const result = await generateTrainingCertificateDocument(
        sessionToken.current,
        programId,
        enrollment.id,
        { idempotencyKey: generationIdempotencyKey(), language, outputFamily },
      );
      if (!isCurrent()) return null;
      setFeedback({ tone: 'success', messageKey: 'training.feedback.certificateGenerated' });
      return result.generated;
    } catch {
      if (isCurrent()) {
        setFeedback({
          tone: 'danger',
          messageKey: 'training.feedback.failure.certificateGeneration',
        });
      }
      return null;
    } finally {
      endWrite(owner);
    }
  }

  async function loadCertificateVersions(documentId: string): Promise<DocumentVersion[] | null> {
    const isCurrent = captureContext('program');
    try {
      const response = await listDocumentVersions(sessionToken.current, documentId);
      return isCurrent() ? response.versions : null;
    } catch {
      return null;
    }
  }

  function downloadCertificate(
    documentId: string,
    version: { id: string; filename: string },
  ): void {
    const isCurrent = captureContext('program');
    void downloadDocumentVersion(sessionToken.current, documentId, version.id)
      .then((blob) => {
        if (!isCurrent()) return;
        saveBlob(blob, version.filename);
        setFeedback({ tone: 'success', messageKey: 'training.feedback.downloadStarted' });
      })
      .catch(() => {
        if (isCurrent()) {
          setFeedback({ tone: 'danger', messageKey: 'training.feedback.failure.download' });
        }
      });
  }

  // ---------------------------------------------------------------------------
  // Participation writes
  // ---------------------------------------------------------------------------

  function participationWrite(
    action: TrainingWriteAction,
    success: MessageKey,
    perform: (programId: string, sessionId: string) => Promise<unknown>,
  ): Promise<boolean> {
    const programId = selectedProgramRef.current;
    const sessionId = selectedSessionRef.current;
    if (!programId || !sessionId) return Promise.resolve(false);
    return runWrite(action, 'session', () => perform(programId, sessionId), {
      success,
      apply: () => undefined,
      refresh: refreshParticipations,
    });
  }

  function attendanceFields(values: AttendanceValues) {
    return {
      sessionOutcome: optional(values.sessionOutcome),
      completionStatus: optional(values.completionStatus),
      trainerNotes: optional(values.trainerNotes),
    };
  }

  function addParticipation(option: TrainingPickerOption): Promise<boolean> {
    return participationWrite(
      'addParticipation',
      'training.feedback.participationAdded',
      (programId, sessionId) =>
        createTrainingParticipation(sessionToken.current, programId, sessionId, {
          trainingEnrollmentId: option.id,
        }),
    );
  }

  function recordAttendance(
    participation: TrainingParticipationSummary,
    values: AttendanceValues,
  ): Promise<boolean> {
    const status = values.status;
    if (!status || status === 'PARTICIPATION_ARCHIVED') return Promise.resolve(false);
    return participationWrite(
      'recordAttendance',
      'training.feedback.attendanceRecorded',
      (programId, sessionId) =>
        updateTrainingAttendance(sessionToken.current, programId, sessionId, participation.id, {
          status,
          ...attendanceFields(values),
        }),
    );
  }

  function correctAttendance(
    participation: TrainingParticipationSummary,
    values: AttendanceValues,
  ): Promise<boolean> {
    const status = values.status;
    const correctionReason = values.correctionReason.trim();
    if (!status || status === 'PARTICIPATION_ARCHIVED' || !correctionReason) {
      return Promise.resolve(false);
    }
    return participationWrite(
      'correctAttendance',
      'training.feedback.attendanceCorrected',
      (programId, sessionId) =>
        correctTrainingAttendance(sessionToken.current, programId, sessionId, participation.id, {
          status,
          correctionReason,
          ...attendanceFields(values),
        }),
    );
  }

  function archiveParticipation(participation: TrainingParticipationSummary): void {
    if (writeOwner.current !== null) return;
    if (!window.confirm(t('training.participation.archiveConfirm'))) return;
    void participationWrite(
      'archiveParticipation',
      'training.feedback.participationArchived',
      (programId, sessionId) =>
        archiveTrainingParticipation(sessionToken.current, programId, sessionId, participation.id),
    );
  }

  return (
    <TrainingWorkspace
      access={access}
      enrollments={{
        certificate: {
          onApplicability: setCertificateApplicability,
          onDownload: downloadCertificate,
          onGenerate: generateCertificate,
          onLoadVersions: loadCertificateVersions,
        },
        filters: enrollmentQuery.filters,
        list: enrollmentList,
        selectedId: selectedEnrollmentId,
        onArchive: archiveEnrollment,
        onCreate: createEnrollment,
        onFiltersChange: (filters) => {
          setSelectedEnrollmentId(null);
          applyEnrollmentQuery({ filters, page: 1 });
        },
        onPage: (page) => applyEnrollmentQuery({ ...enrollmentQueryRef.current, page }),
        onRetry: () => {
          const programId = selectedProgramRef.current;
          if (programId) void loadEnrollments(programId, enrollmentQueryRef.current);
        },
        onSelect: setSelectedEnrollmentId,
        onStatus: changeEnrollmentStatus,
        onWithdraw: withdrawEnrollment,
      }}
      feedback={feedback}
      key={session.key}
      loaders={{
        clients: loadClients,
        enrollment: {
          candidates: loadCandidates,
          clients: loadClients,
          contacts: loadContacts,
          users: loadEnrollmentUsers,
        },
        enrollmentOptions: loadEnrollmentOptions,
        owners: loadOwners,
        trainers: loadTrainers,
      }}
      participation={{
        filters: participationQuery.filters,
        list: participationList,
        selectedId: selectedParticipationId,
        onAdd: addParticipation,
        onArchive: archiveParticipation,
        onCorrect: correctAttendance,
        onFiltersChange: (filters) => {
          setSelectedParticipationId(null);
          applyParticipationQuery({ filters, page: 1 });
        },
        onPage: (page) => applyParticipationQuery({ ...participationQueryRef.current, page }),
        onRecord: recordAttendance,
        onRetry: () => {
          const programId = selectedProgramRef.current;
          const sessionId = selectedSessionRef.current;
          if (programId && sessionId) {
            void loadParticipations(programId, sessionId, participationQueryRef.current);
          }
        },
        onSelect: setSelectedParticipationId,
      }}
      programs={{
        appliedFilters: programQuery.filters,
        filters: programFilters,
        focusToken: programFocus,
        list: programList,
        selected: selectedProgram,
        onApplyFilters: () => applyProgramQuery({ filters: programFilters, page: 1 }),
        onArchive: archiveProgram,
        onCreate: createProgram,
        onFiltersChange: setProgramFilters,
        onPage: (page) => applyProgramQuery({ ...programQueryRef.current, page }),
        onResetFilters: () => {
          setProgramFilters(EMPTY_PROGRAM_FILTERS);
          applyProgramQuery(FIRST_PROGRAM_PAGE);
        },
        onRetry: () => void loadPrograms(programQueryRef.current),
        onSave: saveProgram,
        onSelect: selectProgram,
        onStatus: changeProgramStatus,
      }}
      sessionKey={session.key}
      sessions={{
        appliedFilters: sessionQuery.filters,
        filters: sessionFilters,
        focusToken: sessionFocus,
        list: sessionList,
        selected: selectedSession,
        onApplyFilters: () => applySessionQuery({ filters: sessionFilters, page: 1 }),
        onArchive: archiveSession,
        onCancelSession: cancelSession,
        onCreate: createSession,
        onFiltersChange: setSessionFilters,
        onPage: (page) => applySessionQuery({ ...sessionQueryRef.current, page }),
        onReschedule: rescheduleSession,
        onResetFilters: () => {
          setSessionFilters(EMPTY_SESSION_FILTERS);
          applySessionQuery(FIRST_SESSION_PAGE);
        },
        onRetry: () => {
          const programId = selectedProgramRef.current;
          if (programId) void loadSessions(programId, sessionQueryRef.current);
        },
        onSelect: selectSession,
        onStatus: changeSessionStatus,
        onUpdate: updateSession,
      }}
      writesLocked={pending !== null}
    />
  );
}
