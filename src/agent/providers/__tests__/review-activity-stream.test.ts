import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ReviewActivityStream } from '../review-activity-stream.js';
import { CliProvider } from '../cli-provider.js';
import type { ActivityReviewSessionOpts } from '../../../shared/types.js';
import type { ReviewActivityEvent } from '../../../shared/review-activity.js';
import { runInProcessGroup } from '../../../shared/process-group.js';

// Synthetic protocol fixtures, not live model evidence. Claude stream-json flags
// were verified with the installed CLI help. Codex finality uses turn.completed.
const schema={type:'object',required:['ok'],properties:{ok:{type:'boolean'}},additionalProperties:false};
const json=(x:unknown)=>JSON.stringify(x)+'\n';
function harness(kind:'claude'|'codex',accept=true){
 const events:ReviewActivityEvent[]=[],candidates:unknown[]=[];let stopped=false;
 const opts:ActivityReviewSessionOpts={mode:'activity',cwd:'/tmp',signal:new AbortController().signal,inactivityMs:1800000,internalRetry:false,onActivity:e=>{events.push(e);},onCandidate:async value=>{candidates.push(value);return{accepted:accept};}};
 return {parser:new ReviewActivityStream(kind,schema,opts,()=>{stopped=true;}),events,candidates,stopped:()=>stopped};
}
test('Claude fragmented UTF-8 streams expose metadata and complete structured candidates, not partial input or acknowledgements',async()=>{
 const h=harness('claude');await h.parser.start();
 const frames=[{type:'stream_event',uuid:'a',event:{type:'content_block_start',content_block:{type:'tool_use',id:'read-1',name:'Read'}}},
 {type:'stream_event',uuid:'b',event:{type:'content_block_delta',delta:{type:'text_delta',text:'private — text'}}},
 {type:'user',uuid:'c',message:{content:[{type:'tool_result',tool_use_id:'read-1',content:'private file'}]}},
 {type:'user',uuid:'d',message:{content:[{type:'tool_result',tool_use_id:'output-1',content:{ok:true}}]}},
 {type:'assistant',uuid:'e',message:{content:[{type:'tool_use',id:'output-1',name:'StructuredOutput',input:{ok:true}}]}}];
 const bytes=Buffer.from(frames.map(json).join(''));for(let i=0;i<bytes.length;i+=7)await h.parser.feed(bytes.subarray(i,i+7));await h.parser.end();
 assert.equal(h.stopped(),true);assert.deepEqual(h.candidates,[{ok:true}]);assert.ok(h.events.some(e=>e.kind==='tool_completed'&&e.toolId==='read-1'));
 assert.ok(!JSON.stringify(h.events).includes('private'));assert.deepEqual(h.parser.result(),{accepted:true,value:{ok:true}});
});
test('Codex completed messages wait for successful turn finality and duplicate native IDs do not renew',async()=>{
 const h=harness('codex');await h.parser.start();
 await h.parser.feed(Buffer.from(json({type:'item.completed',uuid:'same',item:{type:'agent_message',text:'{"ok":true}'}})));
 const n=h.events.length;await h.parser.feed(Buffer.from(json({type:'item.completed',uuid:'same',item:{type:'agent_message',text:'{"ok":true}'}})));
 assert.equal(h.events.length,n);assert.equal(h.candidates.length,0);
 await h.parser.feed(Buffer.from(json({type:'turn.completed'})));assert.deepEqual(h.parser.result(),{accepted:true,value:{ok:true}});
 const failed=harness('codex');await failed.parser.start();await failed.parser.feed(Buffer.from(json({type:'item.completed',item:{type:'agent_message',text:'{"ok":true}'}})+json({type:'turn.failed'})));assert.equal(failed.candidates.length,0);assert.throws(()=>failed.parser.completed());
});
test('invalid and oversized candidate/frame data fail explicitly without accepting truncated feedback',async()=>{
 const h=harness('claude');await h.parser.start();
 await h.parser.feed(Buffer.from(json({type:'assistant',message:{content:[{type:'tool_use',id:'out',name:'StructuredOutput',input:{wrong:true}}]}})));assert.equal(h.candidates.length,0);
 await assert.rejects(h.parser.feed(Buffer.from('x'.repeat(8*1024*1024+1))),/exceeds 8 MiB/);
 const big=harness('claude');await big.parser.start();await assert.rejects(big.parser.feed(Buffer.from(json({type:'assistant',message:{content:[{type:'tool_use',id:'out',name:'StructuredOutput',input:{value:'x'.repeat(4*1024*1024)}}]}}))),/exceeds 4 MiB/);
});
test('activity subprocess has no fixed timer, serializes observers and bounds retained output',async()=>{
 const cancel=new AbortController();let active=0,max=0,bytes=0;
 const r=await runInProcessGroup(process.execPath,['-e',"process.stderr.write('x'.repeat(100000));process.stdout.write('first');setTimeout(()=>process.stdout.write('second'),10);setInterval(()=>{},1000)"],{mode:'activity',signal:cancel.signal,onStdoutChunk:async chunk=>{active++;max=Math.max(max,active);bytes+=chunk.length;await new Promise(r=>setTimeout(r,30));active--;if(bytes>=11)cancel.abort();}});
 assert.equal(r.aborted,true);assert.equal(r.timedOut,false);assert.equal(r.stdout,'');assert.ok(Buffer.byteLength(r.stderr)<=65536);assert.equal(max,1);assert.equal(bytes,11);
 assert.throws(()=>runInProcessGroup(process.execPath,[],{mode:'activity',signal:cancel.signal,timeoutMs:1,onStdoutChunk:async()=>{}} as never),/Invalid activity process options/);
 await assert.rejects(runInProcessGroup(process.execPath,['-e',"process.stdout.write('data');setInterval(()=>{},1000)"],{mode:'activity',signal:new AbortController().signal,onStdoutChunk:async()=>{throw Error('observer rejected');}}),/observer rejected/);
});
test('CLI activity mode ignores bounded provider timers and uses stream flags; durable accepted output survives wrapper failure',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'insrc-activity-cli-'));const bin=join(dir,'fake.mjs'),args=join(dir,'args.json');
 try{
  writeFileSync(bin,'#!/usr/bin/env node\nimport{writeFileSync}from"node:fs";writeFileSync('+JSON.stringify(args)+',JSON.stringify(process.argv));process.stdin.resume();setTimeout(()=>{process.stdout.write('+JSON.stringify(json({type:'assistant',message:{content:[{type:'tool_use',id:'out',name:'StructuredOutput',input:{ok:true}}]}}))+');setTimeout(()=>process.exit(1),30)},40);');chmodSync(bin,0o755);
  const provider=new CliProvider({kind:'claude',binPath:bin,timeoutMs:1,codexFirstOutputMs:1});let count=0;
  const value=await provider.runReviewSession('private prompt',schema,{mode:'activity',cwd:dir,signal:new AbortController().signal,inactivityMs:1800000,internalRetry:false,onActivity:()=>{},onCandidate:async()=>{count++;return{accepted:true};}});
  assert.deepEqual(value,{ok:true});assert.equal(count,1);const argv=JSON.parse(readFileSync(args,'utf8')) as string[];
  assert.equal(argv[argv.indexOf('--output-format')+1],'stream-json');assert.ok(argv.includes('--include-partial-messages'));assert.ok(argv.includes('--verbose'));
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('a non-JSON final Codex message cannot promote earlier JSON and terminal failure cannot accept later feedback',async()=>{
 const codex=harness('codex');await codex.parser.start();
 await codex.parser.feed(Buffer.from(json({type:'item.completed',item:{type:'agent_message',text:'{"ok":true}'}})+json({type:'item.completed',item:{type:'agent_message',text:'not a structured final answer'}})+json({type:'turn.completed'})));
 assert.deepEqual(codex.candidates,[]);assert.throws(()=>codex.parser.completed(),/successful final assessment/);
 const malformed=harness('codex');await malformed.parser.start();
 await assert.rejects(malformed.parser.feed(Buffer.from(json({type:'item.completed',item:{type:'agent_message'}}))),/final message has no text/);
 const claude=harness('claude');await claude.parser.start();
 await claude.parser.feed(Buffer.from(json({type:'result',is_error:true})+json({type:'assistant',message:{content:[{type:'tool_use',id:'late',name:'StructuredOutput',input:{ok:true}}]}})));
 assert.deepEqual(claude.candidates,[]);
});

test('long Claude and Codex streams keep bounded recent-ID deduplication and accept final feedback',async()=>{
 for(const kind of ['claude','codex'] as const){
  const h=harness(kind);await h.parser.start();
  const frame=(uuid:string)=>kind==='claude'
   ? {type:'stream_event',uuid,event:{type:'content_block_delta',delta:{type:'thinking_delta',thinking:'private reasoning'}}}
   : {type:'item.completed',uuid,item:{type:'agent_message',text:'still reviewing'}};
  for(let i=0;i<13000;i++){
   const bytes=Buffer.from(json(frame(`event-${i}`)));
   await h.parser.feed(bytes);
   const count=h.events.length;
   await h.parser.feed(bytes);
   assert.equal(h.events.length,count,'recent duplicates do not renew activity');
  }
  // Check the memory invariant directly rather than depending on GC/heap timing.
  assert.equal((h.parser as unknown as {seen:Set<string>}).seen.size,4096);
  assert.equal(h.candidates.length,0);
  assert.equal(h.events.filter(e=>e.kind==='model_output').length,13000);
  if(kind==='claude')await h.parser.feed(Buffer.from(json({type:'assistant',uuid:'final',message:{content:[{type:'tool_use',id:'out',name:'StructuredOutput',input:{ok:true}}]}})));
  else{
   await h.parser.feed(Buffer.from(json({type:'item.completed',uuid:'final-message',item:{type:'agent_message',text:'{"ok":true}'}})));
   assert.equal(h.candidates.length,0,'Codex still requires successful turn finality');
   await h.parser.feed(Buffer.from(json({type:'turn.completed',uuid:'final-turn'})));
  }
  assert.deepEqual(h.candidates,[{ok:true}]);assert.deepEqual(h.parser.result(),{accepted:true,value:{ok:true}});
  assert.equal(h.stopped(),true);assert.ok(!JSON.stringify(h.events).includes('private reasoning'));
 }
});

test('tool state survives event-ID window turnover and duplicate completions remain harmless',async()=>{
 for(const kind of ['claude','codex'] as const){
  const h=harness(kind);await h.parser.start();
  const tool=(start:boolean,uuid:string)=>kind==='claude'
   ? start ? {type:'assistant',uuid,message:{content:[{type:'tool_use',id:'long-tool',name:'Read'}]}}
     : {type:'user',uuid,message:{content:[{type:'tool_result',tool_use_id:'long-tool',content:'private file'}]}}
   : {type:start?'item.started':'item.completed',uuid,item:{id:'long-tool',type:'command_execution'}};
  await h.parser.feed(Buffer.from(json(tool(true,'start'))));
  for(let i=0;i<9000;i++)await h.parser.feed(Buffer.from(json({type:'system',uuid:`filler-${i}`})));
  await h.parser.feed(Buffer.from(json(tool(true,'new-start-envelope'))));
  assert.equal(h.events.filter(e=>e.kind==='tool_started').length,1,'active tools are tracked separately from event UUIDs');
  await h.parser.feed(Buffer.from(json(tool(false,'done'))));
  const count=h.events.length;
  await h.parser.feed(Buffer.from(json(tool(false,'done'))));
  await h.parser.feed(Buffer.from(json(tool(false,'new-done-envelope'))));
  assert.equal(h.events.length,count);assert.equal(h.events.filter(e=>e.kind==='tool_completed').length,1);
 }
});

test('event-window rollover retains malformed-event and UUID-length errors',async()=>{
 for(const kind of ['claude','codex'] as const){
  for(const invalid of ['not json\n',json([]),json({type:'system',uuid:'x'.repeat(257)})]){
   const h=harness(kind);await h.parser.start();
   for(let i=0;i<4200;i++)await h.parser.feed(Buffer.from(json({type:'system',uuid:String(i)})));
   await assert.rejects(h.parser.feed(Buffer.from(invalid)),/Invalid review native|identity exceeds limit/);
   assert.deepEqual(h.candidates,[]);
  }
 }
});
