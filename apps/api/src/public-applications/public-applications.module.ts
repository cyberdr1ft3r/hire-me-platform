import { Module } from '@nestjs/common';

import { InternalPublicApplicationsController } from './public-applications.internal.controller.js';
import { PublicApplicationsController } from './public-applications.controller.js';
import { PublicApplicationsService } from './public-applications.service.js';
import { AuthModule } from '../auth/auth.module.js';
import { PrismaModule } from '../persistence/prisma/prisma.module.js';
import { StorageModule } from '../storage/storage.module.js';

@Module({
  imports: [AuthModule, PrismaModule, StorageModule],
  controllers: [PublicApplicationsController, InternalPublicApplicationsController],
  providers: [PublicApplicationsService],
})
export class PublicApplicationsModule {}
