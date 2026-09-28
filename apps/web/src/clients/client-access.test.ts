import { describe, expect, it } from 'vitest';

import { resolveClientAccess } from './client-access.js';

describe('resolveClientAccess', () => {
  it('treats clients:view only as read-only', () => {
    const access = resolveClientAccess(['clients:view']);
    expect(access.readOnly).toBe(true);
    expect(access.canCreateClients).toBe(false);
    expect(access.canUpdateContacts).toBe(false);
  });

  it('is not read-only when contact update is allowed without client mutations', () => {
    const access = resolveClientAccess([
      'clients:view',
      'client_contacts:view',
      'client_contacts:update',
    ]);
    expect(access.readOnly).toBe(false);
    expect(access.canUpdateContacts).toBe(true);
  });

  it('is not read-only when any client mutation permission is present', () => {
    expect(resolveClientAccess(['clients:view', 'clients:create']).readOnly).toBe(false);
    expect(resolveClientAccess(['clients:view', 'clients:archive']).readOnly).toBe(false);
  });
});
