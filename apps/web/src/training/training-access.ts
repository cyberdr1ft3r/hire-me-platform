/**
 * What this account may see and do in the Training workspace.
 *
 * Each flag mirrors the permission code the API checks for that operation. The
 * UI uses it to leave out actions that would be refused; the server still
 * re-checks capability, record scope, and source-domain visibility every time.
 */
export type TrainingAccess = {
  createProgram: boolean;
  editProgram: boolean;
  changeProgramStatus: boolean;
  archiveProgram: boolean;
  viewSessions: boolean;
  manageSessions: boolean;
  archiveSessions: boolean;
  viewEnrollments: boolean;
  manageEnrollments: boolean;
  viewParticipation: boolean;
  manageParticipation: boolean;
  correctAttendance: boolean;
  archiveParticipation: boolean;
  /** `GET /v1/clients`: program client link, client filter, contact enrollment. */
  pickClients: boolean;
  /** `GET /v1/training/program-owner-user-options` (D-073). */
  pickOwners: boolean;
  /** `GET /v1/training/programs/:id/session-trainer-user-options` (D-073). */
  pickTrainers: boolean;
  enrollCandidates: boolean;
  /** `GET /v1/training/programs/:id/enrollment-user-options` (D-073). */
  enrollUsers: boolean;
  enrollClientContacts: boolean;
  generateCertificate: boolean;
  viewCertificateVersions: boolean;
  downloadCertificate: boolean;
  readOnly: boolean;
};

export function resolveTrainingAccess(permissions: readonly string[]): TrainingAccess {
  const has = (code: string) => permissions.includes(code);
  const manageEnrollments = has('training_enrollments:manage');
  const manageParticipation = has('training_participation:manage');
  const access = {
    createProgram: has('training_programs:manage'),
    editProgram: has('training_programs:manage'),
    changeProgramStatus: has('training_programs:status:manage'),
    archiveProgram: has('training_programs:archive'),
    viewSessions: has('training_sessions:view'),
    manageSessions: has('training_sessions:manage'),
    archiveSessions: has('training_sessions:archive'),
    viewEnrollments: has('training_enrollments:view'),
    manageEnrollments,
    // Attendance lives under a selected session, and the list route needs both.
    viewParticipation: has('training_participation:view') && has('training_sessions:view'),
    manageParticipation: manageParticipation && has('training_sessions:view'),
    correctAttendance:
      manageParticipation && has('training_participation:correct') && has('training_sessions:view'),
    archiveParticipation: has('training_participation:archive') && has('training_sessions:view'),
    pickClients: has('clients:view'),
    pickOwners: has('training_programs:manage'),
    pickTrainers: has('training_sessions:manage'),
    enrollCandidates: manageEnrollments && has('candidates:view'),
    enrollUsers: manageEnrollments,
    enrollClientContacts: manageEnrollments && has('clients:view') && has('client_contacts:view'),
    // The API also re-checks enrollment read and participant source visibility.
    generateCertificate: has('documents:generate') && has('training_enrollments:view'),
    viewCertificateVersions: has('documents:view'),
    downloadCertificate: has('documents:download'),
  };
  const readOnly = !(
    access.createProgram ||
    access.changeProgramStatus ||
    access.archiveProgram ||
    access.manageSessions ||
    access.archiveSessions ||
    access.manageEnrollments ||
    access.manageParticipation ||
    access.archiveParticipation ||
    access.generateCertificate
  );
  return { ...access, readOnly };
}
