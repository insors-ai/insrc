import { qualifyReviewCapacity, capacityCheckedResult } from './capacity.js';
import { failAttribution, unmappedTaskFailure, attributionTimedOut } from './attribution-failure.js';
import { recordAttributionRejection, MAX_ATTRIBUTION_SUBMISSIONS } from './attribution-repair.js';
import { persistFailureDiagnostic, resolveFailureDiagnostics } from './diagnostics.js';
import { ReviewOutputFailureError } from '../../../shared/review-diagnostics.js';
import type { FailureDiagnostic } from './diagnostic-schema.js';
/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import type { ReviewProgressView } from './progress-view.js';
import { ReviewProgressTracker } from './progress.js';
import { ReviewProgressPersistence } from './progress-persistence.js';
import { isDeepStrictEqual } from 'node:util';
import { ReviewActivityMonitor, ReviewInactivityError, REVIEW_INACTIVITY_MS, requireReviewActivity } from '../../../shared/review-activity.js';
import { ReviewSessionTimeoutError } from '../../../agent/providers/cli-provider.js';
import { getLogger } from '../../../shared/logger.js';
import type { LLMProvider, ReviewSessionOpts } from '../../../shared/types.js';
import { requireReview, TaskReviewInputError, isCodeAdmission } from './contracts.js';
import type { ReviewAttempt, ReviewCheckpoint, TaskReviewResult, ReviewOperation, ReviewStatus, TaskResultOrigin } from './contracts.js';
import type { PreparedReviewPacket, TaskAssignment } from './packet.js';
import type { ReviewSources } from './sources.js';
import { checkpointPath, saveCheckpoint, loadCheckpoint, loadStoredCheckpoint } from './checkpoint.js';
import { assignmentPrompt, codeTaskCommands } from './policy.js';
import { canonicalReviewStory, prepareReviewAdmission } from './admission.js';
import { assignmentResultSchema } from './result-schema.js';
import { attributionSchema, attributionPrompt, directReviewAssignments, reviewAssignments, reuseAssessment, taskReferences, assessTaskResult, taskFailure } from './assessment.js';
import { ControllerTaskReview } from './controller.js';
import type { ControllerReviewOwner, ControllerFrame } from './controller.js';
import { completeReview, persistAcceptedAttribution } from './execution.js';
import type { AdmittedReview, AcceptanceFence } from './execution.js';

const log = getLogger('task-review');

