/** Private preparation protocol and owned worker. No controller/publication authority. */
import { Ajv } from 'ajv';
import { randomUUID } from 'node:crypto';
import { closeSync, constants, existsSync, fstatSync, lstatSync, mkdirSync, openSync, readdirSync, readSync, writeFileSync } from 'node:fs';
import { join, dirname, isAbsolute } from 'node:path';
import type { Readable } from 'node:stream';
import { createRun } from '../../scripts/test-harness/context.mjs';
import type { BuildRun } from '../../scripts/test-harness/context.mjs';
import { withRun } from '../../scripts/test-harness/process.mjs';
import type { CommandScope } from '../../scripts/test-harness/process.mjs';
import { fingerprint, inputFingerprint } from '../../scripts/test-harness/build.mjs';
import { InstallerError, MAX_CONTROL_BYTES } from './contracts.js';
import type { InstallationLocation } from './contracts.js';
import { devHashSchema, devNonceSchema, devObjectSchema, devPreparationSchema, devTokenSchema, parseDevPreparation, parseDevRecord } from './dev.js';
import type { DevPreparationRecord } from './dev.js';
import { devPreparationPaths, parseDevReleaseReceipt } from './dev.js';
import { normalizeHome, assertLocalControlRoot } from './location.js';
import { canonicalJson, digest, parseInventory } from './release-descriptor.js';
import { controlBinding } from './native.js';
import { verifyPayloadInventory } from './safe-zip.js';

export interface DevPreparationResult {
  schemaVersion: 1; installationId: string; operationId: string; attemptId: string; workerNonce: string;
  sourceSha256: string; coordinatorRunId: string; outcome: 'prepared' | 'failed' | 'cancelled';
  cleanupSha256: string; inputFingerprint: string; outputFingerprint?: string | undefined; inventorySha256?: string | undefined;
}
export interface DevWorkerCancel { schemaVersion: 1; operationId: string; attemptId: string; workerNonce: string; kind: 'cancel' }
export interface DevWorkerLaunch { schemaVersion: 1; kind: 'prepare'; checkpoint: DevPreparationRecord }
const ajv = new Ajv({ strict: true, coerceTypes: false, useDefaults: false, removeAdditional: false });
const identity = { schemaVersion: { const: 1 }, operationId: devTokenSchema, attemptId: devTokenSchema, workerNonce: devNonceSchema };
const resultValidator = ajv.compile<DevPreparationResult>(devObjectSchema({ ...identity, installationId: devTokenSchema,
  sourceSha256: devHashSchema, coordinatorRunId: devTokenSchema, outcome: { enum: ['prepared', 'failed', 'cancelled'] },
  cleanupSha256: devHashSchema, inputFingerprint: devHashSchema, outputFingerprint: devHashSchema, inventorySha256: devHashSchema },
  [...Object.keys(identity), 'installationId', 'sourceSha256', 'coordinatorRunId', 'outcome', 'cleanupSha256', 'inputFingerprint']));
const cancelValidator = ajv.compile<DevWorkerCancel>(devObjectSchema({ ...identity, kind: { const: 'cancel' } }));
const launchValidator = ajv.compile<DevWorkerLaunch>(devObjectSchema({ schemaVersion: { const: 1 }, kind: { const: 'prepare' }, checkpoint: devPreparationSchema }));

