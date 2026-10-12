/**
 * D-086 / Issue #168 mission scope for financial (Commercial, Accounting,
 * generated-document, and financial-signing) predicates only.
 *
 * - `ASSIGNED`: a recruitment actor (`missions:view`) without
 *   `mission_candidates:transfer` reaches only missions with an active recruiter
 *   assignment, exactly as before.
 * - `ALL`: either the recruitment transfer override, or a finance actor holding
 *   `recruitment_financial_context:view` without `missions:view`. Callers still
 *   require `clients:view` and the record/client relationship.
 * - `NONE`: mission-linked financial records stay hidden.
 *
 * `missions:view` takes precedence so existing recruitment assignment behaviour is
 * unchanged. This scope never authorizes a Missions, candidate-process, offer,
 * interview, evaluation, or generic placement route.
 */
export type FinancialMissionScope = 'NONE' | 'ASSIGNED' | 'ALL';

export function resolveFinancialMissionScope(access: {
  missionsView: boolean;
  missionCandidatesTransfer: boolean;
  recruitmentFinancialContext: boolean;
}): FinancialMissionScope {
  if (access.missionsView) {
    return access.missionCandidatesTransfer ? 'ALL' : 'ASSIGNED';
  }
  return access.recruitmentFinancialContext ? 'ALL' : 'NONE';
}
