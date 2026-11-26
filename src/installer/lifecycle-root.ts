/** Shared S4 root admission; no allocation, identity enrollment or store access. */
import { join } from 'node:path';
import { InstallerError } from './contracts.js';
import type { InstallationLocation } from './contracts.js';
import { assertLocalControlRoot } from './location.js';
import { controlBinding } from './native.js';
import { parseInstaller } from './schemas.js';

export function assertPrivateLifecycleRoot(location: InstallationLocation): void {
  parseInstaller('location', location);
  const binding = controlBinding();
  assertLocalControlRoot(location.home, process.platform === 'win32' ? path => binding.localVolume(path) : undefined);
  for (const path of [location.home, join(location.home, 'install')]) {
    if (!binding.safePath(path, true, true)) throw new InstallerError('data-lease-root-invalid', 'Lifecycle control requires existing private, non-link installation roots');
  }
}
