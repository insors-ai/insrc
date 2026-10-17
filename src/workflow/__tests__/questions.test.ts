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

import { afterEach, test } from 'node:test';
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
import { _setTrackerExecForTests } from '../tracker/github.js';
import { getLogger } from '../../shared/logger.js';

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
		meta: { workflow: 'design.story', runId: `lld-${storyId}`, schemaVersion: 1, epicHash: HASH, epicSlug: 'tag-filtering', createdAt: CREATED_AT, storyId, hldBaseRunId: 'hld-run-1', hldEffectiveHash: 'basis', hldAmendmentsApplied: [] },
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

// ---------------------------------------------------------------------------
// The tracker comment goes through the GitHub adapter (s1/t9)
// ---------------------------------------------------------------------------

afterEach(() => { _setTrackerExecForTests(); delete process.env['INSRC_GITHUB_CONFIG']; });

/** A repo whose HLD carries an Epic ref and whose github.json targets acme/demo for it. */
function seedTrackedHld(repo: string): void {
	seedHld(repo, ['[sc1 / missed] Case-insensitive tags?']);
	const path = join(artifactsDir(repo), `${hldArtifactId(HASH)}.json`);
	const hld = JSON.parse(readFileSync(path, 'utf8')) as { meta: Record<string, unknown> };
	hld.meta['tracker'] = { adapter: 'github', epicRef: 'acme/demo#5' };
	writeFileSync(path, JSON.stringify(hld, null, 2));
	const cfg = join(repo, 'github.json');
	writeFileSync(cfg, JSON.stringify({ repos: { [repo]: { owner: 'acme', repo: 'demo' } } }));
	process.env['INSRC_GITHUB_CONFIG'] = cfg;
}

test('the comment goes through the adapter with the same argv and a failure is logged in the existing catch', () => {
	const repo = mkRepo();
	try {
		seedTrackedHld(repo);
		const calls: string[][] = [];
		_setTrackerExecForTests((_cmd, args) => { calls.push([...args]); return ''; });
		const res = recordResolution(repo, 'hld', HASH, undefined, 'sc1', 'resolved', 'Case-insensitive', 'matches expectation');
		const comments = calls.filter(c => c[0] === 'issue' && c[1] === 'comment');
		assert.equal(comments.length, 1);
		assert.deepEqual(comments[0]!.slice(0, 5), ['issue', 'comment', '5', '--repo', 'acme/demo']);
		assert.equal(comments[0]![5], '--body');
		assert.match(comments[0]![6]!, /HLD open question `sc1`.*resolved: Case-insensitive/);

		// A failing comment is swallowed by the existing catch: the resolution is still recorded.
		// getLogger caches one child per module, so wrapping warn here sees the module's own log calls.
		const log = getLogger('workflow:questions');
		const realWarn = log.warn;
		const warned: Array<{ err?: string; msg: string }> = [];
		(log as { warn: unknown }).warn = (obj: { err?: string }, msg: string) => { warned.push({ ...(obj.err !== undefined ? { err: obj.err } : {}), msg }); };
		const failing: string[][] = [];
		_setTrackerExecForTests((_cmd, args) => { failing.push([...args]); if (args[0] === 'issue' && args[1] === 'comment') throw Object.assign(new Error('Command failed'), { stderr: 'HTTP 502' }); return ''; });
		let again: ReturnType<typeof recordResolution>;
		try {
			again = recordResolution(repo, 'hld', HASH, undefined, 'sc1', 'resolved', 'Case-sensitive', 'changed my mind');
		} finally { (log as { warn: unknown }).warn = realWarn; }
		const trackerWarn = warned.filter(w => w.msg === 'resolution: tracker comment failed (best-effort)');
		assert.equal(trackerWarn.length, 1, 'the existing catch logs the failed comment');
		assert.match(trackerWarn[0]!.err ?? '', /HTTP 502/);
		assert.equal(failing.filter(c => c[0] === 'issue' && c[1] === 'comment').length, 1, 'one attempt, no retry');
		assert.equal(again.resolution.choice, 'Case-sensitive');
		assert.equal(res.resolution.status, 'resolved');
	} finally { rmSync(repo, { recursive: true, force: true }); }
});
