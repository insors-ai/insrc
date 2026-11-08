import test from 'node:test';
import assert from 'node:assert/strict';
import { createConnection } from 'node:net';
import { join,resolve,dirname } from 'node:path';
import { readFileSync,writeFileSync,mkdirSync } from 'node:fs';
import { setTimeout as pause } from 'node:timers/promises';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { buildInsrcMcpServerWithRegistry } from '../server.js';
import { DesignReviewConnections } from '../design-review/handler.js';
import { DESIGN_REVIEW_PHASES,DESIGN_REVIEW_INPUT } from '../design-review/schema.js';
import { handleInsrcSchema } from '../schema/handler.js';
import { readWorkflowGuide } from '../../daemon/guide-sections.js';
import { createStepCallHandler,stepToolTable } from '../../daemon/steps/host.js';
import { rpc } from '../../shared/ipc-client.js';
import { designReviewOperation } from '../../daemon/design-review-rpc.js';
import { handleDesignReviewStep } from '../../daemon/steps/design-review-step.js';
import { Router } from '../../daemon/threads/router.js';
import { TargetRegistry } from '../../daemon/threads/registry.js';
import { IpcServer,directDispatch } from '../../daemon/server.js';
import { impactFixture } from '../../workflow/review/design-review/__tests__/impact-fixtures.js';
import { appendFileSync } from 'node:fs';
import { designFixture } from '../../workflow/review/design-review/__tests__/fixtures.js';
import { loadDesignCheckpoint,saveDesignCheckpoint,designCheckpointPath } from '../../workflow/review/design-review/checkpoint.js';
import { publishDesignReview } from '../../workflow/review/design-review/publication.js';
import { prepareDesignSubject } from '../../workflow/review/design-review/subject.js';
import { artifactJsonPath } from '../../workflow/storage.js';
import { resolveArtifactMdPath } from '../../workflow/path-scheme.js';
import type { LLMProvider,ActivityReviewSessionOpts } from '../../shared/types.js';
const decode=(value:unknown)=>JSON.parse((value as {content:{text:string}[]}).content[0]!.text);
type Subject=Pick<ReturnType<typeof designFixture>,'repo'|'json'|'md'|'id'|'path'|'prepared'>;
const reviewPlan=(f:Subject)=>({chunks:[{id:'content',title:'Content',selectors:f.prepared.inventory.units.map(u=>u.id),concerns:['Requirements'],dependsOn:[],purpose:'substantive'},{id:'final',title:'Consistency',selectors:[],concerns:['Consistency'],dependsOn:['content'],purpose:'consistency'}],coverageExplanation:'All units',finalConsistencyChunkId:'final',coverage:f.prepared.inventory.units.map(u=>({unitId:u.id,chunkIds:['content']}))});
const reviewResult=(f:Subject,id:string)=>({chunkId:id,status:'passed',summary:'MCP fixture feedback',findings:[],inspectedReferences:[...f.prepared.inventory.units.map(u=>u.id),f.md,f.path],limitations:[],advice:[]});
async function reviewCall(client:Client,args:Record<string,unknown>){const response=await client.callTool({name:'insrc_review_step',arguments:args});assert.ok(!response.isError,JSON.stringify(response));return decode(response);}
async function reviewAssignment(client:Client,base:Record<string,unknown>){let assignment:Record<string,unknown>|undefined;await until(async()=>{assignment=(await reviewCall(client,{phase:'assignment',...base})).assignment;return!!assignment;});return assignment!;}
async function until(fn:()=>boolean|Promise<boolean>){for(let i=0;i<500;i++){if(await fn())return;await pause(10);}throw new Error('Fixture did not settle');}
async function host(f:ReturnType<typeof designFixture>,provider:LLMProvider,compiled=false){
 const {stepToolTable,createStepCallHandler}=await import(compiled?resolve('out/daemon/steps/host.js'):'../../daemon/steps/host.js');
 const {Router}=await import(compiled?resolve('out/daemon/threads/router.js'):'../../daemon/threads/router.js');
 const {TargetRegistry}=await import(compiled?resolve('out/daemon/threads/registry.js'):'../../daemon/threads/registry.js');
 const {IpcServer,directDispatch}=await import(compiled?resolve('out/daemon/server.js'):'../../daemon/server.js');
 const {designReviewOperation}=await import(compiled?resolve('out/daemon/design-review-rpc.js'):'../../daemon/design-review-rpc.js');
 const {handleDesignReviewStep}=await import(compiled?resolve('out/daemon/steps/design-review-step.js'):'../../daemon/steps/design-review-step.js');
 const {handleWorkflowApprove}=await import(compiled?resolve('out/daemon/workflow-approve.js'):'../../daemon/workflow-approve.js');

 writeFileSync(join(f.repo,'.insrc/schema.json'),JSON.stringify({version:2}));const path=join(f.repo,'design.sock');
 const table=stepToolTable({tools:{insrc_review_step:(args,_signal,_progress,_execution,trusted)=>handleDesignReviewStep(args,trusted,{provider:()=>({provider,model:'fake-model (fixture)'})})}});
 const router=new Router({classOf:()=> 'session',registry:new TargetRegistry(),routed:new Set(['session']),holdMs:50,local:directDispatch({...Object.fromEntries(DESIGN_REVIEW_PHASES.map(phase=>[`designReview.${phase}`,(args:unknown,trusted:Parameters<typeof designReviewOperation>[2])=>designReviewOperation(phase,args,trusted,{provider:()=>({provider,model:'fake-model (fixture)'})})])), 'workflow.approve':(args:unknown)=>handleWorkflowApprove(args)}, {'step.call':createStepCallHandler(table,{registeredRepos:async()=>new Set([f.repo])})})});
 const ipc=new IpcServer(router.forward,Date.now,path);await ipc.listen();return{ipc,path};
}
async function stdio(path:string,repo:string,compiled=false){
 const client=new Client({name:'codex',version:'test'});
 const transport=new StdioClientTransport({command:process.execPath,args:['--import','tsx',resolve('src/mcp/__tests__/helpers/design-review-stdio.ts')],env:{...process.env as Record<string,string>,DESIGN_TEST_SOCKET:path,DESIGN_TEST_REPO:repo,DESIGN_TEST_COMPILED:compiled?'1':'0',INSRC_MODE:'mcp'},stderr:'pipe'});
 await client.connect(transport);return client;
}
test('normal stdio MCP and Unix IPC preserve native background work and controller connection authority',async t=>{
 const f=designFixture(t);let release!:()=>void,calls=0;const barrier=new Promise<void>(r=>release=r);
 const plan={chunks:[{id:'content',title:'Content',selectors:f.prepared.inventory.units.map(u=>u.id),concerns:['Requirements'],dependsOn:[],purpose:'substantive'},{id:'final',title:'Consistency',selectors:[],concerns:['Consistency'],dependsOn:['content'],purpose:'consistency'}],coverageExplanation:'All units',finalConsistencyChunkId:'final',coverage:f.prepared.inventory.units.map(u=>({unitId:u.id,chunkIds:['content']}))};
 const provider={capabilities:{reviewActivity:true},runReviewSession:async(prompt:string,_schema:unknown,opts:ActivityReviewSessionOpts)=>{calls++;await barrier;const chunk=prompt.match(/Chunk assignment: (.+)\n/)?.[1];const value=chunk?{chunkId:JSON.parse(chunk).id,status:'passed',summary:'Fake CLI feedback',findings:[],inspectedReferences:[...f.prepared.inventory.units.map(u=>u.id),f.md,f.path],limitations:[],advice:[]}:plan;assert.equal((await opts.onCandidate(value)).accepted,true);return value;}} as unknown as LLMProvider;
 const h=await host(f,provider);let client=await stdio(h.path,f.repo);const base={repo:f.repo,reviewId:'review-1',attempt:1};
 try{
  const forged=await client.callTool({name:'insrc_review_step',arguments:{phase:'start',...base,artifactPath:f.json,reviewer:'controller'}}).catch(()=>({isError:true}));assert.equal(forged.isError,true);assert.equal(calls,0);
  const ack=decode(await client.callTool({name:'insrc_review_step',arguments:{phase:'start',...base,artifactPath:f.json}}));assert.equal(ack.status,'pending');
  await until(()=>calls===1);const observed=await rpc<{status:string}>('designReview.progress',base,()=>createConnection(h.path));assert.equal(observed.status,'running');await rpc('designReview.start',{...base,artifactPath:f.json},()=>createConnection(h.path));assert.equal(calls,1);await client.close();client=await stdio(h.path,f.repo);
  assert.equal(decode(await client.callTool({name:'insrc_review_step',arguments:{phase:'progress',...base}})).status,'running');assert.equal(calls,1);
  await client.callTool({name:'insrc_review_step',arguments:{phase:'start',...base,artifactPath:f.json}});assert.equal(calls,1);
  release();await until(async()=>!!decode(await client.callTool({name:'insrc_review_step',arguments:{phase:'progress',...base}})).report);
  assert.equal(calls,3);const page=decode(await client.callTool({name:'insrc_review_step',arguments:{phase:'progress',...base,includeResult:true}}));assert.equal(page.completedResults.length,1);assert.ok(!JSON.stringify(page).includes('reviewedContent"'));
 }finally{release();await client.close();await h.ipc.close();}
 // Separate daemon-authored subject exercises the actual server-minted socket identity.
 const g=designFixture(t,'daemon'),other=await host(g,provider),owner=new DesignReviewConnections({connect:()=>createConnection(other.path),resolveRepo:async()=>g.repo}),observer=new DesignReviewConnections({connect:()=>createConnection(other.path),resolveRepo:async()=>g.repo});
 const common={repo:g.repo,reviewId:'review-1',attempt:1};
 try{
  await owner.call({phase:'start',...common,artifactPath:g.json},'codex');
  await until(async()=>!!decode(await owner.call({phase:'assignment',...common},'codex')).assignment);
  assert.equal((await observer.call({phase:'assignment',...common},'codex')).isError,true);
  await observer.call({phase:'start',...common,artifactPath:g.json},'codex');assert.equal((await observer.call({phase:'assignment',...common},'codex')).isError,true);
  owner.close();await until(async()=>(await loadDesignCheckpoint(g.repo,'review-1'))!.attempts[0]!.status==='interrupted');assert.equal(calls,3);
 }finally{owner.close();observer.close();await other.ipc.close();}
});
test('design schema discovery and steering expose bounded current phases and completion discipline',()=>{
 const built=buildInsrcMcpServerWithRegistry(),record=built.schemaRegistry.get('insrc_review_step')!;
 assert.equal(record.rawShape,DESIGN_REVIEW_INPUT);
 const schema=handleInsrcSchema({tool:'insrc_review_step',phase:'start'},built.schemaRegistry);assert.deepEqual('validPhases' in schema?schema.validPhases:[],DESIGN_REVIEW_PHASES);
 const guide=readWorkflowGuide(readFileSync('src/prompts/steering-block.md','utf8'),'review')!;
 for(const phase of DESIGN_REVIEW_PHASES)assert.ok(guide.includes(phase));assert.match(guide,/one completed chunk per page/);assert.match(guide,/wait for full completion before corrections/);
 const router=readFileSync('src/daemon/threads/router.ts','utf8');assert.match(router,/\['insrc_code_review_step','insrc_review_step'\]\.includes/);
 const audit=readFileSync('src/daemon/repo-call-audit.ts','utf8');for(const phase of DESIGN_REVIEW_PHASES)assert.ok(audit.includes(`design-review-step.${phase}`));
});

