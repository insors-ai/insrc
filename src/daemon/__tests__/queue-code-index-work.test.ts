/**
 * ISSUE-1102dc71 S001/t3 — IndexQueue.codeIndexWorkFor: the code-graph work a
 * code review waits on, queued and in flight, for one repo only.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, sep } from 'node:path';

import { IndexQueue } from '../queue.js';
import type { IndexJob } from '../../shared/types.js';

const A = join('/work', 'repoA');
const B = join('/work', 'repoB');

test('codeIndexWorkFor counts full, reconcile and file jobs for the repository (in flight and pending) and ignores other repositories, a prefix-sharing repository, config, reembed and document-summary jobs; the in-flight job clears after a throwing processor', async () => {
	const q = new IndexQueue();
	// Counted for A.
	q.enqueue({ kind: 'full', repoPath: A });
	q.enqueue({ kind: 'reconcile', repoPath: A });
	q.enqueue({ kind: 'file', filePath: join(A, 'src', 'x.ts'), event: 'update' });
	// Not counted for A.
	q.enqueue({ kind: 'full', repoPath: B });
	q.enqueue({ kind: 'file', filePath: join(B, 'y.ts'), event: 'create' });
	q.enqueue({ kind: 'file', filePath: `${A}lpha${sep}z.ts`, event: 'update' });
	q.enqueue({ kind: 'reembed', repoPath: A });
	q.enqueue({ kind: 'doc-summarise-repo', repoPath: A });
	q.enqueue({ kind: 'doc-summarise-entity', entityId: 'e1' });
	q.enqueue({ kind: 'config-full', scope: { kind: 'project', repoPath: A } });
	q.enqueue({ kind: 'config-file', filePath: join(A, '.insrc', 'config.json'), scope: { kind: 'project', repoPath: A }, event: 'update' });

	assert.deepEqual(q.codeIndexWorkFor(A), { inFlight: false, pending: 3 });
	assert.deepEqual(q.codeIndexWorkFor(B), { inFlight: false, pending: 2 });
	assert.equal(q.depthForRepo(A), 6, 'depthForRepo still counts every per-repo kind');

	// Drain: observe codeIndexWorkFor(A) while each job is in flight; the first throws.
	const seen: { kind: string; inFlight: boolean; pending: number }[] = [];
	let first = true;
	let done!: () => void;
	const drained = new Promise<void>(r => { done = r; });
	const processor = async (job: IndexJob): Promise<void> => {
		seen.push({ kind: job.kind, ...q.codeIndexWorkFor(A) });
		if (q.depth === 0) setImmediate(() => { q.stop(); done(); });
		if (first) { first = false; throw new Error('processor failed'); }
	};
	const running = q.start(processor);
	await drained;
	await running;

	assert.deepEqual(seen[0], { kind: 'full', inFlight: true, pending: 2 }, 'the in-flight full job counts, the two queued A jobs count');
	assert.deepEqual(seen[1], { kind: 'reconcile', inFlight: true, pending: 1 }, 'after the throw, the next job is the in-flight one');
	assert.deepEqual(seen[2], { kind: 'file', inFlight: true, pending: 0 });
	assert.deepEqual(seen[3], { kind: 'full', inFlight: false, pending: 0 }, "another repository's job in flight is not A's work");
	assert.ok(seen.slice(3).every(s => !s.inFlight && s.pending === 0), 'no other job counts for A');
	assert.deepEqual(q.codeIndexWorkFor(A), { inFlight: false, pending: 0 }, 'cleared once drained');
});

test('codeIndexWorkFor clears the in-flight job when the processor throws', async () => {
	const q = new IndexQueue();
	q.enqueue({ kind: 'full', repoPath: A });
	let stopped!: () => void;
	const after = new Promise<void>(r => { stopped = r; });
	const running = q.start(async () => { setImmediate(() => { q.stop(); stopped(); }); throw new Error('boom'); });
	await after;
	await running;
	assert.deepEqual(q.codeIndexWorkFor(A), { inFlight: false, pending: 0 });
});
