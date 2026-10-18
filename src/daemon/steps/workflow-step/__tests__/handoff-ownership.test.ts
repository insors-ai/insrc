/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * A run records its owner and its upstream snapshot when handleStart creates it, and the later turns keep both
 * (Story s6, a handoff needs to know whose run it is and which revisions it started from).
 *
 * Run: npx tsx --test src/daemon/steps/workflow-step/__tests__/handoff-ownership.test.ts
 */

import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { handleWorkflowStep } from '../handler.js';
import { _clearWorkflowStateStoreForTests, listStates } from '../state-store.js';
import { registerWorkflowRunners } from '../../../../workflow/index.js';
import { artifactJsonPath, defineArtifactId, hldArtifactId, lldArtifactId } from '../../../../workflow/storage.js';
import { _setGateDepsForTests } from '../../../../workflow/team/gate.js';
import type { PortResult, TrackerPort } from '../../../../workflow/tracker/port.js';
import type { PolicyReader, TeamPolicy } from '../../../../workflow/team/types.js';

const HASH = 'a3f4b8c9d1e2f3a4';
afterEach(() => { _setGateDepsForTests(); _clearWorkflowStateStoreForTests(); });

const team: PolicyReader = () => ({ ok: true, value: { teamMode: true, claimsEnforced: true, administrators: [] } as unknown as TeamPolicy });
const none: PolicyReader = () => ({ ok: true, value: 'none' });

function inject(readPolicy: PolicyReader): { loads: () => number } {
	let loads = 0;
	const port = {
		whoAmI: (): PortResult<string> => ({ ok: true, value: 'alice' }),
		readAssignee: (): PortResult<string | null> => ({ ok: true, value: 'alice' }),
		addAssignee: (): PortResult<string[]> => ({ ok: true, value: ['alice'] }),
	} as unknown as TrackerPort;
	_setGateDepsForTests({
		readPolicy,
		loadTracker: () => { loads += 1; return { ok: true, value: port }; },
		resolveIssue: () => 'acme/demo#7',
		ensureIssue: () => ({ ok: false, kind: 'unreachable', reason: 'gh timed out' }),
		artifactExists: () => true,
	});
	return { loads: () => loads };
}

function seed(repo: string, id: string, doc: unknown): void {
	const path = artifactJsonPath(repo, id);
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, JSON.stringify(doc));
}

function seedChain(repo: string): void {
	const meta = (workflow: string, revision: number) => ({ workflow, runId: `${workflow}-1`, epicHash: HASH, epicSlug: 'e', storyId: 's1', approvedAt: '2026-10-18T00:00:00.000Z', revision });
	seed(repo, defineArtifactId(HASH), { meta: meta('define', 3), body: { openQuestions: [] }, citations: [] });
	seed(repo, hldArtifactId(HASH), { meta: meta('design.epic', 5), body: { openQuestions: [] }, citations: [] });
	seed(repo, lldArtifactId(HASH, 's1'), { meta: meta('design.story', 7), body: { openQuestions: [] }, citations: [] });
}

const parse = (env: { content: readonly { text: string }[] }): { next: string; state: string; error?: { code: string; message: string } } => JSON.parse(env.content[0]!.text) as never;
const entryOf = (token: string) => listStates().find(e => e.token === token);

test('handleStart records the acting user and the upstream snapshot on the stored run, plan and step turns keep them, and a repo without a policy records neither and makes no tracker call', async () => {
	registerWorkflowRunners();
	const repo = mkdtempSync(join(tmpdir(), 'insrc-handoff-own-'));
	try {
		seedChain(repo);
		inject(team);

		// a plan run: the owner and the snapshot of everything plan reads are on the stored entry
		const started = parse(await handleWorkflowStep({ phase: 'start', workflow: 'plan', focus: 'f', repo, params: { epicHash: HASH, storyId: 's1' } }));
		assert.equal(started.next, 'emit_plan', JSON.stringify(started));
		const meta = entryOf(started.state)?.meta;
		assert.equal(meta?.owner, 'alice');
		const upstream = new Map((meta?.upstream ?? []).map(u => [u.artifactId.split('@')[0], u.revision]));
		assert.deepEqual([...upstream.entries()], [[lldArtifactId(HASH, 's1'), 7], [hldArtifactId(HASH), 5], [defineArtifactId(HASH), 3]]);

		// the plan and step turns keep both: walk the stub workflow, which finishes in a few turns
		const stub = parse(await handleWorkflowStep({ phase: 'start', workflow: 'stub', focus: 'demo', repo }));
		assert.equal(entryOf(stub.state)?.meta?.owner, 'alice');
		const planned = parse(await handleWorkflowStep({
			phase: 'plan', state: stub.state,
			plan: { workflow: 'stub', steps: [{ id: 's1', runner: 'echo.a', params: { seed: 'x' } }, { id: 's2', runner: 'echo.b', params: { fromA: '$s1.echoed' } }, { id: 's3', runner: 'echo.c', params: { fromA: '$s1.marker', fromB: '$s2.marker' } }] },
		} as never));
		assert.notEqual(planned.state, stub.state, 'the turn minted a new token');
		assert.equal(entryOf(planned.state)?.meta?.owner, 'alice', 'the replacement keeps the owner');
		assert.equal(entryOf(stub.state), undefined, 'the superseded token is gone');
	} finally { rmSync(repo, { recursive: true, force: true }); }

	// no policy: neither owner nor snapshot, and the tracker is never loaded
	const free = mkdtempSync(join(tmpdir(), 'insrc-handoff-own-free-'));
	try {
		seedChain(free);
		const seen = inject(none);
		const started = parse(await handleWorkflowStep({ phase: 'start', workflow: 'plan', focus: 'f', repo: free, params: { epicHash: HASH, storyId: 's1' } }));
		assert.equal(started.next, 'emit_plan');
		assert.equal(entryOf(started.state)?.meta, undefined);
		assert.equal(seen.loads(), 0);
	} finally { rmSync(free, { recursive: true, force: true }); }
});
