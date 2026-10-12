import { describe, expect, it } from 'vitest';

import { resolveFinancialMissionScope } from './financial-mission-scope.js';

describe('resolveFinancialMissionScope (D-086)', () => {
  it.each([
    [false, false, false, 'NONE'],
    [false, true, false, 'NONE'],
    [false, false, true, 'ALL'],
    [false, true, true, 'ALL'],
    [true, false, false, 'ASSIGNED'],
    // Hybrid Finance + recruitment actor: the financial context is never narrowed.
    [true, false, true, 'ALL'],
    [true, true, false, 'ALL'],
    [true, true, true, 'ALL'],
  ] as const)(
    'missions:view=%s transfer=%s financial=%s -> %s',
    (missionsView, missionCandidatesTransfer, recruitmentFinancialContext, expected) => {
      expect(
        resolveFinancialMissionScope({
          missionsView,
          missionCandidatesTransfer,
          recruitmentFinancialContext,
        }),
      ).toBe(expected);
    },
  );
});
