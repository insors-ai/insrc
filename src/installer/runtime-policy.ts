import { posix, win32 } from 'node:path';
import policy from './runtime-policy.json' with { type: 'json' };
import { InstallerError, PRIVATE_NODE_VERSION } from './contracts.js';
import type { Target, RuntimeIdentity, InstallationLocation } from './contracts.js';
import { assertToken, normalizeHome } from './location.js';
import { RUNTIME_LIMITS, RUNTIME_PROFILE_VERSION } from './runtime-metadata.js';
import type { RuntimeProfile, RuntimeStorePaths, ResolvedPrivateRuntime } from './runtime-metadata.js';
function freeze(value: unknown): void {
  if (value && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); Object.freeze(value); }
}
freeze(policy);
export { policy as runtimePolicy };
/** Release-owned policy identity for control before an app release is selected. */
export function privateRuntimeIdentity(target: Target): RuntimeIdentity {
  const identity = { version: PRIVATE_NODE_VERSION, target: { ...target }, sha256: runtimeArchive(target).sha256,
    relativeExecutable: target.os === 'win32' ? 'node.exe' : 'bin/node' };
  freeze(identity); return identity;
}
export function runtimeArchive(target: Pick<Target, 'os' | 'arch'>): { url: string; sha256: string; root: string } {
  const key = `${target.os}-${target.arch}` as keyof typeof policy.archives;
  const sha256 = policy.archives[key];
  if (!sha256 || policy.nodeVersion !== PRIVATE_NODE_VERSION || policy.headersVersion !== PRIVATE_NODE_VERSION) throw new InstallerError('runtime-invalid', 'Unsupported or inconsistent runtime policy');
  const root = `node-v${policy.nodeVersion}-${target.os === 'win32' ? 'win' : target.os}-${target.arch}`;
  return { url: `https://nodejs.org/download/release/v${policy.nodeVersion}/${root}.${target.os === 'win32' ? 'zip' : 'tar.gz'}`, sha256, root };
}
/** Pinned metadata is not evidence that this target has native qualification. */
export function runtimeProfile(target: Pick<Target, 'os' | 'arch'>): Readonly<RuntimeProfile> {
  runtimeArchive(target);
  const profile = policy.profiles[`${target.os}-${target.arch}` as keyof typeof policy.profiles];
  if (!profile || profile.profileVersion !== RUNTIME_PROFILE_VERSION
    || !/^[a-f0-9]{64}$/.test(profile.nodeSha256) || !/^[a-f0-9]{64}$/.test(profile.inventorySha256)
    || !Number.isSafeInteger(profile.archiveBytes) || profile.archiveBytes < 1 || profile.archiveBytes > RUNTIME_LIMITS.compressedBytes
    || !Number.isSafeInteger(profile.entries) || profile.entries < 1 || profile.entries > RUNTIME_LIMITS.entries
    || !Number.isSafeInteger(profile.expandedBytes) || profile.expandedBytes < 1 || profile.expandedBytes > RUNTIME_LIMITS.expandedBytes) {
    throw new InstallerError('runtime-invalid', 'Invalid pinned runtime distribution profile');
  }
  return profile as RuntimeProfile;
}
/** Pure canonical layout only; no existence, integrity or qualification claim. */
export function runtimeStorePaths(home: string, identity: RuntimeIdentity): Readonly<RuntimeStorePaths> {
  const target = identity.target, archive = runtimeArchive(target);
  if (identity.version !== PRIVATE_NODE_VERSION || identity.sha256 !== archive.sha256
    || identity.relativeExecutable !== (target.os === 'win32' ? 'node.exe' : 'bin/node')) {
    throw new InstallerError('runtime-invalid', 'Runtime identity differs from pinned policy');
  }
  assertToken(target.baseline);
  const path = target.os === 'win32' ? win32 : posix;
  const root = path.join(normalizeHome(home, target.os), 'runtimes', PRIVATE_NODE_VERSION,
    `${target.os}-${target.arch}-${target.baseline}`, archive.sha256);
  return Object.freeze({ root, directory: path.join(root, 'distribution'), inventory: path.join(root, 'inventory.json'), completion: path.join(root, 'completion.json') });
}
/** Read-only resolution. Loading metadata never loads filesystem verification. */
export async function privateRuntimePaths(location: InstallationLocation, identity: RuntimeIdentity,
  options: { signal?: AbortSignal | undefined } = {}): Promise<ResolvedPrivateRuntime> {
  return (await import('./runtime-store.js')).resolveRuntimeStore(location, identity, options);
}
/** All child launches use absolute private executables; no PATH lookup. */
export function privateRuntimeEnvironment(input: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env = { ...input }; delete env['NODE_OPTIONS']; delete env['NODE_PATH'];
  if (env['ONNXRUNTIME_NODE_INSTALL_CUDA'] === undefined) env['ONNXRUNTIME_NODE_INSTALL_CUDA'] = 'skip';
  return env;
}
