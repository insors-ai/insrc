import { constants } from 'node:fs';
import type { FileHandle } from 'node:fs/promises';
import { lstat, open, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { assertRoot, classifyLayout, prepareRoot, errno, LAYOUT_FILE, LAYOUT_PENDING, LAYOUT_TEXT, OWNER_FILE } from './configuration.js';
import type { MemoryOptions } from './types.js';
import type { RootIdentity } from './configuration.js';
import { loadNative } from './native.js';
import type { NativeLock } from './native.js';
import { assertPrivateFile } from './private-file.js';
import { MemoryError } from './errors.js';

export interface DirectoryOwnership {
  assertOwned(): Promise<void>;
  close(): Promise<void>;
}

// Explicit lifetime, including failed cleanup: FileHandle GC must not grant ownership.
const liveDescriptors = new Set<FileHandle>();
async function closeDescriptor(file: FileHandle): Promise<void> {
  await file.close();
  liveDescriptors.delete(file);
}

async function assertFile(file: FileHandle): Promise<void> {
  assertPrivateFile(await file.stat());
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

// New-layout writes are isolated from the read-only existing-layout path.
async function initializeNewLayout(root: RootIdentity): Promise<void> {
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

/** Preserve typed failures while sanitizing private native/OS details. */
function acquisitionError(error: unknown): MemoryError {
  if (error instanceof MemoryError) return error;
  const code = errno(error);
  if (code === 'EAGAIN' || code === 'EWOULDBLOCK') return new MemoryError('OWNERSHIP_CONFLICT', 'Memory directory is already owned.', true);
  if (code === 'ELOOP' || code === 'EISDIR') return new MemoryError('INVALID_REQUEST', 'Ownership metadata path is unsafe.');
  return new MemoryError('STORE_UNAVAILABLE', 'Memory ownership could not be acquired.', true);
}

async function failedAcquisition(file: FileHandle | undefined, error: unknown): Promise<never> {
  try { if (file) await closeDescriptor(file); }
  catch { throw new MemoryError('STORE_UNAVAILABLE', 'Failed ownership cleanup could not be verified.'); }
  throw acquisitionError(error);
}

/** This phase owns only descriptor acquisition; a failure releases that fd once. */
async function lockDescriptor(root: RootIdentity, native: NativeLock): Promise<FileHandle> {
  let file: FileHandle | undefined;
  try {
    await assertRoot(root);
    file = await open(join(root.path, OWNER_FILE), constants.O_RDWR | constants.O_CREAT | constants.O_NOFOLLOW, 0o600);
    liveDescriptors.add(file);
    await assertFile(file);
    native.closeOnExec(file.fd);
    await native.exclusive(file.fd);
    await checkIdentity(root, file);
    return file;
  } catch (error) { return failedAcquisition(file, error); }
}

/** The sole authoritative new/existing decision is made while holding the lock. */
async function establishOwnedLayout(root: RootIdentity, file: FileHandle): Promise<void> {
  const layout = await classifyLayout(root);
  if (layout === 'new') await initializeNewLayout(root);
  // Existing layouts take the read-only path; both paths verify final identity.
  await checkIdentity(root, file);
}

function ownershipGuard(root: RootIdentity, owned: FileHandle): DirectoryOwnership {
  let closing: Promise<void> | undefined;
  return Object.freeze({
    async assertOwned() {
      if (closing) throw new MemoryError('NOT_READY', 'Memory ownership is closing.');
      try { await checkIdentity(root, owned); }
      catch { throw new MemoryError('STORE_UNAVAILABLE', 'Memory ownership cannot be verified.'); }
    },
    close() {
      closing ??= closeDescriptor(owned).catch(() => { throw new MemoryError('STORE_UNAVAILABLE', 'Memory ownership release could not be verified.'); });
      return closing;
    },
  });
}

/** Prepare once, acquire, establish layout, then transfer the descriptor to its guard. */
export async function acquireOwnership(options: MemoryOptions, suppliedNative?: NativeLock): Promise<DirectoryOwnership> {
  // prepareRoot performs the one read-only preflight, before native loading or
  // lock-file creation. Its layout classification is validation, not a decision
  // retained across acquisition. There is no second pre-lock classification.
  const root = await prepareRoot(options);
  const native = suppliedNative ?? await loadNative();
  const file = await lockDescriptor(root, native);
  try {
    await establishOwnedLayout(root, file);
    return ownershipGuard(root, file);
  } catch (error) { return failedAcquisition(file, error); }
}
