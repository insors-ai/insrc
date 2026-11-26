/** Consumer binding to a real resolver result, never an ambient executable root. */
import { realpathSync } from 'node:fs';
import { join } from 'node:path';
import { InstallerError } from './contracts.js';
import type { InstallationLocation, RuntimeIdentity } from './contracts.js';
import type { ResolvedPrivateRuntime } from './runtime-metadata.js';
import { privateRuntimePaths, runtimeStorePaths, runtimeProfile } from './runtime-policy.js';
export function assertRuntimeBinding(location: InstallationLocation, runtime: ResolvedPrivateRuntime, requireProcess = true): void {
  if (!runtime?.identity) throw new InstallerError('runtime-invalid', 'A verified runtime result is required');
  const identity = runtime.identity, target = identity.target, paths = runtimeStorePaths(location.home, identity);
  const npm = target.os === 'win32' ? 'node_modules/npm/bin/npm-cli.js' : 'lib/node_modules/npm/bin/npm-cli.js';
  if (target.os !== process.platform || target.arch !== process.arch || runtime.directory !== paths.directory
    || runtime.node !== join(paths.directory, identity.relativeExecutable) || runtime.npmCli !== join(paths.directory, npm)
    || runtime.headers !== paths.directory || runtime.nodeLib !== (target.os === 'win32' ? join(paths.directory, target.arch, 'node.lib') : undefined)
    || runtime.inventorySha256 !== runtimeProfile(target).inventorySha256
    || (requireProcess && (process.version !== `v${identity.version}` || realpathSync(process.execPath) !== runtime.node))) {
    throw new InstallerError('runtime-invalid', 'Consumer is not bound to its exact verified installation runtime');
  }
}
export async function resolveControlRuntime(location: InstallationLocation, identity: RuntimeIdentity,
  options: { signal?: AbortSignal | undefined } = {}): Promise<ResolvedPrivateRuntime> {
  const runtime = await privateRuntimePaths(location, identity, options);
  assertRuntimeBinding(location, runtime); options.signal?.throwIfAborted(); return runtime;
}
