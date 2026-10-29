/** Descriptor forms and dirty navigation only. No platform, persistence, driver or mutation I/O. */
import { Ajv } from 'ajv';
import type { ValidateFunction } from 'ajv';
import type { ConnectionKey, ConnectionScope, CredentialPatch, DriverDescriptor, SafeConnection } from '../connection-management.js';
import { parseConnectionKey, parseCredentialPatch } from '../connection-management-wire.js';
import { connectionReplyData, decodePublicConnectionPatch, decodeSafeConnection, PUBLIC_CONNECTION_FIELDS } from './wire.js';
import type { ClientDriverDescriptor } from './wire.js';

export class ConnectionDraftError extends Error {
 constructor(readonly code:'invalid-fields'|'read-only'|'fixed-identity'|'discarded') { super(code==='read-only'?'This connection requires a newer editor or has compatibility restrictions.':'Review the connection fields before continuing.'); }
}
export interface SerializedConnectionDraft {
 readonly key:ConnectionKey;readonly mode:'create'|'update';readonly expectedRevision?:string|undefined;
 readonly publicPatch:Readonly<Record<string,unknown>>;readonly credentials:Readonly<Record<string,CredentialPatch>>;
}
export type DraftNavigation =
 | {readonly type:'root';readonly repoRoot:string}
 | {readonly type:'row'|'remove';readonly key:ConnectionKey;readonly revision:string}
 | {readonly type:'filter';readonly value:'all'|'saved'|'temporary'}
 | {readonly type:'search';readonly value:string}
 | {readonly type:'scope';readonly value:ConnectionScope}
 | {readonly type:'kind';readonly value:string}
 | {readonly type:'close'};
