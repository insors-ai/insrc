import { randomUUID } from 'node:crypto';
import { closeSync, constants, existsSync, fstatSync, fsyncSync, lstatSync, mkdirSync, openSync, readSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, isAbsolute, sep } from 'node:path';
import { InstallerError, MAX_CONTROL_BYTES } from './contracts.js';
import type { ControllerSnapshot, InstallationLocation } from './contracts.js';
import { assertLocalControlRoot, assertToken, sameInstallationHome } from './location.js';
import { controlBinding } from './native.js';
import { parseInstaller } from './schemas.js';
import { flushDirectory } from './durability.js';
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
  close(): void { if (!this.#closed) { controlBinding().close(this.#handle); this.#closed = true; } }
}
