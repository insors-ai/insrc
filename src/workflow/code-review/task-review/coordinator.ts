/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { access, readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { ReviewSessionTimeoutError } from '../../../agent/providers/cli-provider.js';
import { getLogger } from '../../../shared/logger.js';
import type { LLMProvider, ReviewSessionOpts } from '../../../shared/types.js';
import { decodeReview, requireReview } from './contracts.js';
import type { ReviewAttempt, ReviewCheckpoint, TaskReviewResult } from './contracts.js';
import { deriveTaskAssignments, prepareReviewPacket } from './packet.js';
import type { PreparedReviewPacket, TaskAssignment } from './packet.js';
import type { ReviewSources } from './sources.js';
import { checkpointPath, saveCheckpoint } from './checkpoint.js';
import { assignmentPrompt, codeTaskCommands } from './policy.js';
import { artifactJsonPath, buildArtifactId } from '../../storage.js';
import { reviewedBuildFingerprint } from '../build-freshness.js';
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
export interface ReviewAcknowledgement { reviewId: string; attempt: 1; path: string; status: 'pending'; crPublication: 'pending'; }
interface ActiveReview { checkpoint: ReviewCheckpoint; attempt: ReviewAttempt; done: Promise<void>; }
/** Daemon-owned lifetime, intentionally independent of the submitting socket. S2 adds explicit recovery. */
export class TaskReviewCoordinator {
 private readonly active = new Map<string, ActiveReview | null>();
 private readonly controllers = new Map<string, ControllerTaskReview>();
 constructor(private readonly deps: TaskReviewDeps) {}
 async start(project: string, reviewId: string, attempt: number, input: unknown, context?: { provider?: () => LLMProvider; epicHash?: string }): Promise<ReviewAcknowledgement> {
  const admitted = await this.admit(project, reviewId, attempt, input, 'daemon', context?.epicHash);
  const { path, checkpoint, attempt: entry, prepared } = admitted;
  try {
   const done = new Promise<void>(resolve => setImmediate(() => {
    void this.run(path, checkpoint, entry, prepared, context?.provider ?? this.deps.provider).catch(error => {
     // A persistence failure stops scheduling. Never overwrite the last durable task with a fabricated success.
     log.error({ reviewId, error: error instanceof Error ? error.message : String(error) }, 'Task review stopped; last durable checkpoint retained');
    }).finally(() => { this.active.delete(path); resolve(); });
   }));
   this.active.set(path, { checkpoint, attempt: entry, done });
   return { reviewId, attempt: 1, path, status: 'pending', crPublication: 'pending' };
  } catch (error) { this.active.delete(path); throw error; }
 }
 async startController(project:string,id:string,attempt:number,input:unknown,owner:ControllerReviewOwner,epicHash?:string):Promise<ControllerFrame>{
  requireReview(owner.signal instanceof AbortSignal&&!owner.signal.aborted&&!owner.requestSignal?.aborted,'reviewer','Disconnected or unsupported controller lifetime');owner.assertReviewer?.();
  const admitted=await this.admit(project,id,attempt,input,'controller',epicHash);
  const controller=new ControllerTaskReview(admitted,owner,{...this.deps,release:drop=>{this.active.delete(admitted.path);if(drop)this.controllers.delete(admitted.path);}});
  this.controllers.set(admitted.path,controller);this.active.set(admitted.path,{checkpoint:admitted.checkpoint,attempt:admitted.attempt,done:controller.done});
  return controller.assignment(owner);
 }
 async controllerAssignment(project:string,id:string,attempt:number,owner:ControllerReviewOwner):Promise<ControllerFrame>{return(await this.controller(project,id,attempt)).assignment(owner);}
 async controllerScope(project:string,id:string,attempt:number,input:unknown,owner:ControllerReviewOwner):Promise<ControllerFrame>{return(await this.controller(project,id,attempt)).scope(input,owner);}
 async controllerResult(project:string,id:string,attempt:number,input:unknown,owner:ControllerReviewOwner):Promise<ControllerFrame>{return(await this.controller(project,id,attempt)).submit(input,owner);}
 private async controller(project:string,id:string,attempt:number):Promise<ControllerTaskReview>{
  const path=checkpointPath(project,id);
  let saved:ReviewCheckpoint;
  try{saved=JSON.parse(await readFile(path,'utf8')) as ReviewCheckpoint;}catch(error){requireReview(false,'checkpoint',(error as NodeJS.ErrnoException).code==='ENOENT'?'missing-checkpoint':'Unreadable checkpoint');}
  requireReview(saved.attempts.at(-1)?.header.reviewer==='controller','reviewer','wrong-reviewer');
  requireReview(saved.attempts.at(-1)?.header.attempt===attempt,'attempt','Attempt mismatch');
  const controller=this.controllers.get(path);requireReview(controller,'checkpoint','Controller state unavailable; explicit retrigger is required');return controller;
 }
 private async admit(project: string, reviewId: string, attempt: number, input: unknown, reviewer: 'daemon' | 'controller', epicHash?: string): Promise<AdmittedReview> {
  const path = checkpointPath(project, reviewId);
  requireReview(attempt === 1, 'attempt', 'Fresh first attempts only; recovery is not implemented here');
  requireReview(!this.active.has(path), 'reviewId', 'already-running');
  this.active.set(path, null); // Reserve before any awaited admission or provider use.
  try {
   let exists = false;
   try { await access(path); exists = true; } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
   requireReview(!exists, 'reviewId', 'attempt-conflict: checkpoint already exists');
   const prepared = await prepareReviewPacket(input, this.deps.sources);
   requireReview(!epicHash || epicHash === prepared.epicHash, 'epicHash', 'Pinned Plan belongs to another review subject');
   const selected = prepared.tasks.filter(task => !prepared.packet.taskId || task.id === prepared.packet.taskId);
   const entry: ReviewAttempt = { header: { attempt: 1, reviewer, status: 'pending', createdAt: new Date().toISOString(), selectedTaskIds: selected.map(task => task.id) }, submitted: prepared.packet,
    'review-response': { summary: 'Review admitted; CR publication pending.', tasks: [], crPublication: 'pending' } };
   if (!prepared.packet.taskId) {
    try { entry.header.buildFingerprint = reviewedBuildFingerprint(JSON.parse(await readFile(artifactJsonPath(project, buildArtifactId(prepared.epicHash, prepared.packet.storyId.replace(/^STORY-[a-f0-9]{16}-/, ''))), 'utf8'))); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
   }
   const checkpoint: ReviewCheckpoint = { schemaVersion: 1, reviewId, project, storyId: prepared.packet.storyId, ...(prepared.packet.taskId ? { taskId: prepared.packet.taskId } : {}), attempts: [entry] };
   await (this.deps.save ?? saveCheckpoint)(path, checkpoint);
   return { path, checkpoint, attempt: entry, prepared };
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
  let attributionFailure: unknown;
  for (const task of selected.sort((a, b) => a.order - b.order)) {
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
      if (attributionFailure) throw attributionFailure;
      try {
      const direct = directAssignments(prepared);
      if (direct) assignments = direct;
      else {
       const rawScope = await provider.runReviewSession(attributionPrompt(prepared, checkpoint.project), AttributionSchema, options());
       options();
       const derived = deriveTaskAssignments(prepared, decodeReview(AttributionSchema, rawScope).tasks);
       options(); assignments = derived;
      }
      } catch (error) { attributionFailure = error; throw error; }
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
    if (!assignments) attributionFailure = error;
    const timedOut = error instanceof ReviewSessionTimeoutError || error === timeout || cancellation.signal.aborted || now() - started >= allowance;
    const message = timedOut ? `Task exceeded its ${task.size} allowance (${allowance}ms).` : `Reviewer failed: ${error instanceof Error ? error.message : String(error)}`;
    result = taskFailure(task.id, message, timedOut);
   } finally { cancelTimer(); cancellation.abort(); }
   entry['review-response'].tasks = [...entry['review-response'].tasks, result];
   delete entry.header.activeTaskId;
   await save(path, checkpoint); // Never begin the next task before this succeeds.
  }
  await completeReview({ path, checkpoint, attempt: entry, prepared }, this.deps);
 }
}
