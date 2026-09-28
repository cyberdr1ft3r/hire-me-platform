import type { ClientContactSummary, ClientStatus } from '@hire-me/contracts';

import type { PlainMessageKey } from '../i18n/index.js';
import type { StatusTone } from '../ui/StatusBadge.js';

export const CLIENT_STATUS_FILTER_OPTIONS: readonly ClientStatus[] = [
  'PROSPECT',
  'ACTIVE',
  'INACTIVE',
  'ARCHIVED',
];

export const CONTACT_STATUS_FILTER_OPTIONS = ['ACTIVE', 'INACTIVE', 'ARCHIVED'] as const;

export type ContactStatusFilter = (typeof CONTACT_STATUS_FILTER_OPTIONS)[number];

export function clientStatusLabelKey(status: ClientStatus): PlainMessageKey {
  return `clients.status.${status}`;
}

export function contactStatusLabelKey(status: ClientContactSummary['status']): PlainMessageKey {
  return `clients.contactStatus.${status}`;
}

export function clientStatusTone(status: ClientStatus): StatusTone {
  switch (status) {
    case 'ACTIVE':
      return 'success';
    case 'PROSPECT':
      return 'info';
    case 'INACTIVE':
      return 'warning';
    case 'ARCHIVED':
      return 'neutral';
    default:
      return 'neutral';
  }
}

export function contactStatusTone(status: ClientContactSummary['status']): StatusTone {
  switch (status) {
    case 'ACTIVE':
      return 'success';
    case 'INACTIVE':
      return 'warning';
    case 'ARCHIVED':
      return 'neutral';
    default:
      return 'neutral';
  }
}
