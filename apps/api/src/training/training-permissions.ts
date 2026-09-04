export const TRAINING_PERMISSIONS = {
  TRAINING_PROGRAMS_VIEW: 'training_programs:view',
  TRAINING_PROGRAMS_VIEW_ALL: 'training_programs:view_all',
  TRAINING_PROGRAMS_MANAGE: 'training_programs:manage',
  TRAINING_PROGRAMS_STATUS_MANAGE: 'training_programs:status:manage',
  TRAINING_PROGRAMS_ARCHIVE: 'training_programs:archive',
  TRAINING_SESSIONS_VIEW: 'training_sessions:view',
  TRAINING_SESSIONS_MANAGE: 'training_sessions:manage',
  TRAINING_SESSIONS_ARCHIVE: 'training_sessions:archive',
  TRAINING_ENROLLMENTS_VIEW: 'training_enrollments:view',
  TRAINING_ENROLLMENTS_MANAGE: 'training_enrollments:manage',
  TRAINING_PARTICIPATION_VIEW: 'training_participation:view',
  TRAINING_PARTICIPATION_MANAGE: 'training_participation:manage',
  TRAINING_PARTICIPATION_CORRECT: 'training_participation:correct',
  CLIENTS_VIEW: 'clients:view',
} as const;

export type TrainingPermission = (typeof TRAINING_PERMISSIONS)[keyof typeof TRAINING_PERMISSIONS];
