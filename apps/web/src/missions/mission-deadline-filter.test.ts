import { describe, expect, it } from 'vitest';

import { EMPTY_MISSION_FILTERS, hasActiveMissionFilters } from './mission-state.js';
import {
  deadlineFromDate,
  deadlineToDate,
  hasValidDeadlineRange,
} from './mission-deadline-filter.js';

describe('mission deadline business-date filters', () => {
  it('builds deterministic inclusive UTC boundaries without local-time conversion', () => {
    expect(deadlineFromDate('2026-10-01')).toBe('2026-10-01T00:00:00.000Z');
    expect(deadlineToDate('2026-10-01')).toBe('2026-10-01T23:59:59.999Z');
    expect(deadlineFromDate('')).toBeUndefined();
    expect(deadlineToDate('')).toBeUndefined();
  });

  it('accepts open and ordered ranges and rejects from after to', () => {
    expect(hasValidDeadlineRange({ deadlineFrom: '2026-10-02', deadlineTo: '' })).toBe(true);
    expect(hasValidDeadlineRange({ deadlineFrom: '', deadlineTo: '2026-10-02' })).toBe(true);
    expect(hasValidDeadlineRange({ deadlineFrom: '2026-10-02', deadlineTo: '2026-10-02' })).toBe(
      true,
    );
    expect(hasValidDeadlineRange({ deadlineFrom: '2026-10-03', deadlineTo: '2026-10-02' })).toBe(
      false,
    );
  });

  it('counts either deadline date as an active mission filter', () => {
    expect(hasActiveMissionFilters(EMPTY_MISSION_FILTERS)).toBe(false);
    expect(hasActiveMissionFilters({ ...EMPTY_MISSION_FILTERS, deadlineFrom: '2026-10-01' })).toBe(
      true,
    );
    expect(hasActiveMissionFilters({ ...EMPTY_MISSION_FILTERS, deadlineTo: '2026-10-31' })).toBe(
      true,
    );
  });
});
