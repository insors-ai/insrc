/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Tests for the classified, timed gh runner and the GitHub adapter built on it.
 * Everything runs against a fake exec seam — no gh, no network.
 *
 * Run: npx tsx --test src/workflow/tracker/__tests__/github-adapter.test.ts
 */

import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';

import { createGithubTracker } from '../github-adapter.js';
import {
	GH_TIMEOUT_MS, GhCommandError, ghAttachMilestone, ghCloseIssue, ghComment, ghCreateIssueTyped, ghCreateLabel, ghEditIssueBody,
	ghEnsureMilestone, ghGetIssueBody, ghLinkSubIssue, runGh, _setTrackerExecForTests,
} from '../github.js';
import type { IssueSpec } from '../port.js';

afterEach(() => _setTrackerExecForTests());

function execError(props: Record<string, unknown>, message = 'Command failed'): Error {
	return Object.assign(new Error(message), props);
}

function failWith(err: Error): void {
	_setTrackerExecForTests(() => { throw err; });
}

function kindOf(fn: () => unknown): GhCommandError {
	try { fn(); } catch (e) {
		assert.ok(e instanceof GhCommandError, `expected GhCommandError, got ${String(e)}`);
		return e;
	}
	assert.fail('expected runGh to throw');
}

// ---------------------------------------------------------------------------
// runGh
// ---------------------------------------------------------------------------

test('runGh classifies ENOENT, authentication failure, timeout and other failures', () => {
	failWith(execError({ code: 'ENOENT' }, 'spawnSync gh ENOENT'));
	const missingTool = kindOf(() => runGh(['api', 'user']));
	assert.equal(missingTool.kind, 'missing-tool');
	assert.match(missingTool.reason, /gh CLI is not installed/);

	failWith(execError({ stderr: 'You are not logged in to any GitHub hosts. Run gh auth login to authenticate.' }));
	const signin = kindOf(() => runGh(['api', 'user']));
	assert.equal(signin.kind, 'missing-signin');
	assert.match(signin.reason, /gh auth login/);

	failWith(execError({ code: 'ETIMEDOUT' }));
	assert.equal(kindOf(() => runGh(['api', 'user'])).kind, 'unreachable');

	failWith(execError({ killed: true, signal: 'SIGTERM' }));
	const killed = kindOf(() => runGh(['api', 'user']));
	assert.equal(killed.kind, 'unreachable');
	assert.match(killed.reason, /timed out after 10 s/);

	// Only a timeout is 'unreachable'; any other failure (a network error included)
	// is 'rejected' and carries gh's own message.
	failWith(execError({ stderr: 'dial tcp: lookup api.github.com: could not resolve host' }));
	const network = kindOf(() => runGh(['api', 'user']));
	assert.equal(network.kind, 'rejected');
	assert.match(network.reason, /could not resolve host/);

	failWith(execError({ stderr: 'HTTP 422: Validation Failed' }));
	const other = kindOf(() => runGh(['api', 'user']));
	assert.equal(other.kind, 'rejected');
	assert.equal(other.reason, 'HTTP 422: Validation Failed');
	assert.equal(other.message, other.reason);
});

test('runGh passes the 10 s timeout option to the exec seam', () => {
	const seen: Array<{ cmd: string; args: readonly string[]; opts: Record<string, unknown> | undefined }> = [];
	_setTrackerExecForTests((cmd, args, opts) => {
		seen.push({ cmd, args, opts: opts as Record<string, unknown> | undefined });
		return ' octo \n';
	});

	assert.equal(GH_TIMEOUT_MS, 10_000);
	assert.equal(runGh(['api', 'user', '-q', '.login']), 'octo');
	assert.equal(runGh(['issue', 'close', '1'], { discardOutput: true }), '');

	assert.equal(seen.length, 2);
	assert.equal(seen[0]?.cmd, 'gh');
	assert.deepEqual(seen[0]?.args, ['api', 'user', '-q', '.login']);
	assert.equal(seen[0]?.opts?.['timeout'], 10_000);
	assert.equal(seen[0]?.opts?.['encoding'], 'utf8');
	assert.equal(seen[1]?.opts?.['timeout'], 10_000);
	assert.deepEqual(seen[1]?.opts?.['stdio'], ['ignore', 'ignore', 'pipe']);
});

