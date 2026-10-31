/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { performance } from 'node:perf_hooks';
import { ReviewSessionTimeoutError } from '../../../agent/providers/cli-provider.js';
import { getLogger } from '../../../shared/logger.js';
import type { LLMProvider, ReviewSessionOpts } from '../../../shared/types.js';
import { decodeReview, requireReview } from './contracts.js';
import type { ReviewAttempt, ReviewCheckpoint, TaskReviewResult, ReviewOperation, ReviewStatus } from './contracts.js';
import { deriveTaskAssignments } from './packet.js';
import type { PreparedReviewPacket, TaskAssignment } from './packet.js';
import type { ReviewSources } from './sources.js';
import { checkpointPath, saveCheckpoint, loadCheckpoint } from './checkpoint.js';
import { assignmentPrompt, codeTaskCommands } from './policy.js';
import { prepareReviewAdmission } from './admission.js';
import { assignmentResultSchema } from './result-schema.js';
import { AttributionSchema, attributionPrompt, directAssignments, taskReferences, assessTaskResult, taskFailure } from './assessment.js';
import { ControllerTaskReview } from './controller.js';
import type { ControllerReviewOwner, ControllerFrame } from './controller.js';
import { completeReview } from './execution.js';
import type { AdmittedReview } from './execution.js';

const log = getLogger('task-review');

