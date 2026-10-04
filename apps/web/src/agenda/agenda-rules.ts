import type { AgendaItem, AgendaSourceType, AgendaView } from '@hire-me/contracts';

export type AgendaSourceFilter = AgendaSourceType | 'all';

export function filterAgendaItems(
  items: readonly AgendaItem[],
  source: AgendaSourceFilter,
): AgendaItem[] {
  if (source === 'all') {
    return [...items];
  }
  return items.filter((item) => item.sourceType === source);
}

export function agendaViewQuery(view: AgendaView): Record<string, string> {
  return { view };
}

export function groupAgendaByDay(items: readonly AgendaItem[]): Map<string, AgendaItem[]> {
  const groups = new Map<string, AgendaItem[]>();
  for (const item of items) {
    const instant = item.startAt ?? item.dueAt;
    const key = instant ? instant.slice(0, 10) : 'undated';
    const bucket = groups.get(key) ?? [];
    bucket.push(item);
    groups.set(key, bucket);
  }
  return groups;
}
