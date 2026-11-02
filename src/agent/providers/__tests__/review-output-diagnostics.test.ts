import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ReviewActivityStream } from '../review-activity-stream.js';
import { CliProvider } from '../cli-provider.js';
import { ReviewDiagnosticCollector, ReviewOutputFailureError } from '../../../shared/review-diagnostics.js';
import type { ReviewDiagnosticSnapshot } from '../../../shared/review-diagnostics.js';
import type { ActivityReviewSessionOpts } from '../../../shared/types.js';

const schema={type:'object',properties:{summary:{type:'string'},findings:{type:'array',items:{type:'object'}}},required:['summary','findings'],additionalProperties:false};
const line=(x:unknown)=>Buffer.from(JSON.stringify(x)+'\n');
const valid={summary:'Reviewed',findings:[]};
function harness(kind:'claude'|'codex',candidate?:ActivityReviewSessionOpts['onCandidate']){
 const snapshots:ReviewDiagnosticSnapshot[]=[],accepted:unknown[]=[];
 const opts:ActivityReviewSessionOpts={mode:'activity',cwd:'/tmp',signal:new AbortController().signal,inactivityMs:1800000,internalRetry:false,onActivity:()=>{},onDiagnostic:s=>{snapshots.push(s);},onCandidate:candidate??(async x=>{accepted.push(x);return{accepted:true};})};
 return {parser:new ReviewActivityStream(kind,schema,opts,()=>{}),opts,snapshots,accepted};
}
test('Claude missing-findings repeated five times coalesces and never accepts',async()=>{
 const h=harness('claude');await h.parser.start();
 for(let i=0;i<5;i++){
  await h.parser.feed(line({type:'assistant',uuid:`a${i}`,message:{content:[{type:'tool_use',id:`out${i}`,name:'StructuredOutput',input:{summary:'Reviewed</summary><parameter name="findings">[]'}}]}}));
  await h.parser.feed(line({type:'user',uuid:`b${i}`,message:{content:[{type:'tool_result',tool_use_id:`out${i}`,is_error:true,content:'Output does not match required schema: missing findings'}]}}));
 }
 assert.deepEqual(h.accepted,[]);assert.equal(h.parser.result().accepted,false);
 const diagnostic=h.parser.diagnosticSnapshot();assert.equal(diagnostic.issues.length,1);
 assert.deepEqual(diagnostic.issues[0],{code:'MISSING_REQUIRED_FIELD',field:'findings',correction:'Return findings as a top-level JSON array.',message:'/: must have required property \'findings\' ({"missingProperty":"findings"})',occurrences:5});
 assert.ok(diagnostic.lastRejectedFeedback?.preview.includes('<parameter'));
 // Unrelated tool errors must not become output-schema diagnostics.
 const unrelated=harness('claude');await unrelated.parser.feed(line({type:'assistant',message:{content:[{type:'tool_use',id:'read',name:'Read',input:{}}]}}));
 await unrelated.parser.feed(line({type:'user',message:{content:[{type:'tool_result',tool_use_id:'read',is_error:true,content:'missing findings'}]}}));
 assert.deepEqual(unrelated.snapshots,[]);
});
test('Codex final JSON parse/schema failure preserves finality and diagnostics',async()=>{
 for(const text of ['not JSON',JSON.stringify({summary:'missing findings'})]){
  const h=harness('codex');await h.parser.feed(line({type:'item.completed',item:{type:'agent_message',text}}));
  assert.deepEqual(h.snapshots,[],'non-final commentary is not an output failure');
  await h.parser.feed(line({type:'turn.completed'}));
  assert.deepEqual(h.accepted,[]);assert.ok(h.snapshots.length>0);
  assert.equal(h.parser.diagnosticSnapshot().issues[0]?.code,text==='not JSON'?'INVALID_JSON':'MISSING_REQUIRED_FIELD');
  assert.throws(()=>h.parser.completed(),ReviewOutputFailureError);
 }
 const h=harness('codex');await h.parser.feed(line({type:'item.completed',item:{type:'agent_message',text:'private interim prose'}}));
 await h.parser.feed(line({type:'item.completed',item:{type:'agent_message',text:JSON.stringify(valid)}}));
 await h.parser.feed(line({type:'turn.completed'}));assert.deepEqual(h.accepted,[valid]);assert.deepEqual(h.snapshots,[]);
});
test('Terminal CLI failure and host semantic rejection retain pointed fields',async()=>{
 for(const kind of ['claude','codex'] as const){
  const h=harness(kind,async()=>{throw Object.assign(new Error('location outside submitted scope'),{field:'location'});});
  const content=kind==='claude'?{type:'assistant',message:{content:[{type:'tool_use',id:'out',name:'StructuredOutput',input:valid}]}}:{type:'item.completed',item:{type:'agent_message',text:JSON.stringify(valid)}};
  const run=async()=>{await h.parser.feed(line(content));if(kind==='codex')await h.parser.feed(line({type:'turn.completed'}));};
  await assert.rejects(run(),(e:unknown)=>e instanceof ReviewOutputFailureError&&e.diagnostic.issues[0]?.field==='location');
  assert.deepEqual(h.accepted,[]);
  const terminal=harness(kind);
  await terminal.parser.feed(line(kind==='claude'?{type:'result',is_error:true,subtype:'error_max_structured_output_retries',errors:['Required field missing']}:{type:'turn.failed',error:{message:'remote failure'}}));
  const e=await terminal.parser.failure('cli_exit','generic exit',1);
  assert.equal(e.diagnostic.terminal?.reason,kind==='claude'?'error_max_structured_output_retries':'turn.failed');assert.equal(e.diagnostic.terminal?.exitCode,1);
  assert.ok(e.diagnostic.terminal?.message?.includes(kind==='claude'?'Required field':'remote failure'));
 }
});
test('UTF-8/count/preview budgets and static correction mapping exclude reasoning and markup repair',()=>{
 const c=new ReviewDiagnosticCollector('claude');
 for(let i=0;i<20;i++)c.issue({code:`CODE_${i}`,field:'é'.repeat(300),correction:'Fix field',message:'界'.repeat(1000)});
 c.rejected({summary:'界'.repeat(10000),thinking:'THINKING_CANARY',findings:[],extra:'EXTRA_CANARY'},['summary','findings']);
 const s=c.snapshot();assert.equal(s.issues.length,8);assert.equal(s.truncated,true);
 for(const issue of s.issues){assert.ok(Buffer.byteLength(issue.field)<=256);assert.ok(Buffer.byteLength(issue.message??'')<=1024);assert.ok(!issue.field.includes('\ufffd'));}
 assert.ok(Buffer.byteLength(s.lastRejectedFeedback!.preview)<=8192);assert.ok(!s.lastRejectedFeedback!.preview.includes('\ufffd'));assert.ok(!JSON.stringify(s).includes('CANARY'));
});
test('fake native CLI exit carries diagnostics and callback failures are not acknowledged',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'review-output-error-')),bin=join(dir,'fake.mjs');
 try{
  for(const kind of ['claude','codex'] as const){
   const frames=kind==='claude'?[{type:'assistant',message:{content:[{type:'tool_use',id:'out',name:'StructuredOutput',input:{summary:'missing'}}]}},{type:'result',is_error:true,subtype:'error_max_structured_output_retries',errors:['missing findings']}]:[{type:'item.completed',item:{type:'agent_message',text:'invalid JSON'}},{type:'turn.completed'}];
   writeFileSync(bin,'#!/usr/bin/env node\nprocess.stdin.resume();process.stdin.on("end",()=>process.stdout.write('+JSON.stringify(frames.map(f=>JSON.stringify(f)+'\n').join(''))+',()=>process.exit(1)));');chmodSync(bin,0o755);
   const h=harness(kind),cli=new CliProvider({kind,binPath:bin});
   await assert.rejects(cli.runReviewSession('review',schema,{...h.opts,cwd:dir}),(e:unknown)=>e instanceof ReviewOutputFailureError&&e.diagnostic.issues.some(i=>i.code===(kind==='claude'?'MISSING_REQUIRED_FIELD':'INVALID_JSON')));
   assert.ok(h.snapshots.length>0);
  }
  const h=harness('claude'),failure=new Error('diagnostic disk failure');
  const parser=new ReviewActivityStream('claude',schema,{...h.opts,onDiagnostic:()=>{throw failure;}},()=>{});
  await assert.rejects(parser.feed(line({type:'assistant',message:{content:[{type:'tool_use',name:'StructuredOutput',id:'out',input:{summary:'missing'}}]}})),e=>e===failure);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
