/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * E20260929e2c6705f:S001 (artifact-companion-wiring) t2 — the UX content-gate
 * source-scan guard. UX_CONTENT_GATE_RULE (the HARD RULE telling the synthesizer
 * WHEN to author a `uxDefinition`) MUST be injected into every design-document
 * synthesize prompt that admits the `uxDefinition` slot, mirroring its ER twin
 * ER_CONTENT_GATE_RULE — so the author-gate can never silently drift out of a
 * prompt again (the exact class of defect this Story fixes). Plus an
 * admit-but-never-force schema check: the HLD + LLD body schemas ADMIT
 * `uxDefinition` without ever requiring it. Mirrors feedback-synth-schema.test.ts.
 *
 * Run: npx tsx --test src/workflow/__tests__/ux-synth-schema.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { Ajv } from 'ajv';

import { prepareSynthesize } from '../orchestrator.js';
import type { WorkflowIntent } from '../types.js';

const ajv = new Ajv({ allErrors: true, strict: false });
const HERE = dirname(fileURLToPath(import.meta.url));

function countMatches(src: string, re: RegExp): number {
	return (src.match(re) ?? []).length;
}

test('orchestrator.ts wires UX_CONTENT_GATE_RULE at every synthesizer prompt that admits the uxDefinition slot (source-scan)', () => {
	const src = readFileSync(resolve(HERE, '..', 'orchestrator.ts'), 'utf8');

	// (a) imported alongside the schema constant from ux-schema.js.
	assert.match(
		src,
		/import \{[^}]*\bUX_CONTENT_GATE_RULE\b[^}]*\} from '\.\/artifacts\/companion\/ux-schema\.js'/,
		'UX_CONTENT_GATE_RULE is imported from ux-schema.js',
	);

	// (b) the uxDefinition slot is admitted at exactly the two synthesizer body
	//     schemas (HLD + LLD); the gate must be injected the same number of times.
	const slotAdmissions = countMatches(src, /uxDefinition:\s*UX_DEFINITION_PROPERTY_SCHEMA/g);
	assert.equal(slotAdmissions, 2, `expected 2 uxDefinition slot admissions (HLD+LLD), saw ${slotAdmissions}`);

	// One import mention + one bare-array-element injection per synthesizer prompt.
	const totalGate = countMatches(src, /\bUX_CONTENT_GATE_RULE\b/g);
	assert.ok(
		totalGate >= slotAdmissions + 1,
		`expected UX_CONTENT_GATE_RULE at every uxDefinition-admitting prompt (+import); saw ${totalGate} for ${slotAdmissions} slots`,
	);

	// The gate is co-located with its ER twin: ER is injected at the same two
	// synthesizer prompts, so the UX injections must match — one per admitted slot.
	const erInjections = countMatches(src, /^\t+ER_CONTENT_GATE_RULE,$/gm);
	const uxInjections = countMatches(src, /^\t+UX_CONTENT_GATE_RULE,$/gm);
	assert.equal(
		uxInjections,
		slotAdmissions,
		`expected the UX gate injected once at each of the ${slotAdmissions} uxDefinition-admitting synthesizer prompts; saw ${uxInjections}`,
	);
	assert.ok(
		erInjections >= slotAdmissions,
		`the ER twin the UX gate mirrors is intact at the synthesizer prompts (saw ${erInjections} ER injections)`,
	);
});

test('both runner step-prompt builders carry the UX gate adjacent to the ER gate (source-scan)', () => {
	for (const runner of ['design-story', 'design-epic']) {
		const src = readFileSync(resolve(HERE, '..', 'runners', runner, 'index.ts'), 'utf8');
		assert.match(
			src,
			/import \{[^}]*\bUX_CONTENT_GATE_RULE\b[^}]*\} from '\.\.\/\.\.\/artifacts\/companion\/ux-schema\.js'/,
			`${runner}: UX_CONTENT_GATE_RULE is imported from ux-schema.js`,
		);
		assert.ok(
			countMatches(src, /^\t+UX_CONTENT_GATE_RULE,$/gm) >= 1,
			`${runner}: UX_CONTENT_GATE_RULE is injected as a bare array element in the step prompt`,
		);
		assert.ok(
			countMatches(src, /^\t+ER_CONTENT_GATE_RULE,$/gm) >= 1,
			`${runner}: the ER gate it mirrors is left intact`,
		);
	}
});

test('the HLD (design.epic) synthesize body schema ADMITS uxDefinition but never requires it (admit-but-never-force)', () => {
	const intent: WorkflowIntent = { workflow: 'design.epic', focus: 'x', repoPath: '/tmp/x', repoIndexedAt: null, params: {} };
	const { schema } = prepareSynthesize(intent, {});
	const bodySchema = (schema as { properties: { body: Record<string, unknown> } }).properties.body;

	assert.equal(bodySchema['additionalProperties'], false, 'body keeps additionalProperties:false');
	const props = bodySchema['properties'] as Record<string, unknown>;
	assert.ok(props['uxDefinition'] !== undefined, 'uxDefinition is an admitted body property');
	const required = (bodySchema['required'] as string[] | undefined) ?? [];
	assert.ok(!required.includes('uxDefinition'), 'uxDefinition is NOT required (content-gated, never forced)');

	// The schema itself compiles — a body carrying a uxDefinition is admitted, one without it is not forced.
	assert.doesNotThrow(() => ajv.compile(bodySchema));
});

test('the LLD (design.story) synthesize body schema ADMITS uxDefinition but never requires it (admit-but-never-force)', () => {
	// Standalone params avoid needing an approved HLD on disk (hermetic).
	const intent: WorkflowIntent = {
		workflow: 'design.story',
		focus: 'x',
		repoPath: '/tmp/x',
		repoIndexedAt: null,
		params: { standalone: true, epicHash: 'e2c6705fd105d4ac', storyId: 'S001' },
	};
	const { schema } = prepareSynthesize(intent, {});
	const bodySchema = (schema as { properties: { body: Record<string, unknown> } }).properties.body;

	assert.equal(bodySchema['additionalProperties'], false, 'body keeps additionalProperties:false');
	const props = bodySchema['properties'] as Record<string, unknown>;
	assert.ok(props['uxDefinition'] !== undefined, 'uxDefinition is an admitted body property');
	const required = (bodySchema['required'] as string[] | undefined) ?? [];
	assert.ok(!required.includes('uxDefinition'), 'uxDefinition is NOT required (content-gated, never forced)');

	assert.doesNotThrow(() => ajv.compile(bodySchema));
});
