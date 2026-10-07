import { Inject, Injectable } from '@nestjs/common';

import type { Prisma } from '../persistence/prisma/generated-client.js';
import { PrismaService } from '../persistence/prisma/prisma.service.js';

type PermissionDbClient = PrismaService | Prisma.TransactionClient;

@Injectable()
export class PermissionsService {
  private readonly prisma: PrismaService;

  constructor(@Inject(PrismaService) prisma: PrismaService) {
    this.prisma = prisma;
  }

  async getEffectivePermissionCodes(
    userId: string,
    db: PermissionDbClient = this.prisma,
  ): Promise<string[]> {
    const userRoles = await db.userRole.findMany({
      where: {
        userId,
        archivedAt: null,
        role: { status: 'ACTIVE' },
      },
      include: {
        role: {
          include: {
            permissions: {
              where: {
                archivedAt: null,
                permission: { status: 'ACTIVE' },
              },
              include: { permission: true },
            },
          },
        },
      },
    });

    return [
      ...new Set(
        userRoles.flatMap((userRole) =>
          userRole.role.permissions.map((rolePermission) => rolePermission.permission.code),
        ),
      ),
    ].sort();
  }
}