test('normal MCP and main-owned unary recovery preserve partial native work while independent subjects progress',async t=>{
 const f=designFixture(t),a=f.checkpoint.attempts[0]!;a.status='running';a.plan=reviewPlan(f) as typeof a.plan;a.completedChunks=[reviewResult(f,'content') as typeof a.completedChunks[number]];
 a.current={kind:'chunk',chunkId:'final',executionId:'old-final',sequence:0,issuedAt:a.startedAt};a.unit={unitId:'final',phase:'chunk_review',executionId:'old-final',dispatches:1,retriesUsed:0,userDirectedDispatches:0,diagnostics:[]};await saveDesignCheckpoint(f.repo,f.checkpoint);
 const hash='bbbbbbbbbbbbbbbb',id=`LLD-${hash}-s1`,json=artifactJsonPath(f.repo,id),data=JSON.parse(readFileSync(f.json,'utf8'));data.meta.epicHash=hash;data.meta.epicSlug='parallel';
 const md=resolveArtifactMdPath(f.repo,{epicHash:hash,epicCreatedAt:data.meta.epicCreatedAt,story:'s1'},'LLD','standalone','parallel');mkdirSync(dirname(md),{recursive:true});writeFileSync(json,JSON.stringify(data));writeFileSync(md,`<!-- insrc:artifact ${id} -->\n# LLD\n\n## Summary\nParallel review\n`);
 const parallel:Subject={repo:f.repo,json,md,id,path:designCheckpointPath(f.repo,'parallel-2'),prepared:prepareDesignSubject(f.repo,json)};
 let release!:()=>void,primaryCalls=0,parallelCalls=0,succeed=false;const barrier=new Promise<void>(r=>release=r);
 const provider={capabilities:{reviewActivity:true},runReviewSession:async(prompt:string)=>{
  const second=prompt.includes(parallel.md),subject=second?parallel:f;if(second){parallelCalls++;if(!succeed)throw new Error('Transient CLI fixture error');}else{primaryCalls++;await barrier;}
  const chunk=prompt.match(/Chunk assignment: (.+)\n/);return chunk?reviewResult(subject,JSON.parse(chunk[1]!).id as string):reviewPlan(subject);
 }} as unknown as LLMProvider;
 const h=await host(f,provider),client=await stdio(h.path,f.repo),common={repo:f.repo,reviewId:'review-1',attempt:1},other={repo:f.repo,reviewId:'parallel-2',attempt:1};
 try{
  assert.equal((await reviewCall(client,{phase:'progress',...common})).status,'interrupted');assert.equal(primaryCalls,0);
  const request={...common,actionId:'recover-native-1',operation:'resume'};
  const ack=await rpc<{attempt:number}>('designReview.recover',request,()=>createConnection(h.path));assert.equal(ack.attempt,1);
  await until(()=>primaryCalls===1);await reviewCall(client,{phase:'recover',...request});assert.equal(primaryCalls,1);
  const active=await reviewCall(client,{phase:'progress',...common});assert.equal(active.completedChunks,1);assert.equal(active.retriesUsed,1);assert.notEqual(active.executionId,'old-final');assert.ok(!JSON.stringify(active).includes('reviewedContent'));
  await assert.rejects(rpc('designReview.recover',{phase:'failure',...request},()=>createConnection(h.path)),/disagree/);
  await reviewCall(client,{phase:'start',...other,artifactPath:parallel.json});
  await until(async()=>(await reviewCall(client,{phase:'progress',...other})).status==='paused');assert.equal(parallelCalls,4);
  const paused=await reviewCall(client,{phase:'progress',...other});assert.equal(paused.retriesUsed,3);assert.equal(paused.failedUnit.code,'process_failed');assert.equal(paused.requiresUserInput,true);assert.match(paused.guidance,/Ask the user/);
  assert.equal((await reviewCall(client,{phase:'progress',...common})).status,'running');
  const refused=await client.callTool({name:'insrc_review_step',arguments:{phase:'recover',...other,actionId:'no-user-direction',operation:'resume'}});assert.equal(refused.isError,true);assert.equal(parallelCalls,4);
  succeed=true;await reviewCall(client,{phase:'recover',...other,actionId:'approved-extra',operation:'resume',userDecision:{action:'retry_failed_unit',reason:'Fixture user direction',recordedAt:a.startedAt}});
  await until(async()=>(await reviewCall(client,{phase:'progress',...other})).status==='passed');assert.equal(parallelCalls,7);
  release();await until(async()=>(await reviewCall(client,{phase:'progress',...common})).status==='passed');assert.equal(primaryCalls,1);
  const page=await reviewCall(client,{phase:'progress',...common,includeResult:true,afterCompletedChunk:0});assert.equal(page.completedResults.length,1);assert.equal(page.completedResults[0].chunkId,'content');
 }finally{release();await client.close();await h.ipc.close();}
});

