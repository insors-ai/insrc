/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * A review of a stage held by someone else runs and reports its findings but writes no
 * auto-fix (and so mints no revision): through the verdicts phase and through run-artifact.
 * The holder's review applies its fixes as before. A review is never refused.
 *
 * Run: npx tsx --test src/daemon/steps/review-step/__tests__/gate-review-fix.test.ts
 */

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after as afterAll, afterEach, test } from 'node:test';
import { closeGraphStore, setGraphStorePath } from '../../../../db/graph/store.js';

const STORE_DIR = mkdtempSync(join(tmpdir(), 'insrc-test-store-'));
setGraphStorePath(join(STORE_DIR, 'graph.lmdb'));
afterAll(async () => {
	await closeGraphStore();
	rmSync(STORE_DIR, { recursive: true, force: true });
});

import { envelopeProvider } from '../../../../workflow/review-pipeline/__tests__/enveloped.js';
import { readReviewRecordOf } from '../../../../workflow/review/report-file.js';
import { handleReviewStep } from '../handler.js';
import { idOfWorkflow, writeDesign } from './review-fixture.js';
import { _clearReviewStateStoreForTests } from '../state-store.js';
import { reviewArtifactFile } from '../../../../workflow/review/run-artifact.js';
import { _setGateDepsForTests } from '../../../../workflow/team/gate.js';
import type { PortResult, TrackerPort } from '../../../../workflow/tracker/port.js';
import type { PolicyReader, TeamPolicy } from '../../../../workflow/team/types.js';
import type { LLMMessage, LLMProvider, LLMResponse, StructuredCompletionOpts, StructuredSchema } from '../../../../shared/types.js';
import { createRepoLifecycle } from '../../../../workflow/artifact-core/repo-lifecycle.js';
import '../../../../workflow/__tests__/helpers/converted-repos.js';

afterEach(() => _setGateDepsForTests());

const HASH = 'a3f4b8c9d1e2f3a4';
const team: PolicyReader = () => ({ ok: true, value: { teamMode: true, claimsEnforced: true, administrators: [] } as unknown as TeamPolicy });

function hold(holder: string | null): void {
	const port = {
		whoAmI: (): PortResult<string> => ({ ok: true, value: 'alice' }),
		readAssignee: (): PortResult<string | null> => ({ ok: true, value: holder }),
		addAssignee: (): PortResult<string[]> => ({ ok: true, value: ['alice'] }),
	} as unknown as TrackerPort;
	_setGateDepsForTests({ readPolicy: team, loadTracker: () => ({ ok: true, value: port }), resolveIssue: () => 'acme/demo#7' });
}

const MD = '# Story s1\n\n- t1: extend the two exported constants in foo.\n- t2: beta constant defined at src/foo.ts:2.\n';
const CLAIMS = {
	claims: [
		{ id: 'c-inv', ref: 's1/t1', kind: 'inventory', text: 'There are exactly two exported constants in foo.', anchors: ['src/foo.ts'], probe: { greps: ['^export const'] } },
		{ id: 'c-cite', ref: 's1/t2', kind: 'citation', text: 'beta constant defined at src/foo.ts:2.', anchors: ['src/foo.ts:2'], probe: { reads: ['src/foo.ts:2'] } },
	],
};
const WITH_AUTO_FIX = {
	verdicts: [
		{ claimId: 'c-inv', severity: 'HIGH', evidence: 'ripgrep re-derived THREE `export const` sites.', action: 'Correct the count.', fixability: 'auto',
			proposedFix: { rationale: 'three', artifactEdits: [{ find: 'two exported constants', replace: 'three exported constants' }] } },
		{ claimId: 'c-cite', severity: 'LOW', evidence: 'confirmed.', action: 'none — verified sound', fixability: 'manual' },
	],
};

function fixture(authoredBy: 'daemon' | 'controller') {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-gate-fix-'));
	mkdirSync(join(repo, 'src'), { recursive: true });
	writeFileSync(join(repo, 'src', 'foo.ts'), 'export const alpha = 1;\nexport const beta = 2;\nexport const gamma = 3;\n');
	const { mdPath: md, jsonPath: json } = writeDesign(repo, idOfWorkflow('plan'), { meta: { workflow: 'plan', authoredBy, revision: 2, repoPath: repo, storyId: 's1' }, body: { tasks: ['extend the two exported constants in foo.'] } }, MD);
	return { repo, md, json, cleanup: () => rmSync(repo, { recursive: true, force: true }) };
}

