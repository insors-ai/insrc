/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Review writes and the revision (sc3): a review that applies auto-fixes and a
 * resolution with action `apply` are content writes (they mint a revision); a
 * report-only review and accept / override / defer are meta-only (they do not).
 *
 * Run: npx tsx --test src/workflow/review/__tests__/review-revision.test.ts
 */

import { envelopeProvider } from '../../review-pipeline/__tests__/enveloped.js';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdtempSync as mkdtempRaw, rmSync as rmRaw } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after as afterAll, test } from 'node:test';
import { closeGraphStore, setGraphStorePath } from '../../../db/graph/store.js';

// The review reaches the graph store through code that takes no path.
const STORE_DIR = mkdtempRaw(join(tmpdir(), 'insrc-test-store-'));
setGraphStorePath(join(STORE_DIR, 'graph.lmdb'));
afterAll(async () => {
	await closeGraphStore();
	rmRaw(STORE_DIR, { recursive: true, force: true });
});

import type { LLMMessage, LLMProvider, LLMResponse, StructuredCompletionOpts, StructuredSchema } from '../../../shared/types.js';
import { reviewArtifactFile } from '../run-artifact.js';
import { resolveReviewFinding } from '../resolve.js';
import type { Finding, ReviewReport } from '../types.js';
import { createRepoLifecycle } from '../../artifact-core/repo-lifecycle.js';
import { lifecycleReviewOf } from '../../artifact-core/approval-view.js';
import { draftMeta, writeReviewedHead } from '../../__tests__/lifecycle-fixtures.js';

const HASH = 'abcd1234ef567890';
const ARTIFACT = '# Story s1\n\n- t1: extend the two exported constants in foo.\n';

const EXTRACT_JSON = {
	claims: [{
		id: 'c-inv', ref: 's1/t1', kind: 'inventory',
		text: 'There are exactly two exported constants in foo.',
		anchors: ['src/foo.ts'], probe: { greps: ['^export const'] },
	}],
};

function verify(autoFix: boolean): unknown {
	return autoFix
		? {
			severity: 'HIGH', evidence: 'ripgrep re-derived THREE `export const` sites, not two.', action: 'Correct the count to three.',
			fixability: 'auto',
			proposedFix: { rationale: 'Grep found three.', artifactEdits: [{ find: 'two exported constants', replace: 'three exported constants' }] },
		}
		: { severity: 'LOW', evidence: 'ok', action: 'none — verified sound', fixability: 'manual' };
}

function provider(autoFix: boolean): LLMProvider {
	return envelopeProvider({
		supportsTools: false,
		capabilities: { structuredOutput: true, toolCalling: false, vision: false, webSearch: false, streaming: false, embeddings: false },
		async complete(): Promise<LLMResponse> { return { text: '', stopReason: 'end_turn' }; },
		async *stream(): AsyncIterable<string> { /* unused */ },
		async embed(): Promise<number[]> { return []; },
		async completeStructured<T>(_m: LLMMessage[], schema: StructuredSchema, _o?: StructuredCompletionOpts): Promise<T> {
			const props = (schema as { properties?: Record<string, unknown> }).properties ?? {};
			return ('claims' in props ? EXTRACT_JSON : verify(autoFix)) as T;
		},
	});
}

type Doc = { meta: Record<string, unknown>; body: unknown; citations?: unknown };
const read = (p: string): Doc => JSON.parse(readFileSync(p, 'utf8')) as Doc;

function planFixture(): { repo: string; md: string; json: string; cleanup: () => void } {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-review-rev-'));
	mkdirSync(join(repo, 'src'), { recursive: true });
	writeFileSync(join(repo, 'src', 'foo.ts'), 'export const alpha = 1;\nexport const beta = 2;\nexport const gamma = 3;\n');
	const md = join(repo, 'PLAN.md');
	const json = join(repo, '.insrc', 'artifacts', `PLAN-${HASH}-s1.json`);
	mkdirSync(dirname(json), { recursive: true });
	writeFileSync(md, ARTIFACT);
	writeFileSync(json, JSON.stringify({ meta: { workflow: 'plan', epicHash: HASH, storyId: 's1', authoredBy: 'controller', ...draftMeta({ revision: 3 }) }, body: { tasks: ['extend the two exported constants in foo.'] }, citations: [] }, null, 2) + '\n');
	return { repo, md, json, cleanup: () => rmSync(repo, { recursive: true, force: true }) };
}

