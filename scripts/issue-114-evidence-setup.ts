/**
 * Disposable local setup for Issue #114 browser evidence only.
 * Creates synthetic missions/users in hire_me_dev; never use in production.
 */
import { PasswordService } from '../apps/api/src/auth/password.service.js';
import { ARGON2ID_PARAMETERS } from '../apps/api/src/auth/auth.constants.js';
import { PrismaClient, RoleName } from '../apps/api/prisma/generated/client/index.js';

const prisma = new PrismaClient();
const passwords = new PasswordService();

const VIEWER_EMAIL = 'issue114-view@test.hireme.test';
const VIEWER_PASSWORD = 'Synthetic-viewer-123!';

async function main(): Promise<void> {
  let client = await prisma.client.findFirst({
    where: { name: 'Issue 114 Evidence Client' },
  });
  if (!client) {
    client = await prisma.client.create({
      data: {
        name: 'Issue 114 Evidence Client',
        normalizedName: 'issue 114 evidence client',
        status: 'ACTIVE',
      },
    });
  }

  const missionTitles = {
    missing: 'Issue114 Missing Public',
    existing: 'Issue114 Existing Public',
    errorProbe: 'Issue114 Error Probe',
  };

  async function upsertMission(title: string) {
    const existing = await prisma.recruitmentMission.findFirst({
      where: { title, clientId: client!.id },
    });
    if (existing) {
      return existing;
    }
    return prisma.recruitmentMission.create({
      data: {
        clientId: client!.id,
        title,
        description: `${title} description for Issue #114 evidence.`,
        requirements: null,
        state: 'ACTIVE',
        priority: 'NORMAL',
        numberOfPositions: 1,
        location: 'Casablanca',
        workArrangement: 'Hybrid',
        engagementType: 'CDI',
      },
    });
  }

  const missingMission = await upsertMission(missionTitles.missing);
  const existingMission = await upsertMission(missionTitles.existing);
  const errorMission = await upsertMission(missionTitles.errorProbe);

  await prisma.publicOpportunity.deleteMany({
    where: { missionId: { in: [missingMission.id, errorMission.id] } },
  });

  const existingOpportunity = await prisma.publicOpportunity.findUnique({
    where: { missionId: existingMission.id },
  });
  if (!existingOpportunity) {
    await prisma.publicOpportunity.create({
      data: {
        missionId: existingMission.id,
        publicSlug: `issue114-existing-${existingMission.id.slice(0, 8)}`,
        publicTitle: 'Issue114 Existing Public Title',
        publicSummary: 'Existing public summary for regression.',
        publicDescription: 'Existing public description for regression.',
        publicLocation: 'Casablanca',
        status: 'DRAFT',
        applicationLinkEnabled: false,
        listedOnWebsite: false,
      },
    });
  }

  const guestRole = await prisma.role.findUniqueOrThrow({ where: { name: RoleName.GUEST } });
  for (const code of ['missions:view', 'public_opportunities:view'] as const) {
    const permission = await prisma.permission.findUniqueOrThrow({ where: { code } });
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: guestRole.id, permissionId: permission.id } },
      update: { archivedAt: null },
      create: { roleId: guestRole.id, permissionId: permission.id },
    });
  }

  const normalizedViewer = VIEWER_EMAIL.toLowerCase();
  const viewer = await prisma.user.upsert({
    where: { normalizedEmail: normalizedViewer },
    update: {
      email: VIEWER_EMAIL,
      displayName: 'Issue114 View Only',
      status: 'ACTIVE',
      archivedAt: null,
    },
    create: {
      email: VIEWER_EMAIL,
      normalizedEmail: normalizedViewer,
      displayName: 'Issue114 View Only',
      status: 'ACTIVE',
    },
  });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: viewer.id, roleId: guestRole.id } },
    update: { archivedAt: null },
    create: { userId: viewer.id, roleId: guestRole.id },
  });

  const passwordHash = await passwords.hashPassword(VIEWER_PASSWORD);
  await prisma.passwordCredential.upsert({
    where: { userId: viewer.id },
    update: {
      passwordHash,
      algorithm: ARGON2ID_PARAMETERS.algorithm,
      parametersVersion: ARGON2ID_PARAMETERS.parametersVersion,
      passwordUpdatedAt: new Date(),
    },
    create: {
      userId: viewer.id,
      passwordHash,
      algorithm: ARGON2ID_PARAMETERS.algorithm,
      parametersVersion: ARGON2ID_PARAMETERS.parametersVersion,
    },
  });

  console.log(
    JSON.stringify(
      {
        adminEmail: 'admin@example.test',
        adminPassword: 'Synthetic-admin-123!',
        viewerEmail: VIEWER_EMAIL,
        viewerPassword: VIEWER_PASSWORD,
        missions: {
          missing: missingMission.id,
          existing: existingMission.id,
          errorProbe: errorMission.id,
        },
      },
      null,
      2,
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
