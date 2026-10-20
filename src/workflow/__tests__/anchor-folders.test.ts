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
import { loadArtifactRecordSet } from '../delivery/load.js';
import { lldRecord, recordSet } from '../delivery/__tests__/fixtures.js';

const HASH = 'c0ffee00d15ea5e5';
const D0 = '2026-10-01T10:00:00.000Z';
const D1 = '2026-10-02T10:00:00.000Z';
const D2 = '2026-10-03T10:00:00.000Z';
const D3 = '2026-10-04T10:00:00.000Z';
const D4 = '2026-10-05T10:00:00.000Z';
const D5 = '2026-10-06T10:00:00.000Z';
const D6 = '2026-10-07T10:00:00.000Z';
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

/** What a design finalizer does: stamp the Epic's anchor on the record, write its json, and render its md in the
 *  folder the stamp names. Returns the md path. */
function writeDesign(r: ReturnType<typeof tempRepo>, kind: 'HLD' | 'LLD' | 'PLAN', createdAt: string, standalone: boolean, lldIsHead = false): string {
	const stamp = resolveEpicAnchor(r.repo, HASH)!;
	const meta = { epicHash: HASH, ...(kind === 'HLD' ? {} : { storyId: 's1' }), createdAt, epicCreatedAt: stamp, epicSlug: SLUG, ...(standalone ? { standalone: true } : {}) };
	const id = kind === 'HLD' ? `HLD-${HASH}` : `${kind}-${HASH}-s1`;
	// the standalone route's head is the LLD already on disk: do not replace its stamp-bearing record
	if (!(lldIsHead && kind === 'LLD')) r.seed(id, meta);
	const anchor = workItemAnchorCreatedAt(meta);
	const wk = standalone ? 'standalone' : 'epic';
	const md = kind === 'HLD' ? hldArtifactPaths(r.repo, HASH, anchor, wk, SLUG).md
		: kind === 'LLD' ? lldArtifactPaths(r.repo, HASH, 's1', anchor, wk, SLUG).md
		: planArtifactPaths(r.repo, HASH, 's1', anchor, wk, SLUG).md;
	mkdirSync(dirname(md), { recursive: true });
	writeFileSync(md, `# ${kind}\n`);
	return md;
}

test('HLD, LLD, PLAN, BUILD, TESTS and CR written on different days land in one folder on the epic route and on the standalone route, including delivery grouping', () => {
	// three routes: an epic (DEF head), a standalone feature headed by its stamped LLD, and a standalone fix headed by an ISSUE
	for (const route of ['epic', 'standalone-lld-head', 'standalone-issue-head'] as const) {
		const standalone = route !== 'epic';
		const lldIsHead = route === 'standalone-lld-head';
		const r = tempRepo();
		try {
			if (lldIsHead) {
				// no DEF: a stamped standalone LLD heads the work item (written on D1, stamped with the Epic's D0)
				r.seed(`LLD-${HASH}-s1`, { epicHash: HASH, storyId: 's1', createdAt: D1, epicCreatedAt: D0, epicSlug: SLUG, standalone: true });
			} else if (standalone) {
				r.seed(`ISSUE-${HASH}`, { issueHash: HASH, createdAt: D0, epicSlug: SLUG, standalone: true });
			} else {
				r.seed(`DEF-${HASH}`, { epicHash: HASH, createdAt: D0, epicSlug: SLUG });
			}
			assert.equal(resolveEpicAnchor(r.repo, HASH), D0);

			// the design records, each written on its own later day
			const design: string[] = [];
			design.push(dirname(writeDesign(r, 'HLD', D1, standalone)));
			design.push(dirname(dirname(writeDesign(r, 'LLD', D2, standalone, lldIsHead))));
			design.push(dirname(dirname(writeDesign(r, 'PLAN', D3, standalone))));

			// the ledger records: TESTS on D4, BUILD on D5, the code review on D6
			const tests = persistTestRecordTask(r.repo, { epicHash: HASH, storyId: 's1', now: D4, ...(standalone ? { standalone: true } : {}) }, task(D4));
			const build = persistBuildRecord(r.repo, buildRec(D5, standalone));
			const cr = codeReviewArtifactPaths(
				r.repo, HASH, 's1',
				codeReviewSubjectPathArgs({ repoPath: r.repo, epicHash: HASH, storyId: 's1', changedFiles: [], approvedLld: null, approvedPlan: null, buildRecord: null }).epicCreatedAt,
				standalone ? 'standalone' : 'epic', SLUG,
			).md;

			// the code review is a record too: written, with its stamp, on D6
			const crStamp = resolveEpicAnchor(r.repo, HASH)!;
			r.seed(`CR-${HASH}-s1`, { epicHash: HASH, storyId: 's1', createdAt: D6, epicCreatedAt: crStamp, epicSlug: SLUG, ...(standalone ? { standalone: true } : {}) });
			mkdirSync(dirname(cr), { recursive: true });
			writeFileSync(cr, '# CR\n');

			const folders = new Set([...design, dirname(dirname(tests.md)), dirname(dirname(build.md)), dirname(dirname(cr))]);
			assert.equal(folders.size, 1, `one folder, got ${[...folders].join(' | ')}`);
			assert.match([...folders][0]!, new RegExp(`/docs/${standalone ? 'standalone' : 'epics'}/${SLUG}-E20261001c0ffee00$`), route);
			assert.equal(dirname(tests.md), dirname(build.md), 'BUILD and TESTS share the story folder');

			// the delivery reader, over the store these records were written to, groups them under one work item
			const graph = buildWorkItemGraph(loadArtifactRecordSet(r.repo));
			const ids = [...graph.items.keys()];
			assert.ok(ids.every(id => id.startsWith('E20261001c0ffee00')), `${route}: every id carries the Epic's day, got ${ids.join(', ')}`);
			assert.ok(ids.includes('E20261001c0ffee00:S001'), 'the story is one item');
			const story = graph.items.get('E20261001c0ffee00:S001')!;
			const kinds = story.evidenceArtifactIds.map(a => a.split('-')[0]).sort();
			assert.deepEqual(kinds, ['BUILD', 'CR', 'LLD', 'PLAN']);
			// (TESTS records are not delivery evidence: the reader skips them by design, so they are checked by folder above.)
			if (route === 'epic') {
				const epicItem = graph.items.get('E20261001c0ffee00');
				assert.ok(epicItem?.evidenceArtifactIds.some(a => a.startsWith('DEF-')) && epicItem.evidenceArtifactIds.some(a => a.startsWith('HLD-')), 'the Epic item holds the DEF and the HLD');
			}
		} finally { r.done(); }
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
