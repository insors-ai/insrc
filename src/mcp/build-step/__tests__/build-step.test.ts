/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Tests for the lean `insrc_build_step` surface (stage 2):
 *   - implement returns a rendered prompt carrying the Task's acceptance
 *     checks + issue ref, on an approved+fresh plan.
 *   - implement returns { next: 'refused' } on an unapproved plan.
 *   - validate parses a verdict from a stubbed provider (fake CliProvider).
 *
 * Run: npx tsx --test src/mcp/build-step/__tests__/build-step.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

import { handleBuildStep } from '../handler.js';
import { _setBuildValidateCheckRunnerForTests, _setBuildValidateProviderForTests } from '../phases/validate.js';
import type { ValidationCheckPlan, ValidationCheckResults } from '../validation-checks.js';
import { ReviewSessionTimeoutError } from '../../../agent/providers/cli-provider.js';
import { approveArtifactByJsonPath, jsonPathForMd } from '../../../workflow/gates.js';
import { ARTIFACTS_DIR, buildArtifactPaths, lldArtifactId, planArtifactId } from '../../../workflow/storage.js';
import { ensureBuildRecordOnCompletion } from '../../../workflow/runners/build/completion-record.js';
import { resolveStoryRangeBase } from '../../../workflow/runners/build/range-base.js';
import { stampOtherPartyReview } from '../../../workflow/__tests__/helpers/other-party-review.js';

/** The judge's structured verdict, with the fields a test does not care about filled in. */
function judgeVerdict(over: Record<string, unknown>): Record<string, unknown> {
	return { taskId: 't1', passed: true, checks: [], scopeRespected: true, reason: 'ok', ...over };
}

/** Both daemon checks passing, so a verdict follows the judge unless a test says otherwise. */
const PASSING_CHECKS: ValidationCheckResults = {
	typecheck: { ok: true, command: 'npx tsc --noEmit', exitCode: 0, timedOut: false, durationMs: 1, outputTail: '' },
	tests:     { ok: true, command: 'npx tsx --test --test-force-exit x.test.ts', exitCode: 0, timedOut: false, durationMs: 1, outputTail: '' },
};
// No test in this file spawns a real typecheck or test runner.
_setBuildValidateCheckRunnerForTests(async () => PASSING_CHECKS);


const HASH = 'a3f4b8c9d1e2f3a4';
const CREATED_AT = '2026-07-18T00:00:00.000Z';

// A SECOND epic (distinct hash) for the multi-epic scoped-resolve regression:
// with two epics present, an unscoped `s1/t1` is ambiguous → the resolver
// refuses it, and only an `epicHash` scope resolves it.
const HASH2 = 'b7c8d9e0f1a2b3c4';
const CREATED_AT2 = '2026-08-21T00:00:00.000Z';

function artifactsDir(repo: string): string {
	const d = join(repo, ARTIFACTS_DIR);
	mkdirSync(d, { recursive: true });
	return d;
}

function seedDef(repo: string): void {
	writeFileSync(join(artifactsDir(repo), `DEF-${HASH}.json`), JSON.stringify({
		meta: { workflow: 'define', epicHash: HASH, epicSlug: 'tag-filtering', createdAt: CREATED_AT, approvedAt: CREATED_AT },
		body: { problem: 'p', stories: [{ id: 's1', title: 'Story one' }] },
		citations: [],
	}, null, 2));
}

function seedLld(repo: string, openQuestions: readonly string[] = []): void {
	writeFileSync(join(artifactsDir(repo), `${lldArtifactId(HASH, 's1')}.json`), JSON.stringify({
		meta: {
			workflow: 'design.story', runId: 'lld-run-1', schemaVersion: 1,
			epicHash: HASH, epicSlug: 'tag-filtering', storyId: 's1', createdAt: CREATED_AT,
			hldBaseRunId: 'hld-run-1', hldEffectiveHash: 'basis-hash-xyz', hldAmendmentsApplied: [],
			approvedAt: CREATED_AT,
			tracker: { storyRef: 'acme/widgets#10' },
		},
		body: { openQuestions }, citations: [],
	}, null, 2));
}

function seedPlan(repo: string, approved: boolean): string {
	const json = join(artifactsDir(repo), `${planArtifactId(HASH, 's1')}.json`);
	writeFileSync(json, JSON.stringify({
		meta: {
			workflow: 'plan', runId: 'plan-run-1', schemaVersion: 1,
			epicHash: HASH, epicSlug: 'tag-filtering', storyId: 's1', createdAt: CREATED_AT,
			lldRunId: 'lld-run-1', lldEffectiveHash: 'basis-hash-xyz',
			tracker: { taskRefs: { t1: 'acme/widgets#42' } },
		},
		body: {
			tasks: [{
				id: 't1', title: 'Wire the filter', summary: 'Add the tag filter to the query path.',
				size: 'M', order: 1, dependsOn: [], acceptanceChecks: ['Filter narrows results by tag'],
				derivedFrom: ['c1'], tests: [{ level: 'unit', name: 'unit: filter narrows results' }],
			}],
		},
		citations: [{ id: 'c1', kind: 'prior-artifact', ref: 'LLD' }],
	}, null, 2));
	if (approved) approveArtifactByJsonPath(json);
	return json;
}

/** Seed a SECOND epic (DEF+LLD+approved PLAN) also carrying s1/t1, so the
 *  artifacts dir is multi-epic. */
function seedSecondEpic(repo: string): void {
	const dir = artifactsDir(repo);
	writeFileSync(join(dir, `DEF-${HASH2}.json`), JSON.stringify({
		meta: { workflow: 'define', epicHash: HASH2, epicSlug: 'other-epic', createdAt: CREATED_AT2, approvedAt: CREATED_AT2 },
		body: { problem: 'p', stories: [{ id: 's1', title: 'Story one' }] },
		citations: [],
	}, null, 2));
	writeFileSync(join(dir, `${lldArtifactId(HASH2, 's1')}.json`), JSON.stringify({
		meta: {
			workflow: 'design.story', runId: 'lld-run-2', schemaVersion: 1,
			epicHash: HASH2, epicSlug: 'other-epic', storyId: 's1', createdAt: CREATED_AT2,
			hldBaseRunId: 'hld-run-2', hldEffectiveHash: 'basis-hash-222', hldAmendmentsApplied: [],
			approvedAt: CREATED_AT2, tracker: { storyRef: 'acme/widgets#20' },
		},
		body: { openQuestions: [] }, citations: [],
	}, null, 2));
	const planJson = join(dir, `${planArtifactId(HASH2, 's1')}.json`);
	writeFileSync(planJson, JSON.stringify({
		meta: {
			workflow: 'plan', runId: 'plan-run-2', schemaVersion: 1,
			epicHash: HASH2, epicSlug: 'other-epic', storyId: 's1', createdAt: CREATED_AT2,
			lldRunId: 'lld-run-2', lldEffectiveHash: 'basis-hash-222',
			tracker: { taskRefs: { t1: 'acme/widgets#52' } },
		},
		body: {
			tasks: [{
				id: 't1', title: 'Other task', summary: 'A task in the second epic.',
				size: 'M', order: 1, dependsOn: [], acceptanceChecks: ['Other check'],
				derivedFrom: ['c1'], tests: [{ level: 'unit', name: 'unit: other' }],
			}],
		},
		citations: [{ id: 'c1', kind: 'prior-artifact', ref: 'LLD' }],
	}, null, 2));
	approveArtifactByJsonPath(planJson);
}

function mkRepo(): string {
	return mkdtempSync(join(tmpdir(), 'insrc-build-step-'));
}

/** A git repo with one committed baseline file and one uncommitted modification,
 *  so `collectBuildChangeLog` (git-diff based) resolves a NON-empty changed set. */
function mkGitRepoWithChange(): string {
	const repo = mkRepo();
	const git = (...args: string[]): void => { execFileSync('git', args, { cwd: repo, stdio: 'ignore' }); };
	git('init', '-q');
	git('config', 'user.email', 'test@insrc.local');
	git('config', 'user.name', 'insrc-test');
	writeFileSync(join(repo, 'touched.ts'), 'export const v = 1;\n');
	git('add', '.');
	git('commit', '-qm', 'baseline');
	writeFileSync(join(repo, 'touched.ts'), 'export const v = 2;\n');   // uncommitted change
	return repo;
}

