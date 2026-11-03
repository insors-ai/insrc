import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as pause } from 'node:timers/promises';
import type { ActivityReviewSessionOpts, LLMProvider } from '../../../../shared/types.js';
import type { DesignChunkPlan, DesignUnitAssignment } from '../contracts.js';
import { DesignReviewCoordinator } from '../coordinator.js';
import type { DesignControllerOwner } from '../coordinator.js';
import { createDesignActivityMonitor } from '../activity-monitor.js';
import { designFixture } from './fixtures.js';

function clock(){
 const state={now:0,delay:0,wake:undefined as (()=>void)|undefined,cancellations:0};
 return{state,deps:{now:()=>state.now,pressure:()=>({}),timer:(callback:()=>void,ms:number)=>{state.wake=callback;state.delay=ms;return()=>{state.cancellations++;if(state.wake===callback)state.wake=undefined;};}},fire:()=>{assert.ok(state.wake);const wake=state.wake;state.wake=undefined;wake();}};
}
type Fixture=ReturnType<typeof designFixture>;
const base=(f:Fixture)=>({repo:f.repo,reviewId:'review-1',attempt:1});
function plan(f:Fixture):DesignChunkPlan{return{chunks:[{id:'content',title:'Content',selectors:f.prepared.inventory.units.map(u=>u.id),concerns:['Requirements'],dependsOn:[],purpose:'substantive'},{id:'final',title:'Consistency',selectors:[],concerns:['Consistency'],dependsOn:['content'],purpose:'consistency'}],coverageExplanation:'All units',finalConsistencyChunkId:'final',coverage:f.prepared.inventory.units.map(u=>({unitId:u.id,chunkIds:['content']}))};}
const result=(f:Fixture,id:string)=>({chunkId:id,status:'passed',summary:'Activity fixture',findings:[],inspectedReferences:[...f.prepared.inventory.units.map(u=>u.id),f.md,f.path],limitations:[],advice:[]});
async function assignment(c:DesignReviewCoordinator,f:Fixture,owner:DesignControllerOwner){for(let i=0;i<1000;i++){const v=await c.exchange({phase:'assignment',...base(f)},owner) as {assignment:DesignUnitAssignment|null};if(v.assignment)return v.assignment;await pause(2);}throw new Error('No fixture assignment');}
async function terminal(c:DesignReviewCoordinator,f:Fixture){for(let i=0;i<1000;i++){const v=await c.progress(f.repo,'review-1',1);if(!['pending','running'].includes(v.status))return v;await pause(2);}throw new Error('Activity fixture did not finish');}

test('active tool lifetime defers expiry without renewing model activity and completion restores thirty-minute grace',()=>{
 const time=clock();let inactive=0;const monitor=createDesignActivityMonitor(()=>inactive++,time.deps);
 monitor.observe({sessionId:'s',sequence:1,kind:'session_started'});monitor.observe({sessionId:'s',sequence:2,kind:'tool_started',toolId:'long-tool'});
 time.state.now=7200000;time.fire();assert.equal(inactive,0);assert.equal(time.state.delay,60000);
 assert.equal(monitor.snapshot().activityAgeMs,7200000);assert.equal(monitor.snapshot().inactivityRemainingMs,0);assert.equal(monitor.snapshot().tools[0]!.elapsedMs,7200000);
 assert.equal(monitor.observe({sessionId:'s',sequence:3,kind:'heartbeat'}),false);monitor.snapshot();time.state.now+=60000;time.fire();assert.equal(inactive,0);assert.equal(monitor.snapshot().activityAgeMs,7260000);
 const staleWake=time.state.wake;monitor.observe({sessionId:'s',sequence:4,kind:'tool_completed',toolId:'long-tool'});staleWake?.();assert.equal(inactive,0);
 assert.equal(time.state.delay,1800000);assert.equal(monitor.snapshot().tools.length,0);assert.equal(monitor.snapshot().activityAgeMs,0);
 time.state.now+=1800001;time.fire();assert.equal(inactive,1);assert.equal(time.state.wake,undefined);
});

