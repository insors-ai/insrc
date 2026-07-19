/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Tests for the `insrc_build_step` open-question gate (stage 3):
 *   - an LLD with 1 open question → implement returns resolve_questions.
 *   - resolve_question with a choice → persists to meta + returns ready.
 *   - re-implement injects the decision into the prompt.
 *   - the ignore path works.
 *   - questionId derivation (leading [id / verdict] tag vs sha fallback).
 *
 * The option-generating provider is stubbed. gh/git side effects are no-ops
 * in the tmp (non-git) repo.
 *
 * Run: npx tsx --test src/mcp/build-step/__tests__/question-gate.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { handleBuildStep } from '../handler.js';
import { deriveQuestionId, _setBuildQuestionProviderForTests } from '../questions.js';
import { approveArtifactByJsonPath } from '../../../workflow/gates.js';
import { ARTIFACTS_DIR, lldArtifactId, planArtifactId } from '../../../workflow/storage.js';
import type { LLMProvider } from '../../../shared/types.js';

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

function lldJsonPath(repo: string): string {
	return join(artifactsDir(repo), `${lldArtifactId(HASH, 's1')}.json`);
}

function seedLld(repo: string, openQuestions: readonly string[]): void {
	writeFileSync(lldJsonPath(repo), JSON.stringify({
		meta: {
			workflow: 'design.story', runId: 'lld-run-1', schemaVersion: 1,
			epicHash: HASH, epicSlug: 'tag-filtering', storyId: 's1',
			hldBaseRunId: 'hld-run-1', hldEffectiveHash: 'basis-hash-xyz', hldAmendmentsApplied: [],
			approvedAt: CREATED_AT,
		},
		body: {
			hldContextSlice: { frameworkSummary: 'fw', rolloutPhase: 'p1', ownedContracts: [], consumedContracts: [] },
			contractDetails: { surfaceLevel: 'module', api: [] },
			dataModelChanges: [],
			interactionWithShared: [],
			errorPaths: { errorCases: [], edgeCases: [], invariantsToPreserve: [] },
			testStrategy: { testFramework: 'node:test', testLevels: [], acceptanceMapping: [] },
			alternativesConsidered: [{ id: 'a1', name: 'Only option', oneLineSummary: 'do it', approach: 'the approach' }],
			chosenAlternative: 'a1',
			openQuestions,
		},
		citations: [{ id: 'c1', kind: 'prior-artifact', ref: 'HLD' }],
	}, null, 2));
}

function seedPlan(repo: string): void {
	const json = join(artifactsDir(repo), `${planArtifactId(HASH, 's1')}.json`);
	writeFileSync(json, JSON.stringify({
		meta: {
			workflow: 'plan', runId: 'plan-run-1', schemaVersion: 1,
			epicHash: HASH, epicSlug: 'tag-filtering', storyId: 's1',
			lldRunId: 'lld-run-1', lldEffectiveHash: 'basis-hash-xyz',
		},
		body: {
			tasks: [{
				id: 't1', title: 'Wire the filter', summary: 'Add the tag filter.',
				size: 'M', order: 1, dependsOn: [], acceptanceChecks: ['works'],
				derivedFrom: ['c1'], tests: [{ level: 'unit', name: 'unit: works' }],
			}],
		},
		citations: [{ id: 'c1', kind: 'prior-artifact', ref: 'LLD' }],
	}, null, 2));
	approveArtifactByJsonPath(json);
}

function mkRepo(): string {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-build-q-'));
	seedDef(repo);
	seedPlan(repo);
	return repo;
}

function outputOf(env: { content: { type: 'text'; text: string }[] }): Record<string, unknown> {
	return JSON.parse(env.content[0]!.text) as Record<string, unknown>;
}

/** Stub provider: returns fixed options for every question. */
function stubOptionsProvider(): LLMProvider {
	return {
		capabilities: { structuredOutput: true, toolCalling: false, vision: false, webSearch: false, streaming: false, embeddings: false },
		async complete() { return { text: '', stopReason: 'end_turn' as const }; },
		async completeStructured<T>() {
			return {
				options: [
					{ label: 'Option A', detail: 'Do it the A way.' },
					{ label: 'Option B', detail: 'Do it the B way.' },
				],
				recommendation: 'Prefer Option A.',
			} as unknown as T;
		},
		stream() { return (async function* () { /* empty */ })(); },
		async embed() { return []; },
	} as unknown as LLMProvider;
}

// ---------------------------------------------------------------------------
// questionId derivation
// ---------------------------------------------------------------------------

test('deriveQuestionId: parses a leading [id / verdict] tag; falls back to a sha', () => {
	assert.equal(deriveQuestionId('[sc2 / missed] should we cache the filter?'), 'sc2');
	const shaId = deriveQuestionId('a plain question with no tag');
	assert.match(shaId, /^q[0-9a-f]{8}$/);
	// Stable across calls.
	assert.equal(deriveQuestionId('a plain question with no tag'), shaId);
});

