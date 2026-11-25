/** Intentionally retained user-session supervisor. No manager/controller imports. */
import { spawn } from 'node:child_process';
import type { ChildProcess, SpawnOptions } from 'node:child_process';
import { constants, existsSync, fsyncSync, lstatSync, openSync, renameSync, unlinkSync, writeSync } from 'node:fs';
import { dirname, delimiter, join } from 'node:path';
import { InstallerError, PRIVATE_NODE_VERSION } from './contracts.js';
import type { InstallationLocation, Target } from './contracts.js';
import { canonicalJson, digest } from './release-descriptor.js';
import { dependencyPath, dependencyUncertain, parseOllamaInventory, parseOllamaReceipt, readDependencyRecord, writeDependencyRecord,
  DEPENDENCY_INVENTORY_LIMIT } from './ollama-records.js';
import { controlBinding } from './native.js';
import { closeOwnedDescriptor } from './owned-file.js';
import { flushDirectory } from './durability.js';
import { parseServiceFrame, serviceDiagnostic, serviceFact, serviceJson, servicePaths, SERVICE_FRAME_LIMIT } from './ollama-service-records.js';
import type { OllamaServiceFrame } from './ollama-service-records.js';
import { verifyOllamaExecutable } from './ollama-layout.js';
import { ollamaCloseUncertain, retainUncertainOllamaHandle } from './ollama-cleanup.js';

