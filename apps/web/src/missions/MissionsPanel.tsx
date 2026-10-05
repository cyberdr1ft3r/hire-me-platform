import type {
  CandidateEvaluation,
  ClientContactSummary,
  EvaluationCreateRequest,
  InternalPublicApplicationSummary,
  InternalPublicOpportunity,
  InternalPublicOpportunityUpdateRequest,
  InterviewRescheduleRequest,
  InterviewScheduleRequest,
  InterviewSummary,
  MissionAssignmentSummary,
  MissionCandidateState,
  MissionCandidateSummary,
  MissionLifecycleState,
  MissionPlacement,
  MissionSummary,
  OfferAggregate,
  PublicContentLanguage,
} from '@hire-me/contracts';
import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
} from 'react';

import {
  archiveInterview,
  archiveMission,
  archiveMissionAssignment,
  cancelInterview,
  closeMission,
  completeInterview,
  confirmMissionCandidatePlacement,
  correctMissionCandidatePlacement,
  createEvaluation,
  createMission,
  createMissionAssignment,
  createMissionCandidate,
  createMissionCandidateOffer,
  finalizeEvaluation,
  getInternalPublicOpportunity,
  getMission,
  getMissionCandidateOffers,
  getMissionCandidatePlacement,
  listCandidates,
  listClientContacts,
  listClients,
  listEvaluations,
  listInternalPublicApplications,
  listInterviews,
  listMissionAssignmentUserOptions,
  listMissionAssignments,
  listMissionCandidates,
  listMissions,
  markMissionCandidateOfferSent,
  postponeInterview,
  presentMissionCandidate,
  recordMissionCandidateOfferResponse,
  rescheduleInterview,
  reviseMissionCandidateOffer,
  scheduleInterview,
  setMissionLeadRecruiter,
  transferMissionCandidate,
  transitionMissionCandidate,
  updateInternalPublicOpportunity,
  updateMission,
  updateMissionAssignment,
  updateMissionStatus,
  withdrawMissionCandidateOffer,
  MissionRequestError,
} from '../api.js';
import { useI18n, type MessageKey, type PlainMessageKey } from '../i18n/index.js';
import type { AssignmentCreateValues } from './MissionAssignments.js';
import type { ProcessLinkValues } from './MissionCandidatePipeline.js';
import type { InterviewAction } from './MissionInterviews.js';
import type { MissionClosureValues } from './MissionLifecycle.js';
import type { OfferCreateValues } from './MissionOffers.js';
import type { LoadPickerOptions } from './MissionPicker.js';
import type { ProcessTransferValues } from './MissionProcess.js';
import { publicOpportunityPath, type PublicationChange } from './MissionPublicOpportunity.js';
import { bumpStackedDetailRevealToken } from '../layout/index.js';
import { MissionsWorkspace } from './MissionsWorkspace.js';
import { resolveMissionAccess } from './mission-access.js';
import { classifyMissionFailure } from './mission-errors.js';
import { optionalText, toMissionCreateRequest, toMissionUpdateRequest } from './mission-form.js';
import {
  CLOSURE_REASON_BY_STATE,
  RESPONSIBLE_RECRUITER_ROLES,
  assignmentRoleLabelKey,
  isOptionalProcessSkip,
  missionStateLabelKey,
  offerStatusLabelKey,
  processStateLabelKey,
  type OfferResponseStatus,
} from './mission-labels.js';
import {
  EMPTY_MISSION_FILTERS,
  FIRST_MISSION_PAGE,
  IDLE,
  MISSION_CONTACT_PAGE_SIZE,
  MISSION_LIST_PAGE_SIZE,
  MISSION_PROCESS_PAGE_SIZE,
  MISSION_OPTION_PAGE_SIZE,
  missionToProfileValues,
  pageCount,
  sectionData,
  type MissionCreateValues,
  type MissionDetailState,
  type MissionFeedback,
  type MissionListQuery,
  type MissionListState,
  type MissionProcessPage,
  type MissionPendingAction,
  type MissionProfileValues,
  type PickerOption,
  type PublicOpportunitySectionState,
  type SectionState,
  publicOpportunityWritable,
} from './mission-state.js';

type SectionName =
  | 'detail'
  | 'assignments'
  | 'processes'
  | 'publicOpportunity'
  | 'applications'
  | 'clientContacts'
  | 'offer'
  | 'placement'
  | 'interviews'
  | 'evaluations';

const SECTION_NAMES: readonly SectionName[] = [
  'detail',
  'assignments',
  'processes',
  'publicOpportunity',
  'applications',
  'clientContacts',
  'offer',
  'placement',
  'interviews',
  'evaluations',
];

const PROCESS_SECTIONS: readonly SectionName[] = [
  'offer',
  'placement',
  'interviews',
  'evaluations',
];

function sectionCounters(): Record<SectionName, number> {
  return Object.fromEntries(SECTION_NAMES.map((name) => [name, 0])) as Record<SectionName, number>;
}

type ContentLanguageDraft = { opportunityId: string; value: PublicContentLanguage | null } | null;

interface WriteOptions<T> {
  action: MissionPendingAction;
  failureKey: PlainMessageKey;
  isCurrent: () => boolean;
  onStale?: () => void;
  onSuccess: (result: T) => void;
  refreshList?: boolean;
  request: () => Promise<T>;
}

/** One active mission team member per user, in assignment order. */
function uniqueMembers(
  assignments: readonly MissionAssignmentSummary[],
  label: (assignment: MissionAssignmentSummary) => string | null,
): PickerOption[] {
  const seen = new Set<string>();
  const members: PickerOption[] = [];
  for (const assignment of assignments) {
    if (seen.has(assignment.userId)) continue;
    seen.add(assignment.userId);
    members.push({
      id: assignment.userId,
      label: assignment.userDisplayName,
      detail: label(assignment),
    });
  }
  return members;
}

/**
 * The protected Missions workspace (`/missions`).
 *
 * Every read and write is scoped to one session (access token plus the
 * permission principal) and to the context it started in: the selected
 * mission, the opened candidate process, and the expanded interview. A
 * response that arrives after any of them changed is dropped, so one mission
 * never shows another mission's records. One write runs at a time.
 */
