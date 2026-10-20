/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * A producer with no Epic anchor fails before it creates a file or an issue (s1/t9):
 * the design finalizers, tracker-auto, tracker/link, and the shared path router that
 * workflow-rpc and the synthesize phase write through.
 *
 * Run: npx tsx --test src/workflow/__tests__/anchor-missing-producers.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { MissingAnchorError } from '../artifact-ids.js';
import { finalizeArtifact } from '../orchestrator.js';
import { pathsForWorkflow, requireEpicAnchor } from '../storage.js';
import { _setAutoPushDepsForTests, autoPushEpicOnHld, autoPushStoryOnLld } from '../tracker-auto.js';
import { linkDocsToIssues } from '../tracker/link.js';
import type { PolicyReader, TeamPolicy } from '../team/types.js';
import type { IssueSpec, PortResult, TrackerPort } from '../tracker/port.js';
import type { WorkflowIntent } from '../types.js';

const HASH = 'a3f4b8c9d1e2f3a4';
const SLUG = 'tag-filtering';

function tempRepo(): { repo: string; done: () => void } {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-anchor-producers-'));
	mkdirSync(join(repo, '.insrc', 'artifacts'), { recursive: true });
	return { repo, done: () => rmSync(repo, { recursive: true, force: true }) };
}

/** A Define whose head carries a label but no creation time: nothing anchors the Epic. */
function seedTimelessDefine(repo: string): void {
	writeFileSync(join(repo, '.insrc', 'artifacts', `DEF-${HASH}.json`), JSON.stringify({
		meta: { workflow: 'define', runId: 'd1', schemaVersion: 1, epicHash: HASH, epicSlug: SLUG, repoPath: repo, approvedAt: '2026-07-17T00:00:00.000Z' },
		body: {
			flavor: 'new-capability', problem: 'x', nonGoals: [], assumptions: [], constraints: [],
			stories: [{ id: 's1', title: 'A story', userValue: 'v', acceptanceCriteria: [], dependsOn: [] }],
			openQuestions: [],
		},
		citations: [],
	}));
}

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

/** A tracker that would record any issue created. */
function spyTracker(): { port: TrackerPort; creates: IssueSpec[] } {
	const creates: IssueSpec[] = [];
	const ok: PortResult<void> = { ok: true, value: undefined };
	const port = {
		kind: 'github', capabilities: new Set(['issue-create']),
		findIssues: () => ({ ok: true, value: [] }),
		findIssue: () => ({ ok: true, value: null }),
		issueOps: {
			ensureLabel: () => true,
			create: (spec: IssueSpec) => { creates.push(spec); return { ok: true, value: { ref: 'acme/demo#1', id: 1, typed: true } }; },
			linkSubIssue: () => ok, comment: () => ok, readBody: () => ({ ok: true, value: '' }), writeBody: () => ok,
			ensureMilestone: () => undefined, attachMilestone: () => ok,
		},
	} as unknown as TrackerPort;
	return { port, creates };
}

const teamPolicy: PolicyReader = () => ({ ok: true, value: { teamMode: true } as unknown as TeamPolicy });

