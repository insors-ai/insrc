/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Where the signoff hook is registered and what the gate hands it (Story s7).
 *
 * Run: npx tsx --test src/workflow/team/__tests__/signoff-registration.test.ts
 */

import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { _setGateDepsForTests, registerCompletionHook, teamGate, type GuardedAction } from '../gate.js';
import { _setSignoffDepsForTests, registerSignoffHook } from '../signoff.js';
import type { PortResult, TrackerPort } from '../../tracker/port.js';
import type { UnitRef } from '../../tracker/refs.js';
import type { TeamPolicy } from '../types.js';

afterEach(() => { _setGateDepsForTests(); _setSignoffDepsForTests(); registerCompletionHook(undefined); });

const UNIT: UnitRef = { unit: 'story', repoPath: '/repo', epicHash: 'a3f4b8c9d1e2f3a4', storyId: 's1' };
const policy = { teamMode: true, claimsEnforced: true, administrators: [], signoffStages: ['LLD'], source: { anchorKnown: true, firstCommitTime: '2026-06-01T00:00:00Z' } } as unknown as TeamPolicy;
const port = {
	kind: 'github', capabilities: new Set(['claim']),
	whoAmI: (): PortResult<string> => ({ ok: true, value: 'alice' }),
	readAssignee: (): PortResult<string | null> => ({ ok: true, value: 'alice' }),
} as unknown as TrackerPort;

function injectGate(): void {
	_setGateDepsForTests({ readPolicy: () => ({ ok: true, value: policy }), loadTracker: () => ({ ok: true, value: port }), resolveIssue: () => 'acme/demo#7', now: () => '2026-10-18T00:00:00.000Z' });
}

test('consultHook passes the action and the authoring workflow to the hook and an older three-argument hook still works', async () => {
	injectGate();

	// a hook that takes the new arguments gets them
	const seen: Array<{ action: GuardedAction; authoring: string | undefined }> = [];
	registerCompletionHook((_repo, _unit, _port, action, authoring) => { seen.push({ action, authoring }); return 'continue'; });
	await teamGate('/repo', UNIT, 'author', 'plan');
	await teamGate('/repo', UNIT, 'build');
	assert.deepEqual(seen, [{ action: 'author', authoring: 'plan' }, { action: 'build', authoring: undefined }]);

	// a hook written with three parameters keeps working
	let calls = 0;
	registerCompletionHook((_repo: string, _unit: UnitRef, _port: TrackerPort) => { calls += 1; return 'continue'; });
	assert.deepEqual(await teamGate('/repo', UNIT, 'author', 'design.story'), { kind: 'allowed', implicitClaim: false });
	assert.equal(calls, 1);

	// the registered signoff hook is judged by the stage the attempt follows, through the real gate
	registerSignoffHook();
	_setSignoffDepsForTests({
		readPolicy: () => ({ ok: true, value: policy }),
		readHead: (_repo, id) => id === 'LLD-a3f4b8c9d1e2f3a4-s1'
			? { lifecycle: { status: 'in-signoff', revision: { number: 1 }, approval: { revision: 1, at: '2026-07-01T00:00:00Z' }, signoffs: [{ revision: 1, request: { entityId: 'acme/demo#2', type: 'signoff-request', relation: 'tracked-by' }, state: 'open', actors: [], at: '2026-07-01T00:00:00Z' }] } }
			: undefined,
	});
	assert.deepEqual(await teamGate('/repo', UNIT, 'author', 'plan'), { kind: 'awaiting-signoff', request: { ref: 'acme/demo#2' } });
	assert.deepEqual(await teamGate('/repo', UNIT, 'author', 'design.story'), { kind: 'allowed', implicitClaim: false }, 'design.story follows the HLD, which is not listed');
	assert.deepEqual(await teamGate('/repo', UNIT, 'open-signoff'), { kind: 'allowed', implicitClaim: false }, 'a submission is never blocked by its own request');
});

// --- registration in both processes, and the entries that settle ----------------------------------------------------------------

const ROOT = process.cwd();
const source = (path: string): string => readFileSync(join(ROOT, path), 'utf8');

/** The line of the first match of `needle` at or after `from`, or -1. */
const at = (text: string, needle: string, from = 0): number => text.indexOf(needle, from);

