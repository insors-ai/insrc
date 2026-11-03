/**
 * Epic c2ba6fa6, Story s9, t3 -- C and C++ are one family in the cross-file
 * pass (user decision 2026-11-02). Over a real temporary store and the real
 * cross-file pass: a call in a .c file to a function declared in an included
 * .h, which the C++ reader reads as 'cpp', is resolved; a Python call to a
 * same-named function of an imported Go file is still not.
 *
 * Run: npx tsx --test src/indexer/__tests__/cross-file-c-family.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { closeGraphStore, setGraphStorePath } from '../../db/graph/store.js';
import { upsertEntities } from '../../db/entities.js';
import { upsertRelations } from '../../db/relations.js';
import { findCallees } from '../../db/search.js';
import { addRepo } from '../../db/repos.js';
import type { DbClient } from '../../db/client.js';
import type { Entity, EntityKind, Language, Relation } from '../../shared/types.js';
import { runCrossFileResolver } from '../cross-file-resolver.js';
import { detectSourceRoots } from '../source-roots.js';
import { makeEntityId } from '../parser/base.js';
import { useTemporaryLance } from '../../db/lance/__tests__/helpers/temp-lance.js';

useTemporaryLance();

let dir: string;
let repo: string;
test.beforeEach(async () => {
	await closeGraphStore();
	dir = realpathSync(mkdtempSync(join(tmpdir(), 'insrc-s9-c-family-')));
	setGraphStorePath(join(dir, 'graph.lmdb'));
	repo = join(dir, 'repo');
	mkdirSync(join(repo, 'src'), { recursive: true });
	await addRepo(null, { path: repo, name: 'c-family', addedAt: '2026-11-02T00:00:00.000Z', status: 'ready' });
});
test.afterEach(async () => {
	await closeGraphStore();
	rmSync(dir, { recursive: true, force: true });
});

function ent(kind: EntityKind, name: string, rel: string, language: Language, extra: Partial<Entity> = {}): Entity {
	const file = join(repo, rel);
	return {
		id: makeEntityId(repo, file, kind, kind === 'file' ? file : name), kind, name: kind === 'file' ? file : name, language,
		repoId: 1, repo, file, startLine: 1, endLine: 2, body: `${name}`, embedding: [], indexedAt: '2026-11-02T00:00:00.000Z', ...extra,
	};
}
/** A file that imports another and calls `callee` from `caller`, written as the indexer writes them. */
async function seed(callerLang: Language, callerFile: string, targetLang: Language, targetFile: string, callee: string): Promise<{ caller: Entity; target: Entity }> {
	const [fCaller, fTarget] = [ent('file', '', callerFile, callerLang), ent('file', '', targetFile, targetLang)];
	const caller = ent('function', 'main', callerFile, callerLang);
	const target = ent('function', callee, targetFile, targetLang, { isExported: true });
	await upsertEntities(null, [fCaller, fTarget, caller, target]);
	const rels: Relation[] = [
		{ kind: 'IMPORTS', from: fCaller.id, to: fTarget.id, resolved: true, meta: { repo, file: fCaller.file }, evidence: 'extracted' },
		{ kind: 'CALLS', from: caller.id, to: callee, resolved: false, meta: { repo, file: caller.file } },
	];
	await upsertRelations(null, rels);
	return { caller, target };
}
const settle = () => runCrossFileResolver({ db: null as unknown as DbClient, repoRoot: repo, sourceRoots: detectSourceRoots(repo) });

test('s9 t3: a C caller resolves to a function declared in an included .h read as cpp; a Python caller still never resolves to a same-named Go function', async () => {
	const c = await seed('c', 'src/main.c', 'cpp', 'src/util.h', 'util_go');
	const py = await seed('python', 'src/app.py', 'go', 'src/lib.go', 'helper');

	await settle();

	assert.deepEqual((await findCallees(null, c.caller.id)).map(e => `${e.name}: ${e.evidence}`), ['util_go: inferred']);
	assert.deepEqual(await findCallees(null, py.caller.id), [], 'Python and Go are not one family');
});