const read = (p: string): { meta: Record<string, unknown>; body: unknown } => JSON.parse(readFileSync(p, 'utf8')) as { meta: Record<string, unknown>; body: unknown };

async function verdictsReview(fx: ReturnType<typeof fixture>): Promise<{ next: string; applied: number }> {
	_clearReviewStateStoreForTests();
	const start = JSON.parse((await handleReviewStep({ phase: 'start', artifact: fx.md, repo: fx.repo })).content[0]!.text) as { state: string };
	await handleReviewStep({ phase: 'claims', claims: CLAIMS, state: start.state });
	return JSON.parse((await handleReviewStep({ phase: 'verdicts', verdicts: WITH_AUTO_FIX, state: start.state } as never, { lifecycleFor: repo => createRepoLifecycle(repo).service })).content[0]!.text) as { next: string; applied: number };
}

function provider(): LLMProvider {
	return envelopeProvider(rawProvider());
}

function rawProvider(): LLMProvider {
	const extract = { claims: [CLAIMS.claims[0]] };
	// the one-call review answers a claim's verdict without the claim id the step protocol carries
	const { claimId: _claimId, ...verdict } = WITH_AUTO_FIX.verdicts[0]!;
	return {
		supportsTools: false,
		capabilities: { structuredOutput: true, toolCalling: false, vision: false, webSearch: false, streaming: false, embeddings: false },
		async complete(): Promise<LLMResponse> { return { text: '', stopReason: 'end_turn' }; },
		async *stream(): AsyncIterable<string> { /* unused */ },
		async embed(): Promise<number[]> { return []; },
		async completeStructured<T>(_m: LLMMessage[], schema: StructuredSchema, _o?: StructuredCompletionOpts): Promise<T> {
			const props = (schema as { properties?: Record<string, unknown> }).properties ?? {};
			return ('claims' in props ? extract : verdict) as T;
		},
	};
}

test('a review of a stage held by someone else runs and reports findings, applies no auto-fix through verdicts.ts or run-artifact.ts, and leaves the revision unchanged', async () => {
	// verdicts.ts (the controller's review of a daemon-authored artifact): a non-holder's review reports and writes no fix
	const theirs = fixture('daemon');
	try {
		hold('bob');
		const bodyBefore = JSON.stringify(read(theirs.json).body);
		const done = await verdictsReview(theirs);
		assert.equal(done.next, 'done', 'the review ran');
		assert.equal(done.applied, 0, 'no auto-fix was applied');
		const after = read(theirs.json);
		assert.ok(readReviewRecordOf(theirs.json), 'the findings are reported');
		assert.equal(after.meta['revision'], 2, 'the revision is unchanged');
		assert.equal(JSON.stringify(after.body), bodyBefore, 'the body is unchanged');
		assert.doesNotMatch(readFileSync(theirs.md, 'utf8').split('## Review')[0] ?? '', /three exported constants/);
	} finally { theirs.cleanup(); }

	// verdicts.ts, the holder: the fix is applied and a revision minted, as before
	const mine = fixture('daemon');
	try {
		hold('alice');
		assert.equal((await verdictsReview(mine)).applied, 1);
		assert.equal(read(mine.json).meta['revision'], 3);
	} finally { mine.cleanup(); }

	// run-artifact.ts (the daemon's review): a non-holder's review reports and writes no fix
	const other = fixture('controller');
	try {
		hold('bob');
		const res = await reviewArtifactFile({ mdPath: other.md, jsonPath: other.json, repo: other.repo, lifecycle: createRepoLifecycle(other.repo).service, provider: provider(), model: 'fake', reviewedAt: '2026-10-18T00:00:00.000Z', reReview: false });
		assert.equal(res.applied.length, 0);
		const after = read(other.json);
		assert.ok(readReviewRecordOf(other.json));
		assert.equal(after.meta['revision'], 2);
		assert.doesNotMatch(JSON.stringify(after.body), /three exported constants/);
	} finally { other.cleanup(); }

	const holder = fixture('controller');
	try {
		hold('alice');
		const res = await reviewArtifactFile({ mdPath: holder.md, jsonPath: holder.json, repo: holder.repo, lifecycle: createRepoLifecycle(holder.repo).service, provider: provider(), model: 'fake', reviewedAt: '2026-10-18T00:00:00.000Z', reReview: false });
		assert.equal(res.applied.length, 1);
		assert.equal(read(holder.json).meta['revision'], 3);
	} finally { holder.cleanup(); }
});
