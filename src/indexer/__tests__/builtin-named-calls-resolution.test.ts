/**
 * ISSUE-1ad687e6 S001 t3 -- the restored calls resolve. Over a temporary store
 * and real files read by the TypeScript reader and the cross-file resolver: a
 * bare call to an imported user `parse`, a namespace-import call to `resolve`,
 * a call on a `new`-initialised field to `Store.emit` and a this-call to a
 * same-file method `push` each become an edge to the user definition, while
 * `items.find()` next to a same-file function `find` creates no edge to it.
 *
 * Run: npx tsx --test src/indexer/__tests__/builtin-named-calls-resolution.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { closeGraphStore, setGraphStorePath } from '../../db/graph/store.js';
import { useTemporaryLance } from '../../db/lance/__tests__/helpers/temp-lance.js';
import { upsertEntities } from '../../db/entities.js';
import { upsertRelations } from '../../db/relations.js';
import { addRepo, lookupRepoId } from '../../db/repos.js';
import { typescriptParser } from '../parser/typescript.js';
import { resolveRelations } from '../resolver.js';
import { runCrossFileResolver } from '../cross-file-resolver.js';
import { detectSourceRoots } from '../source-roots.js';
import { findEntitiesByFile } from '../../db/entities.js';
import { findCallers } from '../../db/search.js';

useTemporaryLance();

let dir: string;
let repo: string;

const FILES: Record<string, string> = {
	'src/p.ts': 'export function parse(text: string): string { return text; }\n',
	'src/ns.ts': 'export function resolve(): void {}\n',
	'src/store.ts': 'export class Store { emit(): void {} }\n',
	'src/main.ts': [
		"import { parse } from './p.js';",
		"import * as ns from './ns.js';",
		"import { Store } from './store.js';",
		'export function run(items: number[]): void {',
		"  parse('x');",
		'  ns.resolve();',
		'  items.find(x => x > 0);',
		'}',
		'export function find(): void {}',
		'export class Service {',
		'  private store = new Store();',
		'  go(): void { this.store.emit(); }',
		'  push(): void {}',
		'  all(): void { this.push(); }',
		'}',
		'',
	].join('\n'),
};

test.beforeEach(async () => {
	await closeGraphStore();
	dir = mkdtempSync(join(tmpdir(), 'insrc-builtin-calls-store-'));
	setGraphStorePath(join(dir, 'graph.lmdb'));
	repo = realpathSync(mkdtempSync(join(tmpdir(), 'insrc-builtin-calls-repo-')));
	mkdirSync(join(repo, 'src'));
	for (const [f, text] of Object.entries(FILES)) writeFileSync(join(repo, f), text);
	await addRepo(null, { path: repo, name: 'fixture', addedAt: '2026-11-03T00:00:00.000Z', status: 'ready' });
	const repoId = (await lookupRepoId(repo))!;
	for (const f of Object.keys(FILES)) {
		const abs = join(repo, f);
		const r = typescriptParser.parse(abs, readFileSync(abs, 'utf8'), repo, repoId);
		await upsertEntities(null, r.entities);
		await upsertRelations(null, resolveRelations(r.relations, abs, repo, r.entities));
	}
	await runCrossFileResolver({ db: null, repoRoot: repo, sourceRoots: detectSourceRoots(repo) });
});
test.afterEach(async () => {
	await closeGraphStore();
	rmSync(dir, { recursive: true, force: true });
	rmSync(repo, { recursive: true, force: true });
});

const callersIn = async (file: string): Promise<Record<string, readonly string[]>> => {
	// The callers of each entity of the file, straight from the graph (this used the old code-review grounding, retired with the review engine).
	const out: Record<string, readonly string[]> = {};
	for (const entity of await findEntitiesByFile(null, join(repo, file))) out[entity.name] = [...new Set((await findCallers(null, entity.id)).map(c => c.name))].sort();
	return out;
};

test('S001 t3: the restored calls resolve to the user definitions and items.find() links to no user find', async () => {
	assert.deepEqual((await callersIn('src/p.ts'))['parse'], ['run'], 'a bare call to an imported user parse');
	assert.deepEqual((await callersIn('src/ns.ts'))['resolve'], ['run'], 'a namespace-import call');
	assert.deepEqual((await callersIn('src/store.ts'))['emit'], ['go'], 'a call on a new-initialised field');
	const main = await callersIn('src/main.ts');
	assert.deepEqual(main['push'], ['all'], 'a this-call to a same-file method');
	assert.deepEqual(main['find'], [], 'items.find() on an array creates no edge to the user find');
});
