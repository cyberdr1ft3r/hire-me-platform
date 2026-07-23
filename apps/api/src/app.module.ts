import { Module } from '@nestjs/common';

import { AdminModule } from './admin/admin.module.js';
import { AuthModule } from './auth/auth.module.js';
import { CandidatesModule } from './candidates/candidates.module.js';
import { ClientsModule } from './clients/clients.module.js';
import { HealthController } from './health/health.controller.js';
import { MissionsModule } from './missions/missions.module.js';
import { PublicApplicationsModule } from './public-applications/public-applications.module.js';

@Module({
  imports: [
    AdminModule,
    AuthModule,
    CandidatesModule,
    ClientsModule,
    MissionsModule,
    PublicApplicationsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
