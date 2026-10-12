/**
 * D-086 / Issue #168 mission scope for financial (Commercial, Accounting,
 * generated-document, and financial-signing) predicates only.
 *
 * - `ALL`: `recruitment_financial_context:view`, independently of any other grant, or
 *   the recruitment transfer override (`missions:view` + `mission_candidates:transfer`).
 *   Callers still require `clients:view` and the record/client relationship.
 * - `ASSIGNED`: a recruitment actor (`missions:view`) without
 *   `mission_candidates:transfer` and without the financial context reaches only
 *   missions with an active recruiter assignment, exactly as before.
 * - `NONE`: mission-linked financial records stay hidden.
 *
 * Effective permissions are a union, so holding `missions:view` through another role
 * never narrows the financial context back to recruiter assignment. This scope never
 * authorizes a Missions, candidate-process, offer, interview, evaluation, or generic
 * placement route; those keep their own recruitment guards.
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