export interface TaskReviewDeps {
 readonly sources: ReviewSources;
 readonly provider: () => LLMProvider;
 readonly save?: typeof saveCheckpoint;
 readonly publish?: ((project: string, reviewId: string, epicHash: string) => Promise<unknown>) | undefined;
 readonly now?: () => number;
 readonly timer?: (callback: () => void, ms: number) => () => void;
}
export interface ReviewAcknowledgement { reviewId: string; attempt: number; reviewer: 'daemon'; path: string; status: ReviewStatus; crPublication: 'pending' | 'complete'; completedTaskIds: readonly string[]; pendingTaskIds: readonly string[]; }
interface ActiveReview { checkpoint: ReviewCheckpoint; attempt: ReviewAttempt; done: Promise<void>; }
/** Daemon-owned lifetime with explicit pinned recovery, independent of the submitting socket. */
export class TaskReviewCoordinator {
 private readonly active = new Map<string, ActiveReview | null>();
 private readonly controllers = new Map<string, ControllerTaskReview>();
 constructor(private readonly deps: TaskReviewDeps) {}
 async start(project: string, reviewId: string, attempt: number, input?: unknown, context?: { provider?: () => LLMProvider; epicHash?: string; operation?: ReviewOperation }): Promise<ReviewAcknowledgement> {
  const admitted = await this.admit(project, reviewId, attempt, input, 'daemon', context?.epicHash, context?.operation);
  const { path, checkpoint, attempt: entry, prepared } = admitted;
  const metadata = (): ReviewAcknowledgement => ({ reviewId, attempt: entry.header.attempt, reviewer: 'daemon', path, status: entry.header.status, crPublication: entry['review-response'].crPublication, completedTaskIds: entry['review-response'].tasks.map(task => task.taskId), pendingTaskIds: entry.header.selectedTaskIds.filter(id => !entry['review-response'].tasks.some(task => task.taskId === id)) });
  if (entry['review-response'].crPublication === 'complete') { this.active.delete(path); return metadata(); }
  try {
   const done = new Promise<void>(resolve => setImmediate(() => {
    void this.run(path, checkpoint, entry, prepared, context?.provider ?? this.deps.provider).catch(error => {
     // A persistence failure stops scheduling. Never overwrite the last durable task with a fabricated success.
     log.error({ reviewId, error: error instanceof Error ? error.message : String(error) }, 'Task review stopped; last durable checkpoint retained');
    }).finally(() => { this.active.delete(path); resolve(); });
   }));
   this.active.set(path, { checkpoint, attempt: entry, done });
   return metadata();
  } catch (error) { this.active.delete(path); throw error; }
 }
 async startController(project:string,id:string,attempt:number,input:unknown,owner:ControllerReviewOwner,epicHash?:string,operation?:ReviewOperation):Promise<ControllerFrame>{
  requireReview(owner.signal instanceof AbortSignal&&!owner.signal.aborted&&!owner.requestSignal?.aborted,'reviewer','Disconnected or unsupported controller lifetime');owner.assertReviewer?.();
  const admitted=await this.admit(project,id,attempt,input,'controller',epicHash,operation);
  const controller=new ControllerTaskReview(admitted,owner,{...this.deps,release:drop=>{if(this.active.get(admitted.path)?.done===controller.done)this.active.delete(admitted.path);if(drop&&this.controllers.get(admitted.path)===controller)this.controllers.delete(admitted.path);}});
  this.controllers.set(admitted.path,controller);this.active.set(admitted.path,{checkpoint:admitted.checkpoint,attempt:admitted.attempt,done:controller.done});
  return controller.assignment(owner);
 }
 async controllerAssignment(project:string,id:string,attempt:number,owner:ControllerReviewOwner):Promise<ControllerFrame>{return(await this.controller(project,id,attempt)).assignment(owner);}
 async controllerScope(project:string,id:string,attempt:number,input:unknown,owner:ControllerReviewOwner):Promise<ControllerFrame>{return(await this.controller(project,id,attempt)).scope(input,owner);}
 async controllerResult(project:string,id:string,attempt:number,input:unknown,owner:ControllerReviewOwner):Promise<ControllerFrame>{return(await this.controller(project,id,attempt)).submit(input,owner);}
 private async controller(project:string,id:string,attempt:number):Promise<ControllerTaskReview>{
  const path=checkpointPath(project,id);
  const saved=await loadCheckpoint(path);requireReview(saved,'checkpoint','missing-checkpoint');
  requireReview(saved.attempts.at(-1)?.header.reviewer==='controller','reviewer','wrong-reviewer');
  requireReview(saved.attempts.at(-1)?.header.attempt===attempt,'attempt','Attempt mismatch');
  const controller=this.controllers.get(path);requireReview(controller,'checkpoint','Controller state unavailable; explicit retrigger is required');return controller;
 }
 private async admit(project: string, reviewId: string, attempt: number, input: unknown, reviewer: 'daemon' | 'controller', epicHash?: string, operation?: ReviewOperation): Promise<AdmittedReview> {
  const path = checkpointPath(project, reviewId);
  requireReview(!this.active.has(path), 'reviewId', 'already-running');
  this.active.set(path, null); // Reserve before any awaited admission or provider use.
  try {
   const admitted = await prepareReviewAdmission(project, reviewId, attempt, input, reviewer, this.deps.sources, { epicHash, operation });
   if (operation === 'resume' && admitted.attempt['review-response'].crPublication === 'complete') return admitted;
   if (operation === 'resume' && admitted.attempt.header.selectedTaskIds.some(id => !admitted.attempt['review-response'].tasks.some(task => task.taskId === id))) {
    admitted.attempt.header.status = 'pending'; delete admitted.attempt.header.interrupted; delete admitted.attempt.header.activeTaskId; delete admitted.attempt.header.completedAt;
   }
   await (this.deps.save ?? saveCheckpoint)(admitted.path, admitted.checkpoint);
   return admitted;
  } catch (error) { this.active.delete(path); throw error; }
 }
 /** Used by shutdown/tests, never awaited by start or attached to a caller's cancellation. */
 isActive(project: string, reviewId: string): boolean { return this.active.has(checkpointPath(project, reviewId)); }
 async settled(project: string, reviewId: string): Promise<void> { await this.active.get(checkpointPath(project, reviewId))?.done; }
 private async run(path: string, checkpoint: ReviewCheckpoint, entry: ReviewAttempt, prepared: PreparedReviewPacket, resolveProvider: () => LLMProvider): Promise<void> {
  const save = this.deps.save ?? saveCheckpoint;
  const now = this.deps.now ?? (() => performance.now());
  const selected = prepared.tasks.filter(task => !prepared.packet.taskId || task.id === prepared.packet.taskId);
  // Derive once from the pinned Plan, not submitter-supplied task mappings. All model calls are serial.
  let assignments: readonly TaskAssignment[] | undefined;
  let attributionFailure: { error: unknown; timedOut: boolean } | undefined;
  for (const task of selected.sort((a, b) => a.order - b.order)) {
   if (entry['review-response'].tasks.some(result => result.taskId === task.id)) continue;
   entry.header.status = 'running'; entry.header.activeTaskId = task.id;
   await save(path, checkpoint);
   const started = now(), allowance = { S: 300000, M: 600000, L: 900000 }[task.size];
   const cancellation = new AbortController();
   const timeout = new Error('Task review deadline expired');
   let cancelTimer: () => void = () => {};
   const expired = new Promise<never>((_resolve, reject) => {
    const callback = () => { cancellation.abort(timeout); reject(timeout); };
    if (this.deps.timer) cancelTimer = this.deps.timer(callback, allowance);
    else { const timer = setTimeout(callback, allowance); cancelTimer = () => clearTimeout(timer); }
   });
   const options = (): ReviewSessionOpts => {
    const remaining = allowance - (now() - started);
    if (remaining <= 0 || cancellation.signal.aborted) throw timeout;
    return { cwd: checkpoint.project, deadlineMs: remaining, stallMs: remaining, internalRetry: false, signal: cancellation.signal, codeTaskCommands: codeTaskCommands(prepared) };
   };
   let result: TaskReviewResult;
   try {
    result = await Promise.race([expired, (async () => {
     const provider = resolveProvider();
     requireReview(provider.runReviewSession, 'provider', 'Reviewer sessions are unsupported');
     if (!assignments) {
      if (attributionFailure) throw attributionFailure.error;
      const direct = directAssignments(prepared);
      if (direct) assignments = direct;
      else {
       const rawScope = await provider.runReviewSession(attributionPrompt(prepared, checkpoint.project), AttributionSchema, options());
       options();
       const derived = deriveTaskAssignments(prepared, decodeReview(AttributionSchema, rawScope).tasks);
       options(); assignments = derived;
      }
     }
     const assignment = assignments.find(a => a.taskId === task.id)!;
     const references = await taskReferences(this.deps.sources, prepared, assignment);
     const raw = await provider.runReviewSession(assignmentPrompt(prepared, assignment, references, checkpoint.project), assignmentResultSchema(assignment), options());
     options();
     const assessed = await assessTaskResult(this.deps.sources, assignment, raw, references);
     options(); // Source resolution and output validation share the same clock.
     return assessed;
    })()]);
   } catch (error) {
    const inheritedTimeout = attributionFailure?.timedOut === true && error === attributionFailure.error;
    const timedOut = inheritedTimeout || error instanceof ReviewSessionTimeoutError || error === timeout || cancellation.signal.aborted || now() - started >= allowance;
    if (!assignments) attributionFailure = { error, timedOut };
    const message = inheritedTimeout ? 'Task could not be attributed because the shared attribution deadline expired.' : timedOut ? `Task exceeded its ${task.size} allowance (${allowance}ms).` : `Reviewer failed: ${error instanceof Error ? error.message : String(error)}`;
    result = taskFailure(task.id, message, timedOut);
   } finally { cancelTimer(); cancellation.abort(); }
   entry['review-response'].tasks = [...entry['review-response'].tasks, result];
   delete entry.header.activeTaskId;
   await save(path, checkpoint); // Never begin the next task before this succeeds.
  }
  await completeReview({ path, checkpoint, attempt: entry, prepared }, this.deps);
 }
}
