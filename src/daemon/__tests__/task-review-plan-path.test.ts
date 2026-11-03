/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _setRepoSchemaGuardForTests } from '../repo-schema-guard.js';
import { startTaskReview } from '../task-review-rpc.js';

const epicHash = '1111111111111111';
const oid = 'a'.repeat(40);
const request = (repo: string, documents: Record<string, unknown>) => ({
	repo, reviewId: 'review-plan-path', attempt: 1, epicHash,
	packet: {
		storyId: 's1', functionalSummary: 'Change behaviour', documents,
		reviewSet: [{ commit: oid, parent: null, files: [{ path: 'src/a.ts', segments: [{ after: [1, 1] }] }] }], tests: [],
	},
});

test('src/daemon/__tests__/task-review-plan-path.test.ts: the plan-path identity check rejects a wrong plan document and is skipped when the packet has none', async () => {
	const repo = realpathSync(mkdtempSync(join(tmpdir(), 'task-review-plan-path-')));
	_setRepoSchemaGuardForTests(() => undefined);
	try {
		await assert.rejects(
			startTaskReview(request(repo, { lld: { path: 'lld.json', commit: oid }, plan: { path: 'docs/WRONG.json', commit: oid } })),
			/documents\.plan: Plan identity must match review subject/,
		);
		const skipped = await startTaskReview(request(repo, { lld: { path: 'lld.json', commit: oid } })).then(() => undefined, (error: unknown) => error);
		assert.ok(!(skipped instanceof TypeError), 'a missing plan document is not dereferenced');
		assert.doesNotMatch(String(skipped), /Plan identity must match review subject/, 'a packet without a plan document is not held to the plan identity');
	} finally { _setRepoSchemaGuardForTests(); rmSync(repo, { recursive: true, force: true }); }
});
