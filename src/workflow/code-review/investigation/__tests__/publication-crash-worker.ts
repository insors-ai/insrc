/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { readFileSync, openSync, writeFileSync, fsyncSync, closeSync } from 'node:fs';
import { join } from 'node:path';
import { RecoveryStore } from '../recovery-store.js';
const [repo,manifestPath,boundary]=process.argv.slice(2) as [string,string,string];
const manifest=JSON.parse(readFileSync(manifestPath,'utf8'));
const stop=(point:string)=>{process.send?.({boundary:point});process.kill(process.pid,'SIGSTOP');};
let publicationPhase=false;
const store=new RecoveryStore(repo,manifest.runId,{processEpoch:'publication-worker',currentCompatibility:manifest.compatibility,assertProcessOwner:()=>{},assertOwner:()=>{},readEvidence:async()=>{throw Error('unexpected source read');},fault:point=>{
 if(publicationPhase&&boundary==='before-intent-commit'&&point==='blob-directory-synced')stop(boundary);
 if(publicationPhase&&boundary==='after-intent-commit'&&point==='event-synced')stop(boundary);
}});
await store.prepare(manifest);const lease=await store.claim(300000),checkpoint=store.replay().state.checkpoint,intent=store.journal.stage({operationId:'publication-one'});
publicationPhase=true;
await store.withPublicationFence(lease.leaseId,lease.generation,checkpoint,intent.reference,async(_ref,guard)=>{
 guard();const fd=openSync(join(repo,'external-operation.json'),'wx',0o600);try{writeFileSync(fd,JSON.stringify({operationId:'publication-one',logicalWrites:1}));fsyncSync(fd);}finally{closeSync(fd);}const dir=openSync(repo,'r');try{fsyncSync(dir);}finally{closeSync(dir);}
 if(boundary==='after-callback')stop(boundary);
 return 'canonical-existing-operation';
});
publicationPhase=false;
if(boundary==='before-terminal-receipt')stop(boundary);
await store.recordCompletion(lease.leaseId,lease.generation,'verified-terminal-receipt');stop('after-terminal-receipt');
