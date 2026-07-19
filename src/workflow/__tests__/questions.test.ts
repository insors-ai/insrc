/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Unit tests for the shared cross-stage open-question module
 * (`src/workflow/questions.ts`):
 *   - questionId derivation (leading [id / verdict] tag vs sha fallback);
 *   - openQuestions / unresolvedOpen status computation;
 *   - recordResolution persists resolved / ignored / deferred to the right
 *     artifact meta and re-renders md with a "## Resolved questions" section;
 *   - a deferred question shows in listDeferred and is NOT in unresolvedOpen;
 *   - a resolved / ignored question does not re-surface in unresolvedOpen.
 *
 * Run: npx tsx --test src/workflow/__tests__/questions.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
	artifactOpenQuestions,
	listDeferred,
	openQuestions,
	questionId,
	recordResolution,
	unresolvedOpen,
} from '../questions.js';
import { ARTIFACTS_DIR, defineArtifactId, hldArtifactId, lldArtifactId } from '../storage.js';
import type { QuestionResolution } from '../types.js';

const HASH = 'a3f4b8c9d1e2f3a4';
const CREATED_AT = '2026-07-19T00:00:00.000Z';

function artifactsDir(repo: string): string {
	const d = join(repo, ARTIFACTS_DIR);
	mkdirSync(d, { recursive: true });
	return d;
}

function seedDef(repo: string, openQs: readonly string[]): void {
	writeFileSync(join(artifactsDir(repo), `${defineArtifactId(HASH)}.json`), JSON.stringify({
		meta: { workflow: 'define', runId: 'def-1', schemaVersion: 1, epicHash: HASH, epicSlug: 'tag-filtering', createdAt: CREATED_AT, approvedAt: CREATED_AT },
		body: { flavor: 'enhancement', problem: 'p', nonGoals: [], assumptions: [], constraints: [], stories: [{ id: 's1', title: 'One', userValue: 'v', acceptanceCriteria: [] }], openQuestions: openQs },
		citations: [],
	}, null, 2));
}

function seedHld(repo: string, openQs: readonly string[]): void {
	writeFileSync(join(artifactsDir(repo), `${hldArtifactId(HASH)}.json`), JSON.stringify({
		meta: { workflow: 'design.epic', runId: 'hld-run-1', schemaVersion: 1, epicHash: HASH, epicSlug: 'tag-filtering', createdAt: CREATED_AT },
		body: {
			frameworkSummary: 'fw', architectureShape: 'x', sharedContracts: [], storyBoundaries: [], nonFunctional: {},
			rolloutOverview: { phases: [], orderingRationale: 'x', riskyBits: [] },
			alternativesConsidered: [{ id: 'a1', name: 'x', oneLineSummary: 'x', approach: 'x', pros: [], cons: [], costEstimate: 'S' }],
			chosenAlternative: 'a1', openQuestions: openQs,
		},
		citations: [{ id: 'c1', kind: 'analyze-bundle', ref: 'x' }],
	}, null, 2));
}

function seedLld(repo: string, storyId: string, openQs: readonly string[]): void {
	writeFileSync(join(artifactsDir(repo), `${lldArtifactId(HASH, storyId)}.json`), JSON.stringify({
		meta: { workflow: 'design.story', runId: `lld-${storyId}`, schemaVersion: 1, epicHash: HASH, epicSlug: 'tag-filtering', storyId, hldBaseRunId: 'hld-run-1', hldEffectiveHash: 'basis', hldAmendmentsApplied: [] },
		body: {
			hldContextSlice: { frameworkSummary: 'fw', rolloutPhase: 'p1', ownedContracts: [], consumedContracts: [], boundary: { storyId, owns: [], depends: [], internal: 'x' }, nonFunctional: {} },
			contractDetails: { surfaceLevel: 'internal', api: [] },
			dataModelChanges: [], interactionWithShared: [],
			errorPaths: { errorCases: [], edgeCases: [], invariantsToPreserve: [] },
			testStrategy: { testLevels: [], acceptanceMapping: [], testFramework: 'node:test' },
			alternativesConsidered: [{ id: 'a1', name: 'x', oneLineSummary: 'x', approach: 'x', pros: [], cons: [], costEstimate: 'S' }],
			chosenAlternative: 'a1', openQuestions: openQs,
		},
		citations: [{ id: 'c1', kind: 'prior-artifact', ref: 'HLD' }],
	}, null, 2));
}

function mkRepo(): string {
	return mkdtempSync(join(tmpdir(), 'insrc-questions-'));
}

// ---------------------------------------------------------------------------
// questionId derivation
// ---------------------------------------------------------------------------

