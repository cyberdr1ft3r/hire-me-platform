import { Module } from '@nestjs/common';

import { AdminModule } from './admin/admin.module.js';
import { AuthModule } from './auth/auth.module.js';
import { CandidatesModule } from './candidates/candidates.module.js';
import { ClientsModule } from './clients/clients.module.js';
import { DocumentsModule } from './documents/documents.module.js';
import { HealthController } from './health/health.controller.js';
import { MissionsModule } from './missions/missions.module.js';
import { PublicApplicationsModule } from './public-applications/public-applications.module.js';
import { ReportingModule } from './reporting/reporting.module.js';
import { TasksModule } from './tasks/tasks.module.js';

@Module({
  imports: [
    AdminModule,
    AuthModule,
    CandidatesModule,
    ClientsModule,
    DocumentsModule,
    MissionsModule,
    PublicApplicationsModule,
    ReportingModule,
    TasksModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
