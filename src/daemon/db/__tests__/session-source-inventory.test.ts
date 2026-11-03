import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { sessionSourceInventory } from './connection-source-inventory.js';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const digest = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex');

test('CM-S3-INVENTORY: production boundaries have explicit reviewed classifications and unchanged baseline', () => {
	const baseline = JSON.parse(readFileSync(new URL('./fixtures/session-source-inventory.json', import.meta.url), 'utf8')) as {
		files: Record<string, { classification: string; rationale: string; sites: [string, string][]; siteCount: number; sitesDigest: string; sourceDigest: string }>;
		designSources: Record<string, string>;
	};
	const actual = sessionSourceInventory(root);
	const files = [...new Set(actual.map(s => s.file))].sort();
	assert.deepEqual(files, Object.keys(baseline.files).sort(), 'New/removed file needs explicit classification, never automatic exclusion');
	for (const file of files) {
		const entry = baseline.files[file]!;
		const sites = actual.filter(s => s.file === file);
		assert.ok(entry.classification && entry.rationale.length > 40, file);
		assert.equal(sites.length, entry.siteCount, `${file}: site count changed`);
		assert.deepEqual(sites.map(s => [s.boundary, s.expression]), entry.sites, `${file}: changed site classification`);
		assert.equal(digest(JSON.stringify(sites)), entry.sitesDigest, `${file}: reclassify changed boundaries`);
		assert.equal(digest(readFileSync(join(root, file))), entry.sourceDigest, `${file}: source changed; inspect before refreshing inventory`);
	}
	for (const [file, hash] of Object.entries(baseline.designSources)) {
		assert.equal(digest(readFileSync(join(root, file))), hash, `${file}: design discovery changed`);
		const input = JSON.parse(readFileSync(join(root, file), 'utf8')) as Record<string, unknown>;
		const discovered = Array.isArray(input.sites) ? (input.sites as { file: string }[]).map(s => s.file) : Object.keys(input);
		for (const path of discovered) assert.ok(baseline.files[path], `${path}: design inventory file unclassified`);
	}
	for (const boundary of ['provider-use', 'provider-factory', 'connection-use', 'connection-factory', 'diagnostic', 'serialization', 'filesystem-write', 'storage-call']) {
		assert.ok(actual.some(s => s.boundary === boundary), boundary);
	}
	const gate = JSON.parse(readFileSync(join(root, 'src/assets/connection-management-gates.json'), 'utf8')) as { ready: boolean; scopes: string[] };
	assert.equal(gate.ready, false);
	assert.ok(!gate.scopes.includes('temporary'));
	assert.equal(actual.filter(s => s.file === 'src/agent/providers/onnx-embedder.ts' && s.expression === 'pipe' && s.boundary === 'provider-use').length, 3,
		'all three ONNX tensor pipeline submissions must be identified, not merely their enclosing file');
	assert.ok(actual.some(s => s.file === 'src/analyze/docs-retrieval.ts' && s.expression === 'vectorPass.embedQuery' && s.boundary === 'provider-use'),
		'injected typeof embedQuery is an input submission boundary');
	for (const file of ['src/db/graph/codec.ts', 'src/db/doc-summaries.ts', 'src/db/exploration-cache.ts']) {
		assert.ok(actual.some(s => s.file === file && s.expression === 'packr.pack' && s.boundary === 'serialization'), `${file}: MessagePack submission`);
	}
	for (const expression of ['parts.log.info', 'parts.log.warn']) {
		assert.ok(actual.some(s => s.file === 'src/daemon/shutdown.ts' && s.expression === expression && s.boundary === 'diagnostic'), expression);
	}
});

