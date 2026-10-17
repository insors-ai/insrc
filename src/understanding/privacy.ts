import { chmodSync, lstatSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { AssessmentError } from '../shared/understanding.js';

export function enforcePrivatePaths(storagePath: string, socketPath: string, uid = process.getuid?.()): void {
  if (uid === undefined) throw new AssessmentError('unavailable');
  function secure(path: string, kind: 'directory' | 'file' | 'socket'): void {
    const stat = lstatSync(path);
    if (stat.uid !== uid || stat.isSymbolicLink() || (kind === 'directory' ? !stat.isDirectory()
      : kind === 'socket' ? !stat.isSocket() : !stat.isFile())) throw new AssessmentError('unavailable');
    const mode = kind === 'directory' ? 0o700 : 0o600;
    chmodSync(path, mode);
    if ((lstatSync(path).mode & 0o777) !== mode) throw new AssessmentError('unavailable');
  }
  try {
    secure(dirname(storagePath), 'directory');
    secure(dirname(socketPath), 'directory');
    if (lstatSync(storagePath).isDirectory()) {
      secure(storagePath, 'directory');
      for (const name of readdirSync(storagePath)) secure(join(storagePath, name), 'file');
    } else {
      secure(storagePath, 'file');
      secure(`${storagePath}-lock`, 'file');
    }
    secure(socketPath, 'socket');
  } catch { throw new AssessmentError('unavailable'); }
}
