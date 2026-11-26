import { bundleDelivery } from './bundle-delivery.js';
import { devDelivery } from './dev-delivery.js';
import { dependencyPort } from './dependencies.js';
import { ollamaPolicies } from './ollama-catalog.js';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { InstallerError } from './contracts.js';
import type { Target, InstallationLocation } from './contracts.js';
import type { ManagerPeers } from './peer-contracts.js';
import type { ResolvedPrivateRuntime } from './runtime-metadata.js';
import { assertRuntimeBinding } from './runtime-binding.js';
import { canonicalJson } from './release-descriptor.js';
/** Owning stories supply actual lifecycle/migration adapters here.
 * No fixture/no-op can accidentally certify a real installation. */
export function productionPeers(target: Target, location: InstallationLocation, runtime: ResolvedPrivateRuntime): ManagerPeers {
  assertRuntimeBinding(location, runtime, false);
  if (canonicalJson(runtime.identity.target) !== canonicalJson(target)) throw new InstallerError('runtime-invalid', 'Dependency runtime target differs');
  const workerEntrypoint = join(dirname(fileURLToPath(import.meta.url)), 'bootstrap.mjs');
  return { bundle: bundleDelivery(target), dev: devDelivery(target, { workerEntrypoint }),
    dependencies: dependencyPort(target, location, { runtime, policies: ollamaPolicies, service: { workerEntrypoint } }) };
}
