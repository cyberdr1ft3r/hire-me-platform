import { describe, expect, it } from 'vitest';

import {
  closureStatesFrom,
  defaultClosureState,
  isLegalClosureTransition,
} from './mission-closure.js';
import { MISSION_CLOSURE_STATES } from './mission-labels.js';

describe('closureStatesFrom (mirrors MissionsService transitions)', () => {
  it('offers only cancel from early lifecycle states', () => {
    expect(closureStatesFrom('DRAFT')).toEqual(['CANCELED']);
    expect(closureStatesFrom('ACTIVE')).toEqual(['CANCELED']);
    expect(closureStatesFrom('HR_PRESELECTION')).toEqual(['CANCELED']);
  });

  it('offers deadline expiry only where the server allows it', () => {
    expect(closureStatesFrom('CANDIDATE_SOURCING')).toEqual([
      'CANCELED',
      'DEADLINE_EXPIRED_WITHOUT_RENEWAL',
    ]);
    expect(closureStatesFrom('OFFER_SENT')).toContain('DEADLINE_EXPIRED_WITHOUT_RENEWAL');
    expect(closureStatesFrom('ACTIVE')).not.toContain('DEADLINE_EXPIRED_WITHOUT_RENEWAL');
  });

  it('offers closed without recruitment from mid-pipeline states only', () => {
    expect(closureStatesFrom('CANDIDATE_PRESENTATION')).toEqual([
      'CANCELED',
      'CLOSED_WITHOUT_RECRUITMENT',
    ]);
    expect(closureStatesFrom('OFFER_SENT')).toContain('CLOSED_WITHOUT_RECRUITMENT');
    expect(closureStatesFrom('CLIENT_INTERVIEWS')).not.toContain('CLOSED_WITHOUT_RECRUITMENT');
  });

  it('offers successful recruitment closure only from probation monitoring', () => {
    expect(closureStatesFrom('PROBATION_MONITORING')).toEqual(['CLOSED_WITH_RECRUITMENT']);
    expect(closureStatesFrom('OFFER_SENT')).not.toContain('CLOSED_WITH_RECRUITMENT');
  });

  it('returns no closure outcomes when the server allows none', () => {
    expect(closureStatesFrom('WAITING_FOR_CLIENT_INFORMATION')).toEqual([]);
    expect(closureStatesFrom('CANDIDATE_INTEGRATED')).toEqual([]);
    expect(defaultClosureState('CANDIDATE_INTEGRATED')).toBeNull();
  });

  it('never lists closure states outside the canonical closure set', () => {
    for (const state of [
      'DRAFT',
      'CANDIDATE_SOURCING',
      'OFFER_SENT',
      'PROBATION_MONITORING',
    ] as const) {
      for (const closure of closureStatesFrom(state)) {
        expect(MISSION_CLOSURE_STATES).toContain(closure);
      }
    }
  });

  it('validates individual transitions', () => {
    expect(isLegalClosureTransition('DRAFT', 'CANCELED')).toBe(true);
    expect(isLegalClosureTransition('DRAFT', 'CLOSED_WITH_RECRUITMENT')).toBe(false);
  });
});
