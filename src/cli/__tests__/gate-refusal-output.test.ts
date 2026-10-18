/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The terminal prints a team-gate refusal naming the holder, formatted beside the
 * review-block message.
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

test('the terminal approve and resolve commands print the refusal naming the holder, formatted beside the review-block message', async () => {
	const held = new TeamGateRefusedError({ kind: 'held-by-other', holder: 'bob', offerPark: false }, 'task t2');

	// approve
	const approve = await runCommand('workflow approve docs/plans/PLAN-x.md', ctxWith({ approve: () => { throw held; } }));
	assert.deepEqual(approve, ['✗ not approved — task t2: held by bob']);

	// the review-block message keeps its own format
	const blocked = Object.assign(new Error('blocked'), { name: 'ReviewBlockedError', summary: '2 HIGH · 1 MED' });
	const review = await runCommand('workflow approve docs/plans/PLAN-x.md', ctxWith({ approve: () => { throw blocked; } }));
	assert.match(review[0] ?? '', /blocked by review \(2 HIGH · 1 MED\)/);

	// resolve: applying a finding is refused the same way, and the other actions are not affected
	const resolve = await runCommand('workflow resolve docs/plans/PLAN-x.md high1 apply', ctxWith({ resolveFinding: () => { throw held; } }));
	assert.deepEqual(resolve, ['✗ not applied — task t2: held by bob']);
	const fine = await runCommand('workflow resolve docs/plans/PLAN-x.md high1 accept', ctxWith({ resolveFinding: () => ({ findingId: 'high1', status: 'accepted', effectiveVerdict: 'pass', remainingBlocking: 0 }) }));
	assert.match(fine[0] ?? '', /resolved high1 \(accepted\)/);

	// a refusal with no holder prints its reason
	const refused = new TeamGateRefusedError({ kind: 'refused', reason: 'the tracker cannot be used (unreachable): timed out' });
	const out = await runCommand('workflow approve docs/plans/PLAN-x.md', ctxWith({ approve: () => { throw refused; } }));
	assert.deepEqual(out, ['✗ not approved — the tracker cannot be used (unreachable): timed out']);
});
