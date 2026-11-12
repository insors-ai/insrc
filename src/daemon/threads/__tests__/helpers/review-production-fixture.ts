import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { TestContext } from 'node:test';
import type { Worker } from 'node:worker_threads';
import { fixture as codeFixture,hash } from '../../../../workflow/code-review/task-review/__tests__/publication-fixture.js';
import { designFixture } from '../../../../workflow/review/design-review/__tests__/fixtures.js';
import { ProductionReviews,installProductionReviews } from '../../../review-service.js';
import { ThreadServices } from '../../main-services.js';
import { createAdminStatus } from '../../admin-status.js';
import { startReviewWorkerBootstrap } from '../../review-worker-bootstrap.js';
import type { StartedReviewWorker } from '../../review-worker-bootstrap.js';
import { startWorker } from '../../workers.js';
import { IpcServer,directDispatch } from '../../../server.js';
import { startTaskReview,readTaskReviewProgress,exchangeControllerTaskReview,publishStoredTaskReview } from '../../../task-review-rpc.js';
import { designReviewOperation } from '../../../design-review-rpc.js';
import { approvalBroker,createApprovalRpc } from '../../../approval.js';
import { LocalPeer,workerRpc } from './review-clearance-fixture.js';

/** Real production host, concrete permission policy and public socket routes.
 * Only coordinator providers/admission barriers are deterministic fixtures. */
export async function productionFixture(t:TestContext,hang?:'never-ready'|'before-save'){
 const code=await codeFixture(),design=designFixture(t),secondDesign=designFixture(t),thirdDesign=designFixture(t);
 await Promise.all([design,secondDesign,thirdDesign].map(d=>writeFile(join(d.repo,'.insrc/schema.json'),JSON.stringify({version:2}))));
 const info=()=>({startedAt:Date.now(),modelState:{status:'ready'},installedCommit:'fixture'});
 const services=new ThreadServices(info),started=new Map<string,StartedReviewWorker>(),barriers=new Map<string,Int32Array>(),createdWorkers=new Map<string,Worker>();
 const host=new ProductionReviews({services,registeredRepos:async()=>new Set([code.repo,design.repo,secondDesign.repo,thirdDesign.repo]),track:()=>{},
  start:async(svc,input,port,deps)=>{
   const barrier=new Int32Array(new SharedArrayBuffer(32));barriers.set(input.key.reviewId,barrier);
   const hanging=hang&&input.key.reviewId.startsWith('hung-');
   const owner=await startReviewWorkerBootstrap(svc,input,port,{...deps,...(hanging?{schedule:(fn:()=>void)=>{const timer=setTimeout(fn,2000);return()=>clearTimeout(timer);}}:{}),start:(s,n,_script,extra,created)=>startWorker(s,n,hanging?'__tests__/helpers/review-bootstrap-hang':input.key.family==='code'?'../../workflow/code-review/task-review/__tests__/helpers/worker-admission':'../../workflow/review/design-review/__tests__/helpers/worker-admission',{workerData:{...extra!.workerData,beforeSave:hang==='before-save',fixtureResult:code.result,fixtureBarrier:barrier.buffer},transferList:extra!.transferList},w=>{createdWorkers.set(input.key.reviewId,w);created?.(w);})});
   started.set(input.key.reviewId,owner);return owner;
  }});
 installProductionReviews(host);
 const admin=createAdminStatus({snapshot:async()=>services.board.snapshot(),info:async()=>info(),readRepos:async()=>[],readUnattributed:async()=>undefined,firstPublishMs:0});
 const approval=createApprovalRpc(approvalBroker),path=join(code.repo,'production.sock');
 const server=new IpcServer(directDispatch({
  'taskReview.start':startTaskReview,'taskReview.progress':readTaskReviewProgress,'taskReview.publish':publishStoredTaskReview,
  'taskReview.assignment':(p,c)=>exchangeControllerTaskReview(p,c,'assignment'),
  'taskReview.result':(p,c)=>exchangeControllerTaskReview(p,c,'result'),
  'taskReview.activity':(p,c)=>exchangeControllerTaskReview(p,c,'activity'),
  'designReview.start':(p,c)=>designReviewOperation('start',p,c),
  'designReview.progress':(p,c)=>designReviewOperation('progress',p,c),
  'designReview.recover':(p,c)=>designReviewOperation('recover',p,c),
  ...Object.fromEntries((['assignment','plan','result','activity','failure'] as const).map(phase=>[`designReview.${phase}`,(p:unknown,c:import('../../../request-context.js').TrustedRpcContext|undefined)=>designReviewOperation(phase,p,c)])),
  'daemon.status':()=>admin.daemonStatus(),'daemon.threads':()=>admin.threads(),
  'approval.answer':approval.answer,
 },{'approval.subscribe':approval.subscribe}),Date.now,path);
 await server.listen();const peers:LocalPeer[]=[];
 const peer=async()=>{const p=await LocalPeer.connect(path);peers.push(p);return p;};
 const release=async(id:string)=>{
  const owner=started.get(id),barrier=barriers.get(id);if(!owner||!barrier)return;
  Atomics.store(barrier,1,1);Atomics.notify(barrier,1);Atomics.store(barrier,7,1);Atomics.notify(barrier,7);
  if(owner.admission.key.family==='code'&&owner.worker.threadId>0)await workerRpc(owner,'fixture.release');
 };
 t.after(async()=>{for(const id of started.keys())await release(id).catch(()=>{});for(const p of peers)p.close();await server.close();await host.shutdown();code.cleanup();});
 const codeRequest=(id:string)=>({repo:code.repo,epicHash:hash,reviewId:id,attempt:1,packet:code.packet});
 const designRequest=(id:string,choice:0|1|2=0)=>{const d=[design,secondDesign,thirdDesign][choice]!;return{repo:d.repo,reviewId:id,attempt:1,artifactPath:d.json};};
 return{code,design,secondDesign,services,host,started,createdWorkers,barriers,peer,release,codeRequest,designRequest};
}
