/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { constants } from 'node:fs';
import { open, rename, unlink, rmdir, readdir, writeFile, mkdir, link } from 'node:fs/promises';
import { join, dirname, relative } from 'node:path';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual as same } from 'node:util';
import { Type } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import type { ReviewKey } from '../../shared/review-resources.js';
import { CleanupClaimSchema, ReviewRuntimeSchema, decodeCleanupClaim, decodeReviewRuntime, REVIEW_RUNTIME_MAX_BYTES } from '../../shared/review-preparation.js';
import type { CleanupClaim } from '../../shared/review-preparation.js';
import type { ReviewRuntime } from '../../shared/review-preparation.js';
import { reviewJsonLimit } from '../../config/review.js';
import type { ArtifactStore } from '../artifact-core/store.js';
import { reviewWorkerCheckpoint } from '../../daemon/threads/review-worker-contract.js';
import { reviewRuntimePath } from '../../daemon/threads/review-runtime-store.js';
import { writeReviewBytes } from '../code-review/task-review/checkpoint.js';
import { contextRoot, preparationDigest } from './prepared-context.js';
import { ownedCleanupContext } from './cleanup-context-ownership.js';
import type { CleanupContextOwner } from './cleanup-context-ownership.js';
import { decodePreparationCheckpoint } from './preparation-checkpoint.js';
import type { PreparationHistory } from './history-binding.js';
import { publicationEvidenceDigest } from './publication-proof.js';
import { authorizePreparedCleanup, pinPreparedCleanupAuthority } from './cleanup-authorization.js';
import type { PreparedCleanupAuthorization } from './cleanup-authorization.js';
import type { ReviewCleanupTarget } from './cleanup-owner.js';
import type { CleanupResult } from '../code-review/task-review/cleanup.js';
import { bytesDigest, cleanupBytes, cleanupStat, cleanupIdentity, cleanupParents, inventoryCleanupContext, verifyCleanupEntry } from './cleanup-claim-files.js';
import type { CleanupEntry } from './cleanup-claim-files.js';

export interface PreparedCleanupDeps {
 readonly store: ArtifactStore;
 /** Main's exact subject/worker/native/context fence. Never supplied over RPC. */
 assertIdle(): Promise<void>;
 /** Main-issued retained context ownership; never inferred from directory names. */
 contexts(): Promise<readonly CleanupContextOwner[]>;
 /** Fault injection wraps real claim, rename, unlink and fsync boundaries. */
 readonly boundary?: ((stage: string, path: string) => Promise<void> | void) | undefined;
 readonly onDeleted?: ((reviewId: string) => Promise<void> | void) | undefined;
}
export const preparedCleanupDirectory = (key: ReviewKey): string => { reviewRuntimePath(key); return join(key.project, '.insrc/tmp/review-cleanup', key.family, key.reviewId); };
const lanes = new Map<string, Promise<void>>();
const original = (key: ReviewKey, kind: CleanupEntry['kind']) => kind === 'checkpoint' ? reviewWorkerCheckpoint(key) : kind === 'runtime' ? reviewRuntimePath(key) : contextRoot(key);
const claimed = (directory: string, entry: Pick<CleanupEntry, 'kind' | 'relativePath'>) => join(directory, entry.kind === 'context' ? 'context' : `${entry.kind}.json`, entry.relativePath);
const ClaimAuditSchema = Type.Object({ kind: Type.Literal('review-cleanup-claim'), schemaVersion: Type.Literal(1),
 ...Type.Pick(CleanupClaimSchema, ['key', 'claimId', 'runtimeId', 'attempt', 'closedAuditDigest', 'approvalRevision', 'permanent']).properties,
 claimDigest: CleanupClaimSchema.properties.checkpointDigest, runtime: ReviewRuntimeSchema, runtimeDigest: CleanupClaimSchema.properties.checkpointDigest,
}, { additionalProperties: false });
function claimAudit(input: unknown, key: ReviewKey) {
 if (!Value.Check(ClaimAuditSchema, input) || !same(input.key, key)) throw new Error('Unsupported or foreign permanent cleanup audit');
 decodeReviewRuntime(input.runtime, key); return input;
}

/** Revision-less hash receipt in the EXISTING permanent artifact journal.
 * It authorizes no new scope and keeps an edited temp claim from selecting files. */
