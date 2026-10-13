import { MESSAGES_CREATE_PERMISSION, MESSAGES_VIEW_PERMISSION } from '@hire-me/contracts';

export interface MessagingAccess {
  /** Start conversations, send, edit, withdraw, and manage groups the actor owns. */
  create: boolean;
  view: boolean;
}

/**
 * Permission codes only, never role names. The server re-checks the internal
 * actor and active membership on every call; this only decides which controls
 * are worth offering.
 */
export function resolveMessagingAccess(permissions: readonly string[]): MessagingAccess {
  const view = permissions.includes(MESSAGES_VIEW_PERMISSION);
  return { create: view && permissions.includes(MESSAGES_CREATE_PERMISSION), view };
}
