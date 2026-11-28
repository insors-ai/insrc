/** Official runtime acquisition/staging. Publication belongs to the next layer. */
import { lstat, mkdtemp, mkdir, open, readdir, rmdir, unlink } from 'node:fs/promises';
import { constants, lstatSync } from 'node:fs';
import type { Stats } from 'node:fs';
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
import { operationTimeBudgets } from './operation-time-budgets.mjs';
import { closeOwnedFile } from './owned-file.js';
import { verifyRuntimeEntry } from './runtime-store.js';

export interface RuntimeStageOwner { readonly location: InstallationLocation; assertHeld(): void }
export interface StagedRuntime {
  readonly workDirectory: string; readonly directory: string; readonly identity: RuntimeIdentity;
}
const stages = new WeakMap<StagedRuntime, { owner: RuntimeStageOwner; dev: number; ino: number; uid: number; uncertain?: boolean | undefined }>();
const DRAIN_MS = operationTimeBudgets().runtime.resourceDrainMs;

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
async function removeOwned(work: string, expected: { dev: number; ino: number; uid: number; uncertain?: boolean | undefined }, owner: RuntimeStageOwner): Promise<void> {
  const expiresAt = performance.now() + RUNTIME_LIMITS.verificationMs;
  const uncertain = () => new InstallerError('resource-close-uncertain', `Runtime stage ownership or closure is uncertain; retained ${work}`);
  const same = (a: Stats, b: Stats) => a.dev === b.dev && a.ino === b.ino && a.uid === b.uid && a.isDirectory() === b.isDirectory() && !b.isSymbolicLink();
  function held() { owner.assertHeld(); if (expected.uncertain || performance.now() >= expiresAt) throw uncertain(); }
  async function root() {
    held(); const stat = await lstat(work); held();
    if (!stat.isDirectory() || stat.isSymbolicLink() || stat.dev !== expected.dev || stat.ino !== expected.ino || stat.uid !== expected.uid
      || (process.platform !== 'win32' && (stat.uid !== process.getuid?.() || (stat.mode & 0o7077)))
      || (process.platform === 'win32' && !controlBinding().safePath(work, true, true))) throw uncertain();
  }
  await root();
  const directories: { path: string; stat: Stats }[] = [], files: { path: string; stat: Stats }[] = [];
  let count = 0;
  async function visit(path: string, depth: number): Promise<void> {
    held(); if (++count > RUNTIME_LIMITS.entries * 2 + 16 || depth > 66) throw uncertain();
    const stat = await lstat(path); held();
    if (stat.dev !== expected.dev || stat.uid !== expected.uid || stat.isSymbolicLink()
      || (process.platform !== 'win32' && (stat.mode & 0o7022))
      || (process.platform === 'win32' && !controlBinding().safePath(path, stat.isDirectory(), true))) throw uncertain();
    if (stat.isDirectory()) {
      directories.push({ path, stat });
      for (const name of await readdir(path)) await visit(join(path, name), depth + 1);
    } else if (stat.isFile() && stat.nlink === 1) files.push({ path, stat });
    else throw uncertain();
  }
  // Validate the whole closed, original stage before changing any permissions.
  await visit(work, 0); await root();
  for (const { path, stat } of directories) {
    held(); const current = await lstat(path); if (!same(stat, current)) throw uncertain();
    if (process.platform === 'win32' || (current.mode & 0o200)) continue;
    const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_DIRECTORY);
    try {
      if (!same(current, await handle.stat())) throw uncertain(); held();
      await handle.chmod((current.mode & 0o777) | 0o200);
      if (!same(current, await lstat(path))) throw uncertain();
    } finally { await closeOwnedFile(handle); }
  }
  await root();
  for (const { path, stat } of files) {
    held(); const current = await lstat(path); if (!same(stat, current) || !current.isFile() || current.nlink !== 1) throw uncertain();
    await unlink(path);
  }
  for (const { path, stat } of directories.reverse()) {
    held(); if (!same(stat, await lstat(path))) throw uncertain(); await rmdir(path);
  }
}
/** T4 can only consume this same-process proof under the original live owner. */
export function assertRuntimeStage(stage: StagedRuntime, owner: RuntimeStageOwner): void {
  const proof = stages.get(stage);
  if (!proof || proof.owner !== owner) throw new InstallerError('runtime-invalid', 'Runtime stage lacks its original ownership proof');
  if (proof.uncertain) throw new InstallerError('resource-close-uncertain', 'Runtime stage remains retained after unconfirmed resource closure');
  owner.assertHeld();
  const stat = lstatSync(stage.workDirectory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.dev !== proof.dev || stat.ino !== proof.ino
    || stat.uid !== proof.uid || (process.platform !== 'win32' && (stat.uid !== process.getuid?.() || (stat.mode & 0o7077)))
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
  try { await removeOwned(stage.workDirectory, proof, owner); stages.delete(stage); }
  catch (cause) {
    proof.uncertain = true;
    throw new InstallerError('resource-close-uncertain', `Runtime stage discard is uncertain; retained ${stage.workDirectory}`, { cause });
  }
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
    // Durable extraction is acquisition work. The shorter verification budget
    // belongs to read-only resolution, not thousands of staged file writes.
    await closedRuntimeOperation(extractRuntimeProfile(sources, directory, identity, signal), signal);
    signal.throwIfAborted();
    // The read-only clock begins after durable extraction and writer closure.
    // This form is mutable source content, never canonical launch authority.
    await closedRuntimeOperation(verifyRuntimeEntry(directory, identity, signal, 'source-stage'), signal);
    owner.assertHeld(); signal.throwIfAborted();
    Object.freeze(identity.target); Object.freeze(identity);
    const stage = Object.freeze({ workDirectory: work, directory, identity }); stages.set(stage, { owner, dev: info.dev, ino: info.ino, uid: info.uid }); return stage;
  } catch (cause) {
    if (cause instanceof InstallerError && cause.code === 'resource-close-uncertain') {
      throw new InstallerError('resource-close-uncertain', `Runtime resource closure is uncertain; retained ${work}`, { cause });
    }
    try { await removeOwned(work, info, owner); }
    catch (cleanup) { throw new InstallerError('resource-close-uncertain', `Runtime stage cleanup is uncertain; retained ${work}`, { cause: cleanup }); }
    throw cause;
  }
}
