/* Copyright (c) Procix Software India. Licensed under the MIT License. */

import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import type { RunFileGuard } from '../shared/daemon-run-files.js';
import { processIdentityState, requireProcessIdentity, sameProcess } from '../shared/daemon-process.js';
import type { ProcessIdentity } from '../shared/daemon-process.js';
import type { StopTarget } from '../shared/daemon-process-client.js';
import { SourceInstallationStore, SourcePublicationUnknownError } from '../shared/source-installation.js';
import type { SourceExecution, SourceInstallationState, SourceSelection, SourceTransaction } from '../shared/source-installation.js';
import { assertSourceReleaseFloor } from '../shared/managed-source-release.js';
import type { QualifiedReleasePair } from '../shared/source-release-compatibility.js';
import { requireQualifiedReleasePair } from '../shared/source-release-compatibility.js';
import type { StagedReleasePin } from './managed-release-staging.js';
import { verifyStagedReleasePin } from './managed-release-staging.js';

/** A retained original handle plus the launch owner's independent descendant-closure proof. */
export interface SourceActor {
 readonly target: StopTarget;
 /** Must verify all owned descendants, not infer their exit from the daemon PID or socket. */
 childrenClosed(): Promise<void>;
 shutdown(): Promise<void>;
}
export interface SourceUpgrade {
 readonly prior: StagedReleasePin;
 readonly candidate: SourceSelection;
 readonly compatibility: QualifiedReleasePair;
}

/** Platform effects must preserve the supplied run-file lease through the startup grant. */
export interface SourceTransactionHost {
 capture(initial: SourceSelection | null, prior: StagedReleasePin): Promise<SourceActor | null>;
 /** Reacquire only the recorded incarnation; a replacement is a conflict, never a signal target. */
 recover(identity: ProcessIdentity): Promise<SourceActor | null>;
 /** Positive original-identity absence AND descendant closure are required when the handle was lost. */
 proveClosed(identity: ProcessIdentity): Promise<void>;
 /** Called under run-file exclusion after all relevant actors closed, before selecting or opening stores. */
 quiescent(prior: StagedReleasePin, candidate: StagedReleasePin, guard: RunFileGuard): Promise<void>;
 /** Verify qualified writable formats without opening a live store from a client. */
 verifyStores(pair: QualifiedReleasePair, guard: RunFileGuard): Promise<void>;
 /** Persist the returned actor BEFORE granting it permission to open stores or publish run files. */
 start(pin: StagedReleasePin, guard: RunFileGuard, record: (actor: SourceActor) => void): Promise<SourceActor>;
 ready(actor: SourceActor, pin: StagedReleasePin): Promise<void>;
 /** Independently verified owned runtime/binding; editable journal metadata is not authority. */
 verifyRuntime(selection: SourceSelection): Promise<void>;
}

type Outcome = NonNullable<SourceInstallationState['outcome']>;
const message = (error: unknown) => (error instanceof Error ? error.message : String(error)).slice(0, 1800);
const identity = ({ pid, startedAt, commandLine }: ProcessIdentity): ProcessIdentity => ({ pid, startedAt, commandLine });
const terminal = (phase: SourceTransaction['phase']) => phase === 'committed' || phase === 'rolled-back';
function unique<T>(values: readonly T[]): T[] { return [...new Map(values.map(value => [JSON.stringify(value), value])).values()]; }

/** One long-lived mutation lease serializes cooperating update/start/restart and recovery callers. */
export class LinuxSourceTransaction {
 private readonly owner = requireProcessIdentity(process.pid);
 private guard: RunFileGuard | undefined;
 private runFiles: RunFileGuard | undefined;
 private fenced = false;
 private readonly handles = new Set<SourceActor>();
 private original: SourceActor | null = null;
 private candidate: SourceActor | null = null;
 private restored: SourceActor | null = null;

 constructor(readonly store: SourceInstallationStore, private readonly host: SourceTransactionHost) {
  if (process.platform !== 'linux') throw new Error('Source transaction requires Linux; use the macOS installation owner on Darwin');
 }

 /** Caller holds this same lease for ordinary start/restart; an unfinished update forbids either. */
 async exclusive<T>(effect: () => Promise<T>): Promise<T> {
  this.acquire();
  try {
   if (this.store.read().active !== null) throw new Error('Source recovery must finish before another lifecycle operation');
   return await effect();
  } finally { await this.release(); }
 }

