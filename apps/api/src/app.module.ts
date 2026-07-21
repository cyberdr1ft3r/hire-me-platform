import { Module } from '@nestjs/common';

import { AdminModule } from './admin/admin.module.js';
import { AuthModule } from './auth/auth.module.js';
import { CandidatesModule } from './candidates/candidates.module.js';
import { ClientsModule } from './clients/clients.module.js';
import { HealthController } from './health/health.controller.js';

@Module({
  imports: [AdminModule, AuthModule, CandidatesModule, ClientsModule],
  controllers: [HealthController],
})
export class AppModule {}
