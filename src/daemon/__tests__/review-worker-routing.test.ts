import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile,mkdtemp,rm,readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PATHS } from '../../shared/paths.js';
import { fixture,hash } from '../../workflow/code-review/task-review/__tests__/publication-fixture.js';
import { designFixture } from '../../workflow/review/design-review/__tests__/fixtures.js';
import { ProductionReviews,installProductionReviews } from '../review-service.js';
import { ThreadServices,threadsEnabled } from '../threads/main-services.js';
import { startReviewWorkerBootstrap } from '../threads/review-worker-bootstrap.js';
import { startWorker } from '../threads/workers.js';
import { startTaskReview,readTaskReviewProgress,exchangeControllerTaskReview,publishStoredTaskReview,cleanupApprovedTaskReviews } from '../task-review-rpc.js';
import { designReviewOperation } from '../design-review-rpc.js';
import { handleTaskReviewStep } from '../steps/task-review-step.js';
import { handleDesignReviewStep } from '../steps/design-review-step.js';
import { cleanupDesignArtifact } from '../../workflow/review/design-review/cleanup.js';
import { saveCheckpoint,checkpointPath,updateStoredCodeCheckpoint } from '../../workflow/code-review/task-review/checkpoint.js';
import { persistReviewWorkerAdmission } from '../threads/review-worker-admission.js';

test('every supported review method delegates heavy work to its dedicated owner',async t=>{
 let cleanDesign=()=>{};const code=await fixture(),design=designFixture({after:fn=>{cleanDesign=fn;}},'daemon');
 code.build.meta.authoredBy='daemon';code.put(`.insrc/artifacts/BUILD-${hash}-s1.json`,code.build);
 await writeFile(`${design.repo}/.insrc/schema.json`,JSON.stringify({version:2}));
 const calls=new Int32Array(new SharedArrayBuffer(4)),owners=new Map<string,number>();
 const services=new ThreadServices(()=>({startedAt:0,modelState:{status:'ready'},installedCommit:'fixture'}));
 const host=new ProductionReviews({services,registeredRepos:async()=>new Set([code.repo,design.repo]),track:()=>{},
  start:(svc,input,port,deps)=>startReviewWorkerBootstrap(svc,input,port,{...deps,start:(s,n,_script,extra,created)=>startWorker(s,n,'__tests__/helpers/review-maintenance',{workerData:{...extra!.workerData,calls:calls.buffer},transferList:extra!.transferList},w=>{owners.set(input.key.reviewId,w.threadId);created?.(w);})})});
 installProductionReviews(host);t.after(async()=>{await host.shutdown();cleanDesign();code.cleanup();});
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
 await assert.rejects(startTaskReview({...c,operation:'resume',timingProtocol:'activity-v1'},context),/active/);
 await assert.rejects(handleTaskReviewStep({...c,phase:'resume'},context),/active/);
 await assert.rejects(exchangeControllerTaskReview({...c,taskId:frame.taskId,executionId:frame.executionId,sequence:frame.nextSequence,scope:{tasks:[{taskId:'t1',changeIndexes:[0],testIndexes:[0]}]}},context,'scope'));
 const activity=await exchangeControllerTaskReview({...c,taskId:frame.taskId,executionId:frame.executionId,sequence:frame.nextSequence,event:{kind:'model_output'}},context,'activity') as any;
 t.diagnostic(`Code activity accepted: ${JSON.stringify(activity)}`);
 const progress=await readTaskReviewProgress(c,context);assert.ok(progress);
 const mcp=await handleTaskReviewStep({...c,phase:'progress'},context);assert.ok(JSON.parse(mcp.content[0]!.text));
 await assert.rejects(exchangeControllerTaskReview({...c,result:{}},{...context,connectionIdentity:'foreign'},'result'),/owner|reviewer|connection/i);
 const completed=await exchangeControllerTaskReview({...c,taskId:frame.taskId,executionId:frame.executionId,sequence:activity.acceptedSequence+1,result:code.result},context,'result') as {kind:string};
 assert.equal(completed.kind,'done');
 t.diagnostic('Code results completed');
 assert.ok(await publishStoredTaskReview(c,context));
 assert.ok(await handleTaskReviewStep({...c,phase:'start',packet:code.packet},context));
 assert.ok(await handleDesignReviewStep({...d,phase:'start',artifactPath:design.json},context));
 const assignment=async()=>{
  const end=Date.now()+10000;
  while(Date.now()<end){const value=await designReviewOperation('assignment',d,context) as any;if(value.assignment)return value.assignment;await new Promise(r=>setTimeout(r,20));}
  throw Error('Design assignment unavailable');
 };
 const first=await assignment(),selectors=design.prepared.inventory.units.map(u=>u.id);
 t.diagnostic('Design planning assigned');
 await designReviewOperation('activity',{...d,executionId:first.executionId,sequence:1,event:{sessionId:'design-session',sequence:1,kind:'session_started'}},context);
 const plan={chunks:[{id:'content',title:'Content',selectors,concerns:['Requirements'],dependsOn:[],purpose:'substantive'},{id:'final',title:'Consistency',selectors:[],concerns:['Consistency'],dependsOn:['content'],purpose:'consistency'}],coverageExplanation:'Complete content then consistency',finalConsistencyChunkId:'final',coverage:selectors.map(unitId=>({unitId,chunkIds:['content']}))};
 const impact={baselineAttempt:1,mode:'affected_chunks',changes:['Fixture change'],directChunkIds:['content'],indirectChunkIds:[],rationale:'Inspect content and consistency',chunkMapping:[],retainedCoverage:[],carriedFindingIds:[],consistencyChunkIds:['final']};
 await assert.rejects(designReviewOperation('impact',{...d,executionId:first.executionId,sequence:2,plan,impact},context),/assignment/i);
 assert.deepEqual(await designReviewOperation('plan',{...d,executionId:first.executionId,sequence:2,plan},context),{accepted:true});
 for(const chunkId of ['content','final']){
  const frame=await assignment();
  assert.deepEqual(await designReviewOperation('result',{...d,executionId:frame.executionId,sequence:1,result:{chunkId,status:'passed',summary:'Reviewed fixture',findings:[],inspectedReferences:[...selectors,design.md,design.json,designAck.checkpointPath],limitations:[],advice:[]}},context),{accepted:true});
 }
 const end=Date.now()+10000;let status='';
 while(Date.now()<end){status=(await designReviewOperation('progress',d,context) as any).status;if(status==='passed')break;await new Promise(r=>setTimeout(r,20));}
 assert.equal(status,'passed');
 await assert.rejects(designReviewOperation('failure',{...d,executionId:first.executionId,sequence:3,failure:{code:'transport_failed',summary:'Stopped fixture'}},context));
 const recover={...d,phase:'recover',operation:'resume',actionId:'resume-complete'};
 assert.equal((await designReviewOperation('recover',recover,context) as any).attempt,1);
 assert.ok(await handleDesignReviewStep(recover,context));
 const codeCleanup=await cleanupApprovedTaskReviews({repo:code.repo,epicHash:hash,storyId:'s1'});
 assert.equal(codeCleanup.deleted.length,0,'unapproved BUILD cannot clean checkpoints');
 const designCleanup=await cleanupDesignArtifact(design.repo,design.id);
 assert.equal(designCleanup.deleted.length,0,'unapproved design cannot clean checkpoints');
 assert.equal(Atomics.load(calls,0),0,'controller work never resolves a daemon provider');
});

