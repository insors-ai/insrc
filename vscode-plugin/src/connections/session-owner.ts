/** Privileged workbench lifetime. Views receive status only, never session capabilities or sockets. */
import { openIpcLane, IpcLaneError } from '../../../src/shared/ipc-client.js';
import type { PersistentIpcLane } from '../../../src/shared/ipc-client.js';
import type { OpenConnectionSessionResult, SessionResume } from '../../../src/shared/connection-management.js';
import { parseSessionResume } from '../../../src/shared/connection-management-wire.js';
import { connectionReplyData, decodeManagementCapabilities } from '../../../src/shared/connection-manager/wire.js';

export interface OwnerTimer { dispose(): void }
export interface WorkbenchOwnerPorts {
 readonly openLane?: (()=>PersistentIpcLane) | undefined;
 readonly now?: (()=>number) | undefined;
 readonly timer?: ((callback:()=>void,ms:number)=>OwnerTimer) | undefined;
}
export interface ConnectionOwnerView {
 readonly status:'idle'|'ready'|'offline'|'expired'|'upgrade-required'|'disposed';
 readonly repoRoot:string|null; readonly daemonEpoch:string|null; readonly generation:number;
}
export class ConnectionOwnerError extends Error {
 constructor(readonly code:'offline'|'expired'|'upgrade-required'|'disposed'|'invalid-request'|'stale-view') { super('The connection manager is unavailable.'); }
}
const PREFIX='db.connections.v2.';
const METHODS=new Set(['capabilities','drivers','list','read','ticket','mutate','status','activate','removalState','retryRemovalCleanup','test','cancelTest'].map(m=>PREFIX+m));
function object(value:unknown):Record<string,unknown> { if(!value||typeof value!=='object'||Array.isArray(value))throw new ConnectionOwnerError('invalid-request');return value as Record<string,unknown>; }
function sessionData(value:unknown):Record<string,unknown> {
 const data=object(connectionReplyData(value));
 if(data['status']==='rejected')throw new ConnectionOwnerError(data['code']==='session-expired'?'expired':data['code']==='upgrade-required'?'upgrade-required':'offline');
 return data;
}
function resumeReply(value:unknown,open:boolean):SessionResume|OpenConnectionSessionResult {
 const data=sessionData(value),fields=['sessionHandle','capability','daemonEpoch',...(open?['heartbeatMs','leaseMs']:[])];
 if(Object.keys(data).length!==fields.length||fields.some(k=>!Object.hasOwn(data,k)))throw new ConnectionOwnerError('upgrade-required');
 if(open&&(data['heartbeatMs']!==30000||data['leaseMs']!==90000))throw new ConnectionOwnerError('upgrade-required');
 const resume=parseSessionResume({sessionHandle:data['sessionHandle'],capability:data['capability'],daemonEpoch:data['daemonEpoch']});
 return open?{...resume,heartbeatMs:30000,leaseMs:90000}:resume;
}
/** One instance constructed by activate(), registered in ExtensionContext.subscriptions. */
export class ConnectionsWorkbenchOwner {
 #open:()=>PersistentIpcLane; #now:()=>number; #timer:(callback:()=>void,ms:number)=>OwnerTimer;
 #roots=new Set<string>(); #root:string|null=null; #epoch:string|null=null; #generation=0;
 #status:ConnectionOwnerView['status']='idle'; #disposed=false;
 #control:PersistentIpcLane|null=null; #resume:SessionResume|null=null;
 #data=new Map<string,PersistentIpcLane>(); #saved=new Map<string,PersistentIpcLane>();
 #heartbeat:OwnerTimer|null=null; #expiry:OwnerTimer|null=null; #deadline=0;
 #queue:Promise<unknown>=Promise.resolve(); #queued=0; #heartbeatBusy=false;
 #listeners=new Set<(view:ConnectionOwnerView)=>void>();
 #invalidations=new Set<()=>void>(); #disposeDone:Promise<void>=Promise.resolve();
 constructor(ports:WorkbenchOwnerPorts={}) {
  this.#open=ports.openLane??(()=>openIpcLane());this.#now=ports.now??(()=>performance.now());
  this.#timer=ports.timer??((callback,ms)=>{const handle=setTimeout(callback,ms);handle.unref();return{dispose:()=>clearTimeout(handle)};});
 }
 get view():ConnectionOwnerView {return Object.freeze({status:this.#status,repoRoot:this.#root,daemonEpoch:this.#epoch,generation:this.#generation});}
 onChange(listener:(view:ConnectionOwnerView)=>void):OwnerTimer {this.#admit();this.#listeners.add(listener);return{dispose:()=>{this.#listeners.delete(listener);}};}
 /** Controllers erase temporary draft/attempt inputs synchronously on this signal. Never a persistence hook. */
 onTemporaryInvalidated(listener:()=>void):OwnerTimer {this.#admit();this.#invalidations.add(listener);return{dispose:()=>{this.#invalidations.delete(listener);}};}
 #emit():void {this.#generation++;for(const listener of [...this.#listeners])try{listener(this.view);}catch{/* View cannot disrupt owner cleanup. */}}
 #admit(root?:string):void {if(this.#disposed)throw new ConnectionOwnerError('disposed');if(root!==undefined&&!this.#roots.has(root))throw new ConnectionOwnerError('invalid-request');}
 setRegisteredRoots(roots:readonly string[]):void {
  this.#admit();if(roots.length>16384||roots.some(r=>!r||r.length>16384||/[\u0000-\u001f]/.test(r)))throw new ConnectionOwnerError('invalid-request');
  this.#roots=new Set(roots);
  for(const map of [this.#data,this.#saved])for(const [root,lane]of map)if(!this.#roots.has(root)){map.delete(root);lane.dispose();}
  if(this.#root&&!this.#roots.has(this.#root)){this.#root=null;this.#emit();}
 }
 #dropData():void {const lanes=[...this.#data.values()];this.#data.clear();for(const lane of lanes)lane.dispose();}
 #cancelTimers():void {this.#heartbeat?.dispose();this.#expiry?.dispose();this.#heartbeat=null;this.#expiry=null;}
 #invalidate(status:'expired'|'upgrade-required',epochChanged=false):void {
  this.#cancelTimers();this.#resume=null;this.#deadline=0;this.#dropData();
  const control=this.#control;this.#control=null;control?.dispose();
  this.#status=status;
  for(const listener of [...this.#invalidations])try{listener();}catch{/* Erasure must reach every controller. */}
  if(epochChanged)this.#epoch=null;
  this.#emit();
 }
 #lost(control:PersistentIpcLane):void {
  if(this.#control!==control||this.#disposed)return;
  this.#control=null;this.#heartbeat?.dispose();this.#heartbeat=null;this.#dropData();this.#status='offline';this.#emit();
 }
 #current(control:PersistentIpcLane):void {this.#admit();if(this.#control!==control||control.isClosed)throw new ConnectionOwnerError('offline');}
 #renew(sentAt:number):void {
  this.#deadline=sentAt+90000;this.#expiry?.dispose();
  this.#expiry=this.#timer(()=>{if(!this.#disposed&&this.#resume)this.#invalidate('expired');},Math.max(0,this.#deadline-this.#now()));
 }
 #scheduleHeartbeat():void {
  if(this.#heartbeat||this.#disposed||!this.#control||!this.#resume)return;
  this.#heartbeat=this.#timer(()=>{this.#heartbeat=null;void this.#beat();},30000);
 }
 async #beat():Promise<void> {
  const control=this.#control;if(!control||!this.#resume||this.#disposed||this.#heartbeatBusy)return;
  this.#heartbeatBusy=true;
  try {
   const sent=this.#now(),reply=sessionData(await control.rpc(PREFIX+'session.heartbeat',{}));
   this.#current(control);
   if(reply['status']!=='active'||reply['leaseMs']!==90000||Object.keys(reply).length!==2)throw new ConnectionOwnerError('expired');
   this.#renew(sent);
  }catch(error){if(this.#control===control){if(error instanceof ConnectionOwnerError)this.#invalidate('expired');else{control.dispose();this.#lost(control);}}}
  finally{this.#heartbeatBusy=false;this.#scheduleHeartbeat();}
 }
 async selectRoot(root:string):Promise<ConnectionOwnerView> {
  this.#admit(root);if(this.#queued>=64)throw new ConnectionOwnerError('offline');this.#queued++;
  const run=this.#queue.then(async()=>{
   this.#admit(root);
   if(this.#root!==root){this.#root=root;this.#emit();}
   await this.#ensure(root);return this.view;
  });
  this.#queue=run.catch(()=>{});try{return await run;}finally{this.#queued--;}
 }
 async #ensure(root:string,epochRetry=false):Promise<void> {
  if(this.#resume&&this.#now()>=this.#deadline)this.#invalidate('expired');
  let control=this.#control;
  const reconnect=!control&&this.#resume!==null;
  if(!control){control=this.#open();this.#control=control;const owned=control;control.onClose(()=>this.#lost(owned));}
  try {
   this.#current(control);
   const capabilities=decodeManagementCapabilities(await control.rpc(PREFIX+'capabilities',{repoRoot:root}));
   this.#current(control);this.#admit(root);
   if(!capabilities.features.includes('workbench-sessions')||!capabilities.features.includes('session-delegation'))throw new ConnectionOwnerError('upgrade-required');
   if(this.#epoch!==null&&this.#epoch!==capabilities.daemonEpoch){
    this.#invalidate('expired',true);this.#epoch=capabilities.daemonEpoch;
    // Re-enter on a fresh, unclaimed control lane after clearing every old temporary input.
    if(epochRetry)throw new ConnectionOwnerError('offline');
    return await this.#ensure(root,true);
   }
   this.#epoch=capabilities.daemonEpoch;
   if(!this.#resume){
    const sent=this.#now(),opened=resumeReply(await control.rpc(PREFIX+'session.open',{repoRoot:root}),true);
    this.#current(control);if(opened.daemonEpoch!==this.#epoch)throw new ConnectionOwnerError('expired');
    this.#resume={sessionHandle:opened.sessionHandle,capability:opened.capability,daemonEpoch:opened.daemonEpoch};this.#renew(sent);
   }else if(reconnect){
    const previous=this.#resume,reply=resumeReply(await control.rpc(PREFIX+'session.resume',previous),true);
    this.#current(control);
    if(reply.sessionHandle!==previous.sessionHandle||reply.capability!==previous.capability||reply.daemonEpoch!==previous.daemonEpoch)throw new ConnectionOwnerError('expired');
    // Resume never extends a lease. A confirmed current-control heartbeat does.
    await this.#beat();this.#current(control);if(!this.#resume)throw new ConnectionOwnerError('expired');
   }
   if(!this.#data.has(root)){
    if(this.#data.size>=64)throw new ConnectionOwnerError('offline');
    const delegation=resumeReply(await control.rpc(PREFIX+'session.delegate',{repoRoot:root,audience:'workbench-ui'}),false);
    this.#current(control);this.#admit(root);
    if(delegation.daemonEpoch!==this.#epoch||delegation.sessionHandle!==this.#resume?.sessionHandle)throw new ConnectionOwnerError('expired');
    const data=this.#open();
    try {
     const attached=sessionData(await data.rpc(PREFIX+'session.attach',{...delegation,repoRoot:root}));
     this.#current(control);this.#admit(root);
     if(Object.keys(attached).length!==5||attached['attached']!==true||attached['daemonEpoch']!==this.#epoch||attached['repoRoot']!==root||attached['audience']!=='workbench-ui'||!Number.isSafeInteger(attached['controlGeneration'])||(attached['controlGeneration'] as number)<1)throw new ConnectionOwnerError('expired');
     if(data.isClosed)throw new ConnectionOwnerError('offline');
     this.#data.set(root,data);data.onClose(()=>{if(this.#data.get(root)===data){this.#data.delete(root);if(this.#root===root)this.#status='offline';this.#emit();}});
    }catch(error){data.dispose();throw error;}
   }
   this.#status='ready';this.#scheduleHeartbeat();this.#emit();
  }catch(error){
   if(this.#disposed)throw new ConnectionOwnerError('disposed');
   if(error instanceof ConnectionOwnerError&&error.code==='expired'){this.#invalidate('expired');throw error;}
   if(error instanceof ConnectionOwnerError&&['offline','stale-view','invalid-request'].includes(error.code)) {
    if(this.#control===control){control.dispose();this.#lost(control);}throw error;
   }
   if(!(error instanceof IpcLaneError)||error.code==='remote-error'){
    this.#invalidate('upgrade-required');throw new ConnectionOwnerError('upgrade-required');
   }
   if(this.#control===control){control.dispose();this.#lost(control);}throw new ConnectionOwnerError('offline');
  }
 }
 #params(root:string,method:string,params:unknown,temporary:boolean):unknown {
  this.#admit(root);if(!METHODS.has(method))throw new ConnectionOwnerError('invalid-request');
  const copy=object(connectionReplyData(params));
  if(Object.keys(copy).some(k=>['sessionHandle','capability','daemonEpoch','projectId','windowId','trustedContext'].includes(k)))throw new ConnectionOwnerError('invalid-request');
  if(Object.hasOwn(copy,'repoRoot')&&copy['repoRoot']!==root)throw new ConnectionOwnerError('invalid-request');
  for(const field of ['key','ticket'])if(copy[field]!==undefined){const key=object(copy[field]);if((key['repoRoot']??key['lookupRoot'])!==root||key['scope']!==(temporary?'temporary':'saved'))throw new ConnectionOwnerError('invalid-request');}
  return copy;
 }
 async requestTemporary(root:string,identity:ConnectionOwnerView,method:string,params:unknown,signal?:AbortSignal):Promise<unknown> {
  const copy=this.#params(root,method,params,true);
  if(identity.generation!==this.#generation||identity.daemonEpoch!==this.#epoch||identity.repoRoot!==root)throw new ConnectionOwnerError('stale-view');
  if(this.#resume&&this.#now()>=this.#deadline)this.#invalidate('expired');
  if(this.#status!=='ready'||!this.#resume)throw new ConnectionOwnerError('expired');
  const lane=this.#data.get(root);if(!lane||lane.isClosed)throw new ConnectionOwnerError('offline');
  return await lane.rpc(method,copy,{signal});
 }
 async requestSaved(root:string,method:string,params:unknown,signal?:AbortSignal):Promise<unknown> {
  const copy=this.#params(root,method,params,false);
  let lane=this.#saved.get(root);if(!lane||lane.isClosed){if(!lane&&this.#saved.size>=64)throw new ConnectionOwnerError('offline');lane=this.#open();this.#saved.set(root,lane);}
  // This lane is never claimed or attached. No failed delegated request is replayed here.
  return await lane.rpc(method,copy,{signal});
 }
 dispose():void {
  if(this.#disposed)return;this.#disposed=true;this.#cancelTimers();this.#dropData();
  for(const lane of this.#saved.values())lane.dispose();this.#saved.clear();
  const control=this.#control;this.#control=null;this.#resume=null;this.#status='disposed';
  for(const listener of [...this.#invalidations])try{listener();}catch{/* Erase all temporary inputs. */}
  this.#emit();this.#listeners.clear();this.#invalidations.clear();
  if(control){
   const timeout=this.#timer(()=>control.dispose(),1000);
   this.#disposeDone=control.rpc(PREFIX+'session.end',{}).then(()=>{},()=>{}).finally(()=>{timeout.dispose();control.dispose();});
  }
 }
 whenDisposed():Promise<void>{return this.#disposeDone;}
}