test('stopping a design activity monitor cancels tool-wait observation without synthetic activity',()=>{
 const time=clock();let inactive=0;const monitor=createDesignActivityMonitor(()=>inactive++,time.deps);
 monitor.observe({sessionId:'s',sequence:1,kind:'session_started'});monitor.observe({sessionId:'s',sequence:2,kind:'tool_started',toolId:'tool'});
 time.state.now=1800001;time.fire();const queued=time.state.wake;monitor.stop();queued?.();assert.equal(inactive,0);assert.equal(time.state.wake,undefined);
 assert.equal(monitor.observe({sessionId:'s',sequence:3,kind:'model_output'}),false);
});

test('native and controller reviews survive a two-hour tool then complete under the same activity policy',async t=>{
 for(const party of ['native','controller']){
  const f=designFixture(t,party==='native'?'controller':'daemon'),time=clock(),abort=new AbortController(),owner={id:'owner',signal:abort.signal};t.after(()=>abort.abort());
  let release!:()=>void,entered!:()=>void,opts:ActivityReviewSessionOpts|undefined;const barrier=new Promise<void>(r=>release=r),started=new Promise<void>(r=>entered=r);
  const provider={capabilities:{reviewActivity:true},runReviewSession:async(prompt:string,_schema:unknown,options:ActivityReviewSessionOpts)=>{
   const m=prompt.match(/Chunk assignment: (.+)\n/);if(m)return result(f,JSON.parse(m[1]!).id as string);
   opts=options;await options.onActivity({sessionId:'session',sequence:1,kind:'session_started'});await options.onActivity({sessionId:'session',sequence:2,kind:'tool_started',toolId:'slow-read'});entered();await barrier;return plan(f);
  }} as unknown as LLMProvider;
  const c=new DesignReviewCoordinator({provider:()=>{assert.equal(party,'native');return{provider,model:'fixture'};},activity:time.deps});
  await c.start({phase:'start',...base(f),artifactPath:f.json},party==='controller'?{owner}:{});
  let unit:DesignUnitAssignment|undefined;
  if(party==='native')await started;else{
   unit=await assignment(c,f,owner);
   for(const [sequence,kind] of [[1,'session_started'],[2,'tool_started']] as const)await c.exchange({phase:'activity',...base(f),executionId:unit.executionId,sequence,event:{sessionId:'session',sequence,kind,...(kind==='tool_started'?{toolId:'slow-read'}:{})}},owner);
  }
  const previous=(await c.progress(f.repo,'review-1',1)).lastMeaningfulActivityAt;
  time.state.now=7200000;time.fire();for(let i=0;i<3;i++)await c.progress(f.repo,'review-1',1);
  const active=await c.progress(f.repo,'review-1',1);assert.equal(active.status,'running');assert.equal(active.activeToolCount,1);assert.equal(active.lastMeaningfulActivityAt,previous);
  if(party==='native'){assert.equal(opts!.signal.aborted,false);assert.ok(!('deadlineMs' in opts!));await opts!.onActivity({sessionId:'session',sequence:3,kind:'tool_completed',toolId:'slow-read'});release();}
  else{
   await c.exchange({phase:'activity',...base(f),executionId:unit!.executionId,sequence:3,event:{sessionId:'session',sequence:3,kind:'tool_completed',toolId:'slow-read'}},owner);
   await c.exchange({phase:'plan',...base(f),executionId:unit!.executionId,sequence:4,plan:plan(f)},owner);
   for(const id of ['content','final']){unit=await assignment(c,f,owner);await c.exchange({phase:'result',...base(f),executionId:unit.executionId,sequence:1,result:result(f,id)},owner);}
  }
  assert.equal((await terminal(c,f)).status,'passed');
 }
});

test('a truly idle controller expires through the shared bounded retry policy and ends paused',async t=>{
 const f=designFixture(t,'daemon'),time=clock(),abort=new AbortController(),owner={id:'owner',signal:abort.signal},c=new DesignReviewCoordinator({activity:time.deps});t.after(()=>abort.abort());
 await c.start({phase:'start',...base(f),artifactPath:f.json},{owner});
 for(let i=0;i<4;i++){const unit=await assignment(c,f,owner);assert.equal(unit.retriesUsed,i);time.state.now+=1800001;time.fire();}
 const view=await terminal(c,f);assert.equal(view.status,'paused');assert.equal(view.recovery?.failedUnit?.code,'review_inactive');
});
