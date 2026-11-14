/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { join } from 'node:path';
import { isDeepStrictEqual as same } from 'node:util';
import { decodeHistoryBinding, decodePreparedContextManifest } from '../../shared/review-preparation.js';
import type { ReviewKey } from '../../shared/review-resources.js';
import { reviewJsonLimit } from '../../config/review.js';
import { contextRoot, preparationDigest } from './prepared-context.js';
import type { ReadyContextReceipt } from './prepared-context.js';
import { readHistoryEvidenceManifest } from './history-evidence.js';
import { cleanupBytes, cleanupStat, bytesDigest, inventoryCleanupContext } from './cleanup-claim-files.js';

/** Cleanup ownership is narrower than a borrow: it grants no execution or
 * capacity capability, and can include an already-evicted old generation. */
export type CleanupContextOwner = Pick<ReadyContextReceipt, 'key' | 'attempt' | 'generationId' | 'manifestDigest'>;

/** The main owner supplies retained qualification receipts over a PRIVATE
 * dependency. Neither a directory name nor a self-declared disk manifest owns
 * files. Unknown objects, staging trees and user files retain the whole scope. */
export async function ownedCleanupContext(key: ReviewKey, receipts: readonly CleanupContextOwner[], heads: readonly string[]) {
 if (!receipts.length || receipts.length > 1024) throw new Error('Private context ownership is required for cleanup');
 const root = contextRoot(key), owners = new Map<string, CleanupContextOwner>(), allowed = new Map<string, string | null>([['', null]]), baseContents = new Map<string, Set<string>>();
 const allow = (path: string, digest: string | null) => {
  const prior = allowed.get(path); if (allowed.has(path) && prior !== digest) throw new Error('Conflicting owned context bytes'); allowed.set(path, digest);
 };
 for (const source of receipts) {
  if (!same(source.key, key) || !Number.isSafeInteger(source.attempt) || source.attempt < 1 || !/^[a-f0-9]{64}$/.test(source.generationId)
   || !/^[a-f0-9]{64}$/.test(source.manifestDigest) || owners.has(source.generationId)) throw new Error('Foreign or duplicate private context owner');
  owners.set(source.generationId, source);
  if (!await cleanupStat(join(root, source.generationId))) continue;
  const raw = await cleanupBytes(join(root, source.generationId, 'manifest.json'), reviewJsonLimit()), manifest = decodePreparedContextManifest(JSON.parse(raw.bytes.toString('utf8')), key, reviewJsonLimit());
  if (manifest.manifestDigest !== source.manifestDigest || manifest.manifestDigest !== preparationDigest({ ...manifest, manifestDigest: '' }) || manifest.generationId !== source.generationId
   || manifest.attempt !== source.attempt || manifest.validatorVersion !== 1) throw new Error('Context manifest differs from private ownership receipt');
  allow(source.generationId, null); allow(`${source.generationId}/manifest.json`, bytesDigest(raw.bytes));
  const contents = new Set<string>(); baseContents.set(source.generationId, contents);
  for (const object of manifest.objects) { allow(`${source.generationId}/${object.contentDigest}.data`, object.contentDigest); contents.add(object.contentDigest); }
 }
 const bindings = [...heads], seen = new Set<string>(), evidence = new Set<string>();
 while (bindings.length) {
  const id = bindings.pop()!; if (seen.has(id)) continue;
  if (!/^[a-f0-9]{64}$/.test(id) || seen.size >= 10000) throw new Error('Invalid cleanup history ownership lineage'); seen.add(id);
  const raw = await cleanupBytes(join(root, 'history-bindings', `${id}.json`), reviewJsonLimit()), binding = decodeHistoryBinding(JSON.parse(raw.bytes.toString('utf8')), key, reviewJsonLimit());
  const owner = owners.get(binding.generationId);
  if (!owner || binding.attempt !== owner.attempt || binding.bindingDigest !== id || preparationDigest({ ...binding, bindingDigest: '' }) !== id) throw new Error('History binding has no private context owner');
  allow('history-bindings', null); allow(`history-bindings/${id}.json`, bytesDigest(raw.bytes));
  if (binding.priorBindingDigest) bindings.push(binding.priorBindingDigest);
  let head = binding.evidenceManifestDigest; const chain = new Set<string>();
  while (head !== owner.manifestDigest && !evidence.has(`${owner.generationId}:${head}`)) {
   if (chain.has(head) || evidence.size + chain.size >= 10000) throw new Error('Cleanup evidence ownership exceeds bound or cycles'); chain.add(head);
   const { manifest, rawDigest } = await readHistoryEvidenceManifest(owner, head);
   allow('history-evidence', null); allow(`history-evidence/${head}.json`, rawDigest);
   for (const object of manifest.objects) if (!baseContents.get(owner.generationId)?.has(object.contentDigest)) allow(`history-evidence/${object.contentDigest}.data`, object.contentDigest);
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
