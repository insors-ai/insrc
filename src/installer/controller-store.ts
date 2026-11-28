import { randomUUID } from 'node:crypto';
import { closeSync, constants, existsSync, fstatSync, fsyncSync, lstatSync, mkdirSync, openSync, readSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, isAbsolute, sep } from 'node:path';
import { InstallerError, MAX_CONTROL_BYTES } from './contracts.js';
import type { ControllerSnapshot, InstallationLocation, RuntimeIdentity } from './contracts.js';
import type { DownloadTransport } from './download.js';
import type { ResolvedPrivateRuntime } from './runtime-metadata.js';
import { assertLocalControlRoot, assertToken, sameInstallationHome } from './location.js';
import { controlBinding } from './native.js';
import { parseInstaller } from './schemas.js';
import { flushDirectory, flushDirectoryTree, flushParents } from './durability.js';
import type { StagedRuntime } from './runtime-acquire.js';
import { runtimeStorePaths } from './runtime-policy.js';
import { RUNTIME_LIMITS } from './runtime-metadata.js';
import type { BootstrapHashes } from './bootstrap-control.js';
import { BUNDLE_LIMITS } from './release-descriptor.js';

export type ControllerInspection = { kind: 'missing' } | { kind: 'present'; snapshot: ControllerSnapshot } | { kind: 'corrupt'; reason: string };
export type CommitPoint = 'temp-flushed' | 'replaced' | 'directory-flushed';
const privateFile = (file: string): void => {
  const s = lstatSync(file);
  if (!s.isFile() || s.isSymbolicLink() || s.nlink !== 1 || (process.platform !== 'win32' && (s.uid !== process.getuid?.() || (s.mode & 0o077) !== 0))) {
    throw new InstallerError('controller-corrupt', 'Control record is not a private regular file');
  }
};
// Only the private accepted release descriptor uses this larger bound. Control
// snapshots, intent, wire frames and every other metadata record stay at 64 KiB.
const releaseOfferBytes = BUNDLE_LIMITS.descriptorBytes + MAX_CONTROL_BYTES;
function readRecord(file: string, maximum = MAX_CONTROL_BYTES): unknown {
  privateFile(file);
  const fd = openSync(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const s = fstatSync(fd);
    if (!Number.isSafeInteger(maximum) || maximum < 1 || maximum > releaseOfferBytes || !s.isFile() || s.size > maximum) throw new Error('Control record exceeds bound');
    const bytes = Buffer.alloc(maximum + 1);
    let count = 0, got: number;
    while (count < bytes.length && (got = readSync(fd, bytes, count, bytes.length - count, null)) > 0) count += got;
    if (count > maximum) throw new Error('Control record exceeds bound');
    return JSON.parse(bytes.subarray(0, count).toString('utf8')) as unknown;
  } finally { closeSync(fd); }
}
/** Read-only control-lane discovery uses the same private, bounded record checks. */
export { readRecord as readPrivateControlRecord };
function present(path: string): boolean {
  try { lstatSync(path); return true; } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
}
function safeRoot(location: InstallationLocation): void {
  parseInstaller('location', location);
  assertLocalControlRoot(location.home, process.platform === 'win32' ? path => controlBinding().localVolume(path) : undefined);
  const root = join(location.home, 'install');
  if (existsSync(root)) {
    const s = lstatSync(root);
    if (process.platform !== 'win32' && (s.uid !== process.getuid?.() || (s.mode & 0o077) !== 0)) throw new InstallerError('permissions-invalid', 'Installer control directory must be private');
  }
}
/** Read-only inspection: no identity allocation, mkdir, application DB or lock. */
export function inspectController(location: InstallationLocation): ControllerInspection {
  try {
    safeRoot(location);
    const root = join(location.home, 'install'), controller = join(root, 'controller.json'), enrolled = join(root, 'enrollment.json');
    const hasController = present(controller), hasEnrollment = present(enrolled);
    if (!hasController && !hasEnrollment) return { kind: 'missing' };
    if (!hasController || !hasEnrollment) throw new Error('Incomplete enrollment; explicit recovery required');
    const identity = readRecord(enrolled) as Record<string, unknown>;
    if (!identity || Object.keys(identity).sort().join(',') !== 'dataHome,installationId,schemaVersion' || identity['schemaVersion'] !== 1
      || identity['installationId'] !== location.installationId || typeof identity['dataHome'] !== 'string' || !sameInstallationHome(identity['dataHome'], location.home, location.daemonEndpoint.kind === 'named-pipe' ? 'win32' : 'linux')) throw new Error('Enrollment identity mismatch');
    const snapshot = parseInstaller('snapshot', readRecord(controller));
    if (snapshot.installation.installationId !== location.installationId || !sameInstallationHome(snapshot.installation.dataHome, location.home, location.daemonEndpoint.kind === 'named-pipe' ? 'win32' : 'linux')) throw new Error('Controller identity mismatch');
    return { kind: 'present', snapshot };
  } catch (error) { return { kind: 'corrupt', reason: error instanceof Error ? error.message : 'Unreadable controller' }; }
}

