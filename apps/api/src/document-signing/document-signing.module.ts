import { Module } from '@nestjs/common';

import { DocumentSigningAuditService } from './document-signing-audit.service.js';
import { DocumentSigningController } from './document-signing.controller.js';
import { DocumentSigningService } from './document-signing.service.js';
import { PreparedSigningArtifactService } from './prepared-signing-artifact.service.js';
import { PdfSignatureValidatorService } from './validation/pdf-signature-validator.service.js';
import { AuthModule } from '../auth/auth.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { DocumentGenerationModule } from '../document-generation/document-generation.module.js';
import { DocumentsModule } from '../documents/documents.module.js';
import { PrismaModule } from '../persistence/prisma/prisma.module.js';

@Module({
  imports: [AuthModule, PrismaModule, StorageModule, DocumentsModule, DocumentGenerationModule],
  controllers: [DocumentSigningController],
  providers: [
    DocumentSigningService,
    DocumentSigningAuditService,
    PreparedSigningArtifactService,
    PdfSignatureValidatorService,
  ],
  exports: [DocumentSigningService],
})
export class DocumentSigningModule {}
