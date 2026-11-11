/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { createHash, randomUUID } from 'node:crypto';
import { isAbsolute, join, resolve } from 'node:path';
import { Value } from '@sinclair/typebox/value';
import { reviewJsonLimit } from '../../config/review.js';
import { MAX_REVIEW_OPEN_LEASES, ReviewKeySchema } from '../../shared/review-resources.js';
import type { ReviewKey } from '../../shared/review-resources.js';
import { killProcessGroup } from '../../shared/process-group.js';
import type { ProcessDisposal } from '../../shared/process-group.js';
import { spawnManaged } from '../tools/shell-helper.js';
import type { ManagedProcess } from '../tools/shell-helper.js';
import { runWithoutToolSignal } from '../tools/tool-signal.js';
import { withoutReviewNativeTransport } from '../../shared/review-process-bridge.js';

import type { ReviewNativeCommand, ReviewProcessOwner, ReviewProcessReservation, ReviewIntentReceipt, ReviewProcessOutput, ReviewProcessOutcome, ReviewProcessRun } from '../../shared/review-native.js';
export type { ReviewNativeCommand, ReviewProcessOwner, ReviewProcessReservation, ReviewIntentReceipt, ReviewProcessOutput, ReviewProcessOutcome, ReviewProcessRun } from '../../shared/review-native.js';
export interface ReviewProcessDeps {
 /** Required host permission/provenance check, not a worker assertion. */
 readonly authorize: (reservation: ReviewProcessReservation, command: ReviewNativeCommand, signal: AbortSignal) => Promise<void> | void;
 /** Required host verification of the serialized family's durable save. */
 readonly verifyIntent: (reservation: ReviewProcessReservation, receipt: ReviewIntentReceipt, signal: AbortSignal) => Promise<void> | void;
 readonly launch?: ((command: ReviewNativeCommand, signal: AbortSignal) => ManagedProcess) | undefined;
 readonly daemonInstance?: string | undefined;
}
type Lease = {
 readonly reservation: ReviewProcessReservation; command?: ReviewNativeCommand | undefined;
 readonly abort: AbortController; readonly run: ReviewProcessRun;
 readonly started: (value: { spawned: boolean; pid?: number | undefined }) => void;
 readonly finish: (value: ReviewProcessOutcome) => void;
 phase: 'reserved' | 'validating' | 'running' | 'finished';
 handle?: ManagedProcess | undefined; disposal?: ProcessDisposal | undefined;
 receipt?: ReviewIntentReceipt | undefined;
 inputBusy: boolean;
};
type OwnerState = { readonly owner: ReviewProcessOwner; readonly leases: Map<number, Lease>; lastIssued: number; closing: boolean; };
const CHUNK_BYTES = 64 * 1024, REPLAY_CACHE = 128;
const reviewKey = (key: Readonly<ReviewKey>) => JSON.stringify([key.project, key.family, key.reviewId]);
const validId = (value: string) => value.length > 0 && value.length <= 128 && !/[\x00-\x1f\x7f]/.test(value);
export class ReviewProcessError extends Error {
 constructor(readonly code: string) { super(code); this.name = 'ReviewProcessError'; }
}
function requireProcess(condition: unknown, code: string): asserts condition { if (!condition) throw new ReviewProcessError(code); }
function snapshot(command: ReviewNativeCommand): { command: ReviewNativeCommand; digest: string } {
 requireProcess(Object.keys(command).every(k=>['kind','command','args','cwd','env','stdin','keepStdinOpen','timeoutMs'].includes(k)), 'invalid_command');
 const literal = (value: unknown): value is string => typeof value === 'string' && !value.includes('\0');
 requireProcess(literal(command.command) && command.command.length > 0 && literal(command.kind) && command.kind.length > 0 && command.kind.length <= 256, 'invalid_command');
 requireProcess(literal(command.cwd) && isAbsolute(command.cwd) && resolve(command.cwd) === command.cwd && Array.isArray(command.args) && command.args.length<=10000 && command.args.every(literal), 'invalid_command');
 requireProcess(command.stdin === undefined || command.stdin instanceof Uint8Array, 'invalid_stdin');
 requireProcess(command.keepStdinOpen === undefined || typeof command.keepStdinOpen === 'boolean', 'invalid_stdin');
 requireProcess(command.timeoutMs === undefined || Number.isSafeInteger(command.timeoutMs) && command.timeoutMs > 0 && command.timeoutMs<=2147483647, 'invalid_timeout');
 const env = command.env === undefined ? undefined : Object.fromEntries(Object.entries(command.env).sort(([a],[b])=>a.localeCompare(b)));
 requireProcess(!env || Object.keys(env).length<=1024&&Object.entries(env).every(([key,value])=>key.length>0&&!key.includes('=')&&literal(key)&&literal(value)), 'invalid_environment');
 const metadata = JSON.stringify([command.kind, command.command, command.args, command.cwd, env, command.timeoutMs, command.keepStdinOpen, command.stdin !== undefined]);
 requireProcess(Buffer.byteLength(metadata)+(command.stdin?.byteLength??0) <= reviewJsonLimit(), 'command_capacity');
 const input = command.stdin === undefined ? undefined : new Uint8Array(command.stdin);
 const value = Object.freeze({ ...command, args: Object.freeze([...command.args]), ...(env ? { env: Object.freeze(env) } : {}), ...(input ? { stdin: input } : {}) });
 return { command: value, digest: createHash('sha256').update(metadata).update('\0').update(input??new Uint8Array()).digest('hex') };
}
/** Bound a pending worker acknowledgment by owner lifetime, not a task timer.
 * The underlying promise remains observed if it completes after cancellation. */
