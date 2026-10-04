import { describe, expect, it } from 'vitest';

import type { AgendaItem } from '@hire-me/contracts';

import { filterAgendaItems, groupAgendaByDay } from './agenda-rules.js';

const sample: AgendaItem = {
  id: 'task:1',
  sourceType: 'task',
  sourceId: '00000000-0000-4000-8000-000000000001',
  title: 'Sample',
  dueAt: '2026-10-05T12:00:00.000Z',
  status: 'OPEN',
  allDay: false,
  deepLink: '/tasks?task=00000000-0000-4000-8000-000000000001',
};

describe('agenda rules', () => {
  it('filters by source type', () => {
    const meeting: AgendaItem = { ...sample, id: 'meeting:1', sourceType: 'meeting' };
    expect(filterAgendaItems([sample, meeting], 'task')).toHaveLength(1);
    expect(filterAgendaItems([sample, meeting], 'all')).toHaveLength(2);
  });

  it('groups items by calendar day', () => {
    const groups = groupAgendaByDay([sample]);
    expect(groups.get('2026-10-05')).toHaveLength(1);
  });
});
