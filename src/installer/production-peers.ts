import { bundleDelivery } from './bundle-delivery.js';
import { devDelivery } from './dev-delivery.js';
import { realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { InstallerError, PRIVATE_NODE_VERSION } from './contracts.js';
import type { Target, InstallationLocation } from './contracts.js';
import type { ManagerPeers } from './peer-contracts.js';
/** Owning stories supply actual dependency/lifecycle/migration adapters here.
 * No fixture/no-op can accidentally certify a real installation. */
export function controlRuntimeDirectory(target: Target): string {
  if (process.version !== `v${PRIVATE_NODE_VERSION}` || process.platform !== target.os || process.arch !== target.arch) throw new InstallerError('runtime-invalid', 'The exact private target runtime is required');
  const executable = realpathSync(process.execPath);
  return target.os === 'win32' ? dirname(executable) : dirname(dirname(executable));
}
export function productionPeers(target: Target, _location: InstallationLocation): ManagerPeers {
  return { bundle: bundleDelivery(target), dev: devDelivery(target, {
    runtimeDirectory: controlRuntimeDirectory(target), workerEntrypoint: join(dirname(fileURLToPath(import.meta.url)), 'bootstrap.mjs'),
  }) };
}