function untilAbort<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
 return new Promise((resolve, reject) => {
  const abort = () => reject(new ReviewProcessError('owner_cancelled'));
  if (signal.aborted) abort(); else signal.addEventListener('abort', abort, { once: true });
  work.then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort)).catch(()=>{});
 });
}

/** Main-owned native handles only. No review parsing, provider selection,
 * generic native broker, durable execution ledger or automatic recovery. */
export class ReviewProcessLeases {
 readonly daemonInstance: string;
 private readonly owners = new Map<string, OwnerState>();
 private readonly handles = new WeakMap<ReviewProcessOwner, OwnerState>();
 constructor(private readonly deps: ReviewProcessDeps) {
  this.daemonInstance = deps.daemonInstance ?? randomUUID();
  requireProcess(validId(this.daemonInstance), 'invalid_daemon_instance');
 }
 register(key: ReviewKey, incarnation: string): ReviewProcessOwner {
  requireProcess(Value.Check(ReviewKeySchema,key)&&isAbsolute(key.project)&&resolve(key.project)===key.project&&validId(incarnation), 'invalid_owner');
  requireProcess(!this.owners.has(reviewKey(key)), 'review_resource_fenced');
  const owner = Object.freeze({ key: Object.freeze({ ...key }), incarnation });
  const state: OwnerState = { owner, leases: new Map(), lastIssued: 0, closing: false };
  this.owners.set(reviewKey(key),state); this.handles.set(owner,state); return owner;
 }
 private owner(owner: ReviewProcessOwner): OwnerState {
  const state=this.handles.get(owner); requireProcess(state&&this.owners.get(reviewKey(owner.key))===state, 'unregistered_owner'); return state;
 }
 /** Monotonic per-incarnation sequence makes forgotten, bounded-cache replays
  * explicitly stale instead of ever spawning an old operation a second time. */
 reserve(owner: ReviewProcessOwner, sequence: number, input: ReviewNativeCommand): ReviewProcessReservation {
  const state=this.owner(owner); requireProcess(!state.closing,'review_resource_fenced');
  requireProcess(Number.isSafeInteger(sequence)&&sequence>0,'invalid_operation');
  const pinned=snapshot(input),existing=state.leases.get(sequence);
  if(existing){requireProcess(existing.reservation.commandDigest===pinned.digest,'conflicting_operation_replay');return existing.reservation;}
  requireProcess(sequence===state.lastIssued+1,sequence<=state.lastIssued?'operation_replay_expired':'operation_sequence_gap');
  requireProcess([...state.leases.values()].filter(l=>l.disposal?.state!=='confirmed').length<MAX_REVIEW_OPEN_LEASES,'open_lease_capacity');
  let started!:Lease['started'],finish!:Lease['finish'];
  const run=Object.freeze({started:new Promise<{spawned:boolean;pid?:number|undefined}>(r=>{started=r;}),result:new Promise<ReviewProcessOutcome>(r=>{finish=r;})});
  const reservation=Object.freeze({key:owner.key,daemonInstance:this.daemonInstance,operationId:`${owner.incarnation}:${sequence}`,workerIncarnation:owner.incarnation,kind:pinned.command.kind,openedAt:new Date().toISOString(),commandDigest:pinned.digest});
  state.leases.set(sequence,{reservation,command:pinned.command,abort:new AbortController(),run,started,finish,phase:'reserved',inputBusy:false});
  state.lastIssued=sequence; return reservation;
 }
 start(owner: ReviewProcessOwner, sequence: number, receipt: ReviewIntentReceipt, consume: (output: ReviewProcessOutput)=>Promise<void>): ReviewProcessRun {
  const state=this.owner(owner),lease=state.leases.get(sequence);requireProcess(lease,'unknown_operation');
  const pinned=Object.freeze({checkpointPath:receipt.checkpointPath,attempt:receipt.attempt,operationId:receipt.operationId,workerIncarnation:receipt.workerIncarnation,daemonInstance:receipt.daemonInstance});
  requireProcess(!lease.receipt||JSON.stringify(lease.receipt)===JSON.stringify(pinned),'conflicting_intent_replay');
  if(lease.phase==='reserved'){
   requireProcess(!state.closing,'review_resource_fenced'); lease.phase='validating';lease.receipt=pinned;
   void withoutReviewNativeTransport(()=>runWithoutToolSignal(()=>this.launch(state,lease,pinned,consume))).catch(()=>this.finish(state,lease,{code:null,signal:null,aborted:lease.abort.signal.aborted,timedOut:false,spawnError:false,disposal:{state:'unknown',reason:'child_not_closed'},stdoutBytes:0,stderrBytes:0,error:{code:'native_lifecycle_failed'}}));
  }
  return lease.run;
 }
 private finish(state: OwnerState, lease: Lease, outcome: ReviewProcessOutcome): void {
  if(lease.phase==='finished')return;
  const disposal=Object.freeze({...outcome.disposal});
  lease.phase='finished';lease.disposal=disposal;lease.command=undefined;lease.started({spawned:false});lease.finish(Object.freeze({...outcome,disposal,...(outcome.error?{error:Object.freeze({...outcome.error})}:{})}));
  if(outcome.disposal.state==='unknown')void this.close(state.owner);
  const completed=[...state.leases.entries()].filter(([,l])=>l.disposal?.state==='confirmed');
  for(const [sequence] of completed.slice(0,Math.max(0,completed.length-REPLAY_CACHE)))state.leases.delete(sequence);
 }
 private async launch(state: OwnerState, lease: Lease, receipt: ReviewIntentReceipt, consume: (output: ReviewProcessOutput)=>Promise<void>): Promise<void> {
  const reservation=lease.reservation,command=lease.command!;
  let stage='authorization_denied';
  try {
   await untilAbort(Promise.resolve().then(()=>this.deps.authorize(reservation,command,lease.abort.signal)),lease.abort.signal);
   stage='unverified_open_intent';
   requireProcess(receipt.operationId===reservation.operationId&&receipt.workerIncarnation===reservation.workerIncarnation&&receipt.daemonInstance===this.daemonInstance&&Number.isSafeInteger(receipt.attempt)&&receipt.attempt>0&&receipt.checkpointPath===join(reservation.key.project,'.insrc/tmp',reservation.key.family==='code'?'code-review':'design-review',`${reservation.key.reviewId}.json`),stage);
   await untilAbort(Promise.resolve().then(()=>this.deps.verifyIntent(reservation,receipt,lease.abort.signal)),lease.abort.signal);
   stage='command_changed_after_authorization';
   const metadata=JSON.stringify([command.kind,command.command,command.args,command.cwd,command.env,command.timeoutMs,command.keepStdinOpen,command.stdin!==undefined]);
   requireProcess(createHash('sha256').update(metadata).update('\0').update(command.stdin??new Uint8Array()).digest('hex')===reservation.commandDigest,stage);
  } catch {
   this.finish(state,lease,{code:null,signal:null,aborted:lease.abort.signal.aborted,timedOut:false,spawnError:false,disposal:{state:'confirmed',reason:'not_started'},stdoutBytes:0,stderrBytes:0,error:{code:stage}});return;
  }
  if(state.closing||lease.abort.signal.aborted||lease.phase==='finished')return;
  // No await between the live-owner check, spawn and host handle registration.
  // Cancellation already exists in the reserved lease if worker loss reenters.
  lease.phase='running';
  const handle=runWithoutToolSignal(()=>this.deps.launch?this.deps.launch(command,lease.abort.signal):spawnManaged(command.command,command.args,{cwd:command.cwd,env:command.env,stdio:['pipe','pipe','pipe'],timeoutMs:command.timeoutMs,signal:lease.abort.signal}));
  lease.handle=handle;
  if(!handle.spawned){const exit=await handle.settled;this.finish(state,lease,{...exit,spawnError:false,disposal:handle.disposal(),stdoutBytes:0,stderrBytes:0});return;}
  const child=handle.child;
  if(child.pid!==undefined)lease.started({spawned:true,pid:child.pid});
  child.once('spawn',()=>lease.started({spawned:true,...(child.pid!==undefined?{pid:child.pid}:{})}));
  let spawnError=false,spawnDetail:string|undefined;
  child.once('error',error=>{spawnError=true;spawnDetail=error.message.slice(0,4096);lease.started({spawned:false});});
  // Managed helpers retain their normal behavior elsewhere. Review ownership
  // additionally sweeps the owned group on parent exit before observing close.
  child.once('exit',()=>{if(child.pid!==undefined)killProcessGroup(child.pid);});
  // A killed child may never close its pipes. Stop our byte consumers on
  // cancellation without treating local stream destruction as disposal proof.
  const stopStreams=()=>{child.stdout?.destroy();child.stderr?.destroy();};
  lease.abort.signal.addEventListener('abort',stopStreams,{once:true});
  if(lease.abort.signal.aborted)stopStreams();
  child.stdin?.on('error',()=>{});
  if(!command.keepStdinOpen)child.stdin?.end(command.stdin);
  else if(command.stdin?.byteLength)child.stdin?.write(command.stdin);
  let sequence=0,stdoutBytes=0,stderrBytes=0,consumerLost=false;
  const forward=async(stream:'stdout'|'stderr')=>{
   const readable=child[stream];if(!readable)return;
   try {
    for await(const chunk of readable){
     const bytes=chunk as Buffer;
     if(stream==='stdout')stdoutBytes+=bytes.byteLength;else stderrBytes+=bytes.byteLength;
     requireProcess(Number.isSafeInteger(stdoutBytes)&&Number.isSafeInteger(stderrBytes),'output_capacity');
     for(let at=0;at<bytes.byteLength;at+=CHUNK_BYTES){
      const output={operationId:reservation.operationId,workerIncarnation:reservation.workerIncarnation,sequence:++sequence,stream,bytes:new Uint8Array(bytes.subarray(at,at+CHUNK_BYTES))};
      await untilAbort(Promise.resolve().then(()=>consume(output)),lease.abort.signal);
     }
    }
   } catch {consumerLost ||= !lease.abort.signal.aborted;lease.abort.abort();}
  };
  // These only drain native byte streams; neither branch calls an LLM.
  const streams=Promise.all([forward('stdout'),forward('stderr')]);
  const exit=await handle.settled;
  if(exit.timedOut||exit.aborted||handle.disposal().state==='unknown')lease.abort.abort();
  await streams;
  lease.abort.signal.removeEventListener('abort',stopStreams);
  this.finish(state,lease,{...exit,spawnError,disposal:handle.disposal(),stdoutBytes,stderrBytes,...(consumerLost?{error:{code:'output_consumer_lost'}}:spawnError?{error:{code:'spawn_failed',detail:spawnDetail}}:{})});
 }
 async waitStarted(owner:ReviewProcessOwner,sequence:number):Promise<{readonly spawned:boolean}>{
  const lease=this.owner(owner).leases.get(sequence);requireProcess(lease,'unknown_operation');return{spawned:(await lease.run.started).spawned};
 }
 async write(owner: ReviewProcessOwner, sequence: number, bytes: Uint8Array, end=false): Promise<void> {
  const state=this.owner(owner),lease=state.leases.get(sequence);
  requireProcess(!state.closing&&lease?.phase==='running'&&lease.handle?.spawned&&bytes instanceof Uint8Array&&bytes.byteLength<=CHUNK_BYTES&&!lease.inputBusy,'stdin_unavailable');
  const stream=lease.handle.child.stdin;requireProcess(stream&&!stream.destroyed&&!stream.writableEnded,'stdin_unavailable');
  lease.inputBusy=true;
  try {await untilAbort(new Promise<void>((resolve,reject)=>{stream.write(bytes,error=>error?reject(error):resolve());}),lease.abort.signal);if(end)stream.end();}
  catch(error){lease.abort.abort();throw error;}finally{lease.inputBusy=false;}
 }
 close(owner: ReviewProcessOwner): Promise<readonly ReviewProcessOutcome[]> {
  const state=this.owner(owner);state.closing=true;
  for(const lease of state.leases.values()){
   lease.abort.abort();
   if(lease.phase==='reserved'||lease.phase==='validating')this.finish(state,lease,{code:null,signal:null,aborted:true,timedOut:false,spawnError:false,disposal:{state:'confirmed',reason:'not_started'},stdoutBytes:0,stderrBytes:0});
  }
  return Promise.all([...state.leases.values()].map(l=>l.run.result));
 }
 cancel(owner: ReviewProcessOwner, sequence: number): Promise<ReviewProcessOutcome> {
  const state=this.owner(owner),lease=state.leases.get(sequence);requireProcess(lease,'unknown_operation');lease.abort.abort();
  if(lease.phase==='reserved'||lease.phase==='validating')this.finish(state,lease,{code:null,signal:null,aborted:true,timedOut:false,spawnError:false,disposal:{state:'confirmed',reason:'not_started'},stdoutBytes:0,stderrBytes:0});
  return lease.run.result;
 }
 /** Retain exact handles on unknown cleanup. A later positive observation may
  * clear native uncertainty; it never changes an already returned review result. */
 recheck(owner: ReviewProcessOwner): boolean {
  const state=this.owner(owner);
  for(const lease of state.leases.values())if(lease.disposal?.state==='unknown'&&lease.handle)lease.disposal=Object.freeze({...lease.handle.disposal()});
  return [...state.leases.values()].every(l=>l.disposal?.state==='confirmed');
 }
 isFenced(key: ReviewKey): boolean { return this.owners.get(reviewKey(key))?.closing===true; }
 /** Main-only ownership handle, after its exact local broker clearance. This
  * never signals a PID or changes the already-returned review outcome. */
 authorizeClearance(owner:ReviewProcessOwner,operationIds:readonly string[]):void{
  const state=this.owner(owner);requireProcess(state.closing,'review_resource_fenced');
  const leases=operationIds.map(id=>{const lease=[...state.leases.values()].find(l=>l.reservation.operationId===id);requireProcess(lease?.phase==='finished','native_disposal_pending');return lease;});
  for(const lease of leases)if(lease.disposal?.state!=='confirmed')lease.disposal=Object.freeze({state:'confirmed',reason:'operator_clearance'});
 }
 /** Caller must ALSO reclaim worker locks/stores and persist guard closure
  * before releasing registry ownership. Native confirmation alone is insufficient. */
 release(owner: ReviewProcessOwner): void {
  const state=this.owner(owner);requireProcess(state.closing&&this.recheck(owner),'review_resource_fenced');
  this.owners.delete(reviewKey(owner.key));this.handles.delete(owner);
 }
}
