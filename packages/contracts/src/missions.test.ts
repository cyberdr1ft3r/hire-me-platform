import { describe, expect, it } from 'vitest';

import {
  MISSION_ASSIGNMENT_USER_OPTION_LIMIT,
  MissionAssignmentUserOptionsQuerySchema,
  MissionAssignmentUserOptionsResponseSchema,
} from './missions.js';

describe('MissionAssignmentUserOptionsQuerySchema', () => {
  it('accepts an optional trimmed bounded search and an optional assignment role', () => {
    expect(MissionAssignmentUserOptionsQuerySchema.parse({})).toEqual({});
    expect(
      MissionAssignmentUserOptionsQuerySchema.parse({ search: ' omar ', role: 'SOURCER' }),
    ).toEqual({ search: 'omar', role: 'SOURCER' });
    for (const query of [
      { search: '   ' },
      { search: 'x'.repeat(121) },
      { role: 'OWNER' },
      { role: 'recruiter' },
    ]) {
      expect(MissionAssignmentUserOptionsQuerySchema.safeParse(query).success).toBe(false);
    }
  });
});

describe('MissionAssignmentUserOptionsResponseSchema', () => {
  it('keeps only id, displayName and email', () => {
    const parsed = MissionAssignmentUserOptionsResponseSchema.parse({
      users: [
        {
          displayName: 'Omar Tazi',
          email: 'omar.tazi@example.test',
          id: '00000000-0000-4000-8000-000000000001',
          roles: ['ADMIN'],
          status: 'ACTIVE',
          lastLoginAt: '2026-09-01T00:00:00.000Z',
        },
      ],
    });
    expect(Object.keys(parsed.users[0]!).sort()).toEqual(['displayName', 'email', 'id']);
  });

  it(`rejects more than ${MISSION_ASSIGNMENT_USER_OPTION_LIMIT} users`, () => {
    const users = Array.from({ length: MISSION_ASSIGNMENT_USER_OPTION_LIMIT + 1 }, (_, index) => ({
      displayName: `Person ${index}`,
      email: `person${index}@example.test`,
      id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    }));
    expect(MissionAssignmentUserOptionsResponseSchema.safeParse({ users }).success).toBe(false);
    expect(
      MissionAssignmentUserOptionsResponseSchema.safeParse({
        users: users.slice(0, MISSION_ASSIGNMENT_USER_OPTION_LIMIT),
      }).success,
    ).toBe(true);
  });
});
