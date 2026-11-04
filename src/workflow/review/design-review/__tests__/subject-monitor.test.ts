import test from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, readFileSync, writeFileSync, unlinkSync, symlinkSync, renameSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { setTimeout as pause } from 'node:timers/promises';
import type { ActivityReviewSessionOpts, LLMProvider } from '../../../../shared/types.js';
import type { DesignChunkPlan, DesignUnitAssignment } from '../contracts.js';
import { DesignReviewCoordinator } from '../coordinator.js';
import { DesignSubjectMonitor } from '../subject-monitor.js';
import { loadDesignCheckpoint, saveDesignCheckpoint } from '../checkpoint.js';
import { designFixture } from './fixtures.js';

type Fixture=ReturnType<typeof designFixture>;
const base=(f:Fixture)=>({repo:f.repo,reviewId:'review-1',attempt:1});
function plan(f:Fixture):DesignChunkPlan{return{chunks:[{id:'content',title:'Content',selectors:f.prepared.inventory.units.map(u=>u.id),concerns:['Requirements'],dependsOn:[],purpose:'substantive'},{id:'final',title:'Consistency',selectors:[],concerns:['Consistency'],dependsOn:['content'],purpose:'consistency'}],coverageExplanation:'Complete',finalConsistencyChunkId:'final',coverage:f.prepared.inventory.units.map(u=>({unitId:u.id,chunkIds:['content']}))};}
const result=(f:Fixture,id:string)=>({chunkId:id,status:'passed',summary:'Subject monitoring fixture',findings:[],inspectedReferences:[...f.prepared.inventory.units.map(u=>u.id),f.md,f.path],limitations:[],advice:[]});
async function storedInvalidation(f:Fixture){for(let i=0;i<1000;i++){const cp=await loadDesignCheckpoint(f.repo,'review-1');if(cp?.attempts[0]?.status==='invalidated')return cp;await pause(2);}throw new Error('Durable invalidation not saved');}
function manualMonitor(){let tick=()=>{};return{deps:{interval:(callback:()=>void,ms:number)=>{assert.equal(ms,1000);tick=callback;return()=>{};},watch:()=>{throw new Error('Use deterministic polling fixture');}},tick:()=>tick()};}

test('subject monitor filters unrelated events rearms renamed watches and disposes without treating polling as activity',async t=>{
 const f=designFixture(t),events=new Map<string,(kind:string,name:string|null)=>void>();let tick=()=>{},opened=0,closed=0,cancelled=0,changes=0;
 const monitor=new DesignSubjectMonitor(f.prepared.subject,f.prepared.baseline,()=>changes++,{interval:callback=>{tick=callback;return()=>cancelled++;},watch:(directory,event)=>{opened++;events.set(directory,event);return{close:()=>closed++,onError:()=>{}};}});t.after(()=>monitor.stop());
 assert.equal(opened,2);writeFileSync(join(f.repo,'unrelated.md'),'External changes');events.get(dirname(f.md))!('rename','unrelated.md');tick();await pause(0);assert.equal(changes,0);assert.equal(closed,0);
 const stale=events.get(dirname(f.md))!;stale('rename',basename(f.md));await pause(0);assert.equal(closed,1);assert.equal(opened,3);
 stale('rename',basename(f.md));await pause(0);assert.equal(closed,1);assert.equal(opened,3);
 appendFileSync(f.md,'Changed');tick();await pause(0);assert.equal(changes,1);assert.equal(cancelled,1);assert.equal(closed,opened);
 writeFileSync(f.md,f.prepared.baseline.reviewedContent.document);tick();await pause(0);assert.equal(changes,1);monitor.stop();assert.equal(cancelled,1);
});

