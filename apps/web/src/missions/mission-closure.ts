import type { MissionLifecycleState } from '@hire-me/contracts';

import type { MissionClosureState } from './mission-labels.js';

/**
 * Closure outcomes allowed from each mission state. Mirrors
 * `allowedMissionTransitions` in `MissionsService` (closure targets only).
 */
const CLOSURE_TARGETS_BY_STATE: Partial<
  Record<MissionLifecycleState, readonly MissionClosureState[]>
> = {
  DRAFT: ['CANCELED'],
  INTERNAL_VALIDATION: ['CANCELED'],
  ACTIVE: ['CANCELED'],
  JOB_DESCRIPTION_APPROVED: ['CANCELED'],
  CANDIDATE_SOURCING: ['CANCELED', 'DEADLINE_EXPIRED_WITHOUT_RENEWAL'],
  HR_PRESELECTION: ['CANCELED'],
  HR_INTERVIEWS: ['CANCELED'],
  TECHNICAL_TESTS: ['CANCELED'],
  CANDIDATE_PRESENTATION: ['CANCELED', 'CLOSED_WITHOUT_RECRUITMENT'],
  CLIENT_INTERVIEWS: ['CANCELED'],
  FINAL_SELECTION: ['CANCELED'],
  OFFER_SENT: ['CANCELED', 'CLOSED_WITHOUT_RECRUITMENT', 'DEADLINE_EXPIRED_WITHOUT_RENEWAL'],
  CANDIDATE_INTEGRATED: [],
  PROBATION_MONITORING: ['CLOSED_WITH_RECRUITMENT'],
  WAITING_FOR_CLIENT_INFORMATION: [],
  PAUSED: ['CANCELED'],
};

export function closureStatesFrom(state: MissionLifecycleState): MissionClosureState[] {
  return [...(CLOSURE_TARGETS_BY_STATE[state] ?? [])];
}

export function isLegalClosureTransition(
  missionState: MissionLifecycleState,
  closureState: MissionClosureState,
): boolean {
  return closureStatesFrom(missionState).includes(closureState);
}

/** First legal closure outcome for deterministic reset when the prior choice becomes invalid. */
export function defaultClosureState(state: MissionLifecycleState): MissionClosureState | null {
  const legal = closureStatesFrom(state);
  return legal[0] ?? null;
}
