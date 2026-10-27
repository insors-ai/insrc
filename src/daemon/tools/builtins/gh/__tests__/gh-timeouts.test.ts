import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { ghTimeoutMs, registerGhLimits } from '../helpers.js';

/** What each existing tool had before the table: its own limit, else the 30 s default of ghExec. */
const TODAY_S: Record<string, number> = {
	gh_issue_list: 30, gh_issue_view: 30, gh_issue_create: 60, gh_issue_comment: 30, gh_issue_edit: 30, gh_issue_link: 30,
	gh_issue_close: 30, gh_issue_reopen: 30,
	gh_pr_list: 30, gh_pr_view: 30, gh_pr_diff: 60, gh_pr_checks: 30, gh_pr_files: 30, gh_pr_create: 90, gh_pr_edit: 30,
	gh_pr_comment: 30, gh_pr_review: 30, gh_pr_merge: 180, gh_pr_close: 30, gh_pr_ready: 30,
	gh_repo_view: 30, gh_repo_list: 30, gh_repo_create: 120, gh_repo_fork: 120, gh_repo_delete: 30, gh_repo_clone: 600,
	gh_release_list: 30, gh_release_view: 30, gh_release_create: 180, gh_release_edit: 30, gh_release_publish: 30, gh_release_delete: 30,
	gh_run_list: 30, gh_run_view: 60, gh_run_rerun: 30, gh_run_cancel: 30, gh_workflow_list: 30, gh_workflow_run: 60,
	gh_project_list: 30, gh_project_view: 30, 'gh:project:item-list': 30, 'gh:project:item-add': 30, 'gh:project:item-update': 30,
	'gh:project:item-archive': 30, 'gh:project:item-delete': 30, 'gh:project:field-list': 30,
};

test('gh-timeouts.test.ts: ghTimeoutMs gives each job the limit in the table and a missing key the class default', () => {
	const table: Record<string, number> = {
		gh_issue_create: 60, gh_pr_create: 90, gh_pr_merge: 180, gh_pr_diff: 60, gh_run_view: 60, gh_workflow_run: 60,
		gh_repo_create: 120, gh_repo_fork: 120, gh_repo_clone: 600, gh_release_create: 180,
	};
	for (const [toolId, seconds] of Object.entries(table)) { assert.equal(ghTimeoutMs({ toolId }), seconds * 1000, toolId); }
	assert.equal(ghTimeoutMs({ toolId: 'gh_pr_list' }), 30_000);
	registerGhLimits({ 'gh_probe.zap': 7 });
	assert.equal(ghTimeoutMs({ toolId: 'gh_probe', op: 'zap' }), 7_000);
	assert.equal(ghTimeoutMs({ toolId: 'gh_probe', op: 'other' }), 30_000);
	assert.equal(ghTimeoutMs({ toolId: 'gh_unknown_tool' }), 30_000);
	assert.equal(ghTimeoutMs({ toolId: 'gh_unknown_tool', mutating: true }), 60_000);
	assert.equal(ghTimeoutMs({ toolId: 'gh_unknown_tool', op: 'zap', mutating: false }), 30_000);
});

test("gh-timeouts.test.ts: no existing tool's limit is below its limit today", () => {
	for (const [toolId, seconds] of Object.entries(TODAY_S)) {
		assert.ok(ghTimeoutMs({ toolId }) >= seconds * 1000, `${toolId} would have ${ghTimeoutMs({ toolId })} ms, had ${seconds * 1000}`);
	}
});