test('subject polling invalidates deletion symlink replacement and atomic rename for either subject representation',async t=>{
 for(const representation of ['json','md'] as const)for(const mutation of ['delete','symlink','rename']){
  const f=designFixture(t),clock=manualMonitor();let changes=0;
  const monitor=new DesignSubjectMonitor(f.prepared.subject,f.prepared.baseline,()=>changes++,clock.deps);t.after(()=>monitor.stop());
  const target=f[representation],bytes=readFileSync(target,'utf8'),replacement=join(f.repo,'replacement');
  if(mutation==='delete')unlinkSync(target);
  else if(mutation==='symlink'){writeFileSync(replacement,bytes);unlinkSync(target);symlinkSync(replacement,target);}
  else{writeFileSync(replacement,bytes+'\nChanged');renameSync(replacement,target);}
  clock.tick();await pause(0);assert.equal(changes,1,`${representation}/${mutation}`);
 }
});

test('blocked native work is durably invalidated before return and restored bytes cannot accept late output',async t=>{
 const f=designFixture(t),clock=manualMonitor();let release!:(v:unknown)=>void,started!:()=>void,options:ActivityReviewSessionOpts|undefined,calls=0;
 const barrier=new Promise<unknown>(r=>release=r),entered=new Promise<void>(r=>started=r);
 const provider={capabilities:{reviewActivity:true},runReviewSession:async(_prompt:string,_schema:unknown,opts:ActivityReviewSessionOpts)=>{calls++;options=opts;started();return barrier;}} as unknown as LLMProvider;
 const c=new DesignReviewCoordinator({provider:()=>({provider,model:'fixture'}),subjectMonitor:clock.deps});await c.start({phase:'start',...base(f),artifactPath:f.json});await entered;
 const original=readFileSync(f.md,'utf8');appendFileSync(f.md,'Changed while blocked');clock.tick();
 const saved=await storedInvalidation(f);assert.equal(saved.attempts[0]!.completedChunks.length,0);assert.equal(options!.signal.aborted,true);
 writeFileSync(f.md,original);assert.deepEqual(await options!.onCandidate(plan(f)),{accepted:false});
 await assert.rejects(c.recover({phase:'recover',...base(f),actionId:'restart-1',operation:'restart_full',userDecision:{action:'restart_full',reason:'User direction',recordedAt:saved.attempts[0]!.startedAt}}),/active execution/);
 release(plan(f));await pause(10);const view=await c.progress(f.repo,'review-1',1);assert.equal(view.status,'invalidated');assert.equal(view.report,undefined);assert.equal(calls,1);
});

test('subject change during final report save preserves historical feedback but never exposes a valid report',async t=>{
 const f=designFixture(t),clock=manualMonitor();let calls=0,changed=false;
 const provider={capabilities:{reviewActivity:true},runReviewSession:async(prompt:string)=>{calls++;const m=prompt.match(/Chunk assignment: (.+)\n/);return m?result(f,JSON.parse(m[1]!).id as string):plan(f);}} as unknown as LLMProvider;
 const c=new DesignReviewCoordinator({provider:()=>({provider,model:'fixture'}),subjectMonitor:clock.deps,save:async(repo,cp)=>{await saveDesignCheckpoint(repo,cp);if(cp.attempts[0]!.report&&!changed){changed=true;appendFileSync(f.md,'Changed after report rename');}}});
 await c.start({phase:'start',...base(f),artifactPath:f.json});const saved=await storedInvalidation(f);assert.equal(saved.attempts[0]!.completedChunks.length,2);assert.equal(calls,3);
 const view=await c.progress(f.repo,'review-1',1);assert.equal(view.status,'invalidated');assert.equal(view.report,undefined);assert.equal(view.failure?.code,'artifact_changed');
});