// ---------------------------------------------------------------------------
// Migrated wrappers (compatibility exceptions 1 and 2)
// ---------------------------------------------------------------------------

const hasType = (args: readonly string[]): boolean => args.some(a => a.startsWith('type='));

test('compatibility exception 1, a failed typed create is not retried untyped unless the type is rejected', () => {
	const failures: Array<[string, Error]> = [
		['timeout', execError({ code: 'ETIMEDOUT' })],
		['missing tool', execError({ code: 'ENOENT' })],
		['missing sign-in', execError({ stderr: 'gh auth login required' })],
		['non-type rejection', execError({ stderr: 'HTTP 403: Resource not accessible' })],
		['422 about an unknown type elsewhere', execError({ stderr: 'HTTP 422: Validation Failed: labels has unknown type' })],
		['422 about another field', execError({ stderr: 'HTTP 422: Validation Failed: title must be of type string' })],
	];
	for (const [label, err] of failures) {
		let posts = 0;
		_setTrackerExecForTests((_cmd, args) => { if (args.includes('POST')) posts += 1; throw err; });
		assert.throws(() => ghCreateIssueTyped('o', 'r', 't', 'b', ['x'], 'Task'), GhCommandError, label);
		assert.equal(posts, 1, `${label}: exactly one POST`);
	}
});

test('a typed create rejected as an unknown issue type is retried once untyped and reports typed false', () => {
	for (const stderr of ['HTTP 422: Validation Failed: issue type not enabled', 'HTTP 422: Unprocessable Entity: unknown issue type "Task"']) {
		const seen: boolean[] = [];
		_setTrackerExecForTests((_cmd, args) => {
			seen.push(hasType(args));
			if (hasType(args)) throw execError({ stderr });
			return JSON.stringify({ number: 7, id: 700 });
		});
		const r = ghCreateIssueTyped('o', 'r', 't', 'b', ['x'], 'Task');
		assert.deepEqual(seen, [true, false], stderr);
		assert.equal(r.typed, false);
		assert.equal(r.id, 700);
	}
});

test('compatibility exception 2, a migrated operation passes the 10 s timeout and a timeout is reported as unreachable', () => {
	let opts: Record<string, unknown> | undefined;
	_setTrackerExecForTests((_cmd, _args, o) => { opts = o as Record<string, unknown> | undefined; throw execError({ code: 'ETIMEDOUT' }); });
	assert.equal(kindOf(() => ghGetIssueBody('o', 'r', 'o/r#1')).kind, 'unreachable');
	assert.equal(opts?.['timeout'], GH_TIMEOUT_MS);
});

// ---------------------------------------------------------------------------
// Adapter core
// ---------------------------------------------------------------------------

test('whoAmI success, empty login converted to missing-signin, missing tool, missing sign-in and unreachable', () => {
	const port = createGithubTracker('o', 'r');
	_setTrackerExecForTests(() => 'subhagho\n');
	assert.deepEqual(port.whoAmI(), { ok: true, value: 'subhagho' });

	_setTrackerExecForTests(() => '');
	const empty = port.whoAmI();
	assert.equal(empty.ok, false);
	if (!empty.ok) assert.equal(empty.kind, 'missing-signin');

	const cases: Array<[string, Error]> = [
		['missing-tool', execError({ code: 'ENOENT' })],
		['missing-signin', execError({ stderr: 'gh auth login required' })],
		['unreachable', execError({ code: 'ETIMEDOUT' })],
	];
	for (const [kind, err] of cases) {
		failWith(err);
		const r = port.whoAmI();
		assert.equal(r.ok, false);
		if (!r.ok) assert.equal(r.kind, kind);
	}
});

