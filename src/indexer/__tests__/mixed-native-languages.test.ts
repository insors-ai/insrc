/**
 * Epic c2ba6fa6, Story s9, t7 (ac1) -- a repository with Rust, C#, C and C++
 * files indexed through IndexerService stores, per language, file, function
 * and type entities and IMPORTS and CALLS relationships. The real full index
 * (readers, resolver, cross-file pass) over a temporary store; no embedding
 * backend is set, so no model runs. Across files: a Rust call through `use`
 * and a C call into a header read as C++ resolve ('inferred'); a C# call
 * through a using namespace stays pending (the stated limitation).
 *
 * Run: npx tsx --test src/indexer/__tests__/mixed-native-languages.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { closeGraphStore, setGraphStorePath } from '../../db/graph/store.js';
import { useTemporaryLance } from '../../db/lance/__tests__/helpers/temp-lance.js';
import { addRepo } from '../../db/repos.js';
import { findCallees } from '../../db/search.js';
import { entityU64ForId, findEntitiesByFile, getEntity } from '../../db/entities.js';
import { outNeighbors } from '../../db/graph/edges.js';
import { listUnresolvedRelations } from '../../db/relations.js';
import type { DbClient } from '../../db/client.js';
import type { Entity } from '../../shared/types.js';
import { IndexQueue } from '../../daemon/queue.js';
import type { Watcher } from '../watcher.js';
import { IndexerService } from '../index.js';
import { makeEntityId } from '../parser/base.js';

useTemporaryLance();

const FILES: Record<string, string> = {
	'rust/Cargo.toml':    '[package]\nname = "demo"\n',
	'rust/src/main.rs':   'mod util;\nuse util::run;\nuse serde::Serialize;\npub struct Config { n: u8 }\nfn main() { run(); local(); }\nfn local() {}\n',
	'rust/src/util.rs':   'pub fn run() {}\n',
	'c/util.h':           'int util_add(int a, int b);\n',
	'c/main.c':           '#include <stdio.h>\n#include "util.h"\ntypedef struct { int x; } point;\nstatic int helper(void) { return 1; }\nint main(void) { return util_add(helper(), 2); }\n',
	'cpp/shape.hpp':      '#include <vector>\nclass Shape { public: double area() const; };\n',
	'cpp/shape.cpp':      '#include "shape.hpp"\nstatic double scale(double x) { return x; }\ndouble Shape::area() const { return scale(2); }\n',
	'cs/App.cs':          'using Geo.Util;\nnamespace Geo.App {\n\tpublic class App { public void Run() { Calc.Go(); Local(); } void Local() { } }\n}\n',
	'cs/Lib.cs':          'namespace Geo.Util {\n\tpublic static class Calc { public static void Go() { } }\n}\n',
};

let store: string;
let repo: string;
test.before(async () => {
	await closeGraphStore();
	store = mkdtempSync(join(tmpdir(), 'insrc-s9-mixed-store-'));
	setGraphStorePath(join(store, 'graph.lmdb'));
	repo = realpathSync(mkdtempSync(join(tmpdir(), 'insrc-s9-mixed-repo-')));
	for (const [f, text] of Object.entries(FILES)) {
		mkdirSync(dirname(join(repo, f)), { recursive: true });
		writeFileSync(join(repo, f), text);
	}
	await addRepo(null, { path: repo, name: 'mixed', addedAt: '2026-11-02T00:00:00.000Z', status: 'pending' });
	const watcher = { onEvents() {}, async addRepo() {}, async removeRepo() {}, async addConfigDir() {} } as unknown as Watcher;
	await new IndexerService(null as unknown as DbClient, new IndexQueue(), watcher, undefined, 600_000).processJob({ kind: 'full', repoPath: repo });
});
test.after(async () => {
	await closeGraphStore();
	rmSync(store, { recursive: true, force: true });
	rmSync(repo, { recursive: true, force: true });
});

const at = (rel: string) => join(repo, rel);
const stored = (rel: string) => findEntitiesByFile(null, at(rel));
const id = (rel: string, kind: string, name: string) => makeEntityId(repo, at(rel), kind, name);
/** The names of what a file's IMPORTS edges reach: a stored file (repo-relative) or a module stub. */
async function importsOf(rel: string): Promise<string[]> {
	const u64 = (await entityU64ForId(id(rel, 'file', at(rel))))!;
	const out: string[] = [];
	for (const n of await outNeighbors(u64, { kindFilter: ['IMPORTS'], withEvidence: true })) {
		const e = await entityByU64(n.u64);
		out.push(e === undefined ? `? ${n.u64}` : e.kind === 'module' ? `module ${e.name}` : e.file.slice(repo.length + 1));
	}
	return out.sort();
}
const u64Index = new Map<number, string>();
async function entityByU64(u64: number): Promise<Entity | undefined> {
	if (u64Index.size === 0) {
		for (const f of Object.keys(FILES)) for (const e of await stored(f)) u64Index.set((await entityU64ForId(e.id))!, e.id);
		for (const [ns, name] of [['cargo', 'serde'], ['native', 'stdio.h'], ['native', 'vector'], ['nuget', 'Geo.Util']] as const) {
			const mid = makeEntityId(ns, '', 'module', name);
			const u = await entityU64ForId(mid);
			if (u !== undefined) u64Index.set(u, mid);
		}
	}
	const eid = u64Index.get(u64);
	return eid === undefined ? undefined : (await getEntity(null, eid)) ?? undefined;
}
const callees = async (rel: string, kind: string, name: string) =>
	(await findCallees(null, id(rel, kind, name))).map(e => `${e.name} (${e.language}): ${e.evidence}`).sort();
