/** Workbench-memory view host. Only explicit, checked intents reach privileged owner ports. */
import { CONNECTION_PROBLEMS } from './messages.js';
import { randomUUID } from 'node:crypto';
import { isAbsolute, relative, sep } from 'node:path';
import { IpcLaneError } from '../../../src/shared/ipc-client.js';
import { makeNonce } from '../panels/html.js';
import { ConnectionsWorkbenchOwner,ConnectionOwnerError } from './session-owner.js';
import type { ConnectionPanel,ConnectionRenderView,ConnectionIntent } from './types.js';
import { parseConnectionIntent } from './types.js';
import { connectionManagerDocument } from './renderer.js';
import { createConnectionManager,projectConnectionManager,reduceConnectionManager,sameConnectionKey } from '../../../src/shared/connection-manager/model.js';
import type { ConnectionManagerState,ManagerEvent,ManagerEffect } from '../../../src/shared/connection-manager/model.js';
import { ConnectionDraft,connectionDriverChoices } from '../../../src/shared/connection-manager/draft.js';
import type { DraftNavigation } from '../../../src/shared/connection-manager/draft.js';
import type { ConnectionMutationController,MutationTimer } from '../../../src/shared/connection-manager/controller.js';
import type { ConnectionDraftTests } from '../../../src/shared/connection-manager/test-controller.js';
import type { ConnectionRemovals } from '../../../src/shared/connection-manager/removal.js';
import { decodeDriverDescriptors,decodeManagementCapabilities } from '../../../src/shared/connection-manager/wire.js';
import type { ClientDriverDescriptor } from '../../../src/shared/connection-manager/wire.js';
import type { ConnectionScope,SafeConnection } from '../../../src/shared/connection-management.js';
import { connectionActionSupported,connectionOperationSupported } from '../../../src/shared/connection-manager/capabilities.js';
import type { ConnectionAction } from '../../../src/shared/connection-manager/capabilities.js';
import type { ConnectionKey } from '../../../src/shared/connection-management.js';

