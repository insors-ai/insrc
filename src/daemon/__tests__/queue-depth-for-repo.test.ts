/**
 * Unit tests for IndexQueue.depthForRepo (Story add-new-repo-stats-daemon-ipc /
 * S001): per-repo attribution of each IndexJob variant + encapsulation.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, sep } from 'node:path';

import { IndexQueue } from '../queue.js';
import type { ConfigScope } from '../../shared/types.js';

const A = join('/work', 'repoA');
const B = join('/work', 'repoB');
const globalScope: ConfigScope = { kind: 'global' };

test('depthForRepo counts repoPath-named jobs (full/reembed/doc-summarise-repo) for that repo', () => {
	const q = new IndexQueue();
	q.enqueue({ kind: 'full', repoPath: A });
	q.enqueue({ kind: 'reembed', repoPath: A });
	q.enqueue({ kind: 'doc-summarise-repo', repoPath: A });
	q.enqueue({ kind: 'full', repoPath: B });

	assert.equal(q.depthForRepo(A), 3);
	assert.equal(q.depthForRepo(B), 1);
});

test('depthForRepo counts file/config-file jobs whose filePath is under the repo (repoPath+sep)', () => {
	const q = new IndexQueue();
	q.enqueue({ kind: 'file', filePath: join(A, 'src', 'x.ts'), event: 'update' });
	q.enqueue({ kind: 'config-file', filePath: join(A, '.insrc', 'config.json'), scope: { kind: 'project', repoPath: A }, event: 'update' });
	q.enqueue({ kind: 'file', filePath: join(B, 'y.ts'), event: 'create' });
	// A sibling repo that shares a prefix but is NOT under A (repoA vs repoAlpha).
	q.enqueue({ kind: 'file', filePath: `${A}lpha${sep}z.ts`, event: 'update' });

	assert.equal(q.depthForRepo(A), 2, 'the two jobs under A/, not the repoAlpha sibling');
	assert.equal(q.depthForRepo(B), 1);
});

test('repo-agnostic jobs (config-full/config-reindex/doc-summarise-entity) and other-repo jobs do NOT count', () => {
	const q = new IndexQueue();
	q.enqueue({ kind: 'config-full', scope: globalScope });
	q.enqueue({ kind: 'config-reindex', scope: globalScope });
	q.enqueue({ kind: 'doc-summarise-entity', entityId: 'abc' });
	q.enqueue({ kind: 'full', repoPath: B });

	assert.equal(q.depthForRepo(A), 0);
	assert.equal(q.depthForRepo(B), 1);
});

test('depthForRepo returns 0 for a repo with no queued jobs; get depth() is the global total', () => {
	const q = new IndexQueue();
	q.enqueue({ kind: 'full', repoPath: A });
	q.enqueue({ kind: 'full', repoPath: B });

	assert.equal(q.depthForRepo('/work/never'), 0);
	assert.equal(q.depth, 2, 'the global depth counts every job regardless of repo');
});
