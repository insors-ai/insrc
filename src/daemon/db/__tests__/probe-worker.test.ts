import test from 'node:test';
import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,readdir,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {randomUUID,randomBytes} from 'node:crypto';
import {PROBE_MODULES} from '../probe-kinds.js';
import {parseProbeWorkerResult} from '../draft-probe.js';
async function snapshot(root:string){const result:Record<string,string>={};for(const name of await readdir(root,{recursive:true}))try{result[name]=(await readFile(join(root,name))).toString('base64');}catch{result[name]='<dir>';}return result;}
test('CM-S2-A8: source and compiled one-shot workers use private IPC and quiet actual file lifecycle',async()=>{
 assert.equal(Object.keys(PROBE_MODULES).length,29);
 const root=await mkdtemp(join(tmpdir(),'cm-probe-worker-'));await mkdir(join(root,'home'));await mkdir(join(root,'scratch'));
 try {
  const path=join(root,'PRIVATE_PATH_CANARY.csv');await writeFile(path,'value\nPRIVATE_VALUE_CANARY\n');const before=await snapshot(root);
  for(const compiled of [false,true])for(const mode of ['success','failure','malformed']){
   const requestId=randomUUID(),nonce=randomBytes(32).toString('hex');
   const child=fork(resolve(compiled?'out/bin/insrc-connection-test.js':'src/bin/insrc-connection-test.ts'),[],{execArgv:compiled?[]:['--import','tsx'],env:{HOME:join(root,'home'),TMPDIR:join(root,'scratch'),TSX_DISABLE_CACHE:'1'},stdio:['ignore','pipe','pipe','ipc']});
   let out='',err='';child.stdout!.on('data',chunk=>{out+=chunk;});child.stderr!.on('data',chunk=>{err+=chunk;});const messages:unknown[]=[];child.on('message',message=>messages.push(message));
   const exited=new Promise<number|null>((r,j)=>{child.once('error',j);child.once('exit',r);});
   const timer=setTimeout(()=>child.kill('SIGKILL'),10000);
   child.send({type:'start',requestId,nonce,lookupRoot:root,config:{id:'fixture',kind:'csv',path:mode==='failure'?join(root,'MISSING_PRIVATE_CANARY.csv'):path},...(mode==='malformed'?{forged:'PRIVATE_SECRET_CANARY'}:{})});
   try {
    const status=await exited;assert.equal(status,mode==='malformed'?1:0,err);assert.equal(out,'');assert.equal(err,'');
    if(mode==='malformed')assert.deepEqual(messages,[]);else{assert.equal(messages.length,1);assert.equal(parseProbeWorkerResult(messages[0],{requestId,nonce}).code,mode==='success'?'reachable':'failed');}
    assert.deepEqual(await snapshot(root),before);
   }finally{clearTimeout(timer);child.kill('SIGKILL');}
  }
 }finally{await rm(root,{recursive:true,force:true});}
});
