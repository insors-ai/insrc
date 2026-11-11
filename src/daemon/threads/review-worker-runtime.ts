/* Copyright (c) Procix Software India. Licensed under the MIT License. */
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
import { DesignReviewCoordinator } from '../../workflow/review/design-review/coordinator.js';
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

/** A dedicated instance, never the class singleton/session runtime. Source
 * qualification and controller authority adapters are integrated by t9/t10. */
export async function runReviewWorker(init:ReviewWorkerInit):Promise<void>{
 if(!parentPort||init.role!=='review')throw new Error('Dedicated review worker required');
 assertReviewIdentity(init.review);
 const hub=startDaemonWorker(init),board=new StatusBoardClient(hub);
 setRunBoard(board);setIndexRunSource(pushedIndexRun);
 setLiveRunPublisher((runId,live)=>board.markAnalyzeRun(runId,threadId,live));
 registerBuiltinTools();registerBuiltinTemplates();registerBuiltinRuntimes();
 const transport=new ReviewWorkerNativeTransport(init.nativePort,init.review);
 const controllerLifetime=new AbortController();
 await withReviewNativeTransport(transport,async()=>{
  const provider=()=>createRoleRouter({cliTimeoutMs:900000}).resolveProviderForRole('review',loadAnalyzeConfig(),init.review.key.project).provider;
  const coordinator=init.review.key.family==='code'
   ?new TaskReviewCoordinator({sources:new RegistryReviewSources({repoPath:init.review.key.project,sessionId:`review:${init.review.key.reviewId}`,requestId:0,send:()=>{}}),provider})
   :new DesignReviewCoordinator();
  const identity=(raw:unknown):Record<string,unknown>=>{
   if(!raw||typeof raw!=='object'||!sameReviewWorker(init.review,raw as ReviewWorkerIdentity))throw new Error('Foreign or stale review worker operation');
   return raw as Record<string,unknown>;
  };
  const handlers:RpcHandlers={
   'review.worker.control':async(raw,context)=>{
    const p=identity(raw);
    if(init.review.reviewer!=='controller'||!context?.reviewOwnerNonce||p['attempt']!==init.review.attempt)throw new Error('Trusted reviewing owner required');
    const owner={id:context.reviewOwnerNonce,signal:controllerLifetime.signal};
    const phase=p['phase'],project=init.review.key.project,id=init.review.key.reviewId,attempt=init.review.attempt;
    if(coordinator instanceof TaskReviewCoordinator){
     const envelope={taskId:p['taskId'],executionId:p['executionId'],sequence:p['sequence']};
     if(phase==='assignment')return coordinator.controllerAssignment(project,id,attempt,owner);
     if(phase==='scope')return coordinator.controllerScope(project,id,attempt,p['input'],owner,envelope);
     if(phase==='result')return coordinator.controllerResult(project,id,attempt,p['input'],owner,envelope);
     if(phase==='activity')return coordinator.controllerActivity(project,id,attempt,p['input'],owner,envelope);
     throw new Error('Invalid code control phase');
    }
    if(!['assignment','plan','impact','result','activity','failure'].includes(String(phase)))throw new Error('Invalid design control phase');
    const payload=p['input'];
    return coordinator.exchange({...((payload&&typeof payload==='object')?payload:{}),phase,repo:project,reviewId:id,attempt,...(phase==='assignment'?{}:{actionId:p['actionId'],executionId:p['executionId'],sequence:p['sequence']})},owner);
   },
   'review.worker.matchAdmission':async(raw:unknown)=>{const p=identity(raw);if(p['attempt']!==init.review.attempt||p['reviewer']!==init.review.reviewer||p['actionId']!==init.review.actionId||!isDeepStrictEqual(p['submitted'],init.review.submitted))throw new Error('Conflicting review admission replay');return persistReviewWorkerAdmission(init.review);},
   'review.worker.resource.open':async(raw:unknown)=>{const p=identity(raw);return updateReviewWorkerResource(init.review,'open',p['reservation'] as ReviewProcessReservation);},
   'review.worker.resource.close':async(raw:unknown)=>{const p=identity(raw);return updateReviewWorkerResource(init.review,'close',p['reservation'] as ReviewProcessReservation,p['closure'] as ConfirmedReviewLeaseClosure);},
   'review.worker.describe':async(raw:unknown)=>{identity(raw);return{key:init.review.key,incarnation:init.review.incarnation,threadId,coordinator:coordinator.constructor.name,nativeBound:!!reviewNativeTransport(),storeOwnerDeclared:isLiveStoreOwnerDeclared(),shellTimeoutMs:getToolSettings().shell.defaultTimeoutMs};},
   'review.worker.progress':async(raw:unknown)=>{
    const params=identity(raw),attempt=params['attempt'];if(!Number.isSafeInteger(attempt)||Number(attempt)<1)throw new Error('Invalid review attempt');
    return coordinator.progress(init.review.key.project,init.review.key.reviewId,Number(attempt));
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
  const receipt=await persistReviewWorkerAdmission(init.review);
  parentPort!.postMessage(receipt);
 });
}
