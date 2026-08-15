export const TASK_PERMISSIONS = {
  TASKS_VIEW: 'tasks:view',
  TASKS_VIEW_ALL: 'tasks:view_all',
  TASKS_CREATE: 'tasks:create',
  TASKS_UPDATE: 'tasks:update',
  TASKS_ASSIGN: 'tasks:assign',
  TASKS_TRANSITION: 'tasks:transition',
  TASKS_COMMENT: 'tasks:comment',
  TASKS_REMINDERS_MANAGE: 'tasks:reminders:manage',
  TASKS_ARCHIVE: 'tasks:archive',
  NOTIFICATIONS_VIEW_OWN: 'notifications:view_own',
  NOTIFICATIONS_UPDATE_OWN: 'notifications:update_own',
} as const;