test('optional session threading disabled cannot enable main or session review fallback',async t=>{
 const root=await mkdtemp(join(tmpdir(),'review-session-disabled-')),config=PATHS.config;
 PATHS.config=join(root,'config.json');await writeFile(PATHS.config,JSON.stringify({daemon:{threads:{enabled:false}}}));
 t.after(async()=>{PATHS.config=config;await rm(root,{recursive:true,force:true});});
 assert.equal(threadsEnabled(),false);
 const code=await fixture(),design=designFixture(t,'daemon');t.after(code.cleanup);
 code.build.meta.authoredBy='daemon';code.put(`.insrc/artifacts/BUILD-${hash}-s1.json`,code.build);
 await writeFile(join(design.repo,'.insrc/schema.json'),JSON.stringify({version:2}));
 const calls=new Int32Array(new SharedArrayBuffer(4)),owners:number[]=[];
 // Same unconditional production host constructor used by daemon/index.ts;
 // only the unrelated chat/session routing is disabled by this config.
 const host=new ProductionReviews({services:new ThreadServices(()=>({startedAt:0,modelState:{status:'ready'},installedCommit:'fixture'})),registeredRepos:async()=>new Set([code.repo,design.repo]),track:()=>{},start:(svc,input,port,deps)=>startReviewWorkerBootstrap(svc,input,port,{...deps,start:(s,n,_script,extra,created)=>startWorker(s,n,'__tests__/helpers/review-maintenance',{workerData:{...extra!.workerData,calls:calls.buffer},transferList:extra!.transferList},worker=>{owners.push(worker.threadId);created?.(worker);})})});
 installProductionReviews(host);t.after(()=>host.shutdown());
 const context={connectionIdentity:'disabled-session',daemonEpoch:'epoch',connectionSignal:new AbortController().signal};
 await handleTaskReviewStep({phase:'start',repo:code.repo,epicHash:hash,reviewId:'disabled-code',attempt:1,packet:code.packet},context);
 await handleDesignReviewStep({phase:'start',repo:design.repo,reviewId:'disabled-design',attempt:1,artifactPath:design.json},context);
 assert.equal(owners.length,2);assert.ok(owners.every(id=>id>0));assert.notEqual(owners[0],owners[1]);
 assert.equal(Atomics.load(calls,0),0);
 await host.shutdown();
 await assert.rejects(async()=>startTaskReview({}),/Dedicated review workers unavailable/);
 await assert.rejects(async()=>designReviewOperation('start',{}),/Dedicated review workers unavailable/);
});

