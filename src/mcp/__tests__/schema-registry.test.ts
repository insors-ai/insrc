/**
 * Integration tests for the sc1 tool-schema registry that
 * `buildInsrcMcpServerWithRegistry` records at registration time. Proves:
 *  - the registry key set equals the actually-registered insrc_* tool set
 *    (all 11, incl. the self-registered insrc_schema), and validTools matches;
 *  - every recorded rawShape converts to JSON Schema without throwing (so the
 *    conversion error path never fires for the shipped shapes) — the schema is
 *    derived from the real registered shape (k1), not a stub;
 *  - each multi-turn record's phases[] equals the expected accepted phase-name
 *    set (a regression guard: EXPECTED_PHASES is hand-maintained against each
 *    *-step handler's `case` labels, so this catches an accidental one-sided
 *    edit of the TOOL_SCHEMA_META copy in server.ts — it does not itself parse
 *    the handler source), and phaseless tools carry no phases.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildInsrcMcpServerWithRegistry } from '../server.js';
import { handleInsrcSchema } from '../schema/handler.js';
import type { InsrcSchemaOk } from '../schema/schema.js';

const EXPECTED_TOOLS = [
	'insrc_analyze',
	'insrc_analyze_step',
	'insrc_build_step',
	'insrc_code_review_step',
	'insrc_docgen',
	'insrc_review_step',
	'insrc_schema',
	'insrc_triage',
	'insrc_workflow_approve',
	'insrc_workflow_run',
	'insrc_workflow_step',
];

// The accepted phase-name set per multi-turn tool, hand-maintained against
// each *-step handler's `case` labels. This is a second copy independent of
// server.ts's TOOL_SCHEMA_META, so a one-sided edit of either fails this test;
// keep both in sync with the handler when a phase is added or renamed.
const EXPECTED_PHASES: Record<string, string[]> = {
	insrc_analyze_step: ['start', 'plan', 'narrow', 'bundle'],
	insrc_workflow_step: ['start', 'plan', 'step', 'synthesize', 'resolve_question', 'review_deferred'],
	insrc_build_step: ['implement', 'validate'],
	insrc_review_step: ['start', 'claims', 'verdicts'],
	insrc_code_review_step: ['start', 'judgements'],
	insrc_triage: ['start', 'classify'],
	insrc_workflow_run: ['start', 'poll', 'abort'],
};

const PHASELESS_TOOLS = ['insrc_analyze', 'insrc_workflow_approve', 'insrc_docgen', 'insrc_schema'];

test('registry key set == registered tool set (all 11 incl. insrc_schema)', () => {
	const { schemaRegistry } = buildInsrcMcpServerWithRegistry();
	assert.deepEqual([...schemaRegistry.keys()].sort(), EXPECTED_TOOLS);
});

test('validTools (from an omitted-tool lookup) equals the registry key set (ac4)', () => {
	const { schemaRegistry } = buildInsrcMcpServerWithRegistry();
	const r = handleInsrcSchema({}, schemaRegistry);
	assert.ok('error' in r);
	assert.deepEqual(r.validTools, EXPECTED_TOOLS);
});

test('every recorded rawShape converts to JSON Schema without throwing (k1)', () => {
	const { schemaRegistry } = buildInsrcMcpServerWithRegistry();
	for (const [name, record] of schemaRegistry) {
		// use the first valid phase for a multi-turn tool, else no phase
		const phase = record.phases?.[0];
		const input = phase ? { tool: name, phase } : { tool: name };
		const r = handleInsrcSchema(input, schemaRegistry);
		assert.ok(!('error' in r), `${name}: expected Ok, got ${JSON.stringify(r)}`);
		const ok = r as InsrcSchemaOk;
		assert.equal(typeof ok.schema, 'object');
		assert.ok(Object.keys(ok.schema).length > 0, `${name}: empty schema`);
	}
});

test('a real registered shape is served, not a stub (insrc_workflow_step)', () => {
	const { schemaRegistry } = buildInsrcMcpServerWithRegistry();
	const r = handleInsrcSchema({ tool: 'insrc_workflow_step', phase: 'plan' }, schemaRegistry);
	assert.ok(!('error' in r));
	const ok = r as InsrcSchemaOk;
	// insrc_workflow_step's own input shape carries a `phase` field
	assert.match(JSON.stringify(ok.schema), /phase/);
	assert.deepEqual(ok.validPhases, EXPECTED_PHASES.insrc_workflow_step);
});

test('each multi-turn record phases[] equals its handler accepted set (lockstep)', () => {
	const { schemaRegistry } = buildInsrcMcpServerWithRegistry();
	for (const [name, expected] of Object.entries(EXPECTED_PHASES)) {
		const record = schemaRegistry.get(name);
		assert.ok(record, `${name} missing from registry`);
		assert.deepEqual(record.phases, expected, `${name} phases drifted`);
	}
});

test('phaseless tools carry no phases', () => {
	const { schemaRegistry } = buildInsrcMcpServerWithRegistry();
	for (const name of PHASELESS_TOOLS) {
		const record = schemaRegistry.get(name);
		assert.ok(record, `${name} missing`);
		assert.equal(record.phases, undefined, `${name} should be phaseless`);
	}
});
