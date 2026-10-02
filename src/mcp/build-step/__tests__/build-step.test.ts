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

test('validate: persists a plan-driven BUILD ledger record (standalone:false) recording the task + passed', async () => {
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
		assert.equal(rec.meta['standalone'], false);
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

test('validate[standalone]: no plan → resolves identity from context, persists a BUILD record (standalone:false, story task)', async () => {
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
		// Byte-identical shape to the plan-driven record (k4/k5): the verdict keys
		// the story identity as its single task, standalone:false either way.
		assert.equal(rec.meta['standalone'], false);
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
//   TEST A  '## Scope' lost on the flipped record        INVERTED BY t8
//   TEST B  meta.standalone forced to false by validate  INVERTED BY t9
//   TEST C  clean tree yields an empty change set        INVERTED BY t6
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

test('CHARACTERISATION A (inverts at t8): a standalone build\'s persisted md contains NO \'## Scope\' while its json still carries body.focus', async () => {
	if (!gitAvailable()) return;   // gated: git-dependent, skips cleanly
	const repo = mkCleanGitRepo();
	try {
		seedDef(repo);
		const { rec, md } = await runImplementThenValidate(repo);

		// The orphaned-content defect: body.focus survives in the json...
		assert.equal(rec.body['focus'], 'Add a --json flag to the status subcommand.',
			'body.focus is still persisted after validate');
		// ...but the markdown renders no Scope section for it, because the record
		// flipped to the plan-driven renderer, which never reads focus.
		assert.doesNotMatch(md, /## Scope/,
			'TODAY: the rendered record drops `## Scope`, so body.focus is visible nowhere. t8 converges the renderers and INVERTS this.');
		assert.doesNotMatch(md, /## Triage rationale/,
			'TODAY: the triage rationale is dropped on the same flip. t8 INVERTS this.');
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('CHARACTERISATION B (inverts at t9): the shared validate persist forces meta.standalone to false despite implement writing true', async () => {
	if (!gitAvailable()) return;
	const repo = mkCleanGitRepo();
	try {
		seedDef(repo);
		const { rec } = await runImplementThenValidate(repo);

		// implement wrote true (asserted inside the helper); validate overwrote it.
		assert.equal(rec.meta['standalone'], false,
			'TODAY: runValidateSession writes standalone:false unconditionally on a path shared with the plan-driven branch, so a standalone record is re-labelled. t9 stops writing the flag at all and INVERTS this.');
		// CHARACTERISATION B2 — the finding that REFUTES t8's design premise.
		// Review claim p1 concluded sizeClass is safe to key the converged title on
		// because the validate path never WRITES it. Both halves of that are true
		// and the conclusion is still wrong: mergeWithPrior builds meta as
		// `{ ...rec.meta, createdAt: prior.meta.createdAt, ... }`, spreading the NEW
		// meta, so any prior-only meta field is DROPPED rather than preserved. Not
		// writing sizeClass is not enough — the merge erases it.
		assert.equal(rec.meta['sizeClass'], undefined,
			'TODAY: sizeClass is DROPPED by the validate merge, not merely unwritten. So after validate a standalone record has neither standalone:true nor a sizeClass, and t8 cannot identify it from meta at all.');
		// body, by contrast, merges ADDITIVELY — focus survives alongside tasks.
		// That asymmetry between meta and body merging is the actual mechanism.
		assert.equal(rec.body['focus'], 'Add a --json flag to the status subcommand.',
			'body keys from the prior record survive the merge, unlike meta keys');
		assert.ok(Array.isArray(rec.body['tasks']), 'and the new body keys are added');
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('CHARACTERISATION C (inverts at t6): a CLEAN working tree yields an empty changeLog and a record with no \'## Changes\' section', async () => {
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

		assert.equal(rec.body['changeLog'], undefined,
			'TODAY: the change set derives from the WORKING TREE only, which is clean exactly when the collector runs, so the key is omitted entirely. t6 derives from the Story\'s committed range and INVERTS this.');
		assert.doesNotMatch(md, /## Changes/,
			'TODAY: no `## Changes` section is rendered, and an empty result is indistinguishable from a failed one. t6 INVERTS this.');
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
