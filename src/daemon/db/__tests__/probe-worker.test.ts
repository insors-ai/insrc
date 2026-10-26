import test from 'node:test';
import assert from 'node:assert/strict';
import {watch} from 'node:fs';
import {serialize} from 'bson';
import {fork} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,readdir,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {randomUUID,randomBytes} from 'node:crypto';
import '../drivers/index.js';
import {listRegisteredKinds} from '../registry.js';
import {PROBE_MODULES} from '../probe-kinds.js';
import {parseProbeWorkerResult} from '../draft-probe.js';
async function snapshot(root:string){const result:Record<string,string>={};for(const name of await readdir(root,{recursive:true}))try{result[name]=(await readFile(join(root,name))).toString('base64');}catch{result[name]='<dir>';}return result;}
test('CM-S2-A8: source and compiled one-shot workers use private IPC and quiet actual file lifecycle',async()=>{
 assert.equal(Object.keys(PROBE_MODULES).length,29);assert.deepEqual(Object.keys(PROBE_MODULES).sort(),listRegisteredKinds().map(r=>r.kind).sort());
 const root=await mkdtemp(join(tmpdir(),'cm-probe-worker-'));await mkdir(join(root,'home'));await mkdir(join(root,'scratch'));let watcher:ReturnType<typeof watch>|undefined;
 try {
  const paths={csv:join(root,'PRIVATE_PATH_CANARY.csv'),bson:join(root,'PRIVATE_PATH_CANARY.bson')};await writeFile(paths.csv,'value\nPRIVATE_VALUE_CANARY\n');await writeFile(paths.bson,serialize({value:'PRIVATE_VALUE_CANARY'}));const before=await snapshot(root);
  const events:string[]=[];watcher=watch(root,{recursive:true},(_event,name)=>{events.push(String(name));});
  // macOS FSEvents may deliver fixture-creation events after watch starts.
  await new Promise(r=>setTimeout(r,1500));events.length=0;
  for(const compiled of [false,true])for(const kind of ['csv','bson'] as const)for(const mode of ['success','failure','malformed']){
   const requestId=randomUUID(),nonce=randomBytes(32).toString('hex');
   const child=fork(resolve(compiled?'out/bin/insrc-connection-test.js':'src/bin/insrc-connection-test.ts'),[],{execArgv:compiled?[]:['--import','tsx'],env:{HOME:join(root,'home'),TMPDIR:join(root,'scratch'),TSX_DISABLE_CACHE:'1'},stdio:['ignore','pipe','pipe','ipc']});
   let out='',err='';child.stdout!.on('data',chunk=>{out+=chunk;});child.stderr!.on('data',chunk=>{err+=chunk;});const messages:unknown[]=[];child.on('message',message=>messages.push(message));
   const exited=new Promise<number|null>((r,j)=>{child.once('error',j);child.once('exit',r);});
   const timer=setTimeout(()=>child.kill('SIGKILL'),10000);
   child.send({type:'start',requestId,nonce,lookupRoot:root,config:{id:'fixture',kind,path:mode==='failure'?join(root,'MISSING_PRIVATE_CANARY.'+kind):paths[kind]},...(mode==='malformed'?{forged:'PRIVATE_SECRET_CANARY'}:{})});
   try {
    const status=await exited;assert.equal(status,mode==='malformed'?1:0,err);assert.equal(out,'');assert.equal(err,'');
    if(mode==='malformed')assert.deepEqual(messages,[]);else{assert.equal(messages.length,1);assert.equal(parseProbeWorkerResult(messages[0],{requestId,nonce}).code,mode==='success'?'reachable':'failed');}
    assert.deepEqual(await snapshot(root),before);await new Promise(r=>setTimeout(r,50));assert.deepEqual(events,[]);
   }finally{clearTimeout(timer);child.kill('SIGKILL');}
  }
 }finally{watcher?.close();await rm(root,{recursive:true,force:true});}
});

