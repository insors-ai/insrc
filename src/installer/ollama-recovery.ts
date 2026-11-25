/** Explicit install-retry dependency cleanup. Never called by inspection. */
import { existsSync, lstatSync } from 'node:fs';
import { readdir, unlink } from 'node:fs/promises';
import { basename, dirname, join, relative } from 'node:path';
import type { InstallationLocation } from './contracts.js';
import type { DependencyOperationContext } from './peer-contracts.js';
import type { OllamaPolicy } from './ollama-policy.js';
import { dependencyAttemptPaths, ollamaPolicySha256 } from './ollama-policy.js';
import { requireDependencyRetry } from './dependency-context.js';
import { controlBinding } from './native.js';
import { canonicalJson, digest } from './release-descriptor.js';
import { flushDirectory } from './durability.js';
import { acceptedOllamaPolicy, checkDependencyParents, closurePath, dependencyLockIdentity, dependencyPath, dependencyUncertain, parseBoundOllamaAttempt,
  parseOllamaClosure, readDependencyRecord } from './ollama-records.js';
import { disposeOllamaStage, ensureOllamaRecord, retainUncertainOllamaHandle } from './ollama-cleanup.js';
import { assertOllamaReadsClosed, closedOllamaAttempts, OLLAMA_CLEANUP_MS, verifyPreparedOllama } from './ollama-prepare.js';

export interface OllamaRetryOptions {
  cleanupMs?: number | undefined;
  /** Deterministic crash/cancellation boundary for owned tests. */
  beforeDisposal?: (() => Promise<void>) | undefined;
}
async function read(location: InstallationLocation, file: string): Promise<unknown> {
  const raw = await readDependencyRecord(location, file);
  try { const text = new TextDecoder('utf-8', { fatal: true }).decode(raw), value: unknown = JSON.parse(text);
    if (canonicalJson(value) === text) return value;
  } catch { /* Preserve malformed evidence. */ }
  throw dependencyUncertain('Recovery record is not canonical');
}

/** The manager must check original action=install and no other-owner work
 * before minting the retry capability. It retains its installation lock. */
