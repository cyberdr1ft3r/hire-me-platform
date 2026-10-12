/**
 * Canonical synthetic permission bundles for Missions tests and disposable
 * browser evidence. These are not production roles (Issue #159 / #110).
 *
 * Production authorization remains permission-derived via `resolveMissionAccess`.
 */

/** Smallest full Missions read-only evidence bundle for regression and audit. */
export const MISSIONS_READ_ONLY_EVIDENCE_PERMISSIONS = [
  'missions:view',
  'mission_assignments:view',
  'mission_candidates:view',
  'interviews:view',
  'evaluations:view',
  'offers:view',
  'placements:view',
  'public_opportunities:view',
  'public_applications:view',
] as const;

export type MissionsReadOnlyEvidencePermission =
  (typeof MISSIONS_READ_ONLY_EVIDENCE_PERMISSIONS)[number];
