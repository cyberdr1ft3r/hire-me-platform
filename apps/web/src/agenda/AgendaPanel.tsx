import { useEffect, useRef, useState } from 'react';

import { listAgenda } from '../api.js';
import type { AgendaItem } from '@hire-me/contracts';
import {
  applySourceFilter,
  DEFAULT_AGENDA_FILTERS,
  type AgendaFilters,
  type AgendaListState,
} from './agenda-state.js';
import { AgendaWorkspace } from './AgendaWorkspace.js';
import './agenda.css';

export function AgendaPanel({
  accessToken,
  onNavigate,
}: {
  accessToken: string;
  onNavigate: (path: string) => void;
}) {
  const [sessionKey, setSessionKey] = useState(0);
  const requestRef = useRef(0);
  const tokenRef = useRef(accessToken);
  const [filters, setFilters] = useState<AgendaFilters>(DEFAULT_AGENDA_FILTERS);
  const [listState, setListState] = useState<AgendaListState>({ status: 'idle' });
  const [items, setItems] = useState<AgendaItem[]>([]);
  const [pending, setPending] = useState(false);

  if (tokenRef.current !== accessToken) {
    tokenRef.current = accessToken;
    setSessionKey((value) => value + 1);
  }

  async function loadAgenda(): Promise<void> {
    const requestId = ++requestRef.current;
    setListState({ status: 'loading' });
    setPending(true);
    try {
      const response = await listAgenda(accessToken, { view: filters.view });
      if (requestId !== requestRef.current) return;
      setListState({ status: 'ready', response });
      setItems(applySourceFilter(response, filters.source));
    } catch (error: unknown) {
      if (requestId !== requestRef.current) return;
      setListState({
        status: 'error',
        message: error instanceof Error ? error.message : 'Agenda request failed.',
      });
    } finally {
      if (requestId === requestRef.current) setPending(false);
    }
  }

  useEffect(() => {
    void loadAgenda();
    return () => {
      requestRef.current += 1;
    };
  }, [accessToken, sessionKey, filters.view, filters.source]);

  return (
    <AgendaWorkspace
      filters={filters}
      items={items}
      listState={listState}
      onFiltersChange={setFilters}
      onOpenItem={(item) => onNavigate(item.deepLink)}
      onRefresh={() => void loadAgenda()}
      pending={pending}
    />
  );
}