const closedAuditDigest = (proof: PreparedCleanupAuthorization['proof'], runtime: ReviewRuntime) => preparationDigest({ preparation: proof, runtime });
function closedRuntime(input: unknown, key: ReviewKey, current: PreparedCleanupAuthorization): ReviewRuntime {
 const runtime = decodeReviewRuntime(input, key);
 if (runtime.state !== 'terminal' || runtime.cancellation || runtime.resourceGuard.openLeases.length || runtime.runtimeId !== current.proof.runtime.runtimeId
  || runtime.attempt !== current.proof.runtime.attempt || runtime.checkpointBinding.inputDigest !== current.history.runtime.inputDigest
  || runtime.publicationBoundary?.artifactId !== current.permanent.artifactId) throw new Error('Permanent cleanup runtime audit is not closed or bound');
 return runtime;
}
async function recordClaim(store: ArtifactStore, claim: CleanupClaim, runtime: ReviewRuntime): Promise<void> {
 const data = { kind: 'review-cleanup-claim', schemaVersion: 1, key: claim.key, claimId: claim.claimId, claimDigest: preparationDigest(claim), runtimeId: claim.runtimeId,
  attempt: claim.attempt, closedAuditDigest: claim.closedAuditDigest, approvalRevision: claim.approvalRevision, permanent: claim.permanent,
  runtime, runtimeDigest: claim.deletions.find(e => e.kind === 'runtime')!.contentDigest };
 claimAudit(data, claim.key);
 await store.exclusive(claim.permanent.artifactId, async () => {
  const existing = (await store.history.log(claim.permanent.artifactId)).find(e => e.id === claim.claimId);
  if (existing) { if (!same(existing.outcome?.data, data)) throw new Error('Conflicting permanent cleanup claim'); return; }
  await store.history.appendLog(claim.permanent.artifactId, { id: claim.claimId, actor: { id: 'agent:review-cleanup', kind: 'agent', properties: {} },
   timestamp: new Date().toISOString(), operation: 'request-review', outcome: { result: 'cleanup-claim', summary: `Closed cleanup claim for ${claim.key.family} review ${claim.key.reviewId}`, data } });
 });
}
async function verifyClaim(store: ArtifactStore, claim: CleanupClaim, current: PreparedCleanupAuthorization): Promise<void> {
 if (claim.attempt !== current.proof.runtime.attempt || claim.runtimeId !== current.proof.runtime.runtimeId || claim.approvalRevision !== current.approvalRevision
  || !same(claim.permanent, current.permanent)) throw new Error('Cleanup approval or permanent closed audit changed');
 const data = claimAudit((await store.history.log(claim.permanent.artifactId)).find(e => e.id === claim.claimId)?.outcome?.data, claim.key);
 if (data.claimDigest !== preparationDigest(claim) || data.claimId !== claim.claimId || data.closedAuditDigest !== claim.closedAuditDigest || data.runtimeId !== claim.runtimeId
  || data.attempt !== claim.attempt || data.approvalRevision !== claim.approvalRevision || !same(data.permanent, claim.permanent)) throw new Error('Unrecorded or changed cleanup claim');
 if (claim.closedAuditDigest !== closedAuditDigest(current.proof, closedRuntime(data.runtime, claim.key, current))
  || data.runtimeDigest !== claim.deletions.find(e => e.kind === 'runtime')!.contentDigest) throw new Error('Permanent cleanup runtime audit differs from claimed bytes');
}
const capturedId = (claimId: string) => preparationDigest(['review-cleanup-claimed', claimId]);
async function rootsCaptured(store: ArtifactStore, claim: CleanupClaim, create = false): Promise<boolean> {
 const data = { kind: 'review-cleanup-claimed', schemaVersion: 1, key: claim.key, claimId: claim.claimId, claimDigest: preparationDigest(claim) };
 return store.exclusive(claim.permanent.artifactId, async () => {
  const entry = (await store.history.log(claim.permanent.artifactId)).find(e => e.id === capturedId(claim.claimId));
  if (entry) { if (!same(entry.outcome?.data, data)) throw new Error('Conflicting cleanup capture receipt'); return true; }
  if (!create) return false;
  await store.history.appendLog(claim.permanent.artifactId, { id: capturedId(claim.claimId), actor: { id: 'agent:review-cleanup', kind: 'agent', properties: {} }, timestamp: new Date().toISOString(),
   operation: 'request-review', outcome: { result: 'cleanup-claimed', summary: `Exact roots captured for cleanup ${claim.claimId}`, data } }); return true;
 });
}