 private acquire(): void {
  if (this.guard) throw new Error('Source mutation owner is already in use');
  this.guard = this.store.acquireLifecycleGuard('mutation', this.owner);
  this.guard.assertOwned();
 }
 private async release(): Promise<void> {
  // An uncertain actor/publication retains exclusion; a later controller must reconcile this journal.
  try {
   if (!this.fenced) {
    this.runFiles?.release(); this.runFiles = undefined;
    this.guard?.release(); this.guard = undefined;
   }
  } finally {
   for (const actor of this.handles) await actor.target.handle.close();
   this.handles.clear();
  }
 }
 private publish(change: (state: SourceInstallationState) => SourceInstallationState): SourceInstallationState {
  this.guard?.assertOwned();
  const state = this.store.read();
  try { return this.store.update(state.generation, change); }
  catch (error) {
   if (!(error instanceof SourcePublicationUnknownError)) throw error;
   try {
    const observed = this.store.reconcile(error.publication);
    if (observed.status === 'published') return observed.state;
   } catch (reconcileError) { this.fenced = true; throw reconcileError; }
   // A not-published callback is never replayed. The caller can retry from the confirmed old state.
   throw error;
  }
 }
 private current(id: string): SourceTransaction {
  this.guard!.assertOwned();
  const active = this.store.read().active;
  if (!active || active.id !== id || !sameProcess(active.owner, this.owner)) throw new Error('Source transaction authority changed');
  return active;
 }
 private change(id: string, update: (transaction: SourceTransaction) => SourceTransaction): SourceTransaction {
  this.current(id);
  return this.publish(state => ({ ...state, active: update(state.active!) })).active!;
 }
 private step(id: string, step: SourceExecution['step'], patch: Partial<SourceExecution> = {}): void {
  this.change(id, active => ({ ...active, execution: { ...active.execution!, ...patch, step } }));
 }
 private retain(actor: SourceActor | null): SourceActor | null {
  if (actor) this.handles.add(actor); return actor;
 }
 private async closeActor(actor: SourceActor): Promise<void> {
  if (!await actor.target.handle.hasExited()) await actor.shutdown();
  if (!await actor.target.handle.hasExited()) throw new Error('Original retained process has not exited');
  await actor.childrenClosed();
 }
 private holdRunFiles(): RunFileGuard {
  this.guard!.assertOwned();
  this.runFiles ??= this.store.acquireLifecycleGuard('run-files', this.owner);
  this.runFiles.assertOwned(); return this.runFiles;
 }
 private async verify(active: SourceTransaction): Promise<void> {
  if (!active.prior || !active.candidate) throw new Error('Source release pair is not staged');
  await verifyStagedReleasePin(active.prior);
  await verifyStagedReleasePin(active.candidate.pin);
  if (active.initialSelector) await this.host.verifyRuntime(active.initialSelector);
  await this.host.verifyRuntime(active.candidate);
  this.current(active.id);
 }
 private finish(id: string, decision: Outcome['decision'], detail: string): Outcome {
  const outcome = { id, decision, detail: detail.slice(0, 4096) };
  const phase = decision === 'committed' ? 'committed' : decision === 'rolled-back' ? 'rolled-back' : 'recovery-required';
  this.current(id);
  this.publish(state => ({ ...state, active: { ...state.active!, phase }, outcome }));
  if (decision === 'recovery-required') this.fenced = true;
  else this.publish(state => ({ ...state, active: null }));
  return outcome;
 }

 /** Qualified selected installations use the same durable actor protocol for ordinary lifecycle actions. */
 async lifecycle(operation: 'start' | 'restart' | 'stop'): Promise<Outcome> {
  return this.update(async selected => {
   if (!selected) throw new Error('Legacy lifecycle requires its independently qualified installation owner');
   return { prior: selected.pin, candidate: selected, compatibility: { prior: selected.compatibility, candidate: selected.compatibility } };
  }, operation);
 }

