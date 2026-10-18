/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * A re-draft replaces the artifact file, but the tracker refs it carried survive
 * (writeArtifact carries the whole prior meta.tracker block), so tracker sync, the
 * chain report and the Task approval still find the Epic and Story issues.
 *
 * Run: npx tsx --test src/workflow/__tests__/redraft-preserves-tracker.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildChainReport } from '../chain.js';
import { artifactJsonPath, defineArtifactId, lldArtifactId, planArtifactId, writeArtifact } from '../storage.js';
import { _setAutoPushDepsForTests, autoPushTasksOnPlan } from '../tracker-auto.js';
import { _setTrackerExecForTests, type TrackerExec } from '../tracker/github.js';
import { syncTracker } from '../tracker/sync.js';

const HASH = 'a3f4b8c9d1e2f3a4';
const SLUG = 'tag-filtering';
const CREATED = '2026-07-17T07:42:28.275Z';

const tracker = {
	adapter: 'github', epicRef: 'acme/demo#1', storyRefs: { s1: 'acme/demo#2' }, pushedAt: '2026-10-18T00:00:00.000Z',
	units: { epic: { unit: 'epic', unitId: HASH, issue: 'acme/demo#1', createdAtRevision: 1, extrasDone: { designComment: '2026-10-18T00:00:00.000Z' } } },
};

const define = (withTracker: boolean) => ({
	meta: { workflow: 'define', runId: 'd1', repoPath: '', epicHash: HASH, epicSlug: SLUG, createdAt: CREATED, schemaVersion: 1, ...(withTracker ? { tracker } : {}) },
	body: {
		flavor: 'enhancement', problem: 'Users cannot filter todos by tag today. Only status filtering exists.', nonGoals: [], assumptions: [],
		constraints: [{ id: 'k1', text: 'Reuse the sidebar', type: 'convention', source: 'c1' }],
		stories: [{ id: 's1', title: 'Filter by tag', userValue: 'find todos faster', acceptanceCriteria: [] }], openQuestions: [],
	},
	citations: [],
});

test('a re-draft keeps epicRef and storyRefs for sync, chain report and Task approval', () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-redraft-'));
	const cfg = join(repo, 'github.json');
	const prior = process.env['INSRC_GITHUB_CONFIG'];
	try {
		mkdirSync(join(repo, '.insrc', 'artifacts'), { recursive: true });
		writeFileSync(cfg, JSON.stringify({ repos: { [repo]: { type: 'github', owner: 'acme', repo: 'demo', pushTasks: true } } }));
		process.env['INSRC_GITHUB_CONFIG'] = cfg;
		const defineJson = artifactJsonPath(repo, defineArtifactId(HASH));
		const base = { repoPath: repo, epicHash: HASH, epicSlug: SLUG, createdAt: CREATED };
		writeFileSync(defineJson, JSON.stringify({ ...define(true), meta: { ...define(true).meta, repoPath: repo } }, null, 2));
		writeFileSync(artifactJsonPath(repo, lldArtifactId(HASH, 's1')), JSON.stringify({ meta: { workflow: 'design.story', runId: 'l1', ...base, storyId: 's1', tracker: { adapter: 'github', storyRef: 'acme/demo#2' } }, body: {}, citations: [] }));
		const planJson = artifactJsonPath(repo, planArtifactId(HASH, 's1'));
		writeFileSync(planJson, JSON.stringify({
			meta: { workflow: 'plan', runId: 'p1', ...base, storyId: 's1', schemaVersion: 1 },
			body: { tasks: [{ id: 't1', title: 'Add the input', summary: 's', size: 'S', order: 1, dependsOn: [], acceptanceChecks: ['renders'], derivedFrom: [], tests: [] }] }, citations: [],
		}));

		// re-draft the Define: a fresh file with no tracker block, written as content
		const fresh = define(false);
		writeArtifact(defineJson, { ...fresh, meta: { ...fresh.meta, repoPath: repo } }, 'content');
		const after = JSON.parse(readFileSync(defineJson, 'utf8')).meta.tracker;
		assert.equal(after.epicRef, 'acme/demo#1');
		assert.deepEqual(after.storyRefs, { s1: 'acme/demo#2' });
		assert.equal(after.units.epic.issue, 'acme/demo#1');
		assert.deepEqual(Object.keys(after.units.epic.extrasDone), ['designComment'], 'the extras marks survive too');

		const calls: string[][] = [];
		let n = 10;
		const exec: TrackerExec = (cmd, args) => {
			calls.push([cmd, ...args]);
			if (cmd === 'git') return 'git@github.com:acme/demo.git\n';
			if (args[0] === 'api' && args.includes('POST') && (args.find(a => a.startsWith('repos/')) ?? '').endsWith('/issues')) { n += 1; return JSON.stringify({ number: n, id: 1000 + n }); }
			if (args[0] === 'issue' && args[1] === 'view') return args.includes('body') ? 'body' : JSON.stringify({ state: 'OPEN', labels: [] });
			return '';
		};
		_setTrackerExecForTests(exec);

		// tracker sync does not skip: it finds the Epic and the Story refs
		const sync = syncTracker(repo, HASH);
		assert.equal(sync.status, 'synced');
		assert.deepEqual(sync.status === 'synced' ? Object.keys(sync.storyStatus) : null, ['s1']);

		// the chain report still sees the Epic as pushed
		const chain = buildChainReport(repo, HASH);
		assert.equal(chain.tracker.pushed, true);
		assert.equal(chain.tracker.epicRef, 'acme/demo#1');

		// the Task approval still finds the Story ref (legacy mode) and creates the Task issue under it
		_setAutoPushDepsForTests({ policy: () => ({ ok: true, value: 'none' }) });
		const tasks = autoPushTasksOnPlan(planJson);
		assert.equal(tasks.status, 'created');
		assert.ok(calls.some(c => c.join(' ').includes('repos/acme/demo/issues/2/sub_issues')), 'the Task is linked under the Story issue #2');
	} finally {
		if (prior === undefined) delete process.env['INSRC_GITHUB_CONFIG']; else process.env['INSRC_GITHUB_CONFIG'] = prior;
		_setTrackerExecForTests(); _setAutoPushDepsForTests();
		rmSync(repo, { recursive: true, force: true });
	}
});
