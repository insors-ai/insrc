// Run after npm run build with Node 22. Local transport verification; no hosted model.
import assert from 'node:assert/strict';
import { mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,chmodSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync,fork } from 'node:child_process';
import { createConnection } from 'node:net';
import { Worker,MessageChannel } from 'node:worker_threads';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { buildInsrcMcpServerWithRegistry } from '../out/mcp/server.js';
import { IpcServer,directDispatch } from '../out/daemon/server.js';
import { Router } from '../out/daemon/threads/router.js';
import { TargetRegistry } from '../out/daemon/threads/registry.js';
import { createStepCallHandler,stepToolTable } from '../out/daemon/steps/host.js';
import { handleTaskReviewStep } from '../out/daemon/steps/task-review-step.js';
import { cleanupApprovedTaskReviews } from '../out/daemon/task-review-rpc.js';
import { handleWorkflowApprove } from '../out/daemon/workflow-approve.js';
import { approveWorkflowTarget } from '../out/workflow/gates.js';
import { rpc } from '../out/shared/ipc-client.js';
import { registerGitTools } from '../out/daemon/tools/builtins/git/index.js';
import { CliProvider } from '../out/agent/providers/cli-provider.js';

const hash='1234567890abcdef',root=process.argv[3],hostMode=process.argv[2]==='host';
const wait=async check=>{const deadline=Date.now()+30000;while(!check()){assert.ok(Date.now()<deadline,'Smoke condition timed out');await new Promise(r=>setTimeout(r,20));}};
if(hostMode){
 registerGitTools();
 const {port1,port2}=new MessageChannel(),registry=new TargetRegistry();
 const workerSource=`import {parentPort,workerData,threadId} from 'node:worker_threads';import {serveRequests} from ${JSON.stringify(new URL('../out/daemon/threads/worker-requests.js',import.meta.url).href)};import {directDispatch} from ${JSON.stringify(new URL('../out/daemon/server.js',import.meta.url).href)};serveRequests(workerData.port,directDispatch({'probe.where':async()=>({threadId})},{'step.call':async()=>{throw new Error('Review incorrectly routed to worker')}}));parentPort.postMessage('ready');`;
 const workerPath=join(root,'worker.mjs');writeFileSync(workerPath,workerSource);
 const worker=new Worker(workerPath,{workerData:{port:port2},transferList:[port2]});await new Promise(r=>worker.once('message',r));registry.register({threadId:worker.threadId,cls:'session'});
 const socket=join(root,'daemon.sock'),native=new CliProvider({kind:'codex',binPath:join(root,'native.mjs')});
 const table=stepToolTable({tools:{insrc_code_review_step:(args,_s,_p,_e,trusted)=>handleTaskReviewStep(args,trusted,{provider:()=>native})}});
 const router=new Router({classOf:()=> 'session',registry,routed:new Set(['session']),local:directDispatch({
  'codeReview.task.cleanup':cleanupApprovedTaskReviews,
  'workflow.approve':raw=>handleWorkflowApprove(raw,{approve:req=>approveWorkflowTarget({...req,afterBuildApproval:(repo,epicHash,storyId)=>rpc('codeReview.task.cleanup',{repo,epicHash,storyId},()=>createConnection(socket),{timeoutMs:30000})})}),
 },{'step.call':createStepCallHandler(table)})});router.attach(worker.threadId,port1);
 const server=new IpcServer(router.forward,Date.now,socket);await server.listen();process.send({ready:true,socket,threadId:worker.threadId});
 process.on('message',async message=>{if(message==='stop'){await server.close();port1.close();await worker.terminate();process.exit(0);}});
}else{
 const project=mkdtempSync(join(tmpdir(),'insrc-s3-smoke-')),socket=join(project,'daemon.sock'),calls=join(project,'native-calls.jsonl');
 const put=(path,value)=>{mkdirSync(join(project,path,'..'),{recursive:true});writeFileSync(join(project,path),typeof value==='string'?value:JSON.stringify(value));};
 const git=(...args)=>execFileSync('git',['-C',project,...args],{encoding:'utf8',env:{...process.env,GIT_CONFIG_GLOBAL:'/dev/null',GIT_CONFIG_NOSYSTEM:'1'}}).trim();
 const checkpoint=id=>join(project,`.insrc/tmp/code-review/${id}.json`),read=id=>JSON.parse(readFileSync(checkpoint(id))).attempts.at(-1);
 let daemon,server,client;
 const startHost=()=>new Promise((resolve,reject)=>{daemon=fork(fileURLToPath(import.meta.url),['host',project],{stdio:['ignore','inherit','inherit','ipc']});daemon.once('error',reject);daemon.once('message',resolve);});
 const stopHost=()=>new Promise(resolve=>{daemon.once('exit',resolve);daemon.send('stop');});
 const openMcp=async()=>{const built=buildInsrcMcpServerWithRegistry({review:{connect:()=>createConnection(socket),resolveRepo:async()=>project}});server=built.server;client=new Client({name:'codex',version:'smoke'});const[a,b]=InMemoryTransport.createLinkedPair();await server.connect(a);await client.connect(b);};
 const call=async(phase,reviewId,attempt=1,fields={})=>{const reply=await client.callTool({name:'insrc_code_review_step',arguments:{phase,repo:project,epicHash:hash,reviewId,attempt,...fields}});if(reply.isError)throw new Error(JSON.stringify(reply));return JSON.parse(reply.content[0].text);};
 try{
  git('init','-q');git('config','user.name','Smoke');git('config','user.email','smoke@example.test');
  const meta={epicHash:hash,storyId:'s1',createdAt:new Date().toISOString(),epicCreatedAt:new Date().toISOString(),epicSlug:'smoke',repoPath:project};
  const docs={story:`.insrc/artifacts/DEF-${hash}.json`,lld:`.insrc/artifacts/LLD-${hash}-s1.json`,plan:`.insrc/artifacts/PLAN-${hash}-s1.json`};
  put(docs.story,{meta:{...meta,workflow:'define'},body:{stories:[{id:'s1'}]}});put(docs.lld,{meta:{...meta,workflow:'design.story'},body:{}});
  put(docs.plan,{meta:{...meta,workflow:'plan'},body:{tasks:['t1','t2'].map((id,i)=>({id,title:id,summary:'Behavior',size:'S',order:i+1,dependsOn:i?['t1']:[],acceptanceChecks:['Behavior holds'],derivedFrom:['c1'],tests:[{level:'unit',name:'Behavior'}]}))},citations:[{id:'c1',kind:'stakeholder',ref:'Smoke'}]});
  const buildPath=`.insrc/artifacts/BUILD-${hash}-s1.json`,build={meta:{...meta,workflow:'build',authoredBy:'controller'},body:{summary:'Smoke build',tasks:[{id:'t1',passed:true},{id:'t2',passed:true}]}};put(buildPath,build);put('.insrc/schema.json',{version:2});put('source.js','export const value=1;\n');put('test.js','// test evidence\n');git('add','.');git('commit','-qm','base');const parent=git('rev-parse','HEAD');put('source.js','export const value=2;\n');git('add','source.js');git('commit','-qm','change');const commit=git('rev-parse','HEAD');
  const packet={storyId:'s1',functionalSummary:'ONE',documents:Object.fromEntries(Object.entries(docs).map(([key,path])=>[key,{path,commit:parent}])),reviewSet:[{commit,parent,files:[{path:'source.js',segments:[{after:[1,1]}]}]}],tests:[{file:'test.js',cases:['Behavior'],command:'node --test test.js',result:'not_run',executionDetails:'Synthetic transport smoke; not executed coverage',evidenceReferences:[]}]};
  const result=taskId=>({taskId,status:'passed',summary:'Synthetic transport result; no real code review performed',findings:[],testCoverage:{assessment:'verified',explanation:'Synthetic schema-valid fixture; not a hosted coverage review',evidenceReferences:[`${commit}:test.js`]},limitations:[],advice:['Optional execution: transport smoke only'],inspectedReferences:[`${commit}:source.js`],executedTests:[]});
  const native=`#!/usr/bin/env node
import{appendFileSync,existsSync,readFileSync}from'node:fs';let prompt='';process.stdin.setEncoding('utf8');process.stdin.on('data',x=>prompt+=x);process.stdin.on('end',async()=>{const scope=prompt.startsWith('Derive task attribution'),task=scope?null:JSON.parse(prompt.match(/^Task: (.*)$/m)[1]),id=prompt.includes('FAIL_FIRST')?'retry':prompt.includes('TWO')?'two':'one';const schema=JSON.parse(readFileSync(process.argv[process.argv.indexOf('--output-schema')+1]));appendFileSync(${JSON.stringify(calls)},JSON.stringify({id,task:task?.taskId,stage:'start',at:Date.now()})+'\\n');while(!existsSync(${JSON.stringify(join(project,'release'))}))await new Promise(r=>setTimeout(r,20));await new Promise(r=>setTimeout(r,30));const output=scope?{...(schema.properties.summary?{summary:'Reassess failed output'}:{}),tasks:['t1','t2'].map(taskId=>({taskId,changeIndexes:[0],testIndexes:[0],...(schema.properties.summary?{action:'reassess',reason:'Valid new attempt'}:{})}))}:{...${JSON.stringify(result('t1'))},taskId:task.taskId};const valid=scope||id!=='retry'||task.previousRoundFeedback.length>0;if(!valid)delete output.findings;appendFileSync(${JSON.stringify(calls)},JSON.stringify({id,task:task?.taskId,stage:'end',at:Date.now()})+'\\n');process.stdout.write(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:JSON.stringify(output)}})+'\\n'+JSON.stringify({type:'turn.completed'})+'\\n',()=>process.exit(valid?0:1));});`;
  put('native.mjs',native);chmodSync(join(project,'native.mjs'),0o755);
  const ready=await startHost();const worker=await rpc('probe.where',{},()=>createConnection(socket),{timeoutMs:10000});assert.equal(worker.threadId,ready.threadId);await openMcp();
  await call('start','one',1,{packet});await call('start','two',1,{packet:{...packet,functionalSummary:'TWO'}});
  await assert.rejects(call('start','one',1,{packet}),/already-running/);
  await wait(()=>existsSync(calls)&&readFileSync(calls,'utf8').trim().split('\n').filter(line=>JSON.parse(line).stage==='start').length===2);
  const view=await call('progress','two');assert.equal(view.completedTasks,0);put('release','go');
  await wait(()=>read('one')['review-response'].crPublication==='complete'&&read('two')['review-response'].crPublication==='complete');
  const nativeLog=readFileSync(calls,'utf8').trim().split('\n').map(JSON.parse);for(const id of ['one','two']){const own=nativeLog.filter(r=>r.id===id);assert.deepEqual(own.map(r=>r.stage),['start','end','start','end','start','end']);}
  const first=JSON.stringify(read('one'));
  await call('start','retry',1,{packet:{...packet,functionalSummary:'FAIL_FIRST'}});await wait(()=>read('retry')['review-response'].crPublication==='complete');assert.equal(read('retry').header.status,'failed');
  const prior=JSON.parse(readFileSync(checkpoint('retry'))).attempts[0];await call('start','retry',2,{packet:{...packet,functionalSummary:'FAIL_FIRST'}});await wait(()=>read('retry')['review-response'].crPublication==='complete');assert.equal(read('retry').header.status,'passed');assert.deepEqual(JSON.parse(readFileSync(checkpoint('retry'))).attempts[0],prior);
  build.meta.authoredBy='daemon';put(buildPath,build);
  let frame=await call('start','live',1,{packet});await assert.rejects(call('start','live',1,{packet}),/already-running/);assert.equal((await call('assignment','live')).executionId,frame.executionId);const envelope=f=>({taskId:f.taskId,executionId:f.executionId,sequence:f.nextSequence});
  frame=await call('scope','live',1,{...envelope(frame),scope:{tasks:['t1','t2'].map(taskId=>({taskId,changeIndexes:[0],testIndexes:[0]}))}});
  frame=await call('result','live',1,{...envelope(frame),result:result('t1')});assert.equal(frame.taskId,'t2');const pinned=JSON.parse(readFileSync(checkpoint('live'))).attempts[0]['review-response'].tasks[0];
  await client.close();await server.close();await wait(()=>read('live').header.interrupted===true);await stopHost();
  const count=readFileSync(calls,'utf8');await startHost();await openMcp();assert.equal(readFileSync(calls,'utf8'),count,'Restart must not auto-run models');
  frame=await call('resume','live');assert.deepEqual(frame.completedTaskIds,['t1']);frame=await call('scope','live',1,{...envelope(frame),scope:{tasks:['t1','t2'].map(taskId=>({taskId,changeIndexes:[0],testIndexes:[0]}))}});frame=await call('result','live',1,{...envelope(frame),result:result('t2')});assert.equal(frame.status,'passed');assert.deepEqual(read('live')['review-response'].tasks[0],pinned);assert.equal(JSON.stringify(read('one')),first);
  const design=await client.callTool({name:'insrc_review_step',arguments:{}});assert.equal(design.isError,true);
  const approved=await rpc('workflow.approve',{repo:project,artifactPath:join(project,buildPath)},()=>createConnection(socket),{timeoutMs:30000});assert.equal(approved.approved.length,1,JSON.stringify(approved));const cleanup=approved.approved[0].result.cleanup;assert.equal(cleanup.deleted.length,4);assert.deepEqual(cleanup.errors,[]);assert.ok(existsSync(join(project,`.insrc/artifacts/CR-${hash}-s1.json`)));
  console.log(JSON.stringify({smoke:'passed',compiled:true,hostedModels:false,realWorkerThread:ready.threadId,independentReviews:2,nativeCalls:readFileSync(calls,'utf8').trim().split('\n').length/2,explicitRestartResume:true,priorAttemptsPreserved:true,cleanup,project}));
 }finally{await client?.close();await server?.close();if(daemon?.connected)await stopHost();rmSync(project,{recursive:true,force:true});}
}
