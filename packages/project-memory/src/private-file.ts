import type { Stats } from 'node:fs';
import { MemoryError } from './errors.js';

/** Shared safety rule for metadata and ownership descriptors, not directories. */
export function assertPrivateFile(value: Stats): void {
  if (!value.isFile() || value.nlink !== 1 || value.uid !== process.getuid!() || (value.mode & 0o077) !== 0) {
    throw new MemoryError('INVALID_REQUEST', 'Memory metadata must be a private regular single-link file.');
  }
}
