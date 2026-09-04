export const REPORTING_PERMISSIONS = {
  RECRUITMENT_VIEW: 'reporting:recruitment:view',
  RECRUITMENT_EXPORT: 'reporting:recruitment:export',
} as const;

// Reporting record scope reuses the broad cross-mission oversight signal enforced
// by the mission-candidate process module (see MissionCandidatesService
// assertMissionProcessScope). Actors without this permission are limited to
// missions where they hold an active MissionRecruiter assignment.
export const REPORTING_BROAD_SCOPE_PERMISSION = 'mission_candidates:transfer';

// The composite recruitment reporting surface aggregates missions, mission-candidate
// processes, public applications, interviews, offers, and placements. Reporting must
// not become a side channel around the operational APIs, so every reporting endpoint
// additionally requires the exact underlying operational read capabilities that guard
// those operational endpoints. These are the authoritative codes used by the merged
// missions and public-applications controllers.
export const REPORTING_REQUIRED_OPERATIONAL_READS = [
  'missions:view',
  'mission_candidates:view',
  'public_applications:view',
  'interviews:view',
  'offers:view',
  'placements:view',
] as const;

// Read endpoints require the reporting view capability plus every underlying read.
export const REPORTING_VIEW_REQUIRED_PERMISSIONS = [
  REPORTING_PERMISSIONS.RECRUITMENT_VIEW,
  ...REPORTING_REQUIRED_OPERATIONAL_READS,
] as const;

// CSV export additionally requires the dedicated export capability.
export const REPORTING_EXPORT_REQUIRED_PERMISSIONS = [
  REPORTING_PERMISSIONS.RECRUITMENT_EXPORT,
  ...REPORTING_VIEW_REQUIRED_PERMISSIONS,
] as const;
