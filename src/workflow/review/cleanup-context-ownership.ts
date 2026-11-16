/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { join } from 'node:path';
import { isDeepStrictEqual as same } from 'node:util';
import { decodeHistoryBinding, decodePreparedContextManifest, decodeStagedContextManifest } from '../../shared/review-preparation.js';
import type { PreparedContextManifest, StagedContextManifest } from '../../shared/review-preparation.js';
import type { ReviewKey } from '../../shared/review-resources.js';
import { reviewJsonLimit } from '../../config/review.js';
import { contextRoot, preparationDigest } from './prepared-context.js';
import type { ReadyContextReceipt } from './prepared-context.js';
import { readHistoryEvidenceManifest } from './history-evidence.js';
import { cleanupBytes, cleanupStat, bytesDigest, inventoryCleanupContext } from './cleanup-claim-files.js';

/** Cleanup ownership is narrower than a borrow: it grants no execution or
 * capacity capability, and can include an already-evicted old generation. */
export type CleanupContextOwner = Pick<ReadyContextReceipt, 'key' | 'attempt' | 'generationId' | 'manifestDigest' | 'validatorVersion'>;

function contextManifest(input: unknown, key: ReviewKey): PreparedContextManifest | StagedContextManifest {
 const value = input as { schemaVersion?: unknown; encoding?: unknown };
 return value?.schemaVersion === 2 && value.encoding === 'staged-values-v2'
  ? decodeStagedContextManifest(input, key, reviewJsonLimit())
  : decodePreparedContextManifest(input, key, reviewJsonLimit());
}

/** The main owner supplies retained qualification receipts over a PRIVATE
 * dependency. Neither a directory name nor a self-declared disk manifest owns
 * files. Unknown objects, staging trees and user files retain the whole scope. */
export async function ownedCleanupContext(key: ReviewKey, receipts: readonly CleanupContextOwner[], heads: readonly string[]) {
 if (!receipts.length || receipts.length > 1024) throw new Error('Private context ownership is required for cleanup');
 const root = contextRoot(key), owners = new Map<string, CleanupContextOwner>(), allowed = new Map<string, string | null>([['', null]]);
 const allow = (path: string, digest: string | null) => {
  const prior = allowed.get(path); if (allowed.has(path) && prior !== digest) throw new Error('Conflicting owned context bytes'); allowed.set(path, digest);
 };
 const allowLifecycle = async (binding: ReturnType<typeof decodeHistoryBinding>) => {
  const lifecycle = binding.lifecycle; if (!lifecycle) throw new Error('History binding has no staged lifecycle owner');
  const raw = await cleanupBytes(join(root, lifecycle.generationId, 'manifest.json'), reviewJsonLimit()), manifest = contextManifest(JSON.parse(raw.bytes.toString('utf8')), key);
  if (manifest.generationId !== lifecycle.generationId || manifest.attempt !== binding.attempt || manifest.manifestDigest !== lifecycle.manifestDigest
   || manifest.identityDigest !== lifecycle.identityDigest || manifest.inputDigest !== lifecycle.inputDigest || manifest.sourceIdentity !== lifecycle.sourceIdentity
   || manifest.validatorVersion !== lifecycle.validatorVersion || manifest.byteTotals.stored + raw.bytes.length !== lifecycle.storedBytes
   || manifest.manifestDigest !== preparationDigest({ ...manifest, manifestDigest: '' })) throw new Error('Staged lifecycle manifest differs from history binding');
  allow(lifecycle.generationId, null); allow(`${lifecycle.generationId}/manifest.json`, bytesDigest(raw.bytes));
  for (const object of manifest.objects) allow(`${lifecycle.generationId}/${object.contentDigest}.data`, object.contentDigest);
 };
 for (const source of receipts) {
  if (!same(source.key, key) || !Number.isSafeInteger(source.attempt) || source.attempt < 1 || !/^[a-f0-9]{64}$/.test(source.generationId)
   || !/^[a-f0-9]{64}$/.test(source.manifestDigest) || owners.has(source.generationId)) throw new Error('Foreign or duplicate private context owner');
  owners.set(source.generationId, source);
  if (!await cleanupStat(join(root, source.generationId))) continue;
  const raw = await cleanupBytes(join(root, source.generationId, 'manifest.json'), reviewJsonLimit()), manifest = contextManifest(JSON.parse(raw.bytes.toString('utf8')), key);
  if (manifest.manifestDigest !== source.manifestDigest || manifest.manifestDigest !== preparationDigest({ ...manifest, manifestDigest: '' }) || manifest.generationId !== source.generationId
   || manifest.attempt !== source.attempt || manifest.validatorVersion !== source.validatorVersion) throw new Error('Context manifest differs from private ownership receipt');
  allow(source.generationId, null); allow(`${source.generationId}/manifest.json`, bytesDigest(raw.bytes));
  for (const object of manifest.objects) allow(`${source.generationId}/${object.contentDigest}.data`, object.contentDigest);
 }
 const bindings = [...heads], seen = new Set<string>(), evidence = new Set<string>();
 while (bindings.length) {
  const id = bindings.pop()!; if (seen.has(id)) continue;
  if (!/^[a-f0-9]{64}$/.test(id) || seen.size >= 10000) throw new Error('Invalid cleanup history ownership lineage'); seen.add(id);
  const raw = await cleanupBytes(join(root, 'history-bindings', `${id}.json`), reviewJsonLimit()), binding = decodeHistoryBinding(JSON.parse(raw.bytes.toString('utf8')), key, reviewJsonLimit());
  const owner = owners.get(binding.generationId);
  if (!owner || binding.attempt !== owner.attempt || binding.bindingDigest !== id || preparationDigest({ ...binding, bindingDigest: '' }) !== id) throw new Error('History binding has no private context owner');
  allow('history-bindings', null); allow(`history-bindings/${id}.json`, bytesDigest(raw.bytes));
  await allowLifecycle(binding);
  if (binding.priorBindingDigest) bindings.push(binding.priorBindingDigest);
  let head = binding.evidenceManifestDigest; const chain = new Set<string>();
  while (head !== owner.manifestDigest && !evidence.has(`${owner.generationId}:${head}`)) {
   if (chain.has(head) || evidence.size + chain.size >= 10000) throw new Error('Cleanup evidence ownership exceeds bound or cycles'); chain.add(head);
   const { manifest, rawDigest } = await readHistoryEvidenceManifest(owner, head);
   allow('history-evidence', null); allow(`history-evidence/${head}.json`, rawDigest);
   // A staged source can contain the same payload as a later history delta
   // under a different descriptor graph. If the delta file was durably
   // written, its authenticated manifest owns that exact duplicate too.
   for (const object of manifest.objects) allow(`history-evidence/${object.contentDigest}.data`, object.contentDigest);
   head = manifest.previousDigest;
  }
  for (const id of chain) evidence.add(`${owner.generationId}:${id}`);
 }
 const inventory = await inventoryCleanupContext(root);
 for (const entry of inventory) {
  if (!allowed.has(entry.relativePath) || (entry.nodeType === 'directory' ? allowed.get(entry.relativePath) !== null : allowed.get(entry.relativePath) !== entry.contentDigest)) throw new Error(`Unowned or changed context entry retained: ${entry.relativePath}`);
 }
 const present = new Set(inventory.map(e => e.relativePath));
 for (const path of allowed.keys()) if (!present.has(path)) throw new Error(`Owned context entry is missing: ${path}`);
 return inventory;
}

