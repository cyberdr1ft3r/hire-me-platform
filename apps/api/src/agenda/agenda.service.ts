import { Inject, Injectable } from '@nestjs/common';
import type {
  AgendaItem,
  AgendaListQuery,
  AgendaListResponse,
  AgendaView,
} from '@hire-me/contracts';

import { MISSION_PERMISSIONS } from '../missions/mission-permissions.js';
import { MeetingsService } from '../meetings/meetings.service.js';
import { MEETING_PERMISSIONS } from '../meetings/meeting-permissions.js';
import { PermissionsService } from '../auth/permissions.service.js';
import {
  AssignmentStatus,
  InterviewParticipantKind,
  InterviewParticipantStatus,
  Prisma,
  TaskAssignmentStatus,
  TaskReminderStatus,
  TaskStatus,
  TrainingEnrollmentStatus,
} from '../persistence/prisma/generated-client.js';
import { PrismaService } from '../persistence/prisma/prisma.service.js';
import { TRAINING_PERMISSIONS } from '../training/training-permissions.js';
import { buildVisibleTaskWhere, taskAccessFromPermissions } from '../tasks/task-visibility.js';
import { TASK_PERMISSIONS } from '../tasks/task-permissions.js';

const UNMATCHABLE_ID = '00000000-0000-0000-0000-000000000000';
const terminalTaskStatuses: TaskStatus[] = [
  TaskStatus.COMPLETED,
  TaskStatus.CANCELED,
  TaskStatus.ARCHIVED,
];

type AgendaWindow = { from: Date; to: Date; view?: AgendaView };

@Injectable()
export class AgendaService {
  constructor(
    @Inject(PermissionsService) private readonly permissions: PermissionsService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(MeetingsService) private readonly meetings: MeetingsService,
  ) {}

  async listAgenda(actorUserId: string, query: AgendaListQuery): Promise<AgendaListResponse> {
    const permissionCodes = new Set(
      await this.permissions.getEffectivePermissionCodes(actorUserId),
    );
    const window = this.resolveWindow(query);
    const sources = new Set(
      query.sources ?? ['task', 'follow_up', 'interview', 'meeting', 'training'],
    );
    const items: AgendaItem[] = [];

    if (sources.has('task')) {
      items.push(...(await this.loadTaskItems(actorUserId, permissionCodes, window)));
    }
    if (sources.has('follow_up')) {
      items.push(...(await this.loadFollowUpItems(actorUserId, permissionCodes, window)));
    }
    if (sources.has('interview')) {
      items.push(...(await this.loadInterviewItems(actorUserId, permissionCodes, window)));
    }
    if (sources.has('meeting')) {
      items.push(...(await this.loadMeetingItems(actorUserId, permissionCodes, window)));
    }
    if (sources.has('training')) {
      items.push(...(await this.loadTrainingItems(actorUserId, permissionCodes, window)));
    }

    items.sort((left, right) => {
      const leftTime = this.itemSortKey(left);
      const rightTime = this.itemSortKey(right);
      return leftTime.localeCompare(rightTime) || left.id.localeCompare(right.id);
    });

    return {
      items,
      window: {
        from: window.from.toISOString(),
        to: window.to.toISOString(),
        view: window.view,
      },
    };
  }

  private resolveWindow(query: AgendaListQuery): AgendaWindow {
    if (query.from && query.to) {
      const from = new Date(query.from);
      const to = new Date(query.to);
      if (to.getTime() < from.getTime()) {
        return { from, to: from, view: query.view };
      }
      return { from, to, view: query.view };
    }
    const now = new Date();
    const startOfDay = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const endOfDay = new Date(startOfDay.getTime() + 86_400_000 - 1);
    switch (query.view) {
      case 'today':
        return { from: startOfDay, to: endOfDay, view: query.view };
      case 'week':
        return {
          from: startOfDay,
          to: new Date(startOfDay.getTime() + 7 * 86_400_000),
          view: query.view,
        };
      case 'month':
        return {
          from: startOfDay,
          to: new Date(startOfDay.getTime() + 31 * 86_400_000),
          view: query.view,
        };
      case 'overdue':
        return {
          from: new Date(0),
          to: now,
          view: query.view,
        };
      case 'past':
        return {
          from: new Date(0),
          to: now,
          view: query.view,
        };
      case 'upcoming':
      default:
        return {
          from: now,
          to: new Date(now.getTime() + 30 * 86_400_000),
          view: query.view ?? 'upcoming',
        };
    }
  }