test('findIssue returns the first of several matches and separates failure from not found', () => {
	const port = createGithubTracker('o', 'r');
	const argv: string[][] = [];
	// Several matches, in the order gh lists them. The fake applies the -q filter from
	// argv the way gh would, so the selection is whatever the adapter asked for.
	const matches = [{ number: 31 }, { number: 17 }, { number: 5 }];
	_setTrackerExecForTests((_c, args) => {
		argv.push([...args]);
		const filter = args[args.indexOf('-q') + 1];
		if (filter === '.[0].number') return `${matches[0]!.number}\n`;
		if (filter === 'min_by(.number).number') return `${Math.min(...matches.map(m => m.number))}\n`;
		throw new Error(`unexpected filter ${String(filter)}`);
	});
	assert.deepEqual(port.findIssue(['epic:x', 'insrc:story']), { ok: true, value: 'o/r#31' });
	assert.deepEqual(argv[0], ['issue', 'list', '--repo', 'o/r', '--state', 'all', '--json', 'number', '-q', '.[0].number', '--label', 'epic:x', '--label', 'insrc:story']);

	_setTrackerExecForTests(() => '');
	assert.deepEqual(port.findIssue(['a']), { ok: true, value: null });

	failWith(execError({ code: 'ETIMEDOUT' }));
	const failed = port.findIssue(['a']);
	assert.equal(failed.ok, false);
	if (!failed.ok) assert.equal(failed.kind, 'unreachable');
});

test('findIssues lists every open or closed match across all pages in ascending order, and a failure is not an answer', () => {
	const port = createGithubTracker('o', 'r');
	const argv: string[][] = [];
	// two pages, as `gh api --paginate` prints them, out of order
	_setTrackerExecForTests((_c, args) => { argv.push([...args]); return '31\n5\n\n17\n'; });
	assert.deepEqual(port.findIssues(['insrc:unit:x', 'epic:a b']), { ok: true, value: ['o/r#5', 'o/r#17', 'o/r#31'] });
	assert.deepEqual(argv[0], ['api', '--paginate', 'repos/o/r/issues?state=all&per_page=100&labels=insrc%3Aunit%3Ax,epic%3Aa%20b', '-q', '.[] | select(.pull_request | not) | .number'], 'closed issues included, pull requests left out');

	_setTrackerExecForTests(() => '');
	assert.deepEqual(port.findIssues(['a']), { ok: true, value: [] });

	_setTrackerExecForTests(() => 'not a number\n');
	assert.equal(port.findIssues(['a']).ok, false);

	failWith(execError({ code: 'ETIMEDOUT' }));
	const failed = port.findIssues(['a']);
	assert.equal(failed.ok, false);
	if (!failed.ok) assert.equal(failed.kind, 'unreachable');
});

test('signoff methods return rejected without running gh', () => {
	const port = createGithubTracker('o', 'r');
	let ran = 0;
	_setTrackerExecForTests(() => { ran += 1; return ''; });
	assert.equal(port.capabilities.has('signoff-request'), false);
	assert.equal(port.capabilities.has('completion'), false);
	for (const r of [port.openSignoffRequest({ title: 't', body: 'b' }), port.readSignoffState({ ref: 'x' })]) {
		assert.equal(r.ok, false);
		if (!r.ok) assert.equal(r.kind, 'rejected');
	}
	assert.equal(ran, 0);
});

// ---------------------------------------------------------------------------
// readAssignee / setAssignee
// ---------------------------------------------------------------------------

