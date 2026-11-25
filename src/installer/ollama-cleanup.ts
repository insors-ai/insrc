/** Finite dependency disposal only: no controller, service or install authority. */
import { existsSync } from 'node:fs';
import { lstat, readdir, rmdir, unlink } from 'node:fs/promises';
import { basename, dirname, join, relative } from 'node:path';
import type { InstallationLocation } from './contracts.js';
import type { DependencyAttemptIdentity, OllamaPolicy } from './ollama-policy.js';
import { controlBinding } from './native.js';
import { privateOllamaDirectory } from './ollama-layout.js';
import { canonicalJson, digest } from './release-descriptor.js';
import { flushParents } from './durability.js';
import { dependencyPath, dependencyUncertain, readDependencyRecord, writeDependencyRecord } from './ollama-records.js';
import type { OllamaAttempt } from './ollama-records.js';

// An unconfirmed resource may still be active. Keep its native lock reachable
// until process exit; GC must not make this cohort appear positively closed.
const uncertainHandles = new Set<object>();
export function retainUncertainOllamaHandle(handle: object): void { uncertainHandles.add(handle); }
export const disposedPath = (file: string) => file.replace(/\.json$/, '.disposed.json');
export const cleanupPath = (file: string) => file.replace(/\.json$/, '.cleanup.json');
export function ollamaTemporaryRecordName(nonce: string): RegExp {
  return new RegExp(`^${nonce}(?:\\.(?:closed|cleanup|disposed|retry|retry-done|retry-temp-[a-f0-9]{64}(?:\\.done)?))?\\.json\\.[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}\\.tmp$`);
}
export function ollamaRetryPlan(attempt: OllamaAttempt, proof: 'positive-finite-closure' | 'qualified-in-process-native-v1') {
  const id = attempt.identity, nonce = basename(id.recordRelativePath, '.json');
  return { schemaVersion: 1, installationId: id.installationId, originalOperationId: id.operationId, originalAction: 'install',
    identitySha256: digest(canonicalJson(id)), policySha256: id.policySha256, stageRelativePath: id.stageRelativePath,
    temporaryRecordBases: [nonce, ...['closed', 'cleanup', 'disposed', 'retry', 'retry-done'].map(s => `${nonce}.${s}`)].map(s => `${s}.json`),
    temporaryCompletionAlgorithm: 'sha256-temp-basename-v1', proof };
}
async function jsonRecord(location: InstallationLocation, file: string, signal?: AbortSignal): Promise<unknown> {
  const bytes = await readDependencyRecord(location, file); signal?.throwIfAborted();
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes), value: unknown = JSON.parse(text);
    if (text === canonicalJson(value)) return value;
  } catch { /* Preserve malformed evidence. */ }
  throw dependencyUncertain('Retry disposal evidence is not canonical');
}
/** Read-only admission gate: the finite-stage certificate does not stand in
 * for a completed explicit retry. Every declared temporary item must close. */
export async function assertOllamaRetryClosed(location: InstallationLocation, attempt: OllamaAttempt,
  names: string[], signal?: AbortSignal): Promise<void> {
  const id = attempt.identity, record = dependencyPath(location, id.recordRelativePath), nonce = basename(record, '.json'), directory = dirname(record);
  const journals = names.filter(name => name.startsWith(`${nonce}.retry`));
  const planFile = record.replace(/\.json$/, '.retry.json');
  if (!existsSync(planFile)) {
    if (journals.length) throw dependencyUncertain('Retry disposal journals lack their exact admission');
    return;
  }
  const plan = await jsonRecord(location, planFile, signal) as { proof?: unknown } | null;
  if (!plan || (plan.proof !== 'positive-finite-closure' && plan.proof !== 'qualified-in-process-native-v1')
    || (plan.proof === 'qualified-in-process-native-v1' && attempt.schemaVersion !== 2)
    || canonicalJson(plan) !== canonicalJson(ollamaRetryPlan(attempt, plan.proof))) throw dependencyUncertain('Retry disposal admission differs from its attempt');
  const identitySha256 = digest(canonicalJson(id));
  const done = await jsonRecord(location, record.replace(/\.json$/, '.retry-done.json'), signal);
  if (canonicalJson(done) !== canonicalJson({ schemaVersion: 1, identitySha256, stageRemoved: true, temporaryRecordsRemoved: true })) {
    throw dependencyUncertain('Explicit retry cleanup is not durably complete');
  }
  const itemName = new RegExp(`^${nonce}\\.retry-temp-([a-f0-9]{64})(?:\\.done)?\\.json$`);
  const seen = new Set<string>();
  for (const name of journals) {
    signal?.throwIfAborted(); const match = itemName.exec(name);
    if (!match || seen.has(match[1]!)) continue;
    seen.add(match[1]!);
    const intentFile = join(directory, `${nonce}.retry-temp-${match[1]}.json`);
    const item = await jsonRecord(location, intentFile, signal) as { fileRelativePath?: unknown } | null;
    if (!item || typeof item.fileRelativePath !== 'string') throw dependencyUncertain('Temporary disposal admission is malformed');
    const file = dependencyPath(location, item.fileRelativePath), tempName = basename(file);
    if (dirname(file) !== directory || !ollamaTemporaryRecordName(nonce).test(tempName) || digest(tempName) !== match[1]
      || canonicalJson(item) !== canonicalJson({ schemaVersion: 1, identitySha256, fileRelativePath: item.fileRelativePath, purpose: 'temporary-record-disposal' })
      || existsSync(file)) throw dependencyUncertain('Temporary disposal target is not positively removed');
    const completion = await jsonRecord(location, intentFile.replace(/\.json$/, '.done.json'), signal);
    if (canonicalJson(completion) !== canonicalJson({ schemaVersion: 1, identitySha256, fileRelativePath: item.fileRelativePath, removed: true })) {
      throw dependencyUncertain('Temporary disposal completion differs from its admitted item');
    }
  }
}

