/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * One folder per Epic however many days its records are written over (s1/t8): on the
 * epic route (a DEF head) and the standalone route (a stamped LLD head), for HLD, LLD,
 * PLAN, BUILD, TESTS and CR, and in the delivery read model's grouping.
 *
 * Run: npx tsx --test src/workflow/__tests__/anchor-folders.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { MissingAnchorError } from '../artifact-ids.js';
import {
	codeReviewArtifactPaths, hldArtifactPaths, lldArtifactPaths, planArtifactPaths,
	readEpicDefinitionCore, resolveEpicAnchor, workItemAnchorCreatedAt,
} from '../storage.js';
import { codeReviewSubjectPathArgs } from '../code-review/subject-paths.js';
import { persistBuildRecord, type BuildRecord } from '../runners/build/standalone-record.js';
import { persistTestRecordTask } from '../runners/build/test-record.js';
import { buildWorkItemGraph } from '../delivery/graph.js';
import { buildRecord as dBuild, crRecord, defRecord, lldRecord, planRecord, recordSet } from '../delivery/__tests__/fixtures.js';

const HASH = 'c0ffee00d15ea5e5';
const D0 = '2026-10-01T10:00:00.000Z';
const D1 = '2026-10-02T10:00:00.000Z';
const D2 = '2026-10-03T10:00:00.000Z';
const D3 = '2026-10-04T10:00:00.000Z';
const D4 = '2026-10-05T10:00:00.000Z';
const SLUG = 'tag-filtering';

function tempRepo(): { repo: string; seed: (id: string, meta: Record<string, unknown>) => void; done: () => void } {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-anchor-folders-'));
	mkdirSync(join(repo, '.insrc', 'artifacts'), { recursive: true });
	return {
		repo,
		seed: (id, meta) => writeFileSync(join(repo, '.insrc', 'artifacts', `${id}.json`), JSON.stringify({ meta, body: {} })),
		done: () => rmSync(repo, { recursive: true, force: true }),
	};
}

const task = (at: string) => ({ taskId: 't1', ranAt: at, testsPassed: true, tests: [], files: [] });
const buildRec = (createdAt: string, standalone: boolean): BuildRecord => ({
	meta: { workflow: 'build', epicHash: HASH, storyId: 's1', createdAt, updatedAt: createdAt, ...(standalone ? { standalone: true } : {}) },
	body: { tasks: [{ id: 't1', passed: true }] },
} as unknown as BuildRecord);

/** HLD, LLD and PLAN take their folder from the anchor a finalizer reads (resolveEpicAnchor) and stamps. */
function designFolders(repo: string, standalone: boolean): string[] {
	const stamp = resolveEpicAnchor(repo, HASH)!;
	const kind = standalone ? 'standalone' : 'epic';
	return [
		dirname(hldArtifactPaths(repo, HASH, workItemAnchorCreatedAt({ epicCreatedAt: stamp }), kind, SLUG).md),
		dirname(dirname(lldArtifactPaths(repo, HASH, 's1', workItemAnchorCreatedAt({ epicCreatedAt: stamp }), kind, SLUG).md)),
		dirname(dirname(planArtifactPaths(repo, HASH, 's1', workItemAnchorCreatedAt({ epicCreatedAt: stamp }), kind, SLUG).md)),
	];
}