function finding(over: Partial<Finding>): Finding {
	return { claimId: 'c', kind: 'inventory', severity: 'MED', premise: 'p', evidence: 'e', action: 'a', fixability: 'manual', ...over };
}
function report(findings: Finding[]): ReviewReport {
	return { artifact: 'PLAN', stage: 'plan', verdict: 'block', findings, counts: { high: 0, med: 0, low: 0 }, reviewedAt: '', model: 'm' };
}

test('auto-fix review and apply resolution bump the revision, report-only review and accept override defer do not, through run-artifact and resolve', async () => {
	// run-artifact: a review that applies an auto-fix is a content write.
	const fixed = planFixture();
	try {
		const res = await reviewArtifactFile({ mdPath: fixed.md, jsonPath: fixed.json, repo: fixed.repo, lifecycle: createRepoLifecycle(fixed.repo).service, provider: provider(true), model: 'fake', reviewedAt: '2026-07-20T00:00:00.000Z', reReview: false });
		assert.equal(res.applied.length, 1);
		const after = read(fixed.json);
		assert.equal(after.meta['revision'], 4, 'an applied auto-fix mints the next revision');
		assert.match(JSON.stringify(after.body), /three exported constants/);
	} finally { fixed.cleanup(); }

	// run-artifact: a report-only review is meta-only.
	const only = planFixture();
	try {
		const before = read(only.json);
		const res = await reviewArtifactFile({ mdPath: only.md, jsonPath: only.json, repo: only.repo, lifecycle: createRepoLifecycle(only.repo).service, provider: provider(false), model: 'fake', reviewedAt: '2026-07-20T00:00:00.000Z', reReview: false });
		assert.equal(res.applied.length, 0);
		const after = read(only.json);
		assert.equal(after.meta['revision'], 3, 'a report-only review keeps the revision');
		assert.equal(JSON.stringify(after.body), JSON.stringify(before.body));
		assert.ok(lifecycleReviewOf(after.meta), 'the review is recorded on the lifecycle');
	} finally { only.cleanup(); }

	// resolve: apply is content; accept, override and defer are meta-only.
	const dir = mkdtempSync(join(tmpdir(), 'insrc-resolve-rev-'));
	try {
		const md = join(dir, 'PLAN-x.md');
		writeFileSync(md, '# Plan\n\n- t1: extend the two exported constants.\n');
		const findings = [
			finding({ claimId: 'apply1', severity: 'HIGH', fixability: 'assisted', proposedFix: { rationale: 'r', artifactEdits: [{ find: 'two exported constants', replace: 'three exported constants' }] } }),
			finding({ claimId: 'acc', severity: 'MED' }), finding({ claimId: 'ovr', severity: 'MED' }), finding({ claimId: 'def', severity: 'MED' }),
		];
		const json = writeReviewedHead(dir, `PLAN-${HASH}-s1`, { meta: { workflow: 'plan', epicHash: HASH, storyId: 's1' }, body: { tasks: [{ id: 't1', desc: 'extend the two exported constants.' }] }, report: report(findings) });
		const now = () => '2026-07-21T00:00:00.000Z';
		const revision = read(json).meta['revision'];
		await resolveReviewFinding(md, json, 'acc', 'accept', undefined, now);
		await resolveReviewFinding(md, json, 'ovr', 'override', 'ok', now);
		await resolveReviewFinding(md, json, 'def', 'defer', undefined, now);
		assert.equal(read(json).meta['revision'], revision, 'accept, override and defer keep the revision');
		await resolveReviewFinding(md, json, 'apply1', 'apply', undefined, now);
		assert.equal(read(json).meta['revision'], Number(revision) + 1, 'apply mints the next revision');
		assert.match(JSON.stringify(read(json).body), /three exported constants/);
	} finally { rmSync(dir, { recursive: true, force: true }); }
});
