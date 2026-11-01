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
import { GH_TIMEOUT_MS, GhCommandError, ghAttachMilestone, ghCloseIssue, ghComment, ghCreateIssueTyped, ghCreateLabel, ghEditIssueBody, ghEnsureMilestone, ghGetIssueBody, ghGetIssueId, ghLinkSubIssue, runGh } from '../github.js';
import { installExecStandIn, installNoPrograms } from '../../__tests__/helpers/exec-stand-in.js';
import { _setApprovalGateForTests } from '../../../daemon/tools/executor.js';
import type { IssueSpec } from '../port.js';

afterEach(() => { installExecStandIn(); _setApprovalGateForTests(undefined); });
/** Every approval the tools ask for is answered yes (closing an issue, forcing a label and the like are asked for in a real run). */
const approveAll = (): void => _setApprovalGateForTests(() => ({ async ask(r) { return { requestId: r.requestId, decision: 'approve' }; } }));

function execError(props: Record<string, unknown>, message = 'Command failed'): Error {
	return Object.assign(new Error(message), props);
}

function failWith(err: Error): void {
	// a failure that only a missing program or a network message can express through the real tools
	if ((err as { code?: unknown }).code === 'ENOENT') { installNoPrograms(); return; }
	if ((err as { code?: unknown }).code === 'ETIMEDOUT') { installExecStandIn(() => { throw execError({ stderr: 'dial tcp: i/o timeout' }); }); return; }
	installExecStandIn(() => { throw err; });
}

/** The value following `flag` in an argv (undefined when absent). */
const flagValue = (call: readonly string[] | undefined, flag: string): string | undefined => { const i = call?.indexOf(flag) ?? -1; return i < 0 ? undefined : call?.[i + 1]; };
/** The minimal issue row the issue tools require. */
const issueRow = (extra: object = {}): object => ({ number: 5, title: 'an issue', state: 'OPEN', ...extra });

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

