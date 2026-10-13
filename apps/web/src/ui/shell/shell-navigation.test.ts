import { afterEach, describe, expect, it, vi } from 'vitest';
import { visibleInternalNavigation } from '../../navigation/internal-navigation.js';
import {
  domainForRoute,
  NAVIGATION_PREFERENCE_KEY,
  readNavigationExpanded,
  saveNavigationExpanded,
  visibleShellDomains,
  workspaceLayoutForRoute,
} from './shell-navigation.js';

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});
describe('Shell navigation projection', () => {
  it.each([
    [],
    ['messages:view'],
    ['users:view'],
    ['tasks:view', 'missions:view'],
    ['quotations:view', 'payments:view', 'clients:view'],
  ])('preserves the exact authorized destination set for %j', (...permissions: string[]) => {
    const expected = visibleInternalNavigation(permissions)
      .flatMap((group) => group.items)
      .map((item) => item.path)
      .sort();
    const actual = visibleShellDomains(permissions)
      .flatMap((group) => group.items)
      .map((item) => item.path)
      .sort();
    expect(actual).toEqual(expected);
  });
  it('maps meetings and all nested workspace routes without adding destinations', () => {
    expect(domainForRoute('meetings')).toBe('overview');
    expect(domainForRoute('missions')).toBe('recruitment');
    expect(domainForRoute('accounting')).toBe('commercial');
    expect(domainForRoute('messages')).toBe('communication');
  });
  it('defaults to expanded, persists only the presentation preference and ignores invalid values', () => {
    expect(readNavigationExpanded()).toBe(true);
    saveNavigationExpanded(false);
    expect(readNavigationExpanded()).toBe(false);
    expect(localStorage.length).toBe(1);
    localStorage.setItem(NAVIGATION_PREFERENCE_KEY, 'unexpected');
    expect(readNavigationExpanded()).toBe(true);
  });
  it('continues to work when browser storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Blocked');
    });
    expect(readNavigationExpanded()).toBe(true);
    expect(() => saveNavigationExpanded(false)).not.toThrow();
  });
});

describe('Workspace layout per route', () => {
  it('fills the viewport for Messages on every width and for Candidates beside the desktop rail', () => {
    expect(workspaceLayoutForRoute('messages', false)).toBe('fill');
    expect(workspaceLayoutForRoute('messages', true)).toBe('fill');
    expect(workspaceLayoutForRoute('candidates', false)).toBe('fill');
    expect(workspaceLayoutForRoute('candidates', true)).toBe('flow');
  });
  it.each(['home', 'tasks', 'missions', 'commercial', 'accounting', 'documents', 'admin'] as const)(
    'keeps document flow for %s',
    (route) => {
      expect(workspaceLayoutForRoute(route, false)).toBe('flow');
    },
  );
});
