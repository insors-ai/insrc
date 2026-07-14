/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * End-to-end tracker workflows walk.
 *
 * These tests pre-seed an approved Define artifact, then walk the
 * three-step coarse handoff for tracker.push and tracker.sync
 * end to end with hand-crafted "LLM" responses. We do NOT invoke
 * `gh` — the tests simulate the LLM's structured outputs.
 *
 * Coverage:
 *   - Push happy path: Epic's meta.tracker gets patched with refs.
 *   - Push checklist failure → refuses finalize.
 *   - Sync happy path: Epic's meta.tracker gets storyStatus /
 *     epicStatus / lastSyncedAt appended.
 *   - Sync refuses when Epic has no prior tracker refs.
 *   - Push refuses when Epic is unapproved (gated at s1 assemble).
 *
 * Run:
 *   npx tsx --test src/insrc/mcp/workflow-step/__tests__/tracker-e2e.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { defineArtifactPaths } from '../../../workflow/storage.js';

const HASH = 'a3f4b8c9d1e2f3a4';
const MISSING_HASH = '0000000000000000';

import { handleWorkflowStep } from '../handler.js';
import { registerWorkflowRunners } from '../../../workflow/index.js';
import { _clearWorkflowStateStoreForTests } from '../state-store.js';
import { approveArtifactByJsonPath } from '../../../workflow/gates.js';