// wrapper-only: exercises the sync runGh that s9/t21 deletes; skipped until then
test.skip('runGh classifies ENOENT, authentication failure, timeout and other failures', async () => {
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

// wrapper-only: exercises the sync runGh that s9/t21 deletes; skipped until then
test.skip('runGh passes the 10 s timeout option to the exec seam', async () => {
	const seen: Array<{ cmd: string; args: readonly string[]; opts: Record<string, unknown> | undefined }> = [];
	installExecStandIn((cmd, args, opts) => {
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

test('compatibility exception 1, a failed typed create is not retried untyped unless the type is rejected', async () => {
	const ops = createGithubTracker('o', 'r').issueOps;
	const failures: Array<[string, Error, string]> = [
		['timeout', execError({ stderr: 'dial tcp: i/o timeout' }), 'unreachable'],
		['missing tool', execError({ code: 'ENOENT' }), 'missing-tool'],
		['missing sign-in', execError({ stderr: 'gh auth login required' }), 'missing-signin'],
		['non-type rejection', execError({ stderr: 'HTTP 403: Resource not accessible' }), 'rejected'],
		['422 about an unknown type elsewhere', execError({ stderr: 'HTTP 422: Validation Failed: labels has unknown type' }), 'rejected'],
		['422 about another field', execError({ stderr: 'HTTP 422: Validation Failed: title must be of type string' }), 'rejected'],
	];
	for (const [label, err, kind] of failures) {
		let posts = 0;
		if (kind === 'missing-tool') installNoPrograms();   // no program runs, so no POST is made at all
		else installExecStandIn((_cmd, args) => { if (args.includes('POST')) posts += 1; throw err; });
		const r = await ops.create({ title: 't', body: 'b', labels: ['x'], issueType: 'Task' });
		assert.equal(r.ok, false, label);
		if (!r.ok) assert.equal(r.kind, kind, label);
		if (kind !== 'missing-tool') assert.equal(posts, 1, `${label}: exactly one POST`);
	}
});

test('a typed create rejected as an unknown issue type is retried once untyped and reports typed false', async () => {
	const ops = createGithubTracker('o', 'r').issueOps;
	for (const stderr of ['HTTP 422: Validation Failed: issue type not enabled', 'HTTP 422: Unprocessable Entity: unknown issue type "Task"']) {
		const seen: boolean[] = [];
		installExecStandIn((_cmd, args) => {
			seen.push(hasType(args));
			if (hasType(args)) throw execError({ stderr });
			return JSON.stringify({ number: 7, id: 700 });
		});
		const r = await ops.create({ title: 't', body: 'b', labels: ['x'], issueType: 'Task' });
		assert.deepEqual(seen, [true, false], stderr);
		assert.equal(r.ok, true, stderr);
		if (r.ok) {
			assert.equal(r.value.typed, false);
			assert.equal(r.value.id, 700);
		}
	}
});

// wrapper-only: exercises the sync runGh that s9/t21 deletes; skipped until then
test.skip('compatibility exception 2, a migrated operation passes the 10 s timeout and a timeout is reported as unreachable', async () => {
	let opts: Record<string, unknown> | undefined;
	installExecStandIn((_cmd, _args, o) => { opts = o as Record<string, unknown> | undefined; throw execError({ code: 'ETIMEDOUT' }); });
	assert.equal(kindOf(() => ghGetIssueBody('o', 'r', 'o/r#1')).kind, 'unreachable');
	assert.equal(opts?.['timeout'], GH_TIMEOUT_MS);
});

// ---------------------------------------------------------------------------
// Adapter core
// ---------------------------------------------------------------------------

test('whoAmI success, empty login converted to missing-signin, missing tool, missing sign-in and unreachable', async () => {
	const port = createGithubTracker('o', 'r');
	installExecStandIn(() => '{"login":"subhagho"}');
	assert.deepEqual((await port.whoAmI()), { ok: true, value: 'subhagho' });

	installExecStandIn(() => '{"login":""}');
	const empty = (await port.whoAmI());
	assert.equal(empty.ok, false);
	// the current_login tool refuses an answer without a login as a rejected conversion (a signed-out gh fails with its own message, covered below)
	if (!empty.ok) assert.equal(empty.kind, 'rejected');

	const cases: Array<[string, Error]> = [
		['missing-tool', execError({ code: 'ENOENT' })],
		['missing-signin', execError({ stderr: 'gh auth login required' })],
		['unreachable', execError({ code: 'ETIMEDOUT' })],
	];
	for (const [kind, err] of cases) {
		failWith(err);
		const r = (await port.whoAmI());
		assert.equal(r.ok, false);
		if (!r.ok) assert.equal(r.kind, kind);
	}
});

test('findIssue returns the first of several matches and separates failure from not found', async () => {
	const port = createGithubTracker('o', 'r');
	const argv: string[][] = [];
	// Several matches, in the order gh lists them. The fake applies the -L limit from
	// argv the way gh would, so the selection is whatever the adapter asked for.
	const matches = [{ number: 31 }, { number: 17 }, { number: 5 }];
	installExecStandIn((_c, args) => {
		argv.push([...args]);
		return JSON.stringify(matches.slice(0, Number(flagValue(args, '-L') ?? matches.length)).map(m => issueRow(m)));
	});
	assert.deepEqual((await port.findIssue(['epic:x', 'insrc:story'])), { ok: true, value: 'o/r#31' });
	assert.deepEqual(argv[0]?.slice(0, 2), ['issue', 'list']);
	assert.equal(flagValue(argv[0], '-R'), 'o/r');
	assert.equal(flagValue(argv[0], '-s'), 'all');
	assert.equal(flagValue(argv[0], '-L'), '1');
	assert.equal(flagValue(argv[0], '-l'), 'epic:x,insrc:story');

	installExecStandIn(() => '[]');
	assert.deepEqual((await port.findIssue(['a'])), { ok: true, value: null });

	failWith(execError({ code: 'ETIMEDOUT' }));
	const failed = (await port.findIssue(['a']));
	assert.equal(failed.ok, false);
	if (!failed.ok) assert.equal(failed.kind, 'unreachable');
});

test('findIssues lists every open or closed match across all pages in ascending order, and a failure is not an answer', async () => {
	const port = createGithubTracker('o', 'r');
	const argv: string[][] = [];
	// two pages, as `gh api --paginate` prints them, out of order
	installExecStandIn((_c, args) => { argv.push([...args]); return '31\n5\n\n17\n'; });
	assert.deepEqual((await port.findIssues(['insrc:unit:x', 'epic:a b'])), { ok: true, value: ['o/r#5', 'o/r#17', 'o/r#31'] });
	assert.deepEqual(argv[0], ['api', '--paginate', 'repos/o/r/issues?state=all&per_page=100&labels=insrc%3Aunit%3Ax,epic%3Aa%20b', '-q', '.[] | select(.pull_request | not) | .number'], 'closed issues included, pull requests left out');

	installExecStandIn(() => '');
	assert.deepEqual((await port.findIssues(['a'])), { ok: true, value: [] });

	installExecStandIn(() => 'not a number\n');
	assert.equal((await port.findIssues(['a'])).ok, false);

	failWith(execError({ code: 'ETIMEDOUT' }));
	const failed = (await port.findIssues(['a']));
	assert.equal(failed.ok, false);
	if (!failed.ok) assert.equal(failed.kind, 'unreachable');
});

test('the adapter declares signoff-request but not completion, and a malformed signoff request or ref is rejected without running gh', async () => {
	const port = createGithubTracker('o', 'r');
	let ran = 0;
	installExecStandIn(() => { ran += 1; return ''; });
	assert.equal(port.capabilities.has('signoff-request'), true);
	assert.equal(port.capabilities.has('completion'), false);
	const spec = { title: 't', body: 'b', unit: { unit: 'story' as const, repoPath: '/r', epicHash: 'a3f4b8c9d1e2f3a4', storyId: 's1' }, artifacts: [], branch: '', issue: 'o/r#1' };
	for (const r of [await port.openSignoffRequest(spec), await port.readSignoffState({ ref: 'x' })]) {
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
	installExecStandIn((_cmd, args) => {
		calls.push([...args]);
		const err = opts.failOn?.(args);
		if (err !== undefined) throw err;
		if (args[0] === 'issue' && args[1] === 'view') return JSON.stringify(issueRow({ assignees: assignees.map(login => ({ login })) }));
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

test('readAssignee returns the single login, null when unassigned and rejected for several or a malformed reference', async () => {
	const port = createGithubTracker('o', 'r');
	fakeAssigneeGh(['alice']);
	assert.deepEqual((await port.readAssignee('o/r#5')), { ok: true, value: 'alice' });
	fakeAssigneeGh([]);
	assert.deepEqual((await port.readAssignee('o/r#5')), { ok: true, value: null });

	fakeAssigneeGh(['alice', 'bob']);
	const several = (await port.readAssignee('o/r#5'));
	assert.equal(several.ok, false);
	if (!several.ok) { assert.equal(several.kind, 'rejected'); assert.match(several.reason, /alice, bob/); }

	const { calls } = fakeAssigneeGh(['alice']);
	for (const bad of ['not-a-ref', 'o/r', '#5', 'o/r#', '/r#5', 'o/#5', 'o/r#abc', 'o/r#5 ', 'o/r#5\n', '\no/r#5']) {
		const r = (await port.readAssignee(bad));
		assert.equal(r.ok, false, bad);
		if (!r.ok) assert.equal(r.kind, 'rejected');
	}
	assert.equal(calls.length, 0, 'a malformed reference never reaches gh');
});

test('setAssignee from zero, one and several assignees ends with exactly the requested user', async () => {
	const port = createGithubTracker('o', 'r');
	for (const initial of [[], ['bob'], ['alice'], ['bob', 'carol'], ['alice', 'bob']]) {
		const gh = fakeAssigneeGh(initial);
		assert.deepEqual((await port.setAssignee('o/r#5', 'alice')), { ok: true, value: undefined }, JSON.stringify(initial));
		assert.deepEqual(gh.now(), ['alice'], JSON.stringify(initial));
		assert.equal(gh.calls.filter(c => c[1] === 'view').length, 2, `read, then a re-read: ${JSON.stringify(initial)}`);
	}
});

test('setAssignee makes no change call when already right and clears for null', async () => {
	const port = createGithubTracker('o', 'r');
	const same = fakeAssigneeGh(['Alice']);
	assert.equal((await port.setAssignee('o/r#5', 'alice')).ok, true);   // logins compare case-insensitively
	assert.equal(same.calls.filter(isEdit).length, 0);
	assert.equal(same.calls.filter(c => c[1] === 'view').length, 2, 'the outcome is re-read even when no change was needed');

	const none = fakeAssigneeGh([]);
	assert.equal((await port.setAssignee('o/r#5', null)).ok, true);
	assert.equal(none.calls.filter(isEdit).length, 0);
	assert.equal(none.calls.filter(c => c[1] === 'view').length, 2);

	const clear = fakeAssigneeGh(['alice', 'bob']);
	assert.equal((await port.setAssignee('o/r#5', null)).ok, true);
	assert.deepEqual(clear.now(), []);
	assert.equal(clear.calls.filter(isEdit).length, 1);
});

test('setAssignee reports rejected or unreachable without a retry when the re-read differs or a step times out', async () => {
	const port = createGithubTracker('o', 'r');
	// The add did not take: the re-read differs, reported as rejected naming the state.
	const partial = fakeAssigneeGh(['bob'], { stickyAdd: true });
	const differs = (await port.setAssignee('o/r#5', 'alice'));
	assert.equal(differs.ok, false);
	if (!differs.ok) { assert.equal(differs.kind, 'rejected'); assert.match(differs.reason, /expected alice/); }
	assert.equal(partial.calls.filter(c => c.includes('--add-assignee')).length, 1, 'the add is not retried');

	// A step that times out: unreachable, the state is unknown, nothing after it runs.
	const timeout = fakeAssigneeGh(['bob'], { failOn: a => (a.includes('--add-assignee') ? execError({ stderr: 'dial tcp: i/o timeout' }) : undefined) });
	const timedOut = (await port.setAssignee('o/r#5', 'alice'));
	assert.equal(timedOut.ok, false);
	if (!timedOut.ok) assert.equal(timedOut.kind, 'unreachable');
	assert.equal(timeout.calls.filter(c => c.includes('--add-assignee')).length, 1);
	assert.equal(timeout.calls.filter(c => c[1] === 'view').length, 1, 'no re-read after a failed step');

	// The first read timing out stops everything.
	const readFails = fakeAssigneeGh([], { failOn: () => execError({ stderr: 'dial tcp: i/o timeout' }) });
	assert.equal((await port.setAssignee('o/r#5', 'alice')).ok, false);
	assert.equal(readFails.calls.length, 1);
});

test('addAssignee adds without removing, returns the assignees read back and reports a failed step without a retry', async () => {
	const port = createGithubTracker('o', 'r');

	// from none and beside another assignee: nobody is removed, the add is made once
	const none = fakeAssigneeGh([]);
	assert.deepEqual((await port.addAssignee('o/r#5', 'alice')), { ok: true, value: ['alice'] });
	assert.equal(none.calls.filter(isEdit).length, 1);
	const beside = fakeAssigneeGh(['bob']);
	assert.deepEqual((await port.addAssignee('o/r#5', 'alice')), { ok: true, value: ['bob', 'alice'] });
	assert.equal(beside.calls.some(c => c.includes('--remove-assignee')), false, 'no assignee is removed');

	// already there (case-insensitive): no change call, still re-read
	const same = fakeAssigneeGh(['Alice']);
	assert.deepEqual((await port.addAssignee('o/r#5', 'alice')), { ok: true, value: ['Alice'] });
	assert.equal(same.calls.filter(isEdit).length, 0);

	// the add did not take: rejected, naming the state; a timed-out add: unreachable; neither is retried
	const sticky = fakeAssigneeGh(['bob'], { stickyAdd: true });
	const differs = (await port.addAssignee('o/r#5', 'alice'));
	assert.equal(differs.ok, false);
	if (!differs.ok) { assert.equal(differs.kind, 'rejected'); assert.match(differs.reason, /expected alice/); }
	assert.equal(sticky.calls.filter(isEdit).length, 1, 'the add is not retried');
	const timeout = fakeAssigneeGh(['bob'], { failOn: a => (a.includes('--add-assignee') ? execError({ stderr: 'dial tcp: i/o timeout' }) : undefined) });
	const timedOut = (await port.addAssignee('o/r#5', 'alice'));
	assert.equal(timedOut.ok, false);
	if (!timedOut.ok) assert.equal(timedOut.kind, 'unreachable');
	assert.equal(timeout.calls.filter(isEdit).length, 1);
	assert.equal(timeout.calls.filter(c => c[1] === 'view').length, 1, 'no re-read after a failed step');

	// a malformed reference never reaches gh
	const bad = fakeAssigneeGh([]);
	assert.equal((await port.addAssignee('not-a-ref', 'alice')).ok, false);
	assert.equal(bad.calls.length, 0);
});

// ---------------------------------------------------------------------------
// issueOps parity with the wrappers
// ---------------------------------------------------------------------------

/** Recording fake gh: REST creates answer { number, id }, everything else an empty string. */
function recordingGh(opts: { failOn?: (args: readonly string[]) => Error | undefined } = {}) {
	const calls: string[][] = [];
	let n = 40;
	installExecStandIn((_cmd, args) => {
		calls.push([...args]);
		const err = opts.failOn?.(args);
		if (err !== undefined) throw err;
		if (args[0] === 'api' && args.includes('POST') && (args.find(a => a.startsWith('repos/')) ?? '').endsWith('/issues')) {
			n += 1;
			return JSON.stringify({ number: n, id: 9000 + n });
		}
		if (args[0] === 'issue' && args[1] === 'view') return JSON.stringify(issueRow({ number: 4, body: ' b ' }));
		return '';
	});
	return calls;
}

async function assertCreateParity(spec: IssueSpec): Promise<void> {
	const viaPort = recordingGh();
	const r = (await createGithubTracker('o', 'r').createIssue(spec));
	assert.equal(r.ok, true);
	assert.equal(viaPort[0]?.includes('POST'), true, 'the create is one REST POST');
	assert.equal(viaPort[0]!.some(a => a.startsWith('type=')), (spec.issueType ?? '').length > 0, 'a type is sent only when one is given');
	if ((spec.issueType ?? '').length > 0) assert.ok(viaPort[0]!.includes(`type=${spec.issueType}`));
	for (const l of spec.labels) assert.ok(viaPort[0]!.includes(`labels[]=${l}`));
	if (spec.parent !== undefined) {
		const link = viaPort[1];
		assert.ok(link?.includes('POST') && link.some(a => a.includes('/issues/' + spec.parent!.split('#')[1] + '/sub_issues')), 'the parent link follows the create');
		assert.ok(link?.includes('sub_issue_id=9041'), 'the link carries the REST id of the new issue');
	} else assert.equal(viaPort.length, 1, 'no parent, no link call');
	if (r.ok) assert.equal(r.value, 'o/r#41');
}

test('Epic create parity with ghCreateIssueTyped', async () => {
	await assertCreateParity({ title: 'E1 — problem', body: 'epic body', labels: ['insrc:epic', 'epic:slug'], issueType: 'Epic' });
});

test('Story create and Epic parent link parity', async () => {
	await assertCreateParity({ title: 'S1 — story', body: 'story body', labels: ['insrc:story', 'epic:slug'], issueType: 'Story', parent: 'o/r#10' });
	// A failed parent link never fails the create: the ref comes back ok.
	recordingGh({ failOn: a => (a.some(x => x.includes('sub_issues')) ? execError({ stderr: 'HTTP 403' }) : undefined) });
	const r = (await createGithubTracker('o', 'r').createIssue({ title: 't', body: 'b', labels: ['x'], parent: 'o/r#10' }));
	assert.deepEqual(r, { ok: true, value: 'o/r#41' });
});

test('Task create and Story parent link parity', async () => {
	await assertCreateParity({ title: 'T1 — task', body: 'task body', labels: ['insrc:task', 'epic:slug'], issueType: 'Task', parent: 'o/r#20' });
	await assertCreateParity({ title: 'T2 — untyped task', body: 'b', labels: ['insrc:task'], issueType: '', parent: 'o/r#20' });
});

test('each issueOps operation runs the expected gh argv and fails with the kind and message of the gh failure', async () => {
	approveAll();
	const ops = createGithubTracker('o', 'r').issueOps;
	const run = async (fn: () => unknown): Promise<string[][]> => {
		const calls = recordingGh();
		await fn();
		return calls;
	};
	const pairs: Array<[string, () => unknown, string[][]]> = [
		['linkSubIssue', () => ops.linkSubIssue('o/r#10', 9001), [['api', '-X', 'POST', 'repos/o/r/issues/10/sub_issues', '-F', 'sub_issue_id=9001']]],
		['close', () => ops.close('o/r#4'), [['issue', 'close', '4', '-R', 'o/r']]],
		['comment', () => ops.comment('o/r#4', 'hi'), [['issue', 'comment', '4', '-b', 'hi', '-R', 'o/r']]],
		['writeBody', () => ops.writeBody('o/r#4', 'new'), [['issue', 'edit', '4', '-b', 'new', '-R', 'o/r']]],
		['ensureLabel', () => ops.ensureLabel('insrc:epic'), [['label', 'create', 'insrc:epic', '-f', '-R', 'o/r']]],
		['ensureMilestone', () => ops.ensureMilestone('m1'), [['api', '-X', 'POST', 'repos/o/r/milestones', '-f', 'title=m1']]],
		['attachMilestone', () => ops.attachMilestone('o/r#4', 'm1'), [['issue', 'edit', '4', '-m', 'm1', '-R', 'o/r']]],
	];
	for (const [name, viaOps, argv] of pairs) {
		assert.deepEqual(await run(viaOps), argv, `${name}: argv`);
	}
	// reads and creates: the argv is checked by its parts
	const read = await run(() => ops.readBody('o/r#4'));
	assert.deepEqual(read[0]?.slice(0, 3), ['issue', 'view', '4']);
	assert.equal(flagValue(read[0], '-R'), 'o/r');
	assert.deepEqual(await ops.readBody('o/r#4'), { ok: true, value: 'b' });
	const created = await run(() => ops.create({ title: 't', body: 'b', labels: ['a'], issueType: 'Task' }));
	assert.deepEqual(created, [['api', '-X', 'POST', 'repos/o/r/issues', '-f', 'title=t', '-f', 'body=b', '-f', 'labels[]=a', '-f', 'type=Task']]);

	// Failure results: the operations that report come back as ok:false with the kind and message of the gh failure; the
	// boolean and swallowing ones keep their result.
	const boom = execError({ stderr: 'HTTP 500 boom' });
	recordingGh({ failOn: () => boom });
	const all: Array<[string, () => unknown]> = [...pairs.map(([n, f]) => [n, f] as [string, () => unknown]), ['readBody', () => ops.readBody('o/r#4')], ['create', () => ops.create({ title: 't', body: 'b', labels: ['a'], issueType: 'Task' })]];
	for (const [name, viaOps] of all) {
		if (name === 'ensureLabel' || name === 'ensureMilestone') continue;
		const r = await viaOps() as { ok: boolean; kind?: string; reason?: string };
		assert.equal(r.ok, false, name);
		assert.equal(r.kind, 'rejected', name);
		assert.match(r.reason ?? '', /HTTP 500 boom/, name);
	}
});

test('ensureLabel returns false on failure, ensureMilestone swallows a failed create, closing a closed issue succeeds', async () => {
	approveAll();
	const ops = createGithubTracker('o', 'r').issueOps;
	recordingGh({ failOn: () => execError({ stderr: 'dial tcp: i/o timeout' }) });
	assert.equal(await ops.ensureLabel('x'), false);
	await assert.doesNotReject(async () => ops.ensureMilestone('m'));
	// gh exits 0 with a note when the issue is already closed.
	recordingGh();
	assert.deepEqual(await ops.close('o/r#4'), { ok: true, value: undefined });
	assert.deepEqual(await ops.close('o/r#4'), { ok: true, value: undefined });
});

test("ghGetIssueId and the adapter's resolveIssueId run gh api for the issue number, return the numeric id, and fail on a non-integer or a gh error", async () => {
	const ops = createGithubTracker('o', 'r').issueOps;
	const seen: string[][] = [];
	let answer = '{"id":9001}';
	installExecStandIn((_cmd, args) => { seen.push([...args]); return answer; });
	assert.deepEqual(await ops.resolveIssueId('o/r#10'), { ok: true, value: 9001 });
	assert.deepEqual(seen[0], ['api', 'repos/o/r/issues/10']);

	// output that is not a positive integer is a rejected lookup, never a number
	for (const bad of ['', 'null', 'abc', '{"id":12.5}', '{"id":-3}', '{"id":0}', '{"id":"9001"}', '{"id":null}', '{}', '9001', '9001 9002']) {
		answer = bad;
		const r = await ops.resolveIssueId('o/r#10');
		assert.deepEqual([r.ok, r.ok ? '' : r.kind], [false, 'rejected'], `output '${bad}'`);
	}

	// malformed refs are refused before gh runs
	answer = '{"id":1}';
	const before = seen.length;
	for (const ref of ['o/r#abc', '/#', 'o/#5', '/r#5', 'o/r#', 'o/r#0', 'o/r#05', 'o/r#5\n', 'or#5', 'o/r', 'o/r/x#5']) {
		const r = await ops.resolveIssueId(ref);
		assert.deepEqual([r.ok, r.ok ? '' : r.kind], [false, 'rejected'], `ref '${ref}'`);
	}
	assert.equal(seen.length, before, 'gh was not run for a malformed ref');

	// a gh failure keeps its kind
	failWith(execError({ code: 'ENOENT' }, 'spawnSync gh ENOENT'));
	assert.equal(((await ops.resolveIssueId('o/r#10')) as { kind: string }).kind, 'missing-tool');
	failWith(execError({ stderr: 'You are not logged in to any GitHub hosts. Run gh auth login to authenticate.' }));
	assert.equal(((await ops.resolveIssueId('o/r#10')) as { kind: string }).kind, 'missing-signin');
	failWith(execError({ code: 'ETIMEDOUT' }));
	assert.equal(((await ops.resolveIssueId('o/r#10')) as { kind: string }).kind, 'unreachable');
	failWith(execError({ stderr: 'HTTP 404 Not Found' }));
	assert.equal(((await ops.resolveIssueId('o/r#10')) as { kind: string }).kind, 'rejected');
});