  private async loadTaskItems(
    actorUserId: string,
    permissions: ReadonlySet<string>,
    window: AgendaWindow,
  ): Promise<AgendaItem[]> {
    if (!permissions.has(TASK_PERMISSIONS.TASKS_VIEW)) {
      return [];
    }
    const access = taskAccessFromPermissions(permissions);
    const involvement: Prisma.TaskWhereInput = {
      OR: [
        { ownerUserId: actorUserId },
        {
          assignments: {
            some: {
              userId: actorUserId,
              status: TaskAssignmentStatus.ACTIVE,
              archivedAt: null,
            },
          },
        },
      ],
    };
    const dateFilter =
      window.view === 'overdue'
        ? {
            dueAt: { lt: new Date() },
            status: { notIn: terminalTaskStatuses },
            archivedAt: null,
          }
        : {
            OR: [
              { dueAt: { gte: window.from, lte: window.to } },
              { startAt: { gte: window.from, lte: window.to } },
            ],
          };
    const tasks = await this.prisma.task.findMany({
      where: {
        AND: [buildVisibleTaskWhere(actorUserId, access), involvement, dateFilter],
      },
      select: {
        id: true,
        title: true,
        status: true,
        priority: true,
        startAt: true,
        dueAt: true,
        timezone: true,
      },
    });
    return tasks.map((task) => {
      const dueAt = task.dueAt?.toISOString();
      const startAt = task.startAt?.toISOString();
      const overdue =
        Boolean(task.dueAt && task.dueAt.getTime() < Date.now()) &&
        !terminalTaskStatuses.includes(task.status);
      return {
        id: `task:${task.id}`,
        sourceType: 'task',
        sourceId: task.id,
        title: task.title,
        startAt,
        dueAt,
        timezone: task.timezone ?? undefined,
        status: task.status,
        priority: task.priority,
        allDay: false,
        deepLink: `/tasks?task=${task.id}`,
        overdue,
      };
    });
  }

  private async loadFollowUpItems(
    actorUserId: string,
    permissions: ReadonlySet<string>,
    window: AgendaWindow,
  ): Promise<AgendaItem[]> {
    if (!permissions.has(TASK_PERMISSIONS.TASKS_VIEW) || window.view === 'overdue') {
      return [];
    }
    const access = taskAccessFromPermissions(permissions);
    const reminders = await this.prisma.taskReminder.findMany({
      where: {
        recipientUserId: actorUserId,
        status: TaskReminderStatus.PENDING,
        archivedAt: null,
        remindAt: { gte: window.from, lte: window.to },
        task: buildVisibleTaskWhere(actorUserId, access),
      },
      include: {
        task: {
          select: {
            id: true,
            title: true,
            dueAt: true,
            status: true,
            priority: true,
            timezone: true,
          },
        },
      },
    });
    const items: AgendaItem[] = [];
    for (const reminder of reminders) {
      const taskDue = reminder.task.dueAt?.toISOString();
      const remindAt = reminder.remindAt.toISOString();
      if (taskDue && taskDue === remindAt) {
        continue;
      }
      items.push({
        id: `follow_up:${reminder.id}`,
        sourceType: 'follow_up',
        sourceId: reminder.id,
        title: reminder.task.title,
        dueAt: remindAt,
        timezone: reminder.task.timezone ?? undefined,
        status: reminder.status,
        priority: reminder.task.priority,
        allDay: false,
        deepLink: `/tasks?task=${reminder.task.id}`,
      });
    }
    return items;
  }

  private async loadInterviewItems(
    actorUserId: string,
    permissions: ReadonlySet<string>,
    window: AgendaWindow,
  ): Promise<AgendaItem[]> {
    if (!permissions.has(MISSION_PERMISSIONS.INTERVIEWS_VIEW)) {
      return [];
    }
    const missionScope = this.interviewMissionScopeWhere(actorUserId, permissions);
    const involvement: Prisma.InterviewWhereInput = {
      OR: [
        { organizerUserId: actorUserId },
        {
          participants: {
            some: {
              userId: actorUserId,
              kind: InterviewParticipantKind.INTERNAL_USER,
              status: InterviewParticipantStatus.ACTIVE,
              archivedAt: null,
            },
          },
        },
      ],
    };
    const timeFilter =
      window.view === 'past'
        ? { scheduledStartAt: { lt: window.to } }
        : { scheduledStartAt: { gte: window.from, lte: window.to } };
    const interviews = await this.prisma.interview.findMany({
      where: {
        AND: [involvement, missionScope, timeFilter],
      },
      include: {
        missionCandidate: {
          select: { id: true, missionId: true },
        },
      },
    });
    return interviews.map((interview) => {
      const missionId = interview.missionCandidate.missionId;
      const processId = interview.missionCandidateId;
      return {
        id: `interview:${interview.id}`,
        sourceType: 'interview',
        sourceId: interview.id,
        title: `Interview (${interview.type})`,
        startAt: interview.scheduledStartAt.toISOString(),
        endAt: interview.scheduledEndAt?.toISOString(),
        timezone: interview.timezone,
        status: interview.status,
        allDay: false,
        deepLink: `/missions?mission=${missionId}&process=${processId}&interview=${interview.id}`,
      };
    });
  }

