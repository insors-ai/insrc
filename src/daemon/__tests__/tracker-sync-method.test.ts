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

		// the call still needs both parameters
		assert.deepEqual(await handleTrackerSync({ epicHash: HASH }), { error: 'tracker.sync: `repoPath` is required' });
		assert.deepEqual(await handleTrackerSync({ repoPath: repo }), { error: 'tracker.sync: `epicHash` is required' });
	} finally {
		installExecStandIn();
		if (prior === undefined) delete process.env['INSRC_GITHUB_CONFIG']; else process.env['INSRC_GITHUB_CONFIG'] = prior;
		rmSync(repo, { recursive: true, force: true });
	}
});
