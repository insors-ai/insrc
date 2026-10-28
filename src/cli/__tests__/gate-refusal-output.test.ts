/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The terminal prints a team-gate refusal naming the holder, formatted beside the
 * review-block message. (The resolve, claim and release refusals join in t6, t9 and t10.)
 *
 * Run: npx tsx --test src/cli/__tests__/gate-refusal-output.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runCommand, type CommandCtx } from '../command.js';
import { TeamGateRefusedError } from '../../workflow/team/gate.js';

function ctxWith(workflow: Record<string, unknown>): CommandCtx {
	return { repoPath: '/repo', onLog: () => undefined, services: { workflow } } as unknown as CommandCtx;
}

test('the terminal approve command prints the refusal naming the holder, formatted beside the review-block message', async () => {
	const held = new TeamGateRefusedError({ kind: 'held-by-other', holder: 'bob', offerPark: false }, 'task t2');

	// approve
	const approve = await runCommand('workflow approve docs/plans/PLAN-x.md', ctxWith({ approve: () => { throw held; } }));
	assert.deepEqual(approve, ['✗ not approved — task t2: held by bob']);

	// the review-block message keeps its own format
	const blocked = Object.assign(new Error('blocked'), { name: 'ReviewBlockedError', summary: '2 HIGH · 1 MED' });
	const review = await runCommand('workflow approve docs/plans/PLAN-x.md', ctxWith({ approve: () => { throw blocked; } }));
	assert.match(review[0] ?? '', /blocked by review \(2 HIGH · 1 MED\)/);

	// a refusal with no holder prints its reason
	const refused = new TeamGateRefusedError({ kind: 'refused', reason: 'the tracker cannot be used (unreachable): timed out' });
	const out = await runCommand('workflow approve docs/plans/PLAN-x.md', ctxWith({ approve: () => { throw refused; } }));
	assert.deepEqual(out, ['✗ not approved — the tracker cannot be used (unreachable): timed out']);
});

test('the terminal resolve command prints the refusal naming the holder when applying a finding is refused', async () => {
	const held = new TeamGateRefusedError({ kind: 'held-by-other', holder: 'bob', offerPark: false });
	const out = await runCommand('workflow resolve docs/plans/PLAN-x.md high1 apply', ctxWith({ resolveFinding: () => { throw held; } }));
	assert.deepEqual(out, ['✗ not applied — held by bob']);
	// accept, override and defer are not refused and keep their normal line
	const fine = await runCommand('workflow resolve docs/plans/PLAN-x.md high1 accept', ctxWith({ resolveFinding: () => ({ findingId: 'high1', status: 'resolved', effectiveVerdict: 'pass', remainingBlocking: 0 }) }));
	assert.match(fine[0] ?? '', /resolved high1 \(resolved\)/);
});

test('the terminal approve and resolve commands print the refusal naming the holder, formatted beside the review-block message', async () => {
	const held = new TeamGateRefusedError({ kind: 'held-by-other', holder: 'bob', offerPark: false });
	const blocked = Object.assign(new Error('blocked'), { name: 'ReviewBlockedError', summary: '1 HIGH' });

	// approve and resolve: the cross line, the reason naming the holder, beside the review-block line
	const approve = await runCommand('workflow approve docs/plans/PLAN-x.md', ctxWith({ approve: () => { throw held; } }));
	const review = await runCommand('workflow approve docs/plans/PLAN-x.md', ctxWith({ approve: () => { throw blocked; } }));
	const resolve = await runCommand('workflow resolve docs/plans/PLAN-x.md high1 apply', ctxWith({ resolveFinding: () => { throw held; } }));
	assert.deepEqual(approve, ['✗ not approved — held by bob']);
	assert.deepEqual(resolve, ['✗ not applied — held by bob']);
	for (const line of [approve[0], review[0], resolve[0]]) assert.ok((line ?? '').startsWith('✗ '), `${line} uses the cross-prefixed format`);

	// claim and release: the same cross line naming the holder, from the daemon handlers the terminal's services call
	const team = await import('../../daemon/team-review-handlers.js');
	const gate = await import('../../workflow/team/gate.js');
	const port = {
		whoAmI: () => ({ ok: true, value: 'alice' }),
		readAssignee: () => ({ ok: true, value: 'bob' }),
		addAssignee: () => ({ ok: true, value: ['bob', 'alice'] }),
		setAssignee: () => ({ ok: true, value: [] }),
	};
	gate._setGateDepsForTests({
		readPolicy: () => ({ ok: true, value: { teamMode: true, claimsEnforced: true, administrators: [] } as never }),
		loadTracker: () => ({ ok: true, value: port as never }),
		resolveIssue: () => 'acme/demo#7',
		ensureIssue: () => ({ ok: false, kind: 'unreachable', reason: 'gh timed out' }),
		artifactExists: () => true,
	});
	try {
		const unit = { unit: 'story' as const, epicHash: '315d510cb28100e2', storyId: 's5' };
		assert.equal(await team.handleTeamClaim({ repoPath: '/repo', unit }), '✗ not claimed — held by bob');
		assert.match(await team.handleTeamRelease({ repoPath: '/repo', unit }), /^✗ not released — only the holder \(bob\)/);
	} finally { gate._setGateDepsForTests(); }
});