export interface DraftNavigationEffect {readonly type:'navigate';readonly target:DraftNavigation}
export interface DraftView {
 readonly key:ConnectionKey;readonly kind:string;readonly family:DriverDescriptor['family'];readonly mode:'create'|'update';
 readonly draftRevision:number;readonly dirty:boolean;readonly readOnly:boolean;readonly guidance:string|null;
 readonly publicValues:Readonly<Record<string,unknown>>;readonly publicInputSchema:Readonly<Record<string,unknown>>;
 readonly credentials:readonly {readonly slot:string;readonly present:boolean;readonly action:CredentialPatch['action'];readonly masked:true;readonly format:'text'|'address-list'}[];
 readonly confirmDiscard:boolean;readonly discarded:boolean;
}
const ajv=new Ajv({strict:false,allErrors:false,useDefaults:false,removeAdditional:false,coerceTypes:false});
const guidance='This connection requires a newer editor or has compatibility restrictions.';
function fail():never {throw new ConnectionDraftError('invalid-fields');}
function data<T>(value:T):T {return connectionReplyData(value) as T;}
function freeze<T>(value:T):T {if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
/** Preserve the supported structure while allowing incomplete text/groups during editing. */
function editingSchema(schema:Readonly<Record<string,unknown>>):Record<string,unknown> {
 const result:Record<string,unknown>={};
 for(const [key,value]of Object.entries(schema)) {
  if(['required','minLength','minItems','pattern','minimum','maximum'].includes(key))continue;
  if(key==='properties')result[key]=Object.fromEntries(Object.entries(value as Record<string,Record<string,unknown>>).map(([k,v])=>[k,editingSchema(v)]));
  else if(key==='items')result[key]=editingSchema(value as Record<string,unknown>);
  else if(key==='anyOf')result[key]=(value as Record<string,unknown>[]).map(editingSchema);
  else result[key]=value;
 }
 return result;
}
function validators(descriptor:ClientDriverDescriptor):{full:ValidateFunction;editing:ValidateFunction}|null {
 if(!descriptor.editable)return null;
 const props=descriptor.publicInputSchema['properties'] as Record<string,unknown>;
 if(Object.keys(props).some(k=>!PUBLIC_CONNECTION_FIELDS.includes(k)))return null;
 const privateNames=new Set(['password','credentials','secretRef','runtimeAuth','capability','sessionHandle']);
 const supported=(schema:Record<string,unknown>):boolean=>{
  const properties=schema['properties'] as Record<string,Record<string,unknown>>|undefined;
  return (!properties||Object.entries(properties).every(([k,v])=>!privateNames.has(k)&&supported(v)))
   &&(!schema['items']||supported(schema['items'] as Record<string,unknown>))
   &&(!schema['anyOf']||(schema['anyOf'] as Record<string,unknown>[]).every(supported));
 };
 if(!supported(descriptor.publicInputSchema))return null;
 try{return {full:ajv.compile(descriptor.publicInputSchema),editing:ajv.compile(editingSchema(descriptor.publicInputSchema))};}catch{return null;}
}
export function connectionDriverChoices(descriptors:readonly ClientDriverDescriptor[]):readonly {kind:string;family:DriverDescriptor['family'];enabled:boolean;guidance:string|null}[] {
 return freeze(descriptors.map(d=>{const enabled=validators(d)!==null;return{kind:d.kind,family:d.family,enabled,guidance:enabled?null:guidance};}));
}
/** Reject obvious credential/reference routing while allowing an unfinished endpoint to be typed. */
function safeEditingFields(value:unknown):void {
 const walk=(v:unknown):void=>{
  if(typeof v==='string'){
   let decoded=v;
   for(let n=0;n<8;n++){
    if(decoded.includes('${secret:'))fail();
    let next:string;try{next=decodeURIComponent(decoded.replace(/%(?![0-9a-f]{2})/gi,'%25'));}catch{return fail();}
    if(next===decoded)return;decoded=next;
   }fail();
  }
  if(Array.isArray(v))v.forEach(walk);
  else if(v&&typeof v==='object')for(const [key,child]of Object.entries(v)){
   if(['password','credentials','secretRef','runtimeAuth','capability','sessionHandle'].includes(key))fail();walk(child);
  }
 };
 walk(value);
 const o=value as Record<string,unknown>,options=o['options'] as Record<string,unknown>|undefined;
 const endpoints=[o['endpoint'],options?.['endpoint'],...['servers','hosts'].flatMap(k=>Array.isArray(options?.[k])?options[k] as unknown[]:[])];
 for(const endpoint of endpoints)if(typeof endpoint==='string'){
  let decoded=endpoint;
  for(let n=0;n<8;n++){
   const authority=decoded.replace(/^[A-Za-z][A-Za-z0-9+.-]*:\/\//,'').split(/[/?#]/,1)[0]!;
   if(authority.includes('@')||/[?&](?:password|passwd|token|secret|api[_-]?key|access[_-]?key)=/i.test(decoded))fail();
   const next=decodeURIComponent(decoded.replace(/%(?![0-9a-f]{2})/gi,'%25'));if(next===decoded)break;decoded=next;
  }
 }
}
function schemaAt(schema:Readonly<Record<string,unknown>>,path:readonly string[]):Record<string,unknown> {
 let current=schema;
 for(const part of path){
  if(['__proto__','prototype','constructor'].includes(part))return fail();
  if(current['type']==='array'&&/^(0|[1-9]\d*)$/.test(part))current=current['items'] as Record<string,unknown>;
  else{const props=current['properties'] as Record<string,Record<string,unknown>>|undefined;if(!props||!Object.hasOwn(props,part))return fail();current=props[part]!;}
 }
 return current;
}
export class ConnectionDraft {
 #descriptor:ClientDriverDescriptor;#validators:ReturnType<typeof validators>;#key:ConnectionKey;#mode:'create'|'update';#revision:string|undefined;
 #family:DriverDescriptor['family'];#values:Record<string,unknown>;#baseline:Record<string,unknown>;#initialId:string;
 #credentials:Record<string,CredentialPatch>={};#presence:Readonly<Record<string,boolean>>={};#draftRevision=0;
 #readOnly=false;#discarded=false;#pending:DraftNavigation|null=null;
 constructor(descriptor:ClientDriverDescriptor,key:ConnectionKey,current?:SafeConnection) {
  this.#descriptor=freeze(data(descriptor));this.#validators=validators(this.#descriptor);this.#key=data(key);this.#mode=current?'update':'create';
  this.#family=descriptor.family;this.#initialId=key.id;
  if(current){
   const safe=decodeSafeConnection(current,{key});this.#family=safe.effectiveFamily;this.#revision=safe.revision;this.#presence=freeze(data(safe.credentialPresence));
   this.#values={...data(safe.publicConfig),kind:safe.kind};
   this.#readOnly=safe.readOnly===true||safe.kind!==descriptor.kind;
  }else this.#values={kind:descriptor.kind};
  this.#baseline=data(this.#values);this.#readOnly ||= !this.#validators||!this.#validators.editing(this.#values);
  for(const slot of descriptor.secretSlots)this.#credentials[slot]={action:'keep'};
 }
 get view():DraftView {
  return freeze({key:data(this.#key),kind:this.#descriptor.kind,family:this.#family,mode:this.#mode,draftRevision:this.#draftRevision,
   dirty:this.dirty,readOnly:this.#readOnly,guidance:this.#readOnly?guidance:null,publicValues:data(this.#values),publicInputSchema:data(this.#descriptor.publicInputSchema),
   credentials:this.#descriptor.secretSlots.map(slot=>({slot,present:this.#presence[slot]===true,action:this.#credentials[slot]?.action??'keep',masked:true as const,format:['options.servers','options.hosts'].includes(slot)?'address-list' as const:'text' as const})),confirmDiscard:this.#pending!==null,discarded:this.#discarded});
 }
 get dirty():boolean {return !this.#discarded&&(this.#key.id!==this.#initialId||JSON.stringify(this.#values)!==JSON.stringify(this.#baseline)||Object.values(this.#credentials).some(c=>c.action!=='keep'));}
 #editable():void {if(this.#discarded)throw new ConnectionDraftError('discarded');if(this.#readOnly)throw new ConnectionDraftError('read-only');if(this.#pending)throw new ConnectionDraftError('invalid-fields');if(this.#draftRevision>=Number.MAX_SAFE_INTEGER)fail();}
 setId(id:string):void {this.#editable();if(this.#mode==='update')throw new ConnectionDraftError('fixed-identity');if(typeof id!=='string'||id.length>16384||/[\u0000-\u001f]/.test(id))fail();this.#key={...this.#key,id};this.#draftRevision++;}
 setField(path:readonly string[],value:unknown):void {
  this.#editable();if(!path.length||path.length>32||['id','kind','scope','family','effectiveFamily'].includes(path[0]!))throw new ConnectionDraftError('fixed-identity');
  schemaAt(this.#descriptor.publicInputSchema,path);
  const next=data(this.#values);let target:Record<string,unknown>|unknown[]=next;
  for(let i=0;i<path.length-1;i++){
   const part=path[i]!,following=path[i+1]!;let child=(target as Record<string,unknown>)[part];
   if(child===undefined){child=/^(0|[1-9]\d*)$/.test(following)?[]:{};(target as Record<string,unknown>)[part]=child;}
   if(!child||typeof child!=='object')fail();target=child as Record<string,unknown>;
  }
  (target as Record<string,unknown>)[path.at(-1)!]=data(value);
  // Structural typing prevents a raw options/JSON escape hatch; full required/range validation waits for serialize.
  const checked=data(next);
  if(!this.#validators!.editing(checked))fail();safeEditingFields(checked);this.#values=checked;this.#draftRevision++;
 }
 setCredential(slot:string,action:CredentialPatch['action'],replacement?:string):void {
  this.#editable();if(!this.#descriptor.secretSlots.includes(slot))fail();
  const patch=action==='replace'?{action,value:replacement??''}:{action};
  const safe=parseCredentialPatch(data(patch));
  if(safe.action==='replace'&&(safe.value.length>16384||safe.value.includes('${secret:')))fail();
  this.#credentials[slot]=safe;this.#draftRevision++;
 }
 setCredentialAddresses(slot:string,values:readonly string[]):void {
  if(!['options.servers','options.hosts'].includes(slot)||!values.length||values.length>1024||values.some(v=>typeof v!=='string'||!v||v.length>16384))fail();
  this.setCredential(slot,'replace',JSON.stringify(data(values)));
 }
 /** Reset means omit on create and Keep the original public value on edit, never delete stored fields. */
 resetField(path:readonly string[]):void {
  this.#editable();if(!path.length||path.some(p=>/^(0|[1-9]\d*)$/.test(p))||['id','kind','scope','family','effectiveFamily'].includes(path[0]!))throw new ConnectionDraftError('fixed-identity');
  schemaAt(this.#descriptor.publicInputSchema,path);
  const next=data(this.#values);let target=next;let baseline:unknown=this.#baseline;
  for(const part of path.slice(0,-1)){
   if(!target[part]||typeof target[part]!=='object'||Array.isArray(target[part])){this.#draftRevision++;return;}
   target=target[part] as Record<string,unknown>;baseline=baseline&&typeof baseline==='object'?(baseline as Record<string,unknown>)[part]:undefined;
  }
  const leaf=path.at(-1)!;
  if(baseline&&typeof baseline==='object'&&Object.hasOwn(baseline,leaf))target[leaf]=data((baseline as Record<string,unknown>)[leaf]);else delete target[leaf];
  this.#values=next;this.#draftRevision++;
 }
 serialize():SerializedConnectionDraft {
  this.#editable();
  try {
   const key=parseConnectionKey(data(this.#key));
   if(!this.#validators!.full(this.#values))return fail();
   safeEditingFields(this.#values);const publicPatch=decodePublicConnectionPatch(this.#values);
   const credentials=data(this.#credentials);
   for(const patch of Object.values(credentials))if(patch.action==='replace'&&!patch.value.length)return fail();
   return freeze({key,mode:this.#mode,...(this.#revision?{expectedRevision:this.#revision}:{}),publicPatch,credentials});
  }catch(error){if(error instanceof ConnectionDraftError)throw error;return fail();}
 }
 requestExit(target:DraftNavigation):readonly DraftNavigationEffect[] {
  if(this.#discarded)throw new ConnectionDraftError('discarded');
  if(this.#pending)return [];
  const captured=freeze(data(target));if(this.dirty){this.#pending=captured;return [];}
  return freeze([{type:'navigate',target:captured}]);
 }
 decideDiscard(decision:'discard'|'cancel'):readonly DraftNavigationEffect[] {
  if(!['discard','cancel'].includes(decision))return fail();
  const target=this.#pending;if(!target)return [];this.#pending=null;
  if(decision==='cancel')return [];
  this.clear();return freeze([{type:'navigate',target}]);
 }
 /** Erases unsaved inputs. This never deletes/discards an existing registered connection. */
 clear():void {if(this.#discarded)return;this.#values={};this.#baseline={};this.#credentials={};this.#presence={};this.#pending=null;this.#discarded=true;this.#draftRevision++;}
}
