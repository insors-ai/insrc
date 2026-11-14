/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { stat } from 'node:fs/promises';
import { reviewWorkerCheckpoint } from './review-worker-contract.js';
import { parentPort,threadId,workerData } from 'node:worker_threads';
import { withReviewNativeTransport,withoutReviewNativeTransport,reviewNativeTransport } from '../../shared/review-process-bridge.js';
import { ReviewWorkerNativeTransport } from './review-worker-native.js';
import { startDaemonWorker,pushedIndexRun } from './worker-entry.js';
import { StatusBoardClient } from './status-board.js';
import { setRunBoard } from '../workflow-run-registry.js';
import { setLiveRunPublisher } from '../../analyze/orchestrator/live-runs.js';
import { setIndexRunSource } from '../../indexer/run-record.js';
import { serveRequests } from './worker-requests.js';
import { directDispatch } from '../server.js';
import type { RpcHandlers } from '../server.js';
import { assertReviewIdentity,sameReviewWorker } from './review-worker-contract.js';
import type { ReviewWorkerInit,ReviewWorkerIdentity } from './review-worker-contract.js';
import { persistReviewWorkerAdmission } from './review-worker-admission.js';
import { TaskReviewCoordinator } from '../../workflow/code-review/task-review/coordinator.js';
import { RegistryReviewSources } from '../../workflow/code-review/task-review/sources.js';
import { createRoleRouter } from '../../analyze/context/role-router.js';
import { loadAnalyzeConfig } from '../../config/analyze.js';
import { registerBuiltinTools } from '../tools/builtins/index.js';
import { registerBuiltinTemplates } from '../../analyze/planner/templates/bootstrap.js';
import { registerBuiltinRuntimes } from '../../analyze/runtimes/bootstrap.js';
import { isLiveStoreOwnerDeclared } from '../../db/graph/store.js';
import { getToolSettings } from '../tools/config.js';
import { updateReviewWorkerResource } from './review-worker-resources.js';
import type { ReviewProcessReservation, ConfirmedReviewLeaseClosure } from '../../shared/review-native.js';
import { isDeepStrictEqual } from 'node:util';
import { CodeReviewWorker } from '../../workflow/code-review/task-review/worker-admission.js';
import type { TaskReviewDeps } from '../../workflow/code-review/task-review/coordinator.js';
import { updateStoredCodeCheckpoint,loadStoredCheckpoint,checkpointPath } from '../../workflow/code-review/task-review/checkpoint.js';
import { isCodeAdmission } from '../../workflow/code-review/task-review/contracts.js';
import { DesignReviewWorker } from '../../workflow/review/design-review/worker-admission.js';
import type { DesignCoordinatorDeps } from '../../workflow/review/design-review/coordinator.js';
import { loadStoredDesignCheckpoint,qualifiedDesignProjection } from '../../workflow/review/design-review/checkpoint.js';
import { isDesignAdmission } from '../../workflow/review/design-review/contracts.js';
import { reviewProgressPublication } from './review-progress.js';
import { requireClosedReviewResources } from '../../workflow/review/resource-recovery.js';
import { publishTaskCheckpoint } from '../../workflow/code-review/task-review/publication.js';
import { publishDesignReview } from '../../workflow/review/design-review/publication.js';
import { roundWriterFor } from '../lifecycle-registry.js';
import { saveWorkerCodeCheckpoint } from '../../workflow/code-review/task-review/worker-checkpoint.js';
import { recordDesignAdmission } from '../../workflow/review/design-review/approval.js';
import { familyForClient } from '../model-registry.js';

/** A dedicated instance, never the class singleton/session runtime. Source
 * qualification and controller authority adapters are integrated by t9/t10. */
