/** Structural wire validation only. Signature, registry rights and driver fields are daemon gates. */
import type { ConnectionKey, CredentialPatch, MutationRequest, OperationTicket, DraftTestRequest, DraftTestResult, TestCancellation } from './connection-management.js';

export class ManagementInputError extends Error {
 readonly code: 'invalid-input' | 'operation-mismatch';
 constructor(code: 'invalid-input' | 'operation-mismatch' = 'invalid-input') {
  super(code === 'invalid-input' ? 'Invalid connection request.' : 'Operation target does not match its ticket.');
  this.name = 'ManagementInputError'; this.code = code;
 }
}
function object(value: unknown): Record<string, unknown> {
 if (value === null || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new ManagementInputError();
 return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): void {
 if (required.some(k => !Object.hasOwn(value, k)) || Object.keys(value).some(k => !required.includes(k) && !optional.includes(k))) throw new ManagementInputError();
}
function text(value: unknown): asserts value is string {
 if (typeof value !== 'string' || value.length === 0 || value.length > 16384 || /[\u0000-\u001f]/.test(value)) throw new ManagementInputError();
}
function scope(value: unknown): void { if (value !== 'saved' && value !== 'temporary') throw new ManagementInputError(); }
function mode(value: unknown): void { if (typeof value !== 'string' || !['create','update','remove'].includes(value)) throw new ManagementInputError(); }
export const DRAFT_TEST_MAX_BYTES = 256 * 1024;
export function assertDraftTestUuid(value: unknown): asserts value is string {
 if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new ManagementInputError();
}
/** Only JSON values cross either test boundary. Reject lossy coercion and excessive nesting. */
export function assertDraftTestJson(value: unknown): void {
 let bytes = 0;
 const add = (n: number) => { bytes += n; if (bytes > DRAFT_TEST_MAX_BYTES) throw new ManagementInputError(); };
 const string = (s: string) => {
  add(2);
  for (let i = 0; i < s.length; i++) {
   const c = s.charCodeAt(i);
   if (c === 34 || c === 92) add(2);
   else if (c < 32) add([8,9,10,12,13].includes(c) ? 2 : 6);
   else if (c < 128) add(1);
   else if (c < 2048) add(2);
   else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length && s.charCodeAt(i+1) >= 0xdc00 && s.charCodeAt(i+1) <= 0xdfff) { add(4); i++; }
   else add(c >= 0xd800 && c <= 0xdfff ? 6 : 3);
  }
 };
 const active = new Set<object>();
 const walk = (v: unknown, depth: number): void => {
  if (depth > 64) throw new ManagementInputError();
  if (v === null) { add(4); return; }
  if (typeof v === 'string') { string(v); return; }
  if (typeof v === 'boolean') { add(v ? 4 : 5); return; }
  if (typeof v === 'number' && Number.isFinite(v)) { add(String(v).length); return; }
  if (typeof v !== 'object' || active.has(v)) throw new ManagementInputError();
  active.add(v); add(2);
  if (Array.isArray(v)) {
   for (let i=0; i<v.length; i++) { if (i) add(1); if (!Object.hasOwn(v,i)) throw new ManagementInputError(); walk(v[i],depth+1); }
  } else {
   const o = object(v); let first = true;
   for (const k of Object.keys(o)) { if (!first) add(1); first=false; string(k); add(1); walk(o[k],depth+1); }
  }
  active.delete(v);
 };
 walk(value,0);
}
export function parseDraftTestRequest(value: unknown): DraftTestRequest {
 assertDraftTestJson(value);
 const o = object(value); keys(o,['requestId','draftRevision','key','publicPatch','credentials'],['expectedRevision']);
 assertDraftTestUuid(o['requestId']); parseConnectionKey(o['key']);
 if (!Number.isSafeInteger(o['draftRevision']) || (o['draftRevision'] as number) < 0) throw new ManagementInputError();
 if (Object.hasOwn(o,'expectedRevision')) assertDraftTestUuid(o['expectedRevision']);
 object(o['publicPatch']); assertNoRuntimeAuth(o['publicPatch']);
 for (const patch of Object.values(object(o['credentials']))) parseCredentialPatch(patch);
 return value as DraftTestRequest;
}
/** Runtime credentials have one private IPC slot, never a public/config field. Call after JSON validation. */
export function assertNoRuntimeAuth(value: unknown): void {
 if (value && typeof value === 'object') {
  if (Object.hasOwn(value,'runtimeAuth')) throw new ManagementInputError();
  for (const child of Object.values(value)) assertNoRuntimeAuth(child);
 }
}
export function parseTestCancellation(value: unknown): TestCancellation {
 assertDraftTestJson(value); const o=object(value); keys(o,['requestId']); assertDraftTestUuid(o['requestId']); return value as TestCancellation;
}
export const DRAFT_TEST_MESSAGES = {
 failed: 'Connection test failed.', timeout: 'Connection test timed out. Retry when cleanup completes.',
 canceled: 'Connection test canceled.', 'resource-limit': 'Connection test exceeded the memory limit. Use a smaller input or a saved connection.',
 'unsupported-temporary': 'This input cannot be tested without persistent storage. Use a saved connection.'
} as const;
export function parseDraftTestResult(value: unknown): DraftTestResult {
 assertDraftTestJson(value); const o=object(value); keys(o,['requestId','draftRevision','repoRoot','daemonEpoch','status','tookMs'],['safeMessage']);
 assertDraftTestUuid(o['requestId']); text(o['repoRoot']); text(o['daemonEpoch']);
 if (!Number.isSafeInteger(o['draftRevision']) || (o['draftRevision'] as number)<0 || typeof o['tookMs'] !== 'number' || !Number.isFinite(o['tookMs']) || o['tookMs']<0 || !['reachable','failed','timeout','canceled'].includes(o['status'] as string)) throw new ManagementInputError();
 const messages: readonly string[] = Object.values(DRAFT_TEST_MESSAGES);
 if (Object.hasOwn(o,'safeMessage') && (typeof o['safeMessage'] !== 'string' || !messages.includes(o['safeMessage']) || o['status']==='reachable')) throw new ManagementInputError();
 return value as DraftTestResult;
}
export function parseConnectionKey(value: unknown): ConnectionKey {
 const o = object(value); keys(o, ['repoRoot','scope','id']); text(o['repoRoot']); text(o['id']); scope(o['scope']);
 return value as ConnectionKey;
}
export function parseOperationTicket(value: unknown): OperationTicket {
 const o = object(value); keys(o, ['operationId','lookupRoot','scope','connectionId','mode','issuedAt','expiresAt','signature']);
 for (const k of ['operationId','lookupRoot','connectionId','issuedAt','expiresAt','signature']) text(o[k]);
 if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(o['operationId'] as string)) throw new ManagementInputError();
 scope(o['scope']); mode(o['mode']);
 for (const k of ['issuedAt','expiresAt']) {
  const stamp = o[k] as string;
  if (!Number.isFinite(Date.parse(stamp)) || new Date(stamp).toISOString() !== stamp) throw new ManagementInputError();
 }
 if (Date.parse(o['expiresAt'] as string) <= Date.parse(o['issuedAt'] as string)) throw new ManagementInputError();
 return value as OperationTicket;
}
export function parseCredentialPatch(value: unknown): CredentialPatch {
 const o = object(value);
 if (o['action'] === 'replace') { keys(o, ['action','value']); if (typeof o['value'] !== 'string') throw new ManagementInputError(); }
 else { keys(o, ['action']); if (o['action'] !== 'keep' && o['action'] !== 'clear') throw new ManagementInputError(); }
 return value as CredentialPatch;
}
export function assertTicketTarget(ticket: OperationTicket, key: ConnectionKey, requestMode: OperationTicket['mode'], operationId: string): void {
 if (ticket.operationId !== operationId || ticket.lookupRoot !== key.repoRoot || ticket.scope !== key.scope || ticket.connectionId !== key.id || ticket.mode !== requestMode) throw new ManagementInputError('operation-mismatch');
}
export function parseMutationRequest(value: unknown): MutationRequest {
 const o = object(value); keys(o, ['ticket','operationId','key','mode'], ['expectedRevision','publicPatch','credentials']);
 const ticket = parseOperationTicket(o['ticket']); const key = parseConnectionKey(o['key']); text(o['operationId']); mode(o['mode']);
 if (o['mode'] !== 'create') text(o['expectedRevision']);
 else if (Object.hasOwn(o,'expectedRevision')) throw new ManagementInputError();
 if (o['publicPatch'] !== undefined) object(o['publicPatch']);
 if (o['credentials'] !== undefined) for (const patch of Object.values(object(o['credentials']))) parseCredentialPatch(patch);
 if (o['mode'] === 'remove' && (o['publicPatch'] !== undefined || o['credentials'] !== undefined)) throw new ManagementInputError();
 assertTicketTarget(ticket, key, o['mode'] as OperationTicket['mode'], o['operationId']);
 return value as MutationRequest;
}