test('HLD, LLD, PLAN, BUILD, TESTS and CR written on different days land in one folder on the epic route and on the standalone route, including delivery grouping', () => {
	for (const standalone of [false, true]) {
		const r = tempRepo();
		try {
			if (standalone) {
				// no DEF: a stamped standalone LLD heads the work item
				r.seed(`LLD-${HASH}-s1`, { epicHash: HASH, storyId: 's1', createdAt: D1, epicCreatedAt: D0, epicSlug: SLUG, standalone: true });
			} else {
				r.seed(`DEF-${HASH}`, { epicHash: HASH, createdAt: D0, epicSlug: SLUG });
			}
			assert.equal(resolveEpicAnchor(r.repo, HASH), D0);

			const design = designFolders(r.repo, standalone);
			// the ledger records, each written on a later day
			const tests = persistTestRecordTask(r.repo, { epicHash: HASH, storyId: 's1', now: D3, ...(standalone ? { standalone: true } : {}) }, task(D3));
			const build = persistBuildRecord(r.repo, buildRec(D3, standalone));
			const cr = codeReviewArtifactPaths(
				r.repo, HASH, 's1',
				codeReviewSubjectPathArgs({ repoPath: r.repo, epicHash: HASH, storyId: 's1', changedFiles: [], approvedLld: null, approvedPlan: null, buildRecord: null }).epicCreatedAt,
				standalone ? 'standalone' : 'epic', SLUG,
			).md;

			const folders = new Set([...design, dirname(dirname(tests.md)), dirname(dirname(build.md)), dirname(dirname(cr))]);
			assert.equal(folders.size, 1, `one folder, got ${[...folders].join(' | ')}`);
			assert.match([...folders][0]!, new RegExp(`/docs/${standalone ? 'standalone' : 'epics'}/${SLUG}-E20261001c0ffee00$`));
			assert.equal(dirname(tests.md), dirname(build.md), 'BUILD and TESTS share the story folder');
		} finally { r.done(); }

		// the delivery read model groups the same records, written on different days, under one work item
		const records = standalone
			? [
				lldRecord(HASH, 's1', { createdAt: D1, epicCreatedAt: D0, standalone: true }),
				dBuild(HASH, 's1', [{ id: 't1', passed: true }], { createdAt: D3, epicCreatedAt: D0, standalone: true }),
				crRecord(HASH, 's1', 'pass', { createdAt: D4, epicCreatedAt: D0, standalone: true }),
			]
			: [
				defRecord(HASH, ['s1'], { createdAt: D0, epicCreatedAt: D0 }),
				lldRecord(HASH, 's1', { createdAt: D1, epicCreatedAt: D0 }),
				planRecord(HASH, 's1', ['t1'], { createdAt: D2, epicCreatedAt: D0 }),
				dBuild(HASH, 's1', [{ id: 't1', passed: true }], { createdAt: D3, epicCreatedAt: D0 }),
				crRecord(HASH, 's1', 'pass', { createdAt: D4, epicCreatedAt: D0 }),
			];
		const graph = buildWorkItemGraph(recordSet(records));
		const ids = [...graph.items.keys()];
		assert.ok(ids.every(id => id.startsWith('E20261001c0ffee00')), `every id carries the Epic's day, got ${ids.join(', ')}`);
		assert.ok(ids.includes('E20261001c0ffee00:S001'), 'the story is one item');
	}
});

test('an unstamped standalone LLD head does not yield its own createdAt as the anchor', () => {
	const r = tempRepo();
	try {
		r.seed(`LLD-${HASH}-s1`, { epicHash: HASH, storyId: 's1', createdAt: D1, epicSlug: SLUG, standalone: true });
		assert.equal(resolveEpicAnchor(r.repo, HASH), undefined);
		assert.equal(readEpicDefinitionCore(r.repo, HASH).createdAt, undefined);
		assert.throws(() => workItemAnchorCreatedAt({ epicCreatedAt: undefined }), MissingAnchorError);
		assert.throws(
			() => codeReviewSubjectPathArgs({ repoPath: r.repo, epicHash: HASH, storyId: 's1', changedFiles: [], approvedLld: null, approvedPlan: null, buildRecord: null }),
			MissingAnchorError,
		);
	} finally { r.done(); }

	// the delivery read model does not date the story by that LLD's own day either
	const graph = buildWorkItemGraph(recordSet([lldRecord(HASH, 's1', { createdAt: D1, epicCreatedAt: undefined, standalone: true })]));
	const ids = [...graph.items.keys()];
	assert.ok(!ids.some(id => id.startsWith('E20261002')), `no id is dated by the LLD's own day, got ${ids.join(', ')}`);
});
