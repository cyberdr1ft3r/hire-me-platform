import { PasswordService } from './password.service.js';
import { normalizeEmail } from './normalize-email.js';
import { ARGON2ID_PARAMETERS } from './auth.constants.js';
import { PrismaClient, RoleName } from '../persistence/prisma/generated-client.js';

const prisma = new PrismaClient();
const passwords = new PasswordService();

function readRequired(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required for explicit development bootstrap`);
  }
  return value;
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Development admin bootstrap is disabled in production');
  }

  const email = readRequired('AUTH_BOOTSTRAP_ADMIN_EMAIL');
  const password = readRequired('AUTH_BOOTSTRAP_ADMIN_PASSWORD');

  if (
    /replace-with|change_me|password|example/i.test(password) ||
    !passwords.validatePasswordPolicy(password)
  ) {
    throw new Error('AUTH_BOOTSTRAP_ADMIN_PASSWORD does not satisfy the required safe policy');
  }

  const normalizedEmail = normalizeEmail(email);
  const passwordHash = await passwords.hashPassword(password);
  const user = await prisma.user.upsert({
    where: { normalizedEmail },
    update: {
      email,
      displayName: 'Development Administrator',
      status: 'ACTIVE',
      archivedAt: null,
    },
    create: {
      email,
      normalizedEmail,
      displayName: 'Development Administrator',
      status: 'ACTIVE',
    },
  });

  const role = await prisma.role.findUniqueOrThrow({
    where: { name: RoleName.SUPER_ADMIN },
  });

  await prisma.passwordCredential.upsert({
    where: { userId: user.id },
    update: {
      passwordHash,
      algorithm: ARGON2ID_PARAMETERS.algorithm,
      parametersVersion: ARGON2ID_PARAMETERS.parametersVersion,
      passwordUpdatedAt: new Date(),
    },
    create: {
      userId: user.id,
      passwordHash,
      algorithm: ARGON2ID_PARAMETERS.algorithm,
      parametersVersion: ARGON2ID_PARAMETERS.parametersVersion,
    },
  });

  await prisma.userRole.upsert({
    where: {
      userId_roleId: {
        userId: user.id,
        roleId: role.id,
      },
    },
    update: { archivedAt: null },
    create: {
      userId: user.id,
      roleId: role.id,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorUserId: user.id,
      targetUserId: user.id,
      action: 'auth.bootstrap_admin.upserted',
      entityType: 'Authentication',
      entityId: user.id,
      metadataSummary: 'Development administrator credential bootstrapped.',
    },
  });

  console.log('Development administrator bootstrap completed.');
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Bootstrap failed');
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