export async function cleanupOllamaInstallAttempt(location: InstallationLocation, input: DependencyOperationContext,
  currentPolicy?: OllamaPolicy, options: OllamaRetryOptions = {}): Promise<void> {
  const context = requireDependencyRetry(location, input), paths = dependencyAttemptPaths(context.operationId, context.attemptNonce);
  assertOllamaReadsClosed(location);
  const record = dependencyPath(location, paths.recordRelativePath), lock = `${record}.lock`;
  if (!existsSync(record)) throw dependencyUncertain('Original dependency attempt is unavailable; no inferred cleanup ownership');
  try { checkDependencyParents(location, record); dependencyLockIdentity(lock); }
  catch (cause) { throw dependencyUncertain('Original actor lock is not anchored private evidence', cause); }
  const ms = options.cleanupMs ?? OLLAMA_CLEANUP_MS;
  if (!Number.isInteger(ms) || ms < 1 || ms > OLLAMA_CLEANUP_MS) throw dependencyUncertain('Invalid install-retry cleanup budget');
  let handle: object;
  try { handle = controlBinding().acquire(lock); } catch (cause) { throw dependencyUncertain('Original preparation actor has not released ownership', cause); }
  const ends = performance.now() + ms;
  const current = () => {
    context.assertCurrent(); assertOllamaReadsClosed(location);
    if (performance.now() >= ends || !controlBinding().held(handle)) throw dependencyUncertain('Install-retry cleanup budget/ownership ended');
  };
  let timer: ReturnType<typeof setTimeout> | undefined, keep = false;
  const work = (async () => {
    current();
    const attempt = parseBoundOllamaAttempt(location, await read(location, record)); current();
    if (attempt.identity.recordRelativePath !== paths.recordRelativePath || attempt.identity.stageRelativePath !== paths.stageRelativePath) {
      throw dependencyUncertain('Retry does not name its exact original dependency attempt');
    }
    const policy = acceptedOllamaPolicy(attempt, currentPolicy);
    if (attempt.schemaVersion === 2 && canonicalJson(attempt.lockIdentity) !== canonicalJson(dependencyLockIdentity(lock))) {
      throw dependencyUncertain('Original actor lock identity changed; a replacement free lock proves nothing');
    }
    const identity = attempt.identity, identitySha256 = digest(canonicalJson(identity));
    // Positive closure suffices for legacy actors. Only the new strictly
    // recorded, non-inherited in-process cohort supports death reconciliation.
    const closedFile = closurePath(record);
    const closure = existsSync(closedFile) ? parseOllamaClosure(identity, await read(location, closedFile)) : undefined;
    current();
    if (!closure && (attempt.schemaVersion !== 2 || attempt.lockProtocol !== 'in-process-native-v1')) {
      throw dependencyUncertain('Actor lacks positive closure or a qualified in-process admission');
    }
    const directory = dirname(record), nonce = basename(record, '.json');
    const fixed = [nonce, ...['closed', 'cleanup', 'disposed', 'retry', 'retry-done'].map(s => `${nonce}.${s}`)];
    const plan = { schemaVersion: 1, installationId: location.installationId, originalOperationId: context.operationId,
      originalAction: 'install', identitySha256, policySha256: ollamaPolicySha256(policy),
      stageRelativePath: identity.stageRelativePath, temporaryRecordBases: fixed.map(s => `${s}.json`), temporaryCompletionAlgorithm: 'sha256-temp-basename-v1',
      proof: closure ? 'positive-finite-closure' : 'qualified-in-process-native-v1' };
    // A repeat after death must retain the original proof, even after the
    // first recovery has written the explicit cancelled closure.
    const planFile = record.replace(/\.json$/, '.retry.json');
    if (existsSync(planFile)) {
      const prior = await read(location, planFile) as { proof?: unknown }; current();
      if (prior.proof !== 'positive-finite-closure' && prior.proof !== 'qualified-in-process-native-v1') throw dependencyUncertain('Invalid retry proof');
      await ensureOllamaRecord(location, handle, planFile, { ...plan, proof: prior.proof });
    } else await ensureOllamaRecord(location, handle, planFile, plan);
    current();
    const published = dependencyPath(location, identity.payloadRelativePath);
    if (existsSync(published)) {
      if (!closure || closure.outcome !== 'prepared') throw dependencyUncertain('Published dependency lacks a prepared closure; it must be preserved');
      const verified = await verifyPreparedOllama(location, policy, published, context.signal); current();
      if (verified.inventorySha256 !== closure.inventorySha256) throw dependencyUncertain('Published dependency closure differs; preserve payload');
    }
    // Lock reacquisition is meaningful here only with the immutable v2 actor
    // protocol above: all preparation is in-process, zero external actors, and
    // the native CLOEXEC/non-inherited handle spans all admitted async work.
    if (!closure) await ensureOllamaRecord(location, handle, closedFile,
      { schemaVersion: 1, identitySha256, closed: true, outcome: 'cancelled' });
    current();
    await disposeOllamaStage(location, identity, policy, handle, current, options.beforeDisposal); current();
    const names = await readdir(directory); current();
    if (names.length > 1024) throw dependencyUncertain('Recovery record inventory exceeds bound');
    const temporary = new RegExp(`^${nonce}(?:\\.(?:closed|cleanup|disposed|retry|retry-done|retry-temp-[a-f0-9]{64}))?\\.json\\.[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}\\.tmp$`);
    for (const name of names) {
      current();
      if (!temporary.test(name)) continue;
      const file = join(directory, name), stat = lstatSync(file);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1
        || (process.platform !== 'win32' && (stat.uid !== process.getuid?.() || (stat.mode & 0o077)))
        || (process.platform === 'win32' && !controlBinding().safePath(file, false, false))) throw dependencyUncertain('Unsafe recovery temporary file');
      const fileRelativePath = relative(location.home, file).replaceAll('\\', '/');
      await unlink(file); current(); flushDirectory(directory);
      await ensureOllamaRecord(location, handle, record.replace(/\.json$/, `.retry-temp-${digest(name)}.json`),
        { schemaVersion: 1, identitySha256, fileRelativePath, removed: true }); current();
    }
    await ensureOllamaRecord(location, handle, record.replace(/\.json$/, '.retry-done.json'),
      { schemaVersion: 1, identitySha256, stageRemoved: true, temporaryRecordsRemoved: true }); current();
    await closedOllamaAttempts(location, context.signal); current();
  })();
  try {
    const settled = work.then(() => ({ closed: true as const }), cause => ({ cause }));
    const result = await Promise.race([settled, new Promise<undefined>(resolve => { timer = setTimeout(() => resolve(undefined), ms); })]);
    if (!result) {
      keep = true; void settled.then(result => {
        if ('cause' in result && (result.cause as { code?: string })?.code === 'resource-close-uncertain') retainUncertainOllamaHandle(handle);
        else controlBinding().close(handle);
      });
      throw dependencyUncertain('Install-retry cleanup has not positively closed; no new installation is permitted');
    }
    if ('cause' in result) throw result.cause;
  } catch (cause) {
    if ((cause as { code?: string })?.code === 'resource-close-uncertain') { keep = true; retainUncertainOllamaHandle(handle); }
    throw dependencyUncertain('Explicit install-retry cleanup is incomplete; no new installation is permitted', cause);
  } finally { if (timer) clearTimeout(timer); if (!keep) controlBinding().close(handle); }
}
