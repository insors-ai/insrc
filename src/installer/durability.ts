/** Filesystem durability only; no controller or application capabilities. */
import { constants, fstatSync, fsyncSync, openSync } from 'node:fs';
import { lstat, readdir } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';
import { InstallerError } from './contracts.js';
import { closeOwnedDescriptor } from './owned-file.js';

export function flushFile(file: string): void {
  const fd = openSync(file, constants.O_RDWR | (constants.O_NOFOLLOW ?? 0));
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.nlink !== 1) throw new InstallerError('path-invalid', 'Durability requires a regular private file');
    fsyncSync(fd);
  } finally { closeOwnedDescriptor(fd); }
}
export function flushDirectory(directory: string): void {
  // Windows namespace durability belongs to native write-through replacement.
  if (process.platform === 'win32') return;
  const fd = openSync(directory, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try { fsyncSync(fd); } finally { closeOwnedDescriptor(fd); }
}
export function flushParents(directory: string, boundary: string): void {
  const part = relative(boundary, directory);
  if (isAbsolute(part) || part === '..' || part.startsWith(`..${sep}`)) throw new InstallerError('path-invalid', 'Durability path escapes its owner');
  for (let current = directory; ; current = dirname(current)) {
    flushDirectory(current); if (relative(boundary, current) === '') return;
  }
}
/** Flush newly created directory entries bottom-up after file data is durable. */
export async function flushDirectoryTree(directory: string, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  if (process.platform === 'win32') return;
  for (const name of await readdir(directory)) {
    signal?.throwIfAborted();
    const path = join(directory, name), stat = await lstat(path);
    if (stat.isSymbolicLink()) throw new InstallerError('path-invalid', 'Durability tree must not contain links');
    if (stat.isDirectory()) await flushDirectoryTree(path, signal);
  }
  flushDirectory(directory);
}
