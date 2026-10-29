/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { readFileSync } from 'node:fs';
import { RecoveryStore } from '../recovery-store.js';
import { BlockProgressCoordinator } from '../progress.js';
import { twoBlockFixture, progressFor } from './continuation-fixtures.js';
const [repo,manifestPath,boundary]=process.argv.slice(2) as [string,string,string];
const f=twoBlockFixture(),manifest=JSON.parse(readFileSync(manifestPath,'utf8'));
let blockPhase=false;
const stop=(point:string)=>{process.send?.({boundary:point});process.kill(process.pid,'SIGSTOP');};
const store=new RecoveryStore(repo,manifest.runId,{currentCompatibility:manifest.compatibility,processEpoch:'crash-worker',assertProcessOwner:()=>{},assertOwner:()=>{},readEvidence:f.context.ports.readEvidence,
 fault:point=>{if(blockPhase&&point===boundary)stop(point);}});
await store.prepare(manifest);const lease=await store.claim(300000);await store.issueAttempt(lease.leaseId,lease.generation,f.turn,1000);
const owner=new BlockProgressCoordinator(f.turn,{...f.context,ports:store.ports(lease.generation,f.turn.attemptId,lease.leaseId)});
blockPhase=true;
await owner.accept({...progressFor(f.turn,'block-1',0),disposition:'reviewed'});
if(boundary==='after-first-ack')stop(boundary);
await owner.accept({...progressFor(f.turn,'block-2',1),disposition:'reviewed'});
stop('after-second-ack');
