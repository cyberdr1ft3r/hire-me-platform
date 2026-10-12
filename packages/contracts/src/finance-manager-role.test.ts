import { describe, expect, it } from 'vitest';

import { AdminRoleNameSchema } from './admin.js';
import { FINANCE_MANAGER_PERMISSION_CODES } from './finance-manager-role.js';

describe('FINANCE_MANAGER contract (Issue #125)', () => {
  it('includes FINANCE_MANAGER in AdminRoleNameSchema', () => {
    expect(AdminRoleNameSchema.parse('FINANCE_MANAGER')).toBe('FINANCE_MANAGER');
  });

  it('defines a non-empty least-privilege permission matrix', () => {
    expect(FINANCE_MANAGER_PERMISSION_CODES.length).toBeGreaterThan(10);
    expect(FINANCE_MANAGER_PERMISSION_CODES).not.toContain('missions:view');
    expect(FINANCE_MANAGER_PERMISSION_CODES).not.toContain('users:view');
  });

  it('grants only the bounded D-086 recruitment financial context (Issue #168)', () => {
    expect(FINANCE_MANAGER_PERMISSION_CODES).toContain('recruitment_financial_context:view');
    for (const forbidden of [
      'missions:view',
      'placements:view',
      'placement_commercial_eligibility:view',
      'mission_candidates:transfer',
      'mission_candidates:view',
      'mission_candidate_notes:view',
      'candidates:view',
      'candidate_profile:view',
      'offers:view',
      'interviews:view',
      'evaluations:view',
      'evaluations:internal:view',
      'client_feedback:view',
      'mission_assignments:view',
    ]) {
      expect(FINANCE_MANAGER_PERMISSION_CODES).not.toContain(forbidden);
    }
  });
});