function assertAttempt(value: Pick<DevWorkerCancel, 'operationId' | 'attemptId' | 'workerNonce'>, expected: DevPreparationRecord): void {
  if (value.operationId !== expected.operationId || value.attemptId !== expected.attemptId || value.workerNonce !== expected.workerNonce) {
    throw new InstallerError('identity-mismatch', 'Worker message belongs to another preparation attempt');
  }
}
export function parseDevWorkerCancel(input: unknown, expected: DevPreparationRecord): DevWorkerCancel {
  const value = parseDevRecord(cancelValidator, input); assertAttempt(value, parseDevPreparation(expected)); return value;
}
export function parseDevWorkerLaunch(input: unknown): DevWorkerLaunch {
  const value = parseDevRecord(launchValidator, input); value.checkpoint = parseDevPreparation(value.checkpoint);
  if (value.checkpoint.stage !== 'accepted') throw new InstallerError('schema-invalid', 'Only an accepted attempt can launch a preparation worker');
  return value;
}
export function parseDevPreparationResult(input: unknown, expected: DevPreparationRecord): DevPreparationResult {
  const value = parseDevRecord(resultValidator, input), checkpoint = parseDevPreparation(expected);
  assertAttempt(value, checkpoint);
  if (value.installationId !== checkpoint.installationId || value.sourceSha256 !== checkpoint.sourceOffer.sourceSha256
    || !checkpoint.coordinatorRunId || value.coordinatorRunId !== checkpoint.coordinatorRunId) throw new InstallerError('identity-mismatch', 'Worker result source or coordinator identity differs');
  if (value.outcome === 'prepared' && (!value.outputFingerprint || !value.inventorySha256)) throw new InstallerError('schema-invalid', 'Prepared result requires output and inventory fingerprints');
  return value;
}

