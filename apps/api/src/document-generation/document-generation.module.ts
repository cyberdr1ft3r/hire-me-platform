import { Module } from '@nestjs/common';

import { DocumentGenerationController } from './document-generation.controller.js';
import { DocumentGenerationService } from './document-generation.service.js';
import { AuthModule } from '../auth/auth.module.js';
import { PrismaModule } from '../persistence/prisma/prisma.module.js';
import { StorageModule } from '../storage/storage.module.js';

/**
 * Generation reads commercial and training records through Prisma and reuses their
 * merged permission constants, but imports neither module, so no circular module
 * dependency is created.
 */
@Module({
  imports: [AuthModule, PrismaModule, StorageModule],
  controllers: [DocumentGenerationController],
  providers: [DocumentGenerationService],
  exports: [DocumentGenerationService],
})
export class DocumentGenerationModule {}
