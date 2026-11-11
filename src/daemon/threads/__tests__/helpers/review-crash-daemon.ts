// Disposable test daemon: killed only by its owning recovery test.
import { workerRpc,services } from './review-clearance-fixture.js';
import { ReviewWorkers } from '../../review-workers.js';
import { startReviewWorkerBootstrap } from '../../review-worker-bootstrap.js';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
const [repo,binary,packetFile]=process.argv.slice(2) as [string,string,string];
const packet=JSON.parse(await readFile(packetFile,'utf8'));
let started:Awaited<ReturnType<typeof startReviewWorkerBootstrap>>;
const registry=new ReviewWorkers({services,resolveScope:async key=>({reviewer:'daemon',subject:`${key.project}:s1`,cleanupScope:`${key.project}:s1`}),authorizeNative:async(_key,command)=>{if(command.command!==binary)throw new Error('Unexpected fixture executable');},resolveBinary:async()=>binary,track:()=>{},start:async(...args)=>{started=await startReviewWorkerBootstrap(...args);return started;}});
const identity=await registry.admit({key:{project:repo,family:'code',reviewId:'crash-review'},attempt:1,actionId:'crash-start',submitted:packet},{connectionIdentity:'disposable-daemon',daemonEpoch:'fixture',connectionSignal:new AbortController().signal});
void workerRpc(started!,'test.review.native',{...identity,probe:'cli'}).catch(()=>{});
for(;;){try{const pid=Number(await readFile(join(repo,'survivor.pid'),'utf8'));if(pid>0){process.send?.({ready:true,pid});break;}}catch{}await new Promise(r=>setTimeout(r,10));}