export function MissionsPanel({
  accessToken,
  actorUserId,
  initialInterviewId,
  initialMissionId,
  initialProcessId,
  onSelectionChange,
  permissions,
}: {
  accessToken: string;
  /** The signed-in user, for the "Assigned to me" filter only. */
  actorUserId: string;
  initialInterviewId?: string | null;
  initialMissionId: string | null;
  initialProcessId?: string | null;
  onSelectionChange: (missionId: string) => void;
  permissions: string[];
}) {
  const { t } = useI18n();
  const access = resolveMissionAccess(permissions);
  const principal = permissions.join(' ');

  const listRequest = useRef(0);
  const sectionRequests = useRef(sectionCounters());
  const contextGeneration = useRef(0);
  const processGeneration = useRef(0);
  const interviewGeneration = useRef(0);
  const writeInFlight = useRef(false);
  const selectedMissionRef = useRef<string | null>(null);
  const activeProcessRef = useRef<string | null>(null);
  const activeInterviewRef = useRef<string | null>(null);
  const contactsRequestedFor = useRef<string | null>(null);
  const processPageRef = useRef(1);
  const appliedQueryRef = useRef<MissionListQuery>(FIRST_MISSION_PAGE);
  const initialIntent = useRef(initialMissionId);
  const initialProcessIntent = useRef(initialProcessId ?? null);
  const initialInterviewIntent = useRef(initialInterviewId ?? null);

  const [session, setSession] = useState({ key: 0, principal, token: accessToken });
  const sessionKeyRef = useRef(session.key);

  const [filters, setFilters] = useState(EMPTY_MISSION_FILTERS);
  const [appliedQuery, setAppliedQuery] = useState(FIRST_MISSION_PAGE);
  const [list, setList] = useState<MissionListState>({ status: 'loading' });
  const [selectedMissionId, setSelectedMissionId] = useState<string | null>(null);
  const [detail, setDetail] = useState<MissionDetailState>({ status: 'idle' });
  const [editValues, setEditValues] = useState<MissionProfileValues | null>(null);

  const [assignments, setAssignments] = useState<SectionState<MissionAssignmentSummary[]>>(IDLE);
  const [processes, setProcesses] = useState<SectionState<MissionProcessPage>>(IDLE);
  const [processLeftPage, setProcessLeftPage] = useState(false);
  const [publicOpportunity, setPublicOpportunity] = useState<PublicOpportunitySectionState>(IDLE);
  const [applications, setApplications] =
    useState<SectionState<InternalPublicApplicationSummary[]>>(IDLE);
  const [clientContacts, setClientContacts] = useState<SectionState<ClientContactSummary[]>>(IDLE);
  const [contentLanguageDraft, setContentLanguageDraft] = useState<ContentLanguageDraft>(null);

  const [missionDetailRevealToken, setMissionDetailRevealToken] = useState(0);
  const [processDetailRevealToken, setProcessDetailRevealToken] = useState(0);
  const [activeProcessId, setActiveProcessId] = useState<string | null>(null);
  const [offer, setOffer] = useState<SectionState<OfferAggregate | null>>(IDLE);
  const [placement, setPlacement] = useState<SectionState<MissionPlacement | null>>(IDLE);
  const [interviews, setInterviews] = useState<SectionState<InterviewSummary[]>>(IDLE);
  const [activeInterviewId, setActiveInterviewId] = useState<string | null>(null);
  const [evaluations, setEvaluations] = useState<SectionState<CandidateEvaluation[]>>(IDLE);

  const [feedback, setFeedback] = useState<MissionFeedback | null>(null);
  const [pending, setPending] = useState<MissionPendingAction | null>(null);

  function resetMissionSections(): void {
    processPageRef.current = 1;
    setAssignments(IDLE);
    setProcesses(IDLE);
    setProcessLeftPage(false);
    setPublicOpportunity(IDLE);
    setApplications(IDLE);
    setClientContacts(IDLE);
    setContentLanguageDraft(null);
    resetProcessSections();
    setActiveProcessId(null);
  }

  function resetProcessSections(): void {
    setOffer(IDLE);
    setPlacement(IDLE);
    setInterviews(IDLE);
    setEvaluations(IDLE);
    setActiveInterviewId(null);
  }

  function invalidate(names: readonly SectionName[]): void {
    for (const name of names) {
      sectionRequests.current[name] += 1;
    }
  }

  if (session.token !== accessToken || session.principal !== principal) {
    listRequest.current += 1;
    invalidate(SECTION_NAMES);
    contextGeneration.current += 1;
    processGeneration.current += 1;
    interviewGeneration.current += 1;
    selectedMissionRef.current = null;
    activeProcessRef.current = null;
    activeInterviewRef.current = null;
    contactsRequestedFor.current = null;
    appliedQueryRef.current = { filters: { ...EMPTY_MISSION_FILTERS }, page: 1 };
    initialIntent.current = null;
    sessionKeyRef.current = session.key + 1;
    setSession({ key: session.key + 1, principal, token: accessToken });
    setFilters(EMPTY_MISSION_FILTERS);
    setAppliedQuery(appliedQueryRef.current);
    setList({ status: 'loading' });
    setSelectedMissionId(null);
    setDetail({ status: 'idle' });
    setEditValues(null);
    resetMissionSections();
    setFeedback(null);
  }

  useEffect(() => {
    void loadList(appliedQuery);
    return () => {
      listRequest.current += 1;
    };
  }, [accessToken, actorUserId, principal, appliedQuery]);

  useEffect(() => {
    const missionId = initialIntent.current;
    if (missionId) {
      selectMission(missionId, false);
    }
    return () => {
      contextGeneration.current += 1;
      invalidate(SECTION_NAMES);
      selectedMissionRef.current = null;
    };
  }, []);

  useEffect(() => {
    const processId = initialProcessIntent.current;
    if (!processId || detail.status !== 'ready' || selectedMissionRef.current === null) {
      return;
    }
    initialProcessIntent.current = null;
    openProcess(processId);
  }, [detail.status, selectedMissionId]);

  useEffect(() => {
    const interviewId = initialInterviewIntent.current;
    if (
      !interviewId ||
      !activeProcessId ||
      interviews.status !== 'ready' ||
      selectedMissionRef.current === null
    ) {
      return;
    }
    initialInterviewIntent.current = null;
    toggleInterview(interviewId);
  }, [interviews.status, activeProcessId, activeInterviewId]);

  // ---- context guards --------------------------------------------------

  function captureMissionContext(missionId: string): () => boolean {
    const generation = contextGeneration.current;
    return () =>
      contextGeneration.current === generation && selectedMissionRef.current === missionId;
  }

  function captureProcessContext(missionId: string, processId: string): () => boolean {
    const isMission = captureMissionContext(missionId);
    const generation = processGeneration.current;
    return () =>
      isMission() &&
      processGeneration.current === generation &&
      activeProcessRef.current === processId;
  }

  function captureInterviewContext(
    missionId: string,
    processId: string,
    interviewId: string,
  ): () => boolean {
    const isProcess = captureProcessContext(missionId, processId);
    const generation = interviewGeneration.current;
    return () =>
      isProcess() &&
      interviewGeneration.current === generation &&
      activeInterviewRef.current === interviewId;
  }

  /** Creation commits a selection only if the user has not moved on meanwhile. */
  function captureSelectionContext(): () => boolean {
    const generation = contextGeneration.current;
    const missionId = selectedMissionRef.current;
    return () =>
      contextGeneration.current === generation && selectedMissionRef.current === missionId;
  }

  async function loadSection<T>(
    name: SectionName,
    setter: Dispatch<SetStateAction<SectionState<T>>>,
    fetcher: () => Promise<T>,
    isCurrent: () => boolean,
    quiet: boolean,
  ): Promise<void> {
    const request = ++sectionRequests.current[name];
    const latest = () => isCurrent() && sectionRequests.current[name] === request;
    if (!quiet) {
      setter({ status: 'loading' });
    }
    try {
      const data = await fetcher();
      if (latest()) {
        setter({ status: 'ready', data });
      }
    } catch {
      if (latest() && !quiet) {
        setter({ status: 'error' });
      }
    }
  }

  // ---- list ------------------------------------------------------------

  async function loadList(query: MissionListQuery, quiet = false): Promise<void> {
    const request = ++listRequest.current;
    if (!quiet) {
      setList({ status: 'loading' });
    }
    try {
      const response = await listMissions({
        accessToken,
        page: query.page,
        pageSize: MISSION_LIST_PAGE_SIZE,
        search: query.filters.search.trim() || undefined,
        state: query.filters.state || undefined,
        priority: query.filters.priority || undefined,
        clientId: query.filters.client?.id,
        assigneeUserId: query.filters.assignedToMe ? actorUserId : undefined,
      });
      if (request !== listRequest.current) {
        return;
      }
      const { page, pageSize, total } = response.pagination;
      if (response.missions.length === 0 && total > 0 && page > 1) {
        const next = { ...query, page: Math.min(page - 1, pageCount(total, pageSize)) };
        appliedQueryRef.current = next;
        setAppliedQuery(next);
        return;
      }
      setList({ status: 'ready', missions: response.missions, page, pageSize, total });
    } catch {
      if (request === listRequest.current && !quiet) {
        setList({ status: 'error' });
      }
    }
  }

  function applyQuery(next: MissionListQuery): void {
    appliedQueryRef.current = next;
    setAppliedQuery(next);
  }

  // ---- mission context -------------------------------------------------

  function selectMission(missionId: string, updateUrl = true): void {
    contextGeneration.current += 1;
    processGeneration.current += 1;
    interviewGeneration.current += 1;
    invalidate(SECTION_NAMES);
    selectedMissionRef.current = missionId;
    activeProcessRef.current = null;
    activeInterviewRef.current = null;
    contactsRequestedFor.current = null;
    setMissionDetailRevealToken(bumpStackedDetailRevealToken);
    setProcessDetailRevealToken(0);
    setSelectedMissionId(missionId);
    setDetail({ status: 'loading' });
    setEditValues(null);
    resetMissionSections();
    setFeedback(null);
    if (updateUrl) {
      initialIntent.current = null;
      onSelectionChange(missionId);
    }
    void loadMissionContext(missionId, false);
  }

  function commitMission(mission: MissionSummary, resetEdit: boolean): void {
    setDetail({ status: 'ready', mission });
    setEditValues((current) =>
      resetEdit || current === null ? missionToProfileValues(mission) : current,
    );
  }

  /** Mission-level records load one after another; a stale step ends the chain. */
  async function loadMissionContext(missionId: string, quiet: boolean): Promise<void> {
    const isCurrent = captureMissionContext(missionId);
    const request = ++sectionRequests.current.detail;
    const latest = () => isCurrent() && sectionRequests.current.detail === request;
    let mission: MissionSummary;
    try {
      mission = (await getMission(accessToken, missionId)).mission;
    } catch {
      if (latest()) {
        if (initialIntent.current === missionId) initialIntent.current = null;
        if (!quiet) setDetail({ status: 'unavailable' });
      }
      return;
    }
    if (!latest()) {
      return;
    }
    if (initialIntent.current === missionId) initialIntent.current = null;
    commitMission(mission, !quiet);

    if (access.canViewAssignments) {
      await loadAssignments(missionId, isCurrent, quiet);
      if (!isCurrent()) return;
    }
    if (access.canViewProcesses) {
      await loadProcesses(missionId, isCurrent, quiet);
      if (!isCurrent()) return;
    }
    if (access.canViewPublicOpportunity) {
      await loadPublicOpportunity(missionId, isCurrent, quiet);
      if (!isCurrent()) return;
    }
    if (access.canViewPublicApplications) {
      await loadApplications(missionId, isCurrent, quiet);
    }
  }

  function loadAssignments(missionId: string, isCurrent: () => boolean, quiet: boolean) {
    return loadSection(
      'assignments',
      setAssignments,
      async () => (await listMissionAssignments(accessToken, missionId)).assignments,
      isCurrent,
      quiet,
    );
  }

  /**
   * Loads one server page of candidate processes. A page emptied by a change
   * elsewhere falls back to the last page that still has entries. An open
   * process that is not on the committed page is closed explicitly, so its
   * detail never outlives the row it belongs to.
   */
  async function loadProcesses(
    missionId: string,
    isCurrent: () => boolean,
    quiet: boolean,
    page = processPageRef.current,
  ): Promise<void> {
    const request = ++sectionRequests.current.processes;
    const latest = () => isCurrent() && sectionRequests.current.processes === request;
    processPageRef.current = page;
    if (!quiet) {
      setProcesses({ status: 'loading' });
    }
    let response: Awaited<ReturnType<typeof listMissionCandidates>>;
    try {
      response = await listMissionCandidates(accessToken, missionId, {
        page,
        pageSize: MISSION_PROCESS_PAGE_SIZE,
      });
    } catch {
      if (latest() && !quiet) {
        setProcesses({ status: 'error' });
      }
      return;
    }
    if (!latest()) {
      return;
    }
    const { total, pageSize } = response.pagination;
    if (response.candidates.length === 0 && total > 0 && response.pagination.page > 1) {
      const lastPage = Math.min(response.pagination.page - 1, pageCount(total, pageSize));
      await loadProcesses(missionId, isCurrent, quiet, lastPage);
      return;
    }
    processPageRef.current = response.pagination.page;
    setProcesses({
      status: 'ready',
      data: { candidates: response.candidates, page: response.pagination.page, pageSize, total },
    });
    const openId = activeProcessRef.current;
    if (openId && !response.candidates.some((entry) => entry.id === openId)) {
      closeProcess();
      setProcessLeftPage(true);
    }
  }

  function goToProcessPage(page: number): void {
    const missionId = selectedMissionRef.current;
    if (!missionId || detail.status !== 'ready') {
      return;
    }
    const hadOpenProcess = activeProcessRef.current !== null;
    if (hadOpenProcess) {
      closeProcess();
    }
    setProcessLeftPage(hadOpenProcess);
    void loadProcesses(missionId, captureMissionContext(missionId), false, page);
  }

  function loadPublicOpportunity(missionId: string, isCurrent: () => boolean, quiet: boolean) {
    const request = ++sectionRequests.current.publicOpportunity;
    const latest = () => isCurrent() && sectionRequests.current.publicOpportunity === request;
    if (!quiet) {
      setPublicOpportunity({ status: 'loading' });
    }
    return getInternalPublicOpportunity(accessToken, missionId)
      .then((response) => {
        if (latest()) {
          setPublicOpportunity({ status: 'ready', data: response.publicOpportunity });
        }
      })
      .catch((error: unknown) => {
        if (!latest() || quiet) {
          return;
        }
        if (error instanceof MissionRequestError && error.status === 404) {
          setPublicOpportunity({ status: 'missing' });
          return;
        }
        setPublicOpportunity({ status: 'error' });
      });
  }

  function loadApplications(missionId: string, isCurrent: () => boolean, quiet: boolean) {
    return loadSection(
      'applications',
      setApplications,
      async () => (await listInternalPublicApplications(accessToken, missionId)).applications,
      isCurrent,
      quiet,
    );
  }

  // ---- process context -------------------------------------------------

  function openProcess(processId: string): void {
    const missionId = selectedMissionRef.current;
    if (!missionId || detail.status !== 'ready') {
      return;
    }
    processGeneration.current += 1;
    interviewGeneration.current += 1;
    invalidate(PROCESS_SECTIONS);
    activeInterviewRef.current = null;
    resetProcessSections();
    setProcessLeftPage(false);
    if (activeProcessRef.current === processId) {
      activeProcessRef.current = null;
      setActiveProcessId(null);
      return;
    }
    activeProcessRef.current = processId;
    setProcessDetailRevealToken(bumpStackedDetailRevealToken);
    setActiveProcessId(processId);
    void loadProcessContext(detail.mission, processId, false);
  }

  function closeProcess(): void {
    processGeneration.current += 1;
    interviewGeneration.current += 1;
    invalidate(PROCESS_SECTIONS);
    activeProcessRef.current = null;
    activeInterviewRef.current = null;
    setActiveProcessId(null);
    resetProcessSections();
  }

  async function loadProcessContext(
    mission: MissionSummary,
    processId: string,
    quiet: boolean,
  ): Promise<void> {
    const missionId = mission.id;
    const isCurrent = captureProcessContext(missionId, processId);
    const tasks: Promise<void>[] = [];
    if (access.canViewOffers) {
      tasks.push(
        loadSection(
          'offer',
          setOffer,
          async () => (await getMissionCandidateOffers(accessToken, missionId, processId)).offer,
          isCurrent,
          quiet,
        ),
      );
    }
    if (access.canViewPlacements) {
      tasks.push(
        loadSection(
          'placement',
          setPlacement,
          async () =>
            (await getMissionCandidatePlacement(accessToken, missionId, processId)).placement,
          isCurrent,
          quiet,
        ),
      );
    }
    if (access.canViewInterviews) {
      tasks.push(loadInterviews(missionId, processId, isCurrent, quiet));
      if (
        access.canScheduleInterviews &&
        access.canViewClientContacts &&
        contactsRequestedFor.current !== missionId
      ) {
        contactsRequestedFor.current = missionId;
        tasks.push(
          loadSection(
            'clientContacts',
            setClientContacts,
            async () =>
              (
                await listClientContacts({
                  accessToken,
                  clientId: mission.clientId,
                  page: 1,
                  pageSize: MISSION_CONTACT_PAGE_SIZE,
                  status: 'ACTIVE',
                })
              ).contacts,
            captureMissionContext(missionId),
            false,
          ),
        );
      }
    }
    await Promise.all(tasks);
  }

  function loadInterviews(
    missionId: string,
    processId: string,
    isCurrent: () => boolean,
    quiet: boolean,
  ) {
    return loadSection(
      'interviews',
      setInterviews,
      async () => (await listInterviews(accessToken, missionId, processId)).interviews,
      isCurrent,
      quiet,
    );
  }

  function loadEvaluations(
    missionId: string,
    processId: string,
    interviewId: string,
    quiet: boolean,
  ) {
    return loadSection(
      'evaluations',
      setEvaluations,
      async () =>
        (await listEvaluations(accessToken, missionId, processId, interviewId)).evaluations,
      captureInterviewContext(missionId, processId, interviewId),
      quiet,
    );
  }

  function toggleInterview(interviewId: string): void {
    const missionId = selectedMissionRef.current;
    const processId = activeProcessRef.current;
    if (!missionId || !processId) {
      return;
    }
    interviewGeneration.current += 1;
    invalidate(['evaluations']);
    setEvaluations(IDLE);
    if (activeInterviewRef.current === interviewId) {
      activeInterviewRef.current = null;
      setActiveInterviewId(null);
      return;
    }
    activeInterviewRef.current = interviewId;
    setActiveInterviewId(interviewId);
    if (access.canViewEvaluations) {
      void loadEvaluations(missionId, processId, interviewId, false);
    }
  }

  // ---- writes ------------------------------------------------------------

  function beginWrite(action: MissionPendingAction): boolean {
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

  function confirmed(message: string): boolean {
    return !writeInFlight.current && window.confirm(message);
  }

  async function runWrite<T>(options: WriteOptions<T>): Promise<boolean> {
    if (!beginWrite(options.action)) {
      return false;
    }
    const startedSession = sessionKeyRef.current;
    setFeedback(null);
    try {
      const result = await options.request();
      if (startedSession !== sessionKeyRef.current) {
        return false;
      }
      if (options.refreshList) {
        void loadList(appliedQueryRef.current, true);
      }
      if (!options.isCurrent()) {
        return false;
      }
      options.onSuccess(result);
      return true;
    } catch (error) {
      if (startedSession === sessionKeyRef.current && options.isCurrent()) {
        const failure = classifyMissionFailure(error);
        setFeedback({ tone: 'danger', key: options.failureKey, failure });
        if (failure === 'conflict' || failure === 'notFound') {
          options.onStale?.();
        }
      }
      return false;
    } finally {
      endWrite();
    }
  }

  const readyMission = detail.status === 'ready' ? detail.mission : null;
  const activeProcess =
    activeProcessId === null
      ? null
      : (sectionData(processes)?.candidates.find((entry) => entry.id === activeProcessId) ?? null);

  function refreshMission(missionId: string): void {
    void loadMissionContext(missionId, true);
  }

  function refreshProcess(mission: MissionSummary, processId: string): void {
    if (activeProcessRef.current === processId) {
      void loadProcessContext(mission, processId, true);
    }
  }

  function replaceProcess(updated: MissionCandidateSummary): void {
    setProcesses((current) =>
      current.status === 'ready'
        ? {
            status: 'ready',
            data: {
              ...current.data,
              candidates: current.data.candidates.map((entry) =>
                entry.id === updated.id ? updated : entry,
              ),
            },
          }
        : current,
    );
  }

  // Mission --------------------------------------------------------------

  function handleCreate(values: MissionCreateValues): Promise<boolean> {
    const request = toMissionCreateRequest(values);
    if (!request || !access.canCreate) {
      return Promise.resolve(false);
    }
    return runWrite({
      action: 'createMission',
      failureKey: 'missions.failure.action.create',
      isCurrent: captureSelectionContext(),
      refreshList: true,
      request: () => createMission(accessToken, request),
      onSuccess: (created) => {
        selectMission(created.mission.id);
        setFeedback({ tone: 'success', key: 'missions.feedback.created' });
      },
    });
  }

  function handleSave(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!readyMission || !editValues || !access.canUpdate) {
      return;
    }
    const missionId = readyMission.id;
    const request = toMissionUpdateRequest(editValues);
    void runWrite({
      action: 'updateMission',
      failureKey: 'missions.failure.action.update',
      isCurrent: captureMissionContext(missionId),
      onStale: () => refreshMission(missionId),
      refreshList: true,
      request: () => updateMission(accessToken, missionId, request),
      onSuccess: (updated) => {
        commitMission(updated.mission, true);
        setFeedback({ tone: 'success', key: 'missions.feedback.updated' });
      },
    });
  }

  function handleMove(state: MissionLifecycleState): void {
    if (!readyMission || !access.canManageStatus) {
      return;
    }
    const missionId = readyMission.id;
    const labelKey = missionStateLabelKey(state);
    if (!confirmed(t('missions.lifecycle.confirmMove', { state: t(labelKey) }))) {
      return;
    }
    void runWrite({
      action: 'lifecycle',
      failureKey: 'missions.failure.action.status',
      isCurrent: captureMissionContext(missionId),
      onStale: () => refreshMission(missionId),
      refreshList: true,
      request: () => updateMissionStatus(accessToken, missionId, { state }),
      onSuccess: (updated) => {
        commitMission(updated.mission, false);
        setFeedback({ tone: 'success', key: 'missions.feedback.statusChanged', labelKey });
      },
    });
  }

  function handleClose(values: MissionClosureValues): void {
    if (!readyMission || !access.canClose) {
      return;
    }
    const missionId = readyMission.id;
    if (
      !confirmed(
        t('missions.lifecycle.close.confirm', { state: t(missionStateLabelKey(values.state)) }),
      )
    ) {
      return;
    }
    void runWrite({
      action: 'lifecycle',
      failureKey: 'missions.failure.action.close',
      isCurrent: captureMissionContext(missionId),
      onStale: () => refreshMission(missionId),
      refreshList: true,
      request: () =>
        closeMission(accessToken, missionId, {
          state: values.state,
          closureReason: CLOSURE_REASON_BY_STATE[values.state],
          filledPlacementCount: values.filledPlacementCount,
        }),
      onSuccess: (updated) => {
        commitMission(updated.mission, false);
        setFeedback({ tone: 'success', key: 'missions.feedback.closed' });
      },
    });
  }

  function handleArchive(): void {
    if (!readyMission || !access.canArchive) {
      return;
    }
    const missionId = readyMission.id;
    if (!confirmed(t('missions.lifecycle.archive.confirm'))) {
      return;
    }
    void runWrite({
      action: 'lifecycle',
      failureKey: 'missions.failure.action.archive',
      isCurrent: captureMissionContext(missionId),
      onStale: () => refreshMission(missionId),
      refreshList: true,
      request: () => archiveMission(accessToken, missionId),
      onSuccess: (archived) => {
        commitMission(archived.mission, false);
        setFeedback({ tone: 'success', key: 'missions.feedback.archived' });
      },
    });
  }

  // Assignments ----------------------------------------------------------

  function assignmentWrite<T>(
    mission: MissionSummary,
    request: () => Promise<T>,
    successKey: PlainMessageKey,
  ): Promise<boolean> {
    const missionId = mission.id;
    const isCurrent = captureMissionContext(missionId);
    return runWrite({
      action: 'assignment',
      failureKey: 'missions.failure.action.assignment',
      isCurrent,
      onStale: () => refreshMission(missionId),
      refreshList: true,
      request,
      onSuccess: () => {
        setFeedback({ tone: 'success', key: successKey });
        if (access.canViewAssignments) {
          void loadAssignments(missionId, isCurrent, true);
        }
      },
    });
  }

  function handleCreateAssignment(values: AssignmentCreateValues): Promise<boolean> {
    if (!readyMission || !access.canManageAssignments) {
      return Promise.resolve(false);
    }
    const missionId = readyMission.id;
    return assignmentWrite(
      readyMission,
      () =>
        createMissionAssignment(accessToken, missionId, {
          userId: values.user.id,
          role: values.role,
          isLead: values.isLead,
        }),
      'missions.feedback.assignmentCreated',
    );
  }

  function handleAssignmentChange(
    assignment: MissionAssignmentSummary,
    change: 'archive' | 'deactivate' | 'lead',
  ): void {
    if (!readyMission || !access.canManageAssignments) {
      return;
    }
    const missionId = readyMission.id;
    const name = assignment.userDisplayName;
    const prompts = {
      archive: t('missions.assignments.confirmArchive', { name }),
      deactivate: t('missions.assignments.confirmDeactivate', { name }),
      lead: t('missions.assignments.confirmLead', { name }),
    };
    if (!confirmed(prompts[change])) {
      return;
    }
    if (change === 'lead') {
      void assignmentWrite(
        readyMission,
        () => setMissionLeadRecruiter(accessToken, missionId, { assignmentId: assignment.id }),
        'missions.feedback.leadChanged',
      );
    } else if (change === 'deactivate') {
      void assignmentWrite(
        readyMission,
        () =>
          updateMissionAssignment(accessToken, missionId, assignment.id, { status: 'INACTIVE' }),
        'missions.feedback.assignmentDeactivated',
      );
    } else {
      void assignmentWrite(
        readyMission,
        () => archiveMissionAssignment(accessToken, missionId, assignment.id),
        'missions.feedback.assignmentArchived',
      );
    }
  }

  // Candidate processes ----------------------------------------------------

  function handleLink(values: ProcessLinkValues): Promise<boolean> {
    if (!readyMission || !access.canCreateProcesses) {
      return Promise.resolve(false);
    }
    const missionId = readyMission.id;
    const isCurrent = captureMissionContext(missionId);
    return runWrite({
      action: 'process',
      failureKey: 'missions.failure.action.process',
      isCurrent,
      onStale: () => refreshMission(missionId),
      request: () =>
        createMissionCandidate(accessToken, missionId, {
          candidateId: values.candidate.id,
          responsibleRecruiterUserId: values.responsibleRecruiterUserId,
          priority: values.priority,
          source: optionalText(values.source),
          sourceContext: optionalText(values.sourceContext),
          internalNotes: optionalText(values.internalNotes),
        }),
      onSuccess: () => {
        setFeedback({ tone: 'success', key: 'missions.feedback.candidateLinked' });
        void loadProcesses(missionId, isCurrent, true, 1);
      },
    });
  }

  function processWrite<T extends { candidateProcess: MissionCandidateSummary }>(
    request: () => Promise<T>,
    feedbackFor: (process: MissionCandidateSummary) => MissionFeedback,
  ): Promise<boolean> {
    if (!readyMission || !activeProcess) {
      return Promise.resolve(false);
    }
    const mission = readyMission;
    const processId = activeProcess.id;
    const isMission = captureMissionContext(mission.id);
    return runWrite({
      action: 'process',
      failureKey: 'missions.failure.action.process',
      isCurrent: isMission,
      onStale: () => {
        refreshMission(mission.id);
        refreshProcess(mission, processId);
      },
      request,
      onSuccess: (result) => {
        replaceProcess(result.candidateProcess);
        setFeedback(feedbackFor(result.candidateProcess));
        refreshProcess(mission, processId);
      },
    });
  }

  function handleProcessMove(state: MissionCandidateState): void {
    if (!readyMission || !activeProcess || !access.canTransitionProcesses) {
      return;
    }
    const missionId = readyMission.id;
    const process = activeProcess;
    const labelKey = processStateLabelKey(state);
    if (
      !confirmed(
        t('missions.process.confirmMove', {
          name: process.candidate.displayName,
          state: t(labelKey),
        }),
      )
    ) {
      return;
    }
    void processWrite(
      () =>
        transitionMissionCandidate(accessToken, missionId, process.id, {
          state,
          reason: 'Updated from the protected mission workspace.',
          skip: isOptionalProcessSkip(process.state, state),
        }),
      () => ({ tone: 'success', key: 'missions.feedback.processMoved', labelKey }),
    );
  }

  function handlePresent(): void {
    if (!readyMission || !activeProcess || !access.canPresentProcesses) {
      return;
    }
    const missionId = readyMission.id;
    const process = activeProcess;
    if (!confirmed(t('missions.process.confirmPresent', { name: process.candidate.displayName }))) {
      return;
    }
    void processWrite(
      () =>
        presentMissionCandidate(accessToken, missionId, process.id, {
          reason: 'Explicit client presentation approved.',
        }),
      () => ({ tone: 'success', key: 'missions.feedback.processPresented' }),
    );
  }

  function handleTransfer(values: ProcessTransferValues): Promise<boolean> {
    if (!readyMission || !activeProcess || !access.canTransferProcesses) {
      return Promise.resolve(false);
    }
    const missionId = readyMission.id;
    const process = activeProcess;
    if (
      !confirmed(t('missions.process.transfer.confirm', { name: process.candidate.displayName }))
    ) {
      return Promise.resolve(false);
    }
    return processWrite(
      () =>
        transferMissionCandidate(accessToken, missionId, process.id, {
          responsibleRecruiterUserId: values.responsibleRecruiterUserId,
          reason: values.reason,
        }),
      () => ({ tone: 'success', key: 'missions.feedback.processTransferred' }),
    );
  }

  // Offers and placements --------------------------------------------------

  function offerWrite<T>(
    request: (missionId: string, processId: string) => Promise<T>,
    commit: (result: T, mission: MissionSummary, processId: string) => void,
    options: { action?: MissionPendingAction; failureKey?: PlainMessageKey; refreshList?: boolean },
  ): Promise<boolean> {
    if (!readyMission || !activeProcess) {
      return Promise.resolve(false);
    }
    const mission = readyMission;
    const processId = activeProcess.id;
    return runWrite({
      action: options.action ?? 'offer',
      failureKey: options.failureKey ?? 'missions.failure.action.offer',
      isCurrent: captureProcessContext(mission.id, processId),
      onStale: () => refreshProcess(mission, processId),
      refreshList: options.refreshList,
      request: () => request(mission.id, processId),
      onSuccess: (result) => commit(result, mission, processId),
    });
  }

  function commitOffer(next: OfferAggregate, key: MessageKey, labelKey?: PlainMessageKey) {
    setOffer({ status: 'ready', data: next });
    setFeedback({ tone: 'success', key, labelKey });
  }

  function handleCreateOffer(values: OfferCreateValues): Promise<boolean> {
    if (!access.canCreateOffers) {
      return Promise.resolve(false);
    }
    const currency = optionalText(values.offeredSalaryCurrency)?.toUpperCase();
    const startDate = values.proposedStartDate.trim();
    return offerWrite(
      (missionId, processId) =>
        createMissionCandidateOffer(accessToken, missionId, processId, {
          offeredSalaryAmountCents: values.offeredSalaryAmountCents ?? undefined,
          offeredSalaryCurrency: currency,
          contractType: optionalText(values.contractType),
          proposedStartDate: startDate ? `${startDate}T00:00:00.000Z` : undefined,
          probationPeriod: optionalText(values.probationPeriod),
          clientFacingRemarks: optionalText(values.clientFacingRemarks),
          internalRecruiterRemarks: optionalText(values.internalRecruiterRemarks),
        }),
      (response) => commitOffer(response.offer, 'missions.feedback.offerCreated'),
      {},
    );
  }

  function currentVersion(current: OfferAggregate) {
    return current.versions.find((version) => version.id === current.currentVersionId) ?? null;
  }

  function handleRevise(current: OfferAggregate): void {
    const version = currentVersion(current);
    if (!version || !access.canUpdateOffers || !confirmed(t('missions.offers.confirmRevise'))) {
      return;
    }
    void offerWrite(
      (missionId, processId) =>
        reviseMissionCandidateOffer(accessToken, missionId, processId, version.id, {
          reason: 'Offer revised from the protected mission workspace.',
          offeredSalaryAmountCents: version.offeredSalaryAmountCents ?? undefined,
          offeredSalaryCurrency: version.offeredSalaryCurrency ?? undefined,
          contractType: version.contractType ?? undefined,
          proposedStartDate: version.proposedStartDate ?? undefined,
          probationPeriod: version.probationPeriod ?? undefined,
          clientFacingRemarks: version.clientFacingRemarks ?? undefined,
          internalRecruiterRemarks: version.internalRecruiterRemarks ?? undefined,
        }),
      (response) => commitOffer(response.offer, 'missions.feedback.offerRevised'),
      {},
    );
  }

  function handleMarkSent(current: OfferAggregate): void {
    const version = currentVersion(current);
    if (!version || !access.canSendOffers || !confirmed(t('missions.offers.confirmMarkSent'))) {
      return;
    }
    void offerWrite(
      (missionId, processId) =>
        markMissionCandidateOfferSent(accessToken, missionId, processId, version.id, {
          reason: 'Offer sent by staff.',
        }),
      (response) => commitOffer(response.offer, 'missions.feedback.offerSent'),
      {},
    );
  }

  function handleOfferResponse(current: OfferAggregate, status: OfferResponseStatus): void {
    const version = currentVersion(current);
    const labelKey = offerStatusLabelKey(status);
    if (
      !version ||
      !access.canRecordOfferResponses ||
      !confirmed(t('missions.offers.confirmResponse', { status: t(labelKey) }))
    ) {
      return;
    }
    void offerWrite(
      (missionId, processId) =>
        recordMissionCandidateOfferResponse(accessToken, missionId, processId, version.id, {
          status,
          reason:
            status === 'REJECTED'
              ? 'Candidate rejected the offer.'
              : `Offer response recorded as ${status}.`,
        }),
      (response) => commitOffer(response.offer, 'missions.feedback.offerResponse', labelKey),
      {},
    );
  }

  function handleWithdraw(current: OfferAggregate): void {
    const version = currentVersion(current);
    if (!version || !access.canWithdrawOffers || !confirmed(t('missions.offers.confirmWithdraw'))) {
      return;
    }
    void offerWrite(
      (missionId, processId) =>
        withdrawMissionCandidateOffer(accessToken, missionId, processId, version.id, {
          reason: 'Offer withdrawn by staff.',
        }),
      (response) => commitOffer(response.offer, 'missions.feedback.offerWithdrawn'),
      {},
    );
  }

  function commitPlacement(
    next: MissionPlacement | null,
    key: PlainMessageKey,
    mission: MissionSummary,
  ): void {
    setPlacement({ status: 'ready', data: next });
    setFeedback({ tone: 'success', key });
    refreshMission(mission.id);
  }

  function handleConfirmPlacement(current: OfferAggregate): void {
    const version = currentVersion(current);
    if (
      !version ||
      !access.canConfirmPlacements ||
      !confirmed(t('missions.placements.confirmConfirm'))
    ) {
      return;
    }
    void offerWrite(
      (missionId, processId) =>
        confirmMissionCandidatePlacement(accessToken, missionId, processId, version.id, {
          integrationStartDate: new Date().toISOString(),
          eligibleForInvoicing: false,
          operationalNote: 'Placement confirmed from the protected mission workspace.',
        }),
      (response, mission) =>
        commitPlacement(response.placement, 'missions.feedback.placementConfirmed', mission),
      {
        action: 'placement',
        failureKey: 'missions.failure.action.placement',
        refreshList: true,
      },
    );
  }

  function handleCorrectPlacement(): void {
    if (!access.canCorrectPlacements || !confirmed(t('missions.placements.confirmCorrect'))) {
      return;
    }
    void offerWrite(
      (missionId, processId) =>
        correctMissionCandidatePlacement(accessToken, missionId, processId, {
          reason: 'ADMINISTRATIVE_ERROR',
          comment: 'Placement corrected from the protected mission workspace.',
        }),
      (response, mission) =>
        commitPlacement(response.placement, 'missions.feedback.placementCorrected', mission),
      {
        action: 'placement',
        failureKey: 'missions.failure.action.placement',
        refreshList: true,
      },
    );
  }

  // Interviews and evaluations ---------------------------------------------

  function interviewWrite<T>(
    request: (missionId: string, processId: string) => Promise<T>,
    successKey: PlainMessageKey,
    after?: () => void,
  ): Promise<boolean> {
    if (!readyMission || !activeProcess) {
      return Promise.resolve(false);
    }
    const missionId = readyMission.id;
    const processId = activeProcess.id;
    const isCurrent = captureProcessContext(missionId, processId);
    const reload = () => void loadInterviews(missionId, processId, isCurrent, true);
    return runWrite({
      action: 'interview',
      failureKey: 'missions.failure.action.interview',
      isCurrent,
      onStale: reload,
      request: () => request(missionId, processId),
      onSuccess: () => {
        setFeedback({ tone: 'success', key: successKey });
        after?.();
        reload();
      },
    });
  }

  function handleSchedule(input: InterviewScheduleRequest): Promise<boolean> {
    if (!access.canScheduleInterviews) {
      return Promise.resolve(false);
    }
    return interviewWrite(
      (missionId, processId) => scheduleInterview(accessToken, missionId, processId, input),
      'missions.feedback.interviewScheduled',
    );
  }

  function handleReschedule(
    interview: InterviewSummary,
    input: InterviewRescheduleRequest,
  ): Promise<boolean> {
    if (!access.canRescheduleInterviews) {
      return Promise.resolve(false);
    }
    return interviewWrite(
      (missionId, processId) =>
        rescheduleInterview(accessToken, missionId, processId, interview.id, input),
      'missions.feedback.interviewRescheduled',
    );
  }

  function handleInterviewAction(interview: InterviewSummary, action: InterviewAction): void {
    const allowed = {
      archive: access.canArchiveInterviews,
      cancel: access.canCancelInterviews,
      complete: access.canCompleteInterviews,
      postpone: access.canRescheduleInterviews,
    };
    const prompts = {
      archive: t('missions.interviews.confirmArchive'),
      cancel: t('missions.interviews.confirmCancel'),
      complete: t('missions.interviews.confirmComplete'),
      postpone: t('missions.interviews.confirmPostpone'),
    };
    if (!allowed[action] || !confirmed(prompts[action])) {
      return;
    }
    const interviewId = interview.id;
    const collapse = () => {
      if (action === 'archive' && activeInterviewRef.current === interviewId) {
        interviewGeneration.current += 1;
        activeInterviewRef.current = null;
        setActiveInterviewId(null);
        setEvaluations(IDLE);
      }
    };
    if (action === 'postpone') {
      void interviewWrite(
        (missionId, processId) =>
          postponeInterview(accessToken, missionId, processId, interviewId, {
            reason: 'Updated from the protected mission workspace.',
          }),
        'missions.feedback.interviewPostponed',
      );
    } else if (action === 'complete') {
      void interviewWrite(
        (missionId, processId) =>
          completeInterview(accessToken, missionId, processId, interviewId, {
            outcome: 'Completed from the protected mission workspace.',
          }),
        'missions.feedback.interviewCompleted',
      );
    } else if (action === 'cancel') {
      void interviewWrite(
        (missionId, processId) =>
          cancelInterview(accessToken, missionId, processId, interviewId, {
            reason: 'Canceled from the protected mission workspace.',
          }),
        'missions.feedback.interviewCanceled',
      );
    } else {
      void interviewWrite(
        (missionId, processId) => archiveInterview(accessToken, missionId, processId, interviewId),
        'missions.feedback.interviewArchived',
        collapse,
      );
    }
  }

  function evaluationWrite<T>(
    request: (missionId: string, processId: string, interviewId: string) => Promise<T>,
    successKey: PlainMessageKey,
  ): Promise<boolean> {
    const interviewId = activeInterviewRef.current;
    if (!readyMission || !activeProcess || !interviewId) {
      return Promise.resolve(false);
    }
    const missionId = readyMission.id;
    const processId = activeProcess.id;
    const reload = () => {
      void loadEvaluations(missionId, processId, interviewId, true);
      void loadInterviews(missionId, processId, captureProcessContext(missionId, processId), true);
    };
    return runWrite({
      action: 'evaluation',
      failureKey: 'missions.failure.action.evaluation',
      isCurrent: captureInterviewContext(missionId, processId, interviewId),
      onStale: reload,
      request: () => request(missionId, processId, interviewId),
      onSuccess: () => {
        setFeedback({ tone: 'success', key: successKey });
        reload();
      },
    });
  }

  function handleCreateEvaluation(input: EvaluationCreateRequest): Promise<boolean> {
    if (!access.canCreateEvaluations) {
      return Promise.resolve(false);
    }
    return evaluationWrite(
      (missionId, processId, interviewId) =>
        createEvaluation(accessToken, missionId, processId, interviewId, input),
      'missions.feedback.evaluationSaved',
    );
  }

  function handleFinalizeEvaluation(evaluation: CandidateEvaluation): void {
    if (!access.canFinalizeEvaluations || !confirmed(t('missions.evaluations.confirmFinalize'))) {
      return;
    }
    void evaluationWrite(
      (missionId, processId, interviewId) =>
        finalizeEvaluation(accessToken, missionId, processId, interviewId, evaluation.id),
      'missions.feedback.evaluationFinalized',
    );
  }

  // Public opportunity -------------------------------------------------------

  function publicWrite(
    input: InternalPublicOpportunityUpdateRequest,
    successKey: PlainMessageKey,
    clearDraft: boolean,
  ): void {
    if (!readyMission || !publicOpportunityWritable(publicOpportunity)) {
      return;
    }
    const missionId = readyMission.id;
    const isCurrent = captureMissionContext(missionId);
    void runWrite({
      action: 'publicOpportunity',
      failureKey: 'missions.failure.action.publicOpportunity',
      isCurrent,
      onStale: () => refreshMission(missionId),
      request: () => updateInternalPublicOpportunity(accessToken, missionId, input),
      onSuccess: (updated) => {
        setPublicOpportunity({ status: 'ready', data: updated.publicOpportunity });
        if (clearDraft) {
          setContentLanguageDraft(null);
        }
        setFeedback({ tone: 'success', key: successKey });
      },
    });
  }

  function handleSavePublic(input: InternalPublicOpportunityUpdateRequest): void {
    if (access.canManagePublicOpportunity) {
      publicWrite(input, 'missions.feedback.publicSaved', true);
    }
  }

  function handlePublication(change: PublicationChange): void {
    if (!access.canPublishPublicOpportunity) {
      return;
    }
    const changes: Record<
      PublicationChange,
      [InternalPublicOpportunityUpdateRequest, PlainMessageKey]
    > = {
      disableApplications: [
        { applicationLinkEnabled: false },
        'missions.feedback.publicApplicationsDisabled',
      ],
      enableApplications: [
        { status: 'OPEN', applicationLinkEnabled: true },
        'missions.feedback.publicApplicationsEnabled',
      ],
      list: [{ listedOnWebsite: true }, 'missions.feedback.publicListed'],
      unlist: [{ listedOnWebsite: false }, 'missions.feedback.publicUnlisted'],
    };
    const [input, key] = changes[change];
    publicWrite(input, key, false);
  }

  async function handleCopyLink(opportunity: InternalPublicOpportunity): Promise<void> {
    const url = `${window.location.origin}${publicOpportunityPath(opportunity)}`;
    const isCurrent = captureMissionContext(opportunity.missionId);
    try {
      await navigator.clipboard.writeText(url);
      if (isCurrent()) setFeedback({ tone: 'success', key: 'missions.feedback.linkCopied' });
    } catch {
      if (isCurrent()) setFeedback({ tone: 'warning', key: 'missions.feedback.linkCopyFailed' });
    }
  }

  // ---- option sources ---------------------------------------------------

  const loadClients = (excludeArchived: boolean): LoadPickerOptions | null =>
    access.canViewClients
      ? async (search) => {
          const response = await listClients({
            accessToken,
            page: 1,
            pageSize: MISSION_OPTION_PAGE_SIZE,
            search: search || undefined,
          });
          return response.clients
            .filter((client) => !excludeArchived || client.status !== 'ARCHIVED')
            .map((client) => ({ id: client.id, label: client.name, detail: client.city }));
        }
      : null;

  const loadCandidateOptions: LoadPickerOptions | null = access.canViewCandidates
    ? async (search) => {
        const response = await listCandidates({
          accessToken,
          page: 1,
          pageSize: MISSION_OPTION_PAGE_SIZE,
          search: search || undefined,
        });
        return response.candidates
          .filter((candidate) => candidate.status !== 'ARCHIVED' && candidate.archivedAt === null)
          .map((candidate) => ({
            id: candidate.id,
            label: candidate.displayName,
            detail: candidate.email,
          }));
      }
    : null;

  const loadUserOptions =
    (role: MissionAssignmentSummary['role']): LoadPickerOptions =>
    async (search) => {
      const missionId = selectedMissionRef.current;
      if (!missionId) {
        return [];
      }
      const response = await listMissionAssignmentUserOptions(accessToken, missionId, {
        search: search || undefined,
        role,
      });
      return response.users.map((user) => ({
        id: user.id,
        label: user.displayName,
        detail: user.email,
      }));
    };

  const activeAssignments =
    sectionData(assignments)?.filter(
      (assignment) => assignment.status === 'ACTIVE' && assignment.archivedAt === null,
    ) ?? [];
  const team = access.canViewAssignments ? uniqueMembers(activeAssignments, () => null) : null;
  const recruiters = access.canViewAssignments
    ? uniqueMembers(
        activeAssignments.filter((assignment) => RESPONSIBLE_RECRUITER_ROLES.has(assignment.role)),
        (assignment) => t(assignmentRoleLabelKey(assignment.role)),
      )
    : null;

  const writesLocked = pending !== null;
  const sessionKey = `session-${session.key}`;

  return (
    <MissionsWorkspace
      access={access}
      create={{ loadClientOptions: loadClients(true), onCreate: handleCreate }}
      detail={{
        applications,
        assignments: {
          assignments,
          loadUserOptions,
          onArchive: (assignment) => handleAssignmentChange(assignment, 'archive'),
          onCreate: handleCreateAssignment,
          onDeactivate: (assignment) => handleAssignmentChange(assignment, 'deactivate'),
          onMakeLead: (assignment) => handleAssignmentChange(assignment, 'lead'),
          onRetry: () => {
            if (readyMission) {
              void loadAssignments(readyMission.id, captureMissionContext(readyMission.id), false);
            }
          },
        },
        detail,
        lifecycle: { onArchive: handleArchive, onClose: handleClose, onMove: handleMove },
        onRetryApplications: () => {
          if (readyMission) {
            void loadApplications(readyMission.id, captureMissionContext(readyMission.id), false);
          }
        },
        pipeline: {
          activeProcessId,
          loadCandidateOptions,
          onLink: handleLink,
          onOpen: openProcess,
          onPage: goToProcessPage,
          openProcessLeftPage: processLeftPage,
          onRetry: () => {
            if (readyMission) {
              void loadProcesses(readyMission.id, captureMissionContext(readyMission.id), false);
            }
          },
          processes,
          recruiters,
        },
        processContext: {
          evaluations: {
            evaluations,
            onCreate: handleCreateEvaluation,
            onFinalize: handleFinalizeEvaluation,
            onRetry: () => {
              if (readyMission && activeProcessId && activeInterviewId) {
                void loadEvaluations(readyMission.id, activeProcessId, activeInterviewId, false);
              }
            },
          },
          interviews: {
            activeInterviewId,
            clientContacts,
            interviews,
            onAction: handleInterviewAction,
            onReschedule: handleReschedule,
            onRetry: () => {
              if (readyMission && activeProcessId) {
                void loadInterviews(
                  readyMission.id,
                  activeProcessId,
                  captureProcessContext(readyMission.id, activeProcessId),
                  false,
                );
              }
            },
            onSchedule: handleSchedule,
            onToggle: toggleInterview,
          },
          offers: {
            offer,
            onConfirmPlacement: handleConfirmPlacement,
            onCreate: handleCreateOffer,
            onMarkSent: handleMarkSent,
            onResponse: handleOfferResponse,
            onRetry: () => {
              if (readyMission && activeProcessId) {
                void loadProcessContext(readyMission, activeProcessId, false);
              }
            },
            onRevise: handleRevise,
            onWithdraw: handleWithdraw,
          },
          onCorrectPlacement: handleCorrectPlacement,
          onRetryPlacement: () => {
            if (readyMission && activeProcessId) {
              void loadProcessContext(readyMission, activeProcessId, false);
            }
          },
          placement,
          process: activeProcess,
          processModel: {
            onClose: closeProcess,
            onMove: handleProcessMove,
            onPresent: handlePresent,
            onTransfer: handleTransfer,
          },
        },
        profile: {
          editValues,
          onEditValuesChange: setEditValues,
          onSave: handleSave,
        },
        publicOpportunity: {
          contentLanguageDraft,
          onContentLanguageChange: (opportunityId, value) =>
            setContentLanguageDraft({ opportunityId, value }),
          onCopyLink: (opportunity) => void handleCopyLink(opportunity),
          onPublication: handlePublication,
          onRetry: () => {
            if (readyMission) {
              void loadPublicOpportunity(
                readyMission.id,
                captureMissionContext(readyMission.id),
                false,
              );
            }
          },
          onSave: handleSavePublic,
          opportunity: publicOpportunity,
        },
        team,
      }}
      feedback={feedback}
      key={session.key}
      list={{
        appliedFilters: appliedQuery.filters,
        filters,
        list,
        loadClientFilterOptions: loadClients(false),
        onApplyFilters: () => applyQuery({ filters, page: 1 }),
        onFiltersChange: setFilters,
        onPage: (page) => applyQuery({ ...appliedQueryRef.current, page }),
        onResetFilters: () => {
          setFilters(EMPTY_MISSION_FILTERS);
          applyQuery(FIRST_MISSION_PAGE);
        },
        onRetry: () => void loadList(appliedQueryRef.current),
        onSelect: (missionId) => selectMission(missionId),
        selectedId: selectedMissionId,
      }}
      missionDetailRevealToken={missionDetailRevealToken}
      processDetailRevealToken={processDetailRevealToken}
      sessionKey={sessionKey}
      writesLocked={writesLocked}
    />
  );
}
