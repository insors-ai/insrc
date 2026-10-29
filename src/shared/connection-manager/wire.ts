/** Consumer-only v2 reply boundary. No daemon, driver, storage or provider runtime imports. */
import type { CommittedOutcome, ConnectionKey, DraftTestResult, DriverDescriptor, ManagementCapabilities, ManagementErrorCode, MutationOutcome, OperationStatus, OperationTicket, RemovalState, SafeConnection } from '../connection-management.js';
import { managementHandshake, parseConnectionKey, parseDraftTestResult, parseOperationTicket } from '../connection-management-wire.js';

export const CONNECTION_REPLY_LIMITS = Object.freeze({ bytes: 16 * 1024 * 1024, depth: 32, nodes: 131072, string: 16384, items: 16384 });
export class ConnectionReplyError extends Error {
 readonly code = 'invalid-response';
 constructor() { super('The daemon returned an invalid connection response.'); this.name = 'ConnectionReplyError'; }
}
const fail = (): never => { throw new ConnectionReplyError(); };
type RecordValue = Record<string, unknown>;
/** Copy data descriptors only, before shared parsers read values. No getters/toJSON/coercion. */
export function connectionReplyData(value: unknown): unknown {
 let bytes = 0, nodes = 0;
 const active = new Set<object>();
 const add = (n: number) => { bytes += n; if (bytes > CONNECTION_REPLY_LIMITS.bytes) fail(); };
 const visit = (v: unknown, depth: number): unknown => {
  if (++nodes > CONNECTION_REPLY_LIMITS.nodes || depth > CONNECTION_REPLY_LIMITS.depth) fail();
  if (typeof v === 'string') { if (v.length > CONNECTION_REPLY_LIMITS.string) fail(); add(new TextEncoder().encode(JSON.stringify(v)).length); return v; }
  if (v === null || typeof v === 'boolean' || typeof v === 'number' && Number.isFinite(v)) { add(String(v).length); return v; }
  if (typeof v !== 'object' || active.has(v)) return fail();
  const array = Array.isArray(v);
  if (Object.getPrototypeOf(v) !== (array ? Array.prototype : Object.prototype)) fail();
  active.add(v); add(2);
  const descriptors = Object.getOwnPropertyDescriptors(v), keys = Reflect.ownKeys(descriptors);
  const result: unknown[] | RecordValue = array ? [] : {};
  if (keys.length > CONNECTION_REPLY_LIMITS.items + (array ? 1 : 0)) fail();
  if (array && ((v as unknown[]).length > CONNECTION_REPLY_LIMITS.items || keys.length !== (v as unknown[]).length + 1)) fail();
  for (const key of keys) {
   if (typeof key !== 'string' || key.length > CONNECTION_REPLY_LIMITS.string) return fail();
   const d = descriptors[key]!;
   if (array && key === 'length') continue;
   if (!d.enumerable || !Object.hasOwn(d, 'value') || ['__proto__', 'prototype', 'constructor'].includes(key)) fail();
   if (array && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= (v as unknown[]).length)) fail();
   add(new TextEncoder().encode(JSON.stringify(key)).length + 2);
   const item = visit(d.value, depth + 1);
   if (array) (result as unknown[])[Number(key)] = item; else (result as RecordValue)[key] = item;
  }
  active.delete(v); return result;
 };
 try { return visit(value, 0); } catch { return fail(); }
}
function object(value: unknown): RecordValue { if (!value || typeof value !== 'object' || Array.isArray(value)) return fail(); return value as RecordValue; }
function fields(o: RecordValue, required: readonly string[], optional: readonly string[] = []): void {
 if (required.some(k => !Object.hasOwn(o,k)) || Object.keys(o).some(k => !required.includes(k) && !optional.includes(k))) fail();
}
function text(v: unknown, empty = false): asserts v is string { if (typeof v !== 'string' || (!empty && !v) || /[\u0000-\u001f]/.test(v)) fail(); }
function uuid(v: unknown): asserts v is string { text(v); if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)) fail(); }
function oneOf(v: unknown, allowed: readonly unknown[]): void { if (!allowed.includes(v)) fail(); }
const families = ['rdbms','kv','file'];
const cleanup = ['complete','pending'];
const errors: readonly ManagementErrorCode[] = ['invalid-input','duplicate-id','conflict','not-found','busy','registry-unreadable','secret-unavailable','recovery-required','session-expired','upgrade-required','operation-mismatch','reconciliation-required','resource-limit','unsupported-temporary'];
export interface ReplyExpectation { readonly key?: ConnectionKey | undefined; readonly operationId?: string | undefined; readonly daemonEpoch?: string | undefined; readonly mode?: OperationTicket['mode'] | undefined }
function key(value: unknown, expected?: ConnectionKey): ConnectionKey {
 try { const k = parseConnectionKey(value); if (expected && (k.repoRoot !== expected.repoRoot || k.scope !== expected.scope || k.id !== expected.id)) fail(); return k; } catch { return fail(); }
}
function id(value: unknown, expected?: string): void { uuid(value); if (expected !== undefined && value !== expected) fail(); }
function decode<T>(value: unknown, check: (copy: unknown) => T): T { try { return check(connectionReplyData(value)); } catch { return fail(); } }

