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
});
