/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The daemon method tracker.sync runs refreshTrackerStatus for the one Epic and returns its SyncResult (Story s9).
 *
 * Run: npx tsx --test src/daemon/__tests__/tracker-sync-method.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { handleTrackerSync } from '../tracker-setup-handlers.js';
import { artifactJsonPath, defineArtifactId } from '../../workflow/storage.js';
import { seedBoundUnits } from '../../workflow/__tests__/helpers/task-heads.js';
import { installExecStandIn } from '../../workflow/__tests__/helpers/exec-stand-in.js';

const HASH = 'a3f4b8c9d1e2f3a4';
const CREATED = '2026-07-17T07:42:28.275Z';

test('tracker.sync runs refreshTrackerStatus for the one Epic and returns its SyncResult', async () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-tracker-sync-'));
	const cfg = join(repo, 'github.json');
	const prior = process.env['INSRC_GITHUB_CONFIG'];
	try {
		mkdirSync(join(repo, '.insrc', 'artifacts'), { recursive: true });
		writeFileSync(cfg, JSON.stringify({ repos: { [repo]: { type: 'github', owner: 'o', repo: 'r' } } }));
		process.env['INSRC_GITHUB_CONFIG'] = cfg;
		const defineJson = artifactJsonPath(repo, defineArtifactId(HASH));
		writeFileSync(defineJson, JSON.stringify({
			meta: { workflow: 'define', runId: 'd1', repoPath: repo, epicHash: HASH, epicSlug: 'e', createdAt: CREATED, epicCreatedAt: CREATED, schemaVersion: 1 },
			body: { flavor: 'enhancement', problem: 'p', nonGoals: [], assumptions: [], constraints: [], stories: [{ id: 's1', title: 't', userValue: 'v', acceptanceCriteria: [] }], openQuestions: [] }, citations: [],
		}));
		seedBoundUnits(repo, HASH, 'o/r#1', { s1: 'o/r#2' }, CREATED);
		installExecStandIn((_cmd, args) => {
			if (args[0] === 'api' && args[1] === 'user') return JSON.stringify({ login: 'me' });
			if (args[0] === 'issue' && args[1] === 'view') {
				const labels = args[2] === '1' ? [{ name: 'status:in-progress' }] : [];
				return JSON.stringify({ number: Number(args[2]), title: 't', state: 'OPEN', author: { login: 'me' }, assignees: [], labels, url: 'https://github.com/o/r/issues/' + args[2], createdAt: CREATED, updatedAt: CREATED, body: '', comments: [] });
			}
			return '';
		});

		const result = await handleTrackerSync({ repoPath: repo, epicHash: HASH });
		assert.equal('error' in result, false);
		assert.equal((result as { status: string }).status, 'synced');
		const tracker = (JSON.parse(readFileSync(defineJson, 'utf8')) as { meta: { tracker: Record<string, unknown> } }).meta.tracker;
		assert.deepEqual(tracker['epicStatus'], (result as { epicStatus: unknown }).epicStatus);
		assert.deepEqual(Object.keys(tracker['storyStatus'] as object), ['s1']);

		// the call still needs a repository, and an epicHash that is given must not be empty
		assert.deepEqual(await handleTrackerSync({ epicHash: HASH }), { error: 'tracker.sync: `repoPath` is required' });
		assert.deepEqual(await handleTrackerSync({ repoPath: repo, epicHash: '' }), { error: 'tracker.sync: `epicHash` must be a non-empty string when given' });
	} finally {
		installExecStandIn();
		if (prior === undefined) delete process.env['INSRC_GITHUB_CONFIG']; else process.env['INSRC_GITHUB_CONFIG'] = prior;
		rmSync(repo, { recursive: true, force: true });
	}
});

const HASH2 = 'b4c5d6e7f8091a2b';

/** A repository with two Epics, each bound to an issue and one Story issue, and a stand-in that answers every issue view. */
function twoEpicRepo(): { repo: string; views: () => number; done: () => void } {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-tracker-sync-all-'));
	const cfg = join(repo, 'github.json');
	const prior = process.env['INSRC_GITHUB_CONFIG'];
	mkdirSync(join(repo, '.insrc', 'artifacts'), { recursive: true });
	writeFileSync(cfg, JSON.stringify({ repos: { [repo]: { type: 'github', owner: 'o', repo: 'r' } } }));
	process.env['INSRC_GITHUB_CONFIG'] = cfg;
	for (const [hash, epic, story] of [[HASH, 'o/r#1', 'o/r#2'], [HASH2, 'o/r#3', 'o/r#4']] as const) {
		writeFileSync(artifactJsonPath(repo, defineArtifactId(hash)), JSON.stringify({
			meta: { workflow: 'define', runId: 'd-' + hash, repoPath: repo, epicHash: hash, epicSlug: 'e-' + hash, createdAt: CREATED, epicCreatedAt: CREATED, schemaVersion: 1 },
			body: { flavor: 'enhancement', problem: 'p', nonGoals: [], assumptions: [], constraints: [], stories: [{ id: 's1', title: 't', userValue: 'v', acceptanceCriteria: [] }] },
		}));
		seedBoundUnits(repo, hash, epic, { s1: story }, CREATED);
	}
	let views = 0;
	installExecStandIn((_cmd, args) => {
		if (args[0] === 'api' && args[1] === 'user') return JSON.stringify({ login: 'me' });
		if (args[0] === 'issue' && args[1] === 'view') {
			views += 1;
			return JSON.stringify({ number: Number(args[2]), title: 't', state: 'OPEN', author: { login: 'me' }, assignees: [], labels: [{ name: 'status:in-progress' }], url: 'https://github.com/o/r/issues/' + args[2] });
		}
		return '';
	});
	return {
		repo, views: () => views,
		done: () => { installExecStandIn(); if (prior === undefined) delete process.env['INSRC_GITHUB_CONFIG']; else process.env['INSRC_GITHUB_CONFIG'] = prior; rmSync(repo, { recursive: true, force: true }); },
	};
}

test('tracker.sync without an epicHash refreshes every Epic once, a second call while one runs is skipped, and a call with an epicHash is unchanged', async () => {
	const f = twoEpicRepo();
	try {
		// a repository-wide call refreshes both Epics (an Epic and a Story issue each) and says how many
		assert.deepEqual(await handleTrackerSync({ repoPath: f.repo }), { status: 'synced', refreshed: 2 });
		assert.equal(f.views(), 4, 'each of the four bound issues was read once');

		// a second call that starts while the first is still running starts nothing
		const before = f.views();
		const [first, second] = await Promise.all([handleTrackerSync({ repoPath: f.repo }), handleTrackerSync({ repoPath: f.repo })]);
		assert.deepEqual(first, { status: 'synced', refreshed: 2 });
		assert.deepEqual(second, { status: 'skipped', reason: 'a refresh of this repository is already running' });
		assert.equal(f.views() - before, 4, 'only the first call read the issues');

		// once the first has ended, a call runs normally
		assert.deepEqual(await handleTrackerSync({ repoPath: f.repo }), { status: 'synced', refreshed: 2 });

		// a call with an epicHash is the single-Epic refresh it always was
		const one = await handleTrackerSync({ repoPath: f.repo, epicHash: HASH2 }) as { status: string; storyStatus?: Record<string, unknown> };
		assert.equal(one.status, 'synced');
		assert.deepEqual(Object.keys(one.storyStatus ?? {}), ['s1']);
	} finally { f.done(); }
});
