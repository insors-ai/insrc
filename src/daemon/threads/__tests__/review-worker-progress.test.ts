import test from 'node:test';
import assert from 'node:assert/strict';
import { clearanceFixture,until,workerRpc,services } from './helpers/review-clearance-fixture.js';
import { createConnection } from 'node:net';
import { join } from 'node:path';
import { CodeReviewConnections } from '../../../mcp/code-review/handler.js';
import { DesignReviewConnections } from '../../../mcp/design-review/handler.js';
import { handleArtifactContent } from '../../../workflow/artifact-content.js';
import { threadViews } from '../admin-status.js';
import { reviewProgressLabel } from '../../../shared/review-worker-progress.js';
import { reviewProgressForArtifact } from '../../../workflow/review/worker-progress-source.js';

test('pending admission and cached progress stay responsive during blocked worker computation',async t=>{
 for(const family of ['code','design'] as const)await t.test(family,async t=>{
  const f=await clearanceFixture(t,family),key={...f.key,reviewId:'progress-fixture'};
  const input={...f.input,key,actionId:'progress-start',submitted:family==='code'?f.f.packet:{phase:'start',repo:f.repo,reviewId:key.reviewId,attempt:1,artifactPath:f.d!.json}};
  const ack=await f.registry.admit(input,f.local),started=f.started.get(key.reviewId)!,barrier=f.barriers.get(key.reviewId)!;
  const connections=family==='code'?new CodeReviewConnections({connect:()=>createConnection(join(f.repo,'clearance.sock')),resolveRepo:async()=>f.repo}):new DesignReviewConnections({connect:()=>createConnection(join(f.repo,'clearance.sock')),resolveRepo:async()=>f.repo});f.beforeClose(()=>connections.close());
  const initial=await f.registry.progress(key,f.local) as any;
  assert.equal(initial.status,'pending');assert.equal(initial.admission.validation,'unverified');
  const executionId=initial.progress?.executionId;
  await f.registry.execute(ack,f.local);
  let blocked:Promise<any>|undefined;
  try{
   if(family==='code'){
    await until(async()=> (await workerRpc(started,'fixture.stats')).entered);
    blocked=workerRpc(started,'fixture.block').catch(()=>{});await until(()=>Atomics.load(barrier,6)===1);
   }else await until(()=>Atomics.load(barrier,0)===1);
   const began=performance.now();const progress=await f.registry.progress(key,f.local) as any;
   assert.ok(performance.now()-began<500,'cached response must not await the blocked worker');
   const reply=await connections.call({phase:'progress',repo:f.repo,reviewId:key.reviewId,attempt:1},undefined);
   const viaMcp=JSON.parse(reply.content[0]!.text);assert.equal(viaMcp.admission.validation,'unverified');assert.equal(viaMcp.status,'pending');
   assert.equal(progress.status,'pending');assert.equal(progress.admission.validation,'unverified');
   if(family==='code'){assert.equal(progress.totalTasks,0);assert.equal(progress.progress.task,null);assert.equal(progress.progress.phase,'scope_preparation');assert.equal(progress.progress.executionId,executionId);}
   else{assert.equal(progress.totalChunks,0);assert.equal(progress.phase,'admission');}
   const view=threadViews(services.board.snapshot(),Date.now()).find(v=>v.threadId===started.threadId)!;
   assert.equal(view.reviewProgress!.reviewId,key.reviewId);assert.equal(reviewProgressLabel(view.reviewProgress!),'Preparing review');assert.ok(view.reviewProgress!.observedAt);
   if(family==='design'){assert.equal((await reviewProgressForArtifact(f.repo,f.d!.id))!.reviewId,key.reviewId);const content=await handleArtifactContent({repo:f.repo,mdPath:f.d!.md},undefined);assert.ok('reviewProgress'in content);assert.equal(content.reviewProgress!.reviewId,key.reviewId);}
   const otherKey={...key,family:'code' as const,reviewId:'unrelated-progress'};
   const other=await f.registry.admit({...input,key:otherKey,submitted:f.f.packet,actionId:'other-progress'},f.local);
   assert.notEqual(other.incarnation,ack.incarnation);
  }finally{
   Atomics.store(barrier,7,1);Atomics.notify(barrier,7);Atomics.store(barrier,1,1);Atomics.notify(barrier,1);await blocked;
  }
  if(family==='code')await workerRpc(started,'fixture.release');
  await until(async()=> !(await f.registry.progress(key,f.local) as any).admission);
 });
});

