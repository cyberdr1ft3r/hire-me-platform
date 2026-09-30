/**
 * What the Document Center may offer this account.
 *
 * Every flag mirrors the permission the API re-checks: gating here only hides
 * controls that would be refused anyway. Context pickers are offered only where
 * the Documents option source accepts the same source-domain permission, so a
 * picker never exists for a record kind the actor cannot read.
 */
export interface DocumentAccess {
  canArchive: boolean;
  canCreate: boolean;
  canDownload: boolean;
  canUpdate: boolean;
  canAddVersion: boolean;
  /** Archived documents are only visible with the archive capability. */
  canSeeArchived: boolean;
  pickCandidates: boolean;
  pickClients: boolean;
  pickInterviews: boolean;
  pickMissions: boolean;
  pickProcesses: boolean;
  readOnly: boolean;
}

export function resolveDocumentAccess(permissions: readonly string[]): DocumentAccess {
  const has = (code: string) => permissions.includes(code);
  const canCreate = has('documents:create');
  const canUpdate = has('documents:update');
  const canAddVersion = has('documents:versions:create');
  const canArchive = has('documents:archive');
  const pickMissions = has('missions:view');
  const pickProcesses = pickMissions && has('mission_candidates:view');
  return {
    canArchive,
    canCreate,
    canDownload: has('documents:download'),
    canUpdate,
    canAddVersion,
    canSeeArchived: canArchive,
    pickCandidates: has('candidates:view'),
    pickClients: has('clients:view'),
    pickInterviews: pickProcesses && has('interviews:view'),
    pickMissions,
    pickProcesses,
    readOnly: !canCreate && !canUpdate && !canAddVersion && !canArchive,
  };
}