/** One retained lock capability. No PID or file-age ownership inference. */
export class ControllerStore {
  readonly #handle: object;
  readonly #root: string;
  #closed = false;
  private constructor(readonly location: InstallationLocation, handle: object) {
    this.#handle = handle; this.#root = join(location.home, 'install');
    Object.freeze(location.daemonEndpoint); Object.freeze(location);
    Object.defineProperty(this, 'location', { value: location, writable: false, configurable: false, enumerable: true });
  }
  static acquire(location: InstallationLocation): ControllerStore {
    // Validate ancestors before allocation. Recheck after each allocation.
    parseInstaller('location', location);
    assertLocalControlRoot(location.home, process.platform === 'win32' ? path => controlBinding().localVolume(path) : undefined);
    mkdirSync(location.home, { recursive: true, mode: 0o700 });
    const root = join(location.home, 'install');
    mkdirSync(root, { mode: 0o700, recursive: true });
    assertLocalControlRoot(location.home, process.platform === 'win32' ? path => controlBinding().localVolume(path) : undefined);
    controlBinding().protect(root);
    safeRoot(location);
    return new ControllerStore(structuredClone(location), controlBinding().acquire(join(root, 'operation.lock')));
  }
  assertHeld(): void {
    if (this.#closed || !controlBinding().held(this.#handle)) throw new InstallerError('lock-lost', 'Controller mutation requires the original OS lock');
    safeRoot(this.location);
  }
  inspect(): ControllerInspection { return inspectController(this.location); }
  /** expectedRevision=null is explicit first enrollment, never a recovery shortcut. */
  commit(next: ControllerSnapshot, expectedRevision: number | null, checkpoint?: (point: CommitPoint) => void): void {
    this.assertHeld();
    const value = parseInstaller('snapshot', next), current = this.inspect();
    if (current.kind === 'corrupt') throw new InstallerError('controller-corrupt', current.reason);
    if (value.installation.installationId !== this.location.installationId || !sameInstallationHome(value.installation.dataHome, this.location.home, this.location.daemonEndpoint.kind === 'named-pipe' ? 'win32' : 'linux')) throw new InstallerError('identity-invalid', 'Snapshot belongs to another installation');
    if (current.kind === 'missing') {
      if (expectedRevision !== null || value.revision !== 0) throw new InstallerError('revision-conflict', 'First enrollment must explicitly start at revision zero');
      // Immutable enrollment sentinel is not a selected-release record. If interrupted
      // before controller publication, subsequent ordinary mutation fails closed.
      const marker = join(this.#root, 'enrollment.json');
      const fd = openSync(marker, 'wx', 0o600);
      try { writeFileSync(fd, JSON.stringify({ schemaVersion: 1, installationId: this.location.installationId, dataHome: this.location.home })); fsyncSync(fd); }
      finally { closeSync(fd); }
      flushDirectory(this.#root);
    } else if (expectedRevision !== current.snapshot.revision || value.revision !== expectedRevision + 1) {
      throw new InstallerError('revision-conflict', 'Controller revision changed or next revision is not consecutive');
    }
    const temp = join(this.#root, `.controller-${randomUUID()}.tmp`);
    try {
      const fd = openSync(temp, 'wx', 0o600);
      try { writeFileSync(fd, JSON.stringify(value) + '\n'); fsyncSync(fd); } finally { closeSync(fd); }
      checkpoint?.('temp-flushed');
      this.assertHeld();
      controlBinding().replace(this.#handle, temp, join(this.#root, 'controller.json'));
      checkpoint?.('replaced');
      flushDirectory(this.#root);
      checkpoint?.('directory-flushed');
    } catch (cause) {
      throw new InstallerError('controller-write-uncertain', 'Publication failed; inspect authoritative state before any further mutation', { cause });
    } finally { try { unlinkSync(temp); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; } }
  }
  /** Manager-owned operation metadata. Candidate journals and wrapper receipts
   * use separate namespaces and are never written through this API. */
  readOperationData(operationId: string, name: string): unknown | undefined {
    this.assertHeld(); assertToken(operationId); assertToken(name);
    const directory = join(this.#root, 'operations', operationId);
    assertLocalControlRoot(directory, process.platform === 'win32' ? path => controlBinding().localVolume(path) : undefined);
    const file = join(directory, `${name}.json`);
    return present(file) ? readRecord(file, name === 'release-offer' ? releaseOfferBytes : MAX_CONTROL_BYTES) : undefined;
  }
  writeOperationData(operationId: string, name: string, value: unknown, replace = false): void {
    this.assertHeld(); assertToken(operationId); assertToken(name);
    const bytes = JSON.stringify(value);
    if (!bytes || Buffer.byteLength(bytes) > (name === 'release-offer' ? releaseOfferBytes : MAX_CONTROL_BYTES)) throw new InstallerError('record-invalid', 'Operation metadata exceeds its bound');
    const directory = join(this.#root, 'operations', operationId);
    assertLocalControlRoot(directory, process.platform === 'win32' ? path => controlBinding().localVolume(path) : undefined);
    mkdirSync(directory, { recursive: true, mode: 0o700 }); controlBinding().protect(directory);
    const target = join(directory, `${name}.json`), temp = join(directory, `.record-${randomUUID()}.tmp`);
    if (!replace && present(target)) throw new InstallerError('operation-conflict', 'Operation metadata already exists');
    try {
      const fd = openSync(temp, 'wx', 0o600);
      try { writeFileSync(fd, bytes); fsyncSync(fd); } finally { closeSync(fd); }
      this.assertHeld(); controlBinding().replace(this.#handle, temp, target); flushDirectory(directory);
    } finally { try { unlinkSync(temp); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; } }
  }
  /** Launcher publication shares operation ownership; never exposes the native handle. */
  replaceLauncher(stagedFile: string, name: 'insrc' | 'insrc.ps1'): void {
    this.assertHeld();
    const directory = join(this.location.home, 'bin'), part = relative(directory, stagedFile);
    if (isAbsolute(part) || !/^\.launcher-[a-f0-9-]{36}$/.test(part)) throw new InstallerError('path-invalid', 'Launcher stage must be in the installation bin directory');
    assertLocalControlRoot(directory, process.platform === 'win32' ? path => controlBinding().localVolume(path) : undefined);
    privateFile(stagedFile);
    controlBinding().replace(this.#handle, stagedFile, join(directory, name));
    flushDirectory(directory);
  }
  /** Publish only a caller-owned candidate stage; never replace an existing release. */
  publishCandidate(stagedDirectory: string, releaseId: string): string {
    this.assertHeld(); assertToken(releaseId);
    const staging = join(this.#root, 'staging'), rel = relative(staging, stagedDirectory);
    if (!rel || isAbsolute(rel) || rel === '..' || rel.startsWith(`..${sep}`)) throw new InstallerError('path-invalid', 'Candidate must originate in owned installer staging');
    const releases = join(this.location.home, 'releases');
    const probe = process.platform === 'win32' ? (path: string) => controlBinding().localVolume(path) : undefined;
    assertLocalControlRoot(stagedDirectory, probe); assertLocalControlRoot(releases, probe);
    mkdirSync(releases, { recursive: true, mode: 0o700 }); controlBinding().protect(releases);
    const destination = join(releases, releaseId);
    controlBinding().publishDirectory(this.#handle, stagedDirectory, destination);
    flushDirectory(releases); flushDirectory(dirname(stagedDirectory)); flushDirectory(this.location.home); return destination;
  }
  /** Runtime stages keep their original owner; no raw native handle escapes. */
  async ensureRuntime(identity: RuntimeIdentity, options: { signal?: AbortSignal | undefined; transport?: DownloadTransport | undefined } = {}): Promise<ResolvedPrivateRuntime> {
    this.assertHeld();
    return (await import('./runtime-install.js')).ensurePrivateRuntime(this, identity, options);
  }
  async publishRuntime(stage: StagedRuntime, signal?: AbortSignal): Promise<string> {
    this.assertHeld();
    const { assertRuntimeStage, retainUncertainRuntimeStage, closedRuntimeOperation } = await import('./runtime-acquire.js');
    const { verifyRuntimeEntry } = await import('./runtime-store.js');
    assertRuntimeStage(stage, this); signal?.throwIfAborted();
    if (stage.directory !== join(stage.workDirectory, 'candidate')
      || dirname(stage.workDirectory) !== this.#root || !/^runtime-stage-[A-Za-z0-9]+$/.test(relative(this.#root, stage.workDirectory))) {
      throw new InstallerError('path-invalid', 'Runtime publication requires its exact owned stage');
    }
    const before = lstatSync(stage.directory);
    const deadline = AbortSignal.timeout(RUNTIME_LIMITS.verificationMs);
    const verification = signal ? AbortSignal.any([deadline, signal]) : deadline;
    let publicationAttempted = false;
    const held = () => { assertRuntimeStage(stage, this); verification.throwIfAborted(); };
    try {
      await closedRuntimeOperation(verifyRuntimeEntry(stage.directory, stage.identity, verification, 'source-stage'), verification);
      const { protectRuntimeDescendants } = await import('./runtime-protection.js');
      await closedRuntimeOperation(protectRuntimeDescendants(stage.directory, held), verification);
      await closedRuntimeOperation(flushDirectoryTree(stage.directory, verification), verification);
      await closedRuntimeOperation(verifyRuntimeEntry(stage.directory, stage.identity, verification, 'permission-transition'), verification);
      assertRuntimeStage(stage, this); verification.throwIfAborted();
      const after = lstatSync(stage.directory);
      if (before.dev !== after.dev || before.ino !== after.ino) throw new InstallerError('runtime-invalid', 'Runtime candidate root changed');
      const destination = runtimeStorePaths(this.location.home, stage.identity).root;
      const parents: string[] = [];
      for (let path = dirname(destination); path !== this.location.home; path = dirname(path)) parents.unshift(path);
      for (const path of parents) {
        if (!present(path)) { mkdirSync(path, { mode: 0o700 }); controlBinding().protect(path); }
        if (!controlBinding().safePath(path, true, true)) throw new InstallerError('permissions-invalid', 'Runtime publication parent is unsafe');
      }
      held();
      if (process.platform !== 'win32' && (lstatSync(stage.directory).mode & 0o7777) !== 0o700) throw new InstallerError('runtime-invalid', 'Runtime candidate root must remain0700');
      publicationAttempted = true;
      controlBinding().publishDirectory(this.#handle, stage.directory, destination);
      await this.#finishRuntime(destination, stage.identity, verification, stage.workDirectory, held);
      return destination;
    } catch (cause) {
      if (publicationAttempted && (cause as NodeJS.ErrnoException | undefined)?.code !== 'candidate-exists') {
        retainUncertainRuntimeStage(stage, this);
        throw new InstallerError('resource-close-uncertain', 'Runtime publication or durability is uncertain; retain canonical entry and stage', { cause });
      }
      if (cause instanceof InstallerError && cause.code === 'resource-close-uncertain') retainUncertainRuntimeStage(stage, this);
      throw cause;
    }
  }
  /** Internal recovery of only an independently verified root-write window. */
  async finalizeRuntime(identity: RuntimeIdentity, external?: AbortSignal): Promise<void> {
    this.assertHeld();
    const root = runtimeStorePaths(this.location.home, identity).root;
    if (process.platform !== 'win32' && (lstatSync(root).mode & 0o7777) !== 0o700) {
      throw new InstallerError('runtime-invalid', 'Runtime finalization requires the exact root0700 permission-transition state');
    }
    const deadline = AbortSignal.timeout(RUNTIME_LIMITS.verificationMs);
    const signal = external ? AbortSignal.any([deadline, external]) : deadline;
    const { verifyRuntimeEntry } = await import('./runtime-store.js');
    const { closedRuntimeOperation } = await import('./runtime-acquire.js');
    await closedRuntimeOperation(verifyRuntimeEntry(root, identity, signal, 'permission-transition'), signal);
    this.assertHeld(); signal.throwIfAborted();
    try { await this.#finishRuntime(root, identity, signal); }
    catch (cause) { throw new InstallerError('resource-close-uncertain', 'Runtime finalization durability is uncertain; retain canonical entry', { cause }); }
  }
  async #finishRuntime(root: string, identity: RuntimeIdentity, signal: AbortSignal, source?: string, original?: () => void): Promise<void> {
    const { sealRuntimeRoot } = await import('./runtime-protection.js');
    const { verifyRuntimeEntry } = await import('./runtime-store.js');
    const { closedRuntimeOperation } = await import('./runtime-acquire.js');
    const held = () => { original?.(); this.assertHeld(); signal.throwIfAborted(); };
    held();
    await closedRuntimeOperation(sealRuntimeRoot(root, held), signal);
    held(); flushDirectory(root); flushParents(dirname(root), this.location.home);
    if (source) flushDirectory(source);
    held(); await closedRuntimeOperation(verifyRuntimeEntry(root, identity, signal), signal); held();
  }
  /** Copies authenticated bytes into a fresh nonexecuting control stage. */
  async publishBootstrapControl(input: { bootstrap: Buffer; native: Buffer }, hashes: BootstrapHashes, signal?: AbortSignal): Promise<string> {
    this.assertHeld();
    const { assertBootstrapHashes, assertBootstrapBytes, verifyBootstrapControl } = await import('./bootstrap-control.js');
    const { mkdir, mkdtemp, open, rm } = await import('node:fs/promises');
    const { closeOwnedFile } = await import('./owned-file.js');
    const { closedRuntimeOperation } = await import('./runtime-acquire.js');
    const deadline = AbortSignal.timeout(RUNTIME_LIMITS.verificationMs);
    signal = signal ? AbortSignal.any([deadline, signal]) : deadline;
    signal.throwIfAborted();
    return closedRuntimeOperation((async () => {
      assertBootstrapHashes(hashes);
      assertBootstrapBytes(input.bootstrap, hashes.bootstrap); assertBootstrapBytes(input.native, hashes.native);
      const bytes = { bootstrap: Buffer.from(input.bootstrap), native: Buffer.from(input.native) };
      const parent = join(this.#root, 'bootstrap'), destination = join(parent, `${hashes.bootstrap}-${hashes.native}`);
      this.assertHeld(); signal?.throwIfAborted();
      if (present(destination)) { await verifyBootstrapControl(destination, hashes, this.location.home, signal); this.assertHeld(); signal?.throwIfAborted(); return destination; }
      assertLocalControlRoot(parent, process.platform === 'win32' ? path => controlBinding().localVolume(path) : undefined);
      if (!present(parent)) { mkdirSync(parent, { mode: 0o700 }); controlBinding().protect(parent); }
      if (!controlBinding().safePath(parent, true, true)) throw new InstallerError('permissions-invalid', 'Unsafe bootstrap publication root');
      const work = await mkdtemp(join(this.#root, 'bootstrap-publication-'));
      const candidate = join(work, 'candidate');
      await mkdir(join(candidate, 'native'), { recursive: true, mode: 0o700 });
      // Errors deliberately retain this owned stage; no uncertain actor is discarded.
      for (const [name, value] of [['bootstrap.mjs', bytes.bootstrap], ['native/control.node', bytes.native]] as const) {
        this.assertHeld(); signal?.throwIfAborted();
        const file = await open(join(candidate, name), 'wx', 0o600);
        try { await file.writeFile(value); await file.sync(); } finally { await closeOwnedFile(file); }
      }
      await verifyBootstrapControl(candidate, hashes, this.location.home, signal); await flushDirectoryTree(candidate, signal);
      this.assertHeld(); signal?.throwIfAborted();
      controlBinding().publishDirectory(this.#handle, candidate, destination);
      flushDirectory(parent); flushDirectory(work); flushDirectory(this.#root); flushDirectory(this.location.home);
      await rm(work, { recursive: true }); signal?.throwIfAborted(); return destination;
    })(), signal);
  }
  close(): void { if (!this.#closed) { controlBinding().close(this.#handle); this.#closed = true; } }
}
