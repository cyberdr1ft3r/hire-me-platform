import { Module } from '@nestjs/common';

import { ProtectedStorageService } from './protected-storage.service.js';

@Module({
  providers: [ProtectedStorageService],
  exports: [ProtectedStorageService],
})
export class StorageModule {}