test('normal stdio controller failure and explicit recovery retain actual connection authority and generations',async t=>{
 const f=designFixture(t,'daemon'),provider={capabilities:{reviewActivity:true},runReviewSession:async()=>{throw new Error('Controller must not use native provider');}} as unknown as LLMProvider;
 const h=await host(f,provider),observer=await stdio(h.path,f.repo);let owner=await stdio(h.path,f.repo),replacement:Client|undefined;
 const common={repo:f.repo,reviewId:'review-1',attempt:1};
 try{
  await reviewCall(owner,{phase:'start',...common,artifactPath:f.json});let unit=await reviewAssignment(owner,common);
  const early=await observer.callTool({name:'insrc_review_step',arguments:{phase:'recover',...common,actionId:'steal-live',operation:'resume'}});assert.equal(early.isError,true);
  await assert.rejects(rpc('designReview.failure',{...common,executionId:unit.executionId,sequence:1,failure:{code:'invalid_output',summary:'Wrong owner'}},()=>createConnection(h.path)),/reviewing connection/);
  await reviewCall(owner,{phase:'failure',...common,executionId:unit.executionId,sequence:1,failure:{code:'invalid_output',summary:'Include required findings array'}});
  unit=await reviewAssignment(owner,common);assert.equal(unit.retriesUsed,1);assert.match(String((unit.previousTechnicalFeedback as {summary:string}).summary),/findings/);
  await reviewCall(owner,{phase:'plan',...common,executionId:unit.executionId,sequence:1,plan:reviewPlan(f)});
  unit=await reviewAssignment(owner,common);await reviewCall(owner,{phase:'result',...common,executionId:unit.executionId,sequence:1,result:reviewResult(f,'content')});
  const oldFinal=await reviewAssignment(owner,common);await owner.close();
  await until(async()=>(await reviewCall(observer,{phase:'progress',...common})).status==='interrupted');
  assert.equal((await observer.callTool({name:'insrc_review_step',arguments:{phase:'assignment',...common}})).isError,true);
  replacement=await stdio(h.path,f.repo);await reviewCall(replacement,{phase:'recover',...common,actionId:'rebind-after-disconnect',operation:'resume'});
  unit=await reviewAssignment(replacement,common);assert.equal(unit.chunkId,'final');assert.notEqual(unit.executionId,oldFinal.executionId);assert.equal(unit.retriesUsed,1);
  const stale=await replacement.callTool({name:'insrc_review_step',arguments:{phase:'result',...common,executionId:oldFinal.executionId,sequence:1,result:reviewResult(f,'final')}});assert.equal(stale.isError,true);
  const stolen=await observer.callTool({name:'insrc_review_step',arguments:{phase:'result',...common,executionId:unit.executionId,sequence:1,result:reviewResult(f,'final')}});assert.equal(stolen.isError,true);
  await reviewCall(replacement,{phase:'result',...common,executionId:unit.executionId,sequence:1,result:reviewResult(f,'final')});
  await until(async()=>(await reviewCall(replacement!,{phase:'progress',...common})).status==='passed');
  const cp=await loadDesignCheckpoint(f.repo,'review-1');assert.deepEqual(cp!.attempts[0]!.completedChunks.map(x=>x.chunkId),['content','final']);
 }finally{await owner.close();await replacement?.close();await observer.close();await h.ipc.close();}
});


