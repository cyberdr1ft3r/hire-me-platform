import {
  MESSAGING_USER_OPTION_SEARCH_MIN_LENGTH,
  type MessagingUserOptionPurpose,
} from '@hire-me/contracts';

import type { BoundedPickerOption, LoadBoundedOptions } from '../ui/index.js';
import { listMessagingUserOptions } from './messages-api.js';

/**
 * Messaging's own purpose-scoped participant source (never the Admin user
 * API). Below the minimum search length nothing is requested, so the picker
 * cannot be used to page through the staff list.
 */
export function participantOptions({
  accessToken,
  conversationId,
  exclude = [],
  purpose,
}: {
  accessToken: string;
  conversationId?: string;
  exclude?: readonly string[];
  purpose: MessagingUserOptionPurpose;
}): LoadBoundedOptions {
  return async (search) => {
    const term = search.trim();
    if (term.length < MESSAGING_USER_OPTION_SEARCH_MIN_LENGTH) {
      return [];
    }
    const response = await listMessagingUserOptions(accessToken, {
      conversationId,
      purpose,
      search: term,
    });
    const excluded = new Set(exclude);
    return response.users
      .filter((user) => !excluded.has(user.id))
      .map((user): BoundedPickerOption => ({
        detail: user.email,
        id: user.id,
        label: user.displayName,
      }));
  };
}
