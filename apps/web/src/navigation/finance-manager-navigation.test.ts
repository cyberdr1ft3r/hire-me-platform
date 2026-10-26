import { describe, expect, it } from 'vitest';

import { FINANCE_MANAGER_PERMISSION_CODES } from '@hire-me/contracts';
import { canAccessInternalRoute, visibleInternalNavigation } from './internal-navigation.js';

describe('Finance Manager navigation (Issue #125)', () => {
  const permissions = [...FINANCE_MANAGER_PERMISSION_CODES];

  it('shows finance and billing-administration destinations while hiding recruitment modules', () => {
    const groups = visibleInternalNavigation(permissions);
    const routes = groups.flatMap((group) => group.items.map((item) => item.route));
    expect(routes).toContain('commercial');
    expect(routes).toContain('accounting');
    expect(routes).toContain('clients');
    expect(routes).toContain('documents');
    expect(routes).not.toContain('missions');
    expect(routes).not.toContain('candidates');
    expect(routes).not.toContain('training');
    expect(routes).not.toContain('reporting');
    expect(routes).toContain('admin');
  });

  it('allows direct route checks for finance destinations', () => {
    expect(canAccessInternalRoute('commercial', permissions)).toBe(true);
    expect(canAccessInternalRoute('accounting', permissions)).toBe(true);
    expect(canAccessInternalRoute('admin', permissions)).toBe(true);
    expect(canAccessInternalRoute('missions', permissions)).toBe(false);
    expect(canAccessInternalRoute('candidates', permissions)).toBe(false);
  });

  it('never widens Missions or Candidates navigation through the D-086 financial context', () => {
    const routesFor = (codes: readonly string[]) =>
      visibleInternalNavigation(codes).flatMap((group) => group.items.map((item) => item.route));
    const withoutContext = permissions.filter(
      (code) => code !== 'recruitment_financial_context:view',
    );
    expect(routesFor(permissions)).toEqual(routesFor(withoutContext));
    expect(routesFor(['recruitment_financial_context:view'])).toEqual(routesFor([]));

    const hybrid = [...permissions, 'missions:view'];
    expect(canAccessInternalRoute('missions', hybrid)).toBe(true);
    expect(canAccessInternalRoute('candidates', hybrid)).toBe(false);
    expect(routesFor(hybrid)).toEqual(routesFor([...withoutContext, 'missions:view']));
  });
});
