/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * ISSUE-764b88ed — a ledger record (BUILD, TESTS, CR) stores the work item's
 * label, anchor and kind it was filed under, so the path derived from its own
 * stored meta is the md it was written to.
 *
 * The fixture is the case that drifted: a labelled standalone work item anchored
 * on one day, whose records are written on a later day. Before the fix every
 * record's meta derived a hash-named folder on its own day under docs/epics.
 *
 *   npx tsx --test src/workflow/__tests__/ledger-record-identity.test.ts
 */

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import type { LLMProvider } from '../../shared/types.js';
import { runCodeReview, DEFAULT_DEPS, type JudgeSlot } from '../code-review/runner.js';
import type { CodeReviewSubject, ReviewDimension } from '../code-review/types.js';
import { deriveMdPath } from '../pending.js';
import type { ArtifactKind } from '../path-scheme.js';
import { persistBuildRecord } from '../runners/build/standalone-record.js';
import { persistTestRecordTask } from '../runners/build/test-record.js';

const HASH   = '5a6b7c8d9e0f1a2b';               // hash8 '5a6b7c8d'
const ANCHOR = '2026-10-01T09:00:00.000Z';       // the work item's day: E20261001
const LATER  = '2026-10-04T15:00:00.000Z';       // the records' own day
const LABEL  = 'the-work-item-label';
const FOLDER = `docs/standalone/${LABEL}-E202610015a6b7c8d/S001`;

function withItem(fn: (repo: string) => void | Promise<void>): Promise<void> {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-ledger-identity-'));
	mkdirSync(join(repo, '.insrc', 'artifacts'), { recursive: true });
	const seed = (id: string, meta: Record<string, unknown>): void =>
		writeFileSync(join(repo, '.insrc', 'artifacts', `${id}.json`), JSON.stringify({ meta, body: {} }, null, 2) + '\n');
	seed(`ISSUE-${HASH}`, { workflow: 'issue', issueHash: HASH, createdAt: ANCHOR, epicCreatedAt: ANCHOR, epicSlug: LABEL, standalone: true });
	seed(`LLD-${HASH}-s1`, { workflow: 'design.story', epicHash: HASH, storyId: 's1', createdAt: ANCHOR, epicCreatedAt: ANCHOR, epicSlug: LABEL, standalone: true });
	return Promise.resolve(fn(repo)).finally(() => rmSync(repo, { recursive: true, force: true }));
}

/** The md path the record's own stored meta derives. */
function derivedFrom(json: string, kind: ArtifactKind, repo: string): string {
	return deriveMdPath(repo, kind, (JSON.parse(readFileSync(json, 'utf8')) as { meta: Record<string, unknown> }).meta);
}

test('764b88ed — a BUILD record stores the label, anchor and kind it was filed under', async () => {
	await withItem((repo) => {
		const { json, md } = persistBuildRecord(repo, {
			meta: { workflow: 'build', epicHash: HASH, storyId: 's1', createdAt: LATER, epicCreatedAt: LATER },
			body: { tasks: [{ id: 't1', passed: true }] },
		});
		assert.equal(md, join(repo, FOLDER, 'BUILD.md'));
		assert.equal(derivedFrom(json, 'BUILD', repo), md);
		const meta = (JSON.parse(readFileSync(json, 'utf8')) as { meta: Record<string, unknown> }).meta;
		assert.deepEqual([meta['epicSlug'], meta['epicCreatedAt'], meta['standalone'], meta['createdAt']], [LABEL, ANCHOR, true, LATER]);
	});
});

test('764b88ed — a TESTS record stores the label, anchor and kind it was filed under', async () => {
	await withItem((repo) => {
		const { json, md } = persistTestRecordTask(repo, { epicHash: HASH, storyId: 's1', now: LATER }, {
			taskId: 't1', commit: 'abc1234', ranAt: LATER, testsPassed: true, tests: [], files: [],
		});
		assert.equal(md, join(repo, FOLDER, 'TESTS.md'));
		assert.equal(derivedFrom(json, 'TESTS', repo), md);
	});
});

test('764b88ed — a code-review record stores the label, anchor and kind it was filed under', async () => {
	await withItem(async (repo) => {
		const subject: CodeReviewSubject = {
			repoPath: repo, epicHash: HASH, storyId: 's1', changedFiles: ['src/a.ts'],
			approvedLld:  { meta: { epicHash: HASH, storyId: 's1', epicSlug: LABEL, createdAt: ANCHOR, epicCreatedAt: ANCHOR, standalone: true }, body: {} } as unknown as CodeReviewSubject['approvedLld'],
			approvedPlan: null as unknown as CodeReviewSubject['approvedPlan'],
			buildRecord:  null,
		};
		const judges: JudgeSlot[] = (['adherence', 'conventions', 'coverage', 'quality'] as ReviewDimension[])
			.map(dimension => ({ dimension, judge: async () => ({ dimension, findings: [] }) }));
		const written: string[] = [];
		const out = await runCodeReview(subject, {} as unknown as LLMProvider, { runId: 'r1', modelLabel: 'test' }, {
			...DEFAULT_DEPS,
			judges,
			assembleGrounding: async () => ({ symbols: [] }),
			write: (path, content) => { written.push(path); DEFAULT_DEPS.write(path, content); },
		});
		assert.equal(out.ok, true);
		const json = written.find(p => p.endsWith('.json'))!;
		const md = written.find(p => p.endsWith('.md'))!;
		assert.equal(md, join(repo, FOLDER, 'CR.md'));
		assert.equal(derivedFrom(json, 'CR', repo), md);
	});
});
