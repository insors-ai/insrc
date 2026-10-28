/**
 * The async attempt of the GitHub adapter (Story s10): a non-denial exception becomes a failed result of kind rejected, a gh
 * failure keeps its kind, and a denial is thrown and never becomes a result.
 * Run: npx tsx --test-force-exit src/workflow/tracker/__tests__/adapter-attempt.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createGithubTracker } from '../github-adapter.js';
import { GhCommandError } from '../github.js';
import type { RegistryTable } from '../registry-table.js';
import { ToolDenied } from '../tool-denied.js';

const isDenied = (e: unknown): boolean => e instanceof ToolDenied && e.reason === 'declined';

/** A table whose every row calls `row`; only the rows the adapter uses matter here. */
function tableOf(row: (name: string) => unknown): RegistryTable {
	return new Proxy({}, { get: (_t, name) => async (..._args: unknown[]) => row(String(name)) }) as unknown as RegistryTable;
}

describe('adapter-attempt.test.ts: async attempt keeps the conversion of non-denial exceptions to rejected and rethrows ToolDenied', () => {
	it('a plain exception is a rejected result carrying its message, and a gh failure keeps its kind', async () => {
		const plain = createGithubTracker('o', 'r', { table: tableOf(() => { throw new Error('boom'); }) });
		assert.deepEqual(await plain.issueOps.close('o/r#1'), { ok: false, kind: 'rejected', reason: 'boom' });
		assert.deepEqual(await plain.findIssue(['a']), { ok: false, kind: 'rejected', reason: 'boom' });
		const gh = createGithubTracker('o', 'r', { table: tableOf(() => { throw new GhCommandError('unreachable', 'gh timed out'); }) });
		assert.deepEqual(await gh.readAssignee('o/r#1'), { ok: false, kind: 'unreachable', reason: 'gh timed out' });
		assert.deepEqual(await gh.whoAmI(), { ok: false, kind: 'unreachable', reason: 'gh timed out' });
	});

	it('a denial is thrown from every kind of call, never returned as a result', async () => {
		const t = createGithubTracker('o', 'r', { table: tableOf(() => { throw new ToolDenied('gh_tracker', 'declined'); }) });
		await assert.rejects(t.whoAmI(), isDenied);
		await assert.rejects(t.issueOps.create({ title: 't', body: 'b', labels: [] }), isDenied);
		await assert.rejects(t.issueOps.comment('o/r#1', 'x'), isDenied);
		await assert.rejects(t.createIssue({ title: 't', body: 'b', labels: [] }), isDenied);
		await assert.rejects(t.listComments('o/r#1'), isDenied);
		await assert.rejects(t.setAssignee('o/r#1', null), isDenied);
		await assert.rejects(t.openSignoffRequest({ title: 't', body: 'b', unit: { unit: 'epic', repoPath: '/r', epicHash: 'a3f4b8c9d1e2f3a4' }, artifacts: [], branch: 'b', issue: 'o/r#1' }), isDenied);
	});

	it('the results of linkSubIssue, close, comment and ensureMilestone are the table calls made, in order, and a failed sub-issue link after a create is logged and keeps the issue but a denied one is thrown', async () => {
		const calls: string[] = [];
		const ok = new Proxy({}, { get: (_t, name) => async (...args: unknown[]) => {
			calls.push(`${String(name)}:${args.slice(2).map(a => JSON.stringify(a)).join(',')}`);
			if (name === 'ghCreateIssueTyped') return { ref: 'o/r#5', id: 55, typed: true };
			return undefined;
		} }) as unknown as RegistryTable;
		const t = createGithubTracker('o', 'r', { table: ok });
		assert.deepEqual(await t.issueOps.ensureMilestone('m1'), undefined);
		assert.deepEqual(await t.issueOps.close('o/r#5'), { ok: true, value: undefined });
		assert.deepEqual(await t.issueOps.comment('o/r#5', 'hi'), { ok: true, value: undefined });
		assert.deepEqual(await t.issueOps.linkSubIssue('o/r#1', 55), { ok: true, value: undefined });
		assert.deepEqual(await t.createIssue({ title: 't', body: 'b', labels: [], parent: 'o/r#1' }), { ok: true, value: 'o/r#5' });
		assert.deepEqual(calls.map(c => c.split(':')[0]), ['ghEnsureMilestone', 'ghCloseIssue', 'ghComment', 'ghLinkSubIssue', 'ghCreateIssueTyped', 'ghLinkSubIssue']);

		const linkFails = new Proxy({}, { get: (_t, name) => async () => {
			if (name === 'ghCreateIssueTyped') return { ref: 'o/r#6', id: 66, typed: false };
			throw new GhCommandError('rejected', 'sub-issues disabled');
		} }) as unknown as RegistryTable;
		assert.deepEqual(await createGithubTracker('o', 'r', { table: linkFails }).createIssue({ title: 't', body: 'b', labels: [], parent: 'o/r#1' }), { ok: true, value: 'o/r#6' });
		const linkDenied = new Proxy({}, { get: (_t, name) => async () => {
			if (name === 'ghCreateIssueTyped') return { ref: 'o/r#6', id: 66, typed: false };
			throw new ToolDenied('gh_tracker', 'declined');
		} }) as unknown as RegistryTable;
		await assert.rejects(createGithubTracker('o', 'r', { table: linkDenied }).createIssue({ title: 't', body: 'b', labels: [], parent: 'o/r#1' }), isDenied);
	});
});
