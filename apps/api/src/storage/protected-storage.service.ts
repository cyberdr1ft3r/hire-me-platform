import { randomUUID } from 'node:crypto';
import { link, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, normalize } from 'node:path';

import { Injectable } from '@nestjs/common';

import { loadEnvironment } from '../config/environment.js';

@Injectable()
export class ProtectedStorageService {
  private readonly root = normalize(loadEnvironment().PRIVATE_UPLOAD_STORAGE_ROOT);

  /**
   * Publishes bytes to a key that must not already exist.
   *
   * The content is written to a temporary name inside the same protected directory and
   * then linked into place, so a failed or partial write never leaves a partial object
   * at the final key that a caller would not know to compensate. `link` fails when the
   * destination exists, which preserves the no-overwrite guarantee that `flag: 'wx'`
   * previously provided.
   */
  async put(storageKey: string, content: Buffer): Promise<void> {
    const path = this.resolve(storageKey);
    await mkdir(dirname(path), { recursive: true });
    const temporaryPath = `${path}.${randomUUID()}.partial`;
    try {
      await writeFile(temporaryPath, content, { flag: 'wx' });
      await link(temporaryPath, path);
    } finally {
      await rm(temporaryPath, { force: true });
    }
  }

  async get(storageKey: string): Promise<Buffer> {
    return readFile(this.resolve(storageKey));
  }

  async delete(storageKey: string): Promise<void> {
    await rm(this.resolve(storageKey), { force: true });
  }

  private resolve(storageKey: string): string {
    const normalizedKey = normalize(storageKey);
    if (
      isAbsolute(normalizedKey) ||
      /^[A-Za-z]:[\\/]/.test(normalizedKey) ||
      normalizedKey.startsWith('..')
    ) {
      throw new Error('Invalid storage key.');
    }
    return join(this.root, normalizedKey);
  }
}