export async function runReviewWorker(init:ReviewWorkerInit,deps:{readonly code?:TaskReviewDeps|undefined;readonly design?:DesignCoordinatorDeps|undefined}={}):Promise<void>{
 if(!parentPort||init.role!=='review')throw new Error('Dedicated review worker required');
 assertReviewIdentity(init.review);
 if(init.review.key.family==='code'&&init.review.operation==='resume'&&init.review.submitted===undefined){
  const cp=await loadStoredCheckpoint(reviewWorkerCheckpoint(init.review.key)),last=cp?.attempts.at(-1);
  if(!last||last.header.attempt!==init.review.attempt)throw new Error('Pinned resume attempt missing');
  init={...init,review:{...init.review,submitted:last.submitted}};
 }
 const hub=startDaemonWorker(init),board=new StatusBoardClient(hub);
 setRunBoard(board);setIndexRunSource(pushedIndexRun);
 setLiveRunPublisher((runId,live)=>board.markAnalyzeRun(runId,threadId,live));
 registerBuiltinTools();registerBuiltinTemplates();registerBuiltinRuntimes();
 const transport=new ReviewWorkerNativeTransport(init.nativePort,init.review);
 const controllerLifetime=new AbortController();
 await withReviewNativeTransport(transport,async()=>{
  const router=()=>createRoleRouter({clientDefault:familyForClient(init.review.route?.client),cliTimeoutMs:900000});
  const provider=()=>router().resolveProviderForRole('review',loadAnalyzeConfig(),init.review.key.project).provider;
  const sources=deps.code?.sources??new RegistryReviewSources({repoPath:init.review.key.project,sessionId:`review:${init.review.key.reviewId}`,requestId:0,send:()=>{}});
  const publishCode=(project:string,id:string,hash:string,baseline?:import('../../workflow/code-review/task-review/capacity.js').CapacityBaseline)=>publishTaskCheckpoint(project,hash,id,{sources,through:roundWriterFor(project,{id:'insrc:code-review',kind:'system',properties:{}}),save:saveWorkerCodeCheckpoint,saveStored:async(path,candidate)=>{await updateStoredCodeCheckpoint(path,current=>{
   if(!current||current.attempts.length!==candidate.attempts.length)throw new Error('Publication checkpoint changed');
   return{...candidate,schemaVersion:2,attempts:candidate.attempts.map(a=>{const guard=current.attempts.find(c=>c.header.attempt===a.header.attempt)?.resourceGuard;return guard?{...a,resourceGuard:guard}:a;})};
  });},...(baseline?{baseline}:{})});
  const code=init.review.key.family==='code'?new CodeReviewWorker(init.review,deps.code??{sources,provider,publish:publishCode},init.review.epicHash):undefined;
  const publishDesign:typeof publishDesignReview=async input=>{
   const stored=await loadStoredDesignCheckpoint(input.project,input.reviewId);
   if(!stored||!isDeepStrictEqual(qualifiedDesignProjection(stored),input))throw new Error('Publication projection no longer matches the durable design evidence');
   return publishDesignReview(stored);
  };
  const design=init.review.key.family==='design'?new DesignReviewWorker(init.review,deps.design?{...deps.design,publish:init.review.maintenance?publishDesign:deps.design.publish??publishDesign}:{admit:recordDesignAdmission,publish:publishDesign,provider:()=>{const resolved=router().resolveProviderForRole('review',loadAnalyzeConfig(),init.review.key.project);return{provider:resolved.provider,model:resolved.resolution.model};}}):undefined;
  const coordinator=code?.coordinator??design!.coordinator;
  let progressSequence=0,publishing=false,maintenanceWork=false,publishingStored=false,lastProgressStamp:string|undefined,observationAttempt=init.review.attempt;
  const snapshot=async()=>{
   const observation=code?await code.progress():await design!.progress();
   if(design)observationAttempt=design.currentAttempt();
   // This worker owns the live admission even before execute has been requested.
   if(code&&observation.admission&&observation.status==='pending')Object.assign(observation,{interrupted:false,executionState:'starting',freshness:'live'});
   if(publishingStored&&!observation.admission){
    if(code){Object.assign(observation,{status:'running',executionState:'active',crPublication:'pending'});if('progress'in observation&&observation.progress)Object.assign(observation.progress,{phase:'cr_publication',observedAt:new Date().toISOString()});}
    else Object.assign(observation,{status:'running',phase:'publishing',observedAt:new Date().toISOString(),requiresUserInput:false});
   }
   return reviewProgressPublication({...init.review,attempt:observationAttempt},++progressSequence,observation);
  };
  const publish=async()=>{if(publishing)return;publishing=true;try{const file=await stat(reviewWorkerCheckpoint(init.review.key),{bigint:true});const stamp=`${file.ino}:${file.mtimeNs}:${file.ctimeNs}:${file.size}`;if(stamp===lastProgressStamp)return;parentPort!.postMessage(await snapshot());lastProgressStamp=stamp;}catch{/* Preserve the last validated snapshot; no fabricated completion. */}finally{publishing=false;}};
  const identity=(raw:unknown):Record<string,unknown>=>{
   if(!raw||typeof raw!=='object'||!sameReviewWorker(init.review,raw as ReviewWorkerIdentity))throw new Error('Foreign or stale review worker operation');
   return raw as Record<string,unknown>;
  };
  const handlers:RpcHandlers={
   'review.worker.disconnect':async raw=>{
    identity(raw);
    if(init.review.reviewer!=='controller')throw new Error('Controller disconnect required');
    controllerLifetime.abort();
    // Existing coordinators own interruption persistence and task feedback.
    // Main bounds this drain before reclaiming an unresponsive worker.
    while(code?.isActive()||design?.isActive())await new Promise(resolve=>setTimeout(resolve,10));
    return{stopped:true};
   },
   'review.worker.assertIdle':async raw=>{identity(raw);if(maintenanceWork||code?.isActive()||design?.isActive())throw new Error('Review admission/execution/publication is active');return true;},
   'review.worker.publish':async raw=>{
    const p=identity(raw);if(typeof p['actionId']!=='string'||!p['actionId']||p['actionId'].length>128)throw new Error('Publication action required');
    if(maintenanceWork||code?.isActive()||design?.isActive())throw new Error('Review admission/execution/publication is active');
    maintenanceWork=true;publishingStored=true;try{
    await requireClosedReviewResources(init.review.key);
    parentPort!.postMessage(await snapshot());
    const {project,reviewId}=init.review.key;
    if(code){if(!init.review.epicHash)throw new Error('Stored code publication requires its epic scope');return await publishCode(project,reviewId,init.review.epicHash);}
    return await design!.coordinator.recover({phase:'recover',repo:project,reviewId,attempt:init.review.attempt,actionId:p['actionId'],operation:'retry_publication'});
    }catch(error){
     if(code)await updateStoredCodeCheckpoint(reviewWorkerCheckpoint(init.review.key),current=>{
      const last=current?.attempts.at(-1);if(!current||!last||isCodeAdmission(last)||last.header.status==='failed')return current!;
      last['review-response'].crPublication='pending';last['review-response'].error=(error instanceof Error?error.message:String(error)).slice(0,2048);return current;
     });
     throw error;
    }finally{maintenanceWork=false;publishingStored=false;try{parentPort!.postMessage(await snapshot());}catch{/* Preserve durable publication failure if observation cannot be refreshed. */}}
   },
   'review.worker.cleanup':async raw=>{
    const p=identity(raw);if(maintenanceWork||code?.isActive()||design?.isActive())throw new Error('Review work is active');
    maintenanceWork=true;try{
     await requireClosedReviewResources(init.review.key);
     if(code){
      if(!init.review.epicHash||typeof p['storyId']!=='string')throw new Error('Canonical cleanup story required');
      const {cleanupTaskReviewsInOwner}=await import('../task-review-rpc.js');
      return await cleanupTaskReviewsInOwner({repo:init.review.key.project,epicHash:init.review.epicHash,storyId:p['storyId']},init.review.key.reviewId);
     }
     if(typeof p['artifactId']!=='string'||p['artifactId']!==init.review.subject)throw new Error('Canonical cleanup artifact required');
     const {cleanupDesignArtifact}=await import('../../workflow/review/design-review/cleanup.js');
     return await cleanupDesignArtifact(init.review.key.project,p['artifactId'],{ownerReviewId:init.review.key.reviewId});
    }finally{maintenanceWork=false;}
   },
   'review.worker.advance':async raw=>{
    const p=identity(raw);
    if(design){
     const cp=await loadStoredDesignCheckpoint(init.review.key.project,init.review.key.reviewId),last=cp?.attempts.at(-1);
     const technical=last&&!isDesignAdmission(last)&&last.status==='failed'&&last.failure;
     if(!last||p['attempt']!==last.number||p['nextAttempt']!==last.number+1||design.isActive()||cp!.attempts.some(a=>'resourceGuard'in a&&a.resourceGuard?.openLeases.length)||['pending','running'].includes(last.status)||!isDesignAdmission(last)&&!technical&&last.publication?.state!=='complete')throw new Error('Previous design attempt is active, unpublished or resource-fenced');
     return{nextAttempt:p['nextAttempt']};
    }
    if(!code||p['attempt']!==init.review.attempt||p['nextAttempt']!==init.review.attempt+1)throw new Error('Invalid review advance');
    const cp=await loadStoredCheckpoint(checkpointPath(init.review.key.project,init.review.key.reviewId)),last=cp?.attempts.at(-1);
    if(!last||last.header.attempt!==init.review.attempt||code.isActive()||cp!.attempts.some(a=>a.resourceGuard?.openLeases.length)||['pending','running'].includes(last.header.status)||!isCodeAdmission(last)&&last.header.status!=='failed'&&last['review-response'].crPublication!=='complete')throw new Error('Previous attempt is active, unpublished or resource-fenced');
    return{nextAttempt:p['nextAttempt']};
   },
   'review.worker.recover':async(raw,context)=>{
    const p=identity(raw);if(!design||!context?.reviewOwnerNonce)throw new Error('Trusted design recovery required');
    const result=await design.recover(p['request'],init.review.reviewer==='controller'?{id:context.reviewOwnerNonce,signal:controllerLifetime.signal}:undefined);observationAttempt=result.attempt;return result;
   },
   'review.worker.execute':async(raw,context)=>{
    if(init.review.maintenance)throw new Error('Stored-evidence worker cannot execute a reviewer');
    const p=identity(raw);
    if(p['attempt']!==init.review.attempt||!['start','resume'].includes(String(p['operation'])))throw new Error('Invalid review execution');
    if(!context?.reviewOwnerNonce)throw new Error('Trusted review execution required');
    if(init.review.operation==='resume'&&p['operation']!=='resume')throw new Error('Recovery admission requires explicit resume execution');
    const owner=init.review.reviewer==='controller'?{id:context.reviewOwnerNonce,signal:controllerLifetime.signal}:undefined;
    if(code){if(p['operation']==='resume')await code.assertResume();code.execute(owner,p['operation'] as 'start'|'resume');}
    else{
     if(init.review.submitted&&typeof init.review.submitted==='object'&&Reflect.get(init.review.submitted,'phase')==='recover'){const result=await design!.recover(init.review.submitted,owner);observationAttempt=result.attempt;return result;}
     if(p['operation']!=='start')throw new Error('Design recovery requires its typed recovery action');design!.execute(owner);
    }
    return{accepted:true,...init.review.key,attempt:init.review.attempt};
   },
   'review.worker.control':async(raw,context)=>{
    if(init.review.maintenance)throw new Error('Stored-evidence worker cannot allocate reviewer assignments');
    const p=identity(raw);
    if(init.review.reviewer!=='controller'||!context?.reviewOwnerNonce||code&&p['attempt']!==init.review.attempt||!Number.isSafeInteger(p['attempt'])||Number(p['attempt'])<1)throw new Error('Trusted reviewing owner required');
    const owner={id:context.reviewOwnerNonce,signal:controllerLifetime.signal};
    const phase=p['phase'],project=init.review.key.project,id=init.review.key.reviewId,attempt=Number(p['attempt']);
    if(coordinator instanceof TaskReviewCoordinator){
     if(phase==='assignment'&&code){const observation=await code.progress();if(code.isPreparing()||observation.admission)return observation;}
     const envelope={taskId:p['taskId'],executionId:p['executionId'],sequence:p['sequence']};
     if(phase==='assignment')return coordinator.controllerAssignment(project,id,attempt,owner);
     if(phase==='scope')return coordinator.controllerScope(project,id,attempt,p['input'],owner,envelope);
     if(phase==='result')return coordinator.controllerResult(project,id,attempt,p['input'],owner,envelope);
     if(phase==='activity')return coordinator.controllerActivity(project,id,attempt,p['input'],owner,envelope);
     throw new Error('Invalid code control phase');
    }
    if(phase==='assignment'&&design){const observation=await design.progress();if(design.isPreparing()||observation.admission)return{...observation,assignment:null};}
    if(!['assignment','plan','impact','result','activity','failure'].includes(String(phase)))throw new Error('Invalid design control phase');
    const payload=p['input'];
    return coordinator.exchange({...((payload&&typeof payload==='object')?payload:{}),phase,repo:project,reviewId:id,attempt,...(phase==='assignment'?{}:{executionId:p['executionId'],sequence:p['sequence']})},owner);
   },
   'review.worker.matchAdmission':async(raw:unknown)=>{
    const p=identity(raw),omittedResume=!!code&&p['operation']==='resume'&&p['submitted']===undefined;
    if(p['attempt']!==init.review.attempt||p['reviewer']!==init.review.reviewer||p['actionId']!==init.review.actionId||!omittedResume&&!isDeepStrictEqual(p['submitted'],init.review.submitted))throw new Error('Conflicting review admission replay');
    if(!code)return persistReviewWorkerAdmission(init.review);
    const {reviewWorkerCheckpoint}=await import('./review-worker-contract.js');
    const path=reviewWorkerCheckpoint(init.review.key);
    await updateStoredCodeCheckpoint(path,current=>{const last=current?.attempts.at(-1);if(!last||last.header.attempt!==init.review.attempt||last.header.reviewer!==init.review.reviewer||!isDeepStrictEqual(last.submitted,init.review.submitted))throw new Error('Conflicting saved review admission');return current!;});
    return{kind:'review-admission-saved',key:init.review.key,incarnation:init.review.incarnation,attempt:init.review.attempt,checkpointPath:path};
   },
   'review.worker.resource.open':async(raw:unknown)=>{const p=identity(raw);return updateReviewWorkerResource(init.review,'open',p['reservation'] as ReviewProcessReservation);},
   'review.worker.resource.close':async(raw:unknown)=>{const p=identity(raw);return updateReviewWorkerResource(init.review,'close',p['reservation'] as ReviewProcessReservation,p['closure'] as ConfirmedReviewLeaseClosure);},
   'review.worker.describe':async(raw:unknown)=>{identity(raw);return{key:init.review.key,incarnation:init.review.incarnation,threadId,coordinator:coordinator.constructor.name,nativeBound:!!reviewNativeTransport(),storeOwnerDeclared:isLiveStoreOwnerDeclared(),shellTimeoutMs:getToolSettings().shell.defaultTimeoutMs};},
   'review.worker.progress':async(raw:unknown)=>{
    const params=identity(raw),attempt=params['attempt'];if(!Number.isSafeInteger(attempt)||Number(attempt)<1)throw new Error('Invalid review attempt');
    return code?code.progress():design!.progress();
   },
  };
  if(process.env['INSRC_TEST_HOOKS']==='1')handlers['test.review.native']=async raw=>{
   const params=identity(raw);
   if(params['probe']==='role')return{changed:Reflect.set(workerData,'role','session'),role:workerData.role};
   if(params['probe']==='missing')return withoutReviewNativeTransport(async()=>{const {runShell}=await import('../tools/shell-helper.js');return runShell([process.execPath,'-e',"process.stdout.write('forbidden')"]);});
   if(params['probe']==='cli'){
    const {CliProvider}=await import('../../agent/providers/cli-provider.js');
    return new CliProvider({kind:'claude',binPath:'bootstrap-fixture-cli'}).runReviewSession('fixture',{type:'object',properties:{ok:{type:'boolean'}},required:['ok'],additionalProperties:false},{mode:'activity',cwd:init.review.key.project,signal:new AbortController().signal,inactivityMs:1800000,internalRetry:false,onActivity:()=>{},onCandidate:async()=>({accepted:true})});
   }
   if(params['probe']==='tool'){
    const {runShellBytes}=await import('../tools/shell-helper.js');
    return runShellBytes([process.execPath,'-e','process.stdin.pipe(process.stdout)'],{cwd:init.review.key.project,stdin:new Uint8Array([0,255,128,10]),timeoutMs:1000});
   }
   if(params['probe']==='hold'){
    const {runShellBytes}=await import('../tools/shell-helper.js');
    return runShellBytes([process.execPath,'-e',"process.stdout.write('started');setInterval(()=>{},1000)"],{cwd:init.review.key.project,timeoutMs:60000});
   }
   throw new Error('Unknown native bootstrap probe');
  };
  const dispatch=directDispatch(handlers);
  serveRequests(parentPort!,(request,deliver)=>withReviewNativeTransport(transport,()=>dispatch(request,deliver)));
  parentPort!.postMessage('worker-ready');
  await requireClosedReviewResources(init.review.key);
  let receipt;
  if(init.review.maintenance){
   const cp=code?await loadStoredCheckpoint(reviewWorkerCheckpoint(init.review.key)):await loadStoredDesignCheckpoint(init.review.key.project,init.review.key.reviewId);
   const last=cp?.attempts.at(-1);const attempt=last&&('header'in last?last.header.attempt:last.number);
   if(!cp||attempt!==init.review.attempt)throw new Error('Stored review attempt does not match maintenance request');
   receipt={kind:'review-admission-saved' as const,key:init.review.key,incarnation:init.review.incarnation,attempt:init.review.attempt,checkpointPath:reviewWorkerCheckpoint(init.review.key)};
  }else receipt=await persistReviewWorkerAdmission(init.review);
  parentPort!.postMessage({...receipt,progress:await snapshot()});
  setInterval(()=>{void publish();},500).unref();
 });
}
