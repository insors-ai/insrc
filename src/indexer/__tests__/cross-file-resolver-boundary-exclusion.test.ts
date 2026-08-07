/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * S003 (t2) — the code-symbol Pass 2 resolver EXCLUDES external-boundary
 * relation kinds (CALLS_HTTP / ...): a boundary row is left untouched in the
 * unresolved store for the S003 endpoint pass, never re-pointed at a code
 * entity, while a sibling CALLS in the same batch resolves as before.
 *
 * Run: npx tsx --test src/indexer/__tests__/cross-file-resolver-boundary-exclusion.test.ts
 */

import { describe, it, before, after } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { closeGraphStore, getGraphStore, setGraphStorePath } from '../../db/graph/store.js';
import { closeLanceConn, setLanceConnPath } from '../../db/lance/conn.js';
import { _resetEntityVecCache } from '../../db/lance/entity-vec.js';
import { encodeOutEdgeKey, RELATION_KIND_BYTE, type RelationKind } from '../../db/graph/keys.js';
import { upsertEntities, entityU64ForId } from '../../db/entities.js';
import { addRepo } from '../../db/repos.js';
import { upsertRelations, listUnresolvedRelations } from '../../db/relations.js';
import type { Entity } from '../../shared/types.js';
import { makeEntityId } from '../parser/base.js';
import { runCrossFileResolver, BOUNDARY_RELATION_KINDS } from '../cross-file-resolver.js';
import { detectSourceRoots } from '../source-roots.js';

let tmpHome: string;

before(async () => {
	tmpHome = mkdtempSync(join(tmpdir(), 'insrc-s003-t2-'));
	await closeGraphStore();
	await closeLanceConn();
	_resetEntityVecCache();
	setGraphStorePath(join(tmpHome, 'graph.lmdb'));
	setLanceConnPath(join(tmpHome, 'lance'));
});
after(async () => {
	await closeGraphStore();
	await closeLanceConn();
	_resetEntityVecCache();
	try { rmSync(tmpHome, { recursive: true, force: true }); } catch { /* ignore */ }
});

function mkEntity(repo: string, file: string, kind: Entity['kind'], name: string, extra: Partial<Entity> = {}): Entity {
	return {
		id: makeEntityId(repo, file, kind, name),
		kind, name, language: 'python', repoId: 1, repo, file,
		startLine: 0, endLine: 0, body: '', embedding: [], indexedAt: new Date().toISOString(),
		...extra,
	};
}

async function countEdge(src: string, dst: string, kind: RelationKind): Promise<number> {
	const fromU64 = await entityU64ForId(src);
	const toU64 = await entityU64ForId(dst);
	if (fromU64 === undefined || toU64 === undefined) return 0;
	const store = await getGraphStore();
	return store.outEdge.get(encodeOutEdgeKey(fromU64, RELATION_KIND_BYTE[kind], toU64)) === undefined ? 0 : 1;
}

async function unresolvedFor(fromEntity: string, kind: string, repo: string) {
	const rows = await listUnresolvedRelations(null, repo);
	return rows.filter(r => r.fromEntity === fromEntity && r.kind === kind);
}

describe('S003 t2 — code-symbol resolver excludes CALLS_HTTP', () => {
	it('lists the four boundary kinds as excluded', () => {
		for (const k of ['CALLS_HTTP', 'PUBLISHES_TO', 'SUBSCRIBES_TO', 'CALLS_RPC'] as const) {
			assert.ok(BOUNDARY_RELATION_KINDS.has(k), `${k} must be excluded`);
		}
		assert.equal(BOUNDARY_RELATION_KINDS.has('CALLS'), false, 'plain CALLS must NOT be excluded');
	});

	it('leaves a CALLS_HTTP row unresolved (never re-pointed at a code entity) while a sibling CALLS resolves', async () => {
		const repo = mkdtempSync(join(tmpdir(), 'insrc-s003-t2-repo-'));
		await addRepo(null, { path: repo, name: '', addedAt: new Date().toISOString(), status: 'pending' });

		// helpers.py exports validate(); main.py's main() calls it (resolvable CALLS)
		// AND makes an HTTP call (CALLS_HTTP with a raw URL — must stay unresolved).
		const helpersFile = join(repo, 'helpers.py');
		const mainFile = join(repo, 'main.py');
		writeFileSync(helpersFile, 'def validate(x):\n    return x is not None\n');
		writeFileSync(mainFile, 'from helpers import validate\n\ndef main():\n    return validate(1)\n');

		const helpersFileEnt = mkEntity(repo, helpersFile, 'file', helpersFile);
		const validateFn = mkEntity(repo, helpersFile, 'function', 'validate', { isExported: true });
		const mainFileEnt = mkEntity(repo, mainFile, 'file', mainFile);
		const mainFn = mkEntity(repo, mainFile, 'function', 'main', { isExported: true });
		await upsertEntities(null, [helpersFileEnt, validateFn, mainFileEnt, mainFn]);

		await upsertRelations(null, [
			{ kind: 'IMPORTS', from: mainFileEnt.id, to: helpersFileEnt.id, resolved: true },
			{ kind: 'CALLS', from: mainFn.id, to: 'validate', resolved: false, meta: { file: mainFile, repo } },
			{ kind: 'CALLS_HTTP', from: mainFn.id, to: `'https://api.example.com/x'`, resolved: false, meta: { file: mainFile, repo } },
		]);

		const result = await runCrossFileResolver({ db: null, repoRoot: repo, sourceRoots: detectSourceRoots(repo) });

		// The sibling CALLS resolved as before.
		assert.equal(result.resolved, 1, `expected the CALLS to resolve; got ${JSON.stringify(result)}`);
		assert.equal(await countEdge(mainFn.id, validateFn.id, 'CALLS'), 1);

		// The CALLS_HTTP row is left untouched — still unresolved, still a raw URL,
		// never turned into a resolved edge by the code-symbol resolver.
		const httpRows = await unresolvedFor(mainFn.id, 'CALLS_HTTP', repo);
		assert.equal(httpRows.length, 1, 'CALLS_HTTP row must remain in the unresolved store');
		assert.equal(httpRows[0]!.rawTo, `'https://api.example.com/x'`, 'rawTo (the URL) must be unchanged');

		rmSync(repo, { recursive: true, force: true });
	});
});