  private interviewMissionScopeWhere(
    actorUserId: string,
    permissions: ReadonlySet<string>,
  ): Prisma.InterviewWhereInput {
    if (
      permissions.has(MISSION_PERMISSIONS.INTERVIEWS_ARCHIVE) ||
      permissions.has(MISSION_PERMISSIONS.EVALUATIONS_INTERNAL_VIEW)
    ) {
      return {};
    }
    return {
      missionCandidate: {
        mission: {
          recruiters: {
            some: {
              userId: actorUserId,
              status: AssignmentStatus.ACTIVE,
              archivedAt: null,
            },
          },
        },
      },
    };
  }

  private async loadMeetingItems(
    actorUserId: string,
    permissions: ReadonlySet<string>,
    window: AgendaWindow,
  ): Promise<AgendaItem[]> {
    if (!permissions.has(MEETING_PERMISSIONS.MEETINGS_VIEW)) {
      return [];
    }
    const timeFilter =
      window.view === 'past'
        ? { scheduledStartAt: { lt: window.to } }
        : { scheduledStartAt: { gte: window.from, lte: window.to } };
    const meetings = await this.prisma.meeting.findMany({
      where: {
        AND: [this.meetings.visibleMeetingWhere(actorUserId), timeFilter],
      },
      select: {
        id: true,
        title: true,
        status: true,
        scheduledStartAt: true,
        scheduledEndAt: true,
        timezone: true,
      },
    });
    return meetings.map((meeting) => ({
      id: `meeting:${meeting.id}`,
      sourceType: 'meeting',
      sourceId: meeting.id,
      title: meeting.title,
      startAt: meeting.scheduledStartAt.toISOString(),
      endAt: meeting.scheduledEndAt?.toISOString(),
      timezone: meeting.timezone,
      status: meeting.status,
      allDay: false,
      deepLink: `/agenda?meeting=${meeting.id}`,
    }));
  }

  private async loadTrainingItems(
    actorUserId: string,
    permissions: ReadonlySet<string>,
    window: AgendaWindow,
  ): Promise<AgendaItem[]> {
    if (!permissions.has(TRAINING_PERMISSIONS.TRAINING_PROGRAMS_VIEW)) {
      return [];
    }
    const programWhere = this.visibleTrainingProgramWhere(actorUserId, permissions);
    const involvement: Prisma.TrainingSessionWhereInput = {
      OR: [
        { trainerUserId: actorUserId },
        {
          participations: {
            some: {
              archivedAt: null,
              enrollment: {
                userId: actorUserId,
                archivedAt: null,
                status: {
                  notIn: [TrainingEnrollmentStatus.CANCELED, TrainingEnrollmentStatus.REJECTED],
                },
              },
            },
          },
        },
      ],
    };
    const timeFilter =
      window.view === 'past'
        ? { scheduledAt: { lt: window.to } }
        : { scheduledAt: { gte: window.from, lte: window.to } };
    const sessions = await this.prisma.trainingSession.findMany({
      where: {
        AND: [{ program: programWhere }, involvement, timeFilter, { archivedAt: null }],
      },
      select: {
        id: true,
        title: true,
        status: true,
        scheduledAt: true,
        scheduledEndAt: true,
        trainingProgramId: true,
      },
    });
    return sessions.map((session) => ({
      id: `training:${session.id}`,
      sourceType: 'training',
      sourceId: session.id,
      title: session.title,
      startAt: session.scheduledAt.toISOString(),
      endAt: session.scheduledEndAt?.toISOString(),
      status: session.status,
      allDay: false,
      deepLink: `/training?program=${session.trainingProgramId}&session=${session.id}`,
    }));
  }

  private visibleTrainingProgramWhere(
    actorUserId: string,
    permissions: ReadonlySet<string>,
  ): Prisma.TrainingProgramWhereInput {
    const programView = permissions.has(TRAINING_PERMISSIONS.TRAINING_PROGRAMS_VIEW);
    const programViewAll = permissions.has(TRAINING_PERMISSIONS.TRAINING_PROGRAMS_VIEW_ALL);
    if (!programView && !programViewAll) {
      return { id: UNMATCHABLE_ID };
    }
    const clientScope: Prisma.TrainingProgramWhereInput = permissions.has(
      TRAINING_PERMISSIONS.CLIENTS_VIEW,
    )
      ? {}
      : { clientId: null };
    if (programViewAll) {
      return clientScope;
    }
    return {
      AND: [
        clientScope,
        {
          OR: [
            { ownerUserId: actorUserId },
            { sessions: { some: { trainerUserId: actorUserId } } },
            {
              enrollments: {
                some: {
                  userId: actorUserId,
                  archivedAt: null,
                },
              },
            },
          ],
        },
      ],
    };
  }

  private itemSortKey(item: AgendaItem): string {
    return item.startAt ?? item.dueAt ?? '9999-12-31T23:59:59.999Z';
  }
}
