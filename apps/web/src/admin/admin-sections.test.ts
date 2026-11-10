import { describe, expect, it } from 'vitest';

import {
  adminSectionFromSearch,
  adminSectionPath,
  canAccessAdminSection,
  visibleAdminSections,
} from './admin-sections.js';

describe('administration section navigation', () => {
  it('parses only approved section intent and emits stable deep links', () => {
    expect(adminSectionFromSearch('?section=billing')).toBe('billing');
    expect(adminSectionFromSearch('?other=value&section=access')).toBe('access');
    expect(adminSectionFromSearch('?section=unknown')).toBeNull();
    expect(adminSectionFromSearch('')).toBeNull();
    expect(adminSectionPath('users')).toBe('/admin?section=users');
  });

  it('keeps billing, user administration, and catalog visibility independent', () => {
    expect(visibleAdminSections(['billing_settings:view'])).toEqual(['billing']);
    expect(visibleAdminSections(['users:view'])).toEqual(['users']);
    expect(visibleAdminSections(['permissions:view'])).toEqual(['access']);
    expect(visibleAdminSections(['roles:view', 'billing_settings:view'])).toEqual([
      'billing',
      'access',
    ]);
    expect(canAccessAdminSection('users', ['billing_settings:view'])).toBe(false);
  });
});