test('CM-S3-INVENTORY: renamed and destructured provider resolver factory serializer and filesystem APIs are discovered', () => {
	const fixture = mkdtempSync(join(tmpdir(), 'cm-s3-types-'));
	try {
		mkdirSync(join(fixture, 'src', 'shared'), { recursive: true });
		mkdirSync(join(fixture, 'src', 'indexer'), { recursive: true });
		writeFileSync(join(fixture, 'tsconfig.json'), JSON.stringify({ compilerOptions: {
			module: 'nodenext', target: 'es2022', strict: true, types: ['node'], typeRoots: [join(root, 'node_modules', '@types')], skipLibCheck: true,
		} }));
		writeFileSync(join(fixture, 'src', 'shared', 'types.ts'), `
export interface LLMProvider { complete(input: string): Promise<string> }
export interface Driver { query(input: string): Promise<string> }
export interface ConnectionResolver { withConnection(id: string): Promise<Driver> }
export interface BinaryCodec { pack(input: unknown): Uint8Array }
export interface InjectedLog { info(input: unknown): void; warn: (input: unknown) => void }
export class OllamaProvider implements LLMProvider { async complete(input: string): Promise<string> { return input; } }
`);
		writeFileSync(join(fixture, 'src', 'indexer', 'embedder.ts'), `export async function embedQuery(input: string): Promise<number[]> { return [input.length]; }`);
		writeFileSync(join(fixture, 'src', 'caller.ts'), `
import type { LLMProvider as Renamed, ConnectionResolver as Port, Driver, BinaryCodec, InjectedLog } from './shared/types.js';
import { writeFile as renamedWrite } from 'node:fs/promises';
import type { embedQuery as queryFunction } from './indexer/embedder.js';
import { OllamaProvider as ProviderBase } from './shared/types.js';
declare const provider: Renamed;
declare const resolver: Port;
declare const injected: () => Promise<Driver>;
declare const providerFactory: () => Promise<Renamed>;
declare const vectorPort: { renamedQuery: typeof queryFunction };
const { renamedQuery: detachedQuery } = vectorPort;
declare const codec: BinaryCodec;
const { pack: detachedPack } = codec;
declare const parts: { log: InjectedLog };
const { info: renamedInfo, warn: renamedWarn } = parts.log;
declare const dynamicLog: any;
declare const dynamicEmbed: any;
const { complete: detachedComplete } = provider;
class Derived extends ProviderBase {}
declare const derived: Derived;
declare const derivedFactory: () => Derived;
const { withConnection: detachedResolve } = resolver;
const pack = JSON.stringify;
async function run() {
 await detachedComplete('canary'); await detachedResolve('id');
 await detachedComplete.call(provider, 'private'); await derived.complete('private'); derivedFactory();
 await injected(); await providerFactory();
 await vectorPort.renamedQuery('private'); await detachedQuery('private');
 detachedPack({ private: true });
 parts.log.info('private'); parts.log.warn('private'); renamedInfo('private'); renamedWarn('private'); renamedWarn.call(parts.log, 'private');
 dynamicLog['warn']('private'); dynamicEmbed.embedQuery('private');
 await renamedWrite('/not-executed', pack({ marker: 'canary' }));
}
`);
		const actual = sessionSourceInventory(fixture).filter(s => s.file === 'src/caller.ts');
		for (const [expression, boundary] of [['detachedComplete', 'provider-use'], ['detachedResolve', 'connection-use'],
			['injected', 'connection-factory'], ['providerFactory', 'provider-factory'], ['pack', 'serialization'], ['renamedWrite', 'filesystem-write'],
			['vectorPort.renamedQuery', 'provider-use'], ['detachedQuery', 'provider-use'], ['detachedPack', 'serialization']]) {
			assert.ok(actual.some(s => s.expression === expression && s.boundary === boundary), `${expression}: ${boundary}`);
		}
		for (const [expression, boundary] of [['detachedComplete.call', 'provider-use'], ['derived.complete', 'provider-use'], ['derivedFactory', 'provider-factory']]) {
			assert.ok(actual.some(s => s.expression === expression && s.boundary === boundary), `${expression}: inherited/call alias`);
		}
		for (const expression of ['parts.log.info', 'parts.log.warn', 'renamedInfo', 'renamedWarn', 'renamedWarn.call']) {
			assert.ok(actual.some(s => s.expression === expression && s.boundary === 'diagnostic'), `${expression}: injected logger`);
		}
		assert.ok(actual.some(s => s.expression === "dynamicLog['warn']" && s.boundary === 'diagnostic'));
		assert.ok(actual.some(s => s.expression === 'dynamicEmbed.embedQuery' && s.boundary === 'provider-use'));
		assert.ok(actual.some(s => s.expression === 'dynamicEmbed.embedQuery' && s.boundary === 'unresolved-call'));
	} finally { rmSync(fixture, { recursive: true, force: true }); }
});

test('CM-S4-GATE: reviewed removal sources include pure helpers owner boundaries and pending global affinity',()=>{
 const baseline=JSON.parse(readFileSync(new URL('./fixtures/session-source-inventory.json',import.meta.url),'utf8')) as {sc6Sources:Record<string,{classification:string;rationale:string;sourceDigest:string}>};
 const expected=['src/shared/connection-removal.ts','src/daemon/db/removal-retirement.ts','src/daemon/threads/method-class.ts','src/daemon/db/management-enablement.ts','src/daemon/connection-management-rpc.ts','src/daemon/connection-session-rpc.ts','src/daemon/db-rpc.ts','src/daemon/db/draft-test.ts','src/daemon/db/management.ts','src/daemon/db/pool.ts','src/daemon/db/secrets.ts','src/daemon/db/session-entries.ts','src/daemon/db/session-ledger.ts','src/daemon/db/session-management.ts','src/daemon/db/session-resources.ts','src/shared/connection-management-wire.ts','src/shared/connection-management.ts'];
 assert.deepEqual(Object.keys(baseline.sc6Sources).sort(),expected.sort());
 for(const [file,row] of Object.entries(baseline.sc6Sources)){
  assert.ok(row.classification&&row.rationale.length>80,file);assert.equal(row.sourceDigest,digest(readFileSync(join(root,file))),file+' requires fresh boundary review');
 }
 assert.match(baseline.sc6Sources['src/daemon/threads/method-class.ts']!.rationale,/affinity remains release-blocking/);
 const gate=JSON.parse(readFileSync(join(root,'src/assets/connection-management-gates.json'),'utf8'));assert.equal(gate.ready,false);assert.deepEqual(gate.scopes,[]);
});
