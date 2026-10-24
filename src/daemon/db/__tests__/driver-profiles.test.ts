import { strict as assert } from 'node:assert';
import { test, mock } from 'node:test';
import fsPromises from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { _setKeystoreForTests } from '../secrets.js';
import * as actualKeystore from '../../../shared/keystore.js';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import '../drivers/index.js';
import { listRegisteredKinds } from '../registry.js';
import { driverDescriptors, materializeDraft, safeConnection, ProfileError, credentialValues, withCredentialValues } from '../driver-profiles.js';
import type { ConnectionConfig } from '../../../shared/db-driver.js';
import type { ConnectionKey, CredentialPatch } from '../../../shared/connection-management.js';
import { PATHS } from '../../../shared/paths.js';
import { connectionsPath } from '../config.js';
const schemes: Record<string, string> = { postgres: 'postgresql', cockroachdb: 'postgresql', mysql: 'mysql', mariadb: 'mysql', mssql: 'mssql', oracle: 'oracle', clickhouse: 'http', redis: 'redis', valkey: 'redis', keydb: 'redis', mongodb: 'mongodb' };
function fixture(kind: string, family: string): {
	patch: Record<string, unknown>;
	credentials: Record<string, CredentialPatch>;
} {
	const patch: Record<string, unknown> = { kind, label: 'Fixture ' + kind };
	const credentials: Record<string, CredentialPatch> = {};
	if (schemes[kind]) {
		patch['endpoint'] = `${schemes[kind]}://localhost/fixture`;
		credentials['url.username'] = { action: 'replace', value: 'fixture-user' };
		credentials['url.password'] = { action: 'replace', value: 'credential-canary-' + kind };
	}
	else if (family === 'file' || kind === 'sqlite') {
		patch['path'] = 'fixtures/fixture.' + kind;
		if (family === 'file') {
			patch['recursive'] = true;
			patch['partitioning'] = 'hive';
		}
		if (kind === 'csv' || kind === 'tsv')
			patch['options'] = { delimiter: ',', header: true, quote: false };
		if (['avro', 'bson', 'xlsx'].includes(kind))
			patch['options'] = { glob: '*.fixture' };
		if (kind === 'fixed-width')
			patch['options'] = { columns: [{ name: 'value', start: 0, length: 12, type: 'string' }], encoding: 'utf8', trim: true, skipFirstLine: false, glob: '*.fixture' };
	}
	else {
		const options: Record<string, Record<string, unknown>> = { cassandra: { contactPoints: ['localhost'], localDataCenter: 'dc1', keyspace: 'fixture' }, nats: { servers: ['nats://localhost:4222'], bucket: 'fixture' }, dynamodb: { region: 'us-east-1', profile: 'fixture', endpoint: 'http://localhost:8000' }, etcd: { hosts: ['http://localhost:2379'], user: 'fixture' }, memcached: { servers: ['localhost:11211'], user: 'fixture' } };
		patch['options'] = options[kind];
		if (kind === 'nats')
			credentials['options.servers'] = { action: 'replace', value: JSON.stringify(['nats://fixture:credential-canary-nats@localhost:4222']) };
		if (kind === 'dynamodb')
			credentials['options.endpoint'] = { action: 'replace', value: 'http://fixture:credential-canary-dynamodb@localhost:8000' };
		if (kind === 'etcd' || kind === 'memcached')
			credentials['options.password'] = { action: 'replace', value: 'credential-canary-' + kind };
	}
	return { patch, credentials };
}
const readSecret = async () => {
	throw new Error('no stored secret should be needed');
};
function key(id = 'fixture'): ConnectionKey {
	return { repoRoot: '/unregistered/own-directory', scope: 'saved', id };
}
test('CM-S1-A: every registered profile has positive and negative drafts, safe projection, and retained config preservation', async () => {
	const descriptors = driverDescriptors();
	assert.deepEqual(descriptors.map(d => ({ kind: d.kind, family: d.family })), [...listRegisteredKinds()].sort((a, b) => a.kind.localeCompare(b.kind)));
	for (const { kind, family } of descriptors) {
		const f = fixture(kind, family);
		const k = key(kind);
		const created = await materializeDraft({ key: k, mode: 'create', publicPatch: f.patch, credentials: f.credentials, readSecret });
		assert.equal(created.config.family, family);
		assert.ok(created.config.url || created.config.path, 'draft remains readable by the existing saved-document loader');
		const current: ConnectionConfig = { ...created.config, family: family === 'file' ? 'rdbms' : 'file', secretRef: 'owned-reference-canary', schemaSource: { type: 'prisma', path: 'retained/schema.prisma' }, namespace: { allow: ['retained:*'] } };
		const original = structuredClone(current);
		const dto = safeConnection(current, k, 'r1');
		assert.equal(dto.family, current.family);
		assert.notEqual(dto.readOnly, true, 'a supported family pin is not itself read-only');
		assert.equal(dto.key.repoRoot, k.repoRoot);
		assert.ok(dto.compatibilityWarning?.includes('pinned'));
		assert.ok(!JSON.stringify(dto).includes('credential-canary'));
		assert.ok(!JSON.stringify(dto).includes('owned-reference-canary'));
		assert.ok(!Object.hasOwn(dto.publicConfig, 'secretRef') && !Object.hasOwn(dto.publicConfig, 'url'));
		const edited = await materializeDraft({ key: k, mode: 'update', current: { config: current, revision: 'r1' }, expectedRevision: 'r1', publicPatch: { label: 'Changed label' }, readSecret });
		assert.deepEqual(edited.config, { ...current, label: 'Changed label' }, kind + ' preserves all unexposed supported config');
		assert.deepEqual(current, original, 'caller snapshot never mutated');
		for (const patch of [{ ...f.patch, unclassifiedCanary: 'credential-canary' }, { ...f.patch, family: 'kv' }, { ...f.patch, id: 'other' }]) {
			await assert.rejects(materializeDraft({ key: k, mode: 'create', publicPatch: patch, credentials: f.credentials, readSecret }), ProfileError);
		}
	}
});
test('CM-S1-C: Keep Replace Clear use one effective draft and preserve pinned families without credential/reference projection', async () => {
	const k = key();
	const vault = new Map([['username', 'stored-user'], ['password', 'stored/p@ss%word']]);
	let reads = 0;
	const current: ConnectionConfig = { id: k.id, kind: 'postgres', family: 'file', url: 'postgresql://%24%7Bsecret%3Ausername%7D:%24%7Bsecret%3Apassword%7D@LOCALHOST:5432/db', secretRef: 'password', namespace: { allow: ['retained:*'] } };
	const base = { key: k, mode: 'update' as const, current: { config: current, revision: 'r1' }, expectedRevision: 'r1', publicPatch: { label: 'edit' }, readSecret: async (ref: string) => {
			reads++;
			return vault.get(ref) ?? null;
		} };
	const dto = safeConnection(current, k, 'r1');
	assert.deepEqual(dto.credentialPresence, { 'url.username': true, 'url.password': true });
	assert.equal(dto.publicConfig['endpoint'], 'postgresql://LOCALHOST:5432/db');
	assert.ok(!JSON.stringify(dto).includes('secret:'));
	const kept = await materializeDraft(base);
	assert.equal(kept.config.family, 'file');
	assert.equal(new URL(kept.config.url!).password, 'stored%2Fp%40ss%25word');
	const replaced = await materializeDraft({ ...base, credentials: { 'url.password': { action: 'replace', value: 'new/pass@word' } } });
	assert.equal(decodeURIComponent(new URL(replaced.config.url!).password), 'new/pass@word');
	const cleared = await materializeDraft({ ...base, credentials: { 'url.password': { action: 'clear' } } });
	assert.equal(new URL(cleared.config.url!).password, '');
	assert.equal(new URL(cleared.config.url!).username, 'stored-user');
	assert.equal(current.url, 'postgresql://%24%7Bsecret%3Ausername%7D:%24%7Bsecret%3Apassword%7D@LOCALHOST:5432/db');
	assert.ok(reads > 0);
	assert.deepEqual([...vault], [['username', 'stored-user'], ['password', 'stored/p@ss%word']]);
	for (const patch of [{ kind: 'mysql' }, { id: 'other' }, { family: 'kv' }])
		await assert.rejects(materializeDraft({ ...base, publicPatch: patch }), ProfileError);
	await assert.rejects(materializeDraft({ ...base, expectedRevision: 'stale' }), (e: unknown) => e instanceof ProfileError && e.code === 'conflict');
	await assert.rejects(materializeDraft({ ...base, credentials: { 'url.password': { action: 'replace', value: '${secret:foreign}' } } }), ProfileError);
});
test('CM-S1-P: abandoning safe reads and materialized create/edit drafts leaves exact registry and vault state untouched', async () => {
	const isolated = await mkdtemp(join(tmpdir(), 'cm-profile-cancel-'));
	const previous = PATHS.insrc;
	const vault = new Map([['password', 'stored-canary']]);
	let writes = 0;
	let keyWrites = 0;
	const keystore = { getKey: async (ref: string) => vault.get(ref) ?? null, setKey: async (ref: string, value: string) => {
			keyWrites++;
			vault.set(ref, value);
		}, deleteKey: async (ref: string) => {
			keyWrites++;
			vault.delete(ref);
		} };
	let restoreWrites: () => void = () => {
	};
	try {
		Object.defineProperty(PATHS, 'insrc', { value: isolated });
		const existing: ConnectionConfig = { id: 'fixture', kind: 'postgres', url: 'postgresql://u:${secret:password}@localhost/db', family: 'kv', namespace: { allow: ['retained:*'] } };
		const path = connectionsPath('/unregistered/own-directory');
		await fsPromises.mkdir(dirname(path), { recursive: true });
		await fsPromises.writeFile(path, JSON.stringify({ connections: [existing], _management: { version: 2, registryId: '00000000-0000-4000-8000-000000000001', generation: 'g1', revisions: { fixture: 'r1' }, receipts: {} } }));
		const before = await readFile(path);
		const beforeVault = [...vault];
		const writeMock = mock.method(fsPromises, 'writeFile', async () => {
			writes++;
			throw new Error('unexpected profile write');
		});
		syncBuiltinESMExports();
		restoreWrites = () => {
			writeMock.mock.restore();
			syncBuiltinESMExports();
		};
		_setKeystoreForTests(keystore);
		const read = async (ref: string) => vault.get(ref) ?? null;
		safeConnection(existing, key(), 'r1');
		for (const action of [{ action: 'keep' }, { action: 'clear' }, { action: 'replace', value: 'abandoned-canary' }] satisfies CredentialPatch[]) {
			await materializeDraft({ key: key(), mode: 'update', current: { config: existing, revision: 'r1' }, expectedRevision: 'r1', publicPatch: { label: 'not saved' }, credentials: { 'url.password': action }, readSecret: read });
		}
		await materializeDraft({ key: key('new'), mode: 'create', publicPatch: { kind: 'csv', path: 'not-created.csv' }, readSecret: read });
		assert.deepEqual(await readFile(path), before);
		assert.deepEqual([...vault], beforeVault);
		assert.equal(writes, 0);
		assert.equal(keyWrites, 0);
	}
	finally {
		restoreWrites();
		_setKeystoreForTests(actualKeystore);
		Object.defineProperty(PATHS, 'insrc', { value: previous });
		await rm(isolated, { recursive: true, force: true });
	}
});
test('CM-S1-A: unclassified private fields and unsupported URI dialects remain redacted and read-only', async () => {
	for (const extra of [{ url: 'postgresql://u:credential-canary@localhost/db?password=credential-canary' }, { options: { unclassifiedPassword: 'credential-canary' } }, { unclassifiedPrivate: 'credential-canary' }]) {
		const current = { id: 'fixture', kind: 'postgres', url: 'postgresql://u:p@localhost/db', ...extra } as ConnectionConfig;
		const dto = safeConnection(current, key(), 'r1');
		assert.ok(dto.compatibilityWarning?.includes('read-only'));
		assert.equal(dto.readOnly, true);
		assert.ok(!JSON.stringify(dto).includes('credential-canary'));
		await assert.rejects(materializeDraft({ key: key(), mode: 'update', current: { config: current, revision: 'r1' }, expectedRevision: 'r1', publicPatch: { label: 'edit' }, readSecret }), ProfileError);
	}
});
test('CM-S1-C: internal credential slot mapping preserves endpoints and supports opaque generation references without effects', async () => {
	const raw: ConnectionConfig = { id: 'fixture', kind: 'postgres', url: 'postgresql://fixture:credential-canary@LOCALHOST:5432/db', namespace: { allow: ['retained:*'] } };
	const sealed = withCredentialValues(raw, { 'url.username': '${secret:owned-user}', 'url.password': '${secret:owned-password}' });
	assert.deepEqual(credentialValues(sealed), { 'url.username': '${secret:owned-user}', 'url.password': '${secret:owned-password}' });
	assert.deepEqual(sealed.namespace, raw.namespace);
	assert.ok(!sealed.url!.includes('credential-canary'));
	const dto = safeConnection(sealed, key(), 'r1');
	assert.equal(dto.publicConfig['endpoint'], 'postgresql://LOCALHOST:5432/db');
	assert.ok(!JSON.stringify(dto).includes('owned-password'));
	const resolved = await materializeDraft({ key: key(), mode: 'update', current: { config: sealed, revision: 'r1' }, expectedRevision: 'r1', publicPatch: {}, readSecret: async (ref) => ref === 'owned-user' ? 'fixture' : ref === 'owned-password' ? 'new-canary' : null });
	assert.equal(decodeURIComponent(new URL(resolved.config.url!).password), 'new-canary');
	assert.equal(raw.url, 'postgresql://fixture:credential-canary@LOCALHOST:5432/db');
	const kv: ConnectionConfig = { id: 'fixture', kind: 'nats', url: 'nats:options', options: { servers: ['nats://u:canary@localhost:4222'], bucket: 'fixture' } };
	const kvSealed = withCredentialValues(kv, { 'options.servers': ['${secret:owned-server}'] });
	const kvDto = safeConnection(kvSealed, key(), 'r1');
	assert.ok(!JSON.stringify(kvDto).includes('owned-server'));
	assert.ok(!kvDto.compatibilityWarning?.includes('read-only'));
	const cleared = await materializeDraft({ key: key(), mode: 'update', current: { config: kvSealed, revision: 'r1' }, expectedRevision: 'r1', publicPatch: {}, credentials: { 'options.servers': { action: 'clear' } }, readSecret: async (ref) => ref === 'owned-server' ? 'nats://u:canary@localhost:4222' : null });
	assert.deepEqual(cleared.config.options?.['servers'], ['nats://localhost:4222']);
});
test('CM-S1-C: explicitly classified non-secret URI parameters survive label and credential edits exactly', async () => {
	for (const [kind, url] of [
		['postgres', 'postgresql://fixture:credential-canary@LOCALHOST:5432/db?sslmode=require&application_name=manager'],
		['mongodb', 'mongodb+srv://fixture:credential-canary@cluster.invalid/db?retryWrites=true&w=majority&authSource=admin'],
	]) {
		const current: ConnectionConfig = { id: 'fixture', kind: kind!, url: url! };
		const dto = safeConnection(current, key(), 'r1');
		assert.ok(!dto.compatibilityWarning?.includes('read-only'));
		assert.ok(!JSON.stringify(dto).includes('credential-canary'));
		const draft = await materializeDraft({ key: key(), mode: 'update', current: { config: current, revision: 'r1' }, expectedRevision: 'r1', publicPatch: { label: 'edit' }, readSecret });
		assert.equal(draft.config.url, url);
		const cleared = await materializeDraft({ key: key(), mode: 'update', current: { config: current, revision: 'r1' }, expectedRevision: 'r1', publicPatch: {}, credentials: { 'url.password': { action: 'clear' } }, readSecret });
		assert.equal(new URL(cleared.config.url!).search, new URL(url!).search);
		assert.equal(new URL(cleared.config.url!).password, '');
	}
});
test('CM-S1-A: credential-bearing URI text is refused in public fields even when a private replacement is supplied', async () => {
	for (const { kind, family } of listRegisteredKinds()) {
		const f = fixture(kind, family);
		const patch = structuredClone(f.patch);
		if (schemes[kind])
			patch['endpoint'] = `${schemes[kind]}://u:credential-canary@localhost/fixture`;
		else if (kind === 'nats')
			patch['options'] = { servers: ['nats://u:credential-canary@localhost:4222'], bucket: 'fixture' };
		else if (kind === 'etcd')
			patch['options'] = { hosts: ['http://u:credential-canary@localhost:2379'] };
		else if (kind === 'memcached')
			patch['options'] = { servers: ['http://u:credential-canary@localhost:11211'] };
		else if (kind === 'dynamodb')
			patch['options'] = { region: 'us-east-1', endpoint: 'http://u:credential-canary@localhost:8000' };
		else
			continue;
		await assert.rejects(materializeDraft({ key: key(kind), mode: 'create', publicPatch: patch, credentials: f.credentials, readSecret }), ProfileError);
	}
});
test('CM-S1-A: unsupported semicolon connection strings and encoded reference paths never enter public endpoints', () => {
	for (const prefix of ['%ZZ', '%', '%FF', '%E0%A4', '']) {
		const token = '%24%7Bsecret%3Aowned-reference-canary%7D';
		for (const encoded of [token, encodeURIComponent(token), encodeURIComponent(encodeURIComponent(token))]) {
			const dto = safeConnection({ id: 'fixture', kind: 'mssql', url: `mssql://host/${prefix}${encoded}` }, key(), 'r1');
			assert.equal(dto.readOnly, true);
			assert.ok(!Object.hasOwn(dto.publicConfig, 'endpoint'));
			assert.ok(!JSON.stringify(dto).includes('canary'));
		}
	}
	for (const url of ['mssql://host;database=fixture;password=credential-canary', 'mssql://host/db;password=credential-canary', 'mssql://host=%24%7Bsecret%3Aowned-reference-canary%7D/db', 'mssql://host/%24%7Bsecret%3Aowned-reference-canary%7D']) {
		const dto = safeConnection({ id: 'fixture', kind: 'mssql', url }, key(), 'r1');
		assert.ok(dto.compatibilityWarning?.includes('read-only'));
		assert.equal(dto.readOnly, true);
		assert.ok(!Object.hasOwn(dto.publicConfig, 'endpoint'));
		assert.ok(!JSON.stringify(dto).includes('canary'));
	}
});
test('CM-S1-A: private endpoint lists reject unrepresented DSN text and credential clear updates presence truthfully', async () => {
	const current: ConnectionConfig = { id: 'fixture', kind: 'nats', url: 'nats:options', options: { servers: ['nats://host;password=credential-canary'], bucket: 'fixture' } };
	const dto = safeConnection(current, key(), 'r1');
	assert.ok(dto.compatibilityWarning?.includes('read-only'));
	assert.equal(dto.readOnly, true);
	assert.ok(!JSON.stringify(dto).includes('credential-canary'));
	const valid: ConnectionConfig = { ...current, options: { servers: ['nats://u:canary@localhost:4222'], bucket: 'fixture' } };
	const cleared = await materializeDraft({ key: key(), mode: 'update', current: { config: valid, revision: 'r1' }, expectedRevision: 'r1', publicPatch: {}, credentials: { 'options.servers': { action: 'clear' } }, readSecret });
	assert.equal(safeConnection(cleared.config, key(), 'r2').credentialPresence['options.servers'], false);
});
