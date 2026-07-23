import {
  PermissionScopeType,
  PrismaClient,
  RoleName,
} from '../src/persistence/prisma/generated-client.js';

const prisma = new PrismaClient();

const roles = [
  {
    name: RoleName.SUPER_ADMIN,
    description: 'Development super administrator role with platform-wide access.',
  },
  {
    name: RoleName.ADMIN,
    description: 'Development administrator role for normal platform administration.',
  },
  {
    name: RoleName.HR_MANAGER,
    description: 'Development HR manager role for recruitment operations.',
  },
  {
    name: RoleName.MANAGER,
    description: 'Development manager role for scoped team operations.',
  },
  {
    name: RoleName.TEAM_LEADER,
    description: 'Development team leader role for team-scoped activity.',
  },
  {
    name: RoleName.EMPLOYEE,
    description: 'Development employee role for assigned work.',
  },
  {
    name: RoleName.GUEST,
    description: 'Development guest role for individually shared read-only records.',
  },
  {
    name: RoleName.CLIENT_USER,
    description: 'Development client user role for client-scoped portal records.',
  },
] as const;

const permissions = [
  {
    code: 'records:view',
    description: 'View records within the assigned scope.',
    scopeType: PermissionScopeType.ASSIGNED,
  },
  {
    code: 'records:create',
    description: 'Create records within the assigned scope.',
    scopeType: PermissionScopeType.ASSIGNED,
  },
  {
    code: 'records:update',
    description: 'Update records within the assigned scope.',
    scopeType: PermissionScopeType.ASSIGNED,
  },
  {
    code: 'records:archive',
    description: 'Archive records within the assigned scope.',
    scopeType: PermissionScopeType.EXPLICIT,
  },
  {
    code: 'records:delete',
    description: 'Perform rare administrative physical deletion where later policy allows it.',
    scopeType: PermissionScopeType.EXPLICIT,
  },
  {
    code: 'records:export',
    description: 'Export records within an explicitly authorized scope.',
    scopeType: PermissionScopeType.EXPLICIT,
  },
  {
    code: 'documents:download',
    description: 'Download protected documents within an explicitly authorized scope.',
    scopeType: PermissionScopeType.EXPLICIT,
  },
  {
    code: 'users:admin',
    description: 'Legacy umbrella permission retained for compatibility with prior seeds.',
    scopeType: PermissionScopeType.EXPLICIT,
  },
  {
    code: 'users:view',
    description: 'View safe internal user profiles, roles, permissions, and session summaries.',
    scopeType: PermissionScopeType.EXPLICIT,
  },
  {
    code: 'users:create',
    description: 'Create internal users with administrator-set initial credentials.',
    scopeType: PermissionScopeType.EXPLICIT,
  },
  {
    code: 'users:update',
    description: 'Update approved non-sensitive internal user profile fields.',
    scopeType: PermissionScopeType.EXPLICIT,
  },
  {
    code: 'users:roles:manage',
    description: 'Assign and remove approved roles for internal users.',
    scopeType: PermissionScopeType.EXPLICIT,
  },
  {
    code: 'users:status:manage',
    description: 'Suspend, reactivate, and archive internal users.',
    scopeType: PermissionScopeType.EXPLICIT,
  },
  {
    code: 'users:sessions:revoke',
    description: 'Revoke selected or all refresh sessions for internal users.',
    scopeType: PermissionScopeType.EXPLICIT,
  },
  {
    code: 'roles:view',
    description: 'View the approved role catalog and role permission mappings.',
    scopeType: PermissionScopeType.EXPLICIT,
  },
  {
    code: 'permissions:view',
    description: 'View the approved permission catalog.',
    scopeType: PermissionScopeType.EXPLICIT,
  },
  {
    code: 'commercial_data:access',
    description: 'Access commercial data within an explicitly authorized scope.',
    scopeType: PermissionScopeType.EXPLICIT,
  },
  {
    code: 'clients:view',
    description: 'View client organization records within an explicitly authorized scope.',
    scopeType: PermissionScopeType.EXPLICIT,
  },
  {
    code: 'clients:create',
    description: 'Create client organization records within an explicitly authorized scope.',
    scopeType: PermissionScopeType.EXPLICIT,
  },
  {
    code: 'clients:update',
    description:
      'Update approved client organization fields within an explicitly authorized scope.',
    scopeType: PermissionScopeType.EXPLICIT,
  },
  {
    code: 'clients:status:manage',
    description:
      'Manage client organization lifecycle status within an explicitly authorized scope.',
    scopeType: PermissionScopeType.EXPLICIT,
  },
  {
    code: 'clients:archive',
    description: 'Archive client organization records within an explicitly authorized scope.',
    scopeType: PermissionScopeType.EXPLICIT,
  },
  {
    code: 'client_contacts:view',
    description: 'View client contact records within an explicitly authorized scope.',
    scopeType: PermissionScopeType.EXPLICIT,
  },
  {
    code: 'client_contacts:create',
    description: 'Create client contact records within an explicitly authorized scope.',
    scopeType: PermissionScopeType.EXPLICIT,
  },
  {
    code: 'client_contacts:update',
    description: 'Update approved client contact fields within an explicitly authorized scope.',
    scopeType: PermissionScopeType.EXPLICIT,
  },
  {
    code: 'client_contacts:status:manage',
    description: 'Manage client contact lifecycle status within an explicitly authorized scope.',
    scopeType: PermissionScopeType.EXPLICIT,
  },
  {
    code: 'client_contacts:archive',
    description: 'Archive client contact records within an explicitly authorized scope.',
    scopeType: PermissionScopeType.EXPLICIT,
  },
  {
    code: 'candidates:view',
    description: 'View candidate master records within an explicitly authorized scope.',
    scopeType: PermissionScopeType.EXPLICIT,
  },
  {
    code: 'candidates:create',
    description: 'Create candidate master records within an explicitly authorized scope.',
    scopeType: PermissionScopeType.EXPLICIT,
  },
  {
    code: 'candidates:update',
    description: 'Update approved candidate master fields within an explicitly authorized scope.',
    scopeType: PermissionScopeType.EXPLICIT,
  },
  {
    code: 'candidates:status:manage',
    description: 'Manage candidate lifecycle status within an explicitly authorized scope.',
    scopeType: PermissionScopeType.EXPLICIT,
  },
  {
    code: 'candidates:archive',
    description: 'Archive candidate master records within an explicitly authorized scope.',
    scopeType: PermissionScopeType.EXPLICIT,
  },
  {
    code: 'candidate_profile:view',
    description: 'View structured candidate profile child records.',
    scopeType: PermissionScopeType.EXPLICIT,
  },
  {
    code: 'candidate_profile:manage',
    description: 'Create, update, and archive structured candidate profile child records.',
    scopeType: PermissionScopeType.EXPLICIT,
  },
  {
    code: 'candidate_compensation:view',
    description: 'View candidate compensation expectations within an explicit scope.',
    scopeType: PermissionScopeType.EXPLICIT,
  },
  {
    code: 'candidate_compensation:update',
    description: 'Update candidate compensation expectations within an explicit scope.',
    scopeType: PermissionScopeType.EXPLICIT,
  },
  {
    code: 'candidate_consent:view',
    description: 'View candidate consent metadata within an explicit scope.',
    scopeType: PermissionScopeType.EXPLICIT,
  },
  {
    code: 'candidate_consent:manage',
    description: 'Update candidate consent metadata within an explicit scope.',
    scopeType: PermissionScopeType.EXPLICIT,
  },
  {
    code: 'messages:view',
    description: 'View conversations within the authorized scope.',
    scopeType: PermissionScopeType.ASSIGNED,
  },
  {
    code: 'messages:create',
    description: 'Create messages within the authorized scope.',
    scopeType: PermissionScopeType.ASSIGNED,
  },
  {
    code: 'training_enrollments:manage',
    description: 'Manage training enrollments within the authorized scope.',
    scopeType: PermissionScopeType.EXPLICIT,
  },
  {
    code: 'missions:view',
    description: 'View recruitment missions within an explicitly authorized scope.',
    scopeType: PermissionScopeType.EXPLICIT,
  },
  {
    code: 'missions:create',
    description: 'Create recruitment missions for valid writable clients.',
    scopeType: PermissionScopeType.EXPLICIT,
  },
  {
    code: 'missions:update',
    description: 'Update approved recruitment mission fields.',
    scopeType: PermissionScopeType.EXPLICIT,
  },
  {
    code: 'missions:status:manage',
    description: 'Manage documented recruitment mission lifecycle transitions.',
    scopeType: PermissionScopeType.EXPLICIT,
  },
  {
    code: 'missions:archive',
    description: 'Archive closed or canceled recruitment missions without physical deletion.',
    scopeType: PermissionScopeType.EXPLICIT,
  },
  {
    code: 'missions:closure:manage',
    description: 'Close recruitment missions with a structured closure reason.',
    scopeType: PermissionScopeType.EXPLICIT,
  },
  {
    code: 'mission_assignments:view',
    description: 'View recruiter and contributor assignments for recruitment missions.',
    scopeType: PermissionScopeType.EXPLICIT,
  },
  {
    code: 'mission_assignments:manage',
    description: 'Manage recruiter and contributor assignments for recruitment missions.',
    scopeType: PermissionScopeType.EXPLICIT,
  },
  {
    code: 'mission_commercial_data:view',
    description: 'View protected mission salary and commercial fields.',
    scopeType: PermissionScopeType.EXPLICIT,
  },
  {
    code: 'mission_commercial_data:update',
    description: 'Update protected mission salary and commercial fields.',
    scopeType: PermissionScopeType.EXPLICIT,
  },
  {
    code: 'mission_candidates:view',
    description: 'View mission-specific candidate recruitment processes.',
    scopeType: PermissionScopeType.EXPLICIT,
  },
  {
    code: 'mission_candidates:create',
    description: 'Link reusable candidates to recruitment missions.',
    scopeType: PermissionScopeType.EXPLICIT,
  },
  {
    code: 'mission_candidates:transition',
    description: 'Move mission candidate processes through the approved standard pipeline.',
    scopeType: PermissionScopeType.EXPLICIT,
  },
  {
    code: 'mission_candidates:transfer',
    description: 'Transfer responsible recruiter ownership for mission candidate processes.',
    scopeType: PermissionScopeType.EXPLICIT,
  },
  {
    code: 'mission_candidates:present',
    description: 'Explicitly present a mission candidate to the client.',
    scopeType: PermissionScopeType.EXPLICIT,
  },
  {
    code: 'mission_candidate_notes:view',
    description: 'View internal mission candidate notes.',
    scopeType: PermissionScopeType.EXPLICIT,
  },
  {
    code: 'mission_candidate_notes:manage',
    description: 'Create or update internal mission candidate notes.',
    scopeType: PermissionScopeType.EXPLICIT,
  },
  {
    code: 'mission_candidates:outcome:manage',
    description: 'Record mission candidate rejection, withdrawal, or talent-pool outcomes.',
    scopeType: PermissionScopeType.EXPLICIT,
  },
  {
    code: 'mission_candidates:integration:confirm',
    description: 'Confirm candidate integration and count a placement manually.',
    scopeType: PermissionScopeType.EXPLICIT,
  },
] as const;