export function decodeManagementCapabilities(value: unknown, expectedEpoch?: string): ManagementCapabilities {
 return decode(value, copy => { const result = managementHandshake(copy); if (result.status !== 'ready' || (expectedEpoch !== undefined && result.capabilities.daemonEpoch !== expectedEpoch)) return fail(); return result.capabilities; });
}

/** Unsupported schema is retained as a disabled descriptor, never materialized as arbitrary inputs. */
export interface ClientDriverDescriptor extends DriverDescriptor { readonly editable: boolean; readonly unsupportedReason?: string | undefined }
const schemaKeys = ['type','properties','required','additionalProperties','items','minItems','maxItems','minLength','maxLength','pattern','minimum','maximum','enum','const','anyOf'];
function supportedSchema(value: unknown): boolean {
 const o = object(value);
 if (Object.keys(o).some(k => !schemaKeys.includes(k))) return false;
 if (o['type'] !== undefined && !['object','array','string','boolean','number','integer'].includes(o['type'] as string)) return false;
 for (const k of ['minItems','maxItems','minLength','maxLength','minimum','maximum']) if (o[k] !== undefined && (typeof o[k] !== 'number' || !Number.isFinite(o[k]))) return false;
 for (const k of ['minItems','maxItems','minLength','maxLength']) if (o[k] !== undefined && (!Number.isSafeInteger(o[k]) || (o[k] as number) < 0)) return false;
 if (o['pattern'] !== undefined && typeof o['pattern'] !== 'string') return false;
 if (o['enum'] !== undefined && (!Array.isArray(o['enum']) || !o['enum'].length || o['enum'].some(v => v !== null && !['string','boolean','number'].includes(typeof v)))) return false;
 if (o['const'] !== undefined && o['const'] !== null && !['string','boolean','number'].includes(typeof o['const'])) return false;
 if (o['anyOf'] !== undefined && (!Array.isArray(o['anyOf']) || !o['anyOf'].length || !o['anyOf'].every(supportedSchema))) return false;
 if (o['type'] === 'object') {
  if (o['additionalProperties'] !== false || !o['properties'] || !Array.isArray(o['required'])) return false;
  const props = object(o['properties']);
  if (o['required'].some(v => typeof v !== 'string' || !Object.hasOwn(props,v)) || !Object.values(props).every(supportedSchema)) return false;
 } else if (o['properties'] !== undefined || o['required'] !== undefined || o['additionalProperties'] !== undefined) return false;
 if (o['type'] === 'array' && (!o['items'] || !supportedSchema(o['items']))) return false;
 if (o['type'] !== 'array' && o['items'] !== undefined) return false;
 return o['type'] !== undefined || o['enum'] !== undefined || Object.hasOwn(o,'const') || o['anyOf'] !== undefined;
}
export function decodeDriverDescriptors(value: unknown): readonly ClientDriverDescriptor[] {
 return decode(value, copy => {
  if (!Array.isArray(copy)) return fail();
  const seen = new Set<string>();
  return copy.map(v => {
   const o = object(v); fields(o,['kind','family','publicInputSchema','secretSlots']); text(o['kind']); oneOf(o['family'],families); object(o['publicInputSchema']);
   if (seen.has(o['kind']) || !Array.isArray(o['secretSlots']) || new Set(o['secretSlots']).size !== o['secretSlots'].length) return fail();
   seen.add(o['kind']); for (const slot of o['secretSlots']) { text(slot); if (!/^(url|options)\.[a-zA-Z][a-zA-Z0-9]*$/.test(slot)) fail(); }
   const schema=object(o['publicInputSchema']);
   const props=schema['properties'];
   const kindSchema=props&&typeof props==='object'&&!Array.isArray(props)?(props as RecordValue)['kind']:undefined;
   const editable = supportedSchema(schema) && schema['type']==='object' && !!kindSchema && typeof kindSchema==='object' && !Array.isArray(kindSchema) && (kindSchema as RecordValue)['const']===o['kind'];
   return { ...(o as unknown as DriverDescriptor), editable, ...(!editable ? {unsupportedReason:'This driver requires a newer connection editor.'} : {}) };
  });
 });
}
function safePublicFields(value: unknown): void {
 const config=object(value);
 if(Object.keys(config).some(k=>!['kind','label','endpoint','path','schemaSource','namespace','pii','options','recursive','partitioning'].includes(k)))fail();
 const walk=(v:unknown):void=>{
  if(typeof v==='string'){
   let decoded=v;
   for(let n=0;n<8;n++){
    if(decoded.includes('${secret:'))fail();
    let next:string;try{next=decodeURIComponent(decoded.replace(/%(?![0-9a-f]{2})/gi,'%25'));}catch{return fail();}
    if(next===decoded)return;decoded=next;
   }
   fail();
  }
  if(Array.isArray(v)){v.forEach(walk);return;}
  if(v&&typeof v==='object')for(const [k,child]of Object.entries(v)){
   if(['secretRef','password','credentials','capability','sessionHandle','runtimeAuth'].includes(k))fail();
   if(k==='endpoint'&&typeof child==='string'){try{const url=new URL(child);if(url.username||url.password)fail();}catch{return fail();}}
   walk(child);
  }
 };
 walk(config);
}
function safeRead(value: unknown, expected: ReplyExpectation): SafeConnection {
 const o = object(value); fields(o,['key','revision','kind','family','effectiveFamily','publicConfig','credentialPresence'],['label','declaredFamily','registeredFamily','compatibilityWarning','readOnly','hasUrl','hasPath','ephemeral']);
 key(o['key'], expected.key); uuid(o['revision']); text(o['kind']); oneOf(o['family'],families); oneOf(o['effectiveFamily'],families);
 if (o['family'] !== o['effectiveFamily']) fail();
 for (const k of ['declaredFamily','registeredFamily']) if (o[k] !== undefined) oneOf(o[k],families);
 if (o['label'] !== undefined) text(o['label'], true);
 if (o['compatibilityWarning'] !== undefined) { text(o['compatibilityWarning']); o['compatibilityWarning']='This legacy connection has compatibility restrictions; its stored configuration is preserved.'; }
 for (const k of ['readOnly','hasUrl','hasPath']) if (o[k] !== undefined && typeof o[k] !== 'boolean') fail();
 if (o['ephemeral'] !== undefined && o['ephemeral'] !== true) fail();
 safePublicFields(o['publicConfig']); const presence = object(o['credentialPresence']);
 if(Object.entries(presence).some(([k,v])=>!/^(url|options)\.[a-zA-Z][a-zA-Z0-9]*$/.test(k)||typeof v !== 'boolean')) fail();
 return o as unknown as SafeConnection;
}
export function decodeSafeConnection(value: unknown, expected: ReplyExpectation = {}): SafeConnection { return decode(value, copy => safeRead(copy,expected)); }
export function decodeSafeConnectionList(value: unknown, repoRoot: string): readonly SafeConnection[] {
 return decode(value, copy => {
  if (!Array.isArray(copy)) return fail(); const seen = new Set<string>();
  return copy.map(v => { const result = safeRead(v,{}); if (result.key.repoRoot !== repoRoot) fail(); const k = `${result.key.scope}:${result.key.id}`; if (seen.has(k)) fail(); seen.add(k); return result; });
 });
}
export function decodeOperationTicket(value: unknown, expected: ReplyExpectation = {}): OperationTicket {
 return decode(value, copy => {
  const ticket = parseOperationTicket(copy); id(ticket.operationId, expected.operationId);
  key({repoRoot:ticket.lookupRoot,scope:ticket.scope,id:ticket.connectionId},expected.key);
  if (expected.mode !== undefined && ticket.mode !== expected.mode) fail();
  if (!/^[A-Za-z0-9_-]{43}$/.test(ticket.signature)) fail(); return ticket;
 });
}
function committed(value: unknown, expected: ReplyExpectation): CommittedOutcome {
 const o=object(value); fields(o,['operationId','revision','registration','activation','credentialCleanup']); id(o['operationId'],expected.operationId); uuid(o['revision']);
 oneOf(o['registration'],['persisted','session-added','removed']); oneOf(o['activation'],['active','pending','failed','not-applicable']); oneOf(o['credentialCleanup'],cleanup);
 if ((o['registration']==='removed') !== (o['activation']==='not-applicable')) fail();
 if (expected.mode !== undefined && (expected.mode==='remove') !== (o['registration']==='removed')) fail();
 if (expected.key && o['registration'] !== 'removed' && o['registration'] !== (expected.key.scope==='saved'?'persisted':'session-added')) fail();
 return o as unknown as CommittedOutcome;
}
export function decodeMutationOutcome(value: unknown, expected: ReplyExpectation = {}): MutationOutcome {
 return decode(value, copy => {
  const o=object(copy);
  if(o['status']==='committed'){fields(o,['status','value']);return {status:'committed',value:committed(o['value'],expected)};}
  fields(o,['status','code','message']); if(o['status']!=='rejected')return fail();oneOf(o['code'],errors);text(o['message']);
  return {status:'rejected',code:o['code'] as ManagementErrorCode,message:'The connection operation was rejected. Review its status before retrying.'};
 });
}
export function decodeOperationStatus(value: unknown, expected: ReplyExpectation = {}): OperationStatus {
 return decode(value, copy => {const o=object(copy);if(o['status']==='committed'){fields(o,['status','value']);return {status:'committed',value:committed(o['value'],expected)};}fields(o,['status']);oneOf(o['status'],['pending','not-seen','reconciliation-required']);return o as unknown as OperationStatus;});
}
export function decodeDraftTestResult(value: unknown, expected: ReplyExpectation & {readonly requestId?: string; readonly draftRevision?: number} = {}): DraftTestResult {
 return decode(value, copy => {const result=parseDraftTestResult(copy);if(expected.daemonEpoch!==undefined&&result.daemonEpoch!==expected.daemonEpoch||expected.key&&result.repoRoot!==expected.key.repoRoot||expected.requestId!==undefined&&result.requestId!==expected.requestId||expected.draftRevision!==undefined&&result.draftRevision!==expected.draftRevision)fail();return result;});
}
export function decodeRemovalState(value: unknown, expected: ReplyExpectation = {}): RemovalState {
 return decode(value, copy => {
  const o=object(copy);fields(o,['key','operationId','state'],['safeMessage','credentialCleanup','resourceCleanup']);key(o['key'],expected.key);id(o['operationId'],expected.operationId);
  oneOf(o['state'],['confirming','removing','busy','conflict','unknown','removed-cleanup-pending','removed']);
  if(o['safeMessage']!==undefined)text(o['safeMessage']);
  const removed=o['state']==='removed'||o['state']==='removed-cleanup-pending';
  if(removed){oneOf(o['credentialCleanup'],cleanup);oneOf(o['resourceCleanup'],cleanup);if((o['state']==='removed')!==(o['credentialCleanup']==='complete'&&o['resourceCleanup']==='complete'))fail();}
  else if(o['credentialCleanup']!==undefined||o['resourceCleanup']!==undefined)fail();
  // Discard arbitrary transport/SDK copy; UI selects fixed local messages from safe state/code.
  delete o['safeMessage'];return o as unknown as RemovalState;
 });
}
