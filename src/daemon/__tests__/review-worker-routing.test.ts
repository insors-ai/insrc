import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { fixture,hash } from '../../workflow/code-review/task-review/__tests__/publication-fixture.js';
import { designFixture } from '../../workflow/review/design-review/__tests__/fixtures.js';
import { ProductionReviews,installProductionReviews } from '../review-service.js';
import { ThreadServices } from '../threads/main-services.js';
import { startReviewWorkerBootstrap } from '../threads/review-worker-bootstrap.js';
import { startWorker } from '../threads/workers.js';
import { startTaskReview,readTaskReviewProgress,exchangeControllerTaskReview,publishStoredTaskReview } from '../task-review-rpc.js';
import { designReviewOperation } from '../design-review-rpc.js';
import { handleTaskReviewStep } from '../steps/task-review-step.js';

test('every supported review method delegates heavy work to its dedicated owner',async t=>{
 const code=await fixture(),design=designFixture(t,'daemon');t.after(code.cleanup);
 code.build.meta.authoredBy='daemon';code.put(`.insrc/artifacts/BUILD-${hash}-s1.json`,code.build);
 await writeFile(`${design.repo}/.insrc/schema.json`,JSON.stringify({version:2}));
 const calls=new Int32Array(new SharedArrayBuffer(4)),owners=new Map<string,number>();
 const services=new ThreadServices(()=>({startedAt:0,modelState:{status:'ready'},installedCommit:'fixture'}));
 const host=new ProductionReviews({services,registeredRepos:async()=>new Set([code.repo,design.repo]),track:()=>{},
  start:(svc,input,port,deps)=>startReviewWorkerBootstrap(svc,input,port,{...deps,start:(s,n,_script,extra,created)=>startWorker(s,n,'__tests__/helpers/review-maintenance',{workerData:{...extra!.workerData,calls:calls.buffer},transferList:extra!.transferList},w=>{owners.set(input.key.reviewId,w.threadId);created?.(w);})})});
 installProductionReviews(host);t.after(()=>host.shutdown());
 const context={connectionIdentity:'route-owner',daemonEpoch:'route-epoch',connectionSignal:new AbortController().signal};
 const c={repo:code.repo,epicHash:hash,reviewId:'route-code',attempt:1};
 const d={repo:design.repo,reviewId:'route-design',attempt:1};
 const ack=await startTaskReview({...c,packet:code.packet,timingProtocol:'activity-v1'},context) as {reviewer:string};
 assert.equal(ack.reviewer,'controller');
 const designAck=await designReviewOperation('start',{...d,artifactPath:design.json},context) as {checkpointPath:string};
 assert.ok(owners.get(c.reviewId)!>0);assert.ok(owners.get(d.reviewId)!>0);
 assert.notEqual(owners.get(c.reviewId),owners.get(d.reviewId));
 const until=async(fn:()=>Promise<any>)=>{const end=Date.now()+10000;while(true){try{const result=await fn();if(result.kind&&result.kind!=='pending')return result;}catch(error){if(Date.now()>end)throw error;}if(Date.now()>end)throw Error('Assignment unavailable');await new Promise(r=>setTimeout(r,20));}};
 const frame=await until(()=>exchangeControllerTaskReview(c,context,'assignment'));assert.equal(frame.taskId,'t1');
 const progress=await readTaskReviewProgress(c,context);assert.ok(progress);
 const mcp=await handleTaskReviewStep({...c,phase:'progress'},context);assert.ok(JSON.parse(mcp.content[0]!.text));
 await assert.rejects(exchangeControllerTaskReview({...c,result:{}},{...context,connectionIdentity:'foreign'},'result'),/owner|reviewer|connection/i);
 const completed=await exchangeControllerTaskReview({...c,taskId:frame.taskId,executionId:frame.executionId,sequence:frame.nextSequence,result:code.result},context,'result') as {kind:string};
 assert.equal(completed.kind,'done');
 assert.ok(await publishStoredTaskReview(c,context));
 const assignment=async()=>{
  const end=Date.now()+10000;
  while(Date.now()<end){const value=await designReviewOperation('assignment',d,context) as any;if(value.assignment)return value.assignment;await new Promise(r=>setTimeout(r,20));}
  throw Error('Design assignment unavailable');
 };
 const first=await assignment(),selectors=design.prepared.inventory.units.map(u=>u.id);
 const plan={chunks:[{id:'content',title:'Content',selectors,concerns:['Requirements'],dependsOn:[],purpose:'substantive'},{id:'final',title:'Consistency',selectors:[],concerns:['Consistency'],dependsOn:['content'],purpose:'consistency'}],coverageExplanation:'Complete content then consistency',finalConsistencyChunkId:'final',coverage:selectors.map(unitId=>({unitId,chunkIds:['content']}))};
 assert.deepEqual(await designReviewOperation('plan',{...d,executionId:first.executionId,sequence:1,plan},context),{accepted:true});
 for(const chunkId of ['content','final']){
  const frame=await assignment();
  assert.deepEqual(await designReviewOperation('result',{...d,executionId:frame.executionId,sequence:1,result:{chunkId,status:'passed',summary:'Reviewed fixture',findings:[],inspectedReferences:[...selectors,design.md,design.json,designAck.checkpointPath],limitations:[],advice:[]}},context),{accepted:true});
 }
 const end=Date.now()+10000;let status='';
 while(Date.now()<end){status=(await designReviewOperation('progress',d,context) as any).status;if(status==='passed')break;await new Promise(r=>setTimeout(r,20));}
 assert.equal(status,'passed');
 assert.equal(Atomics.load(calls,0),0,'controller work never resolves a daemon provider');
});

test('optional session threading disabled cannot enable main or session review fallback',async()=>{
 // No installed live host exists after the preceding shutdown. Both public
 // families must refuse instead of constructing a local coordinator.
 await assert.rejects(async()=>startTaskReview({}),/Dedicated review workers unavailable/);
 await assert.rejects(async()=>designReviewOperation('start',{}),/Dedicated review workers unavailable/);
});
