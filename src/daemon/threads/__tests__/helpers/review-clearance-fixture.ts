import assert from 'node:assert/strict';
import { createConnection } from 'node:net';
import { fixture as codeFixture,hash } from '../../../../workflow/code-review/task-review/__tests__/publication-fixture.js';
import { designFixture } from '../../../../workflow/review/design-review/__tests__/fixtures.js';
import { persistReviewWorkerAdmission } from '../../review-worker-admission.js';
import { updateStoredCodeCheckpoint } from '../../../../workflow/code-review/task-review/checkpoint.js';
import { saveDesignCheckpoint,updateStoredDesignCheckpoint } from '../../../../workflow/review/design-review/checkpoint.js';
import { ThreadServices } from '../../main-services.js';
import { ReviewWorkers } from '../../review-workers.js';
import { startReviewWorkerBootstrap } from '../../review-worker-bootstrap.js';
import type { StartedReviewWorker } from '../../review-worker-bootstrap.js';
import { startWorker } from '../../workers.js';
import { ApprovalBroker } from '../../../approval-broker.js';
import { createApprovalRpc } from '../../../approval.js';
import { IpcServer,directDispatch } from '../../../server.js';
import { createRepoLifecycle } from '../../../../workflow/artifact-core/repo-lifecycle.js';
import { persistReviewResourceAudit } from '../../../../workflow/review/resource-audit.js';
import type { ReviewKey } from '../../../../shared/review-resources.js';
import type { ApprovalRequest } from '../../../../shared/types.js';
import { join } from 'node:path';

