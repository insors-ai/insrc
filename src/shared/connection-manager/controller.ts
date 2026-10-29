/** Workbench-memory effects. Backend signed tickets/receipts remain the only mutation authority. */
import type { CommittedOutcome, ConnectionKey, ManagementErrorCode, MutationRequest, OperationTicket, SafeConnection } from '../connection-management.js';
import type { ConnectionDraft, SerializedConnectionDraft } from './draft.js';
import { connectionReplyData, decodeMutationOutcome, decodeOperationStatus, decodeOperationTicket, decodeSafeConnectionList } from './wire.js';

export const MUTATION_CONTROLLER_LIMITS=Object.freeze({records:64,attemptBytes:16*1024*1024,polls:5,firstPollMs:1000,maxPollMs:16000});
export type MutationPhase='ticketing'|'ticket-error'|'submitting'|'unknown'|'pending'|'not-seen'|'reconciliation-required'|'rejected'|'committed'|'session-ended';
export interface MutationView {
 readonly recordId:string;readonly key:ConnectionKey;readonly mode:OperationTicket['mode'];readonly phase:MutationPhase;
 readonly operationId:string|null;readonly outcome:CommittedOutcome|null;readonly busy:boolean;
 readonly refresh:'not-started'|'pending'|'complete'|'failed';readonly errorCode:ManagementErrorCode|'transport-error'|'invalid-response'|null;
 readonly canReplay:boolean;readonly canDismiss:boolean;
}
export interface MutationTimer {dispose():void}
export interface MutationPorts {
 readonly call:(key:ConnectionKey,method:string,params:unknown,sessionStamp:string|null)=>Promise<unknown>;
 readonly refresh:(key:ConnectionKey,revision:string)=>Promise<unknown>;
 readonly sessionStamp:(key:ConnectionKey)=>string|null;
 readonly now?:(()=>number)|undefined;
 readonly timer?:((callback:()=>void,ms:number)=>MutationTimer)|undefined;
 readonly expireTemporary?:(()=>void)|undefined;
}
export interface RefreshDelivery {success(rows:readonly SafeConnection[]):void;failed():void}
export type RefreshObserver=(key:ConnectionKey,revision:string)=>RefreshDelivery|undefined;
export class MutationStateError extends Error {
 constructor(readonly code:'busy'|'resource-limit'|'disposed'|'invalid-state'){super('The connection operation cannot proceed in its current state.');}
}
interface Attempt {
 readonly id:string;readonly key:ConnectionKey;readonly mode:SerializedConnectionDraft['mode'];readonly stamp:string|null;
 phase:MutationPhase;busy:boolean;operationId:string|null;ticket:OperationTicket|null;request:MutationRequest|null;input:SerializedConnectionDraft|null;
 clearDraft:(()=>void)|null;bytes:number;outcome:CommittedOutcome|null;refresh:MutationView['refresh'];errorCode:MutationView['errorCode'];polls:number;timer:MutationTimer|null;
}
const PREFIX='db.connections.v2.';
const sameKey=(a:ConnectionKey,b:ConnectionKey):boolean=>a.repoRoot===b.repoRoot&&a.scope===b.scope&&a.id===b.id;
function freeze<T>(v:T):T{if(v&&typeof v==='object'&&!Object.isFrozen(v)){Object.values(v).forEach(freeze);Object.freeze(v);}return v;}
function copy<T>(v:T):T{return connectionReplyData(v) as T;}
const byteSize=(v:unknown):number=>new TextEncoder().encode(JSON.stringify(v)).length;
const blocking=new Set<MutationPhase>(['ticketing','submitting','unknown','pending','not-seen','reconciliation-required']);