test('the finalizers, tracker-auto, tracker/link, workflow-rpc and synthesize each fail before any file is created when no anchor exists', async () => {
	// requireEpicAnchor itself
	const bare = tempRepo();
	try {
		assert.throws(() => requireEpicAnchor(bare.repo, HASH), MissingAnchorError);
		seedTimelessDefine(bare.repo);
		assert.throws(() => requireEpicAnchor(bare.repo, HASH), MissingAnchorError, 'a head with no time does not anchor');
	} finally { bare.done(); }

	// the design.epic finalizer: a non-retryable failure, and nothing written
	const hld = tempRepo();
	try {
		seedTimelessDefine(hld.repo);
		const before = listing(hld.repo);
		const body = {
			summary: { prose: 'One intake path.' }, frameworkSummary: 'The framework', architectureShape: 'The shape [[c1]]',
			sharedContracts: [], storyBoundaries: [{ storyId: 's1', owns: [], depends: [], internal: 's1 internals' }], nonFunctional: {},
			rolloutOverview: { phases: [{ name: 'P', includesStories: ['s1'], rationale: 'r', backwardCompat: '', featureFlag: null }], orderingRationale: 'o', riskyBits: [] },
			alternativesConsidered: [
				{ id: 'a1', name: 'chosen', oneLineSummary: 'x', approach: 'x', pros: ['x'], cons: ['x'], costEstimate: 'S' },
				{ id: 'a2', name: 'other', oneLineSummary: 'x', approach: 'x', pros: ['x'], cons: ['x'], costEstimate: 'S', reasonRejected: 'r' },
			],
			chosenAlternative: 'a1', openQuestions: [],
		};
		const intent = { workflow: 'design.epic', focus: 'HLD', repoPath: hld.repo, repoIndexedAt: null, params: { epicHash: HASH } } as unknown as WorkflowIntent;
		const result = await finalizeArtifact(intent, {}, 'wf-hld', 5, { body, citations: [{ id: 'c1', kind: 'analyze-bundle', ref: 'x' }] }, 'client');
		assert.equal(result.ok, false);
		if (!result.ok) {
			assert.equal(result.failure.ok, false);
			if (!result.failure.ok) {
				assert.equal(result.failure.retryable, false, 'a re-emit cannot invent an anchor');
				assert.match(result.failure.message, /no Epic anchor/);
			}
		}
		assert.deepEqual(listing(hld.repo), before, 'the finalizer wrote nothing');
	} finally { hld.done(); }

	// tracker-auto, team and legacy: no issue is created and no file is touched
	for (const mode of ['team', 'legacy'] as const) {
		const r = tempRepo();
		const cfgPath = join(r.repo, 'github.json');
		const prior = process.env['INSRC_GITHUB_CONFIG'];
		try {
			writeFileSync(cfgPath, JSON.stringify({ repos: { [r.repo]: { type: 'github', owner: 'acme', repo: 'demo', pushTasks: false } } }));
			process.env['INSRC_GITHUB_CONFIG'] = cfgPath;
			seedTimelessDefine(r.repo);
			const meta = { workflow: 'design.epic', epicHash: HASH, epicSlug: SLUG, repoPath: r.repo, storyId: 's1', createdAt: '2026-07-17T00:00:00.000Z' };
			const hldJson = join(r.repo, '.insrc', 'artifacts', `HLD-${HASH}.json`);
			const lldJson = join(r.repo, '.insrc', 'artifacts', `LLD-${HASH}-s1.json`);
			writeFileSync(hldJson, JSON.stringify({ meta, body: {}, citations: [] }));
			writeFileSync(lldJson, JSON.stringify({ meta, body: {}, citations: [] }));
			const spy = spyTracker();
			_setAutoPushDepsForTests(mode === 'team'
				? { policy: teamPolicy, port: spy.port }
				: { policy: () => ({ ok: true, value: 'none' }) as ReturnType<PolicyReader> });
			const before = listing(r.repo);
			const hldBefore = readFileSync(hldJson, 'utf8');
			const epic = autoPushEpicOnHld(hldJson);
			const story = autoPushStoryOnLld(lldJson);
			assert.equal(epic.status, 'failed', `${mode} epic push`);
			assert.match((epic as { reason?: string }).reason ?? '', /no Epic anchor/, mode);
			assert.equal(story.status, 'failed', `${mode} story push`);
			assert.equal(spy.creates.length, 0, `${mode}: no issue was created`);
			assert.deepEqual(listing(r.repo), before, `${mode}: no file was created`);
			assert.equal(readFileSync(hldJson, 'utf8'), hldBefore, `${mode}: the HLD record is untouched`);
		} finally {
			_setAutoPushDepsForTests();
			if (prior === undefined) delete process.env['INSRC_GITHUB_CONFIG']; else process.env['INSRC_GITHUB_CONFIG'] = prior;
			r.done();
		}
	}

	// tracker/link: no doc is touched
	const link = tempRepo();
	try {
		seedTimelessDefine(link.repo);
		const before = listing(link.repo);
		assert.throws(() => linkDocsToIssues(link.repo, HASH, SLUG, { epicRef: 'acme/demo#1', storyRefs: { s1: 'acme/demo#2' } }), MissingAnchorError);
		assert.deepEqual(listing(link.repo), before);
	} finally { link.done(); }

	// workflow-rpc and the synthesize phase both place their draft through pathsForWorkflow with the stamp
	// the finalizer wrote; without it, nothing is placed
	for (const workflow of ['define', 'design.epic', 'design.story', 'plan', 'brainstorm', 'issue'] as const) {
		assert.throws(
			() => pathsForWorkflow({
				workflow, repoPath: '/repo', epicKey: HASH, runId: 'r1', epicCreatedAt: undefined,
				epicHash: HASH, epicSlug: SLUG, specHash: HASH, issueHash: HASH, storyId: 's1', storyIdParam: 's1',
			}),
			MissingAnchorError,
			workflow,
		);
	}
	// a workflow that does not place a dated folder needs none
	assert.doesNotThrow(() => pathsForWorkflow({ workflow: 'stub', repoPath: '/repo', epicKey: HASH, runId: 'r1' }));
	assert.doesNotThrow(() => pathsForWorkflow({ workflow: 'tracker.push', repoPath: '/repo', epicKey: HASH, runId: 'r1', epicHash: HASH }));

	// and no listed producer falls back to the clock or to an artifact's own createdAt for the folder date
	for (const file of [
		'src/workflow/orchestrator.ts', 'src/workflow/tracker-auto.ts', 'src/workflow/tracker/link.ts',
		'src/daemon/workflow-rpc.ts', 'src/daemon/steps/workflow-step/phases/synthesize.ts', 'src/cli/services/workflow.ts',
	]) {
		const text = readFileSync(join(process.cwd(), file), 'utf8');
		assert.ok(!/resolveEpicAnchor\([^)]*\)\s*\?\?/.test(text), `${file}: an anchor lookup is not defaulted`);
		assert.ok(!/epicCreatedAt\s*\?\?\s*\w+\.?createdAt/.test(text), `${file}: the stamp is not defaulted to a record's own time`);
		assert.ok(!/createdAtISO:\s*[\w.]*epicCreatedAt\s*\?\?/.test(text), `${file}: no folder date falls back`);
	}
});
