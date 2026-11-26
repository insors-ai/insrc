/** One consented, finite private preparation; service admission is separate. */
import { existsSync, lstatSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { InstallerError } from './contracts.js';
import type { InstallationLocation } from './contracts.js';
import type { DependencyOperationContext } from './peer-contracts.js';
import type { DependencyInspection } from './dependencies.js';
import { requireDependencyOperation } from './dependency-context.js';
import { canonicalJson, digest } from './release-descriptor.js';
import type { InventoryFile } from './release-descriptor.js';
import { controlBinding } from './native.js';
import { downloadBoundedAsset } from './download.js';
import type { DownloadTransport } from './download.js';
import { flushFile, flushParents, flushDirectoryTree } from './durability.js';
import { extractOllamaArchive } from './ollama-archive.js';
import { privateOllamaDirectory, verifyOllamaTree } from './ollama-layout.js';
import { dependencyAttemptIdentity, ollamaPolicySha256, parseOllamaPolicy, OLLAMA_LIMITS } from './ollama-policy.js';
import type { DependencyAttemptIdentity, OllamaOffer, OllamaPolicy } from './ollama-policy.js';
import { closurePath, DEPENDENCY_INVENTORY_LIMIT, dependencyLockIdentity, dependencyPath, dependencyUncertain, ensureDependencyDirectory,
  parseBoundOllamaAttempt, parseOllamaAttempt, parseOllamaClosure, parseOllamaInventory, parseOllamaReceipt, readDependencyRecord, writeDependencyRecord } from './ollama-records.js';
import type { OllamaAttempt, OllamaClosure, OllamaReceipt } from './ollama-records.js';
import { assertOllamaRetryClosed, cleanupPath, disposedPath, disposeOllamaStage, ollamaCloseUncertain, retainUncertainOllamaHandle } from './ollama-cleanup.js';

export const OLLAMA_PREPARATION_MS = 20 * 60 * 1000, OLLAMA_CLEANUP_MS = 5000;
/** Read-only phases cannot continue into mutation after their caller returns.
 * Keep an unclosed phase registered until its actual promise closes. */
const pendingReads = new Map<string, Promise<unknown>>();
export interface PreparedOllama {
  directory: string; identity: DependencyAttemptIdentity; policy: OllamaPolicy; offer: OllamaOffer; inventorySha256: string; files: InventoryFile[];
  preparationDeadline: number;
}
export interface OllamaPrepareOptions {
  /** Internal read-only inspection which settles only after probe closure
   * (inspectDependenciesClosed), never a wire-selected callback. */
  recheck(signal: AbortSignal): Promise<DependencyInspection>;
  transport?: DownloadTransport | undefined;
  /** Narrow deterministic fault/deadline seams; production uses the defaults. */
  prepareMs?: number | undefined; cleanupMs?: number | undefined;
  flushFile?: ((file: string) => void) | undefined;
  beforeFiniteClose?: (() => Promise<void>) | undefined;
  beforeStageDisposal?: (() => Promise<void>) | undefined;
  publish?: ((handle: object, from: string, to: string) => void) | undefined;
  verifyExisting?: typeof verifyPreparedOllama | undefined;
}
function json(bytes: Buffer): unknown {
  try { const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes), value: unknown = JSON.parse(text);
    if (canonicalJson(value) !== text) throw new Error('Noncanonical dependency evidence'); return value;
  } catch (cause) { throw dependencyUncertain('Malformed dependency evidence', cause); }
}
export function assertOllamaReadsClosed(location: InstallationLocation): void {
  if (pendingReads.has(`${location.installationId}\0${location.home}`)) throw dependencyUncertain('A dependency read has not positively closed');
}
async function within<T>(promise: Promise<T>, ms: number): Promise<{ value: T } | undefined> {
  if (ms <= 0) return undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([promise.then(value => ({ value })), new Promise<undefined>(resolve => { timer = setTimeout(() => resolve(undefined), ms); })]); }
  finally { if (timer) clearTimeout(timer); }
}
async function untilAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<{ value: T } | undefined> {
  let cancel: (() => void) | undefined;
  try { return await Promise.race([promise.then(value => ({ value })), new Promise<undefined>(resolve => { cancel = () => resolve(undefined); signal.addEventListener('abort', cancel, { once: true }); if (signal.aborted) cancel(); })]); }
  finally { if (cancel) signal.removeEventListener('abort', cancel); }
}