export interface ConnectionsHostPorts {
 readonly createPanel:()=>ConnectionPanel;readonly registeredRoots:()=>Promise<readonly string[]>;
 readonly owner:ConnectionsWorkbenchOwner;readonly mutations:ConnectionMutationController;
 readonly tests:ConnectionDraftTests;readonly removals:ConnectionRemovals;
 readonly openedPath?:(()=>string|undefined)|undefined;
 readonly pickFile?:(()=>Promise<string|undefined>)|undefined;
 readonly nonce?:(()=>string)|undefined;
}
/** Choose only an admitted root, preserving its canonical registry spelling. */
export function connectionRootForPath(roots:readonly string[],path:string|undefined):string|undefined {
 if(!path||!isAbsolute(path))return undefined;
 return roots.filter(root=>{
  if(!isAbsolute(root))return false;
  const child=relative(root,path);
  return child!== '..'&&!child.startsWith('..'+sep)&&!isAbsolute(child);
 }).sort((a,b)=>b.length-a.length)[0];
}
const PREFIX='db.connections.v2.';
export class ConnectionsManagerHost {
 #ports:ConnectionsHostPorts;#panel:ConnectionPanel|null=null;#viewId='';#generation=0;#formId=0;#ready=false;#visible=true;#disposed=false;#publishing=false;
 #model:ConnectionManagerState=createConnectionManager([],'');#draft:ConnectionDraft|null=null;#descriptors:readonly ClientDriverDescriptor[]=[];#descriptorEpoch='';#descriptorRoot='';
 #picking=false;
 #messages:{id:number;text:string}[]=[];#messageId=0;#messageRoot:string|null=null;#messageSeen=new Map<string,string>();
 #pending:(()=>void|Promise<void>)|null=null;#error='';#notice='';#read:AbortController|null=null;#subscriptions:MutationTimer[]=[];
 constructor(ports:ConnectionsHostPorts){
  this.#ports=ports;
  this.#model=createConnectionManager([],ports.owner.view.daemonEpoch??'');
  this.#subscriptions.push(ports.owner.onChange(view=>{
   if(this.#disposed)return;
   if(view.daemonEpoch&&view.daemonEpoch!==this.#model.daemonEpoch){this.#descriptors=[];this.#descriptorEpoch='';this.#dispatch({type:'epoch',value:view.daemonEpoch});}
   if(view.status==='offline'||view.status==='expired'||view.status==='disposed')this.#dispatch({type:'unavailable',code:'offline'});
   else if(view.status==='upgrade-required')this.#dispatch({type:'unavailable',code:'upgrade-required'});
  }),ports.owner.onTemporaryInvalidated(()=>{
   if(this.#disposed)return;
   const hadTemporary=this.#draft?.view.key.scope==='temporary'||this.#model.rows.some(row=>row.key.scope==='temporary');
   if(this.#draft?.view.key.scope==='temporary'){this.#draft.clear();this.#draft=null;this.#pending=null;this.#bump();}
   try{ports.removals.cancel();}catch{/* Already disposed with the workbench. */}
   if(hadTemporary)this.#notice='Temporary connections expired with their owner. Refresh or choose a registered repository to reconnect.';this.#dispatch({type:'temporary-ended'});
  }),ports.mutations.onChange(()=>this.#publish()),ports.tests.onChange(()=>this.#publish()),ports.removals.onChange(()=>this.#publish()),
  ports.mutations.observeRefresh((key,revision)=>{
   if(this.#disposed||this.#model.repoRoot!==key.repoRoot)return undefined;
   const removal=ports.mutations.records.some(r=>r.key.repoRoot===key.repoRoot&&r.outcome?.revision===revision&&r.mode==='remove');
   const transition=reduceConnectionManager(this.#model,removal?{type:'refresh'}:{type:'committed-reveal',selection:{key,revision}});
   this.#model=transition.state;const identity=transition.effects[0];this.#publish();if(!identity)return undefined;
   // The mutation controller performs this read. Do not issue a duplicate host read.
   return{success:rows=>this.#dispatch({...identity,type:'list-result',rows}),failed:()=>this.#dispatch({...identity,type:'list-error',code:'read-error'})};
  }));
 }
 #bump():void{if(this.#generation<Number.MAX_SAFE_INTEGER)this.#generation++;this.#bindTest();}
 #bindTest():void{
  try{const d=this.#draft,epoch=this.#ports.owner.view.daemonEpoch;this.#ports.tests.setView(d&&epoch&&this.#panel&&this.#visible?{key:d.view.key,daemonEpoch:epoch,viewGeneration:this.#generation}:null);}catch{/* Teardown cannot re-admit a test. */}
 }
 #dispatch(event:ManagerEvent):void{
  if(this.#disposed)return;const transition=reduceConnectionManager(this.#model,event);this.#model=transition.state;
  this.#publish();for(const effect of transition.effects)void this.#load(effect);
 }
 async #load(identity:ManagerEffect):Promise<void>{
  this.#descriptorRoot='';this.#read?.abort();const controller=new AbortController();this.#read=controller;
  try{
   // Public metadata can open a local draft before workbench-session admission.
   // It never grants Save, Test or removal authority.
   let capabilities;
   try{capabilities=decodeManagementCapabilities(await this.#ports.owner.requestSaved(identity.repoRoot,PREFIX+'capabilities',{repoRoot:identity.repoRoot},controller.signal));}
   catch(error){throw new ConnectionOwnerError(error instanceof IpcLaneError&&error.code!=='remote-error'?'offline':'upgrade-required');}
   if(!['safe-read','driver-descriptors'].every(feature=>capabilities.features.includes(feature)))throw new ConnectionOwnerError('upgrade-required');
   if(controller.signal.aborted||this.#disposed)return;
   if(capabilities.daemonEpoch!==identity.daemonEpoch){this.#descriptorRoot='';this.#dispatch({type:'epoch',value:capabilities.daemonEpoch});if(this.#model.repoRoot===identity.repoRoot)this.#dispatch({type:'refresh'});return;}
   const descriptors=decodeDriverDescriptors(await this.#ports.owner.requestSaved(identity.repoRoot,PREFIX+'drivers',{},controller.signal));
   if(controller.signal.aborted||this.#disposed)return;
   this.#descriptors=descriptors;this.#descriptorEpoch=identity.daemonEpoch;this.#descriptorRoot=identity.repoRoot;
   const owner=await this.#ports.owner.selectRoot(identity.repoRoot);
   if(controller.signal.aborted||this.#disposed)return;
   if(owner.daemonEpoch!==identity.daemonEpoch){if(owner.daemonEpoch)this.#dispatch({type:'epoch',value:owner.daemonEpoch});if(this.#model.repoRoot===identity.repoRoot)this.#dispatch({type:'refresh'});return;}
   const rows=await this.#ports.owner.requestTemporary(identity.repoRoot,owner,PREFIX+'list',{repoRoot:identity.repoRoot},controller.signal);
   if(!controller.signal.aborted)this.#dispatch({...identity,type:'list-result',rows});
  }catch(error){
   if(controller.signal.aborted||this.#disposed)return;
   const code=error instanceof ConnectionOwnerError&&error.code==='upgrade-required'?'upgrade-required':error instanceof ConnectionOwnerError?'offline':'read-error';
   this.#dispatch({...identity,type:'list-error',code});
  }
 }
 async open():Promise<void>{
  if(this.#disposed)return;if(this.#panel){this.#panel.reveal();return;}
  // Capture editor context before creating a webview changes editor focus.
  let openedPath:string|undefined;try{openedPath=this.#ports.openedPath?.();}catch{/* Context is only a default. */}
  const panel=this.#ports.createPanel();this.#panel=panel;this.#visible=true;this.#viewId=randomUUID();this.#bump();this.#ready=false;
  const viewId=this.#viewId;
  panel.onMessage(raw=>{if(this.#panel!==panel||this.#disposed)return;const intent=parseConnectionIntent(raw);if(intent&&intent.viewId===viewId&&(intent.type==='ready'||intent.generation===this.#generation)&&(this.#visible||intent.type==='ready'||intent.type==='cancel-test'))void this.#handle(intent).catch(()=>{this.#error='The connection action could not complete. Review the current state and retry.';this.#publish();});});
  panel.onDidDispose(()=>{
   if(this.#panel!==panel)return;this.#panel=null;this.#visible=false;this.#ready=false;this.#read?.abort();this.#pending=null;
   try{this.#draft?.decideDiscard('cancel');this.#ports.removals.cancel();}catch{/* View-only cleanup. */}
   this.#bump();try{this.#ports.tests.setView(null);}catch{/* Owner may be ending. */}
   if(this.#draft?.dirty)this.#notice='Unsaved draft retained in this workbench. Reopen Connections to continue editing.';
  });
  panel.onVisibility?.(visible=>{if(this.#panel!==panel)return;this.#visible=visible;this.#bump();if(visible)this.#publish();});
  panel.setHtml(connectionManagerDocument((this.#ports.nonce??makeNonce)(),viewId,this.#generation));panel.reveal();this.#bindTest();
  try{
   const roots=await this.#ports.registeredRoots();if(this.#disposed||this.#panel!==panel)return;
   this.#ports.owner.setRegisteredRoots(roots);this.#dispatch({type:'registered-roots',roots});
   if(this.#draft&&!roots.includes(this.#draft.view.key.repoRoot)){this.#draft.clear();this.#draft=null;this.#bump();this.#bindTest();}
   const preferred=!this.#model.repoRoot&&!this.#draft?connectionRootForPath(roots,openedPath):undefined;
   if(preferred)this.#dispatch({type:'select-root',repoRoot:preferred});
   else if(this.#model.repoRoot)this.#dispatch({type:'refresh'});
  }catch{if(this.#disposed||this.#panel!==panel)return;this.#error='Registered repositories are unavailable. Reconnect the daemon and reopen Connections.';this.#dispatch({type:'unavailable',code:'offline'});}
  this.#publish();
 }
 #publish():void{
  if(this.#publishing||!this.#panel||!this.#ready||!this.#visible||this.#disposed)return;this.#publishing=true;
  try{
   if(this.#draft?.view.discarded){this.#draft=null;this.#formId++;this.#bump();this.#bindTest();}
   const projection=projectConnectionManager(this.#model),visible=new Set(projection.visibleKeys.map(k=>JSON.stringify(k)));
   const draft=this.#draft?.view??null,validationMessages=this.#draft?this.#validationMessages(this.#draft):[],valid=!!draft&&validationMessages.length===0;
   const operations=this.#ports.mutations.records.filter(r=>r.key.repoRoot===this.#model.repoRoot);
   const features=this.#ports.owner.features(projection.repoRoot??'');
   if(this.#messageRoot!==projection.repoRoot){this.#messageRoot=projection.repoRoot;this.#messages=[];this.#messageSeen.clear();}
   this.#collectMessages(operations);
   const view:ConnectionRenderView={viewId:this.#viewId,generation:this.#generation,
    controls:{save:!!draft&&connectionActionSupported(features,draft.key.scope,draft.mode),test:!!draft&&connectionActionSupported(features,draft.key.scope,'test'),remove:!!projection.selected&&connectionActionSupported(features,projection.selected.key.scope,'remove'),operations:Object.fromEntries(operations.map(r=>[r.recordId,['reconcile','replay','activation','cleanup','refresh','dismiss'].filter(action=>connectionOperationSupported(features,r.key.scope,r.mode,action))]))},
    list:{roots:projection.roots,repoRoot:projection.repoRoot,filter:projection.filter,search:projection.search,listState:projection.listState,counts:projection.counts,matchingCount:projection.matchingCount,stale:projection.stale,canMutate:projection.canMutate},
    rows:projection.rows.filter(r=>visible.has(JSON.stringify(r.key))).map(r=>({key:r.key,revision:r.revision,kind:r.kind,label:r.label?.trim()?r.label:r.key.id,family:r.effectiveFamily,selected:!!projection.selected&&sameConnectionKey(projection.selected.key,r.key)&&projection.selected.revision===r.revision,canRemove:projection.canMutate&&connectionActionSupported(features,r.key.scope,'remove')&&!this.#ports.mutations.isBlocked(r.key)})),
    canCreateDraft:this.#canCreateDraft(),canBrowseFile:!!this.#ports.pickFile&&!this.#picking,validationMessages,choices:connectionDriverChoices(this.#descriptors),draft,formId:this.#formId,blocked:!!draft&&this.#ports.mutations.isBlocked(draft.key),valid,
    messages:this.#messages.map(message=>({...message})),test:this.#ports.tests.view,operations,confirmation:this.#ports.removals.view.confirmation,dirty:this.#pending!==null||this.#ports.removals.view.resolveDirty,error:this.#error,notice:this.#notice};
   this.#panel.postMessage({type:'render',view});
  }finally{this.#publishing=false;}
 }
 /** Retain only safe status copy, never drafts, credential values or raw RPC errors. */
 #collectMessages(operations:readonly import('../../../src/shared/connection-manager/controller.js').MutationView[]):void {
  const record=(channel:string,text:string)=>{
   if(this.#messageSeen.get(channel)===text)return;this.#messageSeen.set(channel,text);
   if(!text)return;this.#messages.push({id:++this.#messageId,text});
   if(this.#messages.length>200)this.#messages.shift();
  };
  record('error',this.#error);record('notice',this.#notice);
  const probe=this.#ports.tests.view;record('test',probe.status==='idle'?'':probe.message+(probe.cleanupUnverified?' Worker cleanup is not yet verified.':''));
  for(const operation of operations){
   const prefix=operation.key.scope==='temporary'?'Temporary connection':'Saved connection';
   const status=operation.outcome
    ?prefix+(operation.outcome.registration==='removed'?' removed.':' registered.')+(operation.outcome.activation==='active'?' Ready to use.':operation.outcome.activation==='pending'?' Activation pending.':operation.outcome.activation==='failed'?' Activation failed; use recovery actions.':'')+(operation.outcome.credentialCleanup==='pending'?' Credential cleanup pending.':'')+(operation.refresh==='failed'?' List refresh failed; use recovery actions.':'')+(operation.removal?' '+operation.removal.safeMessage:'')
    :prefix+' operation: '+operation.phase.replace(/-/g,' ')+'.'+(operation.errorCode?' '+(CONNECTION_PROBLEMS[operation.errorCode]??'Review the operation recovery actions.'):'');
   record(operation.recordId,status);
  }
  const active=new Set(['error','notice','test',...operations.map(operation=>operation.recordId)]);
  for(const channel of this.#messageSeen.keys())if(!active.has(channel))this.#messageSeen.delete(channel);
 }
 #setField(draft:ConnectionDraft,path:readonly string[],value:unknown):void{
  // The fixed schema-source format is hidden in the form; populate it with its path.
  if(path.length===2&&path[0]==='schemaSource'&&path[1]==='path'){
   const properties=draft.view.publicInputSchema['properties'] as Record<string,Record<string,unknown>>;
   const nested=properties['schemaSource']?.['properties'] as Record<string,Record<string,unknown>>|undefined;
   const type=nested?.['type']?.['const'];
   if(typeof type==='string'){
    if(value===''){draft.resetField(['schemaSource']);return;}
    const current=draft.view.publicValues['schemaSource'] as Record<string,unknown>|undefined;
    draft.setField(['schemaSource'],{...current,type,path:value});return;
   }
  }
  draft.setField(path,value);
 }
 #validationMessages(draft:ConnectionDraft):string[]{
  const view=draft.view,messages:string[]=[];
  if(!view.key.id.trim())messages.push('Enter a Connection ID. Label is optional.');
  if(view.family==='file'&&Object.hasOwn((view.publicInputSchema['properties']??{}) as object,'path')&&(typeof view.publicValues['path']!=='string'||!view.publicValues['path'].trim()))messages.push('Select a source file with Browse or enter its file path.');
  try{draft.serialize();}catch{if(!messages.length)messages.push('Check the Connection ID, driver fields and credential replacements.');}
  return messages;
 }
 #canCreateDraft():boolean{
  const model=this.#model;
  return !this.#disposed&&!model.closed&&!!model.repoRoot&&model.roots.includes(model.repoRoot)&&this.#descriptorRoot===model.repoRoot&&this.#descriptorEpoch===model.daemonEpoch&&['ready','empty-registry','empty-filter','upgrade-required'].includes(model.listState)&&connectionDriverChoices(this.#descriptors).some(choice=>choice.enabled);
 }
 #editable():ConnectionDraft{
  const draft=this.#draft;if(!draft||!(draft.view.mode==='create'?this.#canCreateDraft():projectConnectionManager(this.#model).canMutate)||this.#ports.mutations.isBlocked(draft.view.key))throw new Error('Action unavailable');return draft;
 }
 #allow(key:ConnectionKey,action:ConnectionAction):boolean{
  if(connectionActionSupported(this.#ports.owner.features(key.repoRoot),key.scope,action))return true;
  this.#error='Upgrade the daemon to use this connection action.';return false;
 }
 #navigate(target:DraftNavigation,action:()=>void|Promise<void>):void{
  if(this.#draft?.dirty){this.#draft.requestExit(target);this.#pending=action;this.#bump();this.#publish();return;}
  this.#draft?.clear();this.#draft=null;this.#bump();this.#bindTest();void Promise.resolve(action()).catch(()=>{this.#error='The connection view could not be opened.';this.#publish();});
 }
 #newDraft(kind:string,scope:ConnectionScope,id=''):void{
  const descriptor=this.#descriptors.find(d=>d.kind===kind);if(!descriptor||!connectionDriverChoices([descriptor])[0]?.enabled||!this.#model.repoRoot)throw new Error('Driver unavailable');
  this.#draft?.clear();this.#draft=new ConnectionDraft(descriptor,{repoRoot:this.#model.repoRoot,scope,id});this.#formId++;this.#bump();this.#bindTest();this.#publish();
 }
 #select(row:SafeConnection):void{
  this.#dispatch({type:'select',selection:{key:row.key,revision:row.revision}});
  const descriptor=this.#descriptors.find(d=>d.kind===row.kind);this.#draft=descriptor?new ConnectionDraft(descriptor,row.key,row):null;
  this.#error=descriptor?'':'This driver requires a newer connection editor. The selected registration can still be removed.';
  this.#formId++;this.#bump();this.#bindTest();this.#publish();
 }
 async #handle(intent:ConnectionIntent):Promise<void>{
  if(this.#disposed)return;if(intent.type==='ready'){this.#ready=true;this.#publish();return;}
  if((this.#pending||this.#ports.removals.view.resolveDirty||this.#ports.removals.view.confirmation)&&!['dirty','removal','cancel-test'].includes(intent.type))return;
  this.#error='';this.#messageSeen.delete('error');
  try{
   switch(intent.type){
    case 'root':
     if(!this.#model.roots.includes(intent.value))return;
     this.#navigate({type:'root',repoRoot:intent.value},()=>this.#dispatch({type:'select-root',repoRoot:intent.value}));break;
    case 'filter':this.#navigate({type:'filter',value:intent.value},()=>this.#dispatch({type:'filter',value:intent.value}));break;
    case 'search':this.#navigate({type:'search',value:intent.value},()=>this.#dispatch({type:'search',value:intent.value}));break;
    case 'clear-filter':this.#navigate({type:'filter',value:'all'},()=>{this.#dispatch({type:'filter',value:'all'});this.#dispatch({type:'search',value:''});});break;
    case 'refresh':this.#dispatch({type:'refresh'});break;
    case 'select':{
     const visible=projectConnectionManager(this.#model).visibleKeys;
     const row=this.#model.rows.find(r=>sameConnectionKey(r.key,intent.key)&&r.revision===intent.revision&&visible.some(k=>sameConnectionKey(k,r.key)));
     if(row&&projectConnectionManager(this.#model).canMutate)this.#navigate({type:'row',key:row.key,revision:row.revision},()=>this.#select(row));break;
    }
    case 'add':{
     if(!this.#canCreateDraft())return;const first=connectionDriverChoices(this.#descriptors).find(d=>d.enabled);if(!first)return;
     this.#navigate({type:'kind',value:first.kind},()=>this.#newDraft(first.kind,this.#model.filter==='temporary'?'temporary':'saved'));break;
    }
    case 'browse-file':{
     const draft=this.#editable(),view=draft.view;let schema=view.publicInputSchema as Record<string,unknown>;
     for(const part of intent.path)schema=((schema?.['properties']??{}) as Record<string,Record<string,unknown>>)[part]??{};
     if(!this.#ports.pickFile||this.#picking||schema['type']!=='string')break;
     const panel=this.#panel,generation=this.#generation,epoch=this.#model.daemonEpoch,revision=view.draftRevision;
     this.#picking=true;this.#publish();
     try{
      const path=await this.#ports.pickFile();
      if(path===undefined||this.#disposed||!this.#visible||this.#panel!==panel||this.#generation!==generation||this.#model.daemonEpoch!==epoch||this.#draft!==draft||draft.view.draftRevision!==revision||this.#pending)break;
      if(this.#editable()!==draft)break;this.#setField(draft,intent.path,path);
     }finally{this.#picking=false;}
     break;
    }
    case 'scope':case 'kind':{
     const draft=this.#editable();if(draft.view.mode!=='create')return;
     const {kind,key}=draft.view;this.#navigate(intent.type==='scope'?{type:'scope',value:intent.value}:{type:'kind',value:intent.value},()=>this.#newDraft(intent.type==='kind'?intent.value:kind,intent.type==='scope'?intent.value:key.scope,key.id));break;
    }
    case 'id':this.#editable().setId(intent.value);this.#bindTest();break;
    case 'field':this.#setField(this.#editable(),intent.path,intent.value);break;
    case 'reset-field':this.#editable().resetField(intent.path);break;
    case 'credential':{
     const draft=this.#editable();try{draft.setCredential(intent.slot,intent.action,intent.value);}catch(error){if(intent.action==='replace'&&draft.view.credentials.some(c=>c.slot===intent.slot))try{draft.setCredential(intent.slot,'replace','');}catch{/* Read-only forms remain unchanged. */}throw error;}break;
    }
    case 'credential-addresses':{
     const draft=this.#editable();try{draft.setCredentialAddresses(intent.slot,intent.values);}catch(error){if(draft.view.credentials.some(c=>c.slot===intent.slot))try{draft.setCredential(intent.slot,'replace','');}catch{/* Read-only forms remain unchanged. */}throw error;}break;
    }
    case 'test':{const draft=this.#editable();if(!this.#allow(draft.view.key,'test'))break;const issues=this.#validationMessages(draft);if(issues.length){this.#error=issues.join(' ');break;}const epoch=this.#ports.owner.view.daemonEpoch;if(epoch)await this.#ports.tests.test(draft,{key:draft.view.key,daemonEpoch:epoch,viewGeneration:this.#generation});break;}
    case 'cancel-test':this.#ports.tests.cancel();break;
    case 'save':{const draft=this.#editable();if(!this.#allow(draft.view.key,draft.view.mode))break;const issues=this.#validationMessages(draft);if(issues.length){this.#error=issues.join(' ');break;}this.#ports.tests.cancel();await this.#ports.mutations.submit(draft);break;}
    case 'remove':case 'remove-row':{
     const selected=intent.type==='remove-row'?{key:intent.key,revision:intent.revision}:this.#model.selected,row=selected&&this.#model.rows.find(r=>sameConnectionKey(r.key,selected.key)&&r.revision===selected.revision);
     if(row&&projectConnectionManager(this.#model).canMutate&&projectConnectionManager(this.#model).visibleKeys.some(k=>sameConnectionKey(k,row.key))&&this.#allow(row.key,'remove')){this.#ports.removals.begin(row,this.#draft??undefined);this.#bump();}break;
    }
    case 'dirty':{
     if(this.#ports.removals.view.resolveDirty){this.#ports.removals.resolveDirty(intent.decision);this.#bump();break;}
     if(!this.#pending||!this.#draft)return;const action=this.#pending;this.#pending=null;
     const effects=this.#draft.decideDiscard(intent.decision);this.#bump();
     if(intent.decision==='discard'&&effects.length){this.#draft=null;this.#bindTest();await action();}break;
    }
    case 'removal':if(intent.decision==='confirm'&&this.#ports.removals.view.confirmation&&!this.#allow(this.#ports.removals.view.confirmation.key,'remove'))break;await this.#ports.removals.decide(intent.decision);this.#bump();break;
    case 'operation':{
     const record=this.#ports.mutations.records.find(r=>r.recordId===intent.recordId&&r.key.repoRoot===this.#model.repoRoot);if(!record)return;
     if(!connectionOperationSupported(this.#ports.owner.features(record.key.repoRoot),record.key.scope,record.mode,intent.action)){this.#error='Upgrade the daemon to use this recovery action. The original operation is retained.';break;}
     switch(intent.action){
      case 'reconcile':await this.#ports.mutations.reconcile(intent.recordId);break;
      case 'replay':await this.#ports.mutations.replay(intent.recordId);break;
      case 'activation':await this.#ports.mutations.retryActivation(intent.recordId);break;
      case 'cleanup':await this.#ports.mutations.retryCleanup(intent.recordId);break;
      case 'refresh':await this.#ports.mutations.retryRefresh(intent.recordId);break;
      case 'dismiss':this.#ports.mutations.dismiss(intent.recordId);break;
     }break;
    }
    case 'close':this.#navigate({type:'close'},()=>this.#panel?.dispose());break;
   }
  }catch{this.#error='Review the connection fields and current operation state before continuing.';}
  this.#publish();
 }
 dispose():void{
  if(this.#disposed)return;this.#draft?.clear();this.#draft=null;this.#pending=null;this.#read?.abort();this.#bindTest();this.#disposed=true;this.#messages=[];this.#messageSeen.clear();
  for(const subscription of this.#subscriptions)subscription.dispose();this.#subscriptions=[];const panel=this.#panel;this.#panel=null;panel?.dispose();
 }
}
