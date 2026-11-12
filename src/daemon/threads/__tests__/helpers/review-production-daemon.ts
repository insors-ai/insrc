// Disposable production review host. Its test owns its PID and all repositories;
// it never opens the user's daemon socket, databases or run-file guard.
import { readFile,rm } from 'node:fs/promises';
import { ProductionReviews,installProductionReviews } from '../../../review-service.js';
import { ThreadServices } from '../../main-services.js';
import { startReviewWorkerBootstrap } from '../../review-worker-bootstrap.js';
import { startWorker } from '../../workers.js';
import { IpcServer,directDispatch } from '../../../server.js';
import { startTaskReview,readTaskReviewProgress,publishStoredTaskReview } from '../../../task-review-rpc.js';
import { designReviewOperation } from '../../../design-review-rpc.js';
import { approvalBroker,createApprovalRpc } from '../../../approval.js';
import type { StartedReviewWorker } from '../../review-worker-bootstrap.js';
import { inspectReviewResources } from '../../../../workflow/review/resource-recovery.js';
import { workerRpc } from './review-clearance-fixture.js';

const config=JSON.parse(await readFile(process.argv[2]!,'utf8')) as {repos:string[];socket:string;bin:string;results:Record<string,unknown>;git:Record<string,{commit:string;path:string}>};
process.env['PATH']=config.bin+':'+process.env['PATH'];
const services=new ThreadServices(()=>({startedAt:Date.now(),modelState:{status:'ready'},installedCommit:'fixture'}));
const owners=new Map<string,StartedReviewWorker>();
const host=new ProductionReviews({services,registeredRepos:async()=>new Set(config.repos),track:()=>{},start:async(svc,input,port,deps)=>{const worker=await startReviewWorkerBootstrap(svc,input,port,{...deps,start:(s,n,_script,extra,created)=>startWorker(s,n,'__tests__/helpers/review-production-native',{workerData:{...extra!.workerData,fixtureResult:config.results[input.key.project],fixtureGit:config.git[input.key.project]},transferList:extra!.transferList},created)});owners.set(input.key.reviewId,worker);return worker;}});
installProductionReviews(host);const approval=createApprovalRpc(approvalBroker);
await rm(config.socket,{force:true});
const server=new IpcServer(directDispatch({'taskReview.start':startTaskReview,'taskReview.progress':readTaskReviewProgress,'taskReview.publish':publishStoredTaskReview,
 'fixture.terminate':async raw=>{const id=(raw as {reviewId:string}).reviewId,w=owners.get(id);if(!w)throw Error('Fixture review not owned');await w.worker.terminate();await w.reclaimed;
  if(!(await inspectReviewResources(w.admission.key)).remaining){const end=Date.now()+5000;while(host.registry.identity(w.admission.key)&&Date.now()<end)await new Promise(r=>setTimeout(r,10));if(host.registry.identity(w.admission.key))throw Error('Fixture owner not reclaimed');}return{terminated:true};},
 'fixture.bypass':async raw=>{const w=owners.get((raw as {reviewId:string}).reviewId);if(!w)throw Error('Fixture review not owned');return workerRpc(w,'test.review.native',{...w.admission,probe:'missing'});},
 'designReview.start':(p,c)=>designReviewOperation('start',p,c),'designReview.recover':(p,c)=>designReviewOperation('recover',p,c),'designReview.progress':(p,c)=>designReviewOperation('progress',p,c),'approval.answer':approval.answer}, {'approval.subscribe':approval.subscribe}),Date.now,config.socket);
await server.listen();process.send?.({ready:true,socket:config.socket});
process.on('message',message=>{if(message==='stop')void(async()=>{await server.close();await host.shutdown();process.exit(0);})();});
