/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Every meta-only writer (sc3) leaves the artifact body byte-identical and the
 * revision unchanged: question resolution, findings review stamp, refs patch,
 * bugfix stamp, orchestrator tracker push and sync.
 *
 * Run: npx tsx --test src/workflow/__tests__/meta-only-body-unchanged.test.ts
 */

import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { recordResolution, questionId } from '../questions.js';
import { patchTrackerMeta } from '../tracker/refs.js';
import { _setTrackerExecForTests } from '../tracker/github.js';
import { defaultStampDeps } from '../bugfix/stamp.js';
import { _mutateEpicTrackerMeta } from '../orchestrator.js';
import { ARTIFACTS_DIR, defineArtifactId, hldArtifactId, artifactJsonPath, issueArtifactId } from '../storage.js';
import { handleReviewStep } from '../../daemon/steps/review-step/handler.js';
import { _clearReviewStateStoreForTests } from '../../daemon/steps/review-step/state-store.js';
import { DEFAULT_DESIGN_REVIEW_SETTINGS, reviewTemplateFor } from '../review/template.js';

const HASH = 'a3f4b8c9d1e2f3a4';
const CREATED_AT = '2026-07-19T00:00:00.000Z';
const Q = '[sc1 / missed] Case-insensitive tags?';

afterEach(() => { _setTrackerExecForTests(); });

type Doc = { meta: Record<string, unknown>; body: unknown; citations?: unknown };
const read = (p: string): Doc => JSON.parse(readFileSync(p, 'utf8')) as Doc;

function repoWith(name: string, doc: Doc): { repo: string; json: string; cleanup: () => void } {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-metaonly-'));
	mkdirSync(join(repo, ARTIFACTS_DIR), { recursive: true });
	const json = join(repo, ARTIFACTS_DIR, `${name}.json`);
	writeFileSync(json, JSON.stringify(doc, null, 2) + '\n');
	return { repo, json, cleanup: () => rmSync(repo, { recursive: true, force: true }) };
}

function sameBodyAndRevision(before: Doc, after: Doc, revision: number | undefined): void {
	assert.equal(JSON.stringify(after.body), JSON.stringify(before.body), 'the body is byte-identical');
	assert.equal(JSON.stringify(after.citations), JSON.stringify(before.citations), 'the citations are byte-identical');
	assert.equal(after.meta['revision'], revision, 'the revision is unchanged');
}

