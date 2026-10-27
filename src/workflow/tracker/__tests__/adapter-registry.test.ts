/**
 * The adapter's direct gh calls over the registry (Story s10): assignees and the signoff pull request, each against a stand-in gh.
 * Run: npx tsx --test-force-exit src/workflow/tracker/__tests__/adapter-registry.test.ts
 */

import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { ghIssueCommentTool, ghIssueEditTool, ghIssueViewTool } from '../../../daemon/tools/builtins/gh/issue.js';
import { ghPrCreateTool, ghPrListTool, ghPrViewTool } from '../../../daemon/tools/builtins/gh/pr.js';
import { ghTrackerTool } from '../../../daemon/tools/builtins/gh/tracker.js';
import { _setApprovalGateForTests } from '../../../daemon/tools/executor.js';
import { _resetRegistryForTests, registerTool } from '../../../daemon/tools/registry.js';
import type { ApprovalGate } from '../../../daemon/tools/types.js';
import { cleanup } from '../../../daemon/tools/__tests__/_proc.js';
import { installStandInBin } from '../../../daemon/tools/__tests__/_bin.js';
import type { StandInBin } from '../../../daemon/tools/__tests__/_bin.js';
import { GhCommandError } from '../github.js';
import { createRegistryTable, workflowToolDeps } from '../registry-table.js';
import { ToolDenied } from '../tool-denied.js';

const deps = workflowToolDeps('/tmp', { approvalMode: 'manual' });
const approveAll: ApprovalGate = { async ask(r) { return { requestId: r.requestId, decision: 'approve' }; } };
/** Approves everything except the tool ids named. */
const declining = (...ids: string[]): ApprovalGate => ({ async ask(r) { return { requestId: r.requestId, decision: ids.includes(r.toolId) ? 'decline' : 'approve' }; } });

let bin: StandInBin | undefined;
beforeEach(() => {
	_resetRegistryForTests();
	for (const t of [ghIssueCommentTool, ghIssueEditTool, ghIssueViewTool, ghPrCreateTool, ghPrListTool, ghPrViewTool, ghTrackerTool]) registerTool(t);
	_setApprovalGateForTests(() => approveAll);
});
afterEach(() => { _setApprovalGateForTests(undefined); bin?.restore(); if (bin) cleanup(bin.dir); bin = undefined; });

const issue = (assignees: string[]): string => JSON.stringify({ number: 3, title: 't', state: 'OPEN', assignees: assignees.map(login => ({ login })) });
const pr = (over: Record<string, unknown> = {}): string => JSON.stringify({ number: 9, title: 'p', state: 'OPEN', ...over });

/**
 * A gh that answers by the first words of its argument line. `issue view`, `pr view` and `pr list` take the next unused output of
 * their list (the last one repeats), so a re-read can differ from the first read; any other command answers `other` (or fails).
 */
function gh(script: { issueView?: string[]; prView?: string[]; prList?: string[]; other?: Record<string, [string, number?, string?]> }): StandInBin {
	const lists: Array<[string, string[] | undefined]> = [['issue view', script.issueView], ['pr view', script.prView], ['pr list', script.prList]];
	let body = '';
	const files: Array<[string, string]> = [];
	lists.forEach(([prefix, outs], li) => {
		if (outs === undefined) return;
		outs.forEach((o, i) => files.push([`l${li}_${i}`, o]));
		body += `case "$*" in "${prefix}"*) c=$(cat "$(dirname "$0")/n${li}" 2>/dev/null || echo 0); next=$((c+1)); echo $next > "$(dirname "$0")/n${li}"; i=$c; [ $i -ge ${outs.length} ] && i=${outs.length - 1}; cat "$(dirname "$0")/l${li}_$i"; exit 0;; esac\n`;
	});
	Object.entries(script.other ?? {}).forEach(([prefix, [out, code, err]], oi) => {
		files.push([`o${oi}`, out]);
		body += `case "$*" in "${prefix}"*) ${err !== undefined ? `echo '${err}' >&2; ` : ''}cat "$(dirname "$0")/o${oi}"; exit ${code ?? 0};; esac\n`;
	});
	body += 'echo "unexpected: $*" >&2; exit 9';
	bin = installStandInBin('gh', body);
	for (const [name, text] of files) writeFileSync(join(bin.dir, name), text);
	return bin;
}
const table = () => createRegistryTable(deps);
const rejected = (re: RegExp) => (err: unknown) => err instanceof GhCommandError && err.kind === 'rejected' && re.test(err.reason);
/** The first two words of each gh call (a multi-line comment body spills into extra log lines, which are not calls). */
const verbs = (b: StandInBin): string[] => b.calls().filter(c => /^(issue|pr|api) /.test(c)).map(c => c.split(' ').slice(0, 2).join(' '));