test('normal impact schema and IPC routing preserve authority and fresh-only coverage progress',async t=>{
 const f=impactFixture(t,'daemon');f.checkpoint.attempts=[f.baseline];await saveDesignCheckpoint(f.repo,f.checkpoint);
 f.baseline.publication=await publishDesignReview(f.checkpoint);await saveDesignCheckpoint(f.repo,f.checkpoint);appendFileSync(f.md,'\nCorrected contract');
 const provider={capabilities:{reviewActivity:true},runReviewSession:async()=>{throw Error('Controller route must not construct native work');}} as unknown as LLMProvider;
 const h=await host(f,provider),client=await stdio(h.path,f.repo),observer=await stdio(h.path,f.repo),base={repo:f.repo,reviewId:'review-1',attempt:2};
 try{
  await reviewCall(client,{phase:'start',...base,artifactPath:f.json});const a=await reviewAssignment(client,base);assert.equal(a.kind,'impact');
  const req={phase:'impact',...base,executionId:a.executionId,sequence:1,plan:f.plan,impact:f.impact};
  assert.equal((await observer.callTool({name:'insrc_review_step',arguments:req})).isError,true);
  assert.equal((await client.callTool({name:'insrc_review_step',arguments:{...req,executionId:'stale'}})).isError,true);
  await reviewCall(client,req);let progress=await reviewCall(client,{phase:'progress',...base});assert.equal(progress.totalChunks,2);assert.equal(progress.coverageProgress.retainedChunks,1);
  const chunk=await reviewAssignment(client,base);assert.equal(chunk.chunkId,'edit');
  const result=(id:string)=>({...f.baseline.completedChunks.find(r=>r.chunkId===id)!,inspectedReferences:[...f.prepared.inventory.units.map(u=>u.id),f.md,f.path]});
  await reviewCall(client,{phase:'result',...base,executionId:chunk.executionId,sequence:1,result:result('edit')});progress=await reviewCall(client,{phase:'progress',...base,includeResult:true});assert.equal(progress.completedChunks,1);assert.equal(progress.totalChunks,2);assert.equal(progress.completedResults[0].chunkId,'edit');
  const final=await reviewAssignment(client,base);await reviewCall(client,{phase:'result',...base,executionId:final.executionId,sequence:1,result:{...result('final'),findingDecisions:[]}});
  await until(async()=>(await reviewCall(client,{phase:'progress',...base})).status==='passed');
  const saved=await loadDesignCheckpoint(f.repo,'review-1');assert.equal(saved!.attempts[1]!.progress.totalChunks,2);assert.equal(saved!.attempts[1]!.progress.coverageProgress!.retainedChunks,1);assert.deepEqual(saved!.attempts[1]!.report!.chunks.map(r=>r.chunkId),['edit','final']);
 }finally{await client.close();await observer.close();await h.ipc.close();}
});

