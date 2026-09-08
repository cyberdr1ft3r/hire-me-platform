import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ProtectedStorageService } from './protected-storage.service.js';

/**
 * Protected storage publication.
 *
 * Generation publishes bytes before the database transaction commits, so a failed or
 * partial write must never leave a partial object at the final key: the caller would not
 * know that key exists and could not compensate it.
 */
describe('protected storage publication', () => {
  let root: string;
  let storage: ProtectedStorageService;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'hire-me-storage-'));
    process.env.PRIVATE_UPLOAD_STORAGE_ROOT = root;
    storage = new ProtectedStorageService();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(root, { recursive: true, force: true });
  });

  it('publishes bytes that read back exactly', async () => {
    await storage.put('documents/generated/a/one.pdf', Buffer.from('%PDF-1.7 body'));
    expect((await storage.get('documents/generated/a/one.pdf')).toString()).toBe('%PDF-1.7 body');
  });

  it('never overwrites an existing key', async () => {
    await storage.put('documents/generated/a/two.pdf', Buffer.from('first'));
    await expect(
      storage.put('documents/generated/a/two.pdf', Buffer.from('second')),
    ).rejects.toThrow();
    expect((await storage.get('documents/generated/a/two.pdf')).toString()).toBe('first');
  });

  it('leaves no object at the final key when the write itself fails', async () => {
    // A write that fails mid-flight must not publish the final key: the caller records
    // the key only after `put` resolves and would otherwise never compensate it.
    const brokenContent = { length: 1 } as unknown as Buffer;
    await expect(storage.put('documents/generated/a/three.pdf', brokenContent)).rejects.toThrow();
    await expect(storage.get('documents/generated/a/three.pdf')).rejects.toThrow();

    const entries = await readdir(join(root, 'documents/generated/a'));
    // No temporary artefact is left behind either.
    expect(entries).toEqual([]);
  });

  it('cleans up its temporary artefact when publication cannot complete', async () => {
    const key = 'documents/generated/a/four.pdf';
    await storage.put(key, Buffer.from('existing'));

    // The destination already exists, so the atomic publication step fails after the
    // temporary file has been written.
    await expect(storage.put(key, Buffer.from('replacement'))).rejects.toThrow();

    const entries = await readdir(join(root, 'documents/generated/a'));
    expect(entries.filter((entry) => entry.endsWith('.partial'))).toEqual([]);
    expect((await storage.get(key)).toString()).toBe('existing');
  });

  it('refuses to escape the protected root', async () => {
    for (const key of ['../escape.pdf', '/absolute.pdf', 'C:/absolute.pdf']) {
      await expect(storage.put(key, Buffer.from('x'))).rejects.toThrow('Invalid storage key.');
    }
  });
});
