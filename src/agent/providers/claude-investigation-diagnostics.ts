/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { constants, openSync, closeSync, fstatSync, lstatSync, readSync, realpathSync } from 'node:fs';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';

export const CLAUDE_DIAGNOSTIC_BYTES = 256 * 1024;
export const MANAGED_POLICY_PATHS = ['/etc/claude-code/managed-settings.json', '/etc/claude-code/managed-settings.d', '/etc/claude-code/CLAUDE.md'] as const;
export function managedPolicySnapshot() {
  return MANAGED_POLICY_PATHS.map(path => {
    let state: 'absent' | 'present' | 'unknown' = 'unknown';
    try { lstatSync(path); state = 'present'; } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') state = 'absent'; }
    return { path, state };
  });
}
export function prepareClaudeDiagnostic(path: string) {
  const parent = lstatSync(dirname(path));
  if (!parent.isDirectory() || parent.isSymbolicLink() || (parent.mode & 0o077) || realpathSync(dirname(path)) !== dirname(path)) throw Error('Unsafe diagnostic directory');
  const fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  closeSync(fd);
}
/** Read only after actual process drain. A growing/unsafe/oversized log refuses. */
export function readClaudeDiagnostic(path: string) {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = fstatSync(fd);
    if (!before.isFile() || before.nlink !== 1 || (before.mode & 0o077) || (process.getuid && before.uid !== process.getuid()) ||
      before.size > CLAUDE_DIAGNOSTIC_BYTES || realpathSync(path) !== path) throw Error('Unsafe or oversized diagnostic');
    const buffer = Buffer.alloc(CLAUDE_DIAGNOSTIC_BYTES + 1);
    let bytes = 0, n: number;
    while (bytes < buffer.length && (n = readSync(fd, buffer, bytes, buffer.length - bytes, null)) > 0) bytes += n;
    if (bytes !== before.size || fstatSync(fd).size !== before.size) throw Error('Diagnostic changed during capture');
    const data = buffer.subarray(0, bytes);
    return { text: data.toString('utf8'), bytes, digest: createHash('sha256').update(data).digest('hex') };
  } finally { closeSync(fd); }
}
