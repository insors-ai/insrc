/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { isDeepStrictEqual as same } from 'node:util';
import type { ReviewKey } from '../../shared/review-resources.js';
import { reviewWorkerCheckpoint } from '../../daemon/threads/review-worker-contract.js';
import { decodePreparationCheckpoint, loadPreparationCheckpointSnapshot, preparationCheckpointStamp } from './preparation-checkpoint.js';
import type { PreparationHistory } from './history-binding.js';
import { preparationHistorySnapshot } from './history-binding.js';
import type { PreparationPersistence } from './preparation-persistence.js';
import { Value } from '@sinclair/typebox/value';
import { PreparationObservationSchema, PREPARATION_OBSERVATION_MAX_BYTES } from './preparation-observation.js';
import type { PreparationObservation } from './preparation-observation.js';
import { preparationSemanticHistory } from './preparation-semantic-history.js';
import type { SemanticPreparationHistory } from './preparation-semantic-history.js';
export { preparationSemanticHistory } from './preparation-semantic-history.js';

export interface PreparationHistoryStoreDeps {
 /** Admission or accepted semantic boundary; resolves only after actual
  * history durability and, once qualified, main runtime acknowledgment. */
 commit(next: PreparationHistory, previous: PreparationHistory | undefined): Promise<PreparationHistory>;
 /** Hot state goes to compact runtime/main progress, never full history. */
 observe(update: PreparationObservation): Promise<void>;
}
/** Supplied only in private bootstrap data by main after archiving the exact
 * inactive predecessor. It is not a public review packet field. */
export interface PreparationHistoryHandoff {
 readonly checkpointDigest: string;
 readonly previousRuntime: PreparationHistory['runtime'];
 readonly resetContext: boolean;
}
/** One dedicated worker owns this complete canonical history cache. Reads
 * check file identity without decoding every packet again. No public caller
 * can supply the commit/observation authorities. */
