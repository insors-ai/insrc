/** Workbench-memory probe ownership. Terminal replies are not worker-drain notifications. */
import { randomUUID } from 'node:crypto';
import type { ConnectionKey, DraftTestRequest } from '../connection-management.js';
import type { ConnectionDraft } from './draft.js';
import { decodeDraftTestResult } from './wire.js';

export interface DraftTestIdentity {readonly key:ConnectionKey;readonly daemonEpoch:string;readonly viewGeneration:number}
/** Captured privileged transport. Neither this object nor its methods cross into the renderer. */
export interface DraftTestSource {run(request:DraftTestRequest):Promise<unknown>;cancel(requestId:string):Promise<unknown>}
export interface DraftTestPorts {source(key:ConnectionKey,epoch:string):DraftTestSource}
export interface DraftTestView {
 readonly status:'idle'|'testing'|'reachable'|'failed'|'timeout'|'canceled'|'unavailable';
 readonly tookMs:number|null;readonly message:string;readonly cleanupUnverified:boolean;
}
interface Reservation {
 readonly source:DraftTestSource;readonly key:ConnectionKey;readonly epoch:string;
 requestId:string;pending:boolean;canceled:boolean;unsubscribe:(()=>void)|null;
}
const messages:Record<DraftTestView['status'],string>={idle:'',testing:'Testing connection…',reachable:'Connection is reachable.',failed:'Connection test failed.',timeout:'Connection test timed out.',canceled:'Connection test canceled.',unavailable:'Connection test unavailable. Retry after cleanup completes.'};
const sameKey=(a:ConnectionKey,b:ConnectionKey):boolean=>a.repoRoot===b.repoRoot&&a.scope===b.scope&&a.id===b.id;
const sameView=(a:DraftTestIdentity|null,b:DraftTestIdentity):boolean=>!!a&&sameKey(a.key,b.key)&&a.daemonEpoch===b.daemonEpoch&&a.viewGeneration===b.viewGeneration;
const route=(key:ConnectionKey):string=>JSON.stringify([key.repoRoot,key.scope]);
export class DraftTestStateError extends Error {constructor(readonly code:'busy'|'stale-view'|'disposed'|'resource-limit'){super('The connection test cannot start in its current state.');}}

/** One instance per workbench, retained when a manager view closes. No stored draft or credential history. */
export class ConnectionDraftTests {
 #ports:DraftTestPorts;#identity:DraftTestIdentity|null=null;#reservations=new Map<string,Reservation>();#visible:Reservation|null=null;
 #state:DraftTestView=Object.freeze({status:'idle',tookMs:null,message:'',cleanupUnverified:false});
 #listeners=new Set<()=>void>();#disposed=false;
 constructor(ports:DraftTestPorts){this.#ports=ports;}
 get view():DraftTestView{return this.#state;}
 onChange(listener:()=>void):{dispose():void}{this.#admit();this.#listeners.add(listener);return{dispose:()=>{this.#listeners.delete(listener);}};}
 #admit():void {if(this.#disposed)throw new DraftTestStateError('disposed');}
 #publish(status:DraftTestView['status'],cleanupUnverified=false,tookMs:number|null=null):void {
  this.#state=Object.freeze({status,tookMs,message:messages[status],cleanupUnverified});
  for(const listener of [...this.#listeners])try{listener();}catch{/* View publication cannot release a probe. */}
 }
 /** Root, selection, navigation and close all invalidate the previous local view, including A→B→A. */
 setView(identity:DraftTestIdentity|null):void {
  this.#admit();if(identity&&sameView(this.#identity,identity))return;
  this.cancel();this.#identity=identity?Object.freeze({...identity,key:Object.freeze({...identity.key})}):null;
  this.#visible=null;this.#publish('idle');
 }
 #stop(r:Reservation):void {
  if(r.canceled)return;r.canceled=true;r.unsubscribe?.();r.unsubscribe=null;
  // Do not abort the unary call: it must settle before an explicit retry on this same source.
  if(r.pending)void r.source.cancel(r.requestId).catch(()=>{});
 }
 cancel():void {
  const r=this.#visible;if(!r||r.canceled)return;this.#stop(r);
  this.#publish(r.pending?'canceled':'idle',r.pending);
 }
 async test(draft:ConnectionDraft,identity:DraftTestIdentity):Promise<DraftTestView> {
  this.#admit();if(!sameView(this.#identity,identity))throw new DraftTestStateError('stale-view');
  const input=draft.serialize(),revision=draft.view.draftRevision;
  if(!sameKey(input.key,identity.key))throw new DraftTestStateError('stale-view');
  const slot=route(input.key),previous=this.#reservations.get(slot);
  if(previous?.pending)throw new DraftTestStateError('busy');
  if(previous&&previous.epoch!==identity.daemonEpoch)throw new DraftTestStateError('stale-view');
  if(!previous&&this.#reservations.size>=128)throw new DraftTestStateError('resource-limit');
  // An uncertain terminal result retains its original source. Explicit retry asks that source's
  // authoritative supervisor for admission; never create a fresh lane to bypass its drain.
  const source=previous?.source??this.#ports.source(input.key,identity.daemonEpoch);
  const requestId=randomUUID(),r:Reservation={source,key:input.key,epoch:identity.daemonEpoch,requestId,pending:true,canceled:false,unsubscribe:null};
  this.cancel();this.#reservations.set(slot,r);this.#visible=r;
  const subscription=draft.onChange(()=>{if(this.#visible===r){this.cancel();this.#visible=null;this.#publish('idle');}});
  r.unsubscribe=()=>subscription.dispose();
  const current=():boolean=>!this.#disposed&&this.#visible===r&&!r.canceled&&sameView(this.#identity,identity)&&draft.view.draftRevision===revision&&sameKey(draft.view.key,input.key);
  try {
   const response=source.run({requestId,draftRevision:revision,key:input.key,...(input.expectedRevision?{expectedRevision:input.expectedRevision}:{}),publicPatch:input.publicPatch,credentials:input.credentials});
   this.#publish('testing');
   const result=decodeDraftTestResult(await response,{key:input.key,daemonEpoch:identity.daemonEpoch,requestId,draftRevision:revision});
   if(current())this.#publish(result.status,result.status!=='reachable',result.tookMs);
   // Reachable is produced only after child close. Other statuses may precede cleanup.
   if(result.status==='reachable'&&this.#reservations.get(slot)===r)this.#reservations.delete(slot);
  }catch{if(current())this.#publish('unavailable',true);}
  finally{r.pending=false;if(this.#visible!==r||r.canceled){r.unsubscribe?.();r.unsubscribe=null;}}
  return this.#state;
 }
 /** Owner revocation clears temporary sources without revoking independent Saved recovery. */
 endTemporary():void {
  if(this.#visible?.key.scope==='temporary'){this.cancel();this.#visible=null;this.#publish('idle');}
  for(const [slot,r]of this.#reservations)if(r.key.scope==='temporary'){
   this.#stop(r);
   this.#reservations.delete(slot);if(this.#visible===r){this.#visible=null;this.#publish('idle');}
  }
 }
 dispose():void {
  if(this.#disposed)return;this.cancel();this.#disposed=true;
  for(const r of this.#reservations.values())this.#stop(r);
  this.#reservations.clear();this.#identity=null;this.#visible=null;this.#listeners.clear();
 }
}