/** Read-only positive closure census. A free lock, PID or age grants nothing. */
export async function closedOllamaAttempts(location: InstallationLocation, signal?: AbortSignal, currentHandoff?: string,
  retainedFacts?: ((attempt: OllamaAttempt, record: string) => Promise<boolean>) | undefined): Promise<OllamaAttempt[]> {
  try {
  signal?.throwIfAborted();
  const root = dependencyPath(location, 'deps/ollama/.attempts');
  if (existsSync(root)) await privateOllamaDirectory(root);
  const operations = existsSync(root) ? await readdir(root) : [], result: OllamaAttempt[] = [];
  if (operations.length > 128) throw dependencyUncertain('Dependency operation evidence exceeds bound');
  for (const operation of operations) {
    signal?.throwIfAborted();
    const directory = join(root, operation); await privateOllamaDirectory(directory);
    const files = await readdir(directory);
    if (files.length > 1024) throw dependencyUncertain('Dependency attempt evidence exceeds bound');
    for (const name of files) {
      signal?.throwIfAborted();
      if (!/^[A-Za-z0-9_-]{32,128}\.json$/.test(name)) {
        const handoff = /^([A-Za-z0-9_-]{32,128})\.handoff-([a-f0-9]{32})(\.closed)?\.json$/.exec(name);
        if (handoff) {
          if (!files.includes(`${handoff[1]}.json`)) throw dependencyUncertain('Orphan finite handoff evidence lacks its base attempt');
          const file = join(directory, `${handoff[1]}.json`), attempt = parseBoundOllamaAttempt(location, json(await readDependencyRecord(location, file)));
          if (dependencyPath(location, attempt.identity.recordRelativePath) !== file) throw dependencyUncertain('Finite handoff attempt path differs');
          const admissionFile = join(directory, `${handoff[1]}.handoff-${handoff[2]}.json`);
          const expected = { schemaVersion: 1, identitySha256: digest(canonicalJson(attempt.identity)), nonce: handoff[2], actor: 'finite-service-handoff' };
          if (canonicalJson(json(await readDependencyRecord(location, admissionFile))) !== canonicalJson(expected)) throw dependencyUncertain('Finite handoff admission differs');
          if (admissionFile !== currentHandoff) {
            const closedFile = closurePath(admissionFile);
            if (existsSync(closedFile)) {
              if (canonicalJson(json(await readDependencyRecord(location, closedFile))) !== canonicalJson({ ...expected, closed: true })) throw dependencyUncertain('Finite service handoff closure differs');
            } else if (!retainedFacts || !await retainedFacts(attempt, file)) throw dependencyUncertain('Finite service handoff lacks positive closure');
          }
          continue;
        }
        if (/^[A-Za-z0-9_-]{32,128}\.(?:json|service)\.lock$/.test(name)) {
          const info = lstatSync(join(directory, name)); if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1
            || (process.platform !== 'win32' && (info.uid !== process.getuid?.() || (info.mode & 0o077)))) throw dependencyUncertain('Unsafe dependency attempt lock'); continue;
        }
        const evidence = /^([A-Za-z0-9_-]{32,128})\.(?:closed|cleanup|disposed|retry|retry-done|retry-temp-[a-f0-9]{64}(?:\.done)?|published|service|service-input|service-launch|service-running|service-exit|service-result|service-log-error|service-diagnostic)\.json$/.exec(name);
        if (!evidence) throw dependencyUncertain('Unrecognized dependency attempt evidence');
        // Never silently ignore an orphan journal. Its base must be part of
        // this census and pass the full finite/disposal/retry validation below.
        if (!files.includes(`${evidence[1]}.json`)) throw dependencyUncertain('Orphan dependency evidence lacks its base attempt');
        continue;
      }
      if (result.length >= 128) throw dependencyUncertain('Dependency attempt history exceeds bound');
      const file = join(directory, name), attempt = parseBoundOllamaAttempt(location, json(await readDependencyRecord(location, file)));
      signal?.throwIfAborted();
      if (dependencyPath(location, attempt.identity.recordRelativePath) !== file) throw dependencyUncertain('Dependency evidence path binding differs');
      parseOllamaClosure(attempt.identity, json(await readDependencyRecord(location, closurePath(file))));
      const cleanup = json(await readDependencyRecord(location, cleanupPath(file)));
      if (canonicalJson(cleanup) !== canonicalJson({ schemaVersion: 1, identitySha256: digest(canonicalJson(attempt.identity)), purpose: 'private-stage-disposal' })) throw dependencyUncertain('Dependency cleanup admission differs');
      const disposed = json(await readDependencyRecord(location, disposedPath(file)));
      if (canonicalJson(disposed) !== canonicalJson({ schemaVersion: 1, identitySha256: digest(canonicalJson(attempt.identity)), closed: true, stageRemoved: true })) throw dependencyUncertain('Dependency disposal closure is unconfirmed');
      await assertOllamaRetryClosed(location, attempt, files, signal);
      result.push(attempt);
    }
  }
  const staging = dependencyPath(location, 'deps/ollama/.staging');
  if (existsSync(staging)) {
    await privateOllamaDirectory(staging); const operations = await readdir(staging);
    if (operations.length > 128) throw dependencyUncertain('Excessive retained dependency staging');
    for (const operation of operations) {
      signal?.throwIfAborted();
      const path = join(staging, operation); await privateOllamaDirectory(path);
      // Every fully disposed attempt must be absent. An unrecorded retained
      // stage is equally uncertain, irrespective of its age or a free lock.
      if ((await readdir(path)).length) throw dependencyUncertain('Retained dependency stage lacks confirmed disposal');
    }
  }
  return result;
  } catch (cause) { throw dependencyUncertain('Dependency finite/disposal evidence cannot establish closure', cause); }
}

