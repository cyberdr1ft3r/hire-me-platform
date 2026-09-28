export interface ClientAccess {
  canArchiveClients: boolean;
  canArchiveContacts: boolean;
  canCreateClients: boolean;
  canCreateContacts: boolean;
  canManageClientStatus: boolean;
  canManageContactStatus: boolean;
  canSeeCommercial: boolean;
  canUpdateClients: boolean;
  canUpdateContacts: boolean;
  canView: boolean;
  canViewContacts: boolean;
  readOnly: boolean;
}

export function resolveClientAccess(permissions: readonly string[]): ClientAccess {
  const canView = permissions.includes('clients:view');
  const canCreateClients = permissions.includes('clients:create');
  const canUpdateClients = permissions.includes('clients:update');
  const canManageClientStatus = permissions.includes('clients:status:manage');
  const canArchiveClients = permissions.includes('clients:archive');
  const canViewContacts = permissions.includes('client_contacts:view');
  const canCreateContacts = permissions.includes('client_contacts:create');
  const canUpdateContacts = permissions.includes('client_contacts:update');
  const canManageContactStatus = permissions.includes('client_contacts:status:manage');
  const canArchiveContacts = permissions.includes('client_contacts:archive');
  const canSeeCommercial = permissions.includes('commercial_data:access');

  const readOnly =
    canView &&
    !canCreateClients &&
    !canUpdateClients &&
    !canManageClientStatus &&
    !canArchiveClients;

  return {
    canArchiveClients,
    canArchiveContacts,
    canCreateClients,
    canCreateContacts,
    canManageClientStatus,
    canManageContactStatus,
    canSeeCommercial,
    canUpdateClients,
    canUpdateContacts,
    canView,
    canViewContacts,
    readOnly,
  };
}
