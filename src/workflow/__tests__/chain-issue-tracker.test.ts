/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * ISSUE-5f9d4ab4c90c0b4c s1/t5: the chain's computeNextAction on an
 * ISSUE-anchored fixture runs the four-state tracker sequence once the LLD
 * is approved — push-tracker -> sync-tracker -> chain-complete — and never
 * hld/amendment/stale. buildChainReport + readTrackerMeta drive it.
 *
 * Run: npx tsx --test src/workflow/__tests__/chain-issue-tracker.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { buildChainReport } from '../chain.js';
import { artifactJsonPath, issueArtifactId, lldArtifactId, IMPLIED_ISSUE_STORY_ID } from '../storage.js';
import { writeAtomic } from '../storage.js';
import { markApprovedSync } from './lifecycle-fixtures.js';
import { seedBoundUnits } from './helpers/task-heads.js';
import { patchTrackerMeta } from '../tracker/refs.js';

const HASH = '5f9d4ab4c90c0b4c';
const CREATED = '2026-11-16T07:14:04.399Z';
const SLUG = 'issue-anchored-item';

function seedIssueRepo(): { repo: string; issue: string; cleanup: () => void } {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-chain-issue-trk-'));
	mkdirSync(join(repo, '.insrc', 'artifacts'), { recursive: true });
	const issue = artifactJsonPath(repo, issueArtifactId(HASH));
	writeAtomic(issue, JSON.stringify({
		meta: { workflow: 'issue', runId: 'iss-1', schemaVersion: 1, issueHash: HASH, epicHash: HASH, epicSlug: SLUG, createdAt: CREATED, epicCreatedAt: CREATED, standalone: true, magnitude: 'sized' },
		body: { title: 'ISSUE title', reproduction: 'x', rootCause: 'x', fixIntent: 'x' },
		citations: [],
	}, null, 2));
	markApprovedSync(issue);
	// the approved LLD of the implied s1
	const lld = artifactJsonPath(repo, lldArtifactId(HASH, IMPLIED_ISSUE_STORY_ID));
	writeAtomic(lld, JSON.stringify({
		meta: { workflow: 'design.story', runId: 'lld-1', schemaVersion: 1, epicHash: HASH, epicSlug: SLUG, storyId: IMPLIED_ISSUE_STORY_ID, createdAt: CREATED, epicCreatedAt: CREATED, standalone: true, sizeClass: 'bugfix' },
		body: {}, citations: [],
	}, null, 2));
	markApprovedSync(lld);
	return { repo, issue, cleanup: () => rmSync(repo, { recursive: true, force: true }) };
}

test('src/workflow/chain.ts computeNextAction + readTrackerMeta — buildChainReport four-state sequence on an ISSUE-anchored fixture: push-tracker -> sync-tracker -> chain-complete, never hld/amendment/stale', () => {
	// state 1: unpushed (no bindings, no tracker meta) + LLD approved -> push-tracker
	{
		const fx = seedIssueRepo();
		try {
			const r = buildChainReport(fx.repo, HASH);
			assert.equal(r.definitionKind, 'issue');
			assert.equal(r.tracker.pushed, false);
			assert.equal(r.nextAction.kind, 'push-tracker', JSON.stringify(r.nextAction));
			assert.ok(r.nextAction.kind === 'push-tracker' && r.nextAction.command.includes('tracker.push'));
		} finally { fx.cleanup(); }
	}
	// state 2: pushed (EPIC + STORY-s1 bound) but never synced -> sync-tracker
	{
		const fx = seedIssueRepo();
		try {
			seedBoundUnits(fx.repo, HASH, 'acme/demo#42', { [IMPLIED_ISSUE_STORY_ID]: 'acme/demo#42' }, CREATED);
			const r = buildChainReport(fx.repo, HASH);
			assert.equal(r.tracker.pushed, true);
			assert.equal(r.tracker.epicRef, 'acme/demo#42');
			assert.equal(r.nextAction.kind, 'sync-tracker', JSON.stringify(r.nextAction));
		} finally { fx.cleanup(); }
	}
	// state 3: pushed + lastSyncedAt set -> chain-complete
	{
		const fx = seedIssueRepo();
		try {
			seedBoundUnits(fx.repo, HASH, 'acme/demo#42', { [IMPLIED_ISSUE_STORY_ID]: 'acme/demo#42' }, CREATED);
			patchTrackerMeta(fx.issue, { lastSyncedAt: '2026-11-24T00:00:00.000Z' });
			const r = buildChainReport(fx.repo, HASH);
			assert.equal(r.tracker.pushed, true);
			assert.equal(r.tracker.lastSyncedAt, '2026-11-24T00:00:00.000Z');
			assert.equal(r.nextAction.kind, 'chain-complete', JSON.stringify(r.nextAction));
		} finally { fx.cleanup(); }
	}
	// state 4: LLD missing -> run-lld (tracker steps not reached); LLD unapproved -> approve-lld
	{
		const repo = mkdtempSync(join(tmpdir(), 'insrc-chain-issue-trk2-'));
		try {
			mkdirSync(join(repo, '.insrc', 'artifacts'), { recursive: true });
			const issue = artifactJsonPath(repo, issueArtifactId(HASH));
			writeAtomic(issue, JSON.stringify({
				meta: { workflow: 'issue', runId: 'iss-1', schemaVersion: 1, issueHash: HASH, epicHash: HASH, epicSlug: SLUG, createdAt: CREATED, epicCreatedAt: CREATED, standalone: true, magnitude: 'sized' },
				body: { title: 't', reproduction: 'x', rootCause: 'x', fixIntent: 'x' }, citations: [],
			}, null, 2));
			markApprovedSync(issue);
			assert.equal(buildChainReport(repo, HASH).nextAction.kind, 'run-lld');
			const lld = artifactJsonPath(repo, lldArtifactId(HASH, IMPLIED_ISSUE_STORY_ID));
			writeAtomic(lld, JSON.stringify({ meta: { workflow: 'design.story', runId: 'l', schemaVersion: 1, epicHash: HASH, epicSlug: SLUG, storyId: 's1', createdAt: CREATED, epicCreatedAt: CREATED, standalone: true }, body: {}, citations: [] }, null, 2));
			assert.equal(buildChainReport(repo, HASH).nextAction.kind, 'approve-lld');
			// and across all four states the action is never hld/amendment/stale
			for (const seed of [0, 1, 2]) {
				const fx = seedIssueRepo();
				try {
					if (seed >= 1) seedBoundUnits(fx.repo, HASH, 'acme/demo#42', { [IMPLIED_ISSUE_STORY_ID]: 'acme/demo#42' }, CREATED);
					if (seed >= 2) patchTrackerMeta(fx.issue, { lastSyncedAt: '2026-11-24T00:00:00.000Z' });
					const kind = buildChainReport(fx.repo, HASH).nextAction.kind;
					assert.ok(!['run-hld', 'approve-hld', 'review-amendment', 'refresh-stale'].includes(kind), `ISSUE chain must never name ${kind}`);
				} finally { fx.cleanup(); }
			}
		} finally { rmSync(repo, { recursive: true, force: true }); }
	}
});
