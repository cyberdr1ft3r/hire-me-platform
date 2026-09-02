import { Module } from '@nestjs/common';

import { DocumentAuditService } from './document-audit.service.js';
import { DocumentsController } from './documents.controller.js';
import { DocumentsService } from './documents.service.js';
import { AuthModule } from '../auth/auth.module.js';
import { PrismaModule } from '../persistence/prisma/prisma.module.js';
import { StorageModule } from '../storage/storage.module.js';

@Module({
  imports: [AuthModule, PrismaModule, StorageModule],
  controllers: [DocumentsController],
  providers: [DocumentAuditService, DocumentsService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