/** Read-only, policy-bound completion metadata; grants no launch or cleanup. */
export async function readPreparedOllamaRecords(location: InstallationLocation, policyInput: OllamaPolicy,
  directory: string, signal?: AbortSignal): Promise<{ files: InventoryFile[]; inventorySha256: string }> {
  const policy = parseOllamaPolicy(policyInput);
  const raw = await readDependencyRecord(location, join(directory, 'inventory.json'), DEPENDENCY_INVENTORY_LIMIT);
  signal?.throwIfAborted(); const inventory = parseOllamaInventory(json(raw)), inventorySha256 = digest(raw);
  if (raw.toString('utf8') !== canonicalJson(inventory)) throw dependencyUncertain('Dependency inventory is not canonical');
  const receipt = parseOllamaReceipt(json(await readDependencyRecord(location, join(directory, '.ollama-receipt.json'))));
  const expected: OllamaReceipt = { schemaVersion: 1, installationId: location.installationId, policySha256: ollamaPolicySha256(policy), assetSha256: policy.asset.sha256,
    version: policy.version, target: policy.target, inventorySha256 };
  if (canonicalJson(receipt) !== canonicalJson(expected)) throw dependencyUncertain('Dependency payload receipt differs');
  signal?.throwIfAborted(); return { files: inventory.files, inventorySha256 };
}
export async function verifyPreparedOllama(location: InstallationLocation, policyInput: OllamaPolicy,
  directory: string, signal?: AbortSignal): Promise<{ files: InventoryFile[]; inventorySha256: string }> {
  const policy = parseOllamaPolicy(policyInput), result = await readPreparedOllamaRecords(location, policy, directory, signal);
  await verifyOllamaTree(directory, result.files, policy, signal, { records: true }); return result;
}

/** Exact offer is re-observed before any mutation and immediately before publish.
 * Only this private namespace is writable; no release/controller is supplied. */