export async function ensureOllamaRecord(location: InstallationLocation, handle: object, file: string, value: unknown): Promise<void> {
  if (!existsSync(file)) { writeDependencyRecord(location, handle, file, value); return; }
  const bytes = await readDependencyRecord(location, file);
  if (!bytes.equals(Buffer.from(canonicalJson(value)))) throw dependencyUncertain('Existing cleanup evidence differs from its exact attempt');
}

/** Validate the entire stage before deleting. Recheck every identity before its
 * unlink, bounded by caller deadline and retained native handle. */
export async function removeOwnedOllamaStage(location: InstallationLocation, identity: DependencyAttemptIdentity,
  policy: OllamaPolicy, current: () => void, beforeRemove?: (path: string) => Promise<void>): Promise<void> {
  const stage = dependencyPath(location, identity.stageRelativePath);
  current(); if (!existsSync(stage)) return;
  await privateOllamaDirectory(stage); current();
  const entries: Array<{ path: string; dev: number; ino: number; directory: boolean }> = [];
  const scan = async (path: string, depth: number): Promise<void> => {
    current(); const info = await lstat(path); current();
    if (depth > 65 || entries.length >= policy.limits.files * 2 + 16 || info.isSymbolicLink()
      || (!info.isDirectory() && (!info.isFile() || info.nlink !== 1))
      || (process.platform !== 'win32' && info.uid !== process.getuid?.())
      || (process.platform === 'win32' && !controlBinding().safePath(path, info.isDirectory(), info.isDirectory()))) {
      throw dependencyUncertain('Private dependency cleanup tree is not proven owned and bounded');
    }
    entries.push({ path, dev: info.dev, ino: info.ino, directory: info.isDirectory() });
    if (info.isDirectory()) for (const name of await readdir(path)) { current(); await scan(join(path, name), depth + 1); }
  };
  await scan(stage, 0);
  for (const entry of entries.reverse()) {
    if (beforeRemove) { await beforeRemove(relative(location.home, entry.path).replaceAll('\\', '/')); current(); }
    current(); const info = await lstat(entry.path); current();
    if (info.dev !== entry.dev || info.ino !== entry.ino || info.isSymbolicLink()
      || info.isDirectory() !== entry.directory || (!entry.directory && (!info.isFile() || info.nlink !== 1))) {
      throw dependencyUncertain('Private dependency cleanup identity changed');
    }
    if (entry.directory) await rmdir(entry.path); else await unlink(entry.path);
    current();
  }
  flushParents(dirname(stage), location.home); current();
}

/** Caller has positively closed preparation (or explicitly retired a qualified
 * dead in-process cohort). This never touches published payloads or services. */
export async function disposeOllamaStage(location: InstallationLocation, identity: DependencyAttemptIdentity,
  policy: OllamaPolicy, handle: object, current: () => void, beforeRemoval?: () => Promise<void>,
  beforeRemove?: (path: string) => Promise<void>, afterRemoval?: () => Promise<void>): Promise<void> {
  const record = dependencyPath(location, identity.recordRelativePath), identitySha256 = digest(canonicalJson(identity));
  current(); await ensureOllamaRecord(location, handle, cleanupPath(record), { schemaVersion: 1, identitySha256, purpose: 'private-stage-disposal' }); current();
  if (beforeRemoval) { await beforeRemoval(); current(); }
  // The entire exact private stage is one plan item. Its durable admission and
  // completion bracket idempotent deletion of any remaining contained entries.
  await removeOwnedOllamaStage(location, identity, policy, current, beforeRemove); current();
  if (afterRemoval) { await afterRemoval(); current(); }
  await ensureOllamaRecord(location, handle, disposedPath(record), { schemaVersion: 1, identitySha256, closed: true, stageRemoved: true }); current();
}