// ---------------------------------------------------------------------------
// implement → resolve_questions → resolve_question → ready → re-implement
// ---------------------------------------------------------------------------

test('implement gates on an unresolved question, resolve_question persists + returns ready, re-implement injects the decision', async () => {
	const repo = mkRepo();
	_setBuildQuestionProviderForTests(stubOptionsProvider());
	try {
		seedLld(repo, ['[sc2 / missed] Should the tag filter be case-insensitive?']);

		// 1) implement → resolve_questions (with generated options).
		let out = outputOf(await handleBuildStep({ phase: 'implement', target: 's1/t1', repo }));
		assert.equal(out['next'], 'resolve_questions');
		const questions = out['questions'] as { questionId: string; text: string; options: unknown[]; recommendation: string }[];
		assert.equal(questions.length, 1);
		assert.equal(questions[0]!.questionId, 'sc2');
		assert.equal(questions[0]!.options.length, 2);
		assert.match(questions[0]!.recommendation, /Option A/);

		// 2) resolve_question with a choice → ready.
		out = outputOf(await handleBuildStep({
			phase: 'resolve_question', target: 's1/t1', repo,
			questionId: 'sc2', choice: 'Case-insensitive match', rationale: 'matches user expectation',
		}));
		assert.equal(out['next'], 'ready');

		// The resolution is persisted into the LLD meta.
		const lld = JSON.parse(readFileSync(lldJsonPath(repo), 'utf8')) as {
			meta: { questionResolutions?: Record<string, { status: string; choice?: string }> };
		};
		assert.equal(lld.meta.questionResolutions!['sc2']!.status, 'resolved');
		assert.equal(lld.meta.questionResolutions!['sc2']!.choice, 'Case-insensitive match');

		// 3) re-implement → prompt, with the decision injected.
		out = outputOf(await handleBuildStep({ phase: 'implement', target: 's1/t1', repo }));
		assert.equal(out['next'], 'implement');
		const prompt = out['prompt'] as string;
		assert.match(prompt, /Resolved design decisions/);
		assert.match(prompt, /Case-insensitive match/);
	} finally {
		_setBuildQuestionProviderForTests(undefined);
		rmSync(repo, { recursive: true, force: true });
	}
});

// ---------------------------------------------------------------------------
// ignore path
// ---------------------------------------------------------------------------

test('resolve_question ignore path → status ignored + implement injects "implementer judgment"', async () => {
	const repo = mkRepo();
	_setBuildQuestionProviderForTests(stubOptionsProvider());
	try {
		seedLld(repo, ['Should we add a metrics counter?']);
		const qid = deriveQuestionId('Should we add a metrics counter?');

		let out = outputOf(await handleBuildStep({ phase: 'implement', target: 's1/t1', repo }));
		assert.equal(out['next'], 'resolve_questions');

		out = outputOf(await handleBuildStep({
			phase: 'resolve_question', target: 's1/t1', repo, questionId: qid, ignore: true,
		}));
		assert.equal(out['next'], 'ready');

		const lld = JSON.parse(readFileSync(lldJsonPath(repo), 'utf8')) as {
			meta: { questionResolutions?: Record<string, { status: string }> };
		};
		assert.equal(lld.meta.questionResolutions![qid]!.status, 'ignored');

		out = outputOf(await handleBuildStep({ phase: 'implement', target: 's1/t1', repo }));
		assert.equal(out['next'], 'implement');
		assert.match(out['prompt'] as string, /left to implementer judgment/);
	} finally {
		_setBuildQuestionProviderForTests(undefined);
		rmSync(repo, { recursive: true, force: true });
	}
});

// ---------------------------------------------------------------------------
// multiple questions — resolve one, next is returned
// ---------------------------------------------------------------------------

test('resolve_question returns the next unresolved question when more remain', async () => {
	const repo = mkRepo();
	_setBuildQuestionProviderForTests(stubOptionsProvider());
	try {
		seedLld(repo, ['[q1 / ambiguous] First?', '[q2 / missed] Second?']);

		let out = outputOf(await handleBuildStep({ phase: 'implement', target: 's1/t1', repo }));
		assert.equal(out['next'], 'resolve_questions');
		assert.equal((out['questions'] as unknown[]).length, 2);

		out = outputOf(await handleBuildStep({
			phase: 'resolve_question', target: 's1/t1', repo, questionId: 'q1', choice: 'yes',
		}));
		assert.equal(out['next'], 'resolve_questions');
		const remaining = out['questions'] as { questionId: string }[];
		assert.equal(remaining.length, 1);
		assert.equal(remaining[0]!.questionId, 'q2');
	} finally {
		_setBuildQuestionProviderForTests(undefined);
		rmSync(repo, { recursive: true, force: true });
	}
});
