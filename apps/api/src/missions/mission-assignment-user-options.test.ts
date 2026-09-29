import { MissionAssignmentUserOptionsQuerySchema } from '@hire-me/contracts';
import { describe, expect, it } from 'vitest';

import { MISSION_PERMISSIONS } from './mission-permissions.js';
import { MissionsController } from './missions.controller.js';
import { MissionsService } from './missions.service.js';
import { REQUIRED_PERMISSIONS_KEY } from '../auth/permissions.decorator.js';

const MISSION_ID = '22222222-2222-4222-8222-222222222222';

type FindManyArgs = {
  orderBy: unknown;
  select: Record<string, boolean>;
  take: number;
  where: Record<string, unknown>;
};

/** A service over recording fakes: only the assignment user-option lookup is exercised. */
function serviceFor(mission: { state: string; archivedAt: Date | null } | null) {
  const calls: FindManyArgs[] = [];
  const prisma = {
    recruitmentMission: {
      findUnique: () =>
        Promise.resolve(
          mission ? { id: MISSION_ID, client: { name: 'Client' }, ...mission } : null,
        ),
    },
    user: {
      findMany: (args: FindManyArgs) => {
        calls.push(args);
        return Promise.resolve([]);
      },
    },
  };
  const service = new MissionsService({} as never, {} as never, prisma as never);
  return { calls, service };
}

const query = (value: Record<string, string>) =>
  MissionAssignmentUserOptionsQuerySchema.parse(value);

describe('MissionsService assignment user options', () => {
  it('requires mission assignment management on the route', () => {
    const handler = Object.getOwnPropertyDescriptor(
      MissionsController.prototype,
      'listAssignmentUserOptions',
    )?.value as object;
    expect(Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, handler)).toEqual([
      MISSION_PERMISSIONS.MISSION_ASSIGNMENTS_MANAGE,
    ]);
  });

  it('mirrors the assignment write eligibility with three bounded identity fields', async () => {
    const { calls, service } = serviceFor({ state: 'ACTIVE', archivedAt: null });
    await expect(service.listAssignmentUserOptions(MISSION_ID, query({}))).resolves.toEqual({
      users: [],
    });
    expect(calls).toHaveLength(1);
    const args = calls[0]!;
    expect(args.where).toEqual({ status: 'ACTIVE', archivedAt: null, userType: 'INTERNAL' });
    expect(args.select).toEqual({ displayName: true, email: true, id: true });
    expect(args.take).toBe(20);
    expect(args.orderBy).toEqual([{ displayName: 'asc' }, { id: 'asc' }]);
  });

  it('searches name or email and omits only same-mission, same-role active assignees', async () => {
    const { calls, service } = serviceFor({ state: 'CANDIDATE_SOURCING', archivedAt: null });
    await service.listAssignmentUserOptions(
      MISSION_ID,
      query({ search: 'omar', role: 'RECRUITER' }),
    );
    expect(calls[0]!.where).toEqual({
      status: 'ACTIVE',
      archivedAt: null,
      userType: 'INTERNAL',
      OR: [
        { displayName: { contains: 'omar', mode: 'insensitive' } },
        { email: { contains: 'omar', mode: 'insensitive' } },
      ],
      missionRecruiters: {
        none: { missionId: MISSION_ID, role: 'RECRUITER', status: 'ACTIVE', archivedAt: null },
      },
    });
  });

  it('follows the mission route semantics before listing anyone', async () => {
    const missing = serviceFor(null);
    await expect(
      missing.service.listAssignmentUserOptions(MISSION_ID, query({})),
    ).rejects.toMatchObject({ status: 404 });
    expect(missing.calls).toHaveLength(0);

    for (const mission of [
      { state: 'CANCELED', archivedAt: null },
      { state: 'CLOSED_WITH_RECRUITMENT', archivedAt: null },
      { state: 'ARCHIVED', archivedAt: new Date() },
      { state: 'ACTIVE', archivedAt: new Date() },
    ]) {
      const terminal = serviceFor(mission);
      await expect(
        terminal.service.listAssignmentUserOptions(MISSION_ID, query({})),
      ).rejects.toMatchObject({ status: 409 });
      expect(terminal.calls).toHaveLength(0);
    }
  });
});
