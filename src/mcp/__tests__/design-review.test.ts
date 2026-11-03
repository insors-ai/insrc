import test from 'node:test';
import assert from 'node:assert/strict';
import { createConnection } from 'node:net';
import { join,resolve } from 'node:path';
import { readFileSync,writeFileSync } from 'node:fs';
import { setTimeout as pause } from 'node:timers/promises';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { buildInsrcMcpServerWithRegistry } from '../server.js';
import { DesignReviewConnections } from '../design-review/handler.js';
import { DESIGN_REVIEW_PHASES,DESIGN_REVIEW_INPUT } from '../design-review/schema.js';
import { handleInsrcSchema } from '../schema/handler.js';
import { readWorkflowGuide } from '../../daemon/guide-sections.js';
import { createStepCallHandler,stepToolTable } from '../../daemon/steps/host.js';
import { handleDesignReviewStep } from '../../daemon/steps/design-review-step.js';
import { Router } from '../../daemon/threads/router.js';
import { TargetRegistry } from '../../daemon/threads/registry.js';
import { IpcServer,directDispatch } from '../../daemon/server.js';
import { designFixture } from '../../workflow/review/design-review/__tests__/fixtures.js';
import { loadDesignCheckpoint } from '../../workflow/review/design-review/checkpoint.js';
import type { LLMProvider,ActivityReviewSessionOpts } from '../../shared/types.js';
const decode=(value:unknown)=>JSON.parse((value as {content:{text:string}[]}).content[0]!.text);
async function until(fn:()=>boolean|Promise<boolean>){for(let i=0;i<500;i++){if(await fn())return;await pause(10);}throw new Error('Fixture did not settle');}
async function host(f:ReturnType<typeof designFixture>,provider:LLMProvider){
 writeFileSync(join(f.repo,'.insrc/schema.json'),JSON.stringify({version:2}));const path=join(f.repo,'design.sock');
 const table=stepToolTable({tools:{insrc_review_step:(args,_signal,_progress,_execution,trusted)=>handleDesignReviewStep(args,trusted,{provider:()=>({provider,model:'fake-model (fixture)'})})}});
 const router=new Router({classOf:()=> 'session',registry:new TargetRegistry(),routed:new Set(['session']),holdMs:50,local:directDispatch({}, {'step.call':createStepCallHandler(table,{registeredRepos:async()=>new Set([f.repo])})})});
 const ipc=new IpcServer(router.forward,Date.now,path);await ipc.listen();return{ipc,path};
}
async function stdio(path:string,repo:string){
 const client=new Client({name:'codex',version:'test'});
 const transport=new StdioClientTransport({command:process.execPath,args:['--import','tsx',resolve('src/mcp/__tests__/helpers/design-review-stdio.ts')],env:{...process.env as Record<string,string>,DESIGN_TEST_SOCKET:path,DESIGN_TEST_REPO:repo,INSRC_MODE:'mcp'},stderr:'pipe'});
 await client.connect(transport);return client;
}
test('normal stdio MCP and Unix IPC preserve native background work and controller connection authority',async t=>{
 const f=designFixture(t);let release!:()=>void,calls=0;const barrier=new Promise<void>(r=>release=r);
 const plan={chunks:[{id:'content',title:'Content',selectors:f.prepared.inventory.units.map(u=>u.id),concerns:['Requirements'],dependsOn:[],purpose:'substantive'},{id:'final',title:'Consistency',selectors:[],concerns:['Consistency'],dependsOn:['content'],purpose:'consistency'}],coverageExplanation:'All units',finalConsistencyChunkId:'final',coverage:f.prepared.inventory.units.map(u=>({unitId:u.id,chunkIds:['content']}))};
 const provider={capabilities:{reviewActivity:true},runReviewSession:async(prompt:string,_schema:unknown,opts:ActivityReviewSessionOpts)=>{calls++;await barrier;const chunk=prompt.match(/Chunk assignment: (.+)\n/)?.[1];const value=chunk?{chunkId:JSON.parse(chunk).id,status:'passed',summary:'Fake CLI feedback',findings:[],inspectedReferences:[...f.prepared.inventory.units.map(u=>u.id),f.md,f.path],limitations:[],advice:[]}:plan;assert.equal((await opts.onCandidate(value)).accepted,true);return value;}} as unknown as LLMProvider;
 const h=await host(f,provider);let client=await stdio(h.path,f.repo);const base={repo:f.repo,reviewId:'review-1',attempt:1};
 try{
  const ack=decode(await client.callTool({name:'insrc_review_step',arguments:{phase:'start',...base,artifactPath:f.json}}));assert.equal(ack.status,'pending');
  await until(()=>calls===1);await client.close();client=await stdio(h.path,f.repo);
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