test('both the daemon start and makeServices in the terminal call registerSignoffHook, and each listed daemon entry (workflow-step start, runWorkflowServerSide, the second driver entry, both build implement entries, resumeStage) awaits settleForAttempt before its gate call while plan, step, synthesize and validate do not', async () => {
	// registration: the daemon's step host and entry point, and the terminal's makeServices, each in its own process
	const blocked: SignoffGateProbe = await probeRegistration();
	assert.equal(blocked.daemon, 'awaiting-signoff', 'registerSignoff in the daemon registers the hook');
	assert.equal(blocked.terminal, 'awaiting-signoff', 'makeServices registers the hook in the terminal');
	assert.match(source('src/daemon/steps/host.ts'), /registerSignoff\(\);/);
	assert.match(source('src/daemon/index.ts'), /registerSignoff\(\);/);
	assert.match(source('src/cli/services/index.ts'), /registerSignoffHook\(\);/);

	// the entries that start or resume a stage settle first
	const startSrc = source('src/daemon/steps/workflow-step/phases/start.ts');
	assert.ok(at(startSrc, 'await settleBeforeAuthor(') >= 0 && at(startSrc, 'await settleBeforeAuthor(') < at(startSrc, 'assertMayAuthor({'), 'workflow-step start settles before its gate call');

	const rpc = source('src/daemon/workflow-rpc.ts');
	const first = at(rpc, 'await settleBeforeAuthor(intent);');
	assert.ok(first >= 0 && first < at(rpc, 'assertMayAuthor(intent);'), 'runWorkflowServerSide settles before its gate call');
	const second = at(rpc, 'await settleBeforeAuthor(intent);', first + 1);
	assert.ok(second > first && second < at(rpc, 'assertMayAuthor(intent);', second), 'the second driver entry settles before its gate call');
	assert.equal(rpc.split('await settleBeforeAuthor(intent);').length - 1, 2, 'and the write-time check settles nowhere else');

	const implement = source('src/daemon/steps/build-step/phases/implement.ts');
	const planned = at(implement, 'await settleBeforeBuild(repoPath, ref);');
	assert.ok(planned >= 0 && planned < at(implement, 'assertMayBuild(repoPath, ref);'), 'the planned build entry settles before its gate call');
	const standalone = at(implement, 'await settleBeforeBuild(repoPath, { epicHash, storyId });');
	assert.ok(standalone >= 0 && standalone < at(implement, 'assertMayBuild(repoPath, { epicHash, storyId });'), 'the standalone build entry settles before its gate call');

	const resume = source('src/daemon/steps/workflow-step/resume.ts');
	assert.ok(at(resume, 'settleForAttempt(repo, unit') >= 0 && at(resume, 'settleForAttempt(repo, unit') < at(resume, 'await resumeCheck('), 'resumeStage settles before its check');

	// the later phases rely on the registered hook alone
	for (const file of [
		'src/daemon/steps/workflow-step/phases/plan.ts', 'src/daemon/steps/workflow-step/phases/step.ts', 'src/daemon/steps/workflow-step/phases/synthesize.ts',
		'src/daemon/steps/build-step/phases/validate.ts',
	]) assert.doesNotMatch(source(file), /settleBefore|settleForAttempt|settleSignoff/, file);
});

interface SignoffGateProbe { daemon: string; terminal: string }

/** Register through each process's own entry and ask the gate about a stage whose LLD awaits signoff. */
async function probeRegistration(): Promise<SignoffGateProbe> {
	const { registerSignoff } = await import('../../../daemon/steps/workflow-step/signoff-registration.js');
	const { makeServices } = await import('../../../cli/services/index.js');
	const ask = async (): Promise<string> => {
		injectGate();
		_setSignoffDepsForTests({
			readPolicy: () => ({ ok: true, value: policy }),
			readHead: (_repo, id) => id === 'LLD-a3f4b8c9d1e2f3a4-s1'
				? { lifecycle: { status: 'in-signoff', revision: { number: 1 }, approval: { revision: 1, at: '2026-07-01T00:00:00Z' }, signoffs: [{ revision: 1, request: { entityId: 'acme/demo#2', type: 'signoff-request', relation: 'tracked-by' }, state: 'open', actors: [], at: 'x' }] } }
				: undefined,
		});
		return (await teamGate('/repo', UNIT, 'author', 'plan')).kind;
	};
	registerCompletionHook(undefined);
	registerSignoff();
	const daemon = await ask();
	registerCompletionHook(undefined);
	makeServices();
	const terminal = await ask();
	return { daemon, terminal };
}