describe('adapter-registry.test.ts: assignee read, set and add with the re-read checks, signoff pull request list, create and view rows, a denied link comment and a retry that reuses the open pull request', () => {
	it('readAssignees and readAssignee: the logins; a malformed ref, a gh failure and more than one assignee are refused with the old messages', async () => {
		gh({ issueView: [issue(['a', 'b'])] });
		assert.deepEqual((await table().readAssignees('o/r#3')).logins, ['a', 'b']);
		await assert.rejects(table().readAssignee('o/r#3'), rejected(/o\/r#3 has more than one assignee \(a, b\)/));
		gh({ issueView: [issue(['a'])] });
		assert.equal(await table().readAssignee('o/r#3'), 'a');
		gh({ issueView: [issue([])] });
		assert.equal(await table().readAssignee('o/r#3'), null);
		await assert.rejects(table().readAssignees('o/r#3x'), rejected(/malformed issue reference 'o\/r#3x' \(expected owner\/repo#N\)/));
		await assert.rejects(table().readAssignees('not a ref'), rejected(/malformed issue reference/));
		gh({ other: { 'issue view': ['', 1, 'HTTP 404: not found'] } });
		await assert.rejects(table().readAssignees('o/r#3'), (e: unknown) => e instanceof GhCommandError && e.kind === 'rejected');
	});

	it('setAssignee: removes the others, adds the requested one, re-reads and compares; no step is retried and a failed step skips the re-read', async () => {
		// [a, b] -> b: remove a only, then the re-read shows [b]
		let b = gh({ issueView: [issue(['a', 'b']), issue(['b'])], other: { 'issue edit': ['{"number":3}'] } });
		await table().setAssignee('o/r#3', 'B');
		assert.deepEqual(verbs(b), ['issue view', 'issue edit', 'issue view']);
		assert.match(b.calls()[1]!, /--remove-assignee a( |$)/);
		// [] -> me: only an add
		b = gh({ issueView: [issue([]), issue(['me'])], other: { 'issue edit': ['{"number":3}'] } });
		await table().setAssignee('o/r#3', 'me');
		assert.match(b.calls()[1]!, /--add-assignee me/);
		assert.equal(b.calls().filter(c => c.startsWith('issue edit')).length, 1);
		// null clears everyone
		b = gh({ issueView: [issue(['a', 'b']), issue([])], other: { 'issue edit': ['{"number":3}'] } });
		await table().setAssignee('o/r#3', null);
		assert.match(b.calls()[1]!, /--remove-assignee a,b/);
		// already exactly who: no edit, only the two reads
		b = gh({ issueView: [issue(['me'])] });
		await table().setAssignee('o/r#3', 'ME');
		assert.deepEqual(verbs(b), ['issue view', 'issue view']);
		// the re-read disagrees: the old message
		gh({ issueView: [issue(['a', 'b']), issue(['a', 'b'])], other: { 'issue edit': ['{"number":3}'] } });
		await assert.rejects(table().setAssignee('o/r#3', 'b'), rejected(/o\/r#3 assignees are \[a, b\] after the update, expected b/));
		gh({ issueView: [issue(['a']), issue(['a'])], other: { 'issue edit': ['{"number":3}'] } });
		await assert.rejects(table().setAssignee('o/r#3', null), rejected(/after the update, expected none/));
		// a failed edit is reported as it is, once, and the re-read is skipped
		b = gh({ issueView: [issue(['a'])], other: { 'issue edit': ['', 1, 'HTTP 500: boom'] } });
		await assert.rejects(table().setAssignee('o/r#3', 'me'), (e: unknown) => e instanceof GhCommandError);
		assert.deepEqual(verbs(b), ['issue view', 'issue edit']);
	});

	it('addAssignee: adds without removing anybody, returns the assignees read back, and refuses a re-read that lacks the person', async () => {
		let b = gh({ issueView: [issue(['a']), issue(['a', 'me'])], other: { 'issue edit': ['{"number":3}'] } });
		assert.deepEqual(await table().addAssignee('o/r#3', 'me'), ['a', 'me']);
		assert.match(b.calls()[1]!, /--add-assignee me/);
		assert.doesNotMatch(b.calls()[1]!, /--remove-assignee/);
		b = gh({ issueView: [issue(['Me']), issue(['Me'])] });
		assert.deepEqual(await table().addAssignee('o/r#3', 'me'), ['Me']);
		assert.equal(b.calls().filter(c => c.startsWith('issue edit')).length, 0, 'already assigned: no edit');
		gh({ issueView: [issue(['a']), issue(['a'])], other: { 'issue edit': ['{"number":3}'] } });
		await assert.rejects(table().addAssignee('o/r#3', 'me'), rejected(/o\/r#3 assignees are \[a\] after the add, expected me among them/));
	});

	it('openPullRequestOf: the url of the open pull request from the branch; undefined when none or when the url is not a pull request url', async () => {
		const b = gh({ prList: [JSON.stringify([{ number: 9, title: 'p', state: 'OPEN', url: 'https://github.com/o/r/pull/9' }])] });
		assert.equal(await table().openPullRequestOf('o', 'r', 'story/s1'), 'https://github.com/o/r/pull/9');
		assert.match(b.calls()[0]!, /pr list .*-H story\/s1/);
		assert.match(b.calls()[0]!, /-s open/);
		gh({ prList: ['[]'] });
		assert.equal(await table().openPullRequestOf('o', 'r', 'x'), undefined);
		gh({ prList: [JSON.stringify([{ number: 9, title: 'p', state: 'OPEN', url: 'https://github.com/o/r/issues/9' }])] });
		assert.equal(await table().openPullRequestOf('o', 'r', 'x'), undefined);
		gh({ other: { 'pr list': ['', 1, 'HTTP 404: not found'] } });
		await assert.rejects(table().openPullRequestOf('o', 'r', 'x'), (e: unknown) => e instanceof GhCommandError);
	});

	const SPEC = { title: 'T', body: 'B', branch: 'story/s1', issue: 'o/r#3', unit: {} as never, artifacts: [] };

	it('openSignoffRequest: opens the pull request, links it with one comment, and returns the ref and url; the validations keep their messages', async () => {
		const b = gh({ prList: ['[]'], other: { 'pr create': ['https://github.com/o/r/pull/12\n'], 'api': ['{"id":99}'] } });
		const got = await table().openSignoffRequest('o', 'r', SPEC);
		assert.deepEqual(got, { ref: 'o/r#12', url: 'https://github.com/o/r/pull/12' });
		assert.deepEqual(verbs(b), ['pr list', 'pr create', 'api -X']);
		assert.match(b.calls()[2]!, /issues\/3\/comments .*insrc:signoff-request:o\/r#12/);
		await assert.rejects(table().openSignoffRequest('o', 'r', { ...SPEC, branch: '  ' }), rejected(/needs the branch that holds the committed artifacts/));
		await assert.rejects(table().openSignoffRequest('o', 'r', { ...SPEC, issue: 'nope' }), rejected(/malformed issue reference 'nope'/));
		gh({ prList: ['[]'], other: { 'pr create': ['created it\n'] } });
		await assert.rejects(table().openSignoffRequest('o', 'r', SPEC), rejected(/gh did not print the pull request url: 'created it/));
	});

	it('a link comment that fails for a gh reason is logged and the request stands', async () => {
		const b = gh({ prList: ['[]'], other: { 'pr create': ['https://github.com/o/r/pull/12'], 'api': ['', 1, 'HTTP 500: boom'] } });
		assert.deepEqual(await table().openSignoffRequest('o', 'r', SPEC), { ref: 'o/r#12', url: 'https://github.com/o/r/pull/12' });
		assert.deepEqual(verbs(b), ['pr list', 'pr create', 'api -X']);
	});

	it('a denied link comment fails the stage after the pull request exists, and the retry reuses the open pull request instead of creating a second', async () => {
		_setApprovalGateForTests(() => declining('gh_tracker'));
		let b = gh({ prList: ['[]'], other: { 'pr create': ['https://github.com/o/r/pull/12'], 'api': ['{"id":99}'] } });
		await assert.rejects(table().openSignoffRequest('o', 'r', SPEC), (e: unknown) => e instanceof ToolDenied && e.toolId === 'gh_tracker' && e.reason === 'declined');
		assert.deepEqual(verbs(b), ['pr list', 'pr create'], 'the comment was never sent');
		// the retry: the pull request is now listed as open, so only the comment is made (and is approved this time)
		_setApprovalGateForTests(() => approveAll);
		b = gh({ prList: [JSON.stringify([{ number: 12, title: 'p', state: 'OPEN', url: 'https://github.com/o/r/pull/12' }])], other: { 'api': ['{"id":99}'] } });
		assert.deepEqual(await table().openSignoffRequest('o', 'r', SPEC), { ref: 'o/r#12', url: 'https://github.com/o/r/pull/12' });
		assert.deepEqual(verbs(b), ['pr list', 'api -X'], 'no second pull request');
	});

	it('readSignoffState: merged is completed; a closed unmerged request is changes-requested; the review decision (or, with since, the latest decisive review after it) decides; anything else is open', async () => {
		const ref = { ref: 'o/r#9' };
		const state = async (view: string, since?: string) => { gh({ prView: [view] }); return table().readSignoffState(ref, since); };
		assert.equal(await state(pr({ state: 'MERGED' })), 'completed');
		assert.equal(await state(pr({ state: 'OPEN', mergedAt: '2026-10-27T10:00:00Z' })), 'completed');
		assert.equal(await state(pr({ state: 'CLOSED' })), 'changes-requested');
		assert.equal(await state(pr({ reviewDecision: 'CHANGES_REQUESTED' })), 'changes-requested');
		assert.equal(await state(pr({ reviewDecision: 'APPROVED' })), 'open');
		assert.equal(await state(pr({ reviewDecision: '' })), 'open');
		const reviews = [
			{ author: { login: 'r1' }, state: 'CHANGES_REQUESTED', submittedAt: '2026-10-27T09:00:00Z' },
			{ author: { login: 'r2' }, state: 'COMMENTED', submittedAt: '2026-10-27T12:00:00Z' },
		];
		assert.equal(await state(pr({ reviews }), '2026-10-27T08:00:00Z'), 'changes-requested');
		assert.equal(await state(pr({ reviews }), '2026-10-27T09:30:00Z'), 'open', 'a request made before the resubmission does not hold it');
		const later = [...reviews, { author: { login: 'r1' }, state: 'APPROVED', submittedAt: '2026-10-27T10:00:00Z' }];
		assert.equal(await state(pr({ reviews: later }), '2026-10-27T08:00:00Z'), 'open', 'the same reviewer approved after');
		await assert.rejects(state(pr({ reviews }), 'not a time'), rejected(/the submission time 'not a time' is not a time/));
		await assert.rejects(table().readSignoffState({ ref: 'bad' }), rejected(/malformed signoff request reference 'bad'/));
		const b = gh({ prView: [pr()] });
		await table().readSignoffState(ref);
		assert.match(b.calls()[0]!, /pr view 9 --json .*mergedAt,reviewDecision -R o\/r/);
		const b2 = gh({ prView: [pr({ reviews: [] })] });
		await table().readSignoffState(ref, '2026-10-27T08:00:00Z');
		assert.match(b2.calls()[0]!, /mergedAt,reviews -R o\/r/);
		gh({ other: { 'pr view': ['', 1, 'HTTP 404: not found'] } });
		await assert.rejects(table().readSignoffState(ref), (e: unknown) => e instanceof GhCommandError);
	});

	it('readSignoffRequest: the branch and whether the request is open; a missing branch or state is refused with the old message', async () => {
		gh({ prView: [pr({ headRefName: 'story/s1', state: 'OPEN' })] });
		assert.deepEqual(await table().readSignoffRequest({ ref: 'o/r#9' }), { branch: 'story/s1', open: true });
		gh({ prView: [pr({ headRefName: 'story/s1', state: 'MERGED' })] });
		assert.deepEqual(await table().readSignoffRequest({ ref: 'o/r#9' }), { branch: 'story/s1', open: false });
		gh({ prView: [pr({ headRefName: '' })] });
		await assert.rejects(table().readSignoffRequest({ ref: 'o/r#9' }), rejected(/gh returned no branch or state for o\/r#9/));
	});
});
