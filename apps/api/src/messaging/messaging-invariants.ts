import {
  GROUP_MAX_ACTIVE_MEMBERS,
  GROUP_MIN_MEMBERS_AT_CREATION,
  GroupTitleSchema,
} from '@hire-me/contracts';

/**
 * Pure D-087 invariant rules shared by the transactional helpers in
 * MessagingAccessService. They hold no state and touch no database.
 */

const CANONICAL_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export class MessagingInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MessagingInvariantError';
  }
}

/**
 * Canonical identity of a direct (PRIVATE) conversation: the two user UUIDs,
 * lower-cased, ordered, joined by ":". The inputs must be database UUIDs (they
 * come from `User.id`), never free text; anything else is rejected, so the key
 * can only ever name two real, distinct user identifiers. The database repeats
 * the format and ordering rule as a CHECK and makes the key UNIQUE.
 */
export function canonicalDirectKey(firstUserId: string, secondUserId: string): string {
  const first = firstUserId.toLowerCase();
  const second = secondUserId.toLowerCase();
  if (!CANONICAL_UUID.test(first) || !CANONICAL_UUID.test(second)) {
    throw new MessagingInvariantError('A direct conversation key needs two user UUIDs.');
  }
  if (first === second) {
    throw new MessagingInvariantError('A direct conversation needs two different users.');
  }
  return first < second ? `${first}:${second}` : `${second}:${first}`;
}

export interface PlannedMember {
  userId: string;
  role: 'OWNER' | 'MEMBER';
}

/** A direct conversation always has exactly these two MEMBER rows, no owner. */
export function planDirectMembers(actorUserId: string, counterpartUserId: string): PlannedMember[] {
  const key = canonicalDirectKey(actorUserId, counterpartUserId);
  return key.split(':').map((userId) => ({ userId, role: 'MEMBER' as const }));
}

export interface PlannedGroup {
  title: string;
  members: PlannedMember[];
}

/**
 * A group starts with the creator as OWNER plus the other members, 3-50 distinct
 * people in total, and a trimmed 1-120 character title.
 */
export function planGroup(
  creatorUserId: string,
  otherMemberUserIds: readonly string[],
  title: string,
): PlannedGroup {
  const parsedTitle = GroupTitleSchema.safeParse(title);
  if (!parsedTitle.success) {
    throw new MessagingInvariantError('A group needs a 1-120 character title.');
  }
  const creator = creatorUserId.toLowerCase();
  const others = [...new Set(otherMemberUserIds.map((id) => id.toLowerCase()))].filter(
    (id) => id !== creator,
  );
  for (const id of [creator, ...others]) {
    if (!CANONICAL_UUID.test(id)) {
      throw new MessagingInvariantError('Group members must be user UUIDs.');
    }
  }
  const total = others.length + 1;
  if (total < GROUP_MIN_MEMBERS_AT_CREATION || total > GROUP_MAX_ACTIVE_MEMBERS) {
    throw new MessagingInvariantError(
      `A group starts with ${GROUP_MIN_MEMBERS_AT_CREATION}-${GROUP_MAX_ACTIVE_MEMBERS} members.`,
    );
  }
  return {
    title: parsedTitle.data,
    members: [
      { userId: creator, role: 'OWNER' },
      ...others.map((userId) => ({ userId, role: 'MEMBER' as const })),
    ],
  };
}

/** True when `adding` more active members still fits the group cap. */
export function groupHasCapacity(activeMemberCount: number, adding: number): boolean {
  return activeMemberCount + adding <= GROUP_MAX_ACTIVE_MEMBERS;
}

/**
 * The late-join confidentiality rule. A member whose `historyAfterSequence` is N
 * may read only messages with `sequence > N`: never N itself, which was already
 * sent before they joined.
 */
export function isWithinHistoryWindow(
  messageSequence: bigint,
  historyAfterSequence: bigint,
): boolean {
  return messageSequence > historyAfterSequence;
}