/** A fake gh holding a mutable assignee list for one issue. `stickyAdd` makes an add a no-op (partial state). */
function fakeAssigneeGh(initial: string[], opts: { stickyAdd?: boolean; failOn?: (args: readonly string[]) => Error | undefined } = {}) {
	let assignees = [...initial];
	const calls: string[][] = [];
	_setTrackerExecForTests((_cmd, args) => {
		calls.push([...args]);
		const err = opts.failOn?.(args);
		if (err !== undefined) throw err;
		if (args[0] === 'issue' && args[1] === 'view') return JSON.stringify({ assignees: assignees.map(login => ({ login })) });
		if (args[0] === 'issue' && args[1] === 'edit') {
			const rm = args.indexOf('--remove-assignee');
			if (rm >= 0) { const drop = args[rm + 1]!.split(','); assignees = assignees.filter(a => !drop.includes(a)); }
			const add = args.indexOf('--add-assignee');
			if (add >= 0 && opts.stickyAdd !== true) assignees.push(args[add + 1]!);
			return '';
		}
		throw new Error(`unexpected gh call ${args.join(' ')}`);
	});
	return { calls, now: () => [...assignees] };
}

const isEdit = (c: string[]): boolean => c[0] === 'issue' && c[1] === 'edit';

test('readAssignee returns the single login, null when unassigned and rejected for several or a malformed reference', () => {
	const port = createGithubTracker('o', 'r');
	fakeAssigneeGh(['alice']);
	assert.deepEqual(port.readAssignee('o/r#5'), { ok: true, value: 'alice' });
	fakeAssigneeGh([]);
	assert.deepEqual(port.readAssignee('o/r#5'), { ok: true, value: null });

	fakeAssigneeGh(['alice', 'bob']);
	const several = port.readAssignee('o/r#5');
	assert.equal(several.ok, false);
	if (!several.ok) { assert.equal(several.kind, 'rejected'); assert.match(several.reason, /alice, bob/); }

	const { calls } = fakeAssigneeGh(['alice']);
	for (const bad of ['not-a-ref', 'o/r', '#5', 'o/r#', '/r#5', 'o/#5', 'o/r#abc', 'o/r#5 ', 'o/r#5\n', '\no/r#5']) {
		const r = port.readAssignee(bad);
		assert.equal(r.ok, false, bad);
		if (!r.ok) assert.equal(r.kind, 'rejected');
	}
	assert.equal(calls.length, 0, 'a malformed reference never reaches gh');
});

test('setAssignee from zero, one and several assignees ends with exactly the requested user', () => {
	const port = createGithubTracker('o', 'r');
	for (const initial of [[], ['bob'], ['alice'], ['bob', 'carol'], ['alice', 'bob']]) {
		const gh = fakeAssigneeGh(initial);
		assert.deepEqual(port.setAssignee('o/r#5', 'alice'), { ok: true, value: undefined }, JSON.stringify(initial));
		assert.deepEqual(gh.now(), ['alice'], JSON.stringify(initial));
		assert.equal(gh.calls.filter(c => c[1] === 'view').length, 2, `read, then a re-read: ${JSON.stringify(initial)}`);
	}
});

test('setAssignee makes no change call when already right and clears for null', () => {
	const port = createGithubTracker('o', 'r');
	const same = fakeAssigneeGh(['Alice']);
	assert.equal(port.setAssignee('o/r#5', 'alice').ok, true);   // logins compare case-insensitively
	assert.equal(same.calls.filter(isEdit).length, 0);
	assert.equal(same.calls.filter(c => c[1] === 'view').length, 2, 'the outcome is re-read even when no change was needed');

	const none = fakeAssigneeGh([]);
	assert.equal(port.setAssignee('o/r#5', null).ok, true);
	assert.equal(none.calls.filter(isEdit).length, 0);
	assert.equal(none.calls.filter(c => c[1] === 'view').length, 2);

	const clear = fakeAssigneeGh(['alice', 'bob']);
	assert.equal(port.setAssignee('o/r#5', null).ok, true);
	assert.deepEqual(clear.now(), []);
	assert.equal(clear.calls.filter(isEdit).length, 1);
});