test('gh-timeouts.test.ts: no ghExec call in issue.ts or pr.ts passes its own timeout', () => {
	const dir = dirname(dirname(fileURLToPath(import.meta.url)));
	for (const file of ['issue.ts', 'pr.ts']) {
		const text = readFileSync(join(dir, file), 'utf8');
		const calls = text.match(/ghExec\([^;]*;/g) ?? [];
		assert.ok(calls.length > 0, `${file} calls ghExec`);
		for (const call of calls) {
			assert.ok(!/timeoutMs/.test(call), `${file}: ${call}`);
			assert.ok(/key: \{ toolId: /.test(call), `${file} passes its limit key: ${call}`);
		}
		assert.ok(!/timeoutMs/.test(text), `${file} names no timeoutMs`);
	}
});

test('gh-timeouts.test.ts: no ghExec call in repo.ts, release.ts or project.ts passes its own timeout and clone keeps 600 s', () => {
	const dir = dirname(dirname(fileURLToPath(import.meta.url)));
	for (const file of ['repo.ts', 'release.ts', 'project.ts']) {
		const text = readFileSync(join(dir, file), 'utf8');
		const calls = text.match(/ghExec\([^;]*;/g) ?? [];
		assert.ok(calls.length > 0, `${file} calls ghExec`);
		for (const call of calls) {
			assert.ok(!/timeoutMs/.test(call), `${file}: ${call}`);
			assert.ok(/key: \{ toolId: /.test(call), `${file} passes its limit key: ${call}`);
		}
		assert.ok(!/timeoutMs/.test(text), `${file} names no timeoutMs`);
	}
	assert.equal(ghTimeoutMs({ toolId: 'gh_repo_clone' }), 600_000);
	assert.equal(ghTimeoutMs({ toolId: 'gh_release_create' }), 180_000);
});

import { readdirSync } from 'node:fs';
import { defineGhFamily, field, val } from '../op-table.js';
import { installFakeGh } from './_fakegh.js';
import { GH_UNKNOWN_OUTCOME } from '../helpers.js';

test('gh-timeouts.test.ts: a fake gh that outlives its limit ends with timed-out naming the command and the limit, a mutating time-out adds that the outcome is unknown, and no ghExec call outside the table passes its own timeout', async () => {
	const probe = defineGhFamily({
		id: 'gh_timeout_probe', description: 'probe',
		ops: [
			{ name: 'read', command: ['probe', 'read'], cls: 'none', limitS: 1, fields: { n: field.int() }, args: [val('-n', 'n')], out: { kind: 'text' } },
			{ name: 'write', command: ['probe', 'write'], cls: 'common', limitS: 1, fields: { n: field.int() }, args: [val('-n', 'n')], out: { kind: 'mutation' } },
		],
	});
	const gh = installFakeGh('sleep');
	const deps = { sessionId: 't', repoPath: '/tmp', send: () => {}, requestId: 0 };
	try {
		const started = Date.now();
		const read = await probe.execute({ op: 'read' }, deps);
		assert.ok(Date.now() - started < 4000, 'the limit ended the call, not the five-second sleep');
		assert.equal(read.success, false);
		assert.equal(read.failure?.kind, 'timed-out');
		assert.equal(read.failure?.message, 'gh probe read timed out after 1 s');
		assert.ok(!read.failure?.message.includes(GH_UNKNOWN_OUTCOME), 'a read does not claim an unknown outcome');
		const write = await probe.execute({ op: 'write', n: 2 }, deps);
		assert.equal(write.failure?.kind, 'timed-out');
		assert.equal(write.failure?.message, `gh probe write -n 2 timed out after 1 s; ${GH_UNKNOWN_OUTCOME}`);
	} finally { gh.restore(); }

	// no gh source outside helpers.ts passes its own timeout to a command
	const dir = dirname(dirname(fileURLToPath(import.meta.url)));
	for (const file of readdirSync(dir).filter(f => f.endsWith('.ts') && f !== 'helpers.ts')) {
		assert.ok(!/timeoutMs/.test(readFileSync(join(dir, file), 'utf8')), `${file} names no timeoutMs`);
	}
});

test('gh-timeouts.test.ts: the limit table has gh_auth.hosts at 15 s', async () => {
	await import('../account.js');   // defining the family registers its limits
	assert.equal(ghTimeoutMs({ toolId: 'gh_auth', op: 'hosts' }), 15_000);
	assert.equal(ghTimeoutMs({ toolId: 'gh_auth', op: 'status' }), 30_000);
});