/** Safe structural-error projection for v2 adapters; never forwards arbitrary exception text. */
export function rejectManagementInput(error: unknown): import('./connection-management.js').MutationOutcome {
 const safe = new ManagementInputError(error instanceof ManagementInputError && error.code === 'operation-mismatch' ? 'operation-mismatch' : 'invalid-input');
 return { status:'rejected', code:safe.code, message:safe.code === 'operation-mismatch' ? 'Operation target does not match its ticket.' : 'Invalid connection request.' };
}

/** New clients map an old/unknown-method or malformed handshake to one fixed upgrade result. */
export function managementHandshake(value: unknown): { readonly status: 'ready'; readonly capabilities: import('./connection-management.js').ManagementCapabilities }
 | { readonly status: 'rejected'; readonly code: 'upgrade-required'; readonly message: string } {
 try {
  const result = object(value); keys(result, ['version', 'daemonEpoch', 'features', 'receiptRetentionDays']);
  text(result['daemonEpoch']);
  const features = result['features'];
  if (result['version'] !== 2 || result['receiptRetentionDays'] !== 30 || !Array.isArray(features)
   || features.some(feature => typeof feature !== 'string' || !/^[a-z][a-z0-9-]{1,64}$/.test(feature))
   || new Set(features).size !== features.length) throw new ManagementInputError();
  return { status: 'ready', capabilities: value as import('./connection-management.js').ManagementCapabilities };
 } catch { return { status: 'rejected', code: 'upgrade-required', message: 'Connection management requires a newer daemon.' }; }
}