test('setAssignee reports rejected or unreachable without a retry when the re-read differs or a step times out', () => {
	const port = createGithubTracker('o', 'r');
	// The add did not take: the re-read differs, reported as rejected naming the state.
	const partial = fakeAssigneeGh(['bob'], { stickyAdd: true });
	const differs = port.setAssignee('o/r#5', 'alice');
	assert.equal(differs.ok, false);
	if (!differs.ok) { assert.equal(differs.kind, 'rejected'); assert.match(differs.reason, /expected alice/); }
	assert.equal(partial.calls.filter(c => c.includes('--add-assignee')).length, 1, 'the add is not retried');

	// A step that times out: unreachable, the state is unknown, nothing after it runs.
	const timeout = fakeAssigneeGh(['bob'], { failOn: a => (a.includes('--add-assignee') ? execError({ code: 'ETIMEDOUT' }) : undefined) });
	const timedOut = port.setAssignee('o/r#5', 'alice');
	assert.equal(timedOut.ok, false);
	if (!timedOut.ok) assert.equal(timedOut.kind, 'unreachable');
	assert.equal(timeout.calls.filter(c => c.includes('--add-assignee')).length, 1);
	assert.equal(timeout.calls.filter(c => c[1] === 'view').length, 1, 'no re-read after a failed step');

	// The first read timing out stops everything.
	const readFails = fakeAssigneeGh([], { failOn: () => execError({ code: 'ETIMEDOUT' }) });
	assert.equal(port.setAssignee('o/r#5', 'alice').ok, false);
	assert.equal(readFails.calls.length, 1);
});

// ---------------------------------------------------------------------------
// issueOps parity with the wrappers
// ---------------------------------------------------------------------------

/** Recording fake gh: REST creates answer { number, id }, everything else an empty string. */
function recordingGh(opts: { failOn?: (args: readonly string[]) => Error | undefined } = {}) {
	const calls: string[][] = [];
	let n = 40;
	_setTrackerExecForTests((_cmd, args) => {
		calls.push([...args]);
		const err = opts.failOn?.(args);
		if (err !== undefined) throw err;
		if (args[0] === 'api' && args.includes('POST') && (args.find(a => a.startsWith('repos/')) ?? '').endsWith('/issues')) {
			n += 1;
			return JSON.stringify({ number: n, id: 9000 + n });
		}
		return '';
	});
	return calls;
}

/** What tracker-auto does today for one create: the typed create, then the optional native sub-issue link. */
function legacyCreate(spec: IssueSpec): void {
	const created = ghCreateIssueTyped('o', 'r', spec.title, spec.body, spec.labels, spec.issueType);
	if (spec.parent !== undefined) ghLinkSubIssue('o', 'r', spec.parent, created.id);
}

function assertCreateParity(spec: IssueSpec): void {
	const legacy = recordingGh();
	legacyCreate(spec);
	const viaPort = recordingGh();
	const r = createGithubTracker('o', 'r').createIssue(spec);
	assert.equal(r.ok, true);
	assert.deepEqual(viaPort, legacy, 'the port runs the same gh argv in the same order');
	assert.equal(viaPort[0]!.some(a => a.startsWith('type=')), (spec.issueType ?? '').length > 0, 'a type is sent only when one is given');
	if ((spec.issueType ?? '').length > 0) assert.ok(viaPort[0]!.includes(`type=${spec.issueType}`));
	for (const l of spec.labels) assert.ok(viaPort[0]!.includes(`labels[]=${l}`));
	if (r.ok) assert.equal(r.value, 'o/r#41');
}

test('Epic create parity with ghCreateIssueTyped', () => {
	assertCreateParity({ title: 'E1 — problem', body: 'epic body', labels: ['insrc:epic', 'epic:slug'], issueType: 'Epic' });
});

test('Story create and Epic parent link parity', () => {
	assertCreateParity({ title: 'S1 — story', body: 'story body', labels: ['insrc:story', 'epic:slug'], issueType: 'Story', parent: 'o/r#10' });
	// A failed parent link never fails the create: the ref comes back ok.
	recordingGh({ failOn: a => (a.some(x => x.includes('sub_issues')) ? execError({ stderr: 'HTTP 403' }) : undefined) });
	const r = createGithubTracker('o', 'r').createIssue({ title: 't', body: 'b', labels: ['x'], parent: 'o/r#10' });
	assert.deepEqual(r, { ok: true, value: 'o/r#41' });
});

