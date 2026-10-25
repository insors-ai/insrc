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
		files: Record<string, { classification: string; rationale: string; siteCount: number; sitesDigest: string; sourceDigest: string }>;
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
});

test('CM-S3-INVENTORY: renamed and destructured provider resolver factory serializer and filesystem APIs are discovered', () => {
	const fixture = mkdtempSync(join(tmpdir(), 'cm-s3-types-'));
	try {
		mkdirSync(join(fixture, 'src', 'shared'), { recursive: true });
		writeFileSync(join(fixture, 'tsconfig.json'), JSON.stringify({ compilerOptions: {
			module: 'nodenext', target: 'es2022', strict: true, types: ['node'], typeRoots: [join(root, 'node_modules', '@types')], skipLibCheck: true,
		} }));
		writeFileSync(join(fixture, 'src', 'shared', 'types.ts'), `
export interface LLMProvider { complete(input: string): Promise<string> }
export interface Driver { query(input: string): Promise<string> }
export interface ConnectionResolver { withConnection(id: string): Promise<Driver> }
`);
		writeFileSync(join(fixture, 'src', 'caller.ts'), `
import type { LLMProvider as Renamed, ConnectionResolver as Port, Driver } from './shared/types.js';
import { writeFile as renamedWrite } from 'node:fs/promises';
declare const provider: Renamed;
declare const resolver: Port;
declare const injected: () => Promise<Driver>;
declare const providerFactory: () => Promise<Renamed>;
const { complete: detachedComplete } = provider;
const { withConnection: detachedResolve } = resolver;
const pack = JSON.stringify;
async function run() {
 await detachedComplete('canary'); await detachedResolve('id');
 await injected(); await providerFactory();
 await renamedWrite('/not-executed', pack({ marker: 'canary' }));
}
`);
		const actual = sessionSourceInventory(fixture).filter(s => s.file === 'src/caller.ts');
		for (const [expression, boundary] of [['detachedComplete', 'provider-use'], ['detachedResolve', 'connection-use'],
			['injected', 'connection-factory'], ['providerFactory', 'provider-factory'], ['pack', 'serialization'], ['renamedWrite', 'filesystem-write']]) {
			assert.ok(actual.some(s => s.expression === expression && s.boundary === boundary), `${expression}: ${boundary}`);
		}
	} finally { rmSync(fixture, { recursive: true, force: true }); }
});
