/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * ISSUE-ae864466e7f1f4ea — a call to a method of a class defined in another
 * file resolves through the caller's imports: a method of an exported class is
 * visible to the files that import it, a private one is not, and a name that
 * two imported classes share is recorded ambiguous, never guessed.
 *
 * The real TypeScript parser, the per-file resolver and the cross-file pass over
 * a temporary graph store; callers read through the code-review grounding's
 * real graph deps.
 *
 * Run: npx tsx --test src/indexer/__tests__/method-calls-cross-file.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { closeGraphStore, setGraphStorePath } from '../../db/graph/store.js';
import { useTemporaryLance } from '../../db/lance/__tests__/helpers/temp-lance.js';
import { upsertEntities } from '../../db/entities.js';
import { listUnresolvedRelations, upsertRelations } from '../../db/relations.js';
import { addRepo, lookupRepoId } from '../../db/repos.js';
import { typescriptParser } from '../parser/typescript.js';
import { resolveRelations } from '../resolver.js';
import { runCrossFileResolver } from '../cross-file-resolver.js';
import { detectSourceRoots } from '../source-roots.js';
import { assembleCodeReviewGrounding, realGroundingDeps } from '../../workflow/code-review/grounding.js';

useTemporaryLance();

let dir: string;
let repo: string;

const FILES: Record<string, string> = {
	'src/queue.ts': [
		'export class Queue {',
		'  enqueue(job: string): void { this.#log(job); }',
		'  private secret(): void {}',
		'  #log(_job: string): void {}',
		'  start(): void {}',
		'}',
		'class Hidden { reveal(): void {} }',
		'export const hidden = new Hidden();',
		'',
	].join('\n'),
	'src/worker.ts': 'export class Worker { start(): void {} }\n',
	'src/main.ts': [
		"import { Queue, hidden } from './queue.js';",
		"import { Worker } from './worker.js';",
		'export function run(q: Queue, w: Worker): void {',
		"  q.enqueue('job');",
		'  q.secret();',
		"  q.#log('x');",
		'  hidden.reveal();',
		'  w.start();',
		'}',
		'',
	].join('\n'),
};

test.beforeEach(async () => {
	await closeGraphStore();
	dir = mkdtempSync(join(tmpdir(), 'insrc-method-calls-store-'));
	setGraphStorePath(join(dir, 'graph.lmdb'));
	repo = realpathSync(mkdtempSync(join(tmpdir(), 'insrc-method-calls-repo-')));
	mkdirSync(join(repo, 'src'));
	for (const [f, text] of Object.entries(FILES)) writeFileSync(join(repo, f), text);
	await addRepo(null, { path: repo, name: 'fixture', addedAt: '2026-10-17T00:00:00.000Z', status: 'ready' });
	const repoId = (await lookupRepoId(repo))!;
	// Callees first: the order defect (Epic c2ba6fa6 s13) is not under test here.
	for (const f of ['src/queue.ts', 'src/worker.ts', 'src/main.ts']) {
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
	const g = await assembleCodeReviewGrounding(repo, [file], await realGroundingDeps());
	return Object.fromEntries(g.symbols.map(s => [s.name, s.callers]));
};

test("a call to a method of an exported class in an imported file is an edge from the caller", async () => {
	const callers = await callersIn('src/queue.ts');
	assert.deepEqual(callers['enqueue'], ['run']);
});

test('a private method, a #name method and a method of a class the file does not export are not resolved across files', async () => {
	const callers = await callersIn('src/queue.ts');
	assert.deepEqual(callers['secret'], [], 'private');
	assert.deepEqual(callers['reveal'], [], 'class not exported');
	assert.deepEqual(callers['#log'], ['enqueue'], 'a #name method keeps its same-file caller only');
});

test('a method name that two imported classes share is recorded ambiguous with both candidates, not guessed', async () => {
	assert.deepEqual((await callersIn('src/queue.ts'))['start'], []);
	assert.deepEqual((await callersIn('src/worker.ts'))['start'], []);
	const pending = await listUnresolvedRelations(null, repo, join(repo, 'src', 'main.ts'));
	const start = pending.find(r => r.kind === 'CALLS' && r.rawTo === 'start');
	assert.ok(start, 'the call stays pending');
	assert.equal((start.meta?.['candidates'] as unknown[] | undefined)?.length, 2, JSON.stringify(start.meta));
});
