/**
 * The candidate permission codes this workspace reads, exactly as the API and
 * the seed define them. The server re-checks every one of them on every
 * request; the interface uses them only to decide what to render.
 */
export const CANDIDATE_PERMISSIONS = {
  archive: 'candidates:archive',
  compensationUpdate: 'candidate_compensation:update',
  compensationView: 'candidate_compensation:view',
  consentManage: 'candidate_consent:manage',
  consentView: 'candidate_consent:view',
  create: 'candidates:create',
  profileManage: 'candidate_profile:manage',
  profileView: 'candidate_profile:view',
  statusManage: 'candidates:status:manage',
  update: 'candidates:update',
  view: 'candidates:view',
} as const;

/**
 * What the current actor may see and do in the Candidate workspace.
 *
 * Every flag is derived from one permission code and nothing else, so the
 * rendering decisions can be reviewed against the permission catalog directly.
 * An unauthorized action is never rendered, not even disabled.
 */
export interface CandidateAccess {
  canArchive: boolean;
  canCreate: boolean;
  canManageProfile: boolean;
  canManageStatus: boolean;
  canUpdate: boolean;
  /** Compensation is shown only with its dedicated view permission. */
  canViewCompensation: boolean;
  /** Consent is shown only with its dedicated view permission. */
  canViewConsent: boolean;
  /**
   * Structured profile records. Without this permission the API returns empty
   * arrays, so the interface must not present them as "none recorded".
   */
  canViewProfile: boolean;
}

export function resolveCandidateAccess(permissions: readonly string[]): CandidateAccess {
  const has = (code: string) => permissions.includes(code);
  return {
    canArchive: has(CANDIDATE_PERMISSIONS.archive),
    canCreate: has(CANDIDATE_PERMISSIONS.create),
    canManageProfile: has(CANDIDATE_PERMISSIONS.profileManage),
    canManageStatus: has(CANDIDATE_PERMISSIONS.statusManage),
    canUpdate: has(CANDIDATE_PERMISSIONS.update),
    canViewCompensation: has(CANDIDATE_PERMISSIONS.compensationView),
    canViewConsent: has(CANDIDATE_PERMISSIONS.consentView),
    canViewProfile: has(CANDIDATE_PERMISSIONS.profileView),
  };
}