export class PreparationHistoryStore implements PreparationPersistence {
 readonly path: string;
 private value: PreparationHistory | undefined;
 private fileStamp: string | undefined;
 private fenced = false;
 private tail: Promise<void> = Promise.resolve();
 private needsRebind = false;
 private resetContext = false;
 private constructor(private readonly key: ReviewKey, private readonly runtime: { runtimeId: string; inputDigest: string }, private readonly deps: PreparationHistoryStoreDeps) {
  this.path = reviewWorkerCheckpoint(key);
 }
 static async open(key: ReviewKey, runtime: { runtimeId: string; inputDigest: string }, deps: PreparationHistoryStoreDeps, handoff?: PreparationHistoryHandoff): Promise<PreparationHistoryStore> {
  const owner = new PreparationHistoryStore(key, structuredClone(runtime), deps), before = await preparationCheckpointStamp(key);
  const snapshot = await loadPreparationCheckpointSnapshot(key), loaded = snapshot?.value;
  if (before !== snapshot?.stamp || before !== await preparationCheckpointStamp(key)) throw new Error('Preparation history changed while opening');
  if (loaded) {
   if (loaded.format !== 'current') throw new Error('Inactive historical history requires explicit migration');
   if (!same(loaded.checkpoint.runtime, runtime)) {
    if (!handoff || snapshot?.digest !== handoff.checkpointDigest || !same(loaded.checkpoint.runtime, handoff.previousRuntime)) throw new Error('Preparation runtime binding mismatch');
    owner.needsRebind = true; owner.resetContext = handoff.resetContext;
   }
   owner.value = structuredClone(loaded.checkpoint);
  }
  owner.fileStamp = snapshot?.stamp; return owner;
 }
 private async assertCurrent(): Promise<void> {
  try {
   if (this.fenced || await preparationCheckpointStamp(this.key) !== this.fileStamp) throw new Error('Preparation history owner fenced by external replacement');
  } catch (error) { this.fenced = true; throw error; }
 }
 async read(): Promise<SemanticPreparationHistory | undefined> {
  await this.tail; await this.assertCurrent();
  return this.value && preparationSemanticHistory(this.value);
 }
 async canonical(): Promise<PreparationHistory | undefined> {
  await this.tail; await this.assertCurrent(); return this.value && structuredClone(this.value);
 }
 private observation(): PreparationObservation | undefined {
  const last = this.value?.attempts.at(-1); if (!last) return undefined;
  if ('header' in last) return last.progress ? { family: 'code', attempt: last.header.attempt, progress: structuredClone(last.progress),
   activeTaskId: 'activeTaskId' in last.header ? last.header.activeTaskId ?? null : null } : undefined;
  return { family: 'design', attempt: last.number, progress: structuredClone(last.progress), current: 'current' in last ? structuredClone(last.current ?? null) : null };
 }
 /** Explicit hot-state path: validates/clones only a bounded observation and
  * checks file identity. It never decodes, snapshots or copies full history. */
 observe(update: PreparationObservation): Promise<void> {
  const bytes = JSON.stringify(update);
  if (Buffer.byteLength(bytes) > PREPARATION_OBSERVATION_MAX_BYTES || !Value.Check(PreparationObservationSchema, update)) return Promise.reject(new Error('Invalid preparation observation'));
  const value = structuredClone(update);
  const work = this.tail.then(async () => {
   await this.assertCurrent();
   if (this.needsRebind) throw new Error('Preparation checkpoint handoff is not committed');
   const last = this.value?.attempts.at(-1);
   if (!last || value.family !== this.key.family || value.attempt !== ('header' in last ? last.header.attempt : last.number)) throw new Error('Foreign preparation observation');
   if (value.progress.sequence < (last.progress?.sequence ?? 0)) throw new Error('Stale preparation observation');
   if (value.family === 'code' && 'header' in last) {
    const completed = 'review-response' in last ? last['review-response'].tasks.length : 0;
    if (value.progress.completedTasks !== completed) throw new Error('Observation cannot authorize completed code work');
    if (value.activeTaskId !== null && (!('selectedTaskIds' in last.header) || !last.header.selectedTaskIds.includes(value.activeTaskId))) throw new Error('Observation names an unselected task');
    await this.deps.observe(value);
    last.progress = value.progress;
    if ('selectedTaskIds' in last.header) {
     if (value.activeTaskId === null) delete last.header.activeTaskId; else last.header.activeTaskId = value.activeTaskId;
    }
   } else if (value.family === 'design' && !('header' in last)) {
    if (value.progress.completedChunks !== ('completedChunks' in last ? last.completedChunks.length : 0)
     || ('status' in value.progress) !== ('baseline' in last)
     || 'status' in value.progress && value.progress.status !== last.status) throw new Error('Observation cannot authorize completed design work');
    const previous = 'current' in last ? last.current : undefined;
    const { sequence: _oldSequence, ...oldIdentity } = previous ?? {} as { sequence?: number };
    const { sequence: _newSequence, ...newIdentity } = value.current ?? {} as { sequence?: number };
    if (!same(oldIdentity, newIdentity) || Boolean(previous) !== Boolean(value.current) || previous && value.current && value.current.sequence < previous.sequence) throw new Error('Observation cannot replace execution ownership');
    await this.deps.observe(value);
    if ('baseline' in last && 'status' in value.progress) { last.progress = value.progress; if (value.current) last.current = value.current; }
    else if (!('baseline' in last) && !('status' in value.progress)) last.progress = value.progress;
   } else throw new Error('Foreign preparation observation family');
  }).catch(error => { this.fenced = true; throw error; });
  this.tail = work.then(() => {}, () => {}); return work;
 }
 /** Explicit phase requalification of unchanged semantic history (for a
  * cold publication/recovery). The owner adopts only its own verified commit. */
 qualify():Promise<void>{
  const work=this.tail.then(async()=>{
   await this.assertCurrent();if(!this.value||this.needsRebind)throw new Error('Committed preparation handoff required');
   const before=structuredClone(this.value),committed=await this.deps.commit(structuredClone(before),before);
   if(!same(committed.runtime,this.runtime)||!same(preparationHistorySnapshot(committed),preparationHistorySnapshot(before)))throw new Error('Requalification changed accepted history');
   const snapshot=await loadPreparationCheckpointSnapshot(this.key);
   if(snapshot?.value.format!=='current'||!same(snapshot.value.checkpoint,committed))throw new Error('Requalification lacks a durable boundary');
   this.value=structuredClone(committed);this.fileStamp=snapshot.stamp;
  }).catch(error=>{this.fenced=true;throw error;});
  this.tail=work.then(()=>{},()=>{});return work;
 }
 write(input: unknown): Promise<void> {
  const submitted = structuredClone(input);
  const work = this.tail.then(async () => {
   await this.assertCurrent();
   const decoded = decodePreparationCheckpoint(submitted, this.key);
   if (decoded.format !== 'historical') throw new Error('Family writers must submit semantic history, not operational authority');
   const history = decoded.checkpoint;
   if (history.attempts.some(a => 'resourceGuard' in a && a.resourceGuard)) throw new Error('Embedded native guard writer is forbidden');
   const next = { ...history, schemaVersion: 3, runtime: this.runtime,
    ...(this.value?.context && !this.resetContext ? { context: this.value.context } : {}),
    ...(this.value?.migration ? { migration: this.value.migration } : {}),
   } as PreparationHistory;
   const checked = decodePreparationCheckpoint(next, this.key);
   if (checked.format !== 'current') throw new Error('Expected canonical preparation history');
   const before = this.value;
   if (!before || this.needsRebind || !same(preparationHistorySnapshot(before), preparationHistorySnapshot(next))) {
    const committed = await this.deps.commit(structuredClone(next), before && structuredClone(before));
    if (!same(committed.runtime, this.runtime) || !same(preparationHistorySnapshot(committed), preparationHistorySnapshot(next))) throw new Error('Committed preparation history differs from submitted evidence');
    const snapshot = await loadPreparationCheckpointSnapshot(this.key), durable = snapshot?.value;
    if (durable?.format !== 'current' || !same(durable.checkpoint, committed)) throw new Error('Preparation history lacks a durable committed boundary');
    this.value = structuredClone(committed); this.fileStamp = snapshot!.stamp;
    this.needsRebind = false; this.resetContext = false;
   }
   // Current execution ownership/sequence is transient; semantic dispatch and
   // retry counters remain in the full record and take the branch above.
   this.value = { ...this.value!, attempts: next.attempts } as PreparationHistory;
   const update = this.observation();
   if (update) await this.deps.observe(update);
  }).catch(error => { this.fenced = true; throw error; });
  this.tail = work.then(() => {}, () => {}); return work;
 }
}
