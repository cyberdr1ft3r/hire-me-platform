/**
 * What the Missions workspace may show or offer to one permission set.
 *
 * Every flag mirrors one API permission. It only decides which controls are
 * rendered; the API re-checks each read and write, so hiding a control never
 * grants or removes anything. Option sources follow the same rule: a picker is
 * offered only when the actor already holds the permission its API requires.
 */
export interface MissionAccess {
  canView: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  canManageStatus: boolean;
  canClose: boolean;
  canArchive: boolean;

  canViewAssignments: boolean;
  canManageAssignments: boolean;

  canViewProcesses: boolean;
  canCreateProcesses: boolean;
  canTransitionProcesses: boolean;
  canTransferProcesses: boolean;
  canPresentProcesses: boolean;

  canViewInterviews: boolean;
  canScheduleInterviews: boolean;
  canRescheduleInterviews: boolean;
  canCompleteInterviews: boolean;
  canCancelInterviews: boolean;
  canArchiveInterviews: boolean;

  canViewEvaluations: boolean;
  canCreateEvaluations: boolean;
  canFinalizeEvaluations: boolean;

  canViewOffers: boolean;
  canCreateOffers: boolean;
  canUpdateOffers: boolean;
  canSendOffers: boolean;
  canRecordOfferResponses: boolean;
  canWithdrawOffers: boolean;

  canViewPlacements: boolean;
  canConfirmPlacements: boolean;
  canCorrectPlacements: boolean;
  canViewPlacementCommercialEligibility: boolean;

  canViewPublicOpportunity: boolean;
  canManagePublicOpportunity: boolean;
  canPublishPublicOpportunity: boolean;
  canViewPublicApplications: boolean;

  /** Option sources. */
  canViewClients: boolean;
  canViewCandidates: boolean;
  canViewClientContacts: boolean;

  /** Can see the workspace but holds no Mission-area write permission at all. */
  readOnly: boolean;
}

const WRITE_PERMISSIONS = [
  'missions:create',
  'missions:update',
  'missions:status:manage',
  'missions:closure:manage',
  'missions:archive',
  'mission_assignments:manage',
  'mission_candidates:create',
  'mission_candidates:transition',
  'mission_candidates:transfer',
  'mission_candidates:present',
  'interviews:schedule',
  'interviews:reschedule',
  'interviews:complete',
  'interviews:cancel',
  'interviews:archive',
  'evaluations:create',
  'evaluations:finalize',
  'offers:create',
  'offers:update',
  'offers:send_or_mark_sent',
  'offers:record_response',
  'offers:withdraw',
  'placements:confirm',
  'placements:correct',
  'public_opportunities:manage',
  'public_opportunities:publish',
] as const;

export function resolveMissionAccess(permissions: readonly string[]): MissionAccess {
  const canView = permissions.includes('missions:view');
  // Every capability is scoped to a mission the actor can see, so none survives without view.
  const has = (permission: string) => canView && permissions.includes(permission);

  return {
    canView,
    canCreate: has('missions:create'),
    canUpdate: has('missions:update'),
    canManageStatus: has('missions:status:manage'),
    canClose: has('missions:closure:manage'),
    canArchive: has('missions:archive'),

    canViewAssignments: has('mission_assignments:view'),
    canManageAssignments: has('mission_assignments:manage'),

    canViewProcesses: has('mission_candidates:view'),
    canCreateProcesses: has('mission_candidates:create'),
    canTransitionProcesses: has('mission_candidates:transition'),
    canTransferProcesses: has('mission_candidates:transfer'),
    canPresentProcesses: has('mission_candidates:present'),

    canViewInterviews: has('interviews:view'),
    canScheduleInterviews: has('interviews:schedule'),
    canRescheduleInterviews: has('interviews:reschedule'),
    canCompleteInterviews: has('interviews:complete'),
    canCancelInterviews: has('interviews:cancel'),
    canArchiveInterviews: has('interviews:archive'),

    canViewEvaluations: has('evaluations:view'),
    canCreateEvaluations: has('evaluations:create'),
    canFinalizeEvaluations: has('evaluations:finalize'),

    canViewOffers: has('offers:view'),
    canCreateOffers: has('offers:create'),
    canUpdateOffers: has('offers:update'),
    canSendOffers: has('offers:send_or_mark_sent'),
    canRecordOfferResponses: has('offers:record_response'),
    canWithdrawOffers: has('offers:withdraw'),

    canViewPlacements: has('placements:view'),
    canConfirmPlacements: has('placements:confirm'),
    canCorrectPlacements: has('placements:correct'),
    canViewPlacementCommercialEligibility: has('placement_commercial_eligibility:view'),

    canViewPublicOpportunity: has('public_opportunities:view'),
    canManagePublicOpportunity: has('public_opportunities:manage'),
    canPublishPublicOpportunity: has('public_opportunities:publish'),
    canViewPublicApplications: has('public_applications:view'),

    canViewClients: has('clients:view'),
    canViewCandidates: has('candidates:view'),
    canViewClientContacts: has('client_contacts:view'),

    readOnly: canView && !WRITE_PERMISSIONS.some(has),
  };
}
