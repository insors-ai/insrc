/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * A design record's body holds no feedback: the four body types declare no `feedback` field, their documents have no Feedback
 * section, no production file under src/workflow writes one, and the type guards accept a body with and without a stray key.
 * Feedback is a Feedback line of the FeedbackService, stored beside the head.
 *
 * Run: npx tsx --test src/workflow/artifacts/provenance/__tests__/body-fields.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { isDefineBody, type DefineBody } from '../../define.js';
import { isHldBody, type HldBody } from '../../hld.js';
import { isLldBody, type LldBody } from '../../lld.js';
import { isPlanBody, type PlanBody } from '../../plan.js';
import { defaultFormat } from '../../format/formats.js';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

const baseDefine: DefineBody = {
	flavor: 'enhancement', problem: 'p', nonGoals: [], assumptions: [], constraints: [], stories: [], openQuestions: [],
};
const baseHld: HldBody = {
	frameworkSummary: 'f', architectureShape: 'a', sharedContracts: [], storyBoundaries: [],
	nonFunctional: {}, rolloutOverview: { phases: [], orderingRationale: '', riskyBits: [] },
	alternativesConsidered: [], chosenAlternative: 'a1', openQuestions: [],
};
const baseLld: LldBody = {
	hldContextSlice: { frameworkSummary: 'f', ownedContracts: [], consumedContracts: [], boundary: { storyId: 's1', owns: [], depends: [], internal: '' }, adjacentBoundaries: [], rolloutPhase: 'p', nonFunctional: {} },
	contractDetails: { surfaceLevel: 'internal', api: [] },
	dataModelChanges: [], interactionWithShared: [],
	errorPaths: { errorCases: [], edgeCases: [], invariantsToPreserve: [] },
	testStrategy: { testLevels: [], acceptanceMapping: [], testFramework: 'node:test' },
	alternativesConsidered: [], chosenAlternative: 'a1', openQuestions: [],
};
const basePlan: PlanBody = { tasks: [], testStrategyCoverage: [] };

test('the body guards accept a body, and ignore a stray key a stored legacy body may still carry', () => {
	assert.equal(isDefineBody(baseDefine), true);
	assert.equal(isHldBody(baseHld), true);
	assert.equal(isLldBody(baseLld), true);
	assert.equal(isPlanBody(basePlan), true);
	const stray = [{ id: 'f1' }];
	assert.equal(isDefineBody({ ...baseDefine, feedback: stray }), true);
	assert.equal(isHldBody({ ...baseHld, feedback: stray }), true);
	assert.equal(isLldBody({ ...baseLld, feedback: stray }), true);
	assert.equal(isPlanBody({ ...basePlan, feedback: stray }), true);
});

const walk = (dir: string): string[] => readdirSync(dir).flatMap(n => {
	const p = join(dir, n);
	return statSync(p).isDirectory() ? (n === '__tests__' || n === 'convert' ? [] : walk(p)) : p.endsWith('.ts') ? [p] : [];
});

test('body-fields.test.ts: no body.feedback field is declared or written', () => {
	// no document format has a Feedback section
	for (const kind of ['define', 'hld', 'lld', 'plan'] as const) {
		const sections = defaultFormat(kind).sections.map(s => s.id);
		assert.equal(sections.includes('feedback'), false, `${kind} has no feedback section`);
	}
	// the bundled formats do not name one either
	for (const kind of ['define', 'hld', 'lld', 'plan']) {
		assert.doesNotMatch(readFileSync(join(SRC, 'assets', 'artifacts', 'formats', `${kind}.md`), 'utf8'), /id=feedback/, `${kind} format asset`);
	}
	// no production file outside the conversion declares or writes body.feedback, or keeps the writers
	const files = walk(join(SRC, 'workflow')).concat(walk(join(SRC, 'daemon')), walk(join(SRC, 'cli')), walk(join(SRC, 'mcp')));
	const offenders: string[] = [];
	for (const f of files) {
		const text = readFileSync(f, 'utf8');
		if (/body\.feedback|body\['feedback'\]|\bfeedback\?\s*:\s*FeedbackRecord|\bFeedbackRecord\b|artifact_feedback_append|\bappendFeedbackBatch\b|\bfeedbackBodyLines\b/.test(text)) offenders.push(f.slice(SRC.length + 1));
	}
	assert.deepEqual(offenders, []);
	for (const gone of ['writer.ts', 'tool.ts', 'schema.ts']) assert.equal(existsSync(join(SRC, 'workflow', 'artifacts', 'provenance', gone)), false, `provenance/${gone} is gone`);
});
