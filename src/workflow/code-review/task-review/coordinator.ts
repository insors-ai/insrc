/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { ReviewProgressTracker } from './progress.js';
import { ReviewProgressPersistence } from './progress-persistence.js';
import { isDeepStrictEqual } from 'node:util';
import { ReviewActivityMonitor, ReviewInactivityError, REVIEW_INACTIVITY_MS, requireReviewActivity } from '../../../shared/review-activity.js';
import { ReviewSessionTimeoutError } from '../../../agent/providers/cli-provider.js';
import { getLogger } from '../../../shared/logger.js';
import type { LLMProvider, ReviewSessionOpts } from '../../../shared/types.js';
import { requireReview } from './contracts.js';
import type { ReviewAttempt, ReviewCheckpoint, TaskReviewResult, ReviewOperation, ReviewStatus, TaskResultOrigin } from './contracts.js';
import type { PreparedReviewPacket, TaskAssignment } from './packet.js';
import type { ReviewSources } from './sources.js';
import { checkpointPath, saveCheckpoint, loadCheckpoint } from './checkpoint.js';
import { assignmentPrompt, codeTaskCommands } from './policy.js';
import { prepareReviewAdmission } from './admission.js';
import { assignmentResultSchema } from './result-schema.js';
import { attributionSchema, attributionPrompt, directReviewAssignments, reviewAssignments, reuseAssessment, taskReferences, assessTaskResult, taskFailure } from './assessment.js';
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
interface ActiveReview { checkpoint: ReviewCheckpoint; attempt: ReviewAttempt; done: Promise<void>; progress?: ReviewProgressTracker; persistence?: ReviewProgressPersistence; }
/** Daemon-owned lifetime with explicit pinned recovery, independent of the submitting socket. */
export class TaskReviewCoordinator {
 private readonly active = new Map<string, ActiveReview | null>();
 private readonly controllers = new Map<string, ControllerTaskReview>();
 constructor(private readonly deps: TaskReviewDeps) {}
 async start(project: string, reviewId: string, attempt: number, input?: unknown, context?: { provider?: () => LLMProvider; epicHash?: string; operation?: ReviewOperation }): Promise<ReviewAcknowledgement> {
  let provider: LLMProvider | undefined;
  const providerForReview = () => provider ??= (context?.provider ?? this.deps.provider)();
  const admitted = await this.admit(project, reviewId, attempt, input, 'daemon', context?.epicHash, context?.operation, () => requireReviewActivity(providerForReview()));
  const { path, checkpoint, attempt: entry, prepared } = admitted;
  const metadata = (): ReviewAcknowledgement => ({ reviewId, attempt: entry.header.attempt, reviewer: 'daemon', path, status: entry.header.status, crPublication: entry['review-response'].crPublication, completedTaskIds: entry['review-response'].tasks.map(task => task.taskId), pendingTaskIds: entry.header.selectedTaskIds.filter(id => !entry['review-response'].tasks.some(task => task.taskId === id)) });
  if (entry['review-response'].crPublication === 'complete') { this.active.delete(path); return metadata(); }
  try {
   const done = new Promise<void>(resolve => setImmediate(() => {
    void this.run(path, checkpoint, entry, prepared, providerForReview).catch(error => {
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
 async controllerScope(project:string,id:string,attempt:number,input:unknown,owner:ControllerReviewOwner,envelope:unknown):Promise<ControllerFrame>{return(await this.controller(project,id,attempt)).scope(input,owner,envelope);}
 async controllerResult(project:string,id:string,attempt:number,input:unknown,owner:ControllerReviewOwner,envelope:unknown):Promise<ControllerFrame>{return(await this.controller(project,id,attempt)).submit(input,owner,envelope);}
 async controllerActivity(project:string,id:string,attempt:number,input:unknown,owner:ControllerReviewOwner,envelope:unknown):Promise<unknown>{return(await this.controller(project,id,attempt)).activity(input,owner,envelope);}
 private async controller(project:string,id:string,attempt:number):Promise<ControllerTaskReview>{
  const path=checkpointPath(project,id);
  const saved=await loadCheckpoint(path);requireReview(saved,'checkpoint','missing-checkpoint');
  requireReview(saved.attempts.at(-1)?.header.reviewer==='controller','reviewer','wrong-reviewer');
  requireReview(saved.attempts.at(-1)?.header.attempt===attempt,'attempt','Attempt mismatch');
  const controller=this.controllers.get(path);requireReview(controller,'checkpoint','Controller state unavailable; explicit retrigger is required');return controller;
 }
 private async admit(project: string, reviewId: string, attempt: number, input: unknown, reviewer: 'daemon' | 'controller', epicHash?: string, operation?: ReviewOperation, preflight?: () => void): Promise<AdmittedReview> {
  const path = checkpointPath(project, reviewId);
  requireReview(!this.active.has(path), 'reviewId', 'already-running');
  this.active.set(path, null); // Reserve before any awaited admission or provider use.
  try {
   const admitted = await prepareReviewAdmission(project, reviewId, attempt, input, reviewer, this.deps.sources, { epicHash, operation });
   if (operation === 'resume' && admitted.attempt['review-response'].crPublication === 'complete') return admitted;
   if (admitted.attempt.header.selectedTaskIds.some(id => !admitted.attempt['review-response'].tasks.some(task => task.taskId === id))) preflight?.();
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
  const review:AdmittedReview={path,checkpoint,attempt:entry,prepared};
  const save = this.deps.save ?? saveCheckpoint;
  const tracker = new ReviewProgressTracker(this.deps.now ? {now:this.deps.now,wall:()=>new Date().toISOString()} : undefined);
  const active=this.active.get(path); if(active)active.progress=tracker;
  const selected = prepared.tasks.filter(task => !prepared.packet.taskId || task.id === prepared.packet.taskId);
  let assignments: readonly TaskAssignment[] | undefined;
  let attributionFailure: { error: unknown; timedOut: boolean } | undefined;
  for (const task of selected.sort((a,b)=>a.order-b.order)) {
   if (entry['review-response'].tasks.some(result=>result.taskId===task.id)) continue;
   tracker.task(task,selected.indexOf(task)+1,selected.length,entry['review-response'].tasks.length);
   entry.progress=tracker.snapshot();entry.header.status='running';entry.header.activeTaskId=task.id;await save(path,checkpoint);
   const cancellation=new AbortController();
   let tail:Promise<unknown>=Promise.resolve();
   const serial=<T>(work:()=>Promise<T>):Promise<T>=>{const result=tail.then(work);tail=result.catch(()=>{});return result;};
   const progress=new ReviewProgressPersistence(entry,tracker,{serial,save:()=>save(path,checkpoint)});
   if(active)active.persistence=progress;
   let durable:TaskReviewResult|undefined, persistenceError:unknown, inactive:ReviewInactivityError|undefined;
   let rejectExpiry!:(error:unknown)=>void;
   const expired=new Promise<never>((_,reject)=>{rejectExpiry=reject;});
   const monitor=new ReviewActivityMonitor(error=>{
    void serial(async()=>{if(durable||persistenceError)return;inactive=error;cancellation.abort(error);rejectExpiry(error);});
   },{...(this.deps.now?{now:this.deps.now}:{}),...(this.deps.timer?{timer:this.deps.timer}:{})});
   const check=()=>{if(inactive)throw inactive;};
   const commitResult=async(result:TaskReviewResult,origin?:TaskResultOrigin):Promise<void>=>{
    if(durable){requireReview(isDeepStrictEqual(durable,result),'result','Conflicting accepted submission replay');return;}
    tracker.phase('feedback_persistence');progress.boundary();
    const priorTasks=entry['review-response'].tasks,priorOrigins=entry['review-response'].origins;
    entry['review-response'].tasks=[...priorTasks,result];
    if(origin)entry['review-response'].origins=[...(priorOrigins??[]),origin];
    delete entry.header.activeTaskId;
    try{await save(path,checkpoint);}catch(error){
     entry['review-response'].tasks=priorTasks;
     if(priorOrigins)entry['review-response'].origins=priorOrigins;else delete entry['review-response'].origins;
     entry.header.activeTaskId=task.id;persistenceError=error;throw error;
    }
    durable=result;tracker.phase('task_review',entry['review-response'].tasks.length);
   };
   const options=(candidate:(raw:unknown)=>Promise<{accepted:boolean}>):ReviewSessionOpts=>({
    mode:'activity',cwd:checkpoint.project,inactivityMs:REVIEW_INACTIVITY_MS,internalRetry:false,signal:cancellation.signal,
    codeTaskCommands:codeTaskCommands(prepared,review),onActivity:event=>{if(monitor.observe(event)){const prior=tracker.snapshot().phase;tracker.activity(event,monitor.snapshot().tools.length);progress.request(prior!==tracker.snapshot().phase);}},onCandidate:candidate,
   });
   const flow=(async()=>{
    const provider=resolveProvider();requireReviewActivity(provider);
    if(!assignments){
     if(attributionFailure)throw attributionFailure.error;
     assignments=directReviewAssignments(review);
     if(!assignments){
      const acceptScope=(raw:unknown)=>serial(async()=>{check();assignments=reviewAssignments(review,raw);return{accepted:true};});
      const raw=await provider.runReviewSession!(attributionPrompt(prepared,checkpoint.project,review),attributionSchema(review),options(acceptScope));
      check();if(!assignments)assignments=reviewAssignments(review,raw);
     }
    }
    tracker.phase('task_review');progress.request(true);
    const assignment=assignments.find(a=>a.taskId===task.id)!;
    const references=await taskReferences(this.deps.sources,prepared,assignment);check();
    if(assignment.reassessment?.action==='reuse'){
     const reused=await reuseAssessment(review,assignment,this.deps.sources,references);
     await serial(async()=>{check();await commitResult(reused.result,reused.origin);});return;
    }
    const acceptTask=(raw:unknown)=>serial(async()=>{
     check();const assessed=await assessTaskResult(this.deps.sources,assignment,raw,references);
     await commitResult(assessed);return{accepted:true};
    });
    const raw=await provider.runReviewSession!(assignmentPrompt(prepared,assignment,references,checkpoint.project,review),assignmentResultSchema(assignment),options(acceptTask));
    if(!durable)await acceptTask(raw);
   })();
   try{await Promise.race([expired,flow]);}
   catch(error){
    if(persistenceError)throw persistenceError;
    if(!durable){
     const inherited=attributionFailure?.timedOut===true&&error===attributionFailure.error;
     const timedOut=inherited||error instanceof ReviewInactivityError||error instanceof ReviewSessionTimeoutError;
     if(!assignments)attributionFailure={error,timedOut};
     const message=inherited?'Task could not be attributed because shared attribution exceeded its inactivity grace.':error instanceof ReviewSessionTimeoutError?`Provider session stopped: ${error.message}`:timedOut?'Task has no observed review activity for 30 minutes.':`Reviewer failed: ${error instanceof Error?error.message:String(error)}`;
     await serial(()=>commitResult(taskFailure(task.id,message,timedOut)));
    }else log.warn({reviewId:checkpoint.reviewId,taskId:task.id},'CLI stopped after durable task assessment; retained accepted feedback');
   }finally{
    progress.stop();monitor.stop();cancellation.abort();
    // Do not start another task/provider until the cancelled session releases its resources.
    await flow.catch(()=>{});await tail;tracker.stopped();
   }
  }
  tracker.phase('cr_publication',entry['review-response'].tasks.length);entry.progress=tracker.snapshot();
  const final={path,checkpoint,attempt:entry,prepared};
  await completeReview(final,this.deps);
  tracker.phase(final.attempt['review-response'].crPublication==='complete' || !this.deps.publish ? 'complete' : 'error');tracker.stopped();

 }
}
