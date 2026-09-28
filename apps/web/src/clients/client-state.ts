import type { ClientContactSummary, ClientStatus, ClientSummary } from '@hire-me/contracts';

import type { MessageKey } from '../i18n/index.js';

export const CLIENT_LIST_PAGE_SIZE = 20;
export const CONTACT_LIST_PAGE_SIZE = 20;

export type ClientFilterValues = {
  search: string;
  status: '' | ClientStatus;
  industry: string;
};

export const EMPTY_CLIENT_FILTERS: ClientFilterValues = {
  search: '',
  status: '',
  industry: '',
};

export type ContactFilterValues = {
  search: string;
  status: '' | 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
};

export const EMPTY_CONTACT_FILTERS: ContactFilterValues = {
  search: '',
  status: '',
};

export type ClientListQuery = {
  filters: ClientFilterValues;
  page: number;
};

export type ContactListQuery = {
  filters: ContactFilterValues;
  page: number;
};

export const FIRST_CLIENT_PAGE: ClientListQuery = {
  filters: EMPTY_CLIENT_FILTERS,
  page: 1,
};

export const FIRST_CONTACT_PAGE: ContactListQuery = {
  filters: EMPTY_CONTACT_FILTERS,
  page: 1,
};

export function hasActiveClientFilters(filters: ClientFilterValues): boolean {
  return (
    filters.search.trim().length > 0 || filters.status !== '' || filters.industry.trim().length > 0
  );
}

export function hasActiveContactFilters(filters: ContactFilterValues): boolean {
  return filters.search.trim().length > 0 || filters.status !== '';
}

export function pageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

export type ClientListState =
  | { status: 'loading' }
  | { status: 'error' }
  | {
      status: 'ready';
      clients: ClientSummary[];
      page: number;
      pageSize: number;
      total: number;
    };

export type ClientDetailState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; client: ClientSummary };

export type ContactListState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error' }
  | {
      status: 'ready';
      contacts: ClientContactSummary[];
      page: number;
      pageSize: number;
      total: number;
    };

export type ClientFeedback =
  | {
      tone: 'success';
      messageKey: MessageKey;
      values?: { status: string };
    }
  | { tone: 'danger'; messageKey: MessageKey };

export type ClientPendingAction =
  'createClient' | 'updateClient' | 'createContact' | 'updateContact' | 'lifecycle';