test('subject invalidation rejects controller feedback queued behind a delayed activity save',async t=>{
 const f=designFixture(t,'daemon'),clock=manualMonitor(),abort=new AbortController(),owner={id:'controller',signal:abort.signal};t.after(()=>abort.abort());
 let entered!:()=>void,release!:()=>void;const blocked=new Promise<void>(r=>release=r),saving=new Promise<void>(r=>entered=r);let delay=true;
 const c=new DesignReviewCoordinator({subjectMonitor:clock.deps,save:async(repo,cp)=>{if(delay&&cp.attempts[0]!.current?.sequence===1){delay=false;entered();await blocked;}await saveDesignCheckpoint(repo,cp);}});
 await c.start({phase:'start',...base(f),artifactPath:f.json},{owner});let unit:DesignUnitAssignment|undefined;
 for(let i=0;i<1000&&!unit;i++){unit=(await c.exchange({phase:'assignment',...base(f)},owner) as {assignment:DesignUnitAssignment|undefined}).assignment;if(!unit)await pause(2);}assert.ok(unit);
 const activity=c.exchange({phase:'activity',...base(f),executionId:unit.executionId,sequence:1,event:{sessionId:'session',sequence:1,kind:'session_started'}},owner);void activity.catch(()=>{});await saving;
 const submission=c.exchange({phase:'plan',...base(f),executionId:unit.executionId,sequence:2,plan:plan(f)},owner);void submission.catch(()=>{});
 appendFileSync(f.md,'Changed during delayed save');clock.tick();await assert.rejects(submission,/changed/);release();await assert.rejects(activity,/changed/);
 const saved=await storedInvalidation(f);assert.equal(saved.attempts[0]!.plan,undefined);assert.equal((await c.progress(f.repo,'review-1',1)).report,undefined);
});

test('failed invalidation persistence stays visibly failed and never retries native work',async t=>{
 const f=designFixture(t),clock=manualMonitor();let release!:(v:unknown)=>void,started!:()=>void,calls=0;
 const wait=new Promise<unknown>(r=>release=r),entered=new Promise<void>(r=>started=r);
 const provider={capabilities:{reviewActivity:true},runReviewSession:async()=>{calls++;started();return wait;}} as unknown as LLMProvider;
 const c=new DesignReviewCoordinator({provider:()=>({provider,model:'fixture'}),subjectMonitor:clock.deps,save:async(repo,cp)=>{if(cp.attempts[0]!.status==='invalidated')throw new Error('Invalidation disk failure');await saveDesignCheckpoint(repo,cp);}});
 await c.start({phase:'start',...base(f),artifactPath:f.json});await entered;appendFileSync(f.md,'Changed');clock.tick();
 let view=await c.progress(f.repo,'review-1',1);for(let i=0;i<1000&&view.status!=='failed';i++){await pause(2);view=await c.progress(f.repo,'review-1',1);}assert.equal(view.status,'failed');assert.equal(view.failure?.code,'persistence_failed');assert.equal(view.report,undefined);
 release(plan(f));await pause(5);assert.equal(calls,1);
});

test('an opened watcher error closes and rearms it while fingerprint checks still invalidate a changed subject',async t=>{
 const f=designFixture(t);let opened=0,closed=0,cancelled=0,changes=0;
 const handles:{directory:string;error:()=>void;event:(kind:string,name:string|null)=>void;closes:number}[]=[];
 const monitor=new DesignSubjectMonitor(f.prepared.subject,f.prepared.baseline,()=>changes++,{
  interval:()=>()=>cancelled++,watch:(directory,event)=>{
   opened++;const handle={directory,error:()=>{},event,closes:0};handles.push(handle);
   return{close:()=>{closed++;handle.closes++;},onError:handler=>{handle.error=handler;}};
  },
 });t.after(()=>monitor.stop());
 assert.equal(opened,2);const failed=handles.find(h=>h.directory===dirname(f.md))!;
 failed.error();await pause(0);
 assert.equal(failed.closes,1);assert.equal(closed,1);assert.equal(opened,3);assert.equal(changes,0);
 const replacement=handles.at(-1)!;assert.equal(replacement.directory,failed.directory);
 failed.event('rename',basename(f.md));await pause(0);assert.equal(opened,3);assert.equal(closed,1);
 appendFileSync(f.md,'Changed after watcher rearm');replacement.event('change',basename(f.md));await pause(0);
 assert.equal(changes,1);assert.equal(closed,opened);assert.equal(cancelled,1);
 replacement.event('change',basename(f.md));await pause(0);assert.equal(changes,1);
});