 async update(prepare: (initial: SourceSelection | null) => Promise<SourceUpgrade>, operation: SourceExecution['operation'] = 'update'): Promise<Outcome> {
  this.acquire();
  let id: string | undefined;
  try {
   const initial = this.store.read();
   if (initial.active !== null) throw new Error('Pending source transaction requires recovery before update/start/restart');
   id = randomUUID();
   this.publish(state => ({ ...state, active: { id: id!, phase: 'reserved', owner: this.owner,
    baselineGeneration: state.generation, initialSelector: state.selected, prior: null, candidate: null, wasRunning: false } }));
   let prepared: SourceUpgrade;
   try { prepared = await prepare(initial.selected); }
   catch (error) { return this.finish(id, 'rolled-back', `Preparation failed before incumbent mutation: ${message(error)}`); }
   const { prior, candidate } = prepared;
   if (operation === 'update') requireQualifiedReleasePair(prepared.compatibility.prior, candidate.compatibility, [prepared.compatibility]);
   else if (!initial.selected || !isDeepStrictEqual(initial.selected, candidate)
    || !isDeepStrictEqual(prepared.compatibility.prior, candidate.compatibility)) throw new Error('Ordinary lifecycle requires the unchanged selected release');
   if (prepared.compatibility.prior.releaseId !== prior.commit || candidate.pin.commit !== candidate.compatibility.releaseId
    || (initial.selected && !isDeepStrictEqual(initial.selected.pin, prior))) throw new Error('Prepared source pair differs from the installed predecessor');
   this.original = this.retain(await this.host.capture(initial.selected, prior));
   this.publish(state => {
    if (!isDeepStrictEqual(state.selected, initial.selected)) throw new Error('Source selector changed during preparation');
    const floors = [...state.sourceReleases];
    const index = floors.findIndex(r => r.channel.repoUrl === candidate.source.channel.repoUrl && r.channel.branch === candidate.source.channel.branch);
    if (index >= 0) { assertSourceReleaseFloor(candidate.source, [floors[index]!]); floors[index] = candidate.source; }
    else floors.push(candidate.source);
    return { ...state, sourceReleases: floors, retained: unique([...state.retained, prior]),
     retainedSelections: unique([...state.retainedSelections, ...(initial.selected ? [initial.selected] : []), candidate]),
     active: { ...state.active!, phase: 'staged', prior, candidate, wasRunning: this.original !== null,
      execution: { operation, desiredRunning: operation === 'stop' ? false : operation === 'update' ? this.original !== null : true,
       compatibility: prepared.compatibility, step: 'prepared', original: this.original ? identity(this.original.target) : null, candidate: null, restored: null,
       originalClosed: this.original === null, candidateClosed: true } } };
   });
   await this.verify(this.current(id));
   if (operation === 'start' && this.original) {
    await this.host.ready(this.original, prior);
    return this.finish(id, 'committed', 'Qualified selected daemon already running; no process or selector changed');
   }
   this.step(id, 'stop-original');
   if (this.original) await this.closeActor(this.original);
   this.step(id, 'stop-original', { originalClosed: true });
   this.change(id, active => ({ ...active, phase: 'predecessor-exited' }));
   const guard = this.holdRunFiles();
   await this.host.quiescent(prior, candidate.pin, guard);
   await this.host.verifyStores(prepared.compatibility, guard);
   await this.verify(this.current(id));
   this.step(id, 'select-candidate');
   this.publish(state => ({ ...state, selected: candidate, active: { ...state.active!, phase: 'candidate-selected' } }));
   if (this.current(id).execution!.desiredRunning) await this.start(id, candidate.pin, false);
   this.step(id, 'candidate-ready');
   this.change(id, active => ({ ...active, phase: 'candidate-ready' }));
   await this.verify(this.current(id));
   return this.finish(id, 'committed', 'Qualified candidate selected; original closure and requested readiness verified');
  } catch (error) {
   if (id === undefined || this.fenced) throw error;
   const active = this.current(id);
   if (terminal(active.phase)) { this.fenced = true; throw error; }
   if (!active.execution || !active.prior || !active.candidate) return this.finish(id, 'recovery-required', message(error));
   return await this.rollback(id, message(error));
  } finally { await this.release(); }
 }

 private async start(id: string, pin: StagedReleasePin, prior: boolean): Promise<void> {
  this.step(id, prior ? 'spawn-prior' : 'spawn-candidate', prior ? {} : { candidateClosed: false });
  const guard = this.holdRunFiles();
  let recorded: SourceActor | undefined;
  const actor = await this.host.start(pin, guard, incoming => {
   if (recorded) throw new Error('Source launch recorded more than one actor');
   this.guard!.assertOwned(); guard.assertOwned();
   recorded = incoming; this.retain(incoming);
   if (prior) this.restored = incoming; else this.candidate = incoming;
   this.step(id, prior ? 'spawn-prior' : 'spawn-candidate', prior
    ? { restored: identity(incoming.target) } : { candidate: identity(incoming.target) });
  });
  if (!recorded || !sameProcess(actor.target, recorded.target)) throw new Error('Source launch did not record its actor before granting startup');
  await this.host.ready(actor, pin);
  if (await actor.target.handle.hasExited()) throw new Error('Source actor exited after readiness');
  this.step(id, prior ? 'prior-ready' : 'candidate-ready');
 }