test('technical admission failures publish failed preparation without findings or provider dispatch',async t=>{
 for(const family of ['code','design'] as const)await t.test(family,async t=>{
  const f=await clearanceFixture(t,family),key={...f.key,reviewId:'failed-progress'};
  const submitted=family==='code'?{...f.f.packet,reviewSet:f.f.packet.reviewSet.map(commit=>({...commit,files:commit.files.map(file=>({...file,path:'missing-from-pinned-commit.ts'}))}))}:{phase:'start',repo:f.repo,reviewId:key.reviewId,attempt:1,artifactPath:join(f.repo,'missing-artifact.json')};
  const ack=await f.registry.admit({...f.input,key,submitted,actionId:'failed-progress'},f.local),started=f.started.get(key.reviewId)!,barrier=f.barriers.get(key.reviewId)!;
  await f.registry.execute(ack,f.local);
  if(family==='code')await workerRpc(started,'fixture.release');else{Atomics.store(barrier,1,1);Atomics.notify(barrier,1);}
  await until(async()=> (await f.registry.progress(key,f.local) as any).status==='failed');
  const view=threadViews(services.board.snapshot(),Date.now()).find(v=>v.threadId===started.threadId)!;assert.equal(view.busy,false);const display=view.reviewProgress!;
  assert.equal(display.admission!.state,'failed');assert.equal(display.admission!.validation,'unverified');
  assert.match(reviewProgressLabel(display),/^Technical admission failure:/);assert.equal(display.completed,0);assert.equal(display.total,0);
  assert.equal(family==='code'?(await workerRpc(started,'fixture.stats')).calls:Atomics.load(barrier,2),0);
  const before=f.registry.cachedProgress(key)!.sequence;
  assert.doesNotThrow(()=>started.worker.emit('message',{kind:'review-progress',key:null,incarnation:ack.incarnation,attempt:1,sequence:before+1}));
  assert.equal(f.registry.cachedProgress(key)!.sequence,before);
  if(family==='code'){
   const observation=await f.registry.progress(key,f.local) as any;
   started.worker.emit('message',{...ack,kind:'review-progress',attempt:1,sequence:before+1,observation:{...observation,reviewId:'another-review'}});
   assert.equal(f.registry.cachedProgress(key)!.sequence,before,'a foreign observation cannot replace this cache');
  }
 });
});

test('the cross-thread board read carries only review progress and excludes workflow frames',async()=>{
 const {MessageChannel}=await import('node:worker_threads');
 const {StatusBoard,StatusBoardClient,statusBoardHubHandlers}=await import('../status-board.js');
 const {HubClient,serveHub}=await import('../channel.js');
 const board=new StatusBoard(),{port1,port2}=new MessageChannel(),stop=serveHub(port1,statusBoardHubHandlers(board));
 board.publishRun({runId:'unrelated-run',status:'running',ownerThreadId:1,startedAt:0,model:'fixture',frames:[{privateUnrelatedWorkflowFrame:'must not be serialized'}]});
 board.publish({threadId:2,cls:'review',role:'code-review',busy:true,queued:0,reviewSubject:'BUILD-fixture-s1',reviewProgress:{project:'/repo',family:'code',reviewId:'review-1',attempt:1,status:'pending',phase:'scope_preparation',completed:0,total:0,task:null,observedAt:'2026-11-11T00:00:00.000Z',freshness:'live',admission:{validation:'unverified',state:'pending',stage:'scope_preparation'}}});
 try{
  const rows=await new StatusBoardClient(new HubClient(port2)).reviewProgress();
  assert.equal(rows.length,1);assert.equal(rows[0]!.progress.reviewId,'review-1');
  assert.doesNotMatch(JSON.stringify(rows),/privateUnrelatedWorkflowFrame|unrelated-run/);
 }finally{stop();port1.close();port2.close();}
});
