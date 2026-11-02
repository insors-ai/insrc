import test from 'node:test';
import assert from 'node:assert/strict';
import { createConnection } from 'node:net';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { buildInsrcMcpServerWithRegistry } from '../server.js';
import { CodeReviewConnections } from '../code-review/handler.js';
import { CODE_REVIEW_INPUT, CODE_REVIEW_PHASES } from '../code-review/schema.js';
import { handleInsrcSchema } from '../schema/handler.js';
import { readWorkflowGuide } from '../../daemon/guide-sections.js';
import { createStepCallHandler, stepToolTable } from '../../daemon/steps/host.js';
import { handleTaskReviewStep } from '../../daemon/steps/task-review-step.js';
import { IpcServer, directDispatch } from '../../daemon/server.js';
import { fixture, hash } from '../../workflow/code-review/task-review/__tests__/publication-fixture.js';
import { provider, eventually } from '../../workflow/code-review/task-review/__tests__/controller-fixture.js';
import type { LLMProvider } from '../../shared/types.js';

async function host(f:Awaited<ReturnType<typeof fixture>>, getProvider:()=>LLMProvider){
 const path=join(f.repo,'normal.sock');
 const table=stepToolTable({tools:{insrc_code_review_step:(args,_signal,_progress,_execution,trusted)=>handleTaskReviewStep(args,trusted,{provider:getProvider})}});
 const ipc=new IpcServer(directDispatch({}, {'step.call':createStepCallHandler(table)}),Date.now,path);await ipc.listen();
 const built=buildInsrcMcpServerWithRegistry({review:{connect:()=>createConnection(path),resolveRepo:async()=>f.repo}});
 const client=new Client({name:'codex',version:'test'}),[a,b]=InMemoryTransport.createLinkedPair();
 await built.server.connect(a);await client.connect(b);
 return {...built,client,ipc,path,close:async()=>{await client.close();await built.server.close();await ipc.close();}};
}
const decode=(value:unknown)=>JSON.parse((value as {content:{text:string}[]}).content[0]!.text);

test('Normal MCP start/progress/publication use committed packets and reject retired or inferred scopes',async()=>{
 const f=await fixture(true);let release!:()=>void,calls=0;const waiting=new Promise<void>(resolve=>{release=resolve;});
 const h=await host(f,()=>provider(async()=>{calls++;await waiting;return f.result;}));
 const common={repo:f.repo,epicHash:hash,reviewId:'normal',attempt:1};
 try{
  const missing=await h.client.callTool({name:'insrc_code_review_step',arguments:{...common,phase:'start'}});assert.equal(missing.isError,true);assert.equal(calls,0);
  const ack=decode(await h.client.callTool({name:'insrc_code_review_step',arguments:{...common,phase:'start',packet:f.packet}}));assert.equal(ack.status,'pending');
  await eventually(()=>calls===1);
  const view=decode(await h.client.callTool({name:'insrc_code_review_step',arguments:{...common,phase:'progress'}}));assert.equal(view.completedTasks,0);assert.equal(calls,1);
  const duplicate=await h.client.callTool({name:'insrc_code_review_step',arguments:{...common,phase:'start',packet:f.packet}});assert.equal(duplicate.isError,true);
  release();await eventually(()=>f.read(ack.path).attempts[0]!['review-response'].crPublication==='complete');
  const published=decode(await h.client.callTool({name:'insrc_code_review_step',arguments:{...common,phase:'publish'}}));assert.ok(published.path);assert.equal(calls,1);
  const bad={...structuredClone(f.packet),reviewSet:[{...f.packet.reviewSet[0]!,files:[{path:'source.js',segments:[{before:[1,1]}]}]}]};
  const rejected=await h.client.callTool({name:'insrc_code_review_step',arguments:{...common,phase:'start',reviewId:'bad',packet:bad}}).catch(()=>({isError:true}));assert.equal(rejected.isError,true);
 }finally{release();await h.close();f.cleanup();}
});

