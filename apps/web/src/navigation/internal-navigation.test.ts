import { describe, expect, it } from 'vitest';

import {
  canAccessInternalRoute,
  pathToRoute,
  routeToPath,
  visibleInternalNavigation,
} from './internal-navigation.js';

describe('internal navigation', () => {
  it('keeps the approved route and path mapping stable', () => {
    expect(pathToRoute('/')).toBe('home');
    expect(pathToRoute('/reporting')).toBe('reporting');
    expect(routeToPath('accounting')).toBe('/accounting');
  });

  it('uses any existing commercial or accounting view permission', () => {
    expect(canAccessInternalRoute('commercial', ['invoices:view'])).toBe(true);
    expect(canAccessInternalRoute('accounting', ['expenses:view'])).toBe(true);
    expect(canAccessInternalRoute('accounting', ['records:view'])).toBe(false);
  });

  it('omits inaccessible destinations and never returns empty groups', () => {
    const groups = visibleInternalNavigation(['tasks:view']);
    expect(groups.flatMap((group) => group.items.map((item) => item.route))).toEqual([
      'home',
      'tasks',
    ]);
    expect(groups.every((group) => group.items.length > 0)).toBe(true);
  });
});