/** Extend design's private claim pattern across all three owned locations.
 * Public checkpoint/runtime paths are NEVER unlinked; replacements survive.
 * A durable, permanently bound claim alone permits cleanup-only missing files. */
export async function cleanupPreparedReview(target: ReviewCleanupTarget, key: ReviewKey, deps: PreparedCleanupDeps): Promise<CleanupResult> {
 const id = JSON.stringify(key), previous = lanes.get(id) ?? Promise.resolve();
 const work = previous.catch(() => {}).then(() => executePreparedCleanup(target, key, deps)), tail = work.then(() => {}, () => {});
 lanes.set(id, tail); void tail.then(() => { if (lanes.get(id) === tail) lanes.delete(id); }); return work;
}
async function executePreparedCleanup(target: ReviewCleanupTarget, key: ReviewKey, deps: PreparedCleanupDeps): Promise<CleanupResult> {
 const result: CleanupResult = { deleted: [], retained: [], errors: [] }, directory = preparedCleanupDirectory(key), manifest = join(directory, 'claim.json');
 const authority = async () => { await deps.assertIdle(); return authorizePreparedCleanup(target, key, deps.store); };
 const physical = async <T>(stage: string, path: string, operation: () => Promise<T>): Promise<T> => {
  await deps.boundary?.(`${stage}.before`, path); const value = await operation(); await deps.boundary?.(`${stage}.after`, path); return value;
 };
 const sync = (path: string) => physical('fsync', path, async () => { const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW); try { await file.sync(); } finally { await file.close(); } });
 let claim: CleanupClaim | undefined;
 try {
  const first = await authority();
  const pins = await pinPreparedCleanupAuthority(target, key, deps.store, first);
  await cleanupParents(key.project, ['.insrc', 'tmp', 'review-cleanup', key.family, key.reviewId], true);
  const privateStat = (await cleanupStat(directory))!;
  if ((privateStat.mode & 0o077n) !== 0n || process.getuid && privateStat.uid !== BigInt(process.getuid())) throw new Error('Unsafe private cleanup claim directory');
  let saved = await cleanupStat(manifest);
  if (!saved) {
   const names = await readdir(directory);
   if (names.length) {
    if (names.length !== 1 || !/^claim\.json\.[a-f0-9-]{36}\.tmp$/.test(names[0]!)) throw new Error('Unverifiable private cleanup state has no durable claim');
    const temporary = join(directory, names[0]!), raw = await cleanupBytes(temporary, reviewJsonLimit());
    let candidate: CleanupClaim | undefined;
    try { candidate = decodeCleanupClaim(JSON.parse(raw.bytes.toString('utf8')), key, reviewJsonLimit()); }
    catch (error) {
     const prefix = '{"schemaVersion":1,"key":', text = raw.bytes.toString('utf8');
     if (!(error instanceof SyntaxError) || !prefix.startsWith(text) && !text.startsWith(prefix)) throw error;
     // An interrupted write is not a claim. Preserve its bytes outside the
     // active claim directory, then qualify a NEW claim from the still-present
     // original resources. Never delete or confer authority on the fragment.
     const parts = ['.insrc', 'tmp', 'review-cleanup-orphans', key.family, key.reviewId]; await cleanupParents(key.project, parts, true);
     const quarantine = join(key.project, ...parts), stat = (await cleanupStat(quarantine))!;
     if ((stat.mode & 0o077n) !== 0n || process.getuid && stat.uid !== BigInt(process.getuid())) throw new Error('Unsafe orphan quarantine');
     const destination = join(quarantine, `${names[0]}.${bytesDigest(raw.bytes)}`), existing = await cleanupStat(destination);
     if (existing) {
      const kept = await cleanupBytes(destination, reviewJsonLimit());
      if (kept.stat.dev !== raw.stat.dev || kept.stat.ino !== raw.stat.ino || !kept.bytes.equals(raw.bytes)) throw new Error('Orphan quarantine destination conflicts; retain both files');
     } else await physical('link.orphan', destination, () => link(temporary, destination));
     await sync(destination);
     let parent = quarantine; for (;;) { await sync(parent); if (parent === key.project) break; parent = dirname(parent); }
     await physical('unlink.orphan-fragment', temporary, async () => {
      const current = await cleanupBytes(temporary, reviewJsonLimit());
      if (current.stat.dev !== raw.stat.dev || current.stat.ino !== raw.stat.ino || !current.bytes.equals(raw.bytes)) throw new Error('Orphan fragment changed during quarantine');
      await unlink(temporary);
     });
     await sync(directory); result.retained.push(destination);
    }
    // A hard-killed writer does not run finally. Promote only the complete
    // temp bytes whose exact digest was already recorded in permanent history.
    // link is atomic/no-clobber; a retry can also recover its leftover alias.
    if (candidate) {
     await verifyClaim(deps.store, candidate, first);
     await physical('link.claim', manifest, () => link(temporary, manifest)); await sync(directory);
     saved = await cleanupStat(manifest);
    }
   }
  }
  if (saved) {
   claim = decodeCleanupClaim(JSON.parse((await cleanupBytes(manifest, reviewJsonLimit())).bytes.toString('utf8')), key, reviewJsonLimit());
   await verifyClaim(deps.store, claim, first);
   const claimedFile = (await cleanupBytes(manifest, reviewJsonLimit())).stat;
   for (const name of await readdir(directory)) if (/^claim\.json\.[a-f0-9-]{36}\.tmp$/.test(name)) {
    const temporary = join(directory, name), alias = await cleanupBytes(temporary, reviewJsonLimit());
    if (alias.stat.ino !== claimedFile.ino || alias.stat.dev !== claimedFile.dev || !same(JSON.parse(alias.bytes.toString('utf8')), claim)) throw new Error('Unverified temporary cleanup claim retained');
    await physical('unlink.orphan', temporary, () => unlink(temporary)); await sync(directory);
   }
  } else {
   if ((await readdir(directory)).length) throw new Error('Private cleanup state has no durable claim; retain for inspection');
   const log = await deps.store.history.log(first.permanent.artifactId);
   const receipt = log.some(entry => {
    const raw = entry.outcome?.data as { kind?: unknown; key?: unknown } | undefined;
    if (raw?.kind !== 'review-cleanup-claim' || !same(raw.key, key)) return false;
    const data = claimAudit(raw, key);
    return data.runtimeId === first.proof.runtime.runtimeId && data.attempt === first.proof.runtime.attempt
     && data.closedAuditDigest === closedAuditDigest(first.proof, closedRuntime(data.runtime, key, first)) && data.approvalRevision === first.approvalRevision && same(data.permanent, first.permanent)
     && log.some(captured => captured.id === capturedId(entry.id) && (captured.outcome?.data as { claimDigest?: unknown } | undefined)?.claimDigest === data.claimDigest);
   });
   if (receipt && !await cleanupStat(reviewWorkerCheckpoint(key)) && !await cleanupStat(reviewRuntimePath(key)) && !await cleanupStat(contextRoot(key))) {
    for (const path of pins.files) await sync(path);
    for (const parent of new Set(pins.files.map(dirname))) await sync(parent);
    await physical('rmdir.claim', directory, () => rmdir(directory)); await sync(dirname(directory)); await deps.onDeleted?.(key.reviewId); return result;
   }
   const checkpoint = await cleanupBytes(reviewWorkerCheckpoint(key), reviewJsonLimit());
   const decoded = decodePreparationCheckpoint(JSON.parse(checkpoint.bytes.toString('utf8')), key);
   if (decoded.format !== 'current') throw new Error('Explicit inactive migration is required before prepared cleanup');
   const history = decoded.checkpoint as PreparationHistory, last = history.attempts.at(-1)!;
   const published = 'review-response' in last ? last['review-response'].crPublication === 'complete' : 'publication' in last && last.publication?.state === 'complete';
   if (!published || !history.context || publicationEvidenceDigest(history) !== first.proof.evidenceDigest || history.runtime.runtimeId !== first.proof.runtime.runtimeId) throw new Error('Latest review is unpublished or not completely preserved');
   const runtimeFile = await cleanupBytes(reviewRuntimePath(key), REVIEW_RUNTIME_MAX_BYTES), runtime = decodeReviewRuntime(JSON.parse(runtimeFile.bytes.toString('utf8')), key);
   if (runtime.state !== 'terminal' || runtime.cancellation || runtime.resourceGuard.openLeases.length || runtime.runtimeId !== history.runtime.runtimeId
    || runtime.attempt !== first.proof.runtime.attempt || runtime.checkpointBinding.inputDigest !== history.runtime.inputDigest
    || runtime.checkpointBinding.historyBindingDigest !== history.context?.historyBindingDigest || runtime.publicationBoundary?.artifactId !== first.permanent.artifactId) throw new Error('Current runtime is unresolved or publication is not acknowledged');
   await cleanupParents(key.project, ['.insrc', 'tmp', key.family === 'code' ? 'code-review' : 'design-review'], false);
   await cleanupParents(key.project, ['.insrc', 'tmp', 'review-runtime', key.family], false);
   await cleanupParents(key.project, ['.insrc', 'tmp', 'review-context', key.family, key.reviewId], false);
   const context = await ownedCleanupContext(key, await deps.contexts(), [history.context!.historyBindingDigest, ...first.bindingHeads]);
   claim = decodeCleanupClaim({ schemaVersion: 1, key, attempt: runtime.attempt, claimId: randomUUID(), runtimeId: runtime.runtimeId,
    checkpointDigest: bytesDigest(checkpoint.bytes), checkpointFileIdentity: { dev: String(checkpoint.stat.dev), ino: String(checkpoint.stat.ino) }, closedAuditDigest: closedAuditDigest(first.proof, runtime),
    ...(history.context ? { context: history.context } : {}), approvalRevision: first.approvalRevision, permanent: first.permanent,
    deletions: [...context, { kind: 'runtime', relativePath: '', nodeType: 'file', identity: cleanupIdentity(runtimeFile.stat, 'runtime', ''), contentDigest: bytesDigest(runtimeFile.bytes) },
     { kind: 'checkpoint', relativePath: '', nodeType: 'file', identity: cleanupIdentity(checkpoint.stat, 'checkpoint', ''), contentDigest: bytesDigest(checkpoint.bytes) }],
   }, key, reviewJsonLimit());
   await physical('claim.audit', manifest, () => recordClaim(deps.store, claim!, runtime));
   await pins.acknowledgeJournal();
   // History.appendLog is an append primitive, not an fsync promise. Make the
   // existing permanent history, closed audit and actual approval durable
   // before the private claim can authorize destructive work.
   for (const path of pins.files) await sync(path);
   for (const parent of new Set(pins.files.map(dirname))) await sync(parent);
   // Same definitive/uncertain writer used by semantic history and runtime.
   await writeReviewBytes(manifest, JSON.stringify(claim) + '\n', reviewJsonLimit(), {
    open: async (...args: Parameters<typeof open>) => {
     const file = await open(...args);
     return new Proxy(file, { get(object, name) { if (name === 'sync') return () => physical('fsync', String(args[0]), () => object.sync()); const value: unknown = Reflect.get(object, name, object); return typeof value === 'function' ? value.bind(object) : value; } });
    },
    mkdir,
    rename: (from, to) => physical('rename', String(to), () => rename(from, to)), unlink: path => physical('unlink.tmp', String(path), () => unlink(path)),
   });
  }
  const pinned = claim;
  if (pinned.deletions.find(e => e.kind === 'checkpoint')?.contentDigest !== pinned.checkpointDigest) throw new Error('Cleanup checkpoint digest mismatch');
  // A recovered temp may have been killed BEFORE its file or ancestor fsync.
  // Establish durability now, never infer it from visibility after a crash.
  await sync(manifest); await sync(directory);
  let parent = dirname(directory);
  for (;;) { await sync(parent); if (parent === key.project) break; parent = dirname(parent); }
  const claimStamp = (await cleanupBytes(manifest, reviewJsonLimit())).stat;
  const check = async () => {
   await deps.assertIdle(); await pins.check(); await cleanupParents(key.project, ['.insrc', 'tmp', 'review-cleanup', key.family, key.reviewId], false);
   const stat = await cleanupStat(manifest);
   if (!stat?.isFile() || stat.isSymbolicLink() || stat.ino !== claimStamp.ino || stat.dev !== claimStamp.dev || stat.ctimeNs !== claimStamp.ctimeNs || stat.size !== claimStamp.size) throw new Error('Cleanup claim changed during deletion');
  };
  const parents = (path: string) => cleanupParents(key.project, relative(key.project, dirname(path)).split('/'), false);
  await check();
  const captured = await rootsCaptured(deps.store, pinned);
  // Move complete roots first. If a public replacement races the rename,
  // verification refuses the captured inode and keeps its private evidence.
  for (const kind of ['context', 'runtime', 'checkpoint'] as const) {
   const entry = pinned.deletions.find(e => e.kind === kind && e.relativePath === '');
   if (!entry) { if (kind === 'context') continue; throw new Error('Incomplete cleanup root inventory'); }
   const source = original(key, kind), destination = claimed(directory, entry);
   if (await cleanupStat(destination)) { await verifyCleanupEntry(destination, entry); continue; }
   if (captured) continue; // a captured root may be absent only after deletion
   if (!await cleanupStat(source)) throw new Error('Uncaptured cleanup root is missing; retain remaining evidence');
   await physical('rename', destination, async () => {
    await check(); await parents(source); if (!await verifyCleanupEntry(source, entry)) throw new Error('Cleanup source disappeared before claim');
    await rename(source, destination);
   });
   await sync(directory); await sync(dirname(source));
   try { await verifyCleanupEntry(destination, entry); }
   catch (error) {
    // Preserve design's no-clobber restore for public file replacements.
    if (entry.nodeType === 'file') {
     try { const captured = await cleanupBytes(destination, reviewJsonLimit()); await writeFile(source, captured.bytes, { flag: 'wx', mode: 0o600 }); await sync(dirname(source)); } catch { /* exact private evidence stays retained */ }
    }
    throw error;
   }
  }
  if (!captured) { await physical('claim.roots', manifest, () => rootsCaptured(deps.store, pinned, true)); await pins.acknowledgeJournal(); }
  // Also sync an already-visible capture receipt on explicit retry: a crash
  // may have happened after append but before its durability acknowledgement.
  await sync(pins.journal); await sync(dirname(pins.journal));
  const context = join(directory, 'context');
  if (await cleanupStat(context)) {
   const actual = await inventoryCleanupContext(context), expected = new Map(pinned.deletions.filter(e => e.kind === 'context').map(e => [e.relativePath, e]));
   for (const entry of actual) if (!same(entry, expected.get(entry.relativePath))) throw new Error('Claimed context changed or contains unrelated files; retained');
  }
  // Children before parents, runtime before checkpoint, claim LAST.
  const depth = (entry: CleanupEntry) => entry.relativePath ? entry.relativePath.split('/').length : 0;
  const order = [...pinned.deletions.filter(e => e.kind === 'context')].sort((a,b) => depth(b)-depth(a) || a.relativePath.localeCompare(b.relativePath));
  order.push(...pinned.deletions.filter(e => e.kind === 'runtime'), ...pinned.deletions.filter(e => e.kind === 'checkpoint'));
  for (const entry of order) {
   const path = claimed(directory, entry); if (!await cleanupStat(path)) continue;
   await physical(entry.nodeType === 'file' ? 'unlink' : 'rmdir', path, async () => { await check(); await parents(path); if (!await verifyCleanupEntry(path, entry)) throw new Error('Claimed file disappeared before deletion'); await (entry.nodeType === 'file' ? unlink(path) : rmdir(path)); });
   await sync(dirname(path));
  }
  await check();
  await physical('unlink.claim', manifest, async () => { await check(); const current = await cleanupBytes(manifest, reviewJsonLimit()); if (!same(JSON.parse(current.bytes.toString('utf8')), pinned)) throw new Error('Cleanup claim replaced'); await unlink(manifest); });
  await sync(directory); await physical('rmdir.claim', directory, () => rmdir(directory)); await sync(dirname(directory));
  result.deleted.push(reviewWorkerCheckpoint(key));
  const replacements = [];
  for (const kind of ['context', 'runtime', 'checkpoint'] as const) if (await cleanupStat(original(key, kind))) replacements.push(original(key, kind));
  result.retained.push(...replacements);
  if (!replacements.length) await deps.onDeleted?.(key.reviewId);
 } catch (error) {
  result.retained.push(claim ? directory : reviewWorkerCheckpoint(key));
  result.errors.push(error instanceof Error ? error.message : String(error));
 }
 return result;
}