interface Envelope { readonly content: readonly { readonly type: 'text'; readonly text: string }[]; readonly isError?: boolean }
function payload(env: Envelope): Record<string, unknown> {
	const first = env.content[0];
	assert.ok(first !== undefined);
	return JSON.parse(first.text) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Point the github config resolver at a temp `github.json` for the
 *  test run. Returns a disposer that restores the prior env var. */
function stubGithubConfig(repo: string, entry: unknown): () => void {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-gh-cfg-'));
	const path = join(dir, 'github.json');
	writeFileSync(path, JSON.stringify(entry, null, 2));
	const prev = process.env['INSRC_GITHUB_CONFIG'];
	process.env['INSRC_GITHUB_CONFIG'] = path;
	return () => {
		if (prev === undefined) delete process.env['INSRC_GITHUB_CONFIG'];
		else process.env['INSRC_GITHUB_CONFIG'] = prev;
		rmSync(dir, { recursive: true, force: true });
	};
}

/** Seed an approved Define artifact. When `withGithubConfig` is set,
 *  also points the resolver at a temp `github.json` with an owner+repo
 *  so the tracker workflows resolve to a github target. */
function seedApprovedEpic(repo: string, epicHash: string, opts: { withGithubConfig: boolean }): (() => void) | null {
	let disposer: (() => void) | null = null;
	if (opts.withGithubConfig) {
		disposer = stubGithubConfig(repo, { default: { type: 'github', owner: 'myorg', repo: 'myrepo' } });
	}
	const paths = defineArtifactPaths(repo, epicHash);
	mkdirSync(dirname(paths.json), { recursive: true });
	const path = paths.json;
	writeFileSync(path, JSON.stringify({
		meta: { workflow: 'define', runId: 'def-1', schemaVersion: 1, epicHash, epicSlug: 'tag-filtering' },
		body: {
			flavor: 'enhancement',
			problem: 'Users cannot filter todos by tag.',
			nonGoals: [], assumptions: [{ text: 'has tags', confidence: 'high', source: 'c1' }],
			constraints: [{ id: 'k1', text: 'sidebar reuse', type: 'convention', source: 'c1' }],
			stories: [
				{ id: 's1', title: 'Filter by tag', userValue: 'v', acceptanceCriteria: [{ id: 'ac1', given: 'x', when: 'y', then: 'z', operationalizes: ['k1'] }] },
				{ id: 's2', title: 'Clear filter',  userValue: 'v', acceptanceCriteria: [{ id: 'ac1', given: 'x', when: 'y', then: 'z', operationalizes: ['k1'] }] },
			],
			openQuestions: [],
		},
		citations: [{ id: 'c1', kind: 'analyze-bundle', ref: 'todos module' }],
	}, null, 2));
	approveArtifactByJsonPath(path);
	return disposer;
}

const PUSH_PLAN = {
	workflow: 'tracker.push',
	steps: [
		{ id: 's1', runner: 'context.assemble', params: {} },
		{ id: 's2', runner: 'execute',          params: {} },
		{ id: 's3', runner: 'checklist.verify', params: {} },
	],
};
const SYNC_PLAN = {
	workflow: 'tracker.sync',
	steps: [
		{ id: 's1', runner: 'context.assemble', params: {} },
		{ id: 's2', runner: 'execute',          params: {} },
		{ id: 's3', runner: 'checklist.verify', params: {} },
	],
};

const PUSH_EXEC_OK = {
	epicRef: 'myorg/myrepo#100',
	storyRefs: { s1: 'myorg/myrepo#101', s2: 'myorg/myrepo#102' },
	labelsCreated: ['insrc:epic', 'insrc:story', 'epic:tag-filtering'],
};
const PUSH_VERIFY_OK = {
	items: [
		{ itemId: 'epicLabelled', verdict: 'passed' },
		{ itemId: 'storyLabelled', verdict: 'passed' },
		{ itemId: 'taskList', verdict: 'passed' },
		{ itemId: 'backRef', verdict: 'passed' },
	],
	failedCount: 0,
};
const PUSH_VERIFY_FAIL = {
	items: [
		{ itemId: 'epicLabelled', verdict: 'passed' },
		{ itemId: 'storyLabelled', verdict: 'failed', notes: 'story #101 missing insrc:story label' },
	],
	failedCount: 1,
};

const SYNC_EXEC_OK = {
	storyStatus: { s1: 'in-progress', s2: 'open' },
	epicStatus:  'in-progress',
	syncedAt:    '2026-07-12T02:00:00Z',
};
const SYNC_VERIFY_OK = {
	items: [
		{ itemId: 'storyMapping', verdict: 'passed' },
		{ itemId: 'epicMapping',  verdict: 'passed' },
		{ itemId: 'freshness',    verdict: 'passed' },
		{ itemId: 'storyKeys',    verdict: 'passed' },
	],
	failedCount: 0,
};

async function walk(
	repo: string,
	slug: string,
	workflow: 'tracker.push' | 'tracker.sync',
	execResponse: Record<string, unknown>,
	verifyResponse: Record<string, unknown>,
): Promise<{ done: Record<string, unknown> }> {
	const startOut = payload(await handleWorkflowStep({
		phase: 'start', workflow, focus: `${workflow} for ${slug}`, repo,
		params: { epicHash: slug },
	}));
	assert.equal(startOut['next'], 'emit_plan', JSON.stringify(startOut));
	let state = startOut['state'] as string;

	const planOut = payload(await handleWorkflowStep({
		phase: 'plan', plan: workflow === 'tracker.push' ? PUSH_PLAN : SYNC_PLAN, state,
	}));
	// s1 is deterministic — executor may either emit_step (if the
	// deterministic runner is llm-pause) OR emit_step for s2 (because
	// s1's deterministic output is already stored and executor moves
	// to s2 which is llm-pause). Our runners: s1 is deterministic
	// output-returning, s2 is llm-pause. So plan should return
	// emit_step for s2.
	assert.equal(planOut['next'], 'emit_step');
	assert.equal(planOut['stepId'], 's2');
	state = planOut['state'] as string;

	// s2 execute
	const s2 = payload(await handleWorkflowStep({
		phase: 'step', stepId: 's2', response: execResponse, state,
	}));
	assert.equal(s2['next'], 'emit_step');
	assert.equal(s2['stepId'], 's3');
	state = s2['state'] as string;

	// s3 verify
	const s3 = payload(await handleWorkflowStep({
		phase: 'step', stepId: 's3', response: verifyResponse, state,
	}));
	assert.equal(s3['next'], 'emit_synthesize');
	state = s3['state'] as string;

	// synthesize (LLM would just pass through refs + checklist)
	const done = payload(await handleWorkflowStep({
		phase: 'synthesize',
		artifact: { refs: execResponse, checklist: verifyResponse },
		state,
	}));
	return { done };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('tracker.push: happy path patches Epic meta.tracker with refs', async () => {
	_clearWorkflowStateStoreForTests();
	registerWorkflowRunners();
	const repo = mkdtempSync(join(tmpdir(), 'insrc-tracker-e2e-'));
	const slug = HASH;
	let disposeCfg: (() => void) | null = null;
	try {
		disposeCfg = seedApprovedEpic(repo, slug, { withGithubConfig: true });
		const { done } = await walk(repo, slug, 'tracker.push', PUSH_EXEC_OK, PUSH_VERIFY_OK);
		assert.equal(done['next'], 'done', JSON.stringify(done));

		const epic = JSON.parse(readFileSync(defineArtifactPaths(repo, slug).json, 'utf8'));
		assert.equal(epic.meta.tracker.adapter, 'github');
		assert.equal(epic.meta.tracker.epicRef, 'myorg/myrepo#100');
		assert.deepEqual(epic.meta.tracker.storyRefs, { s1: 'myorg/myrepo#101', s2: 'myorg/myrepo#102' });
		assert.deepEqual(epic.meta.tracker.labelsCreated, ['insrc:epic', 'insrc:story', 'epic:tag-filtering']);

		// The tracker run report lives outside the repo.
		const outPath = done['path'] as string;
		assert.ok(outPath.includes('workflow-runs'), outPath);
		assert.ok(existsSync(outPath));
	} finally {
		disposeCfg?.();
		rmSync(repo, { recursive: true, force: true });
	}
});

test('tracker.push: checklist failure refuses synthesize + leaves meta untouched', async () => {
	_clearWorkflowStateStoreForTests();
	registerWorkflowRunners();
	const repo = mkdtempSync(join(tmpdir(), 'insrc-tracker-e2e-'));
	const slug = HASH;
	let disposeCfg: (() => void) | null = null;
	try {
		disposeCfg = seedApprovedEpic(repo, slug, { withGithubConfig: true });
		const { done } = await walk(repo, slug, 'tracker.push', PUSH_EXEC_OK, PUSH_VERIFY_FAIL);
		assert.equal(done['next'], 'error', JSON.stringify(done));
		assert.match((done['error'] as { message: string }).message, /storyLabelled/);

		const epic = JSON.parse(readFileSync(defineArtifactPaths(repo, slug).json, 'utf8'));
		assert.equal(epic.meta.tracker, undefined);
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test('tracker.sync: happy path merges status + lastSyncedAt into meta.tracker', async () => {
	_clearWorkflowStateStoreForTests();
	registerWorkflowRunners();
	const repo = mkdtempSync(join(tmpdir(), 'insrc-tracker-e2e-'));
	const slug = HASH;
	let disposeCfg: (() => void) | null = null;
	try {
		disposeCfg = seedApprovedEpic(repo, slug, { withGithubConfig: true });
		// First push so sync has refs to work off of.
		await walk(repo, slug, 'tracker.push', PUSH_EXEC_OK, PUSH_VERIFY_OK);
		// Then sync.
		const { done } = await walk(repo, slug, 'tracker.sync', SYNC_EXEC_OK, SYNC_VERIFY_OK);
		assert.equal(done['next'], 'done', JSON.stringify(done));

		const epic = JSON.parse(readFileSync(defineArtifactPaths(repo, slug).json, 'utf8'));
		assert.deepEqual(epic.meta.tracker.storyStatus, { s1: 'in-progress', s2: 'open' });
		assert.equal(epic.meta.tracker.epicStatus, 'in-progress');
		assert.equal(epic.meta.tracker.lastSyncedAt, '2026-07-12T02:00:00Z');
		// Refs from push should still be there.
		assert.equal(epic.meta.tracker.epicRef, 'myorg/myrepo#100');
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test('tracker.sync: refuses when Epic has no prior tracker refs', async () => {
	_clearWorkflowStateStoreForTests();
	registerWorkflowRunners();
	const repo = mkdtempSync(join(tmpdir(), 'insrc-tracker-e2e-'));
	const slug = HASH;
	let disposeCfg: (() => void) | null = null;
	try {
		disposeCfg = seedApprovedEpic(repo, slug, { withGithubConfig: true });
		// Skip push. sync's s1 should throw.
		const startOut = payload(await handleWorkflowStep({
			phase: 'start', workflow: 'tracker.sync', focus: 'sync', repo,
			params: { epicHash: slug },
		}));
		const state = startOut['state'] as string;
		const planOut = payload(await handleWorkflowStep({
			phase: 'plan', plan: SYNC_PLAN, state,
		}));
		assert.equal(planOut['next'], 'error');
		assert.match((planOut['error'] as { message: string }).message, /no tracker refs/);
	} finally {
		disposeCfg?.();
		rmSync(repo, { recursive: true, force: true });
	}
});

test('tracker.push: refuses without epicHash param', async () => {
	_clearWorkflowStateStoreForTests();
	registerWorkflowRunners();
	const repo = mkdtempSync(join(tmpdir(), 'insrc-tracker-e2e-'));
	try {
		const errOut = payload(await handleWorkflowStep({
			phase: 'start', workflow: 'tracker.push', focus: 'x', repo,
		}));
		assert.equal(errOut['next'], 'error');
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test('tracker.push: refuses when Epic is unapproved', async () => {
	_clearWorkflowStateStoreForTests();
	registerWorkflowRunners();
	const repo = mkdtempSync(join(tmpdir(), 'insrc-tracker-e2e-'));
	const slug = HASH;
	try {
		// Seed but do NOT approve. The approval check fires before
		// the github-config check, so we don't need to stub either.
		const _def=defineArtifactPaths(repo, slug); mkdirSync(dirname(_def.json), { recursive: true });
		writeFileSync(_def.json, JSON.stringify({
			meta: { workflow: 'define', runId: 'def-1', schemaVersion: 1 },
			body: {
				flavor: 'enhancement', problem: 'x', nonGoals: [], assumptions: [], constraints: [],
				stories: [{ id: 's1', title: 't', userValue: 'v', acceptanceCriteria: [] }],
				openQuestions: [],
			},
			citations: [],
		}, null, 2));

		const startOut = payload(await handleWorkflowStep({
			phase: 'start', workflow: 'tracker.push', focus: 'push', repo,
			params: { epicHash: slug },
		}));
		const state = startOut['state'] as string;
		const planOut = payload(await handleWorkflowStep({
			phase: 'plan', plan: PUSH_PLAN, state,
		}));
		assert.equal(planOut['next'], 'error');
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});
