/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TaskReviewInputError } from '../../workflow/code-review/task-review/contracts.js';
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
		// without a plan document the plan-path check is skipped and the request goes on to the route rule, which refuses it there:
		// the empty repository has no stored artifacts, so the Story's route needs no documents and the lld is one too many
		const skipped = await startTaskReview(request(repo, { lld: { path: 'lld.json', commit: oid } })).then(() => undefined, (error: unknown) => error);
		assert.ok(skipped instanceof TaskReviewInputError, 'the request is refused with a review input error');
		assert.equal(skipped.field, 'documents', 'by the route rule, not by a plan document check (documents.plan)');
		assert.match(skipped.message, /Expected the documents none for this Story's route, got lld/);
	} finally { _setRepoSchemaGuardForTests(); rmSync(repo, { recursive: true, force: true }); }
});
