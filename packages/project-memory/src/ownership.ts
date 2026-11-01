import { constants } from 'node:fs';
import type { FileHandle } from 'node:fs/promises';
import { lstat, open, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { assertRoot, classifyLayout, errno, LAYOUT_FILE, LAYOUT_PENDING, LAYOUT_TEXT, OWNER_FILE } from './configuration.js';
import type { RootIdentity } from './configuration.js';
import { loadNative } from './native.js';
import type { NativeLock } from './native.js';
import { MemoryError } from './errors.js';

export interface DirectoryOwnership {
  assertOwned(): Promise<void>;
  close(): Promise<void>;
}

async function assertFile(file: FileHandle): Promise<void> {
  const value = await file.stat();
  if (!value.isFile() || value.nlink !== 1 || value.uid !== process.getuid!() || (value.mode & 0o077) !== 0) {
    throw new MemoryError('INVALID_REQUEST', 'Ownership metadata must be a private regular single-link file.');
  }
}

async function checkIdentity(root: RootIdentity, file: FileHandle): Promise<void> {
  await assertRoot(root);
  await assertFile(file);
  const descriptor = await file.stat({ bigint: true });
  const path = await lstat(join(root.path, OWNER_FILE), { bigint: true });
  if (!path.isFile() || path.dev !== descriptor.dev || path.ino !== descriptor.ino) {
    throw new MemoryError('STORE_UNAVAILABLE', 'Ownership file identity changed.');
  }
}

async function initializeLayout(root: RootIdentity): Promise<void> {
  if (await classifyLayout(root) === 'existing') return;
  const file = await open(join(root.path, LAYOUT_PENDING), constants.O_RDWR | constants.O_CREAT | constants.O_NOFOLLOW, 0o600);
  try {
    await assertFile(file);
    await file.truncate(0);
    await file.writeFile(LAYOUT_TEXT);
    await file.sync();
  } finally { await file.close(); }
  await assertRoot(root);
  await rename(join(root.path, LAYOUT_PENDING), join(root.path, LAYOUT_FILE));
  const directory = await open(root.path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try {
    const value = await directory.stat({ bigint: true });
    if (value.dev !== root.dev || value.ino !== root.ino) throw new MemoryError('STORE_UNAVAILABLE', 'Memory directory identity changed.');
    await directory.sync();
  } finally { await directory.close(); }
}

/** All native callbacks finish before cleanup closes their descriptor. Never unlink it. */
export async function acquireOwnership(root: RootIdentity, suppliedNative?: NativeLock): Promise<DirectoryOwnership> {
  let file: FileHandle | undefined;
  try {
    const native = suppliedNative ?? await loadNative();
    await classifyLayout(root); // Do not create lock files in unrelated directories.
    file = await open(join(root.path, OWNER_FILE), constants.O_RDWR | constants.O_CREAT | constants.O_NOFOLLOW, 0o600);
    await assertFile(file);
    native.closeOnExec(file.fd);
    await native.exclusive(file.fd);
    await checkIdentity(root, file);
    await initializeLayout(root);
    await checkIdentity(root, file);
    const owned = file;
    let closing: Promise<void> | undefined;
    return Object.freeze({
      async assertOwned() {
        if (closing) throw new MemoryError('NOT_READY', 'Memory ownership is closing.');
        try { await checkIdentity(root, owned); }
        catch { throw new MemoryError('STORE_UNAVAILABLE', 'Memory ownership cannot be verified.'); }
      },
      close() {
        closing ??= owned.close().catch(() => { throw new MemoryError('STORE_UNAVAILABLE', 'Memory ownership release could not be verified.'); });
        return closing;
      },
    });
  } catch (error) {
    try { await file?.close(); }
    catch { throw new MemoryError('STORE_UNAVAILABLE', 'Failed ownership cleanup could not be verified.'); }
    if (error instanceof MemoryError) throw error;
    const code = errno(error);
    if (code === 'EAGAIN' || code === 'EWOULDBLOCK') throw new MemoryError('OWNERSHIP_CONFLICT', 'Memory directory is already owned.', true);
    if (code === 'ELOOP' || code === 'EISDIR') throw new MemoryError('INVALID_REQUEST', 'Ownership metadata path is unsafe.');
    throw new MemoryError('STORE_UNAVAILABLE', 'Memory ownership could not be acquired.', true);
  }
}
