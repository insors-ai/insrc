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
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { handleBuildStep } from '../handler.js';
import { _setBuildValidateProviderForTests } from '../phases/validate.js';
import { approveArtifactByJsonPath } from '../../../workflow/gates.js';
import { ARTIFACTS_DIR, lldArtifactId, planArtifactId } from '../../../workflow/storage.js';

const HASH = 'a3f4b8c9d1e2f3a4';
const CREATED_AT = '2026-07-18T00:00:00.000Z';

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
			epicHash: HASH, epicSlug: 'tag-filtering', storyId: 's1',
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
			epicHash: HASH, epicSlug: 'tag-filtering', storyId: 's1',
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

function mkRepo(): string {
	return mkdtempSync(join(tmpdir(), 'insrc-build-step-'));
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
