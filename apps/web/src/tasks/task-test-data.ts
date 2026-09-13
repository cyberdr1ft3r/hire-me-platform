import type {
  AuthenticatedUser,
  MissionCandidateSummary,
  MissionSummary,
  Notification,
  TaskDetail,
  TaskSummary,
  TaskUserOption,
} from '@hire-me/contracts';

export const TASK_A_ID = '11111111-1111-4111-8111-111111111111';
export const TASK_B_ID = '22222222-2222-4222-8222-222222222222';
export const USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

export const taskUser: AuthenticatedUser = {
  displayName: 'Task Operator',
  email: 'tasks@example.test',
  id: USER_ID,
  permissions: [
    'tasks:view',
    'tasks:create',
    'tasks:update',
    'tasks:assign',
    'tasks:transition',
    'tasks:comment',
    'tasks:reminders:manage',
    'tasks:archive',
    'notifications:view_own',
    'notifications:update_own',
  ],
};

export const taskSummary: TaskSummary = {
  archivedAt: null,
  assigneeUserIds: [USER_ID],
  canceledAt: null,
  completedAt: null,
  context: {
    candidateId: null,
    clientContactId: null,
    clientId: null,
    documentId: null,
    interviewId: null,
    missionCandidateId: null,
    missionPlacementId: null,
    missionRecruiterId: null,
    recruitmentMissionId: null,
    recruitmentOfferId: null,
    recruitmentOfferVersionId: null,
    trainingEnrollmentId: null,
    trainingProgramId: null,
    trainingSessionId: null,
    trainingSessionParticipationId: null,
  },
  createdAt: '2026-09-10T08:00:00.000Z',
  description: 'Confirm the candidate follow-up with the client.',
  dueAt: '2026-09-11T10:00:00.000Z',
  id: TASK_A_ID,
  ownerDisplayName: 'Task Operator',
  ownerUserId: USER_ID,
  priority: 'URGENT',
  startAt: null,
  status: 'OPEN',
  timezone: 'Europe/Paris',
  title: 'Review candidate follow-up',
  updatedAt: '2026-09-10T09:00:00.000Z',
};

export const taskDetail: TaskDetail = {
  ...taskSummary,
  assignments: [
    {
      archivedAt: null,
      assignedAt: '2026-09-10T08:00:00.000Z',
      id: '33333333-3333-4333-8333-333333333333',
      removedAt: null,
      status: 'ACTIVE',
      taskId: TASK_A_ID,
      userDisplayName: 'Task Operator',
      userId: USER_ID,
    },
  ],
  comments: [
    {
      archivedAt: null,
      authorDisplayName: 'Task Operator',
      authorUserId: USER_ID,
      body: 'Client asked for a response before noon.',
      createdAt: '2026-09-10T09:00:00.000Z',
      editedAt: null,
      id: '44444444-4444-4444-8444-444444444444',
      mentionedUserIds: [],
      status: 'ACTIVE',
      taskId: TASK_A_ID,
      updatedAt: '2026-09-10T09:00:00.000Z',
    },
  ],
  history: [],
  reminders: [
    {
      attemptCount: 0,
      canceledAt: null,
      createdAt: '2026-09-10T09:00:00.000Z',
      deliveredAt: null,
      failureReason: null,
      id: '55555555-5555-4555-8555-555555555555',
      recipientDisplayName: 'Task Operator',
      recipientUserId: USER_ID,
      remindAt: '2026-09-11T09:00:00.000Z',
      status: 'PENDING',
      taskId: TASK_A_ID,
      updatedAt: '2026-09-10T09:00:00.000Z',
    },
  ],
};

export const AMINA_ID = 'cccccccc-cccc-4ccc-8ccc-000000000001';
export const OMAR_ID = 'cccccccc-cccc-4ccc-8ccc-000000000002';
export const OMAR_SALES_ID = 'cccccccc-cccc-4ccc-8ccc-000000000003';

