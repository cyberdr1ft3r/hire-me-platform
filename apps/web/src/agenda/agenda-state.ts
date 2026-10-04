import type { AgendaItem, AgendaListResponse, AgendaView } from '@hire-me/contracts';

import type { AgendaSourceFilter } from './agenda-rules.js';

export type AgendaListState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; response: AgendaListResponse }
  | { status: 'error'; message: string };

export type AgendaFilters = {
  view: AgendaView;
  source: AgendaSourceFilter;
};

export const DEFAULT_AGENDA_FILTERS: AgendaFilters = {
  view: 'upcoming',
  source: 'all',
};

export type AgendaFeedback = { tone: 'success' | 'error'; message: string } | null;

export function applySourceFilter(
  response: AgendaListResponse,
  source: AgendaSourceFilter,
): AgendaItem[] {
  if (source === 'all') {
    return response.items;
  }
  return response.items.filter((item) => item.sourceType === source);
}