async function main(): Promise<void> {
  const permissionRecords = await Promise.all(
    permissions.map((permission) =>
      prisma.permission.upsert({
        where: { code: permission.code },
        update: {
          description: permission.description,
          scopeType: permission.scopeType,
        },
        create: permission,
      }),
    ),
  );

  const permissionByCode = new Map(
    permissionRecords.map((permission) => [permission.code, permission.id]),
  );

  const roleRecords = await Promise.all(
    roles.map((role) =>
      prisma.role.upsert({
        where: { name: role.name },
        update: {
          description: role.description,
        },
        create: role,
      }),
    ),
  );

  const basePermissionCodesByRole = {
    [RoleName.SUPER_ADMIN]: permissions.map((permission) => permission.code),
    [RoleName.ADMIN]: [
      'records:view',
      'records:create',
      'records:update',
      'records:archive',
      'records:export',
      'documents:download',
      'users:admin',
      'users:view',
      'users:create',
      'users:update',
      'users:roles:manage',
      'users:status:manage',
      'users:sessions:revoke',
      'roles:view',
      'permissions:view',
      'clients:view',
      'clients:create',
      'clients:update',
      'clients:status:manage',
      'clients:archive',
      'client_contacts:view',
      'client_contacts:create',
      'client_contacts:update',
      'client_contacts:status:manage',
      'client_contacts:archive',
      'candidates:view',
      'candidates:create',
      'candidates:update',
      'candidates:status:manage',
      'candidates:archive',
      'candidate_profile:view',
      'candidate_profile:manage',
      'messages:view',
      'messages:create',
      'training_enrollments:manage',
      'missions:view',
      'missions:create',
      'missions:update',
      'missions:status:manage',
      'missions:archive',
      'missions:closure:manage',
      'mission_assignments:view',
      'mission_assignments:manage',
      'mission_candidates:view',
      'mission_candidates:create',
      'mission_candidates:transition',
      'mission_candidates:transfer',
      'mission_candidates:present',
      'mission_candidate_notes:view',
      'mission_candidate_notes:manage',
      'mission_candidates:outcome:manage',
      'mission_candidates:integration:confirm',
    ],
    [RoleName.HR_MANAGER]: [
      'records:view',
      'records:create',
      'records:update',
      'records:archive',
      'records:export',
      'documents:download',
      'clients:view',
      'clients:create',
      'clients:update',
      'clients:status:manage',
      'clients:archive',
      'client_contacts:view',
      'client_contacts:create',
      'client_contacts:update',
      'client_contacts:status:manage',
      'client_contacts:archive',
      'candidates:view',
      'candidates:create',
      'candidates:update',
      'candidates:status:manage',
      'candidates:archive',
      'candidate_profile:view',
      'candidate_profile:manage',
      'messages:view',
      'messages:create',
      'training_enrollments:manage',
      'missions:view',
      'missions:create',
      'missions:update',
      'missions:status:manage',
      'missions:archive',
      'missions:closure:manage',
      'mission_assignments:view',
      'mission_assignments:manage',
      'mission_candidates:view',
      'mission_candidates:create',
      'mission_candidates:transition',
      'mission_candidates:transfer',
      'mission_candidates:present',
      'mission_candidate_notes:view',
      'mission_candidate_notes:manage',
      'mission_candidates:outcome:manage',
      'mission_candidates:integration:confirm',
    ],
    [RoleName.MANAGER]: [
      'records:view',
      'records:create',
      'records:update',
      'records:export',
      'documents:download',
      'messages:view',
      'messages:create',
    ],
    [RoleName.TEAM_LEADER]: [
      'records:view',
      'records:create',
      'records:update',
      'documents:download',
      'messages:view',
      'messages:create',
    ],
    [RoleName.EMPLOYEE]: [
      'records:view',
      'records:create',
      'records:update',
      'messages:view',
      'messages:create',
    ],
    [RoleName.GUEST]: ['records:view'],
    [RoleName.CLIENT_USER]: [
      'records:view',
      'documents:download',
      'messages:view',
      'messages:create',
    ],
  } satisfies Record<RoleName, string[]>;

  await Promise.all(
    roleRecords.flatMap((role) =>
      basePermissionCodesByRole[role.name].map((permissionCode) => {
        const permissionId = permissionByCode.get(permissionCode);

        if (!permissionId) {
          throw new Error(`Missing seeded permission ${permissionCode}`);
        }

        return prisma.rolePermission.upsert({
          where: {
            roleId_permissionId: {
              roleId: role.id,
              permissionId,
            },
          },
          update: {},
          create: {
            roleId: role.id,
            permissionId,
          },
        });
      }),
    ),
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
