/** Controller-only permission transitions; these helpers grant no launch authority. */
import { constants } from 'node:fs';
import type { Stats } from 'node:fs';
import { lstat, open, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { InstallerError } from './contracts.js';
import { closeOwnedFile } from './owned-file.js';
import { RUNTIME_LIMITS } from './runtime-metadata.js';

const same = (a: Stats, b: Stats): boolean => a.dev === b.dev && a.ino === b.ino && a.uid === b.uid
  && a.isDirectory() === b.isDirectory() && !b.isSymbolicLink() && (b.isDirectory() || b.isFile() && b.nlink === 1);

/** Change and persist the captured inode, never a followed/reopened link target. */
async function mode(path: string, before: Stats, value: number, held: () => void): Promise<void> {
  held();
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | (before.isDirectory() ? constants.O_DIRECTORY : 0));
  try {
    held();
    if (!same(before, await file.stat()) || !same(before, await lstat(path))) throw new InstallerError('runtime-invalid', 'Runtime protection inode changed');
    held(); await file.chmod(value); held(); await file.sync(); held();
    const after = await file.stat();
    if (!same(before, after) || (after.mode & 0o7777) !== value || !same(before, await lstat(path))) {
      throw new InstallerError('runtime-invalid', 'Runtime protection changed during persistence');
    }
    held();
  } finally { await closeOwnedFile(file); }
}

/** Called only after closed source verification under the original stage proof. */
export async function protectRuntimeDescendants(root: string, held: () => void): Promise<void> {
  held(); if (process.platform === 'win32') return;
  const original = await lstat(root); let count = 0;
  async function visit(path: string, depth: number): Promise<void> {
    held();
    if (++count > RUNTIME_LIMITS.entries * 2 + 16 || depth > 66) throw new InstallerError('runtime-invalid', 'Runtime protection tree exceeds bounds');
    const stat = await lstat(path); held();
    if (stat.uid !== process.getuid?.() || stat.dev !== original.dev || stat.isSymbolicLink() || (stat.mode & 0o7022)
      || !(stat.isDirectory() || stat.isFile() && stat.nlink === 1)) throw new InstallerError('runtime-invalid', 'Runtime protection requires owned non-link entries');
    if (stat.isDirectory()) {
      for (const name of await readdir(path)) await visit(join(path, name), depth + 1);
    }
    // Cross-parent native publication requires the candidate root to stay0700.
    if (path !== root) await mode(path, stat, stat.mode & 0o777 & ~0o222, held);
  }
  await visit(root, 0); held();
  const after = await lstat(root);
  if (!same(original, after) || (after.mode & 0o7777) !== 0o700) throw new InstallerError('runtime-invalid', 'Runtime candidate root must remain0700');
}

/** Root-only sealing follows full protected-content verification by the caller. */
export async function sealRuntimeRoot(root: string, held: () => void): Promise<void> {
  held(); if (process.platform === 'win32') return;
  const stat = await lstat(root); held();
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid?.() || ![0o700, 0o500].includes(stat.mode & 0o7777)) {
    throw new InstallerError('runtime-invalid', 'Runtime root is not an exact permission transition');
  }
  await mode(root, stat, 0o500, held);
}
