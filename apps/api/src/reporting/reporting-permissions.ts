export const REPORTING_PERMISSIONS = {
  RECRUITMENT_VIEW: 'reporting:recruitment:view',
  RECRUITMENT_EXPORT: 'reporting:recruitment:export',
} as const;

// Reporting record scope reuses the broad cross-mission oversight signal enforced
// by the mission-candidate process module (see MissionCandidatesService
// assertMissionProcessScope). Actors without this permission are limited to
// missions where they hold an active MissionRecruiter assignment.
export const REPORTING_BROAD_SCOPE_PERMISSION = 'mission_candidates:transfer';