export const services=new ThreadServices(()=>({startedAt:0,modelState:{status:'ready'},installedCommit:'fixture'}));
export const pause=()=>new Promise<void>(resolve=>setTimeout(resolve,10));
export async function until(check:()=>Promise<boolean>|boolean){const end=Date.now()+15000;while(Date.now()<end){if(await check())return;await pause();}throw new Error('Fixture condition timed out');}
export function workerRpc(started:StartedReviewWorker,method:string,params:unknown={}):Promise<any>{
 const requestId=Math.random().toString();return new Promise((resolve,reject)=>{
  const done=()=>{started.worker.off('message',message);started.worker.off('exit',exit);};const exit=()=>{done();reject(new Error('Fixture worker exited'));};
  const message=(raw:any)=>{if(raw?.kind!=='reply'||raw.requestId!==requestId)return;done();if(raw.error)reject(new Error(raw.error));else resolve(raw.result);};
  started.worker.on('message',message);started.worker.once('exit',exit);started.worker.postMessage({kind:'request',requestId,method,params,stream:false});
 });
}
export class LocalPeer {
 private subscribed=false;
 private sequence=0;private buffer='';private readonly waiting=new Map<number,{resolve:(v:any)=>void;reject:(e:Error)=>void}>();
 private readonly requests:ApprovalRequest[]=[];private readonly listeners:Array<(r:ApprovalRequest)=>void>=[];
 private constructor(readonly socket:ReturnType<typeof createConnection>){
  socket.setEncoding('utf8');socket.on('data',(part:string)=>{this.buffer+=part;const lines=this.buffer.split('\n');this.buffer=lines.pop()??'';for(const line of lines){if(!line)continue;const value=JSON.parse(line);if(value.stream==='gate'&&value.data?.type==='request'){const notify=this.listeners.shift();if(notify)notify(value.data.request);else this.requests.push(value.data.request);}else if(value.stream===undefined){const p=this.waiting.get(value.id);if(p){this.waiting.delete(value.id);if(value.error)p.reject(new Error(value.error));else p.resolve(value.result);}}}});
  socket.on('error',error=>{for(const p of this.waiting.values())p.reject(error);this.waiting.clear();});socket.on('close',()=>{for(const p of this.waiting.values())p.reject(new Error('Local peer disconnected'));this.waiting.clear();});
 }
 static async connect(path:string){const socket=createConnection(path);await new Promise<void>((resolve,reject)=>{socket.once('connect',resolve);socket.once('error',reject);});return new LocalPeer(socket);}
 subscribe(){if(this.subscribed)return;this.subscribed=true;this.socket.write(JSON.stringify({id:++this.sequence,method:'approval.subscribe',params:{},stream:true})+'\n');}
 call(method:string,params:unknown):Promise<any>{const id=++this.sequence;return new Promise((resolve,reject)=>{this.waiting.set(id,{resolve,reject});this.socket.write(JSON.stringify({id,method,params})+'\n');});}
 async request():Promise<ApprovalRequest>{const first=this.requests.shift();return first??new Promise<ApprovalRequest>(resolve=>this.listeners.push(resolve));}
 close(){this.socket.destroy();}
}
export async function clearanceFixture(t:{after:(fn:()=>Promise<void>)=>void},family:'code'|'design'='code',approvalWaitMs=1000){
 const f=await codeFixture();let removeDesign=()=>{};
 const d=family==='design'?designFixture({after:fn=>{removeDesign=fn;}}):undefined;
 const repo=d?.repo??f.repo,key:ReviewKey={project:repo,family,reviewId:family==='code'?'blocked-review':'review-1'};
 const submitted=family==='code'?f.packet:{phase:'start',repo,reviewId:key.reviewId,attempt:1,artifactPath:d!.json};
 const input={key,incarnation:'old-worker',attempt:1,reviewer:'daemon' as const,actionId:'fixture-start',submitted};
 if(d)await saveDesignCheckpoint(repo,d.checkpoint);else await persistReviewWorkerAdmission(input);
 const guard={daemonInstance:'old-daemon',openLeases:['op-a','op-b'].map(operationId=>({operationId,workerIncarnation:'old-worker',kind:'cli',openedAt:new Date().toISOString()}))};
 if(family==='code')await updateStoredCodeCheckpoint(join(repo,'.insrc/tmp/code-review',`${key.reviewId}.json`),cp=>({...cp!,schemaVersion:2,attempts:cp!.attempts.map(a=>({...a,resourceGuard:guard}))}));
 else await updateStoredDesignCheckpoint(repo,key.reviewId,cp=>({...cp!,schemaVersion:2,attempts:cp!.attempts.map(a=>({...a,resourceGuard:guard}))}));
 const started=new Map<string,StartedReviewWorker>(),barriers=new Map<string,Int32Array>();let nativeCalls=0;
 const registry=new ReviewWorkers({services,resolveScope:async request=>{assert.equal(request.project,repo);return{reviewer:'daemon',subject:d?.id??`${repo}:s1`,cleanupScope:`${repo}:s1`,epicHash:d?'aaaaaaaaaaaaaaaa':hash};},authorizeNative:async(_key,command)=>{nativeCalls++;assert.equal(command.command,'git');},resolveBinary:async command=>command,track:()=>{},start:async(svc,review,port,deps)=>{
  const barrier=new Int32Array(new SharedArrayBuffer(32));barriers.set(review.key.reviewId,barrier);
  const s=await startReviewWorkerBootstrap(svc,review,port,{...deps,start:(services,name,_script,extra,created)=>startWorker(services,name,family==='code'?'../../workflow/code-review/task-review/__tests__/helpers/worker-admission':'../../workflow/review/design-review/__tests__/helpers/worker-admission',{workerData:{...extra!.workerData,fixtureResult:f.result,fixtureBarrier:barrier.buffer},transferList:extra!.transferList},created)});started.set(review.key.reviewId,s);return s;
 }});
 const lifecycle=createRepoLifecycle(repo),artifactId=d?.id??`CR-${hash}-s1`,broker=new ApprovalBroker();let failAudit=false;
 const recovery=registry.resourceRecovery(broker,async(k,rows)=>{if(failAudit)throw new Error('Fixture audit unavailable');await persistReviewResourceAudit(lifecycle.store,artifactId,k,rows);},approvalWaitMs);
 const approval=createApprovalRpc(broker),socketPath=join(repo,'clearance.sock');
 const server=new IpcServer(directDispatch({'approval.answer':approval.answer,'step.call':async(raw,context)=>{const p=raw as {tool:string;args:{phase:string;reviewId:string}};assert.equal(p.tool,family==='code'?'insrc_code_review_step':'insrc_review_step');assert.equal(p.args.phase,'progress');return{content:[{type:'text',text:JSON.stringify(await registry.progress({...key,reviewId:p.args.reviewId},context!))}]};},'review.resource.clear':(raw,context)=>recovery.clear(key,raw as {reason:string;leaseIds?:string[]},context!), 'review.resource.inspect':(_raw,context)=>recovery.inspect(key,context!)},{'approval.subscribe':approval.subscribe}),Date.now,socketPath);await server.listen();
 const peer=await LocalPeer.connect(socketPath),beforeClose:Array<()=>void>=[];
 const local={connectionIdentity:'fixture-local',daemonEpoch:'epoch',connectionSignal:new AbortController().signal};
 t.after(async()=>{for(const close of beforeClose)close();peer.close();await server.close();await recovery.drained();await registry.shutdown();removeDesign();f.cleanup();});
 return{beforeClose:(close:()=>void)=>beforeClose.push(close),f,d,repo,key,input,registry,recovery,broker,peer,local,started,barriers,lifecycle,artifactId,nativeCalls:()=>nativeCalls,failAudit:(value:boolean)=>{failAudit=value;}};
}