test('Task create and Story parent link parity', () => {
	assertCreateParity({ title: 'T1 — task', body: 'task body', labels: ['insrc:task', 'epic:slug'], issueType: 'Task', parent: 'o/r#20' });
	assertCreateParity({ title: 'T2 — untyped task', body: 'b', labels: ['insrc:task'], issueType: '', parent: 'o/r#20' });
});

test('each issueOps operation runs the same gh argv and keeps the same failure result as its wrapper', () => {
	const ops = createGithubTracker('o', 'r').issueOps;
	const run = (fn: () => unknown): string[][] => {
		const calls = recordingGh();
		fn();
		return calls;
	};
	const pairs: Array<[string, () => unknown, () => unknown]> = [
		['linkSubIssue', () => ops.linkSubIssue('o/r#10', 9001), () => ghLinkSubIssue('o', 'r', 'o/r#10', 9001)],
		['close', () => ops.close('o/r#4'), () => ghCloseIssue('o', 'r', 'o/r#4')],
		['comment', () => ops.comment('o/r#4', 'hi'), () => ghComment('o', 'r', 'o/r#4', 'hi')],
		['readBody', () => ops.readBody('o/r#4'), () => ghGetIssueBody('o', 'r', 'o/r#4')],
		['writeBody', () => ops.writeBody('o/r#4', 'new'), () => ghEditIssueBody('o', 'r', 'o/r#4', 'new')],
		['ensureLabel', () => ops.ensureLabel('insrc:epic'), () => ghCreateLabel('o', 'r', 'insrc:epic')],
		['ensureMilestone', () => ops.ensureMilestone('m1'), () => ghEnsureMilestone('o', 'r', 'm1')],
		['attachMilestone', () => ops.attachMilestone('o/r#4', 'm1'), () => ghAttachMilestone('o', 'r', 'o/r#4', 'm1')],
		['create', () => ops.create({ title: 't', body: 'b', labels: ['a'], issueType: 'Task' }), () => ghCreateIssueTyped('o', 'r', 't', 'b', ['a'], 'Task')],
	];
	for (const [name, viaOps, viaWrapper] of pairs) {
		assert.deepEqual(run(viaOps), run(viaWrapper), `${name}: same argv`);
	}

	// Failure results: the wrappers that throw come back as ok:false with the same kind and message; the
	// boolean and swallowing ones keep their legacy result.
	const boom = execError({ stderr: 'HTTP 500 boom' });
	recordingGh({ failOn: () => boom });
	for (const [name, viaOps, viaWrapper] of pairs) {
		if (name === 'ensureLabel' || name === 'ensureMilestone') continue;
		let thrown: unknown;
		try { viaWrapper(); } catch (e) { thrown = e; }
		assert.ok(thrown instanceof GhCommandError, `${name}: wrapper throws`);
		const r = viaOps() as { ok: boolean; kind?: string; reason?: string };
		assert.equal(r.ok, false, name);
		assert.equal(r.kind, (thrown as GhCommandError).kind, name);
		assert.equal(r.reason, (thrown as GhCommandError).reason, name);
	}
});

test('ensureLabel returns false on failure, ensureMilestone swallows a failed create, closing a closed issue succeeds', () => {
	const ops = createGithubTracker('o', 'r').issueOps;
	recordingGh({ failOn: () => execError({ code: 'ETIMEDOUT' }) });
	assert.equal(ops.ensureLabel('x'), false);
	assert.doesNotThrow(() => ops.ensureMilestone('m'));
	// gh exits 0 with a note when the issue is already closed.
	recordingGh();
	assert.deepEqual(ops.close('o/r#4'), { ok: true, value: undefined });
	assert.deepEqual(ops.close('o/r#4'), { ok: true, value: undefined });
});
