/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { isMainThread } from 'node:worker_threads';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual as same } from 'node:util';
import type { ReviewWorkerIdentity } from './review-worker-contract.js';
import { assertReviewIdentity } from './review-worker-contract.js';
import { matchIssuedPreparationAccess } from '../../shared/review-preparation.js';
import type { PreparationAccess } from '../../shared/review-preparation.js';
import { sourceGeneration } from '../../workflow/review/prepared-context.js';
import type { PreparedSourceIdentity, ReadyContextReceipt } from '../../workflow/review/prepared-context.js';

export interface ContextPhaseIdentity extends ReviewWorkerIdentity { readonly attempt: number; readonly phase: 'execution' | 'publication' | 'cleanup'; }
/** Process-local object identity, never a wire credential. */
export interface ContextPhaseOwner { readonly identity: Readonly<ContextPhaseIdentity>; }
interface Owner { handle: ContextPhaseOwner; accesses: Set<string>; closing: boolean; }
interface Generation { receipt: ReadyContextReceipt; borrowers: Set<string>; revoked: boolean; touched: number; }
interface Borrow { owner: Owner; generation: Generation; access: PreparationAccess; }

/** Compact host metadata only. Source graphs and file validation stay in phase
 * workers. Constructor callbacks bind current reservations and actual native
 * disposal; neither is accepted from client/model JSON. */
