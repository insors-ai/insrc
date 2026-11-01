/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * A read site with no Epic anchor fails before it creates a file (s1/t8): the
 * code-review subject paths, the questions locator and the gate and chain helpers.
 *
 * Run: npx tsx --test src/workflow/__tests__/anchor-missing-read.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { handleBuildStep } from '../../daemon/steps/build-step/handler.js';
import { MissingAnchorError } from '../artifact-ids.js';
import { deriveMdPath } from '../pending.js';
import { buildWorkItemGraph } from '../delivery/graph.js';
import { lldRecord, recordSet } from '../delivery/__tests__/fixtures.js';
import { buildChainReport } from '../chain.js';
import { appendStoryToDefine, requireApprovedEpic } from '../gates.js';
import { questionId, recordResolution } from '../questions.js';
import { approvedMeta } from './lifecycle-fixtures.js';
import './helpers/converted-repos.js';

const HASH = 'c0ffee00d15ea5e5';
const CREATED = '2026-10-01T10:00:00.000Z';
const QUESTION = 'Which format?';

function tempRepo(): { repo: string; done: () => void } {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-anchor-missing-'));
	mkdirSync(join(repo, '.insrc', 'artifacts'), { recursive: true });
	return { repo, done: () => rmSync(repo, { recursive: true, force: true }) };
}

/** A Define that carries no epicCreatedAt: stored before the stamp existed. */
function seedUnstampedDefine(repo: string): string {
	const path = join(repo, '.insrc', 'artifacts', `DEF-${HASH}.json`);
	writeFileSync(path, JSON.stringify({
		meta: { workflow: 'define', runId: 'd1', schemaVersion: 1, epicHash: HASH, epicSlug: 'an-epic', createdAt: CREATED },
		body: { problem: 'p', stories: [{ id: 's1', title: 't', userValue: 'v', acceptanceCriteria: [] }], openQuestions: [QUESTION] },
		citations: [],
	}));
	return path;
}

/** Everything under the repo (dot folders included), so "no file was created" can be compared. */
function listing(repo: string): string[] {
	const out: string[] = [];
	const walk = (rel: string): void => {
		for (const name of readdirSync(join(repo, rel))) {
			const child = rel === '' ? name : `${rel}/${name}`;
			out.push(child);
			if (statSync(join(repo, child)).isDirectory()) walk(child);
		}
	};
	walk('');
	return out.sort();
}

/** An approved standalone LLD stored before the stamp existed: nothing anchors its folder. */
function seedUnstampedStandaloneLld(repo: string): void {
	writeFileSync(join(repo, '.insrc', 'artifacts', `LLD-${HASH}-s1.json`), JSON.stringify({
		meta: {
			workflow: 'design.story', runId: 'l1', schemaVersion: 1, epicHash: HASH, epicSlug: 'a-small-fix', storyId: 's1',
			createdAt: CREATED, standalone: true, ...approvedMeta({ at: CREATED }),
		},
		body: { openQuestions: [] }, citations: [],
	}));
}

test('implement and validate on a standalone story whose LLD no anchor can place fail with missing-anchor and create nothing', async () => {
	for (const phase of ['implement', 'validate'] as const) {
		const r = tempRepo();
		try {
			seedUnstampedStandaloneLld(r.repo);
			const before = listing(r.repo);
			const env = await handleBuildStep({ phase, target: 's1', repo: r.repo, standalone: { standalone: true, epicHash: HASH, storyId: 's1', sizeClass: 'small' } as never });
			const out = JSON.parse(env.content[0]!.text) as { next: string; error?: { code: string } };
			assert.equal(out.next, 'error', `${phase}: not a prompt or a verdict`);
			assert.equal(out.error?.code, 'missing-anchor', phase);
			assert.deepEqual(listing(r.repo), before, `${phase}: no build-start stamp, record or folder was written`);
		} finally { r.done(); }
	}
});

test('pending and delivery do not date a record by its own day: an unstamped record gets no path and no dated id, and nothing is created', async () => {
	const r = tempRepo();
	try {
		const before = listing(r.repo);
		assert.equal(deriveMdPath(r.repo, 'LLD', { epicHash: HASH, storyId: 's1', createdAt: CREATED, standalone: true }), '');
		assert.equal(deriveMdPath(r.repo, 'LLD', { epicHash: HASH, storyId: 's1', createdAt: CREATED, epicCreatedAt: CREATED, standalone: true }).endsWith('/S001/LLD.md'), true);
		assert.deepEqual(listing(r.repo), before);
	} finally { r.done(); }
	const graph = buildWorkItemGraph(recordSet([lldRecord(HASH, 's1', { createdAt: CREATED, epicCreatedAt: undefined, standalone: true })]));
	assert.ok([...graph.items.keys()].every(id => !id.startsWith('E20261001')), 'no id is dated by the LLD\'s own day');
	assert.ok(graph.notices.some(n => n.code === 'identity-anchor-missing'), 'the missing anchor is reported as a notice, not hidden');
});
