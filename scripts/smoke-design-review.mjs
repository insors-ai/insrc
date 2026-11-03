// Run with Node 22 after npm run build. Default: deterministic fake CLI transport smoke.
// --live --repo /absolute/project --artifact .insrc/artifacts/LLD-....json
// uses the normal compiled MCP -> Unix IPC -> main owner -> configured review CLI.
import assert from 'node:assert/strict';
import { mkdtempSync,mkdirSync,writeFileSync,readFileSync,chmodSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join,resolve,dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createConnection } from 'node:net';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { setLogMode } from '../out/shared/logger.js';
setLogMode(process.argv[2]==='mcp'?'mcp':'cli');
const {buildInsrcMcpServerWithRegistry}=await import('../out/mcp/server.js');
if(process.argv[2]==='mcp'){
 const server=buildInsrcMcpServerWithRegistry({review:{connect:()=>createConnection(process.argv[3]),resolveRepo:async()=>process.argv[4]}}).server;
 await server.connect(new StdioServerTransport());
}else{
 const {IpcServer,directDispatch}=await import('../out/daemon/server.js');
 const {Router}=await import('../out/daemon/threads/router.js');
 const {TargetRegistry}=await import('../out/daemon/threads/registry.js');
 const {createStepCallHandler,stepToolTable}=await import('../out/daemon/steps/host.js');
 const {handleDesignReviewStep}=await import('../out/daemon/steps/design-review-step.js');
 const {CliProvider}=await import('../out/agent/providers/cli-provider.js');
 const {resolveArtifactMdPath}=await import('../out/workflow/path-scheme.js');
 const live=process.argv.includes('--live'),arg=name=>process.argv[process.argv.indexOf(name)+1];
 if(live)for(const name of ['--repo','--artifact'])assert.ok(process.argv.includes(name)&&arg(name)&&!arg(name).startsWith('--'),`${name} is required for --live`);
 const work=mkdtempSync(join(tmpdir(),'insrc-design-smoke-')),project=live?resolve(arg('--repo')):join(work,'project');
 const reviewId=`design-${live?'live':'fake'}-${Date.now()}`,socket=join(work,'daemon.sock');
 const put=(path,value)=>{mkdirSync(dirname(path),{recursive:true});writeFileSync(path,typeof value==='string'?value:JSON.stringify(value));};
 let artifact=live?resolve(project,arg('--artifact')):join(project,'.insrc/artifacts/LLD-1234567890abcdef-s1.json');
 if(!live){
  const time='2026-11-03T00:00:00.000Z';
  const meta={epicHash:'1234567890abcdef',storyId:'s1',epicCreatedAt:time,createdAt:time,epicSlug:'smoke',standalone:true,authoredBy:'controller'};
  put(artifact,{meta,body:{summary:'Fake transport fixture',requirements:[{id:'r1',statement:'Fixture works'}]},citations:[]});
  const md=resolveArtifactMdPath(project,{epicHash:meta.epicHash,epicCreatedAt:time,story:'s1'},'LLD','standalone','smoke');
  put(md,'<!-- insrc:artifact LLD-1234567890abcdef-s1 -->\n# Synthetic LLD\n\n## Summary\nTransport fixture only\n');put(join(project,'.insrc/schema.json'),{version:2});
  const native=`#!${process.execPath}
import{readFileSync,appendFileSync}from'node:fs';let prompt='';process.stdin.setEncoding('utf8');process.stdin.on('data',x=>prompt+=x);process.stdin.on('end',async()=>{const path=prompt.match(/^Checkpoint\\/inventory\\/accepted feedback: (.*)$/m)[1],cp=JSON.parse(readFileSync(path)),attempt=cp.attempts.at(-1),units=attempt.inventory.units.map(u=>u.id),match=prompt.match(/^Chunk assignment: (.*)$/m),chunk=match?JSON.parse(match[1]):null;const plan={chunks:[{id:'content',title:'Content',selectors:units,concerns:['Fixture'],dependsOn:[],purpose:'substantive'},{id:'final',title:'Consistency',selectors:[],concerns:['Consistency'],dependsOn:['content'],purpose:'consistency'}],coverageExplanation:'Fake complete coverage',finalConsistencyChunkId:'final',coverage:units.map(unitId=>({unitId,chunkIds:['content']}))};const result=chunk?{chunkId:chunk.id,status:'passed',summary:'Synthetic CLI transport feedback; no hosted review',findings:[],inspectedReferences:[...units,cp.subject.documentPath,path],limitations:[],advice:['Fake CLI fixture only']}:plan;appendFileSync(${JSON.stringify(join(work,'calls.jsonl'))},JSON.stringify({stage:chunk?.id??'planning',at:Date.now()})+'\\n');await new Promise(r=>setTimeout(r,300));process.stdout.write(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:JSON.stringify(result)}})+'\\n'+JSON.stringify({type:'turn.completed'})+'\\n');});`;
  put(join(work,'native.mjs'),native);chmodSync(join(work,'native.mjs'),0o755);
 }
 const native=live?undefined:new CliProvider({kind:'codex',binPath:join(work,'native.mjs')});
 const table=live?stepToolTable():stepToolTable({tools:{insrc_review_step:(args,_s,_p,_e,trusted)=>handleDesignReviewStep(args,trusted,{provider:()=>({provider:native,model:'fake-codex-cli (synthetic)'})})}});
 const router=new Router({classOf:()=> 'session',registry:new TargetRegistry(),routed:new Set(['session']),holdMs:50,local:directDispatch({}, {'step.call':createStepCallHandler(table,{registeredRepos:async()=>new Set([project])})})});
 const ipc=new IpcServer(router.forward,Date.now,socket);await ipc.listen();
 const client=new Client({name:'codex',version:'design-smoke'});
 const transport=new StdioClientTransport({command:process.execPath,args:[fileURLToPath(import.meta.url),'mcp',socket,project],env:{...process.env,INSRC_MODE:'mcp'},stderr:'pipe'});
 const evidence={timingResolutionMs:live?10000:100,compiled:true,hostedModel:live,reviewId,attempt:1,project,artifact,startedAt:new Date().toISOString(),observations:[],feedback:[]};
 const evidencePath=join(work,'evidence.json');
 const call=async(phase,fields={})=>{const response=await client.callTool({name:'insrc_review_step',arguments:{phase,repo:project,reviewId,attempt:1,...fields}});if(response.isError)throw new Error(JSON.stringify(response));return JSON.parse(response.content[0].text);};
 const save=()=>writeFileSync(evidencePath,JSON.stringify(evidence,null,2));
 try{
  await client.connect(transport);const begin=Date.now();evidence.ack=await call('start',{artifactPath:artifact});evidence.acknowledgementMs=Date.now()-begin;save();
  console.log(JSON.stringify({event:'acknowledged',evidencePath,...evidence.ack,latencyMs:evidence.acknowledgementMs}));
  let cursor=0,prior='';
  for(;;){
   const view=await call('progress',{includeResult:true,afterCompletedChunk:cursor});
   for(const feedback of view.completedResults){evidence.feedback.push({visibleAt:new Date().toISOString(),feedback});cursor=view.nextCompletedChunk;}
   const signature=JSON.stringify([view.status,view.phase,view.activeChunkId,view.completedChunks,view.totalChunks,view.lastMeaningfulActivityAt]);
   if(signature!==prior){prior=signature;evidence.observations.push({...view,polledAt:new Date().toISOString(),completedResults:undefined});save();console.log(JSON.stringify({event:'progress',status:view.status,phase:view.phase,chunk:view.activeChunkId,completed:view.completedChunks,total:view.totalChunks,elapsedMs:view.reviewElapsedMs,unitElapsedMs:view.unitElapsedMs}));}
   if(!['pending','running'].includes(view.status)&&cursor>=view.completedChunks){evidence.final=view;break;}
   await new Promise(r=>setTimeout(r,live?10000:100));
  }
  const cp=JSON.parse(readFileSync(evidence.ack.checkpointPath,'utf8')),attempt=cp.attempts.at(-1);
  evidence.model=attempt.model;evidence.plan=attempt.plan;evidence.failure=attempt.failure;evidence.finishedAt=new Date().toISOString();evidence.elapsedMs=Date.now()-begin;
  evidence.passed=!!evidence.final.report&&['passed','changes_requested','incomplete'].includes(evidence.final.status)&&evidence.feedback.length===attempt.plan?.chunks.length;save();
  console.log(JSON.stringify({event:'complete',passed:evidence.passed,status:evidence.final.status,model:evidence.model,chunks:evidence.feedback.length,evidencePath,elapsedMs:evidence.elapsedMs,failure:evidence.failure}));
  assert.ok(evidence.passed,'Technical failure or missing substantive feedback remains outstanding');
  if(!live){const calls=readFileSync(join(work,'calls.jsonl'),'utf8').trim().split('\n').map(JSON.parse);assert.deepEqual(calls.map(c=>c.stage),['planning','content','final']);assert.equal(evidence.final.status,'passed');}
 }finally{await client.close();await ipc.close();if(!live)rmSync(project,{recursive:true,force:true});console.log(JSON.stringify({evidencePath}));}
}