export interface TaskReviewDeps {
 readonly sources: ReviewSources;
 readonly provider: () => LLMProvider;
 readonly save?: typeof saveCheckpoint;
 readonly read?: typeof loadCheckpoint;
 readonly publish?: ((project: string, reviewId: string, epicHash: string, baseline?: import('./capacity.js').CapacityBaseline) => Promise<unknown>) | undefined;
 readonly now?: () => number;
 readonly timer?: (callback: () => void, ms: number) => () => void;
}
export interface ReviewAcknowledgement { reviewId: string; attempt: number; reviewer: 'daemon'; path: string; status: ReviewStatus; crPublication: 'pending' | 'complete'; completedTaskIds: readonly string[]; pendingTaskIds: readonly string[]; }
interface ActiveReview { checkpoint: ReviewCheckpoint; attempt: ReviewAttempt; done: Promise<void>; progress?: ReviewProgressTracker; persistence?: ReviewProgressPersistence; }
/** Daemon-owned lifetime with explicit pinned recovery, independent of the submitting socket. */
export class TaskReviewCoordinator {
 private readonly active = new Map<string, ActiveReview | null>();
 private readonly controllers = new Map<string, ControllerTaskReview>();
 private readonly storageFences = new Map<string, AcceptanceFence>();
 // Unknown scope during admission blocks cleanup conservatively until pins resolve.
 private readonly storyWork = new Map<string, string | undefined>();
 private readonly cleaning = new Set<string>();
 private release(path: string): void { this.active.delete(path); this.storyWork.delete(path); }
 private storyKey(project: string, hash: string, story: string): string {
  return `${project}\0${hash}\0${canonicalReviewStory(story, hash)}`;
 }
 /** A short cleanup fence, not a queue or a second execution ledger. */
 async withStoryCleanup<T>(project: string, hash: string, story: string, work: () => Promise<T>): Promise<{ busy: true } | { busy: false; result: T }> {
  const key = this.storyKey(project, hash, story);
  if (this.cleaning.has(key) || [...this.storyWork].some(([path, scope]) => path.startsWith(`${project}/`) && (scope === undefined || scope === key))) return { busy: true };
  this.cleaning.add(key);
  try { return { busy: false, result: await work() }; }
  finally { this.cleaning.delete(key); }
 }
 /** Explicit publication retries participate in the same exclusion as execution. */
 async publishStored<T>(project: string, id: string, hash: string, work: () => Promise<T>): Promise<T> {
  const path = checkpointPath(project, id);
  this.reserve(path);
  try {
   const saved = await loadCheckpoint(path);
   requireReview(saved, 'checkpoint', 'missing-checkpoint');
   const key = this.storyKey(project, hash, saved.storyId);
   requireReview(!this.cleaning.has(key), 'storyId', 'cleanup-in-progress');
   this.storyWork.set(path, key);
   return await work();
  } finally { this.release(path); }
 }
 private reserve(path: string, scope?: string): void {
  requireReview(!this.active.has(path), 'reviewId', 'already-running');
  requireReview(scope !== undefined ? !this.cleaning.has(scope) : this.cleaning.size === 0, 'storyId', 'cleanup-in-progress');
  this.active.set(path, null);
  this.storyWork.set(path, scope);
 }
 constructor(private readonly deps: TaskReviewDeps) {}
 async start(project: string, reviewId: string, attempt: number, input?: unknown, context?: { provider?: () => LLMProvider; epicHash?: string; operation?: ReviewOperation }): Promise<ReviewAcknowledgement> {
  let provider: LLMProvider | undefined;
  const providerForReview = () => provider ??= (context?.provider ?? this.deps.provider)();
  const admitted = await this.admit(project, reviewId, attempt, input, 'daemon', context?.epicHash, context?.operation, () => requireReviewActivity(providerForReview()));
  const { path, checkpoint, attempt: entry, prepared } = admitted;
  const metadata = (): ReviewAcknowledgement => ({ reviewId, attempt: entry.header.attempt, reviewer: 'daemon', path, status: entry.header.status, crPublication: entry['review-response'].crPublication, completedTaskIds: entry['review-response'].tasks.map(task => task.taskId), pendingTaskIds: entry.header.selectedTaskIds.filter(id => !entry['review-response'].tasks.some(task => task.taskId === id)) });
  if (entry['review-response'].crPublication === 'complete') { this.release(path); return metadata(); }
  try {
   const done = new Promise<void>(resolve => setImmediate(() => {
    void this.run(admitted, providerForReview).catch(error => {
     // A persistence failure stops scheduling. Never overwrite the last durable task with a fabricated success.
     log.error({ reviewId, error: error instanceof Error ? error.message : String(error) }, 'Task review stopped; last durable checkpoint retained');
    }).finally(() => { this.release(path); resolve(); });
   }));
   this.active.set(path, { checkpoint, attempt: entry, done });
   return metadata();
  } catch (error) { this.release(path); throw error; }
 }
 async startController(project:string,id:string,attempt:number,input:unknown,owner:ControllerReviewOwner,epicHash?:string,operation?:ReviewOperation):Promise<ControllerFrame>{
  requireReview(owner.signal instanceof AbortSignal&&!owner.signal.aborted&&!owner.requestSignal?.aborted,'reviewer','Disconnected or unsupported controller lifetime');owner.assertReviewer?.();
  const admitted=await this.admit(project,id,attempt,input,'controller',epicHash,operation);
  const controller=new ControllerTaskReview(admitted,owner,{...this.deps,onAcceptanceFailure:fence=>this.storageFences.set(admitted.path,fence),release:drop=>{if(this.active.get(admitted.path)?.done===controller.done)this.release(admitted.path);if(drop&&this.controllers.get(admitted.path)===controller)this.controllers.delete(admitted.path);}});
  this.controllers.set(admitted.path,controller);this.active.set(admitted.path,{checkpoint:admitted.checkpoint,attempt:admitted.attempt,done:controller.done});
  return controller.assignment(owner);
 }
 async controllerAssignment(project:string,id:string,attempt:number,owner:ControllerReviewOwner):Promise<ControllerFrame>{return(await this.controller(project,id,attempt)).assignment(owner);}
 async controllerScope(project:string,id:string,attempt:number,input:unknown,owner:ControllerReviewOwner,envelope:unknown):Promise<ControllerFrame>{return(await this.controller(project,id,attempt)).scope(input,owner,envelope);}
 async controllerResult(project:string,id:string,attempt:number,input:unknown,owner:ControllerReviewOwner,envelope:unknown):Promise<ControllerFrame>{return(await this.controller(project,id,attempt)).submit(input,owner,envelope);}
 async controllerActivity(project:string,id:string,attempt:number,input:unknown,owner:ControllerReviewOwner,envelope:unknown):Promise<unknown>{return(await this.controller(project,id,attempt)).activity(input,owner,envelope);}
 /** Read-only: saved feedback is authoritative; live observations never imply a durable result. */
 async progress(project:string,id:string,attempt:number):Promise<ReviewProgressView>{
  requireReview(Number.isSafeInteger(attempt)&&attempt>0,'attempt','Expected positive safe attempt');
  const path=checkpointPath(project,id),saved=await loadStoredCheckpoint(path);
  requireReview(saved&&saved.project===project&&saved.reviewId===id,'checkpoint','Missing or mismatched checkpoint');
  const entry=saved.attempts.find(value=>value.header.attempt===attempt);requireReview(entry,'attempt','Missing attempt');
  if(isCodeAdmission(entry))return{reviewId:id,attempt,status:entry.header.status,crPublication:'pending',executionState:'inactive',
   completedTasks:0,totalTasks:0,interrupted:entry.header.status==='interrupted'||['pending','running'].includes(entry.header.status),hasError:!!entry.error,
   freshness:'stale',progress:entry.progress,admission:{validation:'unverified',...(entry.error?{error:entry.error}:{})}};
  const active=this.active.get(path),owned=active?.attempt.header.attempt===attempt;
  const controller=owned&&active?.attempt.header.reviewer==='controller'?this.controllers.get(path):undefined;
  const tracker=owned?(controller?.progress??active?.progress):undefined;
  const progress=tracker?.snapshot()??entry.progress??null;
  const completed=entry['review-response'].tasks.length;
  const warning=owned?(controller?.progressPersistence.warning??active?.persistence?.warning):undefined;
  return {reviewId:id,attempt,status:entry.header.status,crPublication:entry['review-response'].crPublication,
   executionState:owned?'active':this.active.has(path)&&active===null?'starting':'inactive',
   completedTasks:completed,totalTasks:entry.header.selectedTaskIds.length,interrupted:entry.header.interrupted===true,
   hasError:!!entry['review-response'].error,freshness:tracker?'live':progress?'stale':'unknown',
   progress:progress?{...progress,completedTasks:completed}:null,...(warning?{warning}:{})};
 }
 private async controller(project:string,id:string,attempt:number):Promise<ControllerTaskReview>{
  const path=checkpointPath(project,id);
  const saved=await loadCheckpoint(path);requireReview(saved,'checkpoint','missing-checkpoint');
  requireReview(saved.attempts.at(-1)?.header.reviewer==='controller','reviewer','wrong-reviewer');
  requireReview(saved.attempts.at(-1)?.header.attempt===attempt,'attempt','Attempt mismatch');
  const controller=this.controllers.get(path);requireReview(controller,'checkpoint','Controller state unavailable; explicit retrigger is required');return controller;
 }
 private async admit(project: string, reviewId: string, attempt: number, input: unknown, reviewer: 'daemon' | 'controller', epicHash?: string, operation?: ReviewOperation, preflight?: () => void): Promise<AdmittedReview> {
  const path = checkpointPath(project, reviewId);
  const story = input && typeof input === 'object' ? (input as { storyId?: unknown }).storyId : undefined;
  const scope = epicHash && typeof story === 'string' ? this.storyKey(project, epicHash, story) : undefined;
  this.reserve(path, scope); // Reserve before any awaited admission or provider use.
  try {
   const admitted = await prepareReviewAdmission(project, reviewId, attempt, input, reviewer, this.deps.sources, { epicHash, operation });
   const fence=this.storageFences.get(admitted.path);
   if(fence){
    const visible=await loadCheckpoint(admitted.path);
    if(operation!=='resume'||!visible||(!isDeepStrictEqual(visible,fence.prior)&&!isDeepStrictEqual(visible,fence.candidate)))throw fence.error;
   }
   this.storyWork.set(path, this.storyKey(project, admitted.prepared.epicHash, admitted.checkpoint.storyId));
   if (operation === 'resume' && admitted.attempt['review-response'].crPublication === 'complete') return admitted;
   if (admitted.attempt.header.selectedTaskIds.some(id => !admitted.attempt['review-response'].tasks.some(task => task.taskId === id))) preflight?.();
   const prior = structuredClone(admitted.checkpoint);
   if (operation === 'resume' && admitted.attempt.header.selectedTaskIds.some(id => !admitted.attempt['review-response'].tasks.some(task => task.taskId === id))) {
    admitted.attempt.header.status = 'pending'; delete admitted.attempt.header.interrupted; delete admitted.attempt.header.activeTaskId; delete admitted.attempt.header.completedAt;
   }
   if (fence) await persistAcceptedAttribution(admitted, {...this.deps, onAcceptanceFailure: next => this.storageFences.set(admitted.path, next)}, prior);
   else await (this.deps.save ?? saveCheckpoint)(admitted.path, admitted.checkpoint);
   this.storageFences.delete(admitted.path);
   return admitted;
  } catch (error) { this.release(path); throw error; }
 }
 /** Drop terminal controller replay state only after its checkpoint was deleted. */
 forgetCheckpoint(project: string, reviewId: string): void {
  const path = checkpointPath(project, reviewId);
  requireReview(!this.active.has(path), 'reviewId', 'already-running');
  this.controllers.delete(path);
  this.storageFences.delete(path);
 }
 /** Used by shutdown/tests, never awaited by start or attached to a caller's cancellation. */
 isActive(project: string, reviewId: string): boolean { return this.active.has(checkpointPath(project, reviewId)); }
 async settled(project: string, reviewId: string): Promise<void> { await this.active.get(checkpointPath(project, reviewId))?.done; }
 private async run(review:AdmittedReview, resolveProvider: () => LLMProvider): Promise<void> {
  const {path,checkpoint,attempt:entry,prepared}=review;
  let lastDurable=structuredClone(checkpoint);
  const save:typeof saveCheckpoint=async(savedPath,state,io)=>{
   if(review.storageFailure)throw review.storageFailure;
   if(entry['review-response'].crPublication!=='complete')qualifyReviewCapacity({...review,checkpoint:state,attempt:state.attempts.at(-1)!});
   const snapshot=structuredClone(state);await(this.deps.save??saveCheckpoint)(savedPath,snapshot,io);lastDurable=snapshot;
  };
  const tracker = new ReviewProgressTracker(this.deps.now ? {now:this.deps.now,wall:()=>new Date().toISOString()} : undefined);
  const active=this.active.get(path); if(active)active.progress=tracker;
  const selected = prepared.tasks.filter(task => !prepared.packet.taskId || task.id === prepared.packet.taskId);
  let assignments: readonly TaskAssignment[] | undefined = await restoreAcceptedAssignments(review);
  let attributionFailure: { error: unknown; timedOut: boolean } | undefined = entry.header.attributionState==='failed'?{error:new Error(entry.header.attributionFailure!.summary),timedOut:attributionTimedOut(entry)}:undefined;
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
    if(!origin&&!durable)result=capacityCheckedResult(review,result);
    if(durable){requireReview(isDeepStrictEqual(durable,result),'result','Conflicting accepted submission replay');return;}
    tracker.phase('feedback_persistence');progress.boundary();
    const priorTasks=entry['review-response'].tasks,priorOrigins=entry['review-response'].origins,priorDiagnostics=entry['review-response'].failureDiagnostics;
    entry['review-response'].tasks=[...priorTasks,result];
    if(result.status!=='failed')resolveFailureDiagnostics(entry,'assessment',task.id);
    if(origin)entry['review-response'].origins=[...(priorOrigins??[]),origin];
    delete entry.header.activeTaskId;
    try{await save(path,checkpoint);}catch(error){
     entry['review-response'].tasks=priorTasks;
     if(priorDiagnostics)entry['review-response'].failureDiagnostics=priorDiagnostics;else delete entry['review-response'].failureDiagnostics;
     if(priorOrigins)entry['review-response'].origins=priorOrigins;else delete entry['review-response'].origins;
     entry.header.activeTaskId=task.id;persistenceError=error;throw error;
    }
    durable=result;tracker.phase('task_review',entry['review-response'].tasks.length);
   };
   let nativePhase:FailureDiagnostic['phase']='attribution';
   const options=(phase:FailureDiagnostic['phase'],candidate:(raw:unknown)=>Promise<{accepted:boolean}>):ReviewSessionOpts=>({
    mode:'activity',cwd:checkpoint.project,inactivityMs:REVIEW_INACTIVITY_MS,internalRetry:false,signal:cancellation.signal,
    onDiagnostic:snapshot=>serial(async()=>{check();if(persistenceError)throw persistenceError;if(durable||phase==='attribution'&&assignments)return;try{await persistFailureDiagnostic(review,phase,phase==='assessment'?task.id:undefined,snapshot,()=>save(path,checkpoint));}catch(error){persistenceError=error;throw error;}}),
    codeTaskCommands:codeTaskCommands(prepared,review),onActivity:event=>{if(monitor.observe(event)){const prior=tracker.snapshot().phase;tracker.activity(event,monitor.snapshot().tools.length);progress.request(prior!==tracker.snapshot().phase);}},onCandidate:candidate,
   });
   const flow=(async()=>{
    if(!assignments){
     if(attributionFailure)throw attributionFailure.error;
     const direct=directReviewAssignments(review);
     if(direct){
      const prior=structuredClone(lastDurable);
      const bound=await bindTaskFinalIdentities(review,assignmentsToRows(review,direct));
      try{await persistAcceptedAttribution(review,{...this.deps,save,onAcceptanceFailure:fence=>this.storageFences.set(path,fence)},prior);}catch(error){persistenceError=error;cancellation.abort(error);throw error;}
      assignments=bound;
     }
     if(!assignments){
      const acceptScope=(raw:unknown)=>serial(async()=>{
       check();const priorDiagnostics=entry['review-response'].failureDiagnostics,priorSummary=entry.header.reassessmentSummary,prior=structuredClone(lastDurable);
       let bound:readonly TaskAssignment[];
       try { bound=await bindTaskFinalIdentities(review,assignmentsToRows(review,reviewAssignments(review,raw))); }
       catch (error) {
        if(priorSummary!==undefined)entry.header.reassessmentSummary=priorSummary;else delete entry.header.reassessmentSummary;
        if (!(error instanceof TaskReviewInputError)) throw error;
        try { await recordAttributionRejection(review,error,()=>save(path,checkpoint)); }
        catch (failure) { persistenceError=failure; throw failure; }
        throw error;
       }
       resolveFailureDiagnostics(entry,'attribution');try{await persistAcceptedAttribution(review,{...this.deps,save,onAcceptanceFailure:fence=>this.storageFences.set(path,fence)},prior);}catch(error){
        if(priorDiagnostics)entry['review-response'].failureDiagnostics=priorDiagnostics;else delete entry['review-response'].failureDiagnostics;
        if(priorSummary!==undefined)entry.header.reassessmentSummary=priorSummary;else delete entry.header.reassessmentSummary;
        assignments=undefined;persistenceError=error;cancellation.abort(error);throw error;
       }
       assignments=bound;
       return{accepted:true};
      });
      const provider=resolveProvider();requireReviewActivity(provider);
      for (;;) {
       requireReview((entry.header.attributionRepair?.rejections ?? 0) < MAX_ATTRIBUTION_SUBMISSIONS,'attribution','Attribution correction budget exhausted');
       const priorRejections=entry.header.attributionRepair?.rejections ?? 0;
       try {
        const raw=await provider.runReviewSession!(attributionPrompt(prepared,checkpoint.project,review),attributionSchema(review),options('attribution',acceptScope));
        check();if(!assignments)await acceptScope(raw);
        break;
       } catch (error) {
        check();if(persistenceError)throw persistenceError;
        const cause=error instanceof ReviewOutputFailureError ? error.cause : error;
        if (!(cause instanceof TaskReviewInputError) || !entry.header.attributionRepair || entry.header.attributionRepair.rejections <= priorRejections || entry.header.attributionRepair.rejections >= MAX_ATTRIBUTION_SUBMISSIONS) throw error;
        if(error instanceof ReviewOutputFailureError)await serial(()=>persistFailureDiagnostic(review,'attribution',undefined,error.diagnostic,()=>save(path,checkpoint)));
       }
      }
     }
    }
    tracker.phase('task_review');progress.request(true);
    requireReview(assignments,'attribution','No accepted task mapping');
    const assignment=assignments.find(a=>a.taskId===task.id)!;
    const references=await taskReferences(this.deps.sources,prepared,assignment);check();
    if(assignment.reassessment?.action==='reuse'){
     const reused=await reuseAssessment(review,assignment,this.deps.sources,references);
     await serial(async()=>{check();await commitResult(reused.result,reused.origin);});return;
    }
    nativePhase='assessment';
    const acceptTask=(raw:unknown)=>serial(async()=>{
     check();const assessed=await assessTaskResult(this.deps.sources,assignment,raw,references);
     await commitResult(assessed);return{accepted:true};
    });
    const provider=resolveProvider();requireReviewActivity(provider);
    const raw=await provider.runReviewSession!(assignmentPrompt(prepared,assignment,references,checkpoint.project,review),assignmentResultSchema(assignment),options('assessment',acceptTask));
    if(!durable)await acceptTask(raw);
   })();
   try{await Promise.race([expired,flow]);}
   catch(error){
    if(persistenceError)throw persistenceError;
    if(!durable){
     if(error instanceof ReviewOutputFailureError)await serial(()=>persistFailureDiagnostic(review,nativePhase,nativePhase==='assessment'?task.id:undefined,error.diagnostic,()=>save(path,checkpoint)));
     const inherited=attributionFailure?.timedOut===true&&error===attributionFailure.error;
     const timedOut=inherited||error instanceof ReviewInactivityError||error instanceof ReviewSessionTimeoutError;
     if(!assignments){failAttribution(entry,error,timedOut);attributionFailure={error,timedOut};}
     const message=inherited?'Task could not be attributed because shared attribution exceeded its inactivity grace.':error instanceof ReviewSessionTimeoutError?`Provider session stopped: ${error.message}`:timedOut?'Task has no observed review activity for 30 minutes.':`Reviewer failed: ${error instanceof Error?error.message:String(error)}`;
     await serial(()=>commitResult(assignments?taskFailure(task.id,message,timedOut):unmappedTaskFailure(task.id,timedOut)));
    }else log.warn({reviewId:checkpoint.reviewId,taskId:task.id},'CLI stopped after durable task assessment; retained accepted feedback');
   }finally{
    progress.stop();monitor.stop();cancellation.abort();
    // Do not start another task/provider until the cancelled session releases its resources.
    await flow.catch(()=>{});await tail;tracker.stopped();
   }
  }
  tracker.phase('cr_publication',entry['review-response'].tasks.length);entry.progress=tracker.snapshot();
  const final:AdmittedReview={...review,path,checkpoint,attempt:entry,prepared};
  await completeReview(final,this.deps);
  tracker.phase(final.attempt['review-response'].crPublication==='complete' || !this.deps.publish ? 'complete' : 'error');tracker.stopped();

 }
}
import { assignmentsToRows, bindTaskFinalIdentities, restoreAcceptedAssignments } from './attribution-binding.js';