const EVIDENCE_LIMIT = 2 * 1024 * 1024;
export interface DevWorkerWork {
  (run: BuildRun, scope: CommandScope, signal: AbortSignal, stage: string): Promise<{ inventorySha256: string }>;
}
function uncertain(message: string, cause?: unknown): InstallerError { return new InstallerError('preparation-uncertain', message, { cause }); }
function bytes(file: string, limit = EVIDENCE_LIMIT): string {
  const fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > limit) throw uncertain('Preparation evidence is not a bounded regular file');
    const value = Buffer.alloc(limit + 1); let length = 0, count: number;
    do { count = readSync(fd, value, length, value.length - length, null); length += count; } while (count && length < value.length);
    if (length > limit) throw uncertain('Preparation evidence grew');
    return value.subarray(0, length).toString('utf8');
  } finally { closeSync(fd); }
}
function realParents(home: string, file: string): void {
  let directory = dirname(file);
  while (directory !== home) {
    const stat = lstatSync(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw uncertain('Preparation evidence has a linked parent');
    const parent = dirname(directory);
    if (parent === directory) throw uncertain('Preparation evidence escapes its installation');
    directory = parent;
  }
}
function containedDirectories(home: string, relative: string): string {
  let current = home;
  for (const part of relative.split('/')) {
    current = join(current, part);
    try { mkdirSync(current, { mode: 0o700 }); } catch (cause) { if ((cause as NodeJS.ErrnoException).code !== 'EEXIST') throw cause; }
    const stat = lstatSync(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new InstallerError('path-invalid', 'Preparation parents must be real owned directories');
  }
  return current;
}
export function devWorkerPaths(home: string, input: DevPreparationRecord) {
  const record = parseDevPreparation(input), root = normalizeHome(home, record.sourceOffer.target.os);
  const paths = devPreparationPaths(record.operationId, record.attemptId), checkout = join(root, paths.checkoutRelativePath);
  if (!record.coordinatorRunId || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(record.coordinatorRunId)) throw uncertain('Worker needs its persisted coordinator UUID before admission');
  const privateRoot = join(checkout, '.insrc/tmp/dev-preparation');
  return { home: root, checkout, stage: join(root, paths.stageRelativePath), privateRoot,
    identity: join(privateRoot, 'identity.json'), lock: join(privateRoot, 'worker.lock'), result: join(root, paths.resultRelativePath),
    closure: join(privateRoot, 'closure.json'), diagnostic: join(privateRoot, 'diagnostic.json'),
    workspace: join(checkout, '.insrc/tmp/test-harness/runs', record.coordinatorRunId), active: join(checkout, '.insrc/tmp/test-harness/active') };
}
function binding(record: DevPreparationRecord) {
  return { installationId: record.installationId, operationId: record.operationId, attemptId: record.attemptId,
    workerNonce: record.workerNonce, sourceSha256: record.sourceOffer.sourceSha256, coordinatorRunId: record.coordinatorRunId! };
}
function atomicWorkerFile(handle: object, file: string, value: unknown): void {
  const encoded = canonicalJson(value);
  if (Buffer.byteLength(encoded) > EVIDENCE_LIMIT) throw uncertain('Preparation output exceeds its bound');
  const temp = `${file}.${randomUUID()}.tmp`;
  writeFileSync(temp, encoded, { flag: 'wx', mode: 0o600 });
  controlBinding().replace(handle, temp, file);
}
function journal(workspace: string, name: string): { raw: string; rows: Array<Record<string, unknown>> } {
  const file = join(workspace, name), raw = existsSync(file) ? bytes(file) : '';
  const rows = raw.split('\n').filter(Boolean).map(line => JSON.parse(line) as Record<string, unknown>);
  if (rows.length > 4096 || rows.some(row => !row || typeof row !== 'object' || Array.isArray(row))) throw uncertain('Preparation journal is malformed or oversized');
  return { raw, rows };
}
/** Positive run-bound evidence for admitted actors, retained owned groups and
 * cooperating registered descendants. It does not certify arbitrary unregistered
 * detached work. See the explicitly approved S2 ownership boundary. */
function closureEvidence(record: DevPreparationRecord, paths: ReturnType<typeof devWorkerPaths>) {
  const cleanupBytes = bytes(join(paths.workspace, 'cleanup.json'));
  const cleanup = JSON.parse(cleanupBytes) as Record<string, unknown>;
  if (cleanup['confirmedClosed'] !== true || cleanup['closureMode'] !== 'owned-groups'
    || !Array.isArray(cleanup['cancellationErrors']) || cleanup['cancellationErrors'].length
    || !Array.isArray(cleanup['evidenceErrors']) || cleanup['evidenceErrors'].length
    || cleanup['childCloseJournal'] !== 'child-results.jsonl' || existsSync(paths.active)) throw uncertain('Preparation cleanup/ownership is not confirmed');
  const actors = join(paths.workspace, 'actors');
  if (existsSync(actors) && readdirSync(actors).length) throw uncertain('Preparation actors remain owned');
  const admissions = journal(paths.workspace, 'child-admissions.jsonl'), closes = journal(paths.workspace, 'child-results.jsonl'), disposals = journal(paths.workspace, 'child-disposals.jsonl');
  const ids = new Set<string>();
  for (const admission of admissions.rows) {
    const id = admission['childId'];
    if (typeof id !== 'string' || !/^[a-f0-9-]{36}$/.test(id) || ids.has(id) || admission['runId'] !== record.coordinatorRunId) throw uncertain('Preparation command admission identity differs');
    ids.add(id);
    const closed = closes.rows.filter(row => row['childId'] === id), disposed = disposals.rows.filter(row => row['childId'] === id);
    if (closed.length !== 1 || disposed.length !== 1 || closed[0]!['runId'] !== record.coordinatorRunId || disposed[0]!['runId'] !== record.coordinatorRunId
      || typeof closed[0]!['closedAt'] !== 'string' || !['closed', 'not-started'].includes(String(disposed[0]!['state']))) throw uncertain('Missing or contradictory command closure evidence');
  }
  if (closes.rows.length !== ids.size || disposals.rows.length !== ids.size) throw uncertain('Unmatched nested command evidence');
  return { schemaVersion: 1, ...binding(record), cleanupSha256: digest(cleanupBytes), admissionsSha256: digest(admissions.raw),
    closesSha256: digest(closes.raw), disposalsSha256: digest(disposals.raw), admittedCommands: ids.size,
    commandsSucceeded: closes.rows.every(row => row['code'] === 0 && row['signal'] === null && row['timedOut'] === false && row['launchError'] === null) };
}
async function verifyStagedMetadata(record: DevPreparationRecord, paths: ReturnType<typeof devWorkerPaths>, inventorySha256: string): Promise<void> {
  realParents(paths.home, join(paths.stage, '.dev-release.json'));
  const receiptBytes = bytes(join(paths.stage, '.dev-release.json')), receipt = parseDevReleaseReceipt(JSON.parse(receiptBytes));
  const inventoryBytes = bytes(join(paths.stage, 'inventory.json'), 32 * 1024 * 1024), inventory = parseInventory(JSON.parse(inventoryBytes));
  if (canonicalJson(receipt.sourceOffer) !== canonicalJson(record.sourceOffer) || receipt.checkoutRelativePath !== record.checkoutRelativePath
    || receipt.inventorySha256 !== inventorySha256 || digest(inventoryBytes) !== inventorySha256 || canonicalJson(inventory) !== inventoryBytes
    || canonicalJson(receipt) !== receiptBytes) throw uncertain('Worker staged identity differs');
  const required = ['bootstrap.mjs', 'manager.mjs', 'native/control.node', `tools/node/${receipt.manifest.runtime.relativeExecutable}`,
    receipt.manifest.daemonEntry, receipt.manifest.managerEntry, receipt.manifest.tuiEntry];
  for (const name of required) {
    if (!inventory.files.some(file => file.path === name)) throw uncertain('Worker stage is incomplete');
    const stat = lstatSync(join(paths.stage, name));
    if (!stat.isFile() || stat.isSymbolicLink()) throw uncertain('Worker stage has missing or linked control entries');
  }
  await verifyPayloadInventory(paths.stage, inventory, { receipt: '.dev-release.json' });
}

export class DevWorkerInput {
  readonly controller = new AbortController();
  private pending = ''; private record?: DevPreparationRecord;
  private resolveLaunch!: (value: DevWorkerLaunch) => void; private rejectLaunch!: (error: unknown) => void;
  readonly launch = new Promise<DevWorkerLaunch>((resolve, reject) => { this.resolveLaunch = resolve; this.rejectLaunch = reject; });
  constructor(private readonly input: Readable) { input.on('data', this.data); input.once('end', this.ended); input.once('close', this.ended); input.once('error', this.failed); }
  private failed = (cause: unknown): void => { this.rejectLaunch(cause); this.controller.abort(cause); };
  private ended = (): void => { this.failed(new InstallerError('source-cancelled', 'Preparation owner input ended')); };
  private data = (chunk: Buffer | string): void => {
    if (this.controller.signal.aborted) return;
    if (Buffer.byteLength(chunk) > MAX_CONTROL_BYTES) { this.failed(new InstallerError('schema-invalid', 'Worker control frame exceeds bound')); return; }
    this.pending += chunk.toString();
    if (Buffer.byteLength(this.pending) > MAX_CONTROL_BYTES) { this.failed(new InstallerError('schema-invalid', 'Worker control frame exceeds bound')); return; }
    while (this.pending.includes('\n')) {
      const end = this.pending.indexOf('\n'), line = this.pending.slice(0, end); this.pending = this.pending.slice(end + 1);
      try {
        const value: unknown = JSON.parse(line);
        if (!this.record) { const launch = parseDevWorkerLaunch(value); this.record = launch.checkpoint; this.resolveLaunch(launch); }
        else { parseDevWorkerCancel(value, this.record); this.controller.abort(new InstallerError('source-cancelled', 'Preparation owner cancelled')); return; }
      } catch (cause) { this.failed(cause); return; }
    }
  };
  dispose(): void { this.input.off('data', this.data); this.input.off('end', this.ended); this.input.off('close', this.ended); this.input.off('error', this.failed); this.input.pause(); }
}

/** Run only private source work. Final result follows coordinator drain/release;
 * the worker lock remains held until every result write is complete. */
export async function executeDevWorker(home: string, input: DevWorkerLaunch, options: { work?: DevWorkerWork; signal?: AbortSignal; environment?: NodeJS.ProcessEnv } = {}): Promise<DevPreparationResult> {
  const launch = parseDevWorkerLaunch(input), record = launch.checkpoint, paths = devWorkerPaths(home, record);
  const target = record.sourceOffer.target;
  if (process.version !== 'v22.22.1' || process.platform !== target.os || process.arch !== target.arch) throw new InstallerError('runtime-invalid', 'Worker must execute its private target runtime');
  assertLocalControlRoot(paths.home, process.platform === 'win32' ? path => controlBinding().localVolume(path) : undefined);
  containedDirectories(paths.home, record.checkoutRelativePath); containedDirectories(paths.checkout, '.insrc/tmp/dev-preparation');
  const handle = controlBinding().acquire(paths.lock);
  try {
    if (existsSync(paths.identity) || existsSync(paths.result)) throw uncertain('An attempt cannot launch twice');
    atomicWorkerFile(handle, paths.identity, { schemaVersion: 1, ...binding(record) });
    const base = createRun(paths.checkout, { mode: 'build', runId: record.coordinatorRunId! });
    const run: BuildRun = { ...base, environment: () => ({ ...options.environment, INSRC_TEST_RUN_ID: base.runId, INSRC_TEST_ROOT: base.root, INSRC_BUILD_CONFIRM_CLOSURE: '1' }) };
    let inventorySha256: string | undefined, failure: unknown;
    try {
      await withRun(run, async scope => {
        const cancel = () => scope.stop(); options.signal?.addEventListener('abort', cancel, { once: true });
        try {
          options.signal?.throwIfAborted();
          if (!options.work) throw new InstallerError('source-build-failed', 'No preparation workload has been composed');
          const output = await options.work(run, scope, options.signal ?? new AbortController().signal, paths.stage);
          options.signal?.throwIfAborted();
          if (!output || !/^[a-f0-9]{64}$/.test(output.inventorySha256)) throw uncertain('Preparation workload returned no complete stage');
          await verifyStagedMetadata(record, paths, output.inventorySha256); inventorySha256 = output.inventorySha256;
        } finally { options.signal?.removeEventListener('abort', cancel); }
      });
    } catch (cause) { failure = cause; }
    const closure = closureEvidence(record, paths);
    if (inventorySha256 && closure.admittedCommands === 0) throw uncertain('Prepared work has no admitted command evidence');
    if (!closure.commandsSucceeded) failure ??= new InstallerError('source-build-failed', 'An admitted preparation command did not succeed');
    const outcome = options.signal?.aborted ? 'cancelled' : failure ? 'failed' : 'prepared';
    const result: DevPreparationResult = { schemaVersion: 1, ...binding(record), outcome, cleanupSha256: digest(canonicalJson(closure)),
      inputFingerprint: inputFingerprint(paths.checkout), ...(outcome === 'prepared' ? { outputFingerprint: fingerprint(paths.checkout, ['out', 'packages/project-memory/dist']), inventorySha256: inventorySha256! } : {}) };
    parseDevPreparationResult(result, { ...record, stage: 'building' });
    atomicWorkerFile(handle, paths.closure, closure);
    if (failure) atomicWorkerFile(handle, paths.diagnostic, { schemaVersion: 1, code: failure instanceof InstallerError ? failure.code : 'source-build-failed' });
    atomicWorkerFile(handle, paths.result, result); return result;
  } finally { controlBinding().close(handle); }
}

async function readDevResult(home: string, record: DevPreparationRecord, verifyStage: boolean): Promise<DevPreparationResult> {
  const expected = parseDevPreparation(record), paths = devWorkerPaths(home, expected);
  try {
    assertLocalControlRoot(paths.home, process.platform === 'win32' ? path => controlBinding().localVolume(path) : undefined);
    for (const file of [paths.result, join(paths.workspace, 'cleanup.json')]) realParents(paths.home, file);
    for (const file of [paths.identity, paths.lock, paths.result, paths.closure]) bytes(file);
    const handle = controlBinding().acquire(paths.lock);
    try {
      if (bytes(paths.identity) !== canonicalJson({ schemaVersion: 1, ...binding(expected) })) throw uncertain('Worker ownership identity differs');
      const result = parseDevPreparationResult(JSON.parse(bytes(paths.result)), { ...expected, stage: 'building' });
      const closure = closureEvidence(expected, paths), closureBytes = bytes(paths.closure);
      if (canonicalJson(closure) !== closureBytes || digest(closureBytes) !== result.cleanupSha256) throw uncertain('Worker cleanup digest differs');
      if (inputFingerprint(paths.checkout) !== result.inputFingerprint) throw uncertain('Prepared source inputs changed after worker completion');
      if (result.outcome === 'prepared') {
        if (!closure.commandsSucceeded || closure.admittedCommands === 0) throw uncertain('Prepared command evidence differs');
        if (verifyStage) {
          if (fingerprint(paths.checkout, ['out', 'packages/project-memory/dist']) !== result.outputFingerprint) throw uncertain('Prepared output evidence differs');
          await verifyStagedMetadata(expected, paths, result.inventorySha256!);
        }
      }
      return result;
    } finally { controlBinding().close(handle); }
  } catch (cause) { throw uncertain('Preparation result/ownership could not be confirmed; retain this attempt', cause); }
}

export function readVerifiedDevResult(home: string, record: DevPreparationRecord): Promise<DevPreparationResult> { return readDevResult(home, record, true); }
/** Selected-source preflight checks closed provenance and build inputs, not old
 * ignored build outputs or a stage already moved to releases. The caller must
 * verify the selected immutable release independently through delivery.open. */
export function readVerifiedDevSourceResult(home: string, record: DevPreparationRecord): Promise<DevPreparationResult> { return readDevResult(home, record, false); }

/** Required closure guard for later retry/cleanup callers. Cleanup also needs
 * its separate pristine-data/path checks; this grants no deletion capability. */
export async function requireClosedDevAttempt(home: string, record: DevPreparationRecord, purpose: 'retry' | 'cleanup'): Promise<DevPreparationResult> {
  if (!['retry', 'cleanup'].includes(purpose)) throw new InstallerError('schema-invalid', 'Unknown attempt disposition');
  const result = await readVerifiedDevResult(home, record);
  if (result.outcome === 'prepared') throw uncertain('Prepared work must be finalized, not rebuilt or removed');
  return result;
}

export async function launchDevWorker(scope: CommandScope, location: InstallationLocation, record: DevPreparationRecord, options: {
  entrypoint: string; signal?: AbortSignal; ownerInput?: Readable; environment: NodeJS.ProcessEnv;
}): Promise<DevPreparationResult> {
  if (location.installationId !== record.installationId) throw uncertain('Worker location targets another installation');
  const paths = devWorkerPaths(location.home, record);
  if (existsSync(paths.identity) || existsSync(paths.result) || existsSync(paths.active)) throw uncertain('Existing attempt requires explicit reconciliation instead of another worker');
  parseDevWorkerLaunch({ schemaVersion: 1, kind: 'prepare', checkpoint: record });
  if (!isAbsolute(options.entrypoint) || !lstatSync(options.entrypoint).isFile() || lstatSync(options.entrypoint).isSymbolicLink()) throw uncertain('Worker entrypoint must be an absolute regular control file');
  options.signal?.throwIfAborted();
  if (options.ownerInput?.readableEnded || options.ownerInput?.destroyed) throw new InstallerError('source-cancelled', 'Preparation owner input ended before launch');
  const result = await scope.start(process.execPath, [options.entrypoint, '--dev-preparation-worker', location.home], {
    env: options.environment,
    ownerChannel: { initial: canonicalJson({ schemaVersion: 1, kind: 'prepare', checkpoint: record }) + '\n', connect(channel) {
      const cancel = () => { channel.write(canonicalJson({ schemaVersion: 1, kind: 'cancel', operationId: record.operationId, attemptId: record.attemptId, workerNonce: record.workerNonce }) + '\n'); channel.end(); };
      const end = () => channel.end();
      options.signal?.addEventListener('abort', cancel, { once: true }); options.ownerInput?.once('end', end); options.ownerInput?.once('close', end); options.ownerInput?.once('error', end);
      if (options.signal?.aborted) cancel(); else if (options.ownerInput?.readableEnded) end();
      return () => { options.signal?.removeEventListener('abort', cancel); options.ownerInput?.off('end', end); options.ownerInput?.off('close', end); options.ownerInput?.off('error', end); };
    } },
  });
  if (!await scope.drain() || result.code !== 0 || result.timedOut || result.interrupted || result.launchError) throw uncertain('Worker process closure is unconfirmed');
  const outcome = await readVerifiedDevResult(location.home, record);
  if (outcome.outcome === 'prepared' && (options.signal?.aborted || options.ownerInput?.readableEnded || options.ownerInput?.destroyed)) throw new InstallerError('source-cancelled', 'Owner cancelled before prepared handoff');
  return outcome;
}