export async function prepareOllama(location: InstallationLocation, policyInput: OllamaPolicy, offerInput: OllamaOffer,
  contextInput: DependencyOperationContext, options: OllamaPrepareOptions): Promise<PreparedOllama> {
  const context = requireDependencyOperation(location, contextInput), policy = parseOllamaPolicy(policyInput);
  const offer = structuredClone(offerInput), identity = dependencyAttemptIdentity(location, policy, offer, context);
  if (policy.target.os !== process.platform || policy.target.arch !== process.arch) throw new InstallerError('runtime-invalid', 'Dependency preparation requires its native private target runtime');
  const prepareMs = options.prepareMs ?? OLLAMA_PREPARATION_MS, cleanupMs = options.cleanupMs ?? OLLAMA_CLEANUP_MS;
  if (!Number.isInteger(prepareMs) || prepareMs < 1 || prepareMs > OLLAMA_PREPARATION_MS || !Number.isInteger(cleanupMs) || cleanupMs < 1 || cleanupMs > OLLAMA_CLEANUP_MS) throw dependencyUncertain('Invalid dependency work budget');
  const endsAt = performance.now() + prepareMs;
  const deadline = new AbortController(), timer = setTimeout(() => deadline.abort(), prepareMs);
  const ownerWatch = setInterval(() => { try { context.assertCurrent(); } catch { deadline.abort(); } }, 100); ownerWatch.unref();
  const signal = AbortSignal.any([deadline.signal, ...(context.signal ? [context.signal] : [])]);
  let cleanupEndsAt: number | undefined;
  const startCleanup = () => { cleanupEndsAt ??= performance.now() + cleanupMs; };
  signal.addEventListener('abort', startCleanup, { once: true }); if (signal.aborted) startCleanup();
  const remainingCleanup = () => { startCleanup(); return Math.max(0, cleanupEndsAt! - performance.now()); };
  const current = () => { context.assertCurrent(); if (performance.now() >= endsAt) deadline.abort(); if (signal.aborted) throw new InstallerError('cancelled', deadline.signal.aborted ? 'Dependency preparation deadline/owner check ended' : 'Dependency preparation cancelled'); };
  const readKey = `${location.installationId}\0${location.home}`;
  const boundedRead = async <T>(work: () => Promise<T>): Promise<T> => {
    current(); if (pendingReads.has(readKey)) throw dependencyUncertain('A prior dependency read has not positively closed');
    const task = Promise.resolve().then(work).then(value => ({ value }), error => ({ error })); pendingReads.set(readKey, task);
    void task.then(result => {
      if ('error' in result && ollamaCloseUncertain(result.error)) return;
      if (pendingReads.get(readKey) === task) pendingReads.delete(readKey);
    });
    let settled = await untilAbort(task, signal);
    if (!settled) settled = await within(task, remainingCleanup());
    if (!settled) throw dependencyUncertain('Dependency read closure exceeded the shared drain/cleanup deadline');
    if ('error' in settled.value) throw settled.value.error;
    current(); return settled.value.value;
  };
  const record = dependencyPath(location, identity.recordRelativePath), stage = dependencyPath(location, identity.stageRelativePath), payload = join(stage, 'payload');
  const directory = dependencyPath(location, identity.payloadRelativePath);
  let handle: object | undefined, keepHandle = false, published = false, uncertainPublication = false, admitted = false;
  let closed: OllamaClosure | undefined;
  const certificate = (outcome: OllamaClosure['outcome'], inventorySha256?: string): OllamaClosure => ({ schemaVersion: 1, identitySha256: digest(canonicalJson(identity)), closed: true, outcome, ...(inventorySha256 ? { inventorySha256 } : {}) });
  const failedOutcome = (cause: unknown): OllamaClosure['outcome'] => {
    const error = cause as { code?: string; name?: string } | undefined;
    return error?.code === 'cancelled' || error?.name === 'AbortError' || (signal.aborted && cause === signal.reason) ? 'cancelled' : 'failed';
  };
  const closedProbe = async () => {
    const probeDeadline = setTimeout(() => deadline.abort(), 3000);
    try { return await options.recheck(signal); } finally { clearTimeout(probeDeadline); }
  };
  const assertConsent = async () => {
    const check = await boundedRead(closedProbe);
    if (!check.report.runtimeReady || !check.offer || canonicalJson(check.offer) !== canonicalJson(offer) || check.endpoint !== policy.endpoint) throw new InstallerError('dependency-offer-stale', 'The exact dependency offer or local state changed; request consent again');
  };
  const cleanup = async () => {
    if (!closed || !handle) throw dependencyUncertain('Dependency cleanup lacks positive finite closure');
    if (remainingCleanup() <= 0) throw dependencyUncertain('Dependency cleanup has no remaining shared closure budget; retain stage');
    const removal = disposeOllamaStage(location, identity, policy, handle, () => {
      if (!controlBinding().held(handle!) || remainingCleanup() <= 0) throw dependencyUncertain('Dependency cleanup budget/ownership ended');
    }, options.beforeStageDisposal);
    let result: Awaited<ReturnType<typeof within<void>>>;
    try { result = await within(removal, remainingCleanup()); } catch (cause) {
      if (ollamaCloseUncertain(cause)) { keepHandle = true; retainUncertainOllamaHandle(handle); }
      throw dependencyUncertain('Dependency cleanup closure is unconfirmed', cause);
    }
    if (!result) {
      keepHandle = true;
      void removal.then(() => controlBinding().close(handle!), cause => {
        if (ollamaCloseUncertain(cause)) retainUncertainOllamaHandle(handle!);
        else controlBinding().close(handle!);
      });
      throw dependencyUncertain('Dependency cleanup exceeded its closure budget; evidence retained');
    }
    if (performance.now() > cleanupEndsAt!) throw dependencyUncertain('Dependency cleanup completed after its shared budget; inspect its recorded closure');
  };
  try {
    const prior = await boundedRead(() => closedOllamaAttempts(location, signal));
    if (existsSync(directory)) {
      return await boundedRead(async () => {
      const existing = await (options.verifyExisting ?? verifyPreparedOllama)(location, policy, directory, signal); current();
      const check = await closedProbe(); current();
      let matching = false;
      for (const attempt of prior) {
        if (attempt.identity.offerId !== identity.offerId || attempt.identity.policySha256 !== identity.policySha256
          || attempt.identity.operationId !== identity.operationId || attempt.identity.attemptNonce !== identity.attemptNonce) continue;
        const file = dependencyPath(location, attempt.identity.recordRelativePath);
        const closure = parseOllamaClosure(attempt.identity, json(await readDependencyRecord(location, closurePath(file)))); current();
        if (closure.outcome === 'prepared' && closure.inventorySha256 === existing.inventorySha256) matching = true;
      }
      if (!matching) throw dependencyUncertain('Existing dependency inventory lacks matching positive preparation evidence');
      if (!check.report.runtimeReady || !check.policy || ollamaPolicySha256(check.policy) !== offer.policySha256 || check.endpoint !== offer.endpoint
        || (check.report.ollama !== 'ready' && check.executable !== join(directory, policy.layout.executable))) throw new InstallerError('dependency-offer-stale', 'Existing payload or local endpoint differs');
      return { directory, policy, offer, identity, preparationDeadline: endsAt, ...existing };
      });
    }
    await assertConsent();
    ensureDependencyDirectory(location, 'deps/ollama', current);
    ensureDependencyDirectory(location, `deps/ollama/.attempts/${identity.operationId}`, current);
    ensureDependencyDirectory(location, `deps/ollama/.staging/${identity.operationId}`, current);
    current(); handle = controlBinding().acquire(`${record}.lock`);
    if (existsSync(record) || existsSync(stage)) throw dependencyUncertain('Dependency attempt already exists; reconcile instead of replaying');
    const attempt: OllamaAttempt = { schemaVersion: 2, identity, absence: offer.absence, actor: 'in-process-preparation', externalActors: 0,
      policy, lockProtocol: 'in-process-native-v1', lockIdentity: dependencyLockIdentity(`${record}.lock`) };
    parseOllamaAttempt(location, policy, attempt); writeDependencyRecord(location, handle, record, attempt); admitted = true;
    ensureDependencyDirectory(location, identity.stageRelativePath, current);
    ensureDependencyDirectory(location, `${identity.stageRelativePath}/payload`, current);
    const work = async () => {
      current(); context.progress('dependency-download', `Downloading exact Ollama ${policy.version} payload`);
      await downloadBoundedAsset(policy.asset, join(stage, 'payload.download'), OLLAMA_LIMITS.compressed, signal, options.transport); current();
      context.progress('dependency-extract', 'Validating bounded private Ollama payload');
      const files = await extractOllamaArchive(join(stage, 'payload.download'), payload, policy, signal); current();
      const inventory = { schemaVersion: 1 as const, files }, encoded = canonicalJson(inventory), inventorySha256 = digest(encoded);
      parseOllamaInventory(inventory);
      writeDependencyRecord(location, handle!, join(payload, 'inventory.json'), inventory, DEPENDENCY_INVENTORY_LIMIT);
      const receipt: OllamaReceipt = { schemaVersion: 1, installationId: location.installationId, policySha256: offer.policySha256,
        assetSha256: policy.asset.sha256, version: policy.version, target: policy.target, inventorySha256 };
      current(); writeDependencyRecord(location, handle!, join(payload, '.ollama-receipt.json'), receipt);
      for (const file of files) { current(); (options.flushFile ?? flushFile)(join(payload, file.path)); }
      current(); (options.flushFile ?? flushFile)(join(payload, 'inventory.json')); (options.flushFile ?? flushFile)(join(payload, '.ollama-receipt.json'));
      await flushDirectoryTree(payload, signal); current(); await verifyPreparedOllama(location, policy, payload, signal); current();
      if (options.beforeFiniteClose) await options.beforeFiniteClose(); current(); return { files, inventorySha256 };
    };
    const finite = work().then(value => ({ value }), error => ({ error }));
    let settled = await untilAbort(finite, signal);
    if (!settled) settled = await within(finite, remainingCleanup());
    if (!settled) {
      keepHandle = true;
      let release = true;
      void finite.then(async result => {
        if ('error' in result && ollamaCloseUncertain(result.error)) {
          release = false; retainUncertainOllamaHandle(handle!); return;
        }
        closed = 'value' in result ? certificate('prepared', result.value.inventorySha256) : certificate(failedOutcome(result.error));
        writeDependencyRecord(location, handle!, closurePath(record), closed);
        // Once late work actually closes, give its disposal one bounded budget.
        // It cannot publish or launch; no new operation has been admitted.
        const ends = performance.now() + cleanupMs;
        await disposeOllamaStage(location, identity, policy, handle!, () => {
          if (!controlBinding().held(handle!) || performance.now() >= ends) throw dependencyUncertain('Late dependency disposal budget/ownership ended');
        });
      }).catch(cause => {
        if (ollamaCloseUncertain(cause)) { release = false; retainUncertainOllamaHandle(handle!); }
      }).finally(() => { if (release) controlBinding().close(handle!); });
      throw dependencyUncertain('Admitted dependency preparation closure is unconfirmed; retain stage and block retry');
    }
    const outcome = settled.value;
    if ('error' in outcome && ollamaCloseUncertain(outcome.error)) {
      keepHandle = true; retainUncertainOllamaHandle(handle!);
      throw dependencyUncertain('A dependency resource did not positively close; retain evidence', outcome.error);
    }
    closed = 'value' in outcome ? certificate('prepared', outcome.value.inventorySha256) : certificate(failedOutcome(outcome.error));
    writeDependencyRecord(location, handle, closurePath(record), closed);
    if ('error' in outcome) { await cleanup(); throw outcome.error; }
    try {
      ensureDependencyDirectory(location, identity.payloadRelativePath.split('/').slice(0, -1).join('/'), current);
      context.progress('dependency-publish', 'Publishing verified immutable private Ollama payload');
      await assertConsent();
      current(); if (existsSync(directory)) throw new InstallerError('dependency-offer-stale', 'Private payload destination is no longer absent');
      current(); uncertainPublication = true;
      try { (options.publish ?? ((owner, from, to) => controlBinding().publishDirectory(owner, from, to)))(handle, payload, directory); }
      catch (cause) { if ((cause as NodeJS.ErrnoException).code === 'candidate-exists') { uncertainPublication = false; throw new InstallerError('dependency-offer-stale', 'Private dependency destination changed before exclusive publication', { cause }); } throw cause; }
      published = true; flushParents(directory, location.home); flushParents(dirname(payload), location.home); uncertainPublication = false;
      // The complete closed tree was verified before the same-volume exclusive
      // rename. Rename preserves those bytes; avoid another admitted read here.
      current();
    } catch (cause) {
      if (uncertainPublication) throw dependencyUncertain('Dependency publication/durability is uncertain; retain evidence for reconciliation', cause);
      if (pendingReads.has(readKey)) throw dependencyUncertain('Dependency probe closure is unconfirmed; retain the private stage', cause);
      await cleanup(); throw cause;
    }
    await cleanup(); current();
    return { directory, policy, offer, identity, preparationDeadline: endsAt, files: outcome.value.files, inventorySha256: outcome.value.inventorySha256 };
  } catch (cause) {
    if (ollamaCloseUncertain(cause)) {
      if (handle) { keepHandle = true; retainUncertainOllamaHandle(handle); }
      throw dependencyUncertain('Dependency resource closure is unconfirmed; retain evidence', cause);
    }
    if (admitted && !closed && !keepHandle) throw dependencyUncertain('Dependency admission has no positive closure; retain its evidence', cause);
    if (cause instanceof InstallerError) throw cause;
    throw new InstallerError(published ? 'dependency-uncertain' : signal.aborted ? 'cancelled' : 'dependency-prepare-failed', 'Private dependency preparation did not complete', { cause });
  } finally {
    clearTimeout(timer); clearInterval(ownerWatch); deadline.abort(); signal.removeEventListener('abort', startCleanup);
    if (handle && !keepHandle) {
      const pending = pendingReads.get(readKey), owner = handle;
      if (pending) void pending.then(result => {
        if (ollamaCloseUncertain((result as { error?: unknown }).error)) retainUncertainOllamaHandle(owner);
        else controlBinding().close(owner);
      });
      else controlBinding().close(owner);
    }
  }
}