test('production resume preserves failed qualified and no-document attempts and requires an explicit new attempt',async t=>{
 const code=await fixture();code.build.meta.authoredBy='daemon';code.put(`.insrc/artifacts/BUILD-${hash}-s1.json`,code.build);
 const calls=new Int32Array(new SharedArrayBuffer(4));
 const host=new ProductionReviews({services:new ThreadServices(()=>({startedAt:0,modelState:{status:'ready'},installedCommit:'fixture'})),registeredRepos:async()=>new Set([code.repo]),track:()=>{},start:(svc,input,port,deps)=>startReviewWorkerBootstrap(svc,input,port,{...deps,start:(s,n,_script,extra,created)=>startWorker(s,n,'__tests__/helpers/review-maintenance',{workerData:{...extra!.workerData,calls:calls.buffer},transferList:extra!.transferList},created)})});
 installProductionReviews(host);t.after(async()=>{await host.shutdown();code.cleanup();});
 const context={connectionIdentity:'failed-attempt',daemonEpoch:'epoch',connectionSignal:new AbortController().signal};
 for(const qualified of [true,false]){
  const reviewId=qualified?'failed-qualified':'failed-without-documents',path=checkpointPath(code.repo,reviewId),base={repo:code.repo,epicHash:hash,reviewId,attempt:1};
  if(qualified){
   const cp=code.checkpoint(reviewId),last=cp.attempts[0]!;last.header.reviewer='controller';last.header.status='failed';last['review-response'].tasks=[];last['review-response'].crPublication='complete';
   await saveCheckpoint(path,cp);
  }else{
   const key={project:code.repo,family:'code' as const,reviewId};
   await persistReviewWorkerAdmission({key,incarnation:'failed-worker',reviewer:'controller',attempt:1,actionId:'failed-input',submitted:{...code.packet,documents:{}}});
  }
  await updateStoredCodeCheckpoint(path,cp=>{
   const last=cp!.attempts.at(-1)!;
   if('phase'in last){last.header.status='failed';last.header.completedAt=new Date().toISOString();last.error={code:'fixture_failure',field:'source',summary:'Fixture technical failure'};last.progress.phase='error';}
   last.resourceGuard={daemonInstance:'fixture',openLeases:[]};return{...cp!,schemaVersion:2};
  });
  const before=await readFile(path,'utf8');
  await assert.rejects(handleTaskReviewStep({...base,phase:'resume'},context),/Failed review requires the next attempt/);
  assert.equal(await readFile(path,'utf8'),before,'failed pinned input and feedback must remain unchanged');
  // Failure during bootstrap reclaims asynchronously; a later explicit new
  // attempt may proceed after its old incarnation is fully reclaimed.
  const end=Date.now()+10000;
  while(true){try{await handleTaskReviewStep({...base,attempt:2,phase:'start',packet:qualified?code.packet:{...code.packet,documents:{}}},context);break;}catch(error){if(Date.now()>end||!/fenced|closed|resource|reclaimed/i.test(String(error)))throw error;await new Promise(r=>setTimeout(r,20));}}
  const after=JSON.parse(await readFile(path,'utf8'));assert.equal(after.attempts.length,2);assert.deepEqual(after.attempts[0],JSON.parse(before).attempts[0]);
 }
 assert.equal(Atomics.load(calls,0),0);
});
