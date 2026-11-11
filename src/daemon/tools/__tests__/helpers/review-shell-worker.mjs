import { register } from 'tsx/esm/api';
import { parentPort, threadId, workerData } from 'node:worker_threads';
import childProcess, { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
register();
const {installReviewNativeSpawnGuard,REVIEW_NATIVE_SPAWN_APIS}=await import(workerData.guard);
installReviewNativeSpawnGuard();
const shell=await import(workerData.shell),bridge=await import(workerData.bridge),{runWithToolSignal}=await import(workerData.signal);
let next=0,reservations=0,release;const pending=new Map(),consumers=new Map();
const rpc=(op,args)=>new Promise((resolve,reject)=>{const id=++next;pending.set(id,{resolve,reject});parentPort.postMessage({kind:'request',id,op,args});});
parentPort.on('message',async m=>{
 if(m.kind==='release')release?.();
 if(m.kind==='reply'){const p=pending.get(m.id);pending.delete(m.id);if(m.error)p?.reject(Error(m.error));else p?.resolve(m.value);}
 if(m.kind==='output'){try{await consumers.get(m.output.operationId)?.(m.output);parentPort.postMessage({kind:'ack',id:m.id});}catch(e){parentPort.postMessage({kind:'ack',id:m.id,error:String(e)});}}
});
const transport={resolveBinary:command=>rpc('resolveBinary',command),reserve:command=>{reservations++;return rpc('reserve',command);},saveOpenIntent:r=>rpc('saveOpenIntent',r),saveClosedIntent:r=>rpc('saveClosedIntent',r),cancel:r=>rpc('cancel',r),waitStarted:r=>rpc('waitStarted',r),write:(r,bytes,end)=>rpc('write',{r,bytes,end}),
 start:async(r,receipt,consume)=>{consumers.set(r.operationId,consume);try{return await rpc('start',{r,receipt});}finally{consumers.delete(r.operationId);}}};
const opts={cwd:workerData.repo,timeoutMs:5000};
async function checks(){
 if(workerData.mode==='inventory'){
  const refusals=[];const check=(name,fn)=>{try{fn();throw Error('not refused: '+name);}catch(error){if(!String(error).includes('forbidden in a review worker'))throw error;refusals.push(name);}};
  for(const name of REVIEW_NATIVE_SPAWN_APIS)check(name,()=>childProcess[name]('/missing-review-inventory',[]));
  check('esm spawn',()=>spawn('/missing-review-inventory',[]));check('esm execFileSync',()=>execFileSync('/missing-review-inventory',[]));
  check('cjs spawn',()=>createRequire(import.meta.url)('node:child_process').spawn('/missing-review-inventory',[]));
  check('ChildProcess.spawn',()=>new childProcess.ChildProcess().spawn({file:'/missing-review-inventory',args:[]}));
  for(const [name,call] of [['runShell',()=>shell.runShell([process.execPath],opts)],['runShellBytes',()=>shell.runShellBytes([process.execPath],opts)],['spawnManaged',()=>shell.spawnManaged(process.execPath,[],opts)]]){try{await call();throw Error('unbound helper did not refuse');}catch(error){if(!String(error).includes('transport is not installed'))throw error;refusals.push(name);}}
  return{refusals,threadId};
 }
 return bridge.withReviewNativeTransport(transport,async()=>{
  const node=script=>[process.execPath,'-e',script];
  if(workerData.mode==='unknown')return shell.runShell(['/review-unknown-fixture'],opts);
  if(workerData.mode==='blocked'){
   const m=shell.spawnManaged(process.execPath,['-e',"process.stdout.write(Buffer.alloc(2*1024*1024,120))"],opts);let bytes=0;
   m.child.stderr.resume();release=()=>{m.child.stdout.on('data',b=>{bytes+=b.length;});};
   const exit=await m.settled;return{exit,bytes};
  }
  if(workerData.mode==='loss'){
   const m=shell.spawnManaged(process.execPath,['-e',"process.stdout.write('live');setInterval(()=>{},1000)"],opts);
   m.child.stdout.on('data',()=>parentPort.postMessage({kind:'active'}));m.child.stderr.resume();await m.settled;return{};
  }
  const git=await shell.runShell(['git','--version'],opts);
  const load=path=>import(new URL(path,workerData.root));
  const {registerGitTools}=await load('src/daemon/tools/builtins/git/index.ts');registerGitTools();
  const {RegistryReviewSources}=await load('src/workflow/code-review/task-review/sources.ts');
  const {prepareReviewPacket}=await load('src/workflow/code-review/task-review/packet.ts');
  const deps={repoPath:workerData.repo,sessionId:'worker-policy',requestId:1,send:()=>{},approvalMode:'manual'};
  const admitted=await prepareReviewPacket(workerData.packet,new RegistryReviewSources(deps),false,{epicHash:'1234567890abcdef',storyId:'s1',plan:false,lld:false,def:false,issue:true,build:{taskIds:['s1'],focus:'Change the selected line'}});
  const {Type}=await import('@sinclair/typebox');const {callTool}=await load('src/daemon/tools/call-tool.ts');
  const {registerTool}=await load('src/daemon/tools/registry.ts');const {_setApprovalGateForTests}=await load('src/daemon/tools/executor.ts');const {withFailureNet}=await load('src/daemon/tools/builtins/git/helpers.ts');
  let toolRuns=0,requests=0,allow=false;
  const definition={id:'review_policy_probe',description:'fixture',approval:'destructive',inputSchema:Type.Object({}),outputSchema:Type.Object({ok:Type.Boolean()}),execute:async()=>{toolRuns++;const ran=await shell.runShell(['git','--version'],opts);return{success:ran.code===0,output:ran.stdout,format:'text',data:{ok:ran.code===0}};}};
  registerTool(withFailureNet(definition));_setApprovalGateForTests(()=>({ask:async r=>{requests++;return allow?{requestId:r.requestId,decision:'approve'}:'declined';}}));
  const before=reservations,deniedPolicy=await callTool(definition,{},deps),afterDenied=reservations;
  const forged=await callTool({...definition},{},deps),afterForged=reservations;
  allow=true;const allowed=await callTool(definition,{},deps);
  const policy={before,afterDenied,afterForged,afterAllowed:reservations,toolRuns,requests,denied:deniedPolicy,forged,allowed};
  const bytes=await shell.runShellBytes(node("process.stdin.pipe(process.stdout);process.stderr.write('warning')"),{...opts,stdin:Uint8Array.from({length:150000},(_,i)=>i%256),stdoutLimit:8192});
  const text=await shell.runShell(node("process.stdout.write('—🙂');process.stderr.write('warning');process.exitCode=7"),opts);
  const missing=await shell.runShell(['/missing-review-executable'],opts);
  const early=await shell.runShellBytes(node('process.exit(0)'),{...opts,stdin:Buffer.alloc(2*1024*1024)});
  const overflow=await shell.runShellBytes(node("process.stderr.write('abcdef');setInterval(()=>{},1000)"),{...opts,stderrLimit:3});
  const timeout=await shell.runShell(node("setInterval(()=>{},1000)"),{...opts,timeoutMs:50});
  const truncated=await shell.runShell(node("process.stdout.write('x'.repeat(100000))"),{...opts,maxBytes:10});
  const cancel=new AbortController();const aborted=await runWithToolSignal(cancel.signal,async()=>{
   const p=shell.runShell(node("setInterval(()=>{},1000)"),opts);setTimeout(()=>cancel.abort(),50);return p;
  });
  const permission={...transport,reserve:async()=>{throw Error('host permission denied');}};
  const denied=await bridge.withReviewNativeTransport(permission,()=>shell.runShell(node("throw Error('must not spawn')"),opts));
  let closedUnknown=0;
  const unknown={...transport,start:async()=>({code:null,signal:null,aborted:false,timedOut:true,spawnError:false,stdoutBytes:0,stderrBytes:0,disposal:{state:'unknown',reason:'child_not_closed'}}),saveClosedIntent:async()=>{closedUnknown++;}};
  const uncertain=await bridge.withReviewNativeTransport(unknown,()=>shell.runShell(node("throw Error('must not spawn')"),opts));
  return{git,admitted:{taskIds:admitted.tasks.map(t=>t.id),revision:admitted.packet.reviewRevision},policy,bytes,text,missing,early,overflow,timeout,truncated,aborted,denied,uncertain,closedUnknown,threadId};
 });
}
try{parentPort.postMessage({kind:'done',value:await checks()});}catch(e){parentPort.postMessage({kind:'done',error:String(e)});}parentPort.close();