test('every meta-only writer leaves the body byte-identical and the revision unchanged', async () => {
	// questions resolution (HLD)
	{
		const hld: Doc = {
			meta: { workflow: 'design.epic', runId: 'h1', schemaVersion: 1, epicHash: HASH, epicSlug: 'tag-filtering', createdAt: CREATED_AT, epicCreatedAt: CREATED_AT, revision: 4 },
			body: {
				frameworkSummary: 'fw', architectureShape: 'x', sharedContracts: [], storyBoundaries: [], nonFunctional: {},
				rolloutOverview: { phases: [], orderingRationale: 'x', riskyBits: [] },
				alternativesConsidered: [{ id: 'a1', name: 'x', oneLineSummary: 'x', approach: 'x', pros: [], cons: [], costEstimate: 'S' }],
				chosenAlternative: 'a1', openQuestions: [Q],
			},
			citations: [{ id: 'c1', kind: 'analyze-bundle', ref: 'x' }],
		};
		const fx = repoWith(hldArtifactId(HASH), hld);
		try {
			_setTrackerExecForTests(() => '');
			recordResolution(fx.repo, 'hld', HASH, undefined, questionId(Q), 'resolved', 'yes', 'why', { commit: false });
			const after = read(fx.json);
			sameBodyAndRevision(hld, after, 4);
			assert.ok((after.meta['questionResolutions'] as Record<string, unknown>)[questionId(Q)]);
		} finally { fx.cleanup(); }
	}

	// refs patch
	{
		const doc: Doc = { meta: { workflow: 'design.story', revision: 2 }, body: { a: 1 }, citations: [] };
		const fx = repoWith('LLD-x-s1', doc);
		try {
			patchTrackerMeta(fx.json, { storyRef: 'o/r#2', pushedAt: 'p' });
			sameBodyAndRevision(doc, read(fx.json), 2);
		} finally { fx.cleanup(); }
	}

	// bugfix stamp
	{
		const doc: Doc = { meta: { workflow: 'issue', revision: 5, approvedAt: 'a' }, body: { title: 'Fix', reproduction: 'r', rootCause: 'c', fixIntent: 'f' }, citations: [] };
		const fx = repoWith(issueArtifactId('abc123def4567890'), doc);
		try {
			defaultStampDeps(async () => { throw new Error('unused'); }).writeParentRef(fx.repo, 'abc123def4567890', { slug: 'owner', storyId: 's2' });
			const after = read(fx.json);
			sameBodyAndRevision(doc, after, 5);
			assert.deepEqual(after.meta['parentRef'], { slug: 'owner', storyId: 's2' });
		} finally { fx.cleanup(); }
	}

	// orchestrator tracker push and sync (Define)
	{
		const doc: Doc = { meta: { workflow: 'define', epicSlug: 'tag-filtering', revision: 7 }, body: { stories: [] }, citations: [] };
		const fx = repoWith(defineArtifactId(HASH), doc);
		try {
			_mutateEpicTrackerMeta(fx.repo, HASH, 'tracker.push', { epicRef: 'o/r#1', storyRefs: { s1: 'o/r#2' }, labelsCreated: ['l'] } as never);
			let after = read(fx.json);
			sameBodyAndRevision(doc, after, 7);
			assert.equal((after.meta['tracker'] as Record<string, unknown>)['epicRef'], 'o/r#1');
			_mutateEpicTrackerMeta(fx.repo, HASH, 'tracker.sync', { epicStatus: 'open', storyStatus: { s1: 'open' }, syncedAt: 's' } as never);
			after = read(fx.json);
			sameBodyAndRevision(doc, after, 7);
			assert.equal((after.meta['tracker'] as Record<string, unknown>)['epicStatus'], 'open');
			assert.equal(artifactJsonPath(fx.repo, defineArtifactId(HASH)), fx.json);
		} finally { fx.cleanup(); }
	}

	// findings review stamp (insrc_review_step findings phase)
	{
		_clearReviewStateStoreForTests();
		const repo = mkdtempSync(join(tmpdir(), 'insrc-metaonly-find-'));
		try {
			mkdirSync(join(repo, 'docs', 'stub'), { recursive: true });
			mkdirSync(join(repo, '.insrc', 'artifacts'), { recursive: true });
			const mdPath = join(repo, 'docs', 'stub', 's1.md');
			const jsonPath = join(repo, 'docs', 'stub', 's1.json');
			writeFileSync(mdPath, '# LLD\n\nThe design body.\n');
			const doc: Doc = { meta: { workflow: 'design.story', epicHash: 'abcd', storyId: 'S001', authoredBy: 'daemon', revision: 9 }, body: { note: 'untouched' } };
			writeFileSync(jsonPath, JSON.stringify(doc, null, 2) + '\n');
			const started = JSON.parse((await handleReviewStep({ phase: 'start', artifact: mdPath, repo })).content[0]!.text) as { state: string };
			const spec = reviewTemplateFor('spec', DEFAULT_DESIGN_REVIEW_SETTINGS);
			const findings = { items: spec.items.map(it => ({ item: it.id, premises: [{ premise: `claim under ${it.id}`, outcome: 'holds', evidence: 'read the code', action: '' }] })) };
			const out = JSON.parse((await handleReviewStep({ phase: 'findings', state: started.state, findings })).content[0]!.text) as { next: string };
			assert.equal(out.next, 'done');
			const after = read(jsonPath);
			sameBodyAndRevision(doc, after, 9);
			assert.ok(after.meta['review']);
		} finally { rmSync(repo, { recursive: true, force: true }); }
	}
});
