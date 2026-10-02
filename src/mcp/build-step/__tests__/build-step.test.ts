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
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { handleBuildStep } from '../handler.js';
import { _setBuildValidateProviderForTests } from '../phases/validate.js';
import { approveArtifactByJsonPath } from '../../../workflow/gates.js';
import { ARTIFACTS_DIR, buildArtifactPaths, lldArtifactId, planArtifactId } from '../../../workflow/storage.js';
import { ensureBuildRecordOnCompletion } from '../../../workflow/runners/build/completion-record.js';
import { resolveStoryRangeBase } from '../../../workflow/runners/build/range-base.js';

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

test('validate: parses the JSON verdict from a stubbed CliProvider session', async () => {
	const repo = mkRepo();
	try {
		seedDef(repo);
		seedLld(repo);
		seedPlan(repo, true);
		_setBuildValidateProviderForTests({
			async runEditSession() {
				return {
					text:
						'I inspected the tree and ran the tests. Here is my verdict:\n\n' +
						'```json\n' +
						JSON.stringify({ taskId: 't1', passed: true, testsPassed: true, typecheckClean: true, scopeRespected: true, reason: 'all green' }) +
						'\n```\n',
				};
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

test('validate: failed verdict → passed:false; unparseable output → error', async () => {
	const repo = mkRepo();
	try {
		seedDef(repo);
		seedLld(repo);
		seedPlan(repo, true);
		// A trailing bare JSON object (no fence) with passed:false.
		_setBuildValidateProviderForTests({
			async runEditSession() {
				return { text: 'Verdict: {"taskId":"t1","passed":false,"reason":"test X still red"}' };
			},
		});
		let out = outputOf(await handleBuildStep({ phase: 'validate', target: 's1/t1', repo }));
		assert.equal(out['next'], 'done');
		assert.equal(out['passed'], false);

		// Unparseable → error with the raw tail.
		_setBuildValidateProviderForTests({
			async runEditSession() { return { text: 'I could not determine a verdict, sorry.' }; },
		});
		out = outputOf(await handleBuildStep({ phase: 'validate', target: 's1/t1', repo }));
		assert.equal(out['next'], 'error');
		assert.match((out['error'] as { code: string }).code, /unparseable-verdict/);
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
			async runEditSession() { return { text: '```json\n' + JSON.stringify({ taskId: 't1', passed: true }) + '\n```' }; },
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
			async runEditSession() { return { text: '```json\n' + JSON.stringify({ taskId: 't1', passed: true }) + '\n```' }; },
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
			async runEditSession() { return { text: '```json\n' + JSON.stringify({ taskId: 's1', passed: true }) + '\n```' }; },
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
			async runEditSession() { return { text: '```json\n' + JSON.stringify({ taskId: 's1', passed: true }) + '\n```' }; },
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
			async runEditSession() { return { text: '```json\n' + JSON.stringify({ taskId: 's1', passed: true }) + '\n```' }; },
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
			async runEditSession() { return { text: '```json\n' + JSON.stringify({ taskId: 's1', passed: true }) + '\n```' }; },
		});
		await handleBuildStep({
			phase: 'validate', target: 's1', repo,
			standalone: { standalone: true, epicHash: HASH, storyId: 's1', sizeClass: 'small' },
		});
		// The completion act: approve the persisted BUILD record by its json path.
		const { json } = buildArtifactPaths(repo, HASH, 's1', CREATED_AT, 'epic', 'tag-filtering');
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
			async runEditSession() { return { text: '```json\n' + JSON.stringify({ taskId: 't1', passed: true }) + '\n```' }; },
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
async function runImplementThenValidate(repo: string): Promise<{ rec: { meta: Record<string, unknown>; body: Record<string, unknown> }; md: string }> {
	_setBuildValidateProviderForTests({
		async runEditSession() { return { text: '```json\n' + JSON.stringify({ taskId: 's1', passed: true }) + '\n```' }; },
	});
	try {
		const standalone = { standalone: true as const, epicHash: HASH, storyId: 's1', sizeClass: 'trivial', focus: 'Add a --json flag to the status subcommand.' };
		const impl = outputOf(await handleBuildStep({ phase: 'implement', target: 's1', repo, standalone }));
		assert.equal(impl['next'], 'implement', 'the standalone implement phase admitted the build');
		const { json } = buildArtifactPaths(repo, HASH, 's1', CREATED_AT, 'epic', 'tag-filtering');
		const afterImpl = JSON.parse(readFileSync(json, 'utf8')) as { meta: Record<string, unknown>; body: Record<string, unknown> };
		assert.equal(afterImpl.meta['standalone'], true, 'implement wrote standalone:true — the precondition the flip destroys');
		assert.equal(afterImpl.body['focus'], 'Add a --json flag to the status subcommand.');

		const val = outputOf(await handleBuildStep({ phase: 'validate', target: 's1', repo, standalone }));
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
			async runEditSession() { return { text: '```json\n' + JSON.stringify({ taskId: 's1', passed: true }) + '\n```' }; },
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
		async runEditSession() { return { text: '```json\n' + JSON.stringify({ taskId: 's1', passed: true }) + '\n```' }; },
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
		async runEditSession() { return { text: '```json\n' + JSON.stringify({ taskId: 's1', passed: true }) + '\n```' }; },
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