test('Normal controller/daemon routes preserve coverage/status/diagnostic policy, after-only scope and schema/guide parity',async()=>{
 const f=await fixture(true);f.build.meta.authoredBy='daemon';f.put(`.insrc/artifacts/BUILD-${hash}-s1.json`,f.build);
 const h=await host(f,()=>{throw new Error('Controller review must not spawn CLI');});
 const common={repo:f.repo,epicHash:hash,reviewId:'controller-normal',attempt:1};
 try{
  const schema=handleInsrcSchema({tool:'insrc_code_review_step',phase:'start'},h.schemaRegistry);assert.deepEqual('validPhases' in schema?schema.validPhases:[],CODE_REVIEW_PHASES);
  assert.equal(h.schemaRegistry.get('insrc_code_review_step')!.rawShape,CODE_REVIEW_INPUT);
  const guide=readWorkflowGuide(readFileSync('src/prompts/steering-block.md','utf8'),'code-review');assert.ok(guide);for(const phase of CODE_REVIEW_PHASES)assert.ok(guide.includes(phase));
  const frame=decode(await h.client.callTool({name:'insrc_code_review_step',arguments:{...common,phase:'start',packet:f.packet}}));assert.equal(frame.kind,'task');assert.match(frame.prompt,/coverage/i);
  const envelope={taskId:frame.taskId,executionId:frame.executionId,sequence:frame.nextSequence};
  const diag=decode(await h.client.callTool({name:'insrc_code_review_step',arguments:{...common,...envelope,phase:'activity',event:{kind:'diagnostic',phase:'assessment',diagnostic:{provider:'codex',issues:[{code:'MISSING_REQUIRED_FIELD',field:'findings',correction:'Return findings as a top-level JSON array.',occurrences:1}]}}}}));
  assert.equal(diag.acceptedSequence,envelope.sequence);
  const passed=decode(await h.client.callTool({name:'insrc_code_review_step',arguments:{...common,...envelope,sequence:diag.acceptedSequence+1,phase:'result',result:f.result}}));assert.equal(passed.status,'passed');
  assert.equal(f.read(frame.path).attempts[0]!['review-response'].failureDiagnostics![0]!.resolved,true);
  const design=await h.client.callTool({name:'insrc_review_step',arguments:{}});assert.equal(design.isError,true);
 }finally{await h.close();f.cleanup();}
});

test('normal controller connections are isolated and session close requires explicit resume',async()=>{
 const f=await fixture(true);f.build.meta.authoredBy='daemon';f.put(`.insrc/artifacts/BUILD-${hash}-s1.json`,f.build);
 const h=await host(f,()=>{throw new Error('No controller provider');});
 const manager=new CodeReviewConnections({connect:()=>createConnection(h.path),resolveRepo:async()=>f.repo});
 const common={repo:f.repo,epicHash:hash,attempt:1},call=(input:Record<string,unknown>,signal?:AbortSignal)=>manager.call({...common,...input},'codex',signal);
 try{
  const one=decode(await call({phase:'start',reviewId:'one',packet:f.packet})),two=decode(await call({phase:'start',reviewId:'two',packet:f.packet}));
  const abort=new AbortController();abort.abort();const cancelled=await call({phase:'assignment',reviewId:'one'},abort.signal);assert.equal(cancelled.isError,true);
  await eventually(()=>f.read(one.path).attempts[0]!.header.interrupted===true);
  const still=decode(await call({phase:'assignment',reviewId:'two'}));assert.equal(still.executionId,two.executionId);
  const rebound=decode(await call({phase:'resume',reviewId:'one'}));assert.notEqual(rebound.executionId,one.executionId);
  manager.close();await eventually(()=>f.read(two.path).attempts[0]!.header.interrupted===true);
  const owned=decode(await h.client.callTool({name:'insrc_code_review_step',arguments:{...common,phase:'start',reviewId:'session-owned',packet:f.packet}}));
  await h.client.close();await eventually(()=>f.read(owned.path).attempts[0]!.header.interrupted===true);
 }finally{manager.close();await h.close();f.cleanup();}
});