export class ReviewContextRegistry {
 private readonly owners = new WeakMap<ContextPhaseOwner, Owner>();
 private readonly generations = new Map<string, Generation>();
 private readonly borrows = new Map<string, Borrow>();
 private readonly pending = new Map<string, Promise<void>>();
 private readonly acquiring = new Map<string, number>();
 private acquiringTotal = 0;
 private clock = 0;
 constructor(readonly epoch: string, private readonly assertCurrent: (identity: ContextPhaseIdentity) => Promise<void>, private readonly assertDisposed: (identity: ContextPhaseIdentity) => Promise<void>, private readonly assertCapacity: (receipt: ReadyContextReceipt) => Promise<void>, readonly maxGenerations = 1024) {
  if (!isMainThread || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(epoch) || !Number.isSafeInteger(maxGenerations) || maxGenerations < 1 || maxGenerations > 1024) throw new Error('Invalid main context registry');
 }
 async attach(identity: ContextPhaseIdentity): Promise<ContextPhaseOwner> {
  assertReviewIdentity(identity);
  if (!Number.isSafeInteger(identity.attempt) || identity.attempt < 1 || !['execution', 'publication', 'cleanup'].includes(identity.phase)) throw new Error('Invalid context phase');
  await this.assertCurrent(identity);
  const handle = Object.freeze({ identity: Object.freeze({ ...identity, key: Object.freeze({ ...identity.key }) }) });
  this.owners.set(handle, { handle, accesses: new Set(), closing: false }); return handle;
 }
 private async current(handle: ContextPhaseOwner): Promise<Owner> {
  const owner = this.owners.get(handle); if (!owner || owner.closing) throw new Error('Unregistered/closing private context owner');
  await this.assertCurrent(handle.identity);
  if (this.owners.get(handle) !== owner || owner.closing) throw new Error('Context owner ended'); return owner;
 }
 async qualify(handle: ContextPhaseOwner, expected: PreparedSourceIdentity, receipt: ReadyContextReceipt): Promise<void> {
  const owner = await this.current(handle);
  if (this.owners.get(handle) !== owner || owner.closing) throw new Error('Context owner ended');
  const identity = handle.identity;
  if (!same(expected.key, identity.key) || expected.attempt !== identity.attempt || receipt.identityDigest !== sourceGeneration(expected)
   || !same(receipt.key, expected.key) || receipt.attempt !== expected.attempt || receipt.inputDigest !== expected.inputDigest || receipt.sourceIdentity !== expected.sourceIdentity || receipt.validatorVersion !== expected.validatorVersion
   || !/^[a-f0-9]{64}$/.test(receipt.generationId) || !/^[a-f0-9]{64}$/.test(receipt.manifestDigest) || !Number.isSafeInteger(receipt.storedBytes) || receipt.storedBytes < 1 || !/^[a-f0-9-]{36}$/.test(receipt.capacityToken)) throw new Error('Unbound qualified context receipt');
  await this.assertCapacity(receipt);
  if (await this.current(handle) !== owner || owner.closing) throw new Error('Context owner ended during qualification');
  const previous = this.generations.get(receipt.generationId);
  if (previous) { if (!same(previous.receipt, receipt) || previous.revoked) throw new Error('Conflicting/revoked qualification'); return; }
  if (this.generations.size >= this.maxGenerations) throw new Error('Context receipt capacity exhausted; explicitly evict unborrowed derived data');
  this.generations.set(receipt.generationId, { receipt: structuredClone(receipt), borrowers: new Set(), revoked: false, touched: ++this.clock });
 }
 async borrow(handle: ContextPhaseOwner, expected: PreparedSourceIdentity): Promise<{ access: PreparationAccess; receipt: ReadyContextReceipt }> {
  const owner = await this.current(handle), logical = sourceGeneration(expected);
  if (this.owners.get(handle) !== owner || owner.closing) throw new Error('Context owner ended');
  if (!same(expected.key, handle.identity.key) || expected.attempt !== handle.identity.attempt) throw new Error('Foreign context acquisition');
  const generation = [...this.generations.values()].find(g => !g.revoked && g.receipt.identityDigest === logical);
  if (!generation) throw new Error('Cold qualification required; disk cache grants no authority');
  if (owner.accesses.size >= 128 || this.borrows.size >= 4096) throw new Error('Context borrow capacity exceeded');
  const access: PreparationAccess = { capabilityId: randomUUID(), daemonEpoch: this.epoch, expectedGenerationId: generation.receipt.generationId };
  generation.touched = ++this.clock; generation.borrowers.add(access.capabilityId); owner.accesses.add(access.capabilityId);
  this.borrows.set(access.capabilityId, { owner, generation, access });
  return { access: { ...access }, receipt: structuredClone(generation.receipt) };
 }
 /** dispatchQualification sends work over the registered private worker port;
  * it returns compact metadata, never source graphs or provider work on main. */
 async acquire(handle: ContextPhaseOwner, expected: PreparedSourceIdentity, dispatchQualification: () => Promise<ReadyContextReceipt>): Promise<{ access: PreparationAccess; receipt: ReadyContextReceipt }> {
  await this.current(handle); const logical = sourceGeneration(expected);
  if (!same(expected.key, handle.identity.key) || expected.attempt !== handle.identity.attempt) throw new Error('Foreign context acquisition');
  if (this.acquiringTotal >= 4096) throw new Error('Context acquisition capacity exceeded');
  this.acquiringTotal++; this.acquiring.set(logical, (this.acquiring.get(logical) ?? 0) + 1);
  try {
  if (![...this.generations.values()].some(g => !g.revoked && g.receipt.identityDigest === logical)) {
   let work = this.pending.get(logical);
   if (!work) {
    if (this.pending.size + this.generations.size >= this.maxGenerations) throw new Error('Pending context capacity exhausted');
    const pending = Promise.resolve().then(dispatchQualification).then(receipt => this.qualify(handle, expected, receipt));
    work = pending.finally(() => { if (this.pending.get(logical) === work) this.pending.delete(logical); });
    this.pending.set(logical, work);
   }
   await work;
  }
   return await this.borrow(handle, expected);
  } finally {
   this.acquiringTotal--; const count = this.acquiring.get(logical)! - 1;
   if (count) this.acquiring.set(logical, count); else this.acquiring.delete(logical);
  }
 }
 async resolve(handle: ContextPhaseOwner, input: unknown): Promise<ReadyContextReceipt> {
  const owner = await this.current(handle), id = input && typeof input === 'object' ? Reflect.get(input, 'capabilityId') : undefined;
  const borrow = typeof id === 'string' ? this.borrows.get(id) : undefined;
  if (!borrow || borrow.owner !== owner || borrow.generation.revoked) throw new Error('Unissued or revoked context borrow');
  matchIssuedPreparationAccess(input, borrow.access); return structuredClone(borrow.generation.receipt);
 }
 async invalidate(handle: ContextPhaseOwner, input: PreparationAccess): Promise<void> {
  const owner = await this.current(handle), borrow = this.borrows.get(input.capabilityId);
  if (!borrow || borrow.owner !== owner) throw new Error('Foreign context invalidation');
  matchIssuedPreparationAccess(input, borrow.access); borrow.generation.revoked = true;
 }
 async release(handle: ContextPhaseOwner, input: PreparationAccess): Promise<void> {
  const owner = this.owners.get(handle), borrow = this.borrows.get(input.capabilityId);
  if (!owner || !borrow || borrow.owner !== owner) throw new Error('Foreign context release');
  matchIssuedPreparationAccess(input, borrow.access); await this.assertDisposed(handle.identity);
  borrow.generation.borrowers.delete(input.capabilityId); owner.accesses.delete(input.capabilityId); this.borrows.delete(input.capabilityId);
 }
 async detach(handle: ContextPhaseOwner): Promise<void> {
  const owner = this.owners.get(handle); if (!owner) return;
  owner.closing = true;
  await this.assertDisposed(handle.identity);
  for (const id of [...owner.accesses]) { const b = this.borrows.get(id)!; b.generation.borrowers.delete(id); this.borrows.delete(id); }
  owner.accesses.clear(); this.owners.delete(handle);
 }
 /** Returns a deletion candidate only after all exact native borrowers ended.
  * Actual file/capacity cleanup runs in the existing lifecycle worker. */
 evict(generationId: string): ReadyContextReceipt {
  const generation = this.generations.get(generationId);
  if (!generation || generation.borrowers.size || this.acquiring.has(generation.receipt.identityDigest)) throw new Error('Context generation absent, borrowed or acquisition active');
  this.generations.delete(generationId); return structuredClone(generation.receipt);
 }
 lruCandidates(): readonly string[] { return [...this.generations].filter(([, g]) => !g.borrowers.size && !this.acquiring.has(g.receipt.identityDigest)).sort(([, a], [, b]) => a.touched - b.touched).map(([id]) => id); }
}
