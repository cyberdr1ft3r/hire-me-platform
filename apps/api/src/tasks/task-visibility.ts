import type { Prisma } from '../persistence/prisma/generated-client.js';
import { TaskAssignmentStatus } from '../persistence/prisma/generated-client.js';
import { TASK_PERMISSIONS } from './task-permissions.js';

export type TaskAccess = {
  view: boolean;
  viewAll: boolean;
  create: boolean;
  update: boolean;
  assign: boolean;
  transition: boolean;
  comment: boolean;
  remindersManage: boolean;
  archive: boolean;
};

export function taskAccessFromPermissions(permissions: ReadonlySet<string>): TaskAccess {
  return {
    view: permissions.has(TASK_PERMISSIONS.TASKS_VIEW),
    viewAll: permissions.has(TASK_PERMISSIONS.TASKS_VIEW_ALL),
    create: permissions.has(TASK_PERMISSIONS.TASKS_CREATE),
    update: permissions.has(TASK_PERMISSIONS.TASKS_UPDATE),
    assign: permissions.has(TASK_PERMISSIONS.TASKS_ASSIGN),
    transition: permissions.has(TASK_PERMISSIONS.TASKS_TRANSITION),
    comment: permissions.has(TASK_PERMISSIONS.TASKS_COMMENT),
    remindersManage: permissions.has(TASK_PERMISSIONS.TASKS_REMINDERS_MANAGE),
    archive: permissions.has(TASK_PERMISSIONS.TASKS_ARCHIVE),
  };
}

/** Server-authoritative task list/detail visibility predicate (Issue #31). */
export function buildVisibleTaskWhere(
  actorUserId: string,
  access: TaskAccess,
): Prisma.TaskWhereInput {
  if (access.viewAll) {
    return {};
  }
  if (!access.view) {
    return { id: '00000000-0000-0000-0000-000000000000' };
  }
  return {
    archivedAt: null,
    OR: [
      { ownerUserId: actorUserId },
      { createdByUserId: actorUserId },
      {
        assignments: {
          some: { userId: actorUserId, status: TaskAssignmentStatus.ACTIVE, archivedAt: null },
        },
      },
      {
        recruitmentMission: {
          recruiters: {
            some: { userId: actorUserId, status: 'ACTIVE', archivedAt: null },
          },
        },
      },
      {
        missionCandidate: {
          mission: {
            recruiters: {
              some: { userId: actorUserId, status: 'ACTIVE', archivedAt: null },
            },
          },
        },
      },
      {
        interview: {
          missionCandidate: {
            mission: {
              recruiters: {
                some: { userId: actorUserId, status: 'ACTIVE', archivedAt: null },
              },
            },
          },
        },
      },
      {
        recruitmentOffer: {
          mission: {
            recruiters: {
              some: { userId: actorUserId, status: 'ACTIVE', archivedAt: null },
            },
          },
        },
      },
      {
        recruitmentOfferVersion: {
          mission: {
            recruiters: {
              some: { userId: actorUserId, status: 'ACTIVE', archivedAt: null },
            },
          },
        },
      },
      {
        missionPlacement: {
          mission: {
            recruiters: {
              some: { userId: actorUserId, status: 'ACTIVE', archivedAt: null },
            },
          },
        },
      },
    ],
  };
}