/** Synthetic colleagues; two share a name so disambiguation by email is visible. */
export const taskPeople: TaskUserOption[] = [
  { displayName: 'Amina Berrada', email: 'amina.berrada@example.test', id: AMINA_ID },
  { displayName: 'Omar Tazi', email: 'omar.tazi@example.test', id: OMAR_ID },
  { displayName: 'Omar Tazi', email: 'omar.tazi.sales@example.test', id: OMAR_SALES_ID },
];

export function taskNotification(overrides: Partial<Notification> = {}): Notification {
  return {
    actorUserId: null,
    archivedAt: null,
    bodySummary: 'A task is overdue.',
    createdAt: '2026-09-12T08:00:00.000Z',
    documentId: null,
    id: '77777777-7777-4777-8777-777777777777',
    interviewId: null,
    missionCandidateId: null,
    readAt: null,
    recipientUserId: USER_ID,
    recruitmentMissionId: null,
    status: 'UNREAD',
    taskId: TASK_A_ID,
    title: 'Task overdue',
    trainingEnrollmentId: null,
    trainingSessionId: null,
    type: 'tasks.overdue',
    updatedAt: '2026-09-12T08:00:00.000Z',
    ...overrides,
  };
}

export const MISSION_A_ID = 'eeeeeeee-eeee-4eee-8eee-000000000001';
export const MISSION_B_ID = 'eeeeeeee-eeee-4eee-8eee-000000000002';
export const MISSION_CANDIDATE_A_ID = 'ffffffff-ffff-4fff-8fff-000000000001';
export const MISSION_CANDIDATE_B_ID = 'ffffffff-ffff-4fff-8fff-000000000002';

/** A synthetic mission as the mission list returns it. */
export function taskMission(id: string, title: string, clientName: string): MissionSummary {
  return {
    applicationDeadline: null,
    archivedAt: null,
    clientId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    clientName,
    closedAt: null,
    closureReason: null,
    commercial: null,
    createdAt: '2026-09-01T08:00:00.000Z',
    description: null,
    engagementType: null,
    filledPlacementCount: 0,
    id,
    location: null,
    numberOfPositions: 1,
    priority: 'NORMAL',
    requirements: null,
    state: 'ACTIVE',
    targetStartDate: null,
    title,
    updatedAt: '2026-09-01T08:00:00.000Z',
    workArrangement: null,
  };
}

/** A synthetic candidate within a mission, as the mission-candidate list returns it. */
export function taskMissionCandidate(
  id: string,
  missionId: string,
  displayName: string,
  email: string,
): MissionCandidateSummary {
  return {
    archivedAt: null,
    candidate: {
      archivedAt: null,
      availabilityNotice: null,
      city: null,
      compensation: null,
      consent: null,
      country: null,
      createdAt: '2026-09-01T08:00:00.000Z',
      currentJobTitle: null,
      displayName,
      email,
      firstName: null,
      id: id.replace('ffffffff', 'abababab'),
      lastName: null,
      linkedinUrl: null,
      normalizedEmail: email,
      phone: null,
      professionalSummary: null,
      source: null,
      sourceDetail: null,
      status: 'ACTIVE',
      updatedAt: '2026-09-01T08:00:00.000Z',
    },
    candidateId: id.replace('ffffffff', 'abababab'),
    clientVisible: false,
    createdAt: '2026-09-01T08:00:00.000Z',
    id,
    internalNotes: null,
    missionId,
    outcomeReason: null,
    placementConfirmedAt: null,
    presentedAt: null,
    priority: 'NORMAL',
    rank: null,
    responsibleRecruiterDisplayName: 'Task Operator',
    responsibleRecruiterUserId: USER_ID,
    source: null,
    sourceContext: null,
    state: 'NEW',
    updatedAt: '2026-09-01T08:00:00.000Z',
  };
}

/** Matches any UUID, to prove none is rendered as human-facing text. */
export const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