test('compiled registered MCP and daemon qualify both parties across DEF HLD LLD publication approval cleanup and history restart',async t=>{
 // Deterministic provider fixtures over compiled production modules, not hosted-model evidence.
 const {emptyLifecycle}=await import('../../workflow/artifact-core/decode.js');
 const {designArtifactActive}=await import(resolve('out/workflow/review/design-review/fence.js'));
 const {DesignReviewCoordinator:CompiledCoordinator}=await import(resolve('out/workflow/review/design-review/coordinator.js'));
 const {execFileSync}=await import('node:child_process');
 for(const author of ['controller','daemon'] as const)for(const kind of ['DEF','HLD','LLD'] as const){
  const f=designFixture(t,author);execFileSync('git',['init','-q',f.repo]);const original=JSON.parse(readFileSync(f.json,'utf8')),time=original.meta.createdAt,hash=original.meta.epicHash;
  function put(k:'DEF'|'HLD'|'LLD',approved:boolean){
   const id=`${k}-${hash}${k==='LLD'?'-s1':''}`,json=artifactJsonPath(f.repo,id),md=resolveArtifactMdPath(f.repo,{epicHash:hash,epicCreatedAt:time,...(k==='LLD'?{story:'s1'}:{})},k,'epic','fixture');
   const raw={...original,meta:{...original.meta,standalone:false,...(approved?{lifecycle:{...emptyLifecycle(1),status:'approved'}}:{})},body:{...original.body,...(k==='DEF'?{stories:[{id:'s1'}]}:{})}};if(k!=='LLD')delete raw.meta.storyId;
   mkdirSync(dirname(md),{recursive:true});writeFileSync(json,JSON.stringify(raw));writeFileSync(md,`<!-- insrc:artifact ${id} -->\n# ${k}\nScope\n`);return{id,json,md};
  }
  if(kind!=='DEF')put('DEF',true);if(kind==='LLD')put('HLD',true);Object.assign(f,put(kind,false));f.prepared=prepareDesignSubject(f.repo,f.json);
  let calls=0;const provider={capabilities:{reviewActivity:true},runReviewSession:async(prompt:string,_schema:unknown,opts:ActivityReviewSessionOpts)=>{
   calls++;const chunk=prompt.match(/Chunk assignment: (.+)\n/)?.[1];const value=chunk?reviewResult(f,JSON.parse(chunk).id):reviewPlan(f);assert.equal((await opts.onCandidate(value)).accepted,true);return value;
  }} as unknown as LLMProvider;
  const h=await host(f,provider,true),client=await stdio(h.path,f.repo,true),base={repo:f.repo,reviewId:'review-1',attempt:1},markdown=readFileSync(f.md,'utf8');
  try{
   await reviewCall(client,{phase:'start',...base,artifactPath:f.json});
   if(author==='daemon')for(const unit of ['planning','content','final']){
    const a=await reviewAssignment(client,base);await reviewCall(client,{phase:unit==='planning'?'plan':'result',...base,executionId:a.executionId,sequence:Number(a.sequence)+1,...(unit==='planning'?{plan:reviewPlan(f)}:{result:reviewResult(f,unit)})});
   }
   await until(async()=>!!(await reviewCall(client,{phase:'progress',...base})).report&&!designArtifactActive(f.repo,f.id));
   assert.equal(calls,author==='controller'?3:0);
   const approved=await client.callTool({name:'insrc_workflow_approve',arguments:{repo:f.repo,artifactPath:f.json}});assert.ok(!approved.isError,JSON.stringify(approved));const result=decode(approved);assert.equal(result.approved.length,1,JSON.stringify(result));assert.deepEqual(result.approved[0].result.cleanup.deleted,[f.path]);
   assert.equal(readFileSync(f.md,'utf8'),markdown);const restarted=new CompiledCoordinator({provider:()=>{throw Error('History lookup must not invoke a model');}});
   const historical=await restarted.progress(f.repo,'review-1',1,{artifactPath:f.json,includeResult:true});assert.equal(historical.source,'history');assert.equal(historical.status,'passed');assert.equal(historical.completedResults.length,1);
  }finally{await client.close();await h.ipc.close();}
 }
});
