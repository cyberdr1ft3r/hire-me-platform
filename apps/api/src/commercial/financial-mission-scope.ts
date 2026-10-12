/**
 * D-086 / Issue #168 mission scope for financial (Commercial, Accounting,
 * generated-document, and financial-signing) predicates only.
 *
 * - `ASSIGNED`: a recruitment actor (`missions:view`) without
 *   `mission_candidates:transfer` reaches only missions with an active recruiter
 *   assignment, exactly as before.
 * - `ALL`: `recruitment_financial_context:view` (bounded finance authority, still
 *   requires `clients:view` and the record/client relationship), or a recruitment
 *   actor with `mission_candidates:transfer`.
 * - `ASSIGNED`: recruitment actor with `missions:view` only (active recruiter row).
 * - `NONE`: mission-linked financial records stay hidden.
 *
 * On financial paths only, `recruitment_financial_context:view` is independent of
 * `missions:view` so hybrid finance+recruitment roles do not lose client-scoped
 * financial visibility when they lack recruiter assignment. Generic Missions,
 * candidate-process, offer, interview, evaluation, and placement routes keep
 * their existing recruitment guards.
 */
export type FinancialMissionScope = 'NONE' | 'ASSIGNED' | 'ALL';

export function resolveFinancialMissionScope(access: {
  missionsView: boolean;
  missionCandidatesTransfer: boolean;
  recruitmentFinancialContext: boolean;
}): FinancialMissionScope {
  if (access.recruitmentFinancialContext) {
    return 'ALL';
  }
  if (access.missionsView) {
    return access.missionCandidatesTransfer ? 'ALL' : 'ASSIGNED';
  }
  return 'NONE';
}