test('questionId: parses a leading [id / verdict] tag; falls back to a stable sha', () => {
	assert.equal(questionId('[sc2 / missed] should we cache?'), 'sc2');
	const shaId = questionId('a plain question');
	assert.match(shaId, /^q[0-9a-f]{8}$/);
	assert.equal(questionId('a plain question'), shaId);
});

// ---------------------------------------------------------------------------
// status computation
// ---------------------------------------------------------------------------

test('openQuestions / unresolvedOpen reflect recorded resolutions', () => {
	const texts = ['[q1 / a] First?', '[q2 / b] Second?', '[q3 / c] Third?'];
	const resolutions: Record<string, QuestionResolution> = {
		q1: { question: texts[0]!, status: 'resolved', choice: 'yes', resolvedAt: CREATED_AT },
		q2: { question: texts[1]!, status: 'deferred', resolvedAt: CREATED_AT },
	};
	const views = openQuestions(texts, resolutions);
	assert.deepEqual(views.map(v => v.status), ['resolved', 'deferred', 'open']);
	const open = unresolvedOpen(texts, resolutions);
	assert.deepEqual(open.map(v => v.id), ['q3']);   // resolved + deferred do NOT re-surface
});

// ---------------------------------------------------------------------------
// recordResolution — persistence per kind
// ---------------------------------------------------------------------------

test('recordResolution persists a resolved choice to HLD meta + renders section', () => {
	const repo = mkRepo();
	try {
		seedHld(repo, ['[sc1 / missed] Case-insensitive tags?']);
		const res = recordResolution(repo, 'hld', HASH, undefined, 'sc1', 'resolved', 'Case-insensitive', 'matches expectation');
		assert.equal(res.resolution.status, 'resolved');
		assert.equal(res.remainingOpen.length, 0);
		const hld = JSON.parse(readFileSync(join(artifactsDir(repo), `${hldArtifactId(HASH)}.json`), 'utf8')) as { meta: { questionResolutions?: Record<string, QuestionResolution> } };
		assert.equal(hld.meta.questionResolutions!['sc1']!.status, 'resolved');
		assert.equal(hld.meta.questionResolutions!['sc1']!.choice, 'Case-insensitive');
		const md = readFileSync(res.mdPath, 'utf8');
		assert.match(md, /## Resolved questions/);
		assert.match(md, /Case-insensitive/);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('recordResolution ignore + defer persist the right status to DEF meta', () => {
	const repo = mkRepo();
	try {
		seedDef(repo, ['[q1 / a] Add a metric?', '[q2 / b] Rename the field?']);
		recordResolution(repo, 'define', HASH, undefined, 'q1', 'ignored', undefined, 'not needed');
		const after = recordResolution(repo, 'define', HASH, undefined, 'q2', 'deferred');
		assert.equal(after.remainingOpen.length, 0);
		const def = JSON.parse(readFileSync(join(artifactsDir(repo), `${defineArtifactId(HASH)}.json`), 'utf8')) as { meta: { questionResolutions?: Record<string, QuestionResolution> } };
		assert.equal(def.meta.questionResolutions!['q1']!.status, 'ignored');
		assert.equal(def.meta.questionResolutions!['q2']!.status, 'deferred');
		// neither re-surfaces as open
		const { texts, resolutions } = artifactOpenQuestions(repo, 'define', HASH);
		assert.equal(unresolvedOpen(texts, resolutions).length, 0);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('recordResolution throws on an unknown questionId', () => {
	const repo = mkRepo();
	try {
		seedLld(repo, 's1', ['[q1 / a] Only?']);
		assert.throws(() => recordResolution(repo, 'lld', HASH, 's1', 'nope', 'resolved', 'x'), /no open question with id/);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------------------
// listDeferred — across DEF + HLD + all LLDs
// ---------------------------------------------------------------------------

test('listDeferred enumerates deferred questions across DEF + HLD + LLDs', () => {
	const repo = mkRepo();
	try {
		seedDef(repo, ['[d1 / a] Def q?']);
		seedHld(repo, ['[h1 / a] Hld q?']);
		seedLld(repo, 's1', ['[l1 / a] Lld s1 q?']);
		seedLld(repo, 's2', ['[l2 / a] Lld s2 q?']);
		recordResolution(repo, 'define', HASH, undefined, 'd1', 'deferred');
		recordResolution(repo, 'hld', HASH, undefined, 'h1', 'resolved', 'yes');    // NOT deferred
		recordResolution(repo, 'lld', HASH, 's1', 'l1', 'deferred');
		recordResolution(repo, 'lld', HASH, 's2', 'l2', 'ignored');                 // NOT deferred

		const deferred = listDeferred(repo, HASH);
		const keys = deferred.map(d => `${d.kind}:${d.storyId ?? '-'}:${d.questionId}`).sort();
		assert.deepEqual(keys, ['define:-:d1', 'lld:s1:l1']);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});