test('CM-S2-A8: source and compiled private IPC admit all registered kinds and reject unlisted kinds',async()=>{
 const root=await mkdtemp(join(tmpdir(),'cm-worker-admission-'));
 try{
  for(const compiled of [false,true])for(const kind of [...Object.keys(PROBE_MODULES),'unlisted-driver']){
   const requestId=randomUUID(),nonce=randomBytes(32).toString('hex'),messages:unknown[]=[];
   const child=fork(resolve(compiled?'out/bin/insrc-connection-test.js':'src/bin/insrc-connection-test.ts'),[],{execArgv:[...(compiled?[]:['--import','tsx']),'--no-warnings'],env:{HOME:root,TMPDIR:root,TSX_DISABLE_CACHE:'1'},stdio:['ignore','pipe','pipe','ipc']});
   let output='';child.stdout!.on('data',chunk=>{output+=chunk;});child.stderr!.on('data',chunk=>{output+=chunk;});child.on('message',message=>messages.push(message));
   const exited=new Promise<number|null>((r,j)=>{child.once('error',j);child.once('exit',r);});const timer=setTimeout(()=>child.kill('SIGKILL'),10000);
   child.send({type:'start',requestId,nonce,lookupRoot:root,config:{id:'fixture',kind,...(kind==='dynamodb'?{options:{region:'us-east-1',endpoint:'http://127.0.0.1:1'}}:{})},...(kind==='dynamodb'?{runtimeAuth:{type:'aws-v1',accessKeyId:'FAKEKEY',secretAccessKey:'PRIVATE_SECRET_CANARY'}}:{})});
   try{
    assert.equal(await exited,kind==='unlisted-driver'?1:0,kind+' '+output);
    if(kind==='unlisted-driver')assert.equal(messages.length,0);else{assert.equal(messages.length,1,kind);assert.equal(parseProbeWorkerResult(messages[0],{requestId,nonce}).code,'failed',kind);}
    assert.equal(output,'',kind);assert.deepEqual(await snapshot(root),{});
   }finally{clearTimeout(timer);child.kill('SIGKILL');}
  }
 }finally{await rm(root,{recursive:true,force:true});}
});

test('CM-S2-A8: cleared PostgreSQL credentials cannot fall back to HOME pgpass in either worker mode',async()=>{
 const {pgProbeServer}=await import('./fixtures/sql-probe-servers.js');const pg=await pgProbeServer(''),root=await mkdtemp(join(tmpdir(),'cm-pgpass-'));
 try{
  await writeFile(join(root,'.pgpass'),'127.0.0.1:'+pg.port+':fixture:fixture:PGPASS_PRIVATE_CANARY\n',{mode:0o600});const before=await snapshot(root);
  for(const compiled of [false,true]){
   const requestId=randomUUID(),nonce=randomBytes(32).toString('hex');
   const child=fork(resolve(compiled?'out/bin/insrc-connection-test.js':'src/bin/insrc-connection-test.ts'),[],{execArgv:[...(compiled?[]:['--import','tsx']),'--no-warnings'],env:{HOME:root,TMPDIR:root,TSX_DISABLE_CACHE:'1'},stdio:['ignore','pipe','pipe','ipc']});
   let output='';const messages:unknown[]=[];child.on('message',m=>messages.push(m));child.stdout!.on('data',m=>{output+=m;});child.stderr!.on('data',m=>{output+=m;});
   const exited=new Promise<number|null>(r=>child.once('exit',r));const timer=setTimeout(()=>child.kill('SIGKILL'),10000);
   child.send({type:'start',requestId,nonce,lookupRoot:root,config:{id:'fixture',kind:'postgres',url:'postgres://fixture@127.0.0.1:'+pg.port+'/fixture'}});
   try{assert.equal(await exited,0);assert.equal(parseProbeWorkerResult(messages[0],{requestId,nonce}).code,'reachable');assert.equal(output,'');assert.deepEqual(await snapshot(root),before);}finally{clearTimeout(timer);child.kill('SIGKILL');}
  }
 }finally{await pg.close();await rm(root,{recursive:true,force:true});}
});

