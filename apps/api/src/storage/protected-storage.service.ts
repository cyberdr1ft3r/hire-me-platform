import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, normalize } from 'node:path';

import { Injectable } from '@nestjs/common';

import { loadEnvironment } from '../config/environment.js';

@Injectable()
export class ProtectedStorageService {
  private readonly root = normalize(loadEnvironment().PRIVATE_UPLOAD_STORAGE_ROOT);

  async put(storageKey: string, content: Buffer): Promise<void> {
    const path = this.resolve(storageKey);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content, { flag: 'wx' });
  }

  async delete(storageKey: string): Promise<void> {
    await rm(this.resolve(storageKey), { force: true });
  }

  private resolve(storageKey: string): string {
    const normalizedKey = normalize(storageKey);
    if (normalizedKey.startsWith('..')) {
      throw new Error('Invalid storage key.');
    }
    return join(this.root, normalizedKey);
  }
}
