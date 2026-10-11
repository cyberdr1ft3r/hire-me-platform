import { describe, expect, it } from 'vitest';

import { businessDateToUtcIso } from './mission-form.js';
import { buildPlacementConfirmRequest } from './placement-confirm.js';

describe('placement confirmation request', () => {
  it('maps a calendar date to UTC midnight without local timezone drift', () => {
    expect(businessDateToUtcIso('2026-09-15')).toBe('2026-09-15T00:00:00.000Z');
    expect(businessDateToUtcIso(' 2026-09-15 ')).toBe('2026-09-15T00:00:00.000Z');
    expect(businessDateToUtcIso('invalid')).toBeNull();
  });

  it('builds confirm payload with optional note and confirm-only invoicing default', () => {
    expect(
      buildPlacementConfirmRequest({
        integrationStartDate: '2026-10-01',
        operationalNote: '  Operator note  ',
        eligibleForInvoicing: true,
        canSetCommercialEligibility: false,
      }),
    ).toEqual({
      integrationStartDate: '2026-10-01T00:00:00.000Z',
      operationalNote: 'Operator note',
      eligibleForInvoicing: false,
    });
  });

  it('passes invoicing eligibility when update capability is granted', () => {
    expect(
      buildPlacementConfirmRequest({
        integrationStartDate: '2026-10-01',
        eligibleForInvoicing: true,
        canSetCommercialEligibility: true,
      }),
    ).toEqual({
      integrationStartDate: '2026-10-01T00:00:00.000Z',
      eligibleForInvoicing: true,
    });
  });
});