test('CM-S2-A8: actual private resource close is awaited and cleanup failures cannot produce reachable',async()=>{
 const {pathToFileURL}=await import('node:url');const root=await mkdtemp(join(tmpdir(),'cm-owned-close-')),path=join(root,'data.csv');await writeFile(path,'value\nfirst\n');
 try{for(const compiled of [false,true])for(const mode of ['delay','fail']){
  const requestId=randomUUID(),nonce=randomBytes(32).toString('hex'),messages:unknown[]=[];let announce!:()=>void;const closing=new Promise<void>(r=>{announce=r;});
  const before=await snapshot(root),child=fork(resolve(compiled?'out/bin/insrc-connection-test.js':'src/bin/insrc-connection-test.ts'),[],{execArgv:[...(compiled?[]:['--import','tsx']),'--no-warnings','--import',pathToFileURL(resolve('src/daemon/db/__tests__/fixtures/probe-close-hook.mjs')).href],env:{HOME:root,TMPDIR:root,TSX_DISABLE_CACHE:'1',CM_TEST_EXECUTION_URL:pathToFileURL(resolve(compiled?'out/daemon/db/file-execution.js':'src/daemon/db/file-execution.ts')).href,CM_TEST_CLOSE_MODE:mode},stdio:['ignore','pipe','pipe','ipc']});
  let output='';child.stdout!.on('data',c=>{output+=c;});child.stderr!.on('data',c=>{output+=c;});child.on('message',message=>{if((message as {type:string}).type==='test-close-start')announce();else messages.push(message);});
  const exited=new Promise<number|null>(r=>child.once('exit',r));const timer=setTimeout(()=>child.kill('SIGKILL'),10000);
  child.send({type:'start',requestId,nonce,lookupRoot:root,config:{id:'fixture',kind:'csv',path}});
  try{await closing;await new Promise(r=>setTimeout(r,100));assert.equal(messages.length,0);assert.equal(child.exitCode,null);assert.equal(await exited,0);assert.equal(parseProbeWorkerResult(messages[0],{requestId,nonce}).code,mode==='delay'?'reachable':'failed');assert.equal(output,'');assert.deepEqual(await snapshot(root),before);}finally{clearTimeout(timer);child.kill('SIGKILL');}
 }}finally{await rm(root,{recursive:true,force:true});}
});

test('CM-S2-E2: actual workers reject missing malformed or expired Dynamo auth without fallback or canary output',async()=>{
 const {createServer}=await import('node:http');let requests=0;
 const server=createServer((req,res)=>{requests++;req.resume();res.end('{"TableNames":[]}');});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const address=server.address();assert.ok(address&&typeof address==='object');
 try{for(const mode of ['missing','malformed','expired','valid']){
  const auth=mode==='missing'?undefined:{type:'aws-v1',accessKeyId:'KEY',secretAccessKey:mode==='malformed'?'':'PRIVATE_AUTH_CANARY',...(mode==='expired'?{expiration:new Date(0).toISOString()}:{})};
  const requestId=randomUUID(),nonce=randomBytes(32).toString('hex'),messages:unknown[]=[],before=requests;
  const child=fork(resolve('src/bin/insrc-connection-test.ts'),[],{execArgv:['--import','tsx','--no-warnings'],env:{INSRC_MODE:'probe-worker',TSX_DISABLE_CACHE:'1',AWS_ACCESS_KEY_ID:'UNRELATED_AMBIENT_KEY',AWS_SECRET_ACCESS_KEY:'PRIVATE_AMBIENT_CANARY'},stdio:['ignore','pipe','pipe','ipc']});
  let output='';child.stdout!.on('data',chunk=>{output+=chunk;});child.stderr!.on('data',chunk=>{output+=chunk;});child.on('message',message=>messages.push(message));const exited=new Promise<number|null>(r=>child.once('exit',r));const timer=setTimeout(()=>child.kill('SIGKILL'),5000);
  child.send({type:'start',requestId,nonce,lookupRoot:'/tmp',config:{id:'fixture',kind:'dynamodb',options:{region:'us-east-1',endpoint:'http://127.0.0.1:'+address.port}},...(auth?{runtimeAuth:auth}:{})});
  try{assert.equal(await exited,mode==='missing'||mode==='malformed'?1:0);if(mode==='expired'||mode==='valid')assert.equal(parseProbeWorkerResult(messages[0],{requestId,nonce}).code,mode==='valid'?'reachable':'failed');else assert.equal(messages.length,0);assert.equal(requests-before,mode==='valid'?1:0,'functional endpoint proves invalid auth never falls back or sends a request');assert.equal(output,'');}finally{clearTimeout(timer);child.kill('SIGKILL');}
 }}finally{await new Promise<void>(r=>server.close(()=>r()));}
});
