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
    code: 'documents:view',
    description: 'View protected document metadata and version history within authorized context.',
    scopeType: PermissionScopeType.EXPLICIT,
  },
  {
    code: 'documents:create',
    description: 'Register protected documents within authorized business context.',
    scopeType: PermissionScopeType.EXPLICIT,
  },
  {
    code: 'documents:versions:create',
    description: 'Add immutable uploaded document versions within authorized context.',
    scopeType: PermissionScopeType.EXPLICIT,
  },
  {
    code: 'documents:update',
    description: 'Update approved protected document metadata within authorized context.',
    scopeType: PermissionScopeType.EXPLICIT,
  },
  {
    code: 'documents:archive',
    description: 'Archive protected documents without deleting version history.',
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
  {
    code: 'offers:view',
    description: 'View offer versions and history for authorized mission candidate processes.',
    scopeType: PermissionScopeType.EXPLICIT,
  },
  {
    code: 'offers:create',
    description: 'Create internal offer drafts for authorized mission candidate processes.',
    scopeType: PermissionScopeType.EXPLICIT,
  },
  {
    code: 'offers:update',
    description: 'Revise internal offers into new immutable versions.',
    scopeType: PermissionScopeType.EXPLICIT,
  },
  {
    code: 'offers:send_or_mark_sent',
    description: 'Record that an offer version was sent through staff-controlled channels.',
    scopeType: PermissionScopeType.EXPLICIT,
  },
  {
    code: 'offers:record_response',
    description: 'Record staff-entered offer negotiation, acceptance, rejection, or expiry.',
    scopeType: PermissionScopeType.EXPLICIT,
  },
  {
    code: 'offers:withdraw',
    description: 'Withdraw an internal offer version with preserved history.',
    scopeType: PermissionScopeType.EXPLICIT,
  },
  {
    code: 'placements:view',
    description: 'View placement confirmation and correction state for authorized processes.',
    scopeType: PermissionScopeType.EXPLICIT,
  },
  {
    code: 'placements:confirm',
    description: 'Confirm integration and count a placement from an accepted current offer.',
    scopeType: PermissionScopeType.EXPLICIT,
  },
  {
    code: 'placements:correct',
    description: 'Correct a confirmed placement with a mandatory reason and preserved history.',
    scopeType: PermissionScopeType.EXPLICIT,
  },
  {
    code: 'placement_commercial_eligibility:view',
    description: 'View whether confirmed placements are eligible for later invoicing.',
    scopeType: PermissionScopeType.EXPLICIT,
  },
  {
    code: 'interviews:view',
    description: 'View interviews for authorized mission candidate processes.',
    scopeType: PermissionScopeType.EXPLICIT,
  },
  {
    code: 'interviews:schedule',
    description: 'Schedule interviews for authorized mission candidate processes.',
    scopeType: PermissionScopeType.EXPLICIT,
  },
  {
    code: 'interviews:reschedule',
    description: 'Reschedule or postpone interviews with preserved reason history.',
    scopeType: PermissionScopeType.EXPLICIT,
  },
  {
    code: 'interviews:complete',
    description: 'Complete interviews for authorized mission candidate processes.',
    scopeType: PermissionScopeType.EXPLICIT,
  },
  {
    code: 'interviews:cancel',
    description: 'Cancel interviews for authorized mission candidate processes.',
    scopeType: PermissionScopeType.EXPLICIT,
  },
  {
    code: 'interviews:archive',
    description: 'Archive interview records without physical deletion.',
    scopeType: PermissionScopeType.EXPLICIT,
  },
  {
    code: 'interview_participants:manage',
    description: 'Add or archive interview participants within authorized process scope.',
    scopeType: PermissionScopeType.EXPLICIT,
  },
  {
    code: 'evaluations:view',
    description: 'View structured evaluations with permission-aware redaction.',
    scopeType: PermissionScopeType.EXPLICIT,
  },
  {
    code: 'evaluations:internal:view',
    description: 'View internal-only interview evaluation content.',
    scopeType: PermissionScopeType.EXPLICIT,
  },
  {
    code: 'evaluations:create',
    description: 'Create structured interview evaluations as an authorized evaluator.',
    scopeType: PermissionScopeType.EXPLICIT,
  },
  {
    code: 'evaluations:update',
    description: 'Update own draft structured interview evaluations.',
    scopeType: PermissionScopeType.EXPLICIT,
  },
  {
    code: 'evaluations:finalize',
    description: 'Finalize structured interview evaluations idempotently.',
    scopeType: PermissionScopeType.EXPLICIT,
  },
  {
    code: 'client_feedback:view',
    description: 'View client-authored interview feedback where explicitly authorized.',
    scopeType: PermissionScopeType.EXPLICIT,
  },
  {
    code: 'tasks:view',
    description:
      'View tasks owned, created, assigned, or reachable through authorized record scope.',
    scopeType: PermissionScopeType.ASSIGNED,
  },
  {
    code: 'tasks:view_all',
    description: 'View all internal tasks for explicit operational oversight.',
    scopeType: PermissionScopeType.EXPLICIT,
  },
  {
    code: 'tasks:create',
    description: 'Create internal tasks linked to implemented business records.',
    scopeType: PermissionScopeType.ASSIGNED,
  },
  {
    code: 'tasks:update',
    description: 'Update operational fields on visible writable tasks.',
    scopeType: PermissionScopeType.ASSIGNED,
  },
  {
    code: 'tasks:assign',
    description: 'Assign and remove active internal task assignees.',
    scopeType: PermissionScopeType.EXPLICIT,
  },
  {
    code: 'tasks:transition',
    description: 'Move visible tasks through the approved internal lifecycle.',
    scopeType: PermissionScopeType.ASSIGNED,
  },
  {
    code: 'tasks:comment',
    description: 'Create, edit, and archive internal task comments with explicit mentions.',
    scopeType: PermissionScopeType.ASSIGNED,
  },
  {
    code: 'tasks:reminders:manage',
    description: 'Create, cancel, and process durable in-app task reminders.',
    scopeType: PermissionScopeType.ASSIGNED,
  },
  {
    code: 'tasks:archive',
    description: 'Archive internal tasks with a required reason.',
    scopeType: PermissionScopeType.EXPLICIT,
  },
  {
    code: 'notifications:view_own',
    description: 'View only in-app notifications addressed to the current user.',
    scopeType: PermissionScopeType.ASSIGNED,
  },
  {
    code: 'notifications:update_own',
    description: 'Mark own in-app notifications read or archived.',
    scopeType: PermissionScopeType.ASSIGNED,
  },
  {
    code: 'public_opportunities:view',
    description: 'View internal public opportunity configuration for recruitment missions.',
    scopeType: PermissionScopeType.EXPLICIT,
  },
  {
    code: 'public_opportunities:manage',
    description: 'Manage approved public opportunity fields and application-link controls.',
    scopeType: PermissionScopeType.EXPLICIT,
  },
  {
    code: 'public_opportunities:publish',
    description: 'Publish or unpublish public opportunity listing and link availability.',
    scopeType: PermissionScopeType.EXPLICIT,
  },
  {
    code: 'public_applications:view',
    description: 'Review public application submissions within authorized mission context.',
    scopeType: PermissionScopeType.EXPLICIT,
  },
  {
    code: 'reporting:recruitment:view',
    description:
      'View recruitment reporting KPIs, distributions, trends, breakdowns, and drilldowns within authorized mission scope.',
    scopeType: PermissionScopeType.EXPLICIT,
  },
  {
    code: 'reporting:recruitment:export',
    description: 'Export scoped recruitment reporting datasets as safe CSV files.',
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
      'documents:view',
      'documents:create',
      'documents:versions:create',
      'documents:update',
      'documents:archive',
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
      'offers:view',
      'offers:create',
      'offers:update',
      'offers:send_or_mark_sent',
      'offers:record_response',
      'offers:withdraw',
      'placements:view',
      'placements:confirm',
      'placements:correct',
      'placement_commercial_eligibility:view',
      'interviews:view',
      'interviews:schedule',
      'interviews:reschedule',
      'interviews:complete',
      'interviews:cancel',
      'interviews:archive',
      'interview_participants:manage',
      'evaluations:view',
      'evaluations:internal:view',
      'evaluations:create',
      'evaluations:update',
      'evaluations:finalize',
      'client_feedback:view',
      'tasks:view',
      'tasks:view_all',
      'tasks:create',
      'tasks:update',
      'tasks:assign',
      'tasks:transition',
      'tasks:comment',
      'tasks:reminders:manage',
      'tasks:archive',
      'notifications:view_own',
      'notifications:update_own',
      'public_opportunities:view',
      'public_opportunities:manage',
      'public_opportunities:publish',
      'public_applications:view',
      'reporting:recruitment:view',
      'reporting:recruitment:export',
    ],
    [RoleName.HR_MANAGER]: [
      'records:view',
      'records:create',
      'records:update',
      'records:archive',
      'records:export',
      'documents:download',
      'documents:view',
      'documents:create',
      'documents:versions:create',
      'documents:update',
      'documents:archive',
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
      'offers:view',
      'offers:create',
      'offers:update',
      'offers:send_or_mark_sent',
      'offers:record_response',
      'offers:withdraw',
      'placements:view',
      'placements:confirm',
      'placements:correct',
      'placement_commercial_eligibility:view',
      'interviews:view',
      'interviews:schedule',
      'interviews:reschedule',
      'interviews:complete',
      'interviews:cancel',
      'interviews:archive',
      'interview_participants:manage',
      'evaluations:view',
      'evaluations:internal:view',
      'evaluations:create',
      'evaluations:update',
      'evaluations:finalize',
      'client_feedback:view',
      'tasks:view',
      'tasks:view_all',
      'tasks:create',
      'tasks:update',
      'tasks:assign',
      'tasks:transition',
      'tasks:comment',
      'tasks:reminders:manage',
      'tasks:archive',
      'notifications:view_own',
      'notifications:update_own',
      'public_opportunities:view',
      'public_opportunities:manage',
      'public_opportunities:publish',
      'public_applications:view',
      'reporting:recruitment:view',
      'reporting:recruitment:export',
    ],
    [RoleName.MANAGER]: [
      'records:view',
      'records:create',
      'records:update',
      'records:export',
      'documents:download',
      'messages:view',
      'messages:create',
      'tasks:view',
      'tasks:create',
      'tasks:update',
      'tasks:assign',
      'tasks:transition',
      'tasks:comment',
      'tasks:reminders:manage',
      'tasks:archive',
      'notifications:view_own',
      'notifications:update_own',
    ],
    [RoleName.TEAM_LEADER]: [
      'records:view',
      'records:create',
      'records:update',
      'documents:download',
      'messages:view',
      'messages:create',
      'tasks:view',
      'tasks:create',
      'tasks:update',
      'tasks:assign',
      'tasks:transition',
      'tasks:comment',
      'tasks:reminders:manage',
      'notifications:view_own',
      'notifications:update_own',
    ],
    [RoleName.EMPLOYEE]: [
      'records:view',
      'records:create',
      'records:update',
      'messages:view',
      'messages:create',
      'tasks:view',
      'tasks:create',
      'tasks:update',
      'tasks:transition',
      'tasks:comment',
      'tasks:reminders:manage',
      'notifications:view_own',
      'notifications:update_own',
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