/** Parse the single text content block back into the BuildStepOutput. */
function outputOf(env: { content: { type: 'text'; text: string }[] }): Record<string, unknown> {
	return JSON.parse(env.content[0]!.text) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// implement — approved plan → rendered prompt
// ---------------------------------------------------------------------------

test('implement: approved+fresh plan returns a prompt carrying acceptance checks + issue ref', async () => {
	const repo = mkRepo();
	try {
		seedDef(repo);
		seedLld(repo);
		seedPlan(repo, true);
		const env = await handleBuildStep({ phase: 'implement', target: 's1/t1', repo });
		const out = outputOf(env);
		assert.equal(out['next'], 'implement');
		assert.equal(out['taskId'], 't1');
		assert.equal(out['issueRef'], 'acme/widgets#42');
		const prompt = out['prompt'] as string;
		assert.match(prompt, /Filter narrows results by tag/);     // acceptance check
		assert.match(prompt, /acme\/widgets#42/);                  // task issue ref
		assert.match(prompt, /acme\/widgets#10/);                  // story issue ref
		assert.match(prompt, /Wire the filter/);                   // task title
		assert.match(prompt, /unit: filter narrows results/);      // test
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('implement: does NOT gate on the LLD open questions (resolved at stage-start now)', async () => {
	const repo = mkRepo();
	try {
		seedDef(repo);
		// LLD carries an unresolved open question AND a recorded decision.
		writeFileSync(join(artifactsDir(repo), `${lldArtifactId(HASH, 's1')}.json`), JSON.stringify({
			meta: {
				workflow: 'design.story', runId: 'lld-run-1', schemaVersion: 1,
				epicHash: HASH, epicSlug: 'tag-filtering', storyId: 's1',
				hldBaseRunId: 'hld-run-1', hldEffectiveHash: 'basis-hash-xyz', hldAmendmentsApplied: [],
				approvedAt: CREATED_AT,
				questionResolutions: {
					sc2: { question: 'Case sensitivity?', status: 'resolved', choice: 'Case-insensitive match', resolvedAt: CREATED_AT },
				},
			},
			body: { openQuestions: ['[sc9 / missed] Still-open question that must NOT block build?'] },
			citations: [],
		}, null, 2));
		seedPlan(repo, true);
		const out = outputOf(await handleBuildStep({ phase: 'implement', target: 's1/t1', repo }));
		assert.equal(out['next'], 'implement');   // NOT resolve_questions
		const prompt = out['prompt'] as string;
		assert.match(prompt, /Resolved design decisions/);
		assert.match(prompt, /Case-insensitive match/);   // decision reaches the implementer
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------------------
// implement — unapproved plan → refused
// ---------------------------------------------------------------------------

test('implement: unapproved plan returns next=refused with reason plan-unapproved', async () => {
	const repo = mkRepo();
	try {
		seedDef(repo);
		seedLld(repo);
		seedPlan(repo, false);   // NOT approved
		const env = await handleBuildStep({ phase: 'implement', target: 's1/t1', repo });
		const out = outputOf(env);
		assert.equal(out['next'], 'refused');
		const refusal = out['refusal'] as { reason: string; treeUntouched: boolean };
		assert.equal(refusal.reason, 'plan-unapproved');
		assert.equal(refusal.treeUntouched, true);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('implement: a non-task target (a story) is a resolution error', async () => {
	const repo = mkRepo();
	try {
		seedDef(repo);
		seedLld(repo);
		seedPlan(repo, true);
		const env = await handleBuildStep({ phase: 'implement', target: 's1', repo });
		const out = outputOf(env);
		assert.equal(out['next'], 'error');
		assert.match((out['error'] as { message: string }).message, /not a task/);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------------------
// validate — verdict parsed from a stubbed provider
// ---------------------------------------------------------------------------

test('validate: returns the judge verdict from a stubbed CliProvider review session', async () => {
	const repo = mkRepo();
	try {
		seedDef(repo);
		seedLld(repo);
		seedPlan(repo, true);
		_setBuildValidateProviderForTests({
			async runReviewSession<T>() {
				return judgeVerdict({ taskId: 't1', passed: true, scopeRespected: true, reason: 'all green' }) as T;
			},
		});
		const env = await handleBuildStep({ phase: 'validate', target: 's1/t1', repo });
		const out = outputOf(env);
		assert.equal(out['next'], 'done');
		assert.equal(out['passed'], true);
		assert.deepEqual((out['verdict'] as { taskId: string }).taskId, 't1');
	} finally {
		_setBuildValidateProviderForTests(undefined);
		rmSync(repo, { recursive: true, force: true });
	}
});

test('validate: a failing judge verdict gives passed:false', async () => {
	const repo = mkRepo();
	try {
		seedDef(repo);
		seedLld(repo);
		seedPlan(repo, true);
		_setBuildValidateProviderForTests({
			async runReviewSession<T>() { return judgeVerdict({ taskId: 't1', passed: false, reason: 'acceptance check 2 not met' }) as T; },
		});
		const out = outputOf(await handleBuildStep({ phase: 'validate', target: 's1/t1', repo }));
		assert.equal(out['next'], 'done');
		assert.equal(out['passed'], false);
	} finally {
		_setBuildValidateProviderForTests(undefined);
		rmSync(repo, { recursive: true, force: true });
	}
});

// ---------------------------------------------------------------------------
// validate — persists the plan-driven BUILD ledger record (S001)
// ---------------------------------------------------------------------------

test('validate: persists a plan-driven BUILD ledger record (standalone key ABSENT since t9) recording the task + passed', async () => {
	const repo = mkRepo();
	try {
		seedDef(repo); seedLld(repo); seedPlan(repo, true);
		_setBuildValidateProviderForTests({
			async runReviewSession<T>() { return judgeVerdict({ taskId: 't1', passed: true }) as T; },
		});
		const out = outputOf(await handleBuildStep({ phase: 'validate', target: 's1/t1', repo }));
		assert.equal(out['next'], 'done');
		assert.equal(out['passed'], true);

		const { json } = buildArtifactPaths(repo, HASH, 's1', CREATED_AT, 'epic', 'tag-filtering');
		assert.ok(existsSync(json), 'a BUILD-<epicHash>-<storyId>.json record was persisted');
		const rec = JSON.parse(readFileSync(json, 'utf8')) as { meta: Record<string, unknown>; body: Record<string, unknown> };
		// UPDATED at t9: the shared persist no longer asserts this flag. On a
		// plan-driven first write the key is simply ABSENT, which every reader treats
		// as false (they all test `=== true`).
		assert.ok(!('standalone' in rec.meta), 'the shared persist writes no standalone key');
		assert.notEqual(rec.meta['standalone'], true, 'and it is certainly not standalone');
		assert.equal(rec.meta['workflow'], 'build');
		assert.equal(rec.meta['epicHash'], HASH);
		assert.equal(rec.meta['storyId'], 's1');
		assert.deepEqual(rec.body['tasks'], [{ id: 't1', passed: true }]);

		// T3 (LLD-1716f77ba9ba017b-S001): the validate write is the controller's,
		// and a later write that says nothing about the author keeps it — here the
		// approval-time writer, which stamps no author of its own.
		assert.equal(rec.meta['authoredBy'], 'controller');
		await ensureBuildRecordOnCompletion(repo, { epicHash: HASH, storyId: 's1' }, async () => ['a.ts']);
		const after = JSON.parse(readFileSync(json, 'utf8')) as { meta: Record<string, unknown>; body: Record<string, unknown> };
		assert.equal(after.meta['authoredBy'], 'controller', 'kept across a write that omits it');
		assert.equal((after.body['changeLog'] as unknown[]).length, 1, 'and that later write did happen');
	} finally {
		_setBuildValidateProviderForTests(undefined);
		rmSync(repo, { recursive: true, force: true });
	}
});

test('validate: a BUILD-record persist failure is swallowed — the verdict is still returned', async () => {
	const repo = mkRepo();
	try {
		seedDef(repo); seedLld(repo); seedPlan(repo, true);
		// Force writeAtomic to throw by making the record json path a DIRECTORY.
		const { json } = buildArtifactPaths(repo, HASH, 's1', CREATED_AT, 'epic', 'tag-filtering');
		mkdirSync(json, { recursive: true });
		_setBuildValidateProviderForTests({
			async runReviewSession<T>() { return judgeVerdict({ taskId: 't1', passed: true }) as T; },
		});
		const out = outputOf(await handleBuildStep({ phase: 'validate', target: 's1/t1', repo }));
		assert.equal(out['next'], 'done', 'persistence failure never converts a real verdict into an error');
		assert.equal(out['passed'], true);
	} finally {
		_setBuildValidateProviderForTests(undefined);
		rmSync(repo, { recursive: true, force: true });
	}
});

// ---------------------------------------------------------------------------
// validate — STANDALONE (no-plan) branch (S002): resolves the Story identity
// from the standalone context, runs the SAME verdict + persist path, and lands
// a BUILD record for the completion gate — WITHOUT a plan.
// ---------------------------------------------------------------------------

test('validate[standalone]: no plan → resolves identity from context, persists a BUILD record (standalone key ABSENT since t9, story task)', async () => {
	const repo = mkRepo();
	try {
		// DEF (folder anchor) + LLD (the standalone Small spec) — but NO plan.
		seedDef(repo); seedLld(repo);
		_setBuildValidateProviderForTests({
			async runReviewSession<T>() { return judgeVerdict({ taskId: 's1', passed: true }) as T; },
		});
		const env = await handleBuildStep({
			phase: 'validate', target: 's1', repo,
			standalone: { standalone: true, epicHash: HASH, storyId: 's1', sizeClass: 'small' },
		});
		const out = outputOf(env);
		assert.equal(out['next'], 'done');
		assert.equal(out['passed'], true);
		assert.equal((out['verdict'] as { taskId: string }).taskId, 's1');

		const { json } = buildArtifactPaths(repo, HASH, 's1', CREATED_AT, 'epic', 'tag-filtering');
		assert.ok(existsSync(json), 'a standalone build persisted a BUILD-<epicHash>-<storyId>.json record');
		const rec = JSON.parse(readFileSync(json, 'utf8')) as { meta: Record<string, unknown>; body: Record<string, unknown> };
		// UPDATED at t9 — the assertion t1's note predicted would break, and the
		// whole point of this task. The shared persist used to stamp
		// `standalone: false` here, re-labelling a standalone record. It now writes no
		// such key. (This fixture seeds no PRIOR standalone record, so the merge has
		// nothing to carry forward; the implement-then-validate case where a prior DOES
		// exist is the inverted characterisation B below.)
		assert.ok(!('standalone' in rec.meta), 'the shared persist no longer re-labels the route');
		assert.equal(rec.meta['workflow'], 'build');
		assert.equal(rec.meta['epicHash'], HASH);
		assert.equal(rec.meta['storyId'], 's1');
		assert.deepEqual(rec.body['tasks'], [{ id: 's1', passed: true }]);
	} finally {
		_setBuildValidateProviderForTests(undefined);
		rmSync(repo, { recursive: true, force: true });
	}
});

test('validate[standalone]: the persisted record carries the file-level change-log for a non-empty changed set', async () => {
	const repo = mkGitRepoWithChange();
	try {
		seedDef(repo); seedLld(repo);
		_setBuildValidateProviderForTests({
			async runReviewSession<T>() { return judgeVerdict({ taskId: 's1', passed: true }) as T; },
		});
		const out = outputOf(await handleBuildStep({
			phase: 'validate', target: 's1', repo,
			standalone: { standalone: true, epicHash: HASH, storyId: 's1', sizeClass: 'small' },
		}));
		assert.equal(out['next'], 'done');

		const { json } = buildArtifactPaths(repo, HASH, 's1', CREATED_AT, 'epic', 'tag-filtering');
		const rec = JSON.parse(readFileSync(json, 'utf8')) as { body: { changeLog?: { target: { file: string }; author: string }[] } };
		assert.ok(Array.isArray(rec.body.changeLog), 'a non-empty changed set lands a `changeLog` on the record');
		const files = rec.body.changeLog!.map(e => e.target.file);
		assert.ok(files.includes('touched.ts'), `the git-changed file is recorded (got ${JSON.stringify(files)})`);
		assert.equal(rec.body.changeLog![0]!.author, 'insrc-build');
	} finally {
		_setBuildValidateProviderForTests(undefined);
		rmSync(repo, { recursive: true, force: true });
	}
});

test('validate[standalone]: a persist failure is swallowed — the verdict is still returned', async () => {
	const repo = mkRepo();
	try {
		seedDef(repo); seedLld(repo);
		// Force the persist to throw by making the record json path a DIRECTORY.
		const { json } = buildArtifactPaths(repo, HASH, 's1', CREATED_AT, 'epic', 'tag-filtering');
		mkdirSync(json, { recursive: true });
		_setBuildValidateProviderForTests({
			async runReviewSession<T>() { return judgeVerdict({ taskId: 's1', passed: true }) as T; },
		});
		const out = outputOf(await handleBuildStep({
			phase: 'validate', target: 's1', repo,
			standalone: { standalone: true, epicHash: HASH, storyId: 's1', sizeClass: 'small' },
		}));
		assert.equal(out['next'], 'done', 'a persist failure never converts a real standalone verdict into an error');
		assert.equal(out['passed'], true);
	} finally {
		_setBuildValidateProviderForTests(undefined);
		rmSync(repo, { recursive: true, force: true });
	}
});

test('validate[standalone]: a Small build with no resolvable identity → err(no-identity)', async () => {
	const repo = mkRepo();
	try {
		seedDef(repo); seedLld(repo);
		// Small ⇒ producesLld ⇒ the epicHash must be supplied (it locates the LLD);
		// omitting it is unrecoverable (never mint a hash for a Small story).
		const out = outputOf(await handleBuildStep({
			phase: 'validate', target: 's1', repo,
			standalone: { standalone: true, storyId: 's1', sizeClass: 'small' },
		}));
		assert.equal(out['next'], 'error');
		assert.equal((out['error'] as { code: string }).code, 'no-identity');
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('validate[standalone]: the persisted record is approvable by the completion gate', async () => {
	const repo = mkRepo();
	try {
		seedDef(repo); seedLld(repo);
		_setBuildValidateProviderForTests({
			async runReviewSession<T>() { return judgeVerdict({ taskId: 's1', passed: true }) as T; },
		});
		await handleBuildStep({
			phase: 'validate', target: 's1', repo,
			standalone: { standalone: true, epicHash: HASH, storyId: 's1', sizeClass: 'small' },
		});
		// The completion act: approve the persisted BUILD record by its json path.
		const { json } = buildArtifactPaths(repo, HASH, 's1', CREATED_AT, 'epic', 'tag-filtering');
		stampOtherPartyReview(json);   // completion requires an other-party code review
		approveArtifactByJsonPath(json);
		const rec = JSON.parse(readFileSync(json, 'utf8')) as { meta: Record<string, unknown> };
		assert.equal(typeof rec.meta['approvedAt'], 'string', 'approval stamps approvedAt on the standalone BUILD record');
	} finally {
		_setBuildValidateProviderForTests(undefined);
		rmSync(repo, { recursive: true, force: true });
	}
});

// ---------------------------------------------------------------------------
// multi-epic dir — a structural target resolves ONLY with an epicHash scope
// (the bugfix: `unresolved-target` when >1 epic DEF present, unless scoped)
// ---------------------------------------------------------------------------

test('implement: multi-epic dir + { target:\'s1/t1\', epicHash } resolves + proceeds', async () => {
	const repo = mkRepo();
	try {
		seedDef(repo); seedLld(repo); seedPlan(repo, true);   // epic A (HASH)
		seedSecondEpic(repo);                                 // epic B (HASH2)
		const out = outputOf(await handleBuildStep({ phase: 'implement', target: 's1/t1', epicHash: HASH, repo }));
		assert.equal(out['next'], 'implement');
		assert.equal(out['taskId'], 't1');
		assert.equal(out['issueRef'], 'acme/widgets#42');   // epic A's task ref, not B's #52
		assert.match(out['prompt'] as string, /Filter narrows results by tag/);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('validate: multi-epic dir + { target:\'s1/t1\', epicHash } resolves + returns a verdict', async () => {
	const repo = mkRepo();
	try {
		seedDef(repo); seedLld(repo); seedPlan(repo, true);
		seedSecondEpic(repo);
		_setBuildValidateProviderForTests({
			async runReviewSession<T>() { return judgeVerdict({ taskId: 't1', passed: true }) as T; },
		});
		const out = outputOf(await handleBuildStep({ phase: 'validate', target: 's1/t1', epicHash: HASH, repo }));
		assert.equal(out['next'], 'done');
		assert.equal(out['passed'], true);
	} finally {
		_setBuildValidateProviderForTests(undefined);
		rmSync(repo, { recursive: true, force: true });
	}
});

test('implement: multi-epic dir + \'s1/t1\' WITHOUT epicHash still returns err(unresolved-target)', async () => {
	const repo = mkRepo();
	try {
		seedDef(repo); seedLld(repo); seedPlan(repo, true);
		seedSecondEpic(repo);
		const out = outputOf(await handleBuildStep({ phase: 'implement', target: 's1/t1', repo }));
		assert.equal(out['next'], 'error');
		assert.equal((out['error'] as { code: string }).code, 'unresolved-target');
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------------------
// CHARACTERISATION — ISSUE-93081bff91ae5108 / S001 / t1
//
// These three tests assert the WRONG behaviour that exists on HEAD today. They
// are the baseline the rest of the Story is proved against: each is INVERTED by
// a named later task, so the fix shows up as a red-to-green flip rather than as
// an assertion that the author got it right. They PASS as written — a failure
// here means the defect moved, which is itself worth knowing.
//
//   TEST A  '## Scope' lost on the flipped record        INVERTED at t8 ✓
//   TEST B  meta.standalone forced to false by validate  INVERTED at t9 ✓
//           (its B2 half — sizeClass erased by the merge — was already
//            INVERTED by ISSUE-013e816250937aa5, which had to land first:
//            t9's specified fix alone leaves standalone *undefined*, not true,
//            because omitting a key used to delete it.)
//   TEST C  clean tree yields an empty change set        NOT A DEFECT (see t6)
//           — re-labelled at t6: its scenario is the TRIVIAL route, which has
//             no upstream artifact, so empty is the specified outcome. t1
//             mis-filed it; the real t6 inversion needs a resolvable base.
//
// NOTE FOR t9 — there is a SECOND place that encodes the forced flag as
// expected behaviour: the test at "validate[standalone]: no plan → resolves
// identity from context, persists a BUILD record (standalone:false, story
// task)" asserts `rec.meta['standalone'] === false` directly. t9 must update
// that assertion too, or it goes red alongside TEST B. Finding it only at that
// point would make the fix look like a regression.
// ---------------------------------------------------------------------------

/** A git repo whose working tree is CLEAN (everything committed), so the
 *  working-tree-only change-set derivation resolves an EMPTY set. */
function mkCleanGitRepo(): string {
	const repo = mkRepo();
	const git = (...args: string[]): void => { execFileSync('git', args, { cwd: repo, stdio: 'ignore' }); };
	git('init', '-q');
	git('config', 'user.email', 'test@insrc.local');
	git('config', 'user.name', 'insrc-test');
	writeFileSync(join(repo, 'shipped.ts'), 'export const v = 1;\n');
	git('add', '.');
	git('commit', '-qm', 'baseline');
	writeFileSync(join(repo, 'shipped.ts'), 'export const v = 2;\n');
	git('add', '.');
	git('commit', '-qm', 'the Story work, committed — exactly what the implement prompt mandates');
	return repo;
}

/** Is git usable here? Mirrors the gate idiom at diff-grounding.test.ts:150. */
function gitAvailable(): boolean {
	try { execFileSync('git', ['--version'], { stdio: 'ignore' }); return true; } catch { return false; }
}

const gitOut = (repo: string, ...args: string[]): string =>
	execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();

/** The single BUILD.md the record rendered to, wherever the folder scheme put
 *  it. Located by search rather than by path arithmetic, because the folder
 *  anchor itself depends on `meta.standalone` — part of what flips here. */
function findBuildMd(repo: string): string | undefined {
	const hits: string[] = [];
	const walk = (d: string): void => {
		for (const e of readdirSync(d, { withFileTypes: true })) {
			const p = join(d, e.name);
			if (e.isDirectory()) walk(p);
			else if (e.name === 'BUILD.md') hits.push(p);
		}
	};
	const docs = join(repo, 'docs');
	if (!existsSync(docs)) return undefined;
	walk(docs);
	return hits[0];
}

/** Drive a standalone build through implement THEN validate, the real two-phase
 *  sequence that produces the flip, and return the persisted record + markdown. */
async function runImplementThenValidate(repo: string, opts?: { readonly summary?: string | undefined }): Promise<{ rec: { meta: Record<string, unknown>; body: Record<string, unknown> }; md: string }> {
	_setBuildValidateProviderForTests({
		async runReviewSession<T>() { return judgeVerdict({ taskId: 's1', passed: true }) as T; },
	});
	try {
		const standalone = { standalone: true as const, epicHash: HASH, storyId: 's1', sizeClass: 'trivial', focus: 'Add a --json flag to the status subcommand.' };
		const impl = outputOf(await handleBuildStep({ phase: 'implement', target: 's1', repo, standalone }));
		assert.equal(impl['next'], 'implement', 'the standalone implement phase admitted the build');
		const { json } = buildArtifactPaths(repo, HASH, 's1', CREATED_AT, 'epic', 'tag-filtering');
		const afterImpl = JSON.parse(readFileSync(json, 'utf8')) as { meta: Record<string, unknown>; body: Record<string, unknown> };
		assert.equal(afterImpl.meta['standalone'], true, 'implement wrote standalone:true — the precondition the flip destroys');
		assert.equal(afterImpl.body['focus'], 'Add a --json flag to the status subcommand.');

		const val = outputOf(await handleBuildStep({
			phase: 'validate', target: 's1', repo, standalone,
			// Added at t10. Absent by default, so the three characterisations above
			// call this helper with byte-identical arguments to before.
			...(opts?.summary !== undefined ? { summary: opts.summary } : {}),
		}));
		assert.equal(val['next'], 'done', 'the standalone validate phase returned a verdict');
		const rec = JSON.parse(readFileSync(json, 'utf8')) as { meta: Record<string, unknown>; body: Record<string, unknown> };
		const mdPath = findBuildMd(repo);
		assert.ok(mdPath !== undefined, 'a BUILD.md was rendered somewhere under docs/');
		return { rec, md: readFileSync(mdPath, 'utf8') };
	} finally {
		_setBuildValidateProviderForTests(undefined);
	}
}

test('CHARACTERISATION A (INVERTED at t8): a standalone build\'s persisted md now RENDERS \'## Scope\' for its body.focus', async () => {
	if (!gitAvailable()) return;   // gated: git-dependent, skips cleanly
	const repo = mkCleanGitRepo();
	try {
		seedDef(repo);
		const { rec, md } = await runImplementThenValidate(repo);

		// INVERTED AT t8 — rewritten to assert the correct behaviour, not deleted.
		// body.focus still survives in the json, as it always did...
		assert.equal(rec.body['focus'], 'Add a --json flag to the status subcommand.',
			'body.focus is persisted after validate');
		// ...and it is now VISIBLE. The converged renderer emits `## Scope` whenever
		// body.focus is present, so the orphaned-content defect is closed even though
		// the validate write still flips meta.standalone (t9 closes that half).
		assert.match(md, /## Scope\n\nAdd a --json flag to the status subcommand\./,
			'the record renders its own scope — the orphan is gone');
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('CHARACTERISATION B (INVERTED at t9): a standalone build KEEPS meta.standalone true through validate', async () => {
	if (!gitAvailable()) return;
	const repo = mkCleanGitRepo();
	try {
		seedDef(repo);
		const { rec } = await runImplementThenValidate(repo);

		// INVERTED AT t9 — rewritten to assert the correct behaviour, not deleted.
		// implement wrote `true` (asserted inside the helper) and validate no longer
		// overwrites it: the shared persist omits the key, so mergeWithPrior carries
		// the prior value forward and the record keeps its own identity.
		assert.equal(rec.meta['standalone'], true,
			'a standalone record is no longer re-labelled by the shared validate persist');
		// B2 — INVERTED by ISSUE-013e816250937aa5, which this assertion originally
		// characterised as a defect. It used to read `=== undefined`: mergeWithPrior
		// spread only the NEW meta, so sizeClass (which the validate write never
		// mentions) was DELETED rather than preserved, and t8's premise that
		// sizeClass is safe to key the converged title on was therefore false.
		// The merge now spreads prior.meta first, so a prior-only meta field
		// survives a write that omits it — and t8's premise holds again.
		assert.equal(rec.meta['sizeClass'], 'trivial',
			'sizeClass SURVIVES the validate write (ISSUE-013e8162). This is what makes t8 able to key the converged title on it.');
		// body, by contrast, merges ADDITIVELY — focus survives alongside tasks.
		// That asymmetry between meta and body merging is the actual mechanism.
		assert.equal(rec.body['focus'], 'Add a --json flag to the status subcommand.',
			'body keys from the prior record survive the merge, unlike meta keys');
		assert.ok(Array.isArray(rec.body['tasks']), 'and the new body keys are added');
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('CHARACTERISATION C (TRIVIAL route — NOT a defect, re-labelled at t6): a CLEAN tree with NO upstream yields an empty changeLog and no \'## Changes\' section', async () => {
	if (!gitAvailable()) return;
	const repo = mkCleanGitRepo();
	try {
		seedDef(repo);
		// The Story's work was COMMITTED — exactly what the implement prompt
		// mandates before validation runs. The precondition is stated the way the
		// COLLECTOR asks git (staged + unstaged diff, which is all changedFiles
		// consults) rather than via --porcelain: seedDef leaves an UNTRACKED
		// .insrc/, which --porcelain reports but `git diff` does not, so it cannot
		// mask the defect.
		assert.equal(gitOut(repo, 'diff', '--name-only'), '', 'precondition: no unstaged changes');
		assert.equal(gitOut(repo, 'diff', '--cached', '--name-only'), '', 'precondition: no staged changes');
		const { rec, md } = await runImplementThenValidate(repo);

		// RE-LABELLED at t6, and the correction matters. t1 filed this as a DEFECT
		// that t6 would invert. It is not: this scenario is a TRIVIAL standalone —
		// seedDef only, so there is no PLAN and no LLD, hence no upstream artifact
		// to carry a stamped base or to locate in history. An empty change set is
		// therefore the SPECIFIED outcome for the trivial route, not a bug, and t6
		// leaves it exactly as it is. The genuine t6 inversion needs a resolvable
		// base — see the 'clean tree WITH a stamped base' test below.
		assert.equal(rec.body['changeLog'], undefined,
			'TRIVIAL route: no upstream to anchor a range on, so the derivation sees only the (clean) working tree and the key is omitted');
		assert.doesNotMatch(md, /## Changes/,
			'and no `## Changes` section is rendered — correct for a build with no resolvable base');
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------------------
// t10 — END-TO-END PROVENANCE PROOF
//
// The capstone. Every earlier task proved ONE piece in isolation; this drives
// the real two-phase sequence once and asserts that all of them land on the SAME
// record. None of these three sections could appear on a record before this
// Story: `## Changes` had no populated derivation (t3/t4/t6), `## Summary` and
// `**Commit:**` were declared and rendered but written by nobody (t7), and on a
// standalone record the renderer emitted no `## Scope` at all (t8) while the
// shared validate persist re-labelled the route (t9).
//
// Route: TRIVIAL standalone, as the acceptance check names. That route has NO
// upstream artifact, so the stamped-base and PLAN-commit chains both legitimately
// yield nothing (t6) and the WORKING-TREE derivation is what populates the change
// set — which is also the real state a trivial build validates in, since there is
// no plan telling it to commit first.
// ---------------------------------------------------------------------------

/** A git repo with a committed baseline and the Story's work left UNCOMMITTED —
 *  the state a trivial-route build actually validates in. */
function mkDirtyGitRepo(): string {
	const repo = mkRepo();
	const git = (...args: string[]): void => { execFileSync('git', args, { cwd: repo, stdio: 'ignore' }); };
	git('init', '-q');
	git('config', 'user.email', 'test@insrc.local');
	git('config', 'user.name', 'insrc-test');
	writeFileSync(join(repo, 'shipped.ts'), 'export const v = 1;\n');
	git('add', '.');
	git('commit', '-qm', 'baseline');
	// The Story's real work: one modified file (unstaged) and one new file
	// (staged), so BOTH halves of the two-pass derivation contribute.
	writeFileSync(join(repo, 'shipped.ts'), 'export const v = 2;\n');
	writeFileSync(join(repo, 'added.ts'), 'export const json = true;\n');
	git('add', 'added.ts');
	return repo;
}

test('t10 END-TO-END: a trivial-routed build produces ONE record carrying the change set, the summary, the commit, its scope and its route — none of which it could carry before this Story', async () => {
	if (!gitAvailable()) return;   // gated: git-dependent, skips cleanly
	const repo = mkDirtyGitRepo();
	try {
		seedDef(repo);
		// COMMIT a placeholder at the record's own json path first, so that when the
		// build overwrites it the path is TRACKED-and-modified and therefore actually
		// VISIBLE to the derivation. Without this the exclusion assertion below is
		// vacuous: the artifacts the build writes are new UNTRACKED files, and
		// `git diff` never reports untracked paths, so they could not appear in the
		// change set whether t4's exclusion existed or not. (The md half is pinned by
		// t4's own test, which reproduces both paths dirty; its folder is anchored on
		// a createdAt minted during implement, so it cannot be committed up front.)
		const ownJson = buildArtifactPaths(repo, HASH, 's1', CREATED_AT, 'epic', 'tag-filtering').json;
		mkdirSync(dirname(ownJson), { recursive: true });
		writeFileSync(ownJson, '{}\n');
		execFileSync('git', ['add', '-f', ownJson], { cwd: repo, stdio: 'ignore' });
		execFileSync('git', ['commit', '-qm', 'placeholder so the record\'s own path is tracked', '--', ownJson], { cwd: repo, stdio: 'ignore' });

		const head = gitOut(repo, 'rev-parse', '--short', 'HEAD');
		const { rec, md } = await runImplementThenValidate(repo, {
			summary: 'Added the --json flag and routed status through the shared serialiser.',
		});

		// --- t3 / t4 / t6: a POPULATED change set, and only the Story's own files
		const files = ((rec.body['changeLog'] ?? []) as { target: { file: string } }[]).map(e => e.target.file);
		assert.deepEqual([...files].sort(), ['added.ts', 'shipped.ts'],
			'both halves of the derivation contribute (staged + unstaged) and nothing else does');
		assert.match(md, /## Changes\n\n- `shipped\.ts` — \*\*insrc-build\*\*/,
			'`## Changes` opens with the modified file, attributed');
		assert.match(md, /^- `added\.ts` — \*\*insrc-build\*\* \(2\d{3}-/m,
			'and carries the new file too, each line attributed + timestamped');
		// t4's exclusion, LIVE end-to-end: the record's own json is tracked and was
		// rewritten by this very build, so git reports it as modified — and it is
		// still absent from the change set. The record cannot report itself as the
		// Story's work.
		assert.ok(gitOut(repo, 'diff', '--name-only').includes('.insrc/artifacts'),
			'precondition: git DOES see the record\'s own json as modified, so the exclusion is exercised');
		assert.ok(!files.some(f => f.includes('.insrc/artifacts') || /BUILD\.(?:json|md)$/.test(f)),
			`the record’s own artifact path is excluded anyway (got ${JSON.stringify(files)})`);

		// --- t7: a summary and a commit, from the two producers that did not exist
		assert.equal(rec.body['summary'], 'Added the --json flag and routed status through the shared serialiser.');
		assert.match(md, /## Summary\n\nAdded the --json flag and routed status through the shared serialiser\./);
		assert.equal(rec.body['commit'], head, 'body.commit is HEAD at persist time');
		assert.match(md, new RegExp(`\\*\\*Commit:\\*\\* ${head}$`, 'm'));

		// --- t8 / t9: the record still describes ITSELF after validation
		assert.match(md, /^# Build \(standalone trivial\) — Story s1$/m,
			'the converged renderer titles it by its sizeClass');
		assert.match(md, /## Scope\n\nAdd a --json flag to the status subcommand\./);
		assert.equal(rec.meta['standalone'], true, 'and validate did not re-label the route');

		// The whole point, stated once: a single record, not two and not a stub.
		for (const heading of ['## Scope', '## Summary', '## Tasks validated', '## Changes', '**Commit:**']) {
			assert.ok(md.includes(heading), `${heading} is present on the one record`);
		}
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('t10 AUDIT: all three of t1\'s characterisations are still here, each carrying the task that INVERTED it — none deleted, none skipped', () => {
	// Mechanical rather than by-eye. The cheapest way to make a red
	// characterisation green is to delete it, and the second cheapest is to leave
	// it passing while quietly dropping the label that says which task owes it a
	// flip. This reads this very file and refuses both.
	const src = readFileSync(new URL(import.meta.url), 'utf8');
	const names = [...src.matchAll(/^test\('(CHARACTERISATION [A-Z][^']*)'/gm)].map(m => m[1]!);
	assert.equal(names.length, 3, `expected exactly three lettered characterisations, got ${JSON.stringify(names)}`);
	// Each must still name its resolving task. C is the one t1 MIS-FILED: its
	// scenario is the trivial route, where an empty change set is the specified
	// outcome, so t6 re-labelled it instead of inverting it. That is recorded as a
	// correction, not quietly dropped — which is why the expected marker differs.
	const expected: readonly [string, RegExp][] = [
		['CHARACTERISATION A', /\(INVERTED at t8\)/],
		['CHARACTERISATION B', /\(INVERTED at t9\)/],
		['CHARACTERISATION C', /re-labelled at t6/],
	];
	for (const [prefix, marker] of expected) {
		const hit = names.find(n => n.startsWith(prefix));
		assert.ok(hit !== undefined, `${prefix} is missing — a characterisation was deleted rather than flipped`);
		assert.match(hit, marker, `${prefix} no longer names the task that resolved it`);
	}
	// And none of them is inert: `skip`/`todo` would let a deleted assertion pass.
	assert.doesNotMatch(src, /test\.(?:skip|todo)\('CHARACTERISATION/, 'no characterisation is skipped or todo');
});

test('CHARACTERISATION harness: read-only — rev-list --count and status --porcelain unchanged afterwards, and the suite skips cleanly when git is unavailable', async () => {
	if (!gitAvailable()) return;
	const repo = mkCleanGitRepo();
	try {
		seedDef(repo);
		const countBefore = gitOut(repo, 'rev-list', '--count', 'HEAD');
		// Tracked state before: nothing staged or unstaged (seedDef's .insrc/ is
		// untracked, so it is invisible to `git diff` — the same reason C states
		// its precondition this way).
		assert.equal(gitOut(repo, 'diff', '--name-only'), '');
		assert.equal(gitOut(repo, 'diff', '--cached', '--name-only'), '');
		await runImplementThenValidate(repo);

		// The build phases write artifacts under .insrc/ and docs/, so the tree is
		// no longer pristine — but they must never COMMIT, rewrite history, or
		// touch tracked source.
		assert.equal(gitOut(repo, 'rev-list', '--count', 'HEAD'), countBefore,
			'the build phases created no commits');
		// No TRACKED file was modified by the build phases — artifacts land as new
		// untracked paths under .insrc/ and docs/, which is expected and harmless.
		assert.equal(gitOut(repo, 'diff', '--name-only'), '',
			'the build phases modified no tracked file');
		assert.equal(gitOut(repo, 'diff', '--cached', '--name-only'), '',
			'the build phases staged nothing');
		const dirty = gitOut(repo, 'status', '--porcelain').split('\n').filter(Boolean);
		const stray = dirty.filter(l => !/(\.insrc\/|docs\/)/.test(l));
		assert.deepEqual(stray, [], `only artifact paths may appear as dirty (got ${JSON.stringify(dirty)})`);
		assert.equal(gitOut(repo, 'show', '-s', '--format=%s', 'HEAD'),
			'the Story work, committed — exactly what the implement prompt mandates',
			'HEAD still points at the same commit — no amend, no rewrite');
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------------------
// t4 (ISSUE-93081bff91ae5108 / S001) — the WRITER passes its own paths.
//
// The derivation-level exclusion is covered in changed-files.test.ts. This is
// the other half: that the validate writer actually DERIVES its own json + md
// pre-persist and forwards them, reproducing the exact observed state — the
// record's own two files dirty in the working tree while the Story's real change
// sits alongside them.
// ---------------------------------------------------------------------------

test('t4: the validate writer EXCLUDES its own json + md from its own change-log, keeping the Story\'s real change', async () => {
	if (!gitAvailable()) return;
	const repo = mkCleanGitRepo();
	try {
		seedDef(repo);
		_setBuildValidateProviderForTests({
			async runReviewSession<T>() { return judgeVerdict({ taskId: 's1', passed: true }) as T; },
		});
		const standalone = { standalone: true as const, epicHash: HASH, storyId: 's1', sizeClass: 'trivial', focus: 'F' };

		// FIRST validate — writes the record, so from here on its own json + md
		// exist on disk as untracked/dirty paths.
		await handleBuildStep({ phase: 'validate', target: 's1', repo, standalone });
		const { json } = buildArtifactPaths(repo, HASH, 's1', CREATED_AT, 'epic', 'tag-filtering');
		assert.ok(existsSync(json), 'precondition: the record now exists');

		// Stage everything so the record's own files ARE in the working-tree diff,
		// alongside a genuine source change — the exact state that produced the
		// observed wrong change set.
		writeFileSync(join(repo, 'real-work.ts'), 'export const w = 1;\n');
		execFileSync('git', ['add', '-A'], { cwd: repo, stdio: 'ignore' });
		const raw = execFileSync('git', ['diff', '--cached', '--name-only'], { cwd: repo, encoding: 'utf8' })
			.split('\n').filter(Boolean);
		assert.ok(raw.some(f => f.endsWith('.json') && f.includes('BUILD-')),
			`precondition: the record's own json IS in the raw diff, got ${JSON.stringify(raw)}`);
		assert.ok(raw.some(f => f.endsWith('BUILD.md')), 'precondition: and its own md too');

		// SECOND validate — the one whose change-log we inspect.
		await handleBuildStep({ phase: 'validate', target: 's1', repo, standalone });
		const rec = JSON.parse(readFileSync(json, 'utf8')) as { body: { changeLog?: { target: { file: string } }[] } };
		const files = (rec.body.changeLog ?? []).map(e => e.target.file);

		assert.ok(files.includes('real-work.ts'), `the Story's real change is recorded, got ${JSON.stringify(files)}`);
		assert.ok(!files.some(f => f.includes('BUILD-') && f.endsWith('.json')),
			`the record must not report its own json, got ${JSON.stringify(files)}`);
		assert.ok(!files.some(f => f.endsWith('BUILD.md')),
			`the record must not report its own md, got ${JSON.stringify(files)}`);
	} finally {
		_setBuildValidateProviderForTests(undefined);
		rmSync(repo, { recursive: true, force: true });
	}
});

// ---------------------------------------------------------------------------
// t6 (ISSUE-93081bff91ae5108 / S001) — the range base, end to end through the
// validate writer. THIS is where the Story's defect actually closes.
// ---------------------------------------------------------------------------

/** A repo with a base commit, the Story's work COMMITTED (so the tree is clean),
 *  and an LLD stamped with the base — the standalone route's upstream. */
function mkStampedRepo(extraCommits: readonly string[] = []): { repo: string; base: string; git: (...a: string[]) => string } {
	const repo = mkRepo();
	const git = (...a: string[]): string => execFileSync('git', a, { cwd: repo, encoding: 'utf8' }).trim();
	git('init', '-q'); git('config', 'user.email', 't@t'); git('config', 'user.name', 't');
	writeFileSync(join(repo, 'before.ts'), 'export const b = 1;\n');
	git('add', '-A'); git('commit', '-qm', 'before the Story');
    const base = git('rev-parse', 'HEAD');
	seedDef(repo); seedLld(repo);
	// Stamp the base onto the LLD, as t5's approval would have.
	const lld = join(artifactsDir(repo), `${lldArtifactId(HASH, 's1')}.json`);
	const parsed = JSON.parse(readFileSync(lld, 'utf8')) as { meta: Record<string, unknown> };
	parsed.meta['rangeBase'] = base;
	writeFileSync(lld, JSON.stringify(parsed, null, 2) + '\n');
	// The Story's work, COMMITTED — one commit per entry, so a multi-task Story
	// can be modelled.
	for (const f of ['shipped.ts', ...extraCommits]) {
		writeFileSync(join(repo, f), `export const x = '${f}';\n`);
		git('add', '-A'); git('commit', '-qm', `work: ${f}`);
	}
	return { repo, base, git };
}

const STANDALONE_S1 = { standalone: true as const, epicHash: HASH, storyId: 's1', sizeClass: 'small' };

async function validateOnce(repo: string): Promise<{ meta: Record<string, unknown>; body: Record<string, unknown> }> {
	_setBuildValidateProviderForTests({
		async runReviewSession<T>() { return judgeVerdict({ taskId: 's1', passed: true }) as T; },
	});
	try {
		const out = outputOf(await handleBuildStep({ phase: 'validate', target: 's1', repo, standalone: STANDALONE_S1 }));
		assert.equal(out['next'], 'done');
		const { json } = buildArtifactPaths(repo, HASH, 's1', CREATED_AT, 'epic', 'tag-filtering');
		return JSON.parse(readFileSync(json, 'utf8')) as { meta: Record<string, unknown>; body: Record<string, unknown> };
	} finally { _setBuildValidateProviderForTests(undefined); }
}

const changeFiles = (rec: { body: Record<string, unknown> }): string[] =>
	((rec.body['changeLog'] ?? []) as { target: { file: string } }[]).map(e => e.target.file);

test('t6 THE POINT OF THE STORY: a CLEAN tree WITH a stamped base yields the Story\'s committed change set', async () => {
	if (!gitAvailable()) return;
	const { repo, git } = mkStampedRepo();
	try {
		assert.equal(git('diff', '--name-only'), '', 'precondition: clean tree — the state that used to yield nothing');
		const rec = await validateOnce(repo);
		const files = changeFiles(rec);
		assert.ok(files.includes('shipped.ts'),
			`the Story's COMMITTED work is now recorded on a clean tree, got ${JSON.stringify(files)}`);
		assert.ok(!files.includes('before.ts'), 'and only base..HEAD, not the whole history');
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('t6: a multi-task Story\'s change set GROWS across tasks rather than describing only the latest', async () => {
	if (!gitAvailable()) return;
	const { repo } = mkStampedRepo(['second.ts', 'third.ts']);
	try {
		const files = changeFiles(await validateOnce(repo));
		for (const f of ['shipped.ts', 'second.ts', 'third.ts']) {
			assert.ok(files.includes(f), `${f} must be in the range, got ${JSON.stringify(files)}`);
		}
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('t6: a DIRTY tree yields today\'s working-tree result and does NOT union in the committed range', async () => {
	if (!gitAvailable()) return;
	const { repo } = mkStampedRepo();
	try {
		writeFileSync(join(repo, 'uncommitted.ts'), 'export const u = 1;\n');
		execFileSync('git', ['add', 'uncommitted.ts'], { cwd: repo, stdio: 'ignore' });
		const files = changeFiles(await validateOnce(repo));
		assert.ok(files.includes('uncommitted.ts'), 'the dirty path is reported');
		assert.ok(!files.includes('shipped.ts'),
			'and the committed range is NOT unioned in — a dirty tree is left exactly as it was');
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('t6: an UNRESOLVABLE base still WRITES the record, keeps the verdict, and substitutes no range', async () => {
	if (!gitAvailable()) return;
	// The genuinely unresolvable case, found by getting it wrong first: an
	// UNCOMMITTED upstream makes the tree dirty (so the base is never consulted),
	// and a COMMITTED one resolves via the introducing-commit fallback. The base is
	// therefore only truly unresolvable when there is NO upstream artifact at all —
	// the trivial route. So that is what this exercises, on a CLEAN tree, with a
	// second commit present so HEAD^ WOULD resolve if anything reached for it.
	const repo = mkRepo();
	try {
		const git = (...a: string[]): string => execFileSync('git', a, { cwd: repo, encoding: 'utf8' }).trim();
		git('init', '-q'); git('config', 'user.email', 't@t'); git('config', 'user.name', 't');
		writeFileSync(join(repo, 'one.ts'), '1\n'); git('add', '-A'); git('commit', '-qm', 'one');
		writeFileSync(join(repo, 'two.ts'), '2\n'); git('add', '-A'); git('commit', '-qm', 'two');
		seedDef(repo);                      // DEF only — no PLAN, no LLD to anchor on
		git('add', '-A'); git('commit', '-qm', 'artifacts');   // keep the tree CLEAN
		assert.equal(git('diff', '--name-only'), '', 'precondition: clean tree');
		assert.equal(resolveStoryRangeBase(repo, HASH, 's1'), undefined, 'precondition: no base resolves');

		const rec = await validateOnce(repo);
		assert.equal(rec.body['changeLog'], undefined,
			'empty — and notably NOT two.ts, which a HEAD^ fallback would have produced');
		assert.deepEqual(rec.body['tasks'], [{ id: 's1', passed: true }],
			'the record IS still written and the verdict stands: provenance failing must never block a build');
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('t6: BOTH writers resolve the SAME base for the same Story — one resolver, not two chains', async () => {
	if (!gitAvailable()) return;
	const { repo, base } = mkStampedRepo();
	try {
		// The validate writer's view.
		const viaValidate = changeFiles(await validateOnce(repo));
		// The completion-time writer's view, on the same repo + story.
		const viaCompletion = await ensureBuildRecordOnCompletion(repo, { epicHash: HASH, storyId: 's1' });
		assert.ok(viaCompletion !== undefined, 'the completion writer produced a record');
		const rec = JSON.parse(readFileSync(viaCompletion.json, 'utf8')) as { body: Record<string, unknown> };
		const viaCompletionFiles = changeFiles(rec);

		assert.ok(viaValidate.includes('shipped.ts'));
		assert.ok(viaCompletionFiles.includes('shipped.ts'),
			'the completion writer resolved the same base and saw the same committed range');
		// And the resolver itself agrees with what both of them used.
		assert.equal(resolveStoryRangeBase(repo, HASH, 's1'), base);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------------------
// t7 (ISSUE-93081bff91ae5108 / S001) — body.summary via the validate input.
// ---------------------------------------------------------------------------

async function validateWithSummary(repo: string, summary?: string): Promise<Record<string, unknown>> {
	_setBuildValidateProviderForTests({
		async runReviewSession<T>() { return judgeVerdict({ taskId: 's1', passed: true }) as T; },
	});
	try {
		const out = outputOf(await handleBuildStep({
			phase: 'validate', target: 's1', repo,
			standalone: { standalone: true, epicHash: HASH, storyId: 's1', sizeClass: 'small' },
			...(summary !== undefined ? { summary } : {}),
		}));
		assert.equal(out['next'], 'done');
		const { json } = buildArtifactPaths(repo, HASH, 's1', CREATED_AT, 'epic', 'tag-filtering');
		return (JSON.parse(readFileSync(json, 'utf8')) as { body: Record<string, unknown> }).body;
	} finally { _setBuildValidateProviderForTests(undefined); }
}

test('t7: a SUPPLIED summary reaches body.summary', async () => {
	const repo = mkRepo();
	try {
		seedDef(repo); seedLld(repo);
		const body = await validateWithSummary(repo, 'Wired the collector to the Story\'s committed range.');
		assert.equal(body['summary'], 'Wired the collector to the Story\'s committed range.');
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('t7: NO summary supplied → the record carries NO summary key (never synthesised from the task list)', async () => {
	const repo = mkRepo();
	try {
		seedDef(repo); seedLld(repo);
		const body = await validateWithSummary(repo);
		assert.ok(!('summary' in body),
			'a summary invented from the tasks would read as a description of the work while being nothing of the kind');
		assert.deepEqual(body['tasks'], [{ id: 's1', passed: true }], 'and the rest of the record is unaffected');
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('t7: an EMPTY or WHITESPACE-ONLY summary is treated as omitted, not stored as a blank', async () => {
	for (const supplied of ['', '   ', '\n\t ']) {
		const repo = mkRepo();
		try {
			seedDef(repo); seedLld(repo);
			const body = await validateWithSummary(repo, supplied);
			assert.ok(!('summary' in body), `${JSON.stringify(supplied)} must be treated as absent`);
		} finally { rmSync(repo, { recursive: true, force: true }); }
	}
});

test('t7: the summary input is OPTIONAL — a controller that never supplies it sees no behavioural difference', async () => {
	const a = mkRepo(); const b = mkRepo();
	try {
		seedDef(a); seedLld(a); seedDef(b); seedLld(b);
		const without = await validateWithSummary(a);
		const alsoWithout = await validateWithSummary(b, undefined);
		assert.deepEqual(Object.keys(without).sort(), Object.keys(alsoWithout).sort(),
			'omitting the field and passing undefined produce the same record shape');
	} finally { rmSync(a, { recursive: true, force: true }); rmSync(b, { recursive: true, force: true }); }
});


// ---------------------------------------------------------------------------
// The validate writer resolves the ROUTE instead of abstaining from it
//
// Two Stories (1f7ade1a, 93081bff) had their BUILD record filed under
// docs/epics/ while their own ISSUE/LLD/PLAN sat under docs/standalone/. The
// cause was an omission, not a wrong value: the shared persist left
// `meta.standalone` absent so mergeWithPrior could carry a prior forward, which
// works on a SECOND write but not a FIRST, where the absent key reads as false
// and `workItemKindOf` answers 'epic'.
//
// The persist layer's "absent means epic" default is CORRECT and is pinned
// elsewhere (build-record.test.ts) — it must not manufacture a route it was
// never given. What was wrong is that its CALLER abstained too, despite the
// route being readable from the work item's definition head. These tests pin
// the caller's half; the `=== true` guard keeps the old prohibition intact.
// ---------------------------------------------------------------------------

/** Seed an ISSUE-anchored definition head, the shape a triage-routed bugfix
 *  gets. `standalone` lives here, which is why the writer can read it. */
function seedStandaloneIssue(repo: string): void {
	writeFileSync(join(artifactsDir(repo), `ISSUE-${HASH}.json`), JSON.stringify({
		meta: {
			workflow: 'issue', issueHash: HASH, epicSlug: 'tag-filtering',
			createdAt: CREATED_AT, approvedAt: CREATED_AT,
			standalone: true, magnitude: 'small',
		},
		body: { title: 't', reproduction: 'r', rootCause: 'rc', fixIntent: 'fi' },
		citations: [],
	}, null, 2));
}

test('validate: a standalone work item gets meta.standalone TRUE on the FIRST write, read from its definition head', async () => {
	const repo = mkRepo();
	try {
		seedStandaloneIssue(repo); seedLld(repo);
		_setBuildValidateProviderForTests({
			async runReviewSession<T>() { return judgeVerdict({ taskId: 's1', passed: true }) as T; },
		});
		const out = outputOf(await handleBuildStep({ phase: 'validate', target: 's1', repo, standalone: STANDALONE_S1 }));
		assert.equal(out['next'], 'done');

		// FIRST write — there is no prior record, so nothing can be carried
		// forward and the flag has to come from the definition head or not at all.
		const { json } = buildArtifactPaths(repo, HASH, 's1', CREATED_AT, 'standalone', 'tag-filtering');
		assert.ok(existsSync(json), `the record must land on the STANDALONE path; nothing at ${json}`);
		const rec = JSON.parse(readFileSync(json, 'utf8')) as { meta: { standalone?: boolean } };
		assert.equal(rec.meta.standalone, true, 'the writer must supply the route it can read');

		// And the markdown must be under docs/standalone/, which is the symptom
		// that was actually reported. FALSIFYING MUTATION: drop the
		// inheritedStandalone lookup in validate.ts and this goes to docs/epics/.
		const md = findBuildMd(repo);
		assert.ok(md !== undefined && md.includes('/docs/standalone/'),
			`expected the record under docs/standalone/, got: ${md ?? '(none)'}`);
	} finally { _setBuildValidateProviderForTests(undefined); rmSync(repo, { recursive: true, force: true }); }
});

test('validate: an EPIC-parented work item is unchanged — no flag written, record under docs/epics/', async () => {
	const repo = mkRepo();
	try {
		// seedDef writes a DEF with NO standalone key, which is what an
		// epic-parented Story looks like. The negative control: if the fix
		// manufactured `true`, or wrote `false` unconditionally, this moves.
		seedDef(repo); seedLld(repo);
		_setBuildValidateProviderForTests({
			async runReviewSession<T>() { return judgeVerdict({ taskId: 's1', passed: true }) as T; },
		});
		assert.equal(outputOf(await handleBuildStep({ phase: 'validate', target: 's1', repo, standalone: STANDALONE_S1 }))['next'], 'done');

		const { json } = buildArtifactPaths(repo, HASH, 's1', CREATED_AT, 'epic', 'tag-filtering');
		const rec = JSON.parse(readFileSync(json, 'utf8')) as { meta: Record<string, unknown> };
		assert.ok(!('standalone' in rec.meta),
			'only an explicit TRUE is ever written — a false must stay ABSENT so a prior true can survive');
		const md = findBuildMd(repo);
		assert.ok(md !== undefined && md.includes('/docs/epics/'), `expected docs/epics/, got: ${md ?? '(none)'}`);
	} finally { _setBuildValidateProviderForTests(undefined); rmSync(repo, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------------------
// ISSUE-0855311b / ISSUE-43d72766 — the FIRST validate write for a standalone
// story with NO definition head (a triage-routed Small story: LLD only, or a
// Trivial: nothing). The head-only lookup found nothing, so the record was
// written with no flag and no size class and filed under docs/epics/<hash>-E…/.
// ---------------------------------------------------------------------------

/** A standalone LLD and NOTHING else — no DEF, no ISSUE. */
function seedStandaloneLldOnly(repo: string): void {
	writeFileSync(join(artifactsDir(repo), `${lldArtifactId(HASH, 's1')}.json`), JSON.stringify({
		meta: {
			workflow: 'design.story', runId: 'lld-run-1', schemaVersion: 1,
			epicHash: HASH, epicSlug: 'tag-filtering', storyId: 's1', createdAt: CREATED_AT,
			standalone: true, approvedAt: CREATED_AT,
		},
		body: { openQuestions: [] }, citations: [],
	}, null, 2));
}

function readBuildRecord(repo: string): { meta: Record<string, unknown>; body: Record<string, unknown> } {
	return JSON.parse(readFileSync(join(artifactsDir(repo), `BUILD-${HASH}-s1.json`), 'utf8')) as { meta: Record<string, unknown>; body: Record<string, unknown> };
}

async function validateWith(repo: string, standalone: Record<string, unknown>): Promise<void> {
	_setBuildValidateProviderForTests({
		async runReviewSession<T>() { return judgeVerdict({ taskId: 's1', passed: true }) as T; },
	});
	try {
		const out = outputOf(await handleBuildStep({ phase: 'validate', target: 's1', repo, standalone: standalone as never }));
		assert.equal(out['next'], 'done');
	} finally { _setBuildValidateProviderForTests(undefined); }
}

test('0855311b — validate, LLD-only Small story: first write is standalone, sized, and filed beside the LLD', async () => {
	const repo = mkRepo();
	try {
		seedStandaloneLldOnly(repo);
		await validateWith(repo, { standalone: true, epicHash: HASH, storyId: 's1', sizeClass: 'small', triageRationale: 'one obvious approach' });

		const rec = readBuildRecord(repo);
		assert.equal(rec.meta['standalone'], true, 'the route reaches the record on its FIRST write');
		assert.equal(rec.meta['sizeClass'], 'small', 'and so does the size class the caller declared');
		assert.equal(rec.meta['triageRationale'], 'one obvious approach');

		// The exact folder the LLD occupies — not docs/epics/, and not a raw-hash name.
		const expected = buildArtifactPaths(repo, HASH, 's1', CREATED_AT, 'standalone', 'tag-filtering').md;
		assert.equal(findBuildMd(repo), expected);
		assert.ok(!expected.includes(`${HASH}-E`), 'sanity: the expected folder is slug-named');
		assert.match(readFileSync(expected, 'utf8'), /^<!-- insrc:artifact BUILD-a3f4b8c9d1e2f3a4-s1 -->\n\n# Build \(standalone small\)/);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('0855311b — validate, no head and no LLD: the route the standalone branch declared is what is written', async () => {
	const repo = mkRepo();
	try {
		// A Trivial build: nothing on disk can say what it is, so the declaration must.
		await validateWith(repo, { standalone: true, epicHash: HASH, storyId: 's1', sizeClass: 'trivial', focus: 'a guard' });
		const rec = readBuildRecord(repo);
		assert.equal(rec.meta['standalone'], true);
		assert.equal(rec.meta['sizeClass'], 'trivial');
		const md = findBuildMd(repo);
		assert.ok(md !== undefined && md.includes('/docs/standalone/'), `expected docs/standalone/, got: ${md ?? '(none)'}`);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('0855311b — validate: a caller\'s declaration does NOT relabel a story whose definition head says otherwise', async () => {
	const repo = mkRepo();
	try {
		// The DEF exists and carries no standalone key: an epic-parented story. The
		// declaration counts only when there is no head at all.
		seedDef(repo); seedLld(repo);
		await validateWith(repo, { standalone: true, epicHash: HASH, storyId: 's1', sizeClass: 'small', triageRationale: 'r' });
		const rec = readBuildRecord(repo);
		assert.ok(!('standalone' in rec.meta), 'no flag');
		assert.ok(!('sizeClass' in rec.meta), 'and no size class: an epic record is never titled as a standalone one');
		assert.ok(!('triageRationale' in rec.meta));
		const md = findBuildMd(repo);
		assert.ok(md !== undefined && md.includes('/docs/epics/'), `expected docs/epics/, got: ${md ?? '(none)'}`);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('0855311b — completion: an LLD-only story\'s record is written standalone, beside the LLD', async () => {
	const repo = mkRepo();
	try {
		seedStandaloneLldOnly(repo);
		const paths = await ensureBuildRecordOnCompletion(repo, { epicHash: HASH, storyId: 's1' }, async () => []);
		assert.equal(paths?.md, buildArtifactPaths(repo, HASH, 's1', CREATED_AT, 'standalone', 'tag-filtering').md);
		assert.equal(readBuildRecord(repo).meta['standalone'], true);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('43d72766 — a record that never got its flag is still re-rendered beside its story, and resolves by its md path', async () => {
	const repo = mkRepo();
	try {
		seedStandaloneLldOnly(repo);
		// A record as the old writer left it: no `standalone`, no `sizeClass`.
		writeFileSync(join(artifactsDir(repo), `BUILD-${HASH}-s1.json`), JSON.stringify({
			meta: { workflow: 'build', epicHash: HASH, storyId: 's1', createdAt: '2026-07-20T00:00:00.000Z', updatedAt: '2026-07-20T00:00:00.000Z' },
			body: { tasks: [{ id: 's1', passed: true }] },
		}, null, 2));
		// Any later write re-renders it — completion is the one an approval triggers.
		const paths = await ensureBuildRecordOnCompletion(repo, { epicHash: HASH, storyId: 's1' }, async () => []);
		const expected = buildArtifactPaths(repo, HASH, 's1', CREATED_AT, 'standalone', 'tag-filtering').md;
		assert.equal(paths?.md, expected, 'anchored on the LLD, not on the record\'s own (different) createdAt');
		assert.ok(existsSync(expected));
		// Where the old derivation put it: epic split, raw-hash label, the record's own date.
		assert.ok(!existsSync(buildArtifactPaths(repo, HASH, 's1', '2026-07-20T00:00:00.000Z', 'epic').md),
			'nothing is written to the docs/epics/<hash>-E<own date>/ folder');
		// The marker is what makes the md resolvable: without it this throws.
		assert.equal(jsonPathForMd(expected), join(artifactsDir(repo), `BUILD-${HASH}-s1.json`));
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------------------
// validate — daemon-run checks + read-only judge (ISSUE-f1bf0fb3, task t4)
// ---------------------------------------------------------------------------

const FAILED_TYPECHECK: ValidationCheckResults = {
	...PASSING_CHECKS,
	typecheck: { ok: false, command: 'npx tsc --noEmit', exitCode: 2, timedOut: false, durationMs: 1, outputTail: 'src/x.ts(1,1): error TS2345' },
};

/** Run `body` with the given check runner installed, restoring the passing one after. */
async function withChecks<T>(runner: (repo: string, plan: ValidationCheckPlan) => Promise<ValidationCheckResults>, body: () => Promise<T>): Promise<T> {
	_setBuildValidateCheckRunnerForTests(runner);
	try { return await body(); } finally { _setBuildValidateCheckRunnerForTests(async () => PASSING_CHECKS); }
}

function planRepo(): string {
	const repo = mkRepo();
	seedDef(repo);
	seedLld(repo);
	seedPlan(repo, true);
	return repo;
}

function buildRecordExists(repo: string): boolean {
	return existsSync(join(artifactsDir(repo), `BUILD-${HASH}-s1.json`));
}

test('validate runs the checks before the judge and overwrites testsPassed and typecheckClean from the daemon results', async () => {
	const repo = planRepo();
	const order: string[] = [];
	try {
		_setBuildValidateProviderForTests({
			async runReviewSession<T>() {
				order.push('judge');
				// The judge claims the tests failed; the daemon's results say they passed.
				return judgeVerdict({ passed: true, testsPassed: false, typecheckClean: false }) as T;
			},
		});
		const out = await withChecks(async () => { order.push('checks'); return PASSING_CHECKS; },
			async () => outputOf(await handleBuildStep({ phase: 'validate', target: 's1/t1', repo })));
		assert.deepEqual(order, ['checks', 'judge']);
		const verdict = out['verdict'] as Record<string, unknown>;
		assert.equal(verdict['testsPassed'], true);
		assert.equal(verdict['typecheckClean'], true);
		assert.equal(out['passed'], true);
		// The evidence is the daemon's results, and now also names the Story's test record.
		assert.deepEqual(verdict['evidence'], { ...PASSING_CHECKS, testRecord: 'docs/epics/tag-filtering-E20260718a3f4b8c9/S001/TESTS.md' });
	} finally {
		_setBuildValidateProviderForTests(undefined);
		rmSync(repo, { recursive: true, force: true });
	}
});

test('a judge passed:true with a failing typecheck gives passed:false', async () => {
	const repo = planRepo();
	try {
		_setBuildValidateProviderForTests({ async runReviewSession<T>() { return judgeVerdict({ passed: true }) as T; } });
		const out = await withChecks(async () => FAILED_TYPECHECK,
			async () => outputOf(await handleBuildStep({ phase: 'validate', target: 's1/t1', repo })));
		assert.equal(out['next'], 'done');
		assert.equal(out['passed'], false);
		const verdict = out['verdict'] as Record<string, unknown>;
		assert.equal(verdict['typecheckClean'], false);
		assert.match(String(verdict['reason']), /typecheck/);
		const rec = JSON.parse(readFileSync(join(artifactsDir(repo), `BUILD-${HASH}-s1.json`), 'utf8')) as { body: { tasks: { passed: boolean }[] } };
		assert.equal(rec.body.tasks[0]?.passed, false, 'the BUILD record follows the combined passed');
	} finally {
		_setBuildValidateProviderForTests(undefined);
		rmSync(repo, { recursive: true, force: true });
	}
});

test('a judge timeout returns verdict-session-timeout and writes no BUILD record', async () => {
	const repo = planRepo();
	try {
		_setBuildValidateProviderForTests({ async runReviewSession<T>(): Promise<T> { throw new ReviewSessionTimeoutError(300_000); } });
		const out = outputOf(await handleBuildStep({ phase: 'validate', target: 's1/t1', repo }));
		assert.equal(out['next'], 'error');
		assert.equal((out['error'] as { code: string }).code, 'verdict-session-timeout');
		assert.equal(buildRecordExists(repo), false);
	} finally {
		_setBuildValidateProviderForTests(undefined);
		rmSync(repo, { recursive: true, force: true });
	}
});

test('the validate judge is called through runReviewSession with the repo as cwd and a verdict schema', async () => {
	const repo = planRepo();
	let seen: { prompt: string; schema: Record<string, unknown>; cwd: string; deadlineMs: number } | undefined;
	try {
		_setBuildValidateProviderForTests({
			async runReviewSession<T>(prompt: string, schema: Readonly<Record<string, unknown>>, opts: { cwd: string; deadlineMs: number }) {
				seen = { prompt, schema: { ...schema }, cwd: opts.cwd, deadlineMs: opts.deadlineMs };
				return judgeVerdict({}) as T;
			},
		});
		await withChecks(async () => FAILED_TYPECHECK, async () => handleBuildStep({ phase: 'validate', target: 's1/t1', repo }));
		assert.ok(seen);
		assert.equal(seen.cwd, repo);
		assert.ok(seen.deadlineMs > 0);
		assert.deepEqual(seen.schema['required'], ['taskId', 'passed', 'checks', 'scopeRespected', 'reason']);
		assert.match(seen.prompt, /## Check results \(run by the daemon\)/);
		assert.match(seen.prompt, /Typecheck: FAILED/);
		assert.match(seen.prompt, /error TS2345/);
	} finally {
		_setBuildValidateProviderForTests(undefined);
		rmSync(repo, { recursive: true, force: true });
	}
});

test('a judge object without a boolean passed gives unparseable-verdict', async () => {
	const repo = planRepo();
	try {
		_setBuildValidateProviderForTests({ async runReviewSession<T>() { return { taskId: 't1', checks: [], scopeRespected: true, reason: 'x' } as T; } });
		let out = outputOf(await handleBuildStep({ phase: 'validate', target: 's1/t1', repo }));
		assert.equal((out['error'] as { code: string }).code, 'unparseable-verdict');
		assert.match((out['error'] as { message: string }).message, /passed/);

		_setBuildValidateProviderForTests({ async runReviewSession<T>(): Promise<T> { throw new Error('claude returned no structured_output'); } });
		out = outputOf(await handleBuildStep({ phase: 'validate', target: 's1/t1', repo }));
		assert.equal((out['error'] as { code: string }).code, 'unparseable-verdict');
		assert.equal(buildRecordExists(repo), false);
	} finally {
		_setBuildValidateProviderForTests(undefined);
		rmSync(repo, { recursive: true, force: true });
	}
});

test('a non-timeout judge error gives verdict-session-failed and writes no BUILD record', async () => {
	const repo = planRepo();
	try {
		_setBuildValidateProviderForTests({ async runReviewSession<T>(): Promise<T> { throw new Error('claude exited with 1: error: unknown option --tools'); } });
		const out = outputOf(await handleBuildStep({ phase: 'validate', target: 's1/t1', repo }));
		assert.equal(out['next'], 'error');
		assert.equal((out['error'] as { code: string }).code, 'verdict-session-failed');
		assert.match((out['error'] as { message: string }).message, /unknown option/);
		assert.equal(buildRecordExists(repo), false);
	} finally {
		_setBuildValidateProviderForTests(undefined);
		rmSync(repo, { recursive: true, force: true });
	}
});

test('plan-driven and standalone validate each hand the check runner the plan for their route', async () => {
	const plans: ValidationCheckPlan[] = [];
	const record = async (_repo: string, plan: ValidationCheckPlan): Promise<ValidationCheckResults> => { plans.push(plan); return PASSING_CHECKS; };
	_setBuildValidateProviderForTests({ async runReviewSession<T>() { return judgeVerdict({}) as T; } });
	const planDriven = planRepo();
	const small = mkRepo();
	const trivial = mkRepo();
	try {
		seedStandaloneLldOnly(small);
		await withChecks(record, async () => {
			await handleBuildStep({ phase: 'validate', target: 's1/t1', repo: planDriven });
			await handleBuildStep({ phase: 'validate', target: 's1', repo: small, standalone: { standalone: true, epicHash: HASH, storyId: 's1', sizeClass: 'small' } });
			await handleBuildStep({ phase: 'validate', target: 's1', repo: trivial, standalone: { standalone: true, storyId: 's1', sizeClass: 'trivial', focus: 'tidy a comment' } });
		});
		assert.equal(plans.length, 3);
		// Plan-driven: the task's named test, which carries no '<file>.test.ts:' prefix.
		assert.deepEqual(plans[0]?.unresolvedTests, ['unit: filter narrows results']);
		// Small: an LLD with no test strategy names no test file.
		assert.deepEqual(plans[1]?.noTests, { ok: false, note: 'the LLD names no test file' });
		// Trivial: no git history in the fixture, so no tests, which a trivial build allows.
		assert.equal(plans[2]?.noTests?.ok, true);
		for (const plan of plans) assert.ok(plan.testCommand.includes('--test-force-exit'));
	} finally {
		_setBuildValidateProviderForTests(undefined);
		for (const r of [planDriven, small, trivial]) rmSync(r, { recursive: true, force: true });
	}
});

// ---------------------------------------------------------------------------
// ISSUE-f9ced66a (LLD-f9ced66a-s1, task t7): no build turn runs on top of an
// uncommitted merge.
// ---------------------------------------------------------------------------

test('implement and validate return merge-in-progress while a merge is uncommitted', async () => {
	const repo = mkRepo();
	const git = (...args: string[]): void => { execFileSync('git', args, { cwd: repo, stdio: 'ignore' }); };
	try {
		git('init', '-q', '-b', 'main');
		git('config', 'user.email', 'test@insrc.local');
		git('config', 'user.name', 'insrc-test');
		git('config', 'commit.gpgsign', 'false');
		writeFileSync(join(repo, 'base.ts'), 'export const v = 0;\n');
		git('add', 'base.ts'); git('commit', '-qm', 'base');
		git('checkout', '-q', '-b', 'upstream');
		writeFileSync(join(repo, 'upstream.ts'), 'export const u = 1;\n');
		git('add', 'upstream.ts'); git('commit', '-qm', 'upstream work');
		git('checkout', '-q', 'main');
		seedDef(repo);
		seedLld(repo);
		seedPlan(repo, true);
		git('merge', '-q', '--no-ff', '--no-commit', 'upstream');

		const calls: ReadonlyArray<{ readonly phase: string; readonly [k: string]: unknown }> = [
			{ phase: 'implement', target: 's1/t1', repo },
			{ phase: 'validate',  target: 's1/t1', repo },
			{ phase: 'implement', target: 'standalone', repo, standalone: { standalone: true, sizeClass: 'trivial', focus: 'x' } },
			{ phase: 'validate',  target: 'standalone', repo, standalone: { standalone: true, sizeClass: 'trivial', focus: 'x' } },
		];
		for (const call of calls) {
			const out = outputOf(await handleBuildStep(call));
			assert.equal(out['next'], 'error', `${call.phase} refuses: ${JSON.stringify(out)}`);
			const error = out['error'] as { code: string; retryable: boolean; message: string };
			assert.equal(error.code, 'merge-in-progress');
			assert.equal(error.retryable, true);
			assert.match(error.message, /Commit the merge on its own/);
		}
		// Nothing was written while refusing: no build-start stamp, no BUILD record.
		assert.equal(existsSync(join(repo, '.insrc', 'build-start')), false);
		assert.equal(readdirSync(artifactsDir(repo)).some(f => f.startsWith('BUILD-')), false);

		git('commit', '-qm', 'merge upstream');
		const after = outputOf(await handleBuildStep({ phase: 'implement', target: 's1/t1', repo }));
		assert.equal(after['next'], 'implement', 'once the merge is committed the turn runs');
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------------------
// The builder's mapping and the Story's test record at the validate turn
// (LLD-9b4a74dc-S001, tasks t8 to t10)
// ---------------------------------------------------------------------------

const FILTER_TEST = 'src/a/__tests__/filter.test.ts';
const OTHER_TEST = 'src/a/__tests__/other.test.ts';
const T_UNIT = 'the filter narrows results by tag';
const T_LIVE = 'the filter works against the running daemon';
const TR_ROOT = 'docs/epics/tag-filtering-E20260718a3f4b8c9/S001';

/** A plan-driven Story in a git repo: Task t1 names one unit and one live test
 *  in prose, and two test files are tracked. */
function mappedRepo(tests: readonly { level: string; name: string }[] = [{ level: 'unit', name: T_UNIT }, { level: 'live', name: T_LIVE }]): string {
	const repo = mkRepo();
	seedDef(repo);
	seedLld(repo);
	const json = join(artifactsDir(repo), `${planArtifactId(HASH, 's1')}.json`);
	writeFileSync(json, JSON.stringify({
		meta: { workflow: 'plan', runId: 'plan-run-1', schemaVersion: 1, epicHash: HASH, epicSlug: 'tag-filtering', storyId: 's1', createdAt: CREATED_AT, lldRunId: 'lld-run-1', lldEffectiveHash: 'basis-hash-xyz' },
		body: { tasks: [
			{ id: 't1', title: 'Wire the filter', summary: 's', size: 'M', order: 1, dependsOn: [], acceptanceChecks: ['a'], derivedFrom: ['c1'], tests },
			{ id: 't2', title: 'Another', summary: 's', size: 'S', order: 2, dependsOn: ['t1'], acceptanceChecks: ['a'], derivedFrom: ['c1'], tests: [{ level: 'unit', name: 'the second task works' }] },
		] },
		citations: [{ id: 'c1', kind: 'prior-artifact', ref: 'LLD' }],
	}, null, 2));
	approveArtifactByJsonPath(json);
	for (const [rel, body] of [
		[FILTER_TEST, "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\ntest('narrows by one tag', () => {});\ntest('narrows by two tags', () => {});\ntest('breaks on an empty tag', () => { assert.fail('boom'); });\n"],
		[OTHER_TEST, "import { test } from 'node:test';\ntest('another case', () => {});\n"],
	] as const) {
		mkdirSync(dirname(join(repo, rel)), { recursive: true });
		writeFileSync(join(repo, rel), body);
	}
	const git = (...args: string[]): void => { execFileSync('git', args, { cwd: repo, stdio: 'ignore' }); };
	git('init', '-q');
	git('config', 'user.email', 'test@insrc.local');
	git('config', 'user.name', 'insrc-test');
	git('add', '.');
	git('commit', '-qm', 'baseline');
	return repo;
}

/** Results as the real runner would give for a plan, every mapped case with `result`. */
function resultsFor(plan: ValidationCheckPlan, result: 'pass' | 'fail' = 'pass'): ValidationCheckResults {
	const namedTests = plan.namedTests.map(n => ({
		name: n.name, ...(n.level !== undefined ? { level: n.level } : {}), source: n.source,
		cases: n.cases.map(c => ({ ...c, result })), files: n.source === 'mapping' ? [] : [...n.files],
		...(n.reported !== undefined ? { reported: n.reported } : {}),
	}));
	const ok = result === 'pass' && plan.unresolvedTests.length === 0;
	return {
		typecheck: PASSING_CHECKS.typecheck,
		tests: {
			ok, command: plan.testFiles.map(f => `run ${f}`).join('\n'), exitCode: ok ? 0 : 1, timedOut: false, durationMs: 5, outputTail: '',
			files: plan.testFiles.map(file => ({ file, command: `run ${file}`, exitCode: result === 'pass' ? 0 : 1, timedOut: false, durationMs: 5, titles: plan.namedTests.flatMap(n => n.cases.filter(c => c.file === file).map(c => ({ title: c.title, depth: 0, result }))) })),
			namedTests,
		},
	};
}

interface Turn { out: Record<string, unknown>; plans: ValidationCheckPlan[]; judged: number }
/** One validate turn of Task t1 (or `target`), recording the plans the runner was given and the judge calls. */
async function turn(repo: string, input: Record<string, unknown>, opts: { result?: 'pass' | 'fail'; judge?: () => unknown; runner?: (repo: string, plan: ValidationCheckPlan) => Promise<ValidationCheckResults> } = {}): Promise<Turn> {
	const plans: ValidationCheckPlan[] = [];
	let judged = 0;
	_setBuildValidateProviderForTests({
		async runReviewSession<T>() { judged += 1; return (opts.judge !== undefined ? opts.judge() : judgeVerdict({ passed: true })) as T; },
	});
	try {
		const out = await withChecks(
			async (r, plan) => { plans.push(plan); return opts.runner !== undefined ? opts.runner(r, plan) : resultsFor(plan, opts.result ?? 'pass'); },
			async () => outputOf(await handleBuildStep({ phase: 'validate', target: 's1/t1', repo, ...input } as never)),
		);
		return { out, plans, judged };
	} finally { _setBuildValidateProviderForTests(undefined); }
}

const testsJson = (repo: string): string => join(artifactsDir(repo), `TESTS-${HASH}-s1.json`);
const readTests = (repo: string): { meta: Record<string, unknown>; body: { tasks: { taskId: string; commit?: string; ranAt: string; testsPassed: boolean; tests: { name: string; source: string; cases: { file: string; title: string; result: string }[]; reported?: unknown }[] }[] } } =>
	JSON.parse(readFileSync(testsJson(repo), 'utf8')) as never;
const GOOD_MAPPING = [
	{ name: T_UNIT, cases: [{ file: FILTER_TEST, title: 'narrows by one tag' }, { file: FILTER_TEST, title: 'narrows by two tags' }] },
	{ name: T_LIVE, reported: { result: 'pass', evidence: 'run 12, in the build record' } },
];

test("a validate turn with a wrong mapping returns 'invalid-test-mapping', runs no check, calls no judge and writes neither record", async () => {
	const repo = mappedRepo();
	try {
		const { out, plans, judged } = await turn(repo, { tests: [
			{ name: 'not a test of this Task', cases: [{ file: FILTER_TEST, title: 't' }] },
			{ name: T_UNIT, cases: [{ file: 'src/a/__tests__/untracked.test.ts', title: 't' }] },
			{ name: T_UNIT, reported: { result: 'pass', evidence: 'trust me' } },
		] });
		assert.equal(out['next'], 'error');
		const error = out['error'] as { code: string; message: string };
		assert.equal(error.code, 'invalid-test-mapping');
		// Every fault is listed.
		assert.match(error.message, /'not a test of this Task' is not a test this Task names/);
		assert.match(error.message, /'src\/a\/__tests__\/untracked\.test\.ts' is not a tracked '\.test\.ts' file/);
		assert.match(error.message, /'the filter narrows results by tag' is named more than once/);
		assert.match(error.message, /only for a 'live' or 'smoke' test/);
		assert.deepEqual([plans.length, judged], [0, 0], 'no check was run and no judge was called');
		assert.equal(existsSync(testsJson(repo)), false);
		assert.equal(buildRecordExists(repo), false);
		assert.equal(existsSync(join(repo, 'docs')), false, 'no document was written either');
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('a second validate turn of the same Task with no mapping uses the stored one (mutation: fall back to the prefix rule when a stored mapping exists)', async () => {
	const repo = mappedRepo();
	try {
		// With no mapping at all, the prose names resolve to nothing.
		const bare = await turn(repo, {});
		assert.deepEqual(bare.plans[0]!.unresolvedTests, [T_UNIT, T_LIVE]);
		assert.deepEqual(bare.plans[0]!.testFiles, []);
		assert.equal((bare.out['verdict'] as Record<string, unknown>)['testsPassed'], false);

		const first = await turn(repo, { tests: GOOD_MAPPING });
		assert.deepEqual(first.plans[0]!.testFiles, [FILTER_TEST]);
		assert.deepEqual(first.plans[0]!.unresolvedTests, []);
		assert.equal((first.out['verdict'] as Record<string, unknown>)['testsPassed'], true);

		// The second turn supplies nothing, and is planned from the stored mapping.
		const second = await turn(repo, {});
		assert.deepEqual(second.plans[0]!.namedTests, first.plans[0]!.namedTests);
		assert.deepEqual(second.plans[0]!.testFiles, [FILTER_TEST]);
		assert.deepEqual(second.plans[0]!.unresolvedTests, []);
		assert.equal((second.out['verdict'] as Record<string, unknown>)['testsPassed'], true);
		// Another Task of the Story has no stored mapping of its own.
		const other = await turn(repo, { target: 's1/t2' });
		assert.deepEqual(other.plans[0]!.unresolvedTests, ['the second task works']);
		// A supplied mapping replaces the stored one.
		const third = await turn(repo, { tests: [{ name: T_UNIT, cases: [{ file: OTHER_TEST, title: 'another case' }] }, GOOD_MAPPING[1]] });
		assert.deepEqual(third.plans[0]!.testFiles, [OTHER_TEST]);
		assert.deepEqual((await turn(repo, {})).plans[0]!.testFiles, [OTHER_TEST]);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('a stored mapping whose file is gone gives that case not found and a failed check, and the turn is not refused', async () => {
	const repo = mappedRepo([{ level: 'unit', name: T_UNIT }]);
	// The REAL runner, with node standing in for npx: the result must come from a run.
	const { runValidationChecks } = await import('../validation-checks.js');
	const runner = (r: string, plan: ValidationCheckPlan): Promise<ValidationCheckResults> =>
		runValidationChecks(r, { ...plan, typecheck: ['node', '-e', 'process.exit(0)'], testCommand: ['node', '--experimental-strip-types', '--test', '--test-force-exit'] });
	try {
		const mapping = [{ name: T_UNIT, cases: [{ file: FILTER_TEST, title: 'narrows by one tag' }, { file: OTHER_TEST, title: 'another case' }] }];
		const first = await turn(repo, { tests: mapping }, { runner });
		assert.deepEqual(readTests(repo).body.tasks[0]!.tests[0]!.cases.map(c => c.result), ['pass', 'pass']);
		// FILTER_TEST holds a failing test outside the named cases, so its file fails the check.
		assert.equal((first.out['verdict'] as Record<string, unknown>)['testsPassed'], false);

		// The second file is deleted and the deletion committed; the next turn supplies no mapping.
		execFileSync('git', ['rm', '-q', OTHER_TEST], { cwd: repo });
		execFileSync('git', ['commit', '-qm', 'remove a test file'], { cwd: repo, stdio: 'ignore' });
		const second = await turn(repo, {}, { runner });
		assert.equal(second.out['next'], 'done', 'the turn is not refused: the builder supplied nothing wrong on it');
		assert.equal(second.judged, 1);
		const cases = readTests(repo).body.tasks[0]!.tests[0]!.cases;
		assert.deepEqual(cases.map(c => [c.file, c.result]), [[FILTER_TEST, 'pass'], [OTHER_TEST, 'not found']]);
		assert.equal((second.out['verdict'] as Record<string, unknown>)['testsPassed'], false);
		// The same mapping SUPPLIED on a turn is refused, since the file is no longer tracked.
		const supplied = await turn(repo, { tests: mapping }, { runner });
		assert.equal((supplied.out['error'] as { code: string }).code, 'invalid-test-mapping');
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test("the builder's reported results never set testsPassed: a mapping of reported passes with a failing mapped case still fails", async () => {
	const repo = mappedRepo();
	try {
		const failing = await turn(repo, { tests: GOOD_MAPPING }, { result: 'fail', judge: () => judgeVerdict({ passed: true, testsPassed: true }) });
		const verdict = failing.out['verdict'] as Record<string, unknown>;
		assert.equal(verdict['testsPassed'], false);
		assert.equal(failing.out['passed'], false);
		assert.match(String(verdict['reason']), /the daemon's checks failed: tests/);
		// The reported pass is recorded as reported, and the record's testsPassed is the gate's.
		const task = readTests(repo).body.tasks[0]!;
		assert.equal(task.testsPassed, false);
		assert.deepEqual(task.tests[1]!.reported, { result: 'pass', evidence: 'run 12, in the build record' });
		assert.deepEqual(task.tests[1]!.cases, []);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test("the build tool's registered input shape accepts `tests` on the validate phase, refuses an entry or a case with a key the shape does not have, and the schema lookup returns the field", async () => {
	const { buildInsrcMcpServerWithRegistry } = await import('../../server.js');
	const { handleInsrcSchema } = await import('../../schema/handler.js');
	const { z } = await import('zod');
	const { schemaRegistry } = buildInsrcMcpServerWithRegistry();
	const shape = z.object(schemaRegistry.get('insrc_build_step')!.rawShape);
	const call = (tests: unknown) => shape.safeParse({ phase: 'validate', target: 's1/t1', tests });

	assert.equal(call(GOOD_MAPPING).success, true);
	assert.equal(call(undefined).success, true, 'the field is optional');
	assert.equal(call([]).success, true);
	// A key the shape does not have, on an entry, a case and a reported result.
	assert.equal(call([{ name: T_UNIT, cases: [{ file: FILTER_TEST, title: 't' }], mutations: [] }]).success, false);
	assert.equal(call([{ planTest: T_UNIT, cases: [{ file: FILTER_TEST, title: 't' }] }]).success, false);
	assert.equal(call([{ name: T_UNIT, cases: [{ file: FILTER_TEST, title: 't', line: 3 }] }]).success, false);
	assert.equal(call([{ name: T_LIVE, reported: { result: 'pass', evidence: 'e', by: 'me' } }]).success, false);
	assert.equal(call([{ name: T_LIVE, reported: { result: 'maybe', evidence: 'e' } }]).success, false);
	assert.equal(call([{ name: T_UNIT, cases: [{ file: FILTER_TEST, title: '' }] }]).success, false);

	const looked = handleInsrcSchema({ tool: 'insrc_build_step', phase: 'validate' }, schemaRegistry) as { schema: { properties: Record<string, { items?: { additionalProperties?: boolean; properties?: Record<string, unknown> } }> } };
	const field = looked.schema.properties['tests']!;
	assert.deepEqual(Object.keys(field.items!.properties!).sort(), ['cases', 'name', 'reported']);
	assert.equal(field.items!.additionalProperties, false);
});

test("a validate turn with a mapping writes the test record, the build record links to it, the change log leaves out both records' files, and the verdict's evidence carries the cases with their results and the record's path", async () => {
	const repo = mappedRepo();
	try {
		// The Story's work: one staged source file, so the change log has something real in it.
		writeFileSync(join(repo, 'src', 'filter.ts'), 'export const f = 1;\n');
		execFileSync('git', ['add', 'src/filter.ts'], { cwd: repo });
		const { out } = await turn(repo, { tests: GOOD_MAPPING });
		assert.equal(out['passed'], true);

		// The test record: this Task's entry, case by case, with the commit and time of the run.
		const rec = readTests(repo);
		assert.deepEqual([rec.meta['workflow'], rec.meta['epicHash'], rec.meta['storyId'], rec.meta['standalone']], ['tests', HASH, 's1', undefined]);
		const task = rec.body.tasks[0]!;
		assert.equal(task.taskId, 't1');
		assert.match(task.commit ?? '', /^[0-9a-f]{7,}$/);
		assert.equal(task.testsPassed, true);
		assert.deepEqual(task.tests.map(t => [t.name, t.source, t.cases.map(c => `${c.result} ${c.title}`)]), [
			[T_UNIT, 'mapping', ['pass narrows by one tag', 'pass narrows by two tags']],
			[T_LIVE, 'mapping', []],
		]);
		const testsMd = join(repo, TR_ROOT, 'TESTS.md');
		assert.ok(existsSync(testsMd));
		assert.match(readFileSync(testsMd, 'utf8'), /\| pass \| narrows by one tag \| `src\/a\/__tests__\/filter\.test\.ts` \|/);

		// The build record links to it, and is filed beside it.
		const build = readBuildRecord(repo);
		assert.deepEqual(build.body['testRecord'], { md: `${TR_ROOT}/TESTS.md` });
		const buildMd = join(repo, TR_ROOT, 'BUILD.md');
		assert.match(readFileSync(buildMd, 'utf8'), /\*\*Tests:\*\* \[TESTS\.md\]\(TESTS\.md\)/);
		// The change log holds the Story's work and neither record.
		assert.deepEqual(changeFiles(build), ['src/filter.ts']);

		// The verdict's evidence: the cases with their results, and the record's path.
		const evidence = (out['verdict'] as { evidence: { testRecord?: string; tests: { namedTests: { name: string; cases: { result: string }[] }[] } } }).evidence;
		assert.equal(evidence.testRecord, `${TR_ROOT}/TESTS.md`);
		assert.deepEqual(evidence.tests.namedTests[0]!.cases.map(c => c.result), ['pass', 'pass']);

		// Both records are committed, as they are after a Task in a real build. The
		// next turn rewrites all four files, so they are dirty TRACKED files: left
		// in, they would be the change log.
		execFileSync('git', ['add', '.insrc', 'docs'], { cwd: repo });
		execFileSync('git', ['commit', '-qm', 'the records after t1', '--', '.insrc', 'docs'], { cwd: repo, stdio: 'ignore' });

		// A second Task's turn adds its entry and leaves the first as it was.
		const t1Before = JSON.stringify(readTests(repo).body.tasks[0]);
		await turn(repo, { target: 's1/t2', tests: [{ name: 'the second task works', cases: [{ file: OTHER_TEST, title: 'another case' }] }] });
		assert.deepEqual(readTests(repo).body.tasks.map(t => t.taskId), ['t1', 't2']);
		assert.equal(JSON.stringify(readTests(repo).body.tasks[0]), t1Before);
		const dirty = execFileSync('git', ['status', '--porcelain'], { cwd: repo, encoding: 'utf8' }).split('\n').filter(l => l.length > 0).map(l => l.slice(3)).sort();
		assert.deepEqual(dirty, [`.insrc/artifacts/BUILD-${HASH}-s1.json`, `.insrc/artifacts/TESTS-${HASH}-s1.json`, `${TR_ROOT}/BUILD.md`, `${TR_ROOT}/TESTS.md`, 'src/filter.ts'].sort(),
			'precondition: all four record files are dirty tracked files');
		assert.deepEqual(changeFiles(readBuildRecord(repo)), ['src/filter.ts']);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test("when the test record cannot be written the verdict is returned unchanged with a note; on a first turn the build record carries no testRecord, and on a second turn the record on disk still shows the first run with its commit and time (mutation: let the write's error escape)", async () => {
	const { _setBuildValidateTestRecordWriterForTests, _setBuildValidateClockForTests } = await import('../phases/validate.js');
	const failingWriter = (): never => { throw new Error('disk full'); };
	// First turn: nothing on disk, and the write fails.
	const first = mappedRepo();
	try {
		_setBuildValidateTestRecordWriterForTests(failingWriter);
		const { out, judged } = await turn(first, { tests: GOOD_MAPPING });
		assert.equal(out['next'], 'done');
		assert.equal(out['passed'], true, 'the verdict is what it would have been');
		assert.equal(judged, 1);
		const evidence = (out['verdict'] as { evidence: Record<string, unknown> }).evidence;
		assert.match(String(evidence['testRecordNote']), /the test record was not written \(disk full\)/);
		assert.equal(evidence['testRecord'], undefined);
		assert.equal(existsSync(testsJson(first)), false);
		assert.ok(!('testRecord' in readBuildRecord(first).body), 'no link to a record that does not exist');
	} finally { _setBuildValidateTestRecordWriterForTests(undefined); rmSync(first, { recursive: true, force: true }); }

	// Second turn: the first run is on disk, and the second run's write fails.
	const second = mappedRepo();
	try {
		_setBuildValidateClockForTests(() => '2026-03-01T10:00:00.000Z');
		await turn(second, { tests: GOOD_MAPPING });
		const onDisk = readFileSync(testsJson(second), 'utf8');
		_setBuildValidateClockForTests(() => '2026-03-02T10:00:00.000Z');
		_setBuildValidateTestRecordWriterForTests(failingWriter);
		const { out } = await turn(second, { tests: GOOD_MAPPING }, { result: 'fail' });
		assert.equal(out['next'], 'done');
		assert.equal((out['verdict'] as Record<string, unknown>)['testsPassed'], false, 'the verdict is from THIS run');
		const evidence = (out['verdict'] as { evidence: Record<string, unknown> }).evidence;
		assert.match(String(evidence['testRecordNote']), /still shows this Task's earlier run, with that run's commit and time/);
		// The record on disk is the first run's, untouched, with its own time and result.
		assert.equal(readFileSync(testsJson(second), 'utf8'), onDisk);
		assert.deepEqual([readTests(second).body.tasks[0]!.ranAt, readTests(second).body.tasks[0]!.testsPassed], ['2026-03-01T10:00:00.000Z', true]);
		// The build record still links to it: the link carries no results, so it is still true.
		assert.deepEqual(readBuildRecord(second).body['testRecord'], { md: `${TR_ROOT}/TESTS.md` });
		assert.deepEqual((readBuildRecord(second).body['tasks'] as { id: string; passed: boolean }[]), [{ id: 't1', passed: false }]);
	} finally {
		_setBuildValidateTestRecordWriterForTests(undefined);
		_setBuildValidateClockForTests(undefined);
		rmSync(second, { recursive: true, force: true });
	}
});

test("when the judge session throws after the checks ran, the turn returns the same error as before, the test record holds this run's results with testsPassed from the tests check and the supplied mapping, and the build record is not written (mutation: write the test record in the build record's write, after the judge)", async () => {
	for (const [thrown, code] of [
		[new ReviewSessionTimeoutError('too slow'), 'verdict-session-timeout'],
		[new Error('no structured_output in the reply'), 'unparseable-verdict'],
		[new Error('the CLI exited with 1'), 'verdict-session-failed'],
	] as const) {
		const repo = mappedRepo();
		try {
			const { out, plans } = await turn(repo, { tests: GOOD_MAPPING }, { result: 'fail', judge: () => { throw thrown; } });
			assert.equal(out['next'], 'error');
			assert.equal((out['error'] as { code: string }).code, code);
			assert.equal(plans.length, 1, 'the checks ran');
			// The test record is there, with this run's results and the supplied mapping.
			const task = readTests(repo).body.tasks[0]!;
			assert.equal(task.testsPassed, false);
			assert.deepEqual(task.tests[0]!.cases.map(c => `${c.result} ${c.title}`), ['fail narrows by one tag', 'fail narrows by two tags']);
			assert.ok(existsSync(join(repo, TR_ROOT, 'TESTS.md')));
			// The build record is not written, as before.
			assert.equal(buildRecordExists(repo), false);
			// A second turn needs no mapping: it is planned from the stored one.
			const again = await turn(repo, {});
			assert.deepEqual(again.plans[0]!.testFiles, [FILTER_TEST]);
		} finally { rmSync(repo, { recursive: true, force: true }); }
	}
	// A judge answer that is not a verdict at all ends the same way.
	const repo = mappedRepo();
	try {
		const { out } = await turn(repo, { tests: GOOD_MAPPING }, { judge: () => ({ nonsense: true }) });
		assert.equal((out['error'] as { code: string }).code, 'unparseable-verdict');
		assert.ok(existsSync(testsJson(repo)));
		assert.equal(buildRecordExists(repo), false);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});