/** Cold cleanup grants deletion only. Every descriptor is authenticated by a
 * permanent publication binding, including its immutable predecessor chain;
 * directory names and self-signed manifests alone never grant ownership. */
export async function permanentCleanupContexts(key: ReviewKey, heads: readonly string[]): Promise<readonly CleanupContextOwner[]> {
 const owners = new Map<string, CleanupContextOwner>(), pending = [...heads], seen = new Set<string>(), root = contextRoot(key);
 while (pending.length) {
  const id = pending.pop()!; if (seen.has(id)) continue;
  if (!/^[a-f0-9]{64}$/.test(id) || seen.size >= 10000) throw new Error('Invalid permanent cleanup lineage'); seen.add(id);
  const raw = await cleanupBytes(join(root, 'history-bindings', `${id}.json`), reviewJsonLimit());
  const binding = decodeHistoryBinding(JSON.parse(raw.bytes.toString('utf8')), key, reviewJsonLimit());
  if (binding.bindingDigest !== id || preparationDigest({ ...binding, bindingDigest: '' }) !== id) throw new Error('Permanent cleanup binding changed');
  if (binding.priorBindingDigest) pending.push(binding.priorBindingDigest);
  const bytes = await cleanupBytes(join(root, binding.generationId, 'manifest.json'), reviewJsonLimit());
  const manifest = contextManifest(JSON.parse(bytes.bytes.toString('utf8')), key);
  if (manifest.generationId !== binding.generationId || manifest.attempt !== binding.attempt || manifest.manifestDigest !== preparationDigest({ ...manifest, manifestDigest: '' })) throw new Error('Permanent cleanup source manifest changed');
  const owner: CleanupContextOwner = { key, attempt: binding.attempt, generationId: binding.generationId, manifestDigest: manifest.manifestDigest, validatorVersion: manifest.validatorVersion };
  if (binding.lifecycle) {
   const lifecycleBytes = await cleanupBytes(join(root, binding.lifecycle.generationId, 'manifest.json'), reviewJsonLimit());
   const lifecycleManifest = contextManifest(JSON.parse(lifecycleBytes.bytes.toString('utf8')), key);
   if (lifecycleManifest.generationId !== binding.lifecycle.generationId || lifecycleManifest.attempt !== binding.attempt
    || lifecycleManifest.manifestDigest !== binding.lifecycle.manifestDigest || lifecycleManifest.identityDigest !== binding.lifecycle.identityDigest
    || lifecycleManifest.inputDigest !== binding.lifecycle.inputDigest || lifecycleManifest.sourceIdentity !== binding.lifecycle.sourceIdentity
    || lifecycleManifest.validatorVersion !== binding.lifecycle.validatorVersion || lifecycleManifest.byteTotals.stored + lifecycleBytes.bytes.length !== binding.lifecycle.storedBytes
    || lifecycleManifest.manifestDigest !== preparationDigest({ ...lifecycleManifest, manifestDigest: '' })) throw new Error('Permanent staged lifecycle manifest changed');
   // The immutable history binding owns this lifecycle generation. It is
   // authenticated above and followed again by ownedCleanupContext; it is not
   // a source-capability receipt and must not enter the v1 source-owner set.
  }
  let evidence = binding.evidenceManifestDigest; const chain = new Set<string>();
  while (evidence !== owner.manifestDigest) {
   if (chain.has(evidence) || chain.size >= 10000) throw new Error('Invalid permanent cleanup evidence lineage'); chain.add(evidence);
   const { manifest: delta } = await readHistoryEvidenceManifest(owner, evidence); evidence = delta.previousDigest;
  }
  const previous = owners.get(owner.generationId);
  if (previous && !same(previous, owner)) throw new Error('Conflicting permanent cleanup ownership'); owners.set(owner.generationId, owner);
 }
 return [...owners.values()];
}
