/**
 * module.profile reads a file whole for its entry-point markers
 * (LLD-b9d5c5c40df5a574-s4, task t6).
 *
 * The files are real, in a temporary repository, stored in a temporary graph
 * with the file hash the indexer stamps. A file the index cannot confirm holds
 * the file on disk is reported as not covered.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { getDb } from '../../../db/client.js';
import { upsertEntities } from '../../../db/entities.js';
import { closeGraphStore, setGraphStorePath } from '../../../db/graph/store.js';
import { addRepo } from '../../../db/repos.js';
import { makeEntityId } from '../../../indexer/parser/base.js';
import type { Entity } from '../../../shared/types.js';
import { permissiveIgnoreFilter } from '../../context/repo-ignore-filter.js';
import { indexerFileHash } from '../../item-length.js';

import { runModuleProfile } from '../module-profile.js';
import type { Exploration, ExplorationRunnerContext, ExplorationType } from '../types.js';

const NOW = '2026-10-08T10:00:00.000Z';

let dir: string;
let REPO: string;
let ctx: ExplorationRunnerContext;

function exp(type: ExplorationType, params: Record<string, unknown>): Exploration {
	return { id: `e-${type}`, type, purpose: 'test', params };
}

test.beforeEach(async () => {
	await closeGraphStore();
	dir = realpathSync(mkdtempSync(join(tmpdir(), 'insrc-module-profile-entrypoint-')));
	REPO = join(dir, 'repo');
	mkdirSync(REPO);
	setGraphStorePath(join(dir, 'graph.lmdb'));
	await addRepo(null, { path: REPO, name: '', addedAt: NOW, status: 'pending' });
	ctx = {
		runId: 'test', repoPath: REPO, closureRepos: [REPO],
		readDep: () => undefined, ignoreFilter: permissiveIgnoreFilter(REPO),
	} as ExplorationRunnerContext;
});

test.afterEach(async () => {
	await closeGraphStore();
	rmSync(dir, { recursive: true, force: true });
});

test('an entry point beyond the former first 4,096 characters is recognised and an unconfirmable file is reported as not covered', async () => {
	const write = async (rel: string, source: string, storedBody: string, diskSource: string = source): Promise<void> => {
		const file = join(REPO, rel);
		mkdirSync(dirname(file), { recursive: true });
		writeFileSync(file, diskSource);
		const e: Entity = {
			id: makeEntityId(REPO, file, 'file', file), kind: 'file', name: rel, language: 'python', repoId: 1, repo: REPO, file,
			startLine: 1, endLine: source.split('\n').length, body: storedBody, embedding: [], indexedAt: NOW,
			hash: indexerFileHash(source),
		};
		await upsertEntities(await getDb(), [e]);
	};
	const long = `${'# padding line\n'.repeat(400)}if __name__ == "__main__":\n    run()\n`;
	assert.ok(long.length > 4_096);
	await write('svc/late_main.py', long, long);                       // the marker lies past the former scan
	await write('svc/unstored.py', long, '');                          // the index stores no content: the file itself is read
	await write('svc/short.py', 'x = 1\n', 'x = 1\n');                 // no marker, fully read
	// The file changed after it was indexed: it cannot be confirmed, and the stored body holds no marker.
	await write('svc/changed.py', 'x = 2\n', 'x = 2\n', long);
	// Changed after it was indexed, and the stored body holds a marker: the entry point is still found, and the file still not covered.
	const marked = 'if __name__ == "__main__":\n    run()\n';
	await write('svc/changed_marked.py', marked, marked, 'x = 3\n');

	const out = await runModuleProfile(exp('module.profile', { path: join(REPO, 'svc') }), ctx);
	assert.deepEqual([...out.profile.entrypoints].sort(), [join(REPO, 'svc/changed_marked.py'), join(REPO, 'svc/late_main.py'), join(REPO, 'svc/unstored.py')]);
	const note = 'the file changed since it was indexed';
	assert.deepEqual([...(out.completeness.partlyRead ?? [])].sort((a, b) => (a.what < b.what ? -1 : 1)), [
		{ what: join(REPO, 'svc/changed.py'), readChars: 'x = 2\n'.length, totalChars: null, totalNote: note },
		{ what: join(REPO, 'svc/changed_marked.py'), readChars: marked.length, totalChars: null, totalNote: note },
	]);
	assert.equal(out.completeness.complete, false);
	assert.equal(out.completeness.basis, 'filesystem');
	assert.match(out.completeness.basisNote ?? '', /a marker anywhere in a file/);

	// The single-file form recognises the late marker and reports the unconfirmed file.
	const one = await runModuleProfile(exp('module.profile', { path: join(REPO, 'svc/late_main.py') }), ctx);
	assert.deepEqual(one.profile.entrypoints, [join(REPO, 'svc/late_main.py')]);
	assert.equal(one.completeness.partlyRead, undefined);
	assert.equal(one.completeness.complete, true);
	const changed = await runModuleProfile(exp('module.profile', { path: join(REPO, 'svc/changed.py') }), ctx);
	assert.equal(changed.completeness.partlyRead?.[0]?.totalChars, null);
	assert.equal(changed.completeness.complete, false);
});