 private async rollback(id: string, detail: string): Promise<Outcome> {
  try {
   const active = this.current(id), execution = active.execution!;
   if (execution.operation === 'start' && execution.step === 'prepared' && this.original) {
    await this.host.ready(this.original, active.prior!);
    return this.finish(id, 'rolled-back', `${detail}; original already-running daemon preserved`);
   }
   if (execution.restored) {
    // Restoration may have completed before the controller could record its final outcome.
    // A verified running prior is the desired result, not a reason to demand empty stores.
    if (!execution.originalClosed || !execution.candidateClosed || !active.wasRunning
     || !isDeepStrictEqual(this.store.read().selected, active.initialSelector)
     || !this.restored || !sameProcess(this.restored.target, execution.restored)) throw new Error('Restored prior ownership is unresolved');
    await this.verify(active);
    let ready = false;
    if (!await this.restored.target.handle.hasExited()) {
     try { await this.host.ready(this.restored, active.prior!); ready = !await this.restored.target.handle.hasExited(); }
     catch { /* Retry only after proving closure of this exact failed restoration. */ }
    }
    if (ready) {
     this.holdRunFiles();
     this.step(id, 'prior-ready');
     return this.finish(id, 'rolled-back', detail);
    }
    await this.closeActor(this.restored);
    this.step(id, 'restore-selector', { restored: null });
    this.restored = null;
   } else if (execution.step === 'spawn-prior') {
    throw new Error('Prior spawn intent has no captured actor; closure must be proved before another start');
   }
   this.change(id, transaction => ({ ...transaction, phase: 'rollback-required' }));
   if (!execution.originalClosed) {
    // A failed stop never grants permission to replace/restart the original daemon.
    if (!this.original || !execution.original || !sameProcess(this.original.target, execution.original)) throw new Error('Original closure is unproved');
    await this.closeActor(this.original);
    this.step(id, 'stop-original', { originalClosed: true });
   }
   const current = this.current(id).execution!;
   if (!current.candidateClosed) {
    if (!this.candidate || !current.candidate || !sameProcess(this.candidate.target, current.candidate)) throw new Error('Candidate spawn/descendant closure is unresolved');
    this.step(id, 'stop-candidate');
    await this.closeActor(this.candidate);
    this.step(id, 'stop-candidate', { candidateClosed: true });
   }
   const guard = this.holdRunFiles();
   await this.host.quiescent(active.prior!, active.candidate!.pin, guard);
   await this.verify(this.current(id));
   await this.host.verifyStores(execution.compatibility, guard);
   this.step(id, 'restore-selector');
   this.publish(state => ({ ...state, selected: state.active!.initialSelector }));
   if (active.wasRunning) await this.start(id, active.prior!, true);
   return this.finish(id, 'rolled-back', detail);
  } catch (error) { return this.finish(id, 'recovery-required', `${detail}. Restoration withheld: ${message(error)}`); }
 }

 /** Committed outcomes are final; all uncommitted cutovers reconcile toward their exact predecessor. */
 async recover(): Promise<Outcome | null> {
  this.acquire();
  try {
   const state = this.store.read(), active = state.active;
   if (!active) return state.outcome;
   if (sameProcess(active.owner, this.owner)) throw new Error('Original source controller is still the recorded owner');
   if (processIdentityState(active.owner) === 'same') throw new Error('Source controller is still alive; recovery cannot steal its reservation');
   this.publish(s => ({ ...s, active: { ...s.active!, owner: this.owner } }));
   const current = this.current(active.id);
   if (terminal(current.phase)) {
    const expected = current.phase === 'committed' ? current.candidate : current.initialSelector;
    if (!isDeepStrictEqual(state.selected, expected)) throw new Error('Terminal source selector differs from its decision');
    if (current.prior && current.candidate) await this.verify(current);
    this.holdRunFiles(); // Retire only this dead controller's stale publication guard, never its running daemon.
    if (state.outcome?.id === current.id && state.outcome.decision !== current.phase) throw new Error('Terminal source outcome conflicts with its decision');
    return this.finish(current.id, current.phase as 'committed' | 'rolled-back',
     state.outcome?.id === current.id ? state.outcome.detail : 'Reconciled terminal source decision after controller exit');
   }
   if (current.phase === 'reserved' && !current.execution) return this.finish(current.id, 'rolled-back', 'Preparation owner exited before cutover');
   if (!current.execution || !current.prior || !current.candidate) return this.finish(current.id, 'recovery-required', 'Historical transaction has no actionable execution evidence');
   try {
    const e = current.execution;
    if (e.original && !e.originalClosed) {
     this.original = this.retain(await this.host.recover(e.original));
     if (!this.original) { await this.host.proveClosed(e.original); this.step(current.id, e.step, { originalClosed: true }); }
    }
    if (e.candidate && !e.candidateClosed) {
     this.candidate = this.retain(await this.host.recover(e.candidate));
     if (!this.candidate) { await this.host.proveClosed(e.candidate); this.step(current.id, e.step, { candidateClosed: true }); }
    }
    if (e.restored) {
     this.restored = this.retain(await this.host.recover(e.restored));
     if (!this.restored) {
      await this.host.proveClosed(e.restored);
      this.step(current.id, 'restore-selector', { restored: null });
     }
    }
    return await this.rollback(current.id, 'Recovered interrupted source cutover');
   } catch (error) { return this.finish(current.id, 'recovery-required', message(error)); }
  } finally { await this.release(); }
 }
}