const LOG_BYTES = 1024 * 1024;
/** Two owned 1 MiB files. Never truncate an unknown predecessor or follow links. */
class ServiceLog {
  #fd: number; #bytes = 0; #broken = false;
  readonly active: string; readonly rotated: string;
  constructor(directory: string, nonce: string) {
    this.active = join(directory, `ollama-${nonce}.log`); this.rotated = `${this.active}.1`;
    if (existsSync(this.active) || existsSync(this.rotated)) throw dependencyUncertain('Service logs already exist for this admission');
    this.#fd = openSync(this.active, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  }
  write(chunk: Buffer): void {
    if (this.#broken) return;
    let offset = 0;
    while (offset < chunk.length) {
      if (this.#bytes === LOG_BYTES) {
        fsyncSync(this.#fd); closeOwnedDescriptor(this.#fd); this.#fd = -1;
        if (existsSync(this.rotated)) { const info = lstatSync(this.rotated); if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) throw dependencyUncertain('Unsafe rotated service log'); unlinkSync(this.rotated); }
        renameSync(this.active, this.rotated); flushDirectory(dirname(this.active));
        this.#fd = openSync(this.active, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600); this.#bytes = 0;
      }
      const count = Math.min(65536, chunk.length - offset, LOG_BYTES - this.#bytes), written = writeSync(this.#fd, chunk, offset, count);
      if (!written) throw dependencyUncertain('Short private service log write'); offset += written; this.#bytes += written;
    }
  }
  discard(): void { this.#broken = true; }
  close(): void { if (this.#fd >= 0) { const fd = this.#fd; this.#fd = -1; try { fsyncSync(fd); } finally { closeOwnedDescriptor(fd); } } }
}

/** Child-only environment; support files and scratch data share the policy-bound
 * private data parent. Caller HOME/PATH, Node flags and cloud credentials vanish. */
export function ollamaServiceEnvironment(frame: OllamaServiceFrame, input: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const { location, policy, attempt } = frame, payload = dependencyPath(location, attempt.identity.payloadRelativePath);
  const models = dependencyPath(location, policy.modelsRelativePath), home = dirname(models), url = new URL(policy.endpoint);
  const env: NodeJS.ProcessEnv = {};
  for (const key of ['SystemRoot', 'WINDIR', 'ComSpec', 'PATHEXT', 'LANG', 'LC_ALL', 'TZ']) if (input[key] && !/[\u0000-\u001f\u007f]/.test(input[key]!)) env[key] = input[key];
  env['HOME'] = home; env['USERPROFILE'] = home; env['OLLAMA_MODELS'] = models;
  env['OLLAMA_HOST'] = url.hostname === 'localhost' ? `127.0.0.1:${url.port}` : url.host;
  const scratch = join(home, 'tmp'); env['TMPDIR'] = scratch; env['TMP'] = scratch; env['TEMP'] = scratch;
  const system = process.platform === 'win32' ? join(env['SystemRoot'] ?? 'C:\\Windows', 'System32') : `/usr/bin${delimiter}/bin`;
  env['PATH'] = [dirname(join(payload, policy.layout.executable)), dirname(process.execPath), system].join(delimiter);
  return env;
}
export interface ServiceWorkerOptions {
  /** Publisher target, never caller-selected worker policy. */
  target: Target;
  /** Trusted process fixture only. Production always launches the exact CLI. */
  launch?: ((executable: string, argv: string[], options: SpawnOptions) => ChildProcess) | undefined;
}

/** The admission is durable before this process exists. A persistent launch fact
 * prevents replay even if a supervisor dies after starting its native child. */
export async function executeOllamaServiceWorker(location: InstallationLocation, recordRelativePath: string,
  options: ServiceWorkerOptions): Promise<void> {
  if (process.version !== `v${PRIVATE_NODE_VERSION}` || process.platform !== options.target.os || process.arch !== options.target.arch) throw new InstallerError('runtime-invalid', 'Service supervisor requires its exact private native runtime');
  const record = dependencyPath(location, recordRelativePath), paths = servicePaths(record);
  const frame = parseServiceFrame(serviceJson(await readDependencyRecord(location, paths.frame, SERVICE_FRAME_LIMIT)));
  if (canonicalJson(frame.location) !== canonicalJson(location) || canonicalJson(frame.policy.target) !== canonicalJson(options.target)
    || dependencyPath(location, frame.attempt.identity.recordRelativePath) !== record) throw dependencyUncertain('Service supervisor location/target differs');
  const admission = serviceJson(await readDependencyRecord(location, paths.admission));
  if (canonicalJson(admission) !== canonicalJson(frame.admission)) throw dependencyUncertain('Service input differs from durable admission');
  const handle = controlBinding().acquire(paths.lock); let log: ServiceLog | undefined, keepHandle = false, ownsPreSpawn = false, spawnAttempted = false;
  try {
    if (existsSync(paths.launch) || existsSync(paths.exit)) throw dependencyUncertain('A service launch cannot be replayed');
    ownsPreSpawn = true;
    const payload = dependencyPath(location, frame.attempt.identity.payloadRelativePath), executable = join(payload, frame.policy.layout.executable);
    const raw = await readDependencyRecord(location, join(payload, 'inventory.json'), DEPENDENCY_INVENTORY_LIMIT), receipt = parseOllamaReceipt(serviceJson(await readDependencyRecord(location, join(payload, '.ollama-receipt.json'))));
    const inventory = parseOllamaInventory(serviceJson(raw));
    if (digest(raw) !== frame.admission.inventorySha256 || receipt.inventorySha256 !== frame.admission.inventorySha256
      || receipt.installationId !== location.installationId || receipt.policySha256 !== frame.admission.policySha256
      || receipt.assetSha256 !== frame.policy.asset.sha256 || canonicalJson(receipt.target) !== canonicalJson(frame.policy.target)
      || receipt.version !== frame.policy.version || !inventory.files.some(file => file.path === frame.policy.layout.executable)) throw dependencyUncertain('Published service payload identity differs');
    const cli = lstatSync(executable);
    if (!cli.isFile() || cli.isSymbolicLink() || cli.nlink !== 1 || (process.platform === 'win32' && !controlBinding().safePath(executable, false, false))) throw dependencyUncertain('Service CLI is not a contained regular file');
    await verifyOllamaExecutable(executable, frame.policy);
    log = new ServiceLog(dependencyPath(location, frame.policy.logsRelativePath), frame.admission.nonce);
    writeDependencyRecord(location, handle, paths.launch, serviceFact(frame.admission, 'launch-admitted'));
    let child: ChildProcess;
    try { spawnAttempted = true; child = (options.launch ?? ((command, args, settings) => spawn(command, args, settings)))(executable, ['serve'], {
      cwd: payload, env: ollamaServiceEnvironment(frame, process.env), stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
    }); } catch (cause) { writeDependencyRecord(location, handle, paths.exit, serviceFact(frame.admission, 'not-started')); throw cause; }
    let spawned = false, recordingFailure: unknown, loggingFailure: unknown, spawnFailure: unknown;
    const logFailed = (cause: unknown) => {
      loggingFailure ??= cause; log!.discard();
      if (!existsSync(paths.logError)) try { writeDependencyRecord(location, handle, paths.logError, serviceFact(frame.admission, 'unverified')); } catch (error) { recordingFailure ??= error; }
    };
    const output = (chunk: Buffer) => { try { log!.write(chunk); } catch (cause) { logFailed(cause); } };
    child.stdout?.on('data', output); child.stderr?.on('data', output);
    child.stdout?.on('error', logFailed); child.stderr?.on('error', logFailed);
    await new Promise<void>((resolve, reject) => {
      child.once('spawn', () => { spawned = true;
        try { writeDependencyRecord(location, handle, paths.running, serviceFact(frame.admission, 'spawned')); } catch (cause) { recordingFailure = cause; }
      });
      child.on('error', cause => { spawnFailure ??= cause; });
      child.once('close', (code, signal) => {
        try {
          log!.close(); log = undefined;
          writeDependencyRecord(location, handle, paths.exit, serviceFact(frame.admission, spawned ? 'closed' : 'not-started', { code, signal }));
          if (spawnFailure && !existsSync(paths.diagnostic)) writeDependencyRecord(location, handle, paths.diagnostic, serviceDiagnostic(frame.admission, spawned ? 'supervisor' : 'pre-spawn', spawnFailure));
          if (recordingFailure || loggingFailure) reject(dependencyUncertain('Service exited after bounded evidence/log failure', recordingFailure ?? loggingFailure)); else resolve();
        } catch (cause) { reject(cause); }
      });
    });
  } catch (cause) {
    if (ollamaCloseUncertain(cause)) { keepHandle = true; retainUncertainOllamaHandle(handle); }
    else {
      // Validation/log creation failed before invoking spawn. This is positive
      // not-started evidence, unlike a supervisor disappearing after launch.
      try {
        if (ownsPreSpawn && !spawnAttempted && !existsSync(paths.exit)) writeDependencyRecord(location, handle, paths.exit, serviceFact(frame.admission, 'not-started'));
        if (!existsSync(paths.diagnostic)) writeDependencyRecord(location, handle, paths.diagnostic, serviceDiagnostic(frame.admission, spawnAttempted ? 'supervisor' : 'pre-spawn', cause));
      } catch (failure) { if (ollamaCloseUncertain(failure)) { keepHandle = true; retainUncertainOllamaHandle(handle); } throw failure; }
    }
    throw cause;
  } finally {
    try { log?.close(); }
    catch (cause) { if (ollamaCloseUncertain(cause)) { keepHandle = true; retainUncertainOllamaHandle(handle); } throw cause; }
    finally { if (!keepHandle) controlBinding().close(handle); }
  }
}
