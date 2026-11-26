/** Official runtime acquisition/staging. Publication belongs to the next layer. */
import { lstat, mkdtemp, mkdir, rm } from 'node:fs/promises';
import { lstatSync } from 'node:fs';
import { join } from 'node:path';
import { InstallerError } from './contracts.js';
import type { InstallationLocation, RuntimeIdentity } from './contracts.js';
import { assertLocalControlRoot, normalizeHome } from './location.js';
import { controlBinding } from './native.js';
import { parseInstaller } from './schemas.js';
import { downloadBoundedAsset } from './download.js';
import type { DownloadTransport } from './download.js';
import { runtimeArchive, runtimePolicy, runtimeProfile, runtimeStorePaths } from './runtime-policy.js';
import { RUNTIME_LIMITS } from './runtime-metadata.js';
import { extractRuntimeProfile } from './runtime-archive.js';
import type { RuntimeArchiveSources } from './runtime-archive.js';

export interface RuntimeStageOwner { readonly location: InstallationLocation; assertHeld(): void }
export interface StagedRuntime {
  readonly workDirectory: string; readonly directory: string; readonly identity: RuntimeIdentity;
}
const stages = new WeakMap<StagedRuntime, { owner: RuntimeStageOwner; dev: number; ino: number; uncertain?: boolean }>();
const DRAIN_MS = 5_000;

/** On abort, wait for positive operation closure. Unknown actors retain their stage. */
export async function closedRuntimeOperation<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let aborted!: () => void;
  const uncertain = new Promise<never>((_resolve, reject) => {
    aborted = () => { timer ??= setTimeout(() => reject(new InstallerError('resource-close-uncertain', 'Runtime actor closure remains unconfirmed; retain its owned stage')), DRAIN_MS); };
    signal.addEventListener('abort', aborted, { once: true }); if (signal.aborted) aborted();
  });
  try { return await Promise.race([operation, uncertain]); }
  finally { signal.removeEventListener('abort', aborted); if (timer) clearTimeout(timer); }
}
async function removeOwned(work: string, expected: { dev: number; ino: number }): Promise<void> {
  const stat = await lstat(work);
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.dev !== expected.dev || stat.ino !== expected.ino
    || (process.platform !== 'win32' && (stat.uid !== process.getuid?.() || (stat.mode & 0o077)))
    || (process.platform === 'win32' && !controlBinding().safePath(work, true, true))) {
    throw new InstallerError('resource-close-uncertain', `Runtime stage ownership is uncertain; retained ${work}`);
  }
  await rm(work, { recursive: true });
}
/** T4 can only consume this same-process proof under the original live owner. */
export function assertRuntimeStage(stage: StagedRuntime, owner: RuntimeStageOwner): void {
  const proof = stages.get(stage);
  if (!proof || proof.owner !== owner) throw new InstallerError('runtime-invalid', 'Runtime stage lacks its original ownership proof');
  if (proof.uncertain) throw new InstallerError('resource-close-uncertain', 'Runtime stage remains retained after unconfirmed resource closure');
  owner.assertHeld();
  const stat = lstatSync(stage.workDirectory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.dev !== proof.dev || stat.ino !== proof.ino
    || (process.platform !== 'win32' && (stat.uid !== process.getuid?.() || (stat.mode & 0o077)))
    || (process.platform === 'win32' && !controlBinding().safePath(stage.workDirectory, true, true))) {
    throw new InstallerError('runtime-invalid', 'Runtime stage root ownership changed');
  }
}
/** Quarantine an existing proof after an actor cannot positively close. */
export function retainUncertainRuntimeStage(stage: StagedRuntime, owner: RuntimeStageOwner): void {
  const proof = stages.get(stage);
  if (!proof || proof.owner !== owner) throw new InstallerError('runtime-invalid', 'Runtime stage lacks its original ownership proof');
  proof.uncertain = true;
}
export async function discardRuntimeStage(stage: StagedRuntime, owner: RuntimeStageOwner): Promise<void> {
  assertRuntimeStage(stage, owner); const proof = stages.get(stage)!;
  await removeOwned(stage.workDirectory, proof); stages.delete(stage);
}

/** No source path, URL/hash override or capability marker is accepted from wire. */
export async function stageRuntime(owner: RuntimeStageOwner, identityInput: RuntimeIdentity,
  options: { signal?: AbortSignal | undefined; transport?: DownloadTransport | undefined } = {}): Promise<StagedRuntime> {
  const timeout = AbortSignal.timeout(RUNTIME_LIMITS.networkMs), signal = options.signal ? AbortSignal.any([timeout, options.signal]) : timeout;
  signal.throwIfAborted(); owner.assertHeld();
  const location = structuredClone(parseInstaller('location', owner.location)), identity = structuredClone(parseInstaller('runtime', identityInput));
  runtimeStorePaths(location.home, identity);
  if (identity.target.os !== process.platform || identity.target.arch !== process.arch || location.home !== normalizeHome(location.home, identity.target.os)) throw new InstallerError('runtime-invalid', 'Runtime acquisition requires the native target and canonical home');
  const profile = runtimeProfile(identity.target), archive = runtimeArchive(identity.target);
  const binding = controlBinding();
  assertLocalControlRoot(location.home, process.platform === 'win32' ? path => binding.localVolume(path) : undefined);
  for (const root of [location.home, join(location.home, 'install')]) if (!binding.safePath(root, true, true)) throw new InstallerError('runtime-invalid', 'Runtime staging requires existing private installer roots');
  const work = await mkdtemp(join(location.home, 'install', 'runtime-stage-')), info = await lstat(work);
  const directory = join(work, 'candidate');
  try {
    await mkdir(directory, { mode: 0o700 });
    const sources: RuntimeArchiveSources = { archive: join(work, 'node.archive') };
    owner.assertHeld(); signal.throwIfAborted();
    await closedRuntimeOperation(downloadBoundedAsset({ url: archive.url, bytes: profile.archiveBytes, sha256: archive.sha256 }, sources.archive,
      RUNTIME_LIMITS.compressedBytes, signal, options.transport), signal);
    if (identity.target.os === 'win32') {
      sources.headers = join(work, 'headers.archive'); sources.library = join(work, 'node.lib');
      for (const [asset, path] of [[runtimePolicy.supplemental.headers, sources.headers], [runtimePolicy.supplemental.libraries[identity.target.arch], sources.library]] as const) {
        owner.assertHeld(); signal.throwIfAborted();
        await closedRuntimeOperation(downloadBoundedAsset(asset, path, RUNTIME_LIMITS.compressedBytes, signal, options.transport), signal);
      }
    }
    owner.assertHeld(); signal.throwIfAborted();
    const verification = AbortSignal.any([signal, AbortSignal.timeout(RUNTIME_LIMITS.verificationMs)]);
    await closedRuntimeOperation(extractRuntimeProfile(sources, directory, identity, verification), verification);
    verification.throwIfAborted();
    owner.assertHeld(); signal.throwIfAborted();
    Object.freeze(identity.target); Object.freeze(identity);
    const stage = Object.freeze({ workDirectory: work, directory, identity }); stages.set(stage, { owner, dev: info.dev, ino: info.ino }); return stage;
  } catch (cause) {
    if (cause instanceof InstallerError && cause.code === 'resource-close-uncertain') {
      throw new InstallerError('resource-close-uncertain', `Runtime resource closure is uncertain; retained ${work}`, { cause });
    }
    try { await removeOwned(work, info); }
    catch (cleanup) { throw new InstallerError('resource-close-uncertain', `Runtime stage cleanup is uncertain; retained ${work}`, { cause: cleanup }); }
    throw cause;
  }
}
