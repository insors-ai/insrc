/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The chain report's tracker record shows the issue key, artifact id and revision of the Epic and each Story with an issue, and the
 * sync-tracker next action names the explicit refresh (Story s9). Nothing it shows is stored: TrackerMeta gains no field.
 *
 * Run: npx tsx --test src/workflow/__tests__/chain-report-tracker.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildChainReport, formatChainReport } from '../chain.js';
import { artifactJsonPath, defineArtifactId, lldArtifactId } from '../storage.js';
import type { TrackerMeta } from '../tracker/refs.js';
import { seedBoundUnits } from './helpers/task-heads.js';
import { approveReviewed, writeDefine, writeHld, writeLld } from './helpers/chain-fixtures.js';
import { computeHldEffectiveHash } from '../artifacts/lld.js';

const HASH = 'a3f4b8c9d1e2f3a4';
const CREATED = '2026-07-17T07:42:28.275Z';

const story = (id: string) => ({ id, title: `story ${id}`, userValue: 'v', acceptanceCriteria: [] });

/** A repo with a Define of two Stories, both with an issue; the LLD of s1 carries revision 3 and s2 has no LLD. */
function seed(opts: { defineRevision?: number; tracker?: Record<string, unknown> } = {}): string {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-chain-tracker-'));
	mkdirSync(join(repo, '.insrc', 'artifacts'), { recursive: true });
	writeFileSync(artifactJsonPath(repo, defineArtifactId(HASH)), JSON.stringify({
		meta: { workflow: 'define', runId: 'd1', repoPath: repo, epicHash: HASH, epicSlug: 'e', createdAt: CREATED, epicCreatedAt: CREATED, schemaVersion: 1,
			...(opts.defineRevision !== undefined ? { revision: opts.defineRevision } : {}), ...(opts.tracker !== undefined ? { tracker: opts.tracker } : {}) },
		body: { flavor: 'enhancement', problem: 'p', nonGoals: [], assumptions: [], constraints: [], stories: [story('s1'), story('s2')], openQuestions: [] },
		citations: [],
	}));
	writeFileSync(artifactJsonPath(repo, lldArtifactId(HASH, 's1')), JSON.stringify({ meta: { workflow: 'design.story', runId: 'l1', repoPath: repo, epicHash: HASH, storyId: 's1', createdAt: CREATED, epicCreatedAt: CREATED, revision: 3, schemaVersion: 1 }, body: {}, citations: [] }));
	seedBoundUnits(repo, HASH, 'o/r#1', { s1: 'o/r#2', s2: 'o/r#3' }, CREATED);
	return repo;
}

test('the tracker record carries artifactId and revision for the Epic and each Story with an issue, 0 when absent', () => {
	const withRevision = seed({ defineRevision: 5 });
	const without = seed();
	try {
		const t = buildChainReport(withRevision, HASH).tracker;
		assert.equal(t.pushed, true);
		assert.equal(t.artifactId, defineArtifactId(HASH));
		assert.equal(t.revision, 5);
		assert.deepEqual(t.stories, [
			{ id: 's1', issue: 'o/r#2', artifactId: lldArtifactId(HASH, 's1'), revision: 3 },
			{ id: 's2', issue: 'o/r#3', artifactId: lldArtifactId(HASH, 's2'), revision: 0 },
		]);
		assert.equal(buildChainReport(without, HASH).tracker.revision, 0, 'a Define with no revision shows 0');
		// a Story without an issue is left out
		const bare = mkdtempSync(join(tmpdir(), 'insrc-chain-tracker-bare-'));
		try {
			mkdirSync(join(bare, '.insrc', 'artifacts'), { recursive: true });
			writeFileSync(artifactJsonPath(bare, defineArtifactId(HASH)), readFileSync(artifactJsonPath(without, defineArtifactId(HASH)), 'utf8').replaceAll(without, bare));
			seedBoundUnits(bare, HASH, 'o/r#1', { s1: 'o/r#2' }, CREATED);
			assert.deepEqual(buildChainReport(bare, HASH).tracker.stories?.map(s => s.id), ['s1']);
		} finally { rmSync(bare, { recursive: true, force: true }); }
		assert.match(formatChainReport(buildChainReport(withRevision, HASH)), /DEF-a3f4b8c9d1e2f3a4 revision 5/);
	} finally { rmSync(withRevision, { recursive: true, force: true }); rmSync(without, { recursive: true, force: true }); }
});

test('the stored TrackerMeta gains no field and the sync-tracker next action names the explicit refresh', () => {
	const repo = seed({ defineRevision: 5, tracker: { adapter: 'github', labelsCreated: ['insrc:epic'] } });
	try {
		const before = readFileSync(artifactJsonPath(repo, defineArtifactId(HASH)), 'utf8');
		const report = buildChainReport(repo, HASH);
		// the report is read-only: the Define on disk is not touched and its tracker block holds none of the shown fields
		assert.equal(readFileSync(artifactJsonPath(repo, defineArtifactId(HASH)), 'utf8'), before);
		const stored = (JSON.parse(before) as { meta: { tracker: Record<string, unknown> } }).meta.tracker;
		for (const shown of ['artifactId', 'revision', 'stories']) assert.equal(shown in stored, false, shown);
		const keys: ReadonlyArray<keyof TrackerMeta> = ['adapter', 'labelsCreated'];   // a field added to TrackerMeta must be added here on purpose
		assert.ok(keys.every(k => k in stored));

	} finally { rmSync(repo, { recursive: true, force: true }); }

	// every design approved, the Epic pushed and never synced: the next action names the explicit refresh, not the GitHub-only workflow
	const chain = mkdtempSync(join(tmpdir(), 'insrc-chain-tracker-sync-'));
	try {
		approveReviewed(writeDefine(chain, HASH, { stories: ['s1'] }));
		approveReviewed(writeHld(chain, HASH, 'hld-1').path);
		approveReviewed(writeLld(chain, HASH, 's1', 'hld-1', computeHldEffectiveHash('hld-1', [])));
		seedBoundUnits(chain, HASH, 'o/r#1', {}, CREATED);
		const next = buildChainReport(chain, HASH).nextAction;
		assert.equal(next.kind, 'sync-tracker');
		if (next.kind === 'sync-tracker') {
			assert.equal(next.command, `insrc workflow sync ${HASH}`);
			assert.doesNotMatch(next.command, /workflow=tracker\.sync/);
		}
	} finally { rmSync(chain, { recursive: true, force: true }); }
});
