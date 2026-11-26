/** Digest-bound control bytes. No installation enrollment or manager actions. */
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, readdir } from 'node:fs/promises';
import { dirname, join, relative, isAbsolute, sep } from 'node:path';
import { InstallerError } from './contracts.js';
import { assertLocalControlRoot } from './location.js';
import { controlBinding } from './native.js';
import { closeOwnedFile } from './owned-file.js';

export interface BootstrapHashes { bootstrap: string; native: string }
export const BOOTSTRAP_BYTES = 16 * 1024 * 1024;
export function assertBootstrapHashes(hashes: BootstrapHashes): void {
  if (![hashes.bootstrap, hashes.native].every(hash => /^[a-f0-9]{64}$/.test(hash))) throw new InstallerError('runtime-invalid', 'Invalid bootstrap digest identity');
}
export function assertBootstrapBytes(bytes: Buffer, expected: string): void {
  if (!bytes.length || bytes.length > BOOTSTRAP_BYTES || createHash('sha256').update(bytes).digest('hex') !== expected) throw new InstallerError('runtime-invalid', 'Bootstrap byte bound or digest differs');
}
export async function readBootstrapBytes(path: string, expected: string, signal?: AbortSignal): Promise<Buffer> {
  signal?.throwIfAborted();
  assertLocalControlRoot(dirname(path), process.platform === 'win32' ? value => controlBinding().localVolume(value) : undefined);
  const before = await lstat(path);
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.size < 1 || before.size > BOOTSTRAP_BYTES
    || (process.platform !== 'win32' && (before.uid !== process.getuid?.() || (before.mode & 0o077)))
    || (process.platform === 'win32' && !controlBinding().safePath(path, false, true))) throw new InstallerError('runtime-invalid', 'Unsafe bootstrap file');
  const file = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const initial = await file.stat();
    if (initial.ino !== before.ino || initial.dev !== before.dev || initial.size !== before.size) throw new InstallerError('runtime-invalid', 'Bootstrap changed before reading');
    const bytes = Buffer.alloc(before.size); let count = 0;
    while (count < bytes.length) {
      signal?.throwIfAborted(); const read = await file.read(bytes, count, bytes.length - count, null);
      if (!read.bytesRead) throw new InstallerError('runtime-invalid', 'Truncated bootstrap'); count += read.bytesRead;
    }
    const after = await file.stat(), named = await lstat(path); signal?.throwIfAborted();
    if (after.size !== initial.size || after.mtimeMs !== initial.mtimeMs || after.ctimeMs !== initial.ctimeMs
      || named.ino !== initial.ino || named.dev !== initial.dev || named.nlink !== 1 || named.isSymbolicLink()) throw new InstallerError('runtime-invalid', 'Bootstrap changed while reading');
    assertBootstrapBytes(bytes, expected); return bytes;
  } finally { await closeOwnedFile(file); signal?.throwIfAborted(); }
}
export async function verifyBootstrapControl(directory: string, hashes: BootstrapHashes, home: string, signal?: AbortSignal): Promise<{ bootstrap: Buffer; native: Buffer }> {
  assertBootstrapHashes(hashes);
  assertLocalControlRoot(directory, process.platform === 'win32' ? value => controlBinding().localVolume(value) : undefined);
  const part = relative(home, directory);
  if (isAbsolute(part) || part === '..' || part.startsWith(`..${sep}`)) throw new InstallerError('path-invalid', 'Bootstrap control escapes its explicit home');
  const roots = [join(directory, 'native')];
  for (let path = directory; ; path = dirname(path)) { roots.push(path); if (relative(home, path) === '') break; }
  for (const path of roots) {
    signal?.throwIfAborted();
    const info = await lstat(path);
    if (!info.isDirectory() || info.isSymbolicLink() || (process.platform !== 'win32' && (info.uid !== process.getuid?.() || (info.mode & 0o077)))
      || (process.platform === 'win32' && !controlBinding().safePath(path, true, true))) throw new InstallerError('runtime-invalid', 'Unsafe bootstrap directory');
  }
  if ((await readdir(directory)).sort().join(',') !== 'bootstrap.mjs,native' || (await readdir(join(directory, 'native'))).join(',') !== 'control.node') throw new InstallerError('runtime-invalid', 'Bootstrap control membership differs');
  const bootstrap = await readBootstrapBytes(join(directory, 'bootstrap.mjs'), hashes.bootstrap, signal);
  const native = await readBootstrapBytes(join(directory, 'native', 'control.node'), hashes.native, signal);
  return { bootstrap, native };
}
