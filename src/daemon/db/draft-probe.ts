/** S002-only operations and private IPC. No public driver or factory contract changes. */
import type { ConnectionConfig } from '../../shared/db-driver.js';
import { assertDraftTestJson, assertDraftTestUuid, assertNoRuntimeAuth, ManagementInputError } from '../../shared/connection-management-wire.js';

export interface DraftProbe { probeReachability(): Promise<void>; close(): Promise<void> }
export interface DynamoRuntimeAuth {
	readonly type: 'aws-v1'; readonly accessKeyId: string; readonly secretAccessKey: string;
	readonly sessionToken?: string | undefined; readonly expiration?: string | undefined;
}
export interface ProbeWorkerStart {
	readonly type: 'start'; readonly requestId: string; readonly nonce: string;
	readonly lookupRoot: string; readonly config: ConnectionConfig; readonly runtimeAuth?: DynamoRuntimeAuth | undefined;
}
export interface ProbeWorkerCancel { readonly type: 'cancel'; readonly requestId: string; readonly nonce: string }
export type ProbeWorkerCode = 'reachable' | 'failed' | 'resource-limit' | 'unsupported-temporary';
export interface ProbeWorkerResult { readonly type: 'result'; readonly requestId: string; readonly nonce: string; readonly code: ProbeWorkerCode }

function record(value: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
	if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new ManagementInputError();
	const o = value as Record<string, unknown>;
	if (required.some(key => !Object.hasOwn(o, key)) || Object.keys(o).some(key => !required.includes(key) && !optional.includes(key))) throw new ManagementInputError();
	return o;
}
function text(value: unknown): asserts value is string {
	if (typeof value !== 'string' || !value.length || value.length > 16384 || /[\u0000-\u001f]/.test(value)) throw new ManagementInputError();
}
function identity(o: Record<string, unknown>): void {
	assertDraftTestUuid(o['requestId']);
	if (typeof o['nonce'] !== 'string' || !/^[0-9a-f]{64}$/.test(o['nonce'])) throw new ManagementInputError();
}
export function parseDynamoRuntimeAuth(value: unknown): DynamoRuntimeAuth {
	const o = record(value, ['type','accessKeyId','secretAccessKey'], ['sessionToken','expiration']);
	if (o['type'] !== 'aws-v1') throw new ManagementInputError();
	text(o['accessKeyId']); text(o['secretAccessKey']);
	if (Object.hasOwn(o,'sessionToken')) text(o['sessionToken']);
	if (Object.hasOwn(o,'expiration')) {
		text(o['expiration']);
		if (!Number.isFinite(Date.parse(o['expiration'])) || new Date(o['expiration']).toISOString() !== o['expiration']) throw new ManagementInputError();
	}
	return value as DynamoRuntimeAuth;
}
export function parseProbeWorkerStart(value: unknown): ProbeWorkerStart {
	assertDraftTestJson(value);
	const o = record(value, ['type','requestId','nonce','lookupRoot','config'], ['runtimeAuth']);
	if (o['type'] !== 'start') throw new ManagementInputError();
	identity(o); text(o['lookupRoot']);
	const c = record(o['config'], ['id','kind'], ['family','label','url','path','schemaSource','namespace','pii','options','recursive','partitioning']);
	assertNoRuntimeAuth(c);
	text(c['id']); text(c['kind']);
	for (const name of ['label','url','path']) if (Object.hasOwn(c,name)) text(c[name]);
	if (c['family'] !== undefined && !['rdbms','kv','file'].includes(c['family'] as string)) throw new ManagementInputError();
	if (Object.hasOwn(c,'recursive') && typeof c['recursive'] !== 'boolean') throw new ManagementInputError();
	if (Object.hasOwn(c,'partitioning') && c['partitioning'] !== 'hive' && c['partitioning'] !== 'none') throw new ManagementInputError();
	if (Object.hasOwn(c,'options')) record(c['options'], [], Object.keys(c['options'] as object ?? {}));
	if (Object.hasOwn(c,'pii') && (!Array.isArray(c['pii']) || c['pii'].some(v => typeof v !== 'string'))) throw new ManagementInputError();
	if (Object.hasOwn(c,'schemaSource')) { const s=record(c['schemaSource'],['type','path']); if(s['type']!=='prisma') throw new ManagementInputError(); text(s['path']); }
	if (Object.hasOwn(c,'namespace')) { const n=record(c['namespace'],['allow']); if(!Array.isArray(n['allow']) || n['allow'].some(v=>typeof v!=='string')) throw new ManagementInputError(); }
	if (c['kind']==='dynamodb') parseDynamoRuntimeAuth(o['runtimeAuth']);
	else if (Object.hasOwn(o,'runtimeAuth')) throw new ManagementInputError();
	return value as ProbeWorkerStart;
}
export function parseProbeWorkerCancel(value: unknown): ProbeWorkerCancel {
	assertDraftTestJson(value); const o=record(value,['type','requestId','nonce']); identity(o);
	if(o['type']!=='cancel') throw new ManagementInputError(); return value as ProbeWorkerCancel;
}
export function parseProbeWorkerResult(value: unknown, expected: Pick<ProbeWorkerStart,'requestId'|'nonce'>): ProbeWorkerResult {
	assertDraftTestJson(value); const o=record(value,['type','requestId','nonce','code']); identity(o);
	if(o['type']!=='result' || o['requestId']!==expected.requestId || o['nonce']!==expected.nonce || !['reachable','failed','resource-limit','unsupported-temporary'].includes(o['code'] as string)) throw new ManagementInputError();
	return value as ProbeWorkerResult;
}
