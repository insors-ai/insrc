/** Strict receipt-mode loading for the installed manager, without source tools. */
import { lstatSync } from 'node:fs';
import { basename, join } from 'node:path';
import { InstallerError } from './contracts.js';
import type { ReleaseManifest, Target } from './contracts.js';
import { installedReceiptMode, parseDevReleaseReceipt } from './dev.js';
import type { DevReleaseReceipt } from './dev.js';
import { BUNDLE_LIMITS, canonicalJson, parseReleaseDescriptor } from './release-descriptor.js';
import type { ReleaseDescriptor } from './release-descriptor.js';
import { parseReleaseManifest } from './schemas.js';
import { readBoundedFile } from './safe-zip.js';
import { assertLocalControlRoot } from './location.js';
import { controlBinding } from './native.js';
export type InstalledReceipt = { mode: 'bundle'; manifest: ReleaseManifest; descriptor: ReleaseDescriptor }
  | { mode: 'dev'; manifest: ReleaseManifest; receipt: DevReleaseReceipt };
function present(file: string): boolean {
  try {
    const stat = lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw new InstallerError('candidate-conflict', 'Installed receipt must be a regular private file');
    return true;
  } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
}
export async function readInstalledReceipt(directory: string, target: Target): Promise<InstalledReceipt> {
  assertLocalControlRoot(directory, process.platform === 'win32' ? path => controlBinding().localVolume(path) : undefined);
  const mode = installedReceiptMode(present(join(directory, '.release.json')), present(join(directory, '.dev-release.json')));
  const raw = (await readBoundedFile(join(directory, mode === 'dev' ? '.dev-release.json' : '.release.json'), BUNDLE_LIMITS.descriptorBytes)).toString('utf8');
  const input: unknown = JSON.parse(raw);
  const value: InstalledReceipt = mode === 'dev'
    ? (() => { const receipt = parseDevReleaseReceipt(input); return { mode: 'dev', manifest: parseReleaseManifest(receipt.manifest, { target }), receipt }; })()
    : (() => { const descriptor = parseReleaseDescriptor(input, { target }); return { mode: 'bundle', manifest: descriptor.manifest, descriptor }; })();
  if (raw !== canonicalJson(value.mode === 'dev' ? value.receipt : value.descriptor) || basename(directory) !== value.manifest.releaseId) throw new InstallerError('candidate-conflict', 'Installed receipt bytes or release directory differ');
  return value;
}
