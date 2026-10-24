/** Audited, daemon-only driver projections. Materialization has a read-only credential port. */
import { Ajv } from 'ajv';
import type { ConnectionConfig, DriverFamily } from '../../shared/db-driver.js';
import type { ConnectionKey, CredentialPatch, DriverDescriptor, EffectiveDraft, ManagementErrorCode, SafeConnection } from '../../shared/connection-management.js';
import { parseCredentialPatch, parseConnectionKey } from '../../shared/connection-management-wire.js';
import { familyOf, listRegisteredKinds } from './registry.js';
type JsonSchema = Readonly<Record<string, unknown>>;
interface Profile {
	kind: string;
	family: DriverFamily;
	fields: Record<string, JsonSchema>;
	options: Record<string, JsonSchema>;
	secrets: readonly string[];
	url: boolean;
}
export class ProfileError extends Error {
	constructor(readonly code: ManagementErrorCode = 'invalid-input') {
		super(code === 'secret-unavailable' ? 'Connection credentials are unavailable.' : code === 'conflict' ? 'The connection has changed. Reload before editing.' : code === 'not-found' ? 'The connection no longer exists.' : code === 'duplicate-id' ? 'The connection ID already exists.' : 'The connection cannot be safely edited with these fields.');
		this.name = 'ProfileError';
	}
}
const text = { type: 'string', minLength: 1, maxLength: 16384, pattern: '^[^\\u0000-\\u001f]*$' };
const strings = { type: 'array', items: text, minItems: 1, maxItems: 1024 };
const bool = { type: 'boolean' };
const object = (properties: Record<string, JsonSchema>, required: readonly string[] = []): JsonSchema => ({ type: 'object', properties, required, additionalProperties: false });
const schemaSource = object({ type: { const: 'prisma' }, path: text }, ['type', 'path']);
const namespace = object({ allow: { type: 'array', items: text, maxItems: 1024 } }, ['allow']);
const common: Record<string, JsonSchema> = { label: { ...text, minLength: 0, maxLength: 512 }, pii: { type: 'array', items: text, maxItems: 1024 } };
const column = object({ name: { ...text, maxLength: 512 }, start: { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER }, length: { type: 'integer', minimum: 1, maximum: Number.MAX_SAFE_INTEGER }, type: { enum: ['string', 'integer', 'number', 'boolean'] } }, ['name', 'start', 'length', 'type']);
const profiles = new Map<string, Profile>();
function register(kinds: readonly string[], family: DriverFamily, fields: Record<string, JsonSchema>, options: Record<string, JsonSchema> = {}, secrets: readonly string[] = [], url = false): void {
	for (const kind of kinds)
		profiles.set(kind, { kind, family, fields: { ...common, ...fields }, options, secrets, url });
}
register(['postgres', 'cockroachdb', 'mysql', 'mariadb', 'mssql', 'oracle', 'clickhouse'], 'rdbms', { endpoint: text, schemaSource }, {}, ['url.username', 'url.password'], true);
register(['sqlite'], 'rdbms', { path: text, schemaSource });
register(['redis', 'valkey', 'keydb', 'mongodb'], 'kv', { endpoint: text, namespace }, {}, ['url.username', 'url.password'], true);
register(['cassandra'], 'kv', { namespace }, { contactPoints: { ...strings, items: { ...text, pattern: '^[^@/?#\\s]+$' } }, localDataCenter: text, keyspace: text });
register(['nats'], 'kv', { namespace }, { servers: strings, bucket: text }, ['options.servers']);
register(['dynamodb'], 'kv', { namespace }, { region: text, profile: text, endpoint: text }, ['options.endpoint']);
register(['etcd'], 'kv', { namespace }, { hosts: strings, user: text }, ['options.hosts', 'options.password']);
register(['memcached'], 'kv', {}, { servers: strings, user: text }, ['options.servers', 'options.password']);
const fileFields = { path: text, recursive: bool, partitioning: { enum: ['none', 'hive'] } };
register(['csv', 'tsv'], 'file', fileFields, { delimiter: { ...text, minLength: 1, maxLength: 2, pattern: '^[^\'"\\\\]*$' }, header: bool, quote: { anyOf: [{ type: 'string', minLength: 1, maxLength: 1, pattern: '^[^\\\\]*$' }, { const: false }] } });
register(['json', 'jsonl', 'ndjson', 'parquet', 'arrow', 'feather'], 'file', fileFields);
register(['avro', 'bson', 'xlsx'], 'file', fileFields, { glob: text });
register(['fixed-width'], 'file', fileFields, { glob: text, columns: { type: 'array', items: column, minItems: 1, maxItems: 1024 }, encoding: text, trim: bool, skipFirstLine: bool });
const ajv = new Ajv({ allErrors: false, strict: false, useDefaults: false, removeAdditional: false, coerceTypes: false });
const validators = new WeakMap<object, (value: unknown) => boolean>();
function valid(schema: JsonSchema, value: unknown): boolean {
	let validator = validators.get(schema);
	if (!validator) {
		const compiled = ajv.compile(schema);
		validator = (input: unknown) => compiled(input) === true;
		validators.set(schema, validator);
	}
	return validator(value);
}
function record(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}
function clean(value: unknown, depth = 0): boolean {
	if (depth > 32)
		return false;
	if (typeof value === 'string') {
		let decoded = value;
		for (let i = 0; i < 3; i++) {
			if (decoded.includes('${secret:'))
				return false;
			try {
				const next = decodeURIComponent(decoded);
				if (next === decoded)
					break;
				decoded = next;
			}
			catch {
				break;
			}
		}
		return true;
	}
	if (Array.isArray(value))
		return value.every(v => clean(v, depth + 1));
	if (record(value))
		return Object.entries(value).every(([key, v]) => !['__proto__', 'constructor', 'prototype'].includes(key) && clean(v, depth + 1));
	return value === null || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value);
}
function copy<T>(value: T): T {
	try {
		return structuredClone(value);
	}
	catch {
		throw new ProfileError();
	}
}
function profile(kind: string): Profile {
	const p = profiles.get(kind);
	if (!p || familyOf(kind) !== p.family)
		throw new ProfileError();
	return p;
}
function optionsSchema(p: Profile): JsonSchema {
	return object(p.options);
}
const schemas = new Map<string, JsonSchema>();
function publicSchema(p: Profile): JsonSchema {
	let schema = schemas.get(p.kind);
	if (!schema) {
		schema = object({ ...p.fields, kind: { const: p.kind }, ...(Object.keys(p.options).length ? { options: optionsSchema(p) } : {}) });
		schemas.set(p.kind, schema);
	}
	return schema;
}
export function driverDescriptors(): readonly DriverDescriptor[] {
	return listRegisteredKinds().map(({ kind }) => {
		const p = profile(kind);
		return { kind, family: p.family, publicInputSchema: copy(publicSchema(p)), secretSlots: [...p.secrets] };
	}).sort((a, b) => a.kind.localeCompare(b.kind));
}
interface UriParts {
	endpoint: string;
	user: string;
	password: string;
	userEncoded: string;
	passwordEncoded: string;
	raw: string;
}
const schemes: Record<string, readonly string[]> = { postgres: ['postgres:', 'postgresql:'], cockroachdb: ['postgres:', 'postgresql:'], mysql: ['mysql:'], mariadb: ['mysql:', 'mariadb:'], mssql: ['mssql:', 'sqlserver:'], oracle: ['oracle:'], clickhouse: ['http:', 'https:'], redis: ['redis:', 'rediss:'], valkey: ['redis:', 'rediss:'], keydb: ['redis:', 'rediss:'], mongodb: ['mongodb:', 'mongodb+srv:'] };
function representedQuery(url: URL, kind: string): boolean {
	const seen = new Set<string>();
	for (const [name, value] of url.searchParams) {
		if (seen.has(name) || !clean(value))
			return false;
		seen.add(name);
		if (kind === 'postgres' || kind === 'cockroachdb') {
			if (name === 'sslmode' && ['disable', 'prefer', 'require', 'verify-ca', 'verify-full', 'no-verify'].includes(value))
				continue;
			if (['application_name', 'fallback_application_name', 'client_encoding'].includes(name) && value.length <= 512)
				continue;
		}
		else if (kind === 'mongodb') {
			if (['appName', 'authSource', 'replicaSet'].includes(name) && value.length > 0 && value.length <= 512)
				continue;
			if (['tls', 'ssl', 'retryReads', 'retryWrites', 'directConnection', 'loadBalanced'].includes(name) && ['true', 'false'].includes(value))
				continue;
			if (name === 'w' && (value === 'majority' || /^[0-9]+$/.test(value)))
				continue;
		}
		return false;
	}
	return true;
}
function uri(raw: unknown, kind: string): UriParts {
	if (typeof raw !== 'string' || raw.trim() !== raw || /[\u0000-\u0020]/.test(raw))
		throw new ProfileError();
	try {
		const parsed = new URL(raw);
		if (!schemes[kind]?.includes(parsed.protocol) || !parsed.hostname || !representedQuery(parsed, kind) || parsed.hash)
			throw new ProfileError();
		// Do not expose or normalize unrepresented SDK-specific URI dialects/parameters.
		const match = /^([A-Za-z][A-Za-z0-9+.-]*:\/\/)([^/?#]*)(.*)$/.exec(raw);
		if (!match)
			throw new ProfileError();
		const authority = match[2]!;
		const hostPort = authority.slice(authority.lastIndexOf('@') + 1);
		if (!/^(?:\[[0-9A-Fa-f:.]+\]|[A-Za-z0-9._-]+)(?::[0-9]{1,5})?$/.test(hostPort) || match[3]!.split('?')[0]!.includes(';'))
			throw new ProfileError();
		if (parsed.protocol === 'mongodb+srv:' && parsed.port !== '')
			throw new ProfileError();
		const at = authority.lastIndexOf('@');
		const info = at < 0 ? '' : authority.slice(0, at);
		const colon = info.indexOf(':');
		const userEncoded = colon < 0 ? info : info.slice(0, colon);
		const passwordEncoded = colon < 0 ? '' : info.slice(colon + 1);
		const endpoint = match[1]! + (at < 0 ? authority : authority.slice(at + 1)) + match[3]!;
		return { endpoint, user: decodeURIComponent(userEncoded), password: decodeURIComponent(passwordEncoded), userEncoded, passwordEncoded, raw };
	}
	catch {
		throw new ProfileError();
	}
}
function encodeCredential(value: string): string {
	try {
		return encodeURIComponent(value);
	}
	catch {
		throw new ProfileError();
	}
}
function withAuth(endpoint: string, userEncoded: string, passwordEncoded: string): string {
	const match = /^([A-Za-z][A-Za-z0-9+.-]*:\/\/)(.*)$/.exec(endpoint);
	if (!match)
		throw new ProfileError();
	const auth = userEncoded + (passwordEncoded !== '' ? ':' + passwordEncoded : '');
	return match[1]! + (auth !== '' ? auth + '@' : '') + match[2]!;
}
function address(raw: unknown, kind: string): {
	publicValue: string;
	hasAuth: boolean;
} {
	if (typeof raw !== 'string' || !clean(raw) || !valid(text, raw))
		throw new ProfileError();
	if (!raw.includes('://')) {
		if (kind === 'dynamodb' || !/^(?:\[[0-9A-Fa-f:]+\]|[A-Za-z0-9._-]+)(?::[0-9]{1,5})?$/.test(raw))
			throw new ProfileError();
		return { publicValue: raw, hasAuth: false };
	}
	try {
		const u = new URL(raw);
		if (!(kind === 'nats' ? ['nats:', 'tls:', 'ws:', 'wss:'] : kind === 'memcached' ? [] : ['http:', 'https:']).includes(u.protocol) || !u.hostname || u.search || u.hash)
			throw new ProfileError();
		const hasAuth = u.username !== '' || u.password !== '';
		const match = /^([A-Za-z][A-Za-z0-9+.-]*:\/\/)([^/?#]*)(.*)$/.exec(raw);
		if (!match)
			throw new ProfileError();
		const at = match[2]!.lastIndexOf('@');
		const hostPort = at < 0 ? match[2]! : match[2]!.slice(at + 1);
		if (!/^(?:\[[0-9A-Fa-f:.]+\]|[A-Za-z0-9._-]+)(?::[0-9]{1,5})?$/.test(hostPort) || match[3]!.split('?')[0]!.includes(';'))
			throw new ProfileError();
		return { publicValue: match[1]! + (at < 0 ? match[2]! : match[2]!.slice(at + 1)) + match[3]!, hasAuth };
	}
	catch {
		throw new ProfileError();
	}
}
function privateSlot(config: ConnectionConfig, slot: string): unknown {
	if (slot === 'url.username' || slot === 'url.password') {
		try {
			const u = uri(config.url, config.kind);
			return slot === 'url.username' ? u.user : u.password;
		}
		catch {
			return undefined;
		}
	}
	return config.options?.[slot.slice('options.'.length)];
}
function setOption(config: Record<string, unknown>, name: string, value: unknown): void {
	const options = record(config['options']) ? { ...config['options'] } : {};
	if (value === undefined)
		delete options[name];
	else
		options[name] = value;
	config['options'] = options;
}
const knownFields = new Set(['id', 'kind', 'family', 'label', 'url', 'path', 'secretRef', 'schemaSource', 'namespace', 'pii', 'options', 'recursive', 'partitioning', 'ephemeral']);
function shape(config: ConnectionConfig, p: Profile): boolean {
	const raw = config as unknown as Record<string, unknown>;
	if (Object.keys(raw).some(k => !knownFields.has(k)))
		return false;
	if (config.family !== undefined && !['rdbms', 'kv', 'file'].includes(config.family))
		return false;
	for (const slot of p.secrets.filter(s => s.startsWith('options.'))) {
		const v = privateSlot(config, slot);
		if (v !== undefined && (['servers', 'hosts'].includes(slot.slice(8)) ? !valid(strings, v) : typeof v !== 'string'))
			return false;
	}
	if (config.schemaSource !== undefined && !valid(schemaSource, config.schemaSource))
		return false;
	if (config.namespace !== undefined && !valid(namespace, config.namespace))
		return false;
	if (config.options !== undefined && !record(config.options))
		return false;
	const secretOptions = p.secrets.filter(k => k.startsWith('options.')).map(k => k.slice(8));
	if (Object.keys(config.options ?? {}).some(k => !Object.hasOwn(p.options, k) && !secretOptions.includes(k)))
		return false;
	return true;
}
function projected(config: ConnectionConfig, p: Profile): {
	fields: Record<string, unknown>;
	readonly: boolean;
	presence: Record<string, boolean>;
} {
	const fields: Record<string, unknown> = {};
	const presence: Record<string, boolean> = {};
	let readonly = !shape(config, p);
	for (const [key, schema] of Object.entries(p.fields)) {
		if (key === 'endpoint')
			continue;
		const value = (config as unknown as Record<string, unknown>)[key];
		if (value !== undefined) {
			if (valid(schema, value) && clean(value))
				fields[key] = copy(value);
			else
				readonly = true;
		}
	}
	if (p.url) {
		try {
			const endpoint = uri(config.url, config.kind).endpoint;
			if (!clean(endpoint))
				throw new ProfileError();
			fields['endpoint'] = endpoint;
		}
		catch {
			readonly = true;
		}
	}
	const opts: Record<string, unknown> = {};
	for (const [key, schema] of Object.entries(p.options)) {
		const value = config.options?.[key];
		if (value === undefined)
			continue;
		if (p.secrets.includes('options.' + key)) {
			try {
				if (Array.isArray(value) && value.some(v => typeof v === 'string' && v.includes('${secret:')) || typeof value === 'string' && value.includes('${secret:'))
					continue;
				opts[key] = Array.isArray(value) ? value.map(v => address(v, p.kind).publicValue) : address(value, p.kind).publicValue;
			}
			catch {
				readonly = true;
			}
		}
		else if (valid(schema, value) && clean(value))
			opts[key] = copy(value);
		else
			readonly = true;
	}
	if (Object.keys(opts).length)
		fields['options'] = opts;
	for (const slot of p.secrets) {
		const value = privateSlot(config, slot);
		if (slot.startsWith('url.') && value === undefined)
			continue;
		if (slot === 'options.servers' || slot === 'options.hosts' || slot === 'options.endpoint') {
			try {
				presence[slot] = Array.isArray(value) ? value.some(v => typeof v === 'string' && v.includes('${secret:') || address(v, p.kind).hasAuth) : typeof value === 'string' && (value.includes('${secret:') || address(value, p.kind).hasAuth);
			}
			catch {
				continue;
			}
		}
		else
			presence[slot] = slot === 'options.password' ? value !== undefined : typeof value === 'string' && value.length > 0;
	}
	return { fields, readonly, presence };
}
export function safeConnection(config: ConnectionConfig, key: ConnectionKey, revision: string): SafeConnection {
	try {
		parseConnectionKey(key);
	}
	catch {
		throw new ProfileError();
	}
	if (config.id !== key.id)
		throw new ProfileError('conflict');
	const p = profile(config.kind);
	const result = projected(config, p);
	const declared = config.family !== undefined && ['rdbms', 'kv', 'file'].includes(config.family) ? config.family : undefined;
	const effective = declared ?? p.family;
	const warnings: string[] = [];
	if (config.family !== undefined && config.family !== p.family)
		warnings.push('The saved family is explicitly pinned and is preserved.');
	if (result.readonly)
		warnings.push('This saved shape is read-only until its private fields are classified or migrated.');
	return { key: { ...key, id: config.id }, revision, kind: p.kind, family: effective, effectiveFamily: effective, registeredFamily: p.family,
		...(declared !== undefined ? { declaredFamily: declared } : {}), ...(typeof result.fields['label'] === 'string' ? { label: result.fields['label'] } : {}),
		publicConfig: result.fields, credentialPresence: result.presence, ...(result.readonly ? { readOnly: true } : {}), ...(warnings.length ? { compatibilityWarning: warnings.join(' ') } : {}) };
}
export interface DraftMaterialization {
	readonly key: ConnectionKey;
	readonly mode: 'create' | 'update';
	readonly current?: {
		readonly config: ConnectionConfig;
		readonly revision: string;
	} | undefined;
	readonly expectedRevision?: string | undefined;
	readonly publicPatch: Readonly<Record<string, unknown>>;
	readonly credentials?: Readonly<Record<string, CredentialPatch>> | undefined;
	/** Owner-aware read port. This interface deliberately has no write/delete operation. */
	readonly readSecret: (ref: string) => Promise<string | null>;
}
async function resolveTokens(value: string, read: DraftMaterialization['readSecret']): Promise<string> {
	let output = '';
	let cursor = 0;
	for (const match of value.matchAll(/\$\{secret:([^}]+)\}/g)) {
		const ref = match[1]!;
		let secret: string | null;
		try {
			secret = await read(ref);
		}
		catch {
			throw new ProfileError('secret-unavailable');
		}
		if (typeof secret !== 'string')
			throw new ProfileError('secret-unavailable');
		output += value.slice(cursor, match.index) + secret;
		cursor = match.index! + match[0].length;
	}
	return output + value.slice(cursor);
}
async function resolveStoredSlot(value: unknown, read: DraftMaterialization['readSecret']): Promise<unknown> {
	if (typeof value === 'string')
		return resolveTokens(value, read);
	if (Array.isArray(value)) {
		const values: string[] = [];
		for (const item of value) {
			if (typeof item !== 'string')
				throw new ProfileError();
			values.push(await resolveTokens(item, read));
		}
		return values;
	}
	return value;
}
function merged(base: Record<string, unknown>, patch: Readonly<Record<string, unknown>>): Record<string, unknown> {
	const result = copy(base);
	for (const [key, value] of Object.entries(patch)) {
		if (value === null) {
			delete result[key];
			continue;
		}
		if ((key === 'options' || key === 'namespace' || key === 'schemaSource') && record(value))
			result[key] = { ...(record(result[key]) ? result[key] : {}), ...copy(value) };
		else
			result[key] = copy(value);
	}
	return result;
}
function checkRequired(config: ConnectionConfig, p: Profile): void {
	if (p.url) {
		uri(config.url, p.kind);
	}
	else if (p.family === 'file' || p.kind === 'sqlite') {
		if (typeof config.path !== 'string' && typeof config.url !== 'string')
			throw new ProfileError();
	}
	else {
		const required: Record<string, readonly string[]> = { cassandra: ['contactPoints'], nats: ['servers', 'bucket'], dynamodb: ['region'], etcd: ['hosts'], memcached: ['servers'] };
		for (const key of required[p.kind] ?? []) {
			const value = config.options?.[key];
			if (value === undefined || Array.isArray(value) && value.length === 0)
				throw new ProfileError();
		}
	}
	if (p.kind === 'fixed-width' && !Array.isArray(config.options?.['columns']))
		throw new ProfileError();
	if (p.kind === 'fixed-width' && config.options?.['encoding'] !== undefined && !Buffer.isEncoding(config.options['encoding'] as BufferEncoding))
		throw new ProfileError();
}
export async function materializeDraft(input: DraftMaterialization): Promise<EffectiveDraft> {
	try {
		parseConnectionKey(input.key);
	}
	catch {
		throw new ProfileError();
	}
	if (input.mode === 'create' && input.current)
		throw new ProfileError('duplicate-id');
	if (input.mode === 'update' && !input.current)
		throw new ProfileError('not-found');
	if (input.current && (typeof input.expectedRevision !== 'string' || input.expectedRevision.length === 0 || input.current.revision !== input.expectedRevision || input.current.config.id !== input.key.id))
		throw new ProfileError('conflict');
	if (!record(input.publicPatch))
		throw new ProfileError();
	const kind = input.current?.config.kind ?? input.publicPatch['kind'];
	if (typeof kind !== 'string')
		throw new ProfileError();
	const p = profile(kind);
	if (input.publicPatch['kind'] !== undefined && input.publicPatch['kind'] !== kind)
		throw new ProfileError();
	if (input.current && projected(input.current.config, p).readonly)
		throw new ProfileError();
	// Each supplied nested patch is schema-checked independently; omitted private fields stay in the server snapshot.
	const patchSchema = publicSchema(p);
	if (!valid(patchSchema, input.publicPatch) || !clean(input.publicPatch))
		throw new ProfileError();
	if (record(input.publicPatch['options'])) {
		for (const name of ['servers', 'hosts', 'endpoint']) {
			const value = input.publicPatch['options'][name];
			if (value === undefined || !p.secrets.includes('options.' + name))
				continue;
			for (const endpoint of Array.isArray(value) ? value : [value])
				if (address(endpoint, p.kind).hasAuth)
					throw new ProfileError();
		}
	}
	const current = input.current?.config;
	const patch = { ...input.publicPatch };
	delete patch['kind'];
	const config = merged(current ? copy(current) as unknown as Record<string, unknown> : { id: input.key.id, kind, family: p.family }, patch);
	const credentials = input.credentials ?? {};
	if (!record(credentials))
		throw new ProfileError();
	if (Object.keys(credentials).some(slot => !p.secrets.includes(slot)))
		throw new ProfileError();
	const actions: Record<string, CredentialPatch> = {};
	let parts: UriParts | undefined;
	let urlHasTokens = false;
	if (p.url) {
		const prior = current?.url !== undefined ? uri(current.url, kind) : undefined;
		urlHasTokens = !!prior && (prior.user.includes('${secret:') || prior.password.includes('${secret:'));
		const endpoint = patch['endpoint'] !== undefined ? patch['endpoint'] : prior?.endpoint;
		const supplied = uri(endpoint, kind);
		if (supplied.user !== '' || supplied.password !== '')
			throw new ProfileError();
		parts = { ...supplied, userEncoded: prior?.userEncoded ?? '', passwordEncoded: prior?.passwordEncoded ?? '', user: prior?.user ?? '', password: prior?.password ?? '' };
		delete config['endpoint'];
	}
	for (const slot of p.secrets) {
		let action: CredentialPatch;
		try {
			action = parseCredentialPatch(credentials[slot] ?? { action: 'keep' });
		}
		catch {
			throw new ProfileError();
		}
		if (action.action === 'replace' && Buffer.byteLength(action.value) > 2 * 1024 * 1024)
			throw new ProfileError();
		actions[slot] = copy(action);
		if (slot === 'url.username' || slot === 'url.password') {
			const name = slot === 'url.username' ? 'user' : 'password';
			const encoded = name === 'user' ? 'userEncoded' : 'passwordEncoded';
			const value = action.action === 'clear' ? '' : action.action === 'replace' ? action.value : await resolveTokens(parts![name], input.readSecret);
			if (action.action === 'replace' && value.includes('${secret:'))
				throw new ProfileError();
			parts![encoded] = action.action === 'keep' && !parts![name].includes('${secret:') ? parts![encoded] : encodeCredential(value);
		}
		else {
			const name = slot.slice(8);
			const existing = current?.options?.[name];
			let value: unknown;
			if (action.action === 'clear') {
				if (Array.isArray(existing)) {
					value = [];
					for (const v of existing) {
						if (typeof v !== 'string')
							throw new ProfileError();
						(value as string[]).push(address(await resolveTokens(v, input.readSecret), p.kind).publicValue);
					}
				}
				else
					value = name === 'endpoint' && typeof existing === 'string' ? address(await resolveTokens(existing, input.readSecret), p.kind).publicValue : undefined;
			}
			else if (action.action === 'replace') {
				if (action.value.includes('${secret:'))
					throw new ProfileError();
				if (['servers', 'hosts'].includes(name)) {
					try {
						value = JSON.parse(action.value);
					}
					catch {
						throw new ProfileError();
					}
					if (!valid(strings, value))
						throw new ProfileError();
					for (const v of value as string[])
						address(v, p.kind);
				}
				else {
					value = action.value;
					if (name === 'endpoint')
						address(value, p.kind);
				}
			}
			else {
				const patched = (config['options'] as Record<string, unknown> | undefined)?.[name];
				let unchanged = JSON.stringify(patched) === JSON.stringify(existing);
				if (!unchanged && existing !== undefined) {
					try {
						unchanged = JSON.stringify(patched) === JSON.stringify(Array.isArray(existing) ? existing.map(v => address(v, p.kind).publicValue) : name === 'endpoint' ? address(existing, p.kind).publicValue : existing);
					}
					catch { /* Sealed or unsupported endpoints require an explicit action to change. */
					}
				}
				if (patched !== undefined && !unchanged) {
					if (Array.isArray(patched)) {
						for (const v of patched)
							if (address(v, p.kind).hasAuth)
								throw new ProfileError();
					}
					else if (name === 'endpoint' && address(patched, p.kind).hasAuth)
						throw new ProfileError();
					if (existing !== undefined && (Array.isArray(existing) ? existing.some(v => address(v, p.kind).hasAuth) : name === 'endpoint' && address(existing, p.kind).hasAuth))
						throw new ProfileError();
					value = copy(patched);
				}
				else
					value = await resolveStoredSlot(existing, input.readSecret);
			}
			setOption(config, name, value);
		}
	}
	if (parts)
		config['url'] = withAuth(parts.endpoint, parts.userEncoded, parts.passwordEncoded);
	if (input.mode === 'update' && p.url && Object.keys(patch).every(k => k !== 'endpoint') && p.secrets.every(slot => actions[slot]?.action === 'keep') && !urlHasTokens)
		config['url'] = current!.url;
	if (!p.url && p.family === 'kv' && config['url'] === undefined && config['path'] === undefined)
		config['url'] = `${kind}:options`;
	checkRequired(config as unknown as ConnectionConfig, p);
	return { config: config as unknown as ConnectionConfig, credentialActions: actions, ...(input.expectedRevision !== undefined ? { expectedRevision: input.expectedRevision } : {}) };
}
/** Daemon-internal slot access shared with generation staging; never a renderer response. */
export type CredentialValue = string | readonly string[] | undefined;
export function credentialValues(config: ConnectionConfig): Readonly<Record<string, CredentialValue>> {
	const p = profile(config.kind);
	const result: Record<string, CredentialValue> = {};
	for (const slot of p.secrets) {
		const value = privateSlot(config, slot);
		if (value !== undefined && typeof value !== 'string' && (!Array.isArray(value) || value.some(v => typeof v !== 'string')))
			throw new ProfileError();
		result[slot] = value as CredentialValue;
	}
	return result;
}
/** Rewrites only classified slots in an already materialized snapshot. No keystore or file effects. */
export function withCredentialValues(config: ConnectionConfig, values: Readonly<Record<string, CredentialValue>>): ConnectionConfig {
	const p = profile(config.kind);
	if (Object.keys(values).some(slot => !p.secrets.includes(slot)))
		throw new ProfileError();
	const next = copy(config) as unknown as Record<string, unknown>;
	let parts = p.url ? uri(config.url, p.kind) : undefined;
	for (const [slot, value] of Object.entries(values)) {
		if (slot.startsWith('url.')) {
			if (value !== undefined && typeof value !== 'string')
				throw new ProfileError();
			const encoded = slot === 'url.username' ? 'userEncoded' : 'passwordEncoded';
			parts![encoded] = value === undefined ? '' : encodeCredential(value as string);
		}
		else {
			const name = slot.slice(8);
			const array = ['hosts', 'servers'].includes(name);
			if (value !== undefined && (array ? !Array.isArray(value) || value.some(v => typeof v !== 'string') : typeof value !== 'string'))
				throw new ProfileError();
			setOption(next, name, value === undefined ? undefined : copy(value));
		}
	}
	if (parts)
		next['url'] = withAuth(parts.endpoint, parts.userEncoded, parts.passwordEncoded);
	return next as unknown as ConnectionConfig;
}