const kinds = async (rel: string) => [...new Set((await stored(rel)).map(e => `${e.kind}:${e.language}`))].sort();

test('s9 t7 (ac1): a Rust, C#, C and C++ repository indexed through IndexerService stores, per language, file, function and type entities', async () => {
	assert.deepEqual(await kinds('rust/src/main.rs'), ['class:rust', 'file:rust', 'function:rust']);
	assert.deepEqual(await kinds('c/main.c'), ['file:c', 'function:c', 'type:c']);
	assert.deepEqual(await kinds('cpp/shape.hpp'), ['class:cpp', 'file:cpp', 'method:cpp']);
	assert.deepEqual(await kinds('cpp/shape.cpp'), ['file:cpp', 'function:cpp', 'method:cpp']);
	assert.deepEqual(await kinds('cs/App.cs'), ['class:csharp', 'file:csharp', 'method:csharp']);
});

test('s9 t7 (ac1): each language stores its IMPORTS -- files for includes and Rust modules, module stubs for external crates, system headers and namespaces', async () => {
	assert.deepEqual(await importsOf('rust/src/main.rs'), ['module serde', 'rust/src/util.rs']);
	assert.deepEqual(await importsOf('c/main.c'), ['c/util.h', 'module stdio.h']);
	assert.deepEqual(await importsOf('cpp/shape.cpp'), ['cpp/shape.hpp']);
	assert.deepEqual(await importsOf('cpp/shape.hpp'), ['module vector']);
	assert.deepEqual(await importsOf('cs/App.cs'), ['module Geo.Util']);
});

test('s9 t7 (ac1): each language stores its CALLS -- same-file calls extracted, Rust and C-to-header calls across files inferred, a C# call through a namespace pending', async () => {
	assert.deepEqual(await callees('rust/src/main.rs', 'function', 'main'), ['local (rust): extracted', 'run (rust): inferred']);
	assert.deepEqual(await callees('c/main.c', 'function', 'main'), ['helper (c): extracted', 'util_add (cpp): inferred']);
	assert.deepEqual(await callees('cpp/shape.cpp', 'method', 'Shape::area'), ['scale (cpp): extracted']);
	assert.deepEqual(await callees('cs/App.cs', 'method', 'Geo.App.App.Run'), ['Geo.App.App.Local (csharp): extracted']);

	const pending = (await listUnresolvedRelations(null, repo)).filter(r => r.kind === 'CALLS' && r.rawTo === 'Calc.Go');
	assert.equal(pending.length, 1, 'the C# call through a using namespace stays pending');
});