export class ConnectionMutationController {
 #ports:MutationPorts;#now:()=>number;#timer:(callback:()=>void,ms:number)=>MutationTimer;
 #records=new Map<string,Attempt>();#next=0;#bytes=0;#disposed=false;
 #listeners=new Set<()=>void>();#refreshObservers=new Set<RefreshObserver>();
 constructor(ports:MutationPorts){
  this.#ports=ports;this.#now=ports.now??Date.now;
  this.#timer=ports.timer??((callback,ms)=>{const handle=setTimeout(callback,ms);handle.unref();return{dispose:()=>clearTimeout(handle)};});
 }
 onChange(listener:()=>void):MutationTimer{this.#admit();this.#listeners.add(listener);return{dispose:()=>{this.#listeners.delete(listener);}};}
 /** A view captures its read generation here and validates that captured identity on delivery. */
 observeRefresh(observer:RefreshObserver):MutationTimer{this.#admit();this.#refreshObservers.add(observer);return{dispose:()=>{this.#refreshObservers.delete(observer);}};}
 #emit():void{for(const listener of [...this.#listeners])try{listener();}catch{/* One view cannot disrupt reconciliation. */}}
 #admit():void{if(this.#disposed)throw new MutationStateError('disposed');}
 #get(id:string):Attempt{this.#admit();const r=this.#records.get(id);if(!r)throw new MutationStateError('invalid-state');return r;}
 #alive(r:Attempt):boolean{return !this.#disposed&&this.#records.get(r.id)===r&&r.phase!=='session-ended';}
 #unexpired(r:Attempt):boolean{return !!r.ticket&&this.#now()<Date.parse(r.ticket.expiresAt);}
 #view(r:Attempt):MutationView{
  const canDismiss=!r.busy&&(r.phase==='ticket-error'||r.phase==='rejected'||r.phase==='session-ended'||r.phase==='committed'&&r.outcome?.credentialCleanup==='complete'&&['active','not-applicable'].includes(r.outcome.activation)&&r.refresh==='complete');
  return freeze({recordId:r.id,key:copy(r.key),mode:r.mode,phase:r.phase,operationId:r.operationId,outcome:r.outcome?copy(r.outcome):null,busy:r.busy,refresh:r.refresh,errorCode:r.errorCode,canReplay:!r.busy&&r.phase==='not-seen'&&!!r.request&&this.#unexpired(r),canDismiss});
 }
 get records():readonly MutationView[]{return Object.freeze([...this.#records.values()].map(r=>this.#view(r)));}
 record(id:string):MutationView{return this.#view(this.#get(id));}
 isBlocked(key:ConnectionKey):boolean{return [...this.#records.values()].some(r=>sameKey(r.key,key)&&(r.busy||blocking.has(r.phase)));}
 #release(r:Attempt):void{this.#bytes-=r.bytes;r.bytes=0;r.input=null;r.request=null;}
 #clearDraft(r:Attempt):void{const clear=r.clearDraft;r.clearDraft=null;try{clear?.();}catch{/* Committed truth survives a closed view. */}}
 #expect(r:Attempt){return{key:r.key,operationId:r.operationId!,mode:r.mode};}
 async submit(draft:ConnectionDraft):Promise<MutationView>{
  this.#admit();const input=freeze(copy(draft.serialize()));
  if(this.isBlocked(input.key))throw new MutationStateError('busy');
  const bytes=byteSize(input);
  if(this.#records.size>=MUTATION_CONTROLLER_LIMITS.records||this.#bytes+bytes>MUTATION_CONTROLLER_LIMITS.attemptBytes||this.#next>=Number.MAX_SAFE_INTEGER)throw new MutationStateError('resource-limit');
  const r:Attempt={id:`operation-${++this.#next}`,key:freeze(copy(input.key)),mode:input.mode,stamp:this.#ports.sessionStamp(input.key),phase:'ticketing',busy:true,operationId:null,ticket:null,request:null,input,clearDraft:()=>draft.clear(),bytes,outcome:null,refresh:'not-started',errorCode:null,polls:0,timer:null};
  this.#bytes+=bytes;this.#records.set(r.id,r);this.#emit();
  try{
   const raw=await this.#ports.call(r.key,PREFIX+'ticket',{key:r.key,mode:r.mode},r.stamp);
   if(!this.#alive(r))return this.#view(r);
   r.ticket=freeze(decodeOperationTicket(raw,{key:r.key,mode:r.mode}));r.operationId=r.ticket.operationId;
   if([...this.#records.values()].some(other=>other!==r&&other.operationId===r.operationId))throw new MutationStateError('invalid-state');
   if(!this.#unexpired(r)){r.phase='reconciliation-required';r.errorCode='reconciliation-required';this.#release(r);return this.#view(r);}
   const request=freeze({...input,ticket:r.ticket,operationId:r.operationId});const requestBytes=byteSize(request);
   if(this.#bytes-r.bytes+requestBytes>MUTATION_CONTROLLER_LIMITS.attemptBytes)throw new MutationStateError('resource-limit');
   this.#bytes+=requestBytes-r.bytes;r.bytes=requestBytes;r.request=request;r.input=null;
   await this.#mutate(r);
  }catch{
   if(this.#alive(r)&&r.phase==='ticketing'){r.phase='ticket-error';r.errorCode='invalid-response';r.ticket=null;this.#release(r);}
  }finally{r.busy=false;this.#emit();}
  return this.#view(r);
 }
 async #mutate(r:Attempt):Promise<void>{
  if(!r.request||!this.#alive(r))return;
  r.phase='submitting';r.errorCode=null;this.#emit();
  try{
   const result=decodeMutationOutcome(await this.#ports.call(r.key,PREFIX+'mutate',r.request,r.stamp),this.#expect(r));
   if(!this.#alive(r))return;
   if(result.status==='committed'){await this.#commit(r,result.value);return;}
   r.errorCode=result.code;
   if(result.code==='session-expired'&&r.key.scope==='temporary'){this.#ports.expireTemporary?.();this.endTemporary();return;}
   r.phase=['reconciliation-required','recovery-required','operation-mismatch'].includes(result.code)?'reconciliation-required':'rejected';
   if(r.phase==='rejected'){r.ticket=null;this.#release(r);}
  }catch{if(this.#alive(r)){r.phase='unknown';r.errorCode='transport-error';}}
 }
 async #commit(r:Attempt,outcome:CommittedOutcome):Promise<void>{
  if(r.outcome&&(outcome.revision!==r.outcome.revision||outcome.registration!==r.outcome.registration))throw new MutationStateError('invalid-state');
  r.outcome=freeze(copy(outcome));r.phase='committed';r.errorCode=null;this.#release(r);this.#clearDraft(r);r.timer?.dispose();r.timer=null;this.#emit();
  await this.#refresh(r);
 }
 async #refresh(r:Attempt):Promise<void>{
  if(!r.outcome||!this.#alive(r))return;
  r.refresh='pending';const deliveries:RefreshDelivery[]=[];
  for(const observer of [...this.#refreshObservers])try{const delivery=observer(r.key,r.outcome.revision);if(delivery)deliveries.push(delivery);}catch{/* Closed view has no delivery. */}
  this.#emit();
  try{
   const rows=decodeSafeConnectionList(await this.#ports.refresh(r.key,r.outcome.revision),r.key.repoRoot);
   if(!this.#alive(r))return;r.refresh='complete';
   for(const delivery of deliveries)try{delivery.success(rows);}catch{/* View identity guards own delivery. */}
  }catch{
   if(!this.#alive(r))return;r.refresh='failed';
   for(const delivery of deliveries)try{delivery.failed();}catch{/* Registration remains committed. */}
  }
 }
 async #action(id:string,body:(r:Attempt)=>Promise<void>):Promise<MutationView>{
  const r=this.#get(id);if(r.busy)throw new MutationStateError('busy');r.busy=true;r.timer?.dispose();r.timer=null;this.#emit();
  try{await body(r);}finally{r.busy=false;this.#emit();}return this.#view(r);
 }
 reconcile(id:string):Promise<MutationView>{return this.#action(id,async r=>{r.polls=0;await this.#status(r);});}
 async #status(r:Attempt):Promise<void>{
  if(!r.ticket||!this.#alive(r))throw new MutationStateError('invalid-state');
  const known=r.outcome;
  try{
   const result=decodeOperationStatus(await this.#ports.call(r.key,PREFIX+'status',{ticket:r.ticket},r.stamp),this.#expect(r));
   if(!this.#alive(r))return;
   if(result.status==='committed'){
    if(known){if(result.value.revision!==known.revision||result.value.registration!==known.registration)throw new MutationStateError('invalid-state');r.outcome=freeze(copy(result.value));r.errorCode=null;}
    else await this.#commit(r,result.value);
   }else if(known){r.errorCode='reconciliation-required';}
   else{
    r.phase=result.status==='not-seen'&&!this.#unexpired(r)?'reconciliation-required':result.status;
    r.errorCode=r.phase==='reconciliation-required'?'reconciliation-required':null;
    if(r.phase==='pending')this.#schedule(r);
   }
  }catch{if(this.#alive(r)){if(!known)r.phase='unknown';r.errorCode='transport-error';}}
 }
 #schedule(r:Attempt):void{
  if(r.polls>=MUTATION_CONTROLLER_LIMITS.polls||r.timer||!this.#alive(r))return;
  const delay=Math.min(MUTATION_CONTROLLER_LIMITS.maxPollMs,MUTATION_CONTROLLER_LIMITS.firstPollMs*2**r.polls++);
  r.timer=this.#timer(()=>{r.timer=null;if(!this.#alive(r)||r.busy)return;void this.#action(r.id,record=>this.#status(record)).catch(()=>{});},delay);
 }
 replay(id:string):Promise<MutationView>{return this.#action(id,async r=>{
  if(r.phase!=='not-seen'||!r.request||!r.ticket)throw new MutationStateError('invalid-state');
  if(!this.#unexpired(r)){r.phase='reconciliation-required';r.errorCode='reconciliation-required';return;}
  await this.#mutate(r);
 });}
 retryRefresh(id:string):Promise<MutationView>{return this.#action(id,async r=>{if(r.phase!=='committed'||!r.outcome)throw new MutationStateError('invalid-state');await this.#refresh(r);});}
 retryActivation(id:string):Promise<MutationView>{return this.#action(id,async r=>{
  const known=r.outcome;if(r.phase!=='committed'||!known||known.activation==='active'||known.activation==='not-applicable')throw new MutationStateError('invalid-state');
  try{
   const result=decodeMutationOutcome(await this.#ports.call(r.key,PREFIX+'activate',{key:r.key,committedRevision:known.revision},r.stamp),this.#expect(r));
   if(!this.#alive(r))return;
   if(result.status!=='committed'||result.value.revision!==known.revision||result.value.registration!==known.registration)throw new MutationStateError('invalid-state');
   r.outcome=freeze(copy(result.value));r.errorCode=null;
  }catch{if(this.#alive(r))r.errorCode='transport-error';}
 });}
 /** For create/update, status itself retries credential-generation maintenance using the original ticket. */
 retryCleanup(id:string):Promise<MutationView>{return this.#action(id,async r=>{if(r.phase!=='committed'||!r.outcome||r.outcome.credentialCleanup!=='pending')throw new MutationStateError('invalid-state');await this.#status(r);});}
 endTemporary():void{
  for(const r of this.#records.values())if(r.key.scope==='temporary'&&r.phase!=='session-ended'){
   r.timer?.dispose();r.timer=null;r.phase='session-ended';r.ticket=null;r.outcome=null;r.errorCode='session-expired';this.#release(r);this.#clearDraft(r);
  }this.#emit();
 }
 dismiss(id:string):void{const r=this.#get(id);if(!this.#view(r).canDismiss)throw new MutationStateError('invalid-state');this.#release(r);r.ticket=null;r.clearDraft=null;this.#records.delete(id);this.#emit();}
 dispose():void{
  if(this.#disposed)return;this.#disposed=true;
  for(const r of this.#records.values()){r.timer?.dispose();r.timer=null;this.#release(r);r.ticket=null;this.#clearDraft(r);}
  this.#records.clear();this.#listeners.clear();this.#refreshObservers.clear();
 }
}
