import { closeSync } from 'node:fs';
import type { FileHandle } from 'node:fs/promises';
import { InstallerError } from './contracts.js';
/** A close error is missing ownership evidence, not an ordinary parse failure. */
export async function closeOwnedFile(file: FileHandle | undefined): Promise<void> {
  try { await file?.close(); } catch (cause) { throw new InstallerError('resource-close-uncertain', 'Installer file closure is unconfirmed', { cause }); }
}
export function closeOwnedDescriptor(fd: number): void {
  try { closeSync(fd); } catch (cause) { throw new InstallerError('resource-close-uncertain', 'Installer descriptor closure is unconfirmed', { cause }); }
}
