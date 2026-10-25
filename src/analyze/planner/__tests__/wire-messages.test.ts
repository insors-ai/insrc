/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The planner's messages show the wire form the model must emit
 * (ISSUE-8d39ef09, LLD-9874475f902756f6-S001 t6): the output shape, the
 * catalog's slot paths, the system prompt's params rule, and correction retries.
 */

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';

// Plan attempts are persisted under ~/.insrc: keep this file's runs in a temporary home.
const HOME = mkdtempSync(join(tmpdir(), 'insrc-wire-messages-'));
process.env['HOME'] = HOME;
after(() => rmSync(HOME, { recursive: true, force: true }));

const { runPlanner } = await import('../index.js');
const { registerBuiltinTemplates } = await import('../templates/bootstrap.js');
const { getTemplatesForTarget } = await import('../templates/registry.js');
const { plannerWireSchema } = await import('../wire-schema.js');
import type { AnalyzeContextBundle } from '../../context/types.js';
import type { LLMMessage, LLMProvider } from '../../../shared/types.js';
import type { AnalyzeTaskTemplate } from '../types.js';

registerBuiltinTemplates();

const BUNDLE: AnalyzeContextBundle = { system: '', focus: '', summary: '', structure: '', surface: '', artefacts: '', upstream: '' };
const INTENT = { target: 'code', scope: 'M', focused: false, scopeRef: { kind: 'repo', value: '/r' }, reasoning: 'wire-messages fixture' } as const;

/** Run the planner against a model that always answers `reply`; return the messages of every call. */
async function calls(catalog: readonly AnalyzeTaskTemplate[], reply: unknown): Promise<LLMMessage[][]> {
	const seen: LLMMessage[][] = [];
	const provider = { completeStructured: async (messages: LLMMessage[]) => { seen.push(structuredClone(messages)); return structuredClone(reply); } } as unknown as LLMProvider;
	await runPlanner({ input: { intent: INTENT, contextBundle: BUNDLE, catalog }, opts: { runId: `wire-messages-${Math.random().toString(36).slice(2)}` }, provider })
		.then(() => { throw new Error('the plan was expected to fail'); }, () => undefined);
	return seen;
}

/** The first ```json block after a heading, parsed. */
function jsonBlockAfter(text: string, heading: string): unknown {
	const at = text.indexOf(heading);
	assert.ok(at >= 0, `${heading} is present`);
	const open = text.indexOf('```json\n', at) + '```json\n'.length;
	return JSON.parse(text.slice(open, text.indexOf('\n```', open)));
}

/** One template's section of the rendered catalog. */
function section(text: string, id: string): string {
	const start = text.indexOf(`### \`${id}\``);
	assert.ok(start >= 0, `${id} is in the catalog`);
	const next = text.indexOf('\n### `', start + 1);
	const end = text.indexOf('\n## ', start);
	return text.slice(start, next >= 0 && next < end ? next : end);
}

const code = getTemplatesForTarget('code');
const adherence = code.find(t => t.id === 'code.adherence.check')!;
const task = (params: unknown) => ({ taskId: 't01', template: 'code.adherence.check', kind: 'leaf', params, produces: [...(adherence.produces ?? [])], rationale: 'r'.repeat(40) });
const wirePlan = (params: unknown) => ({ planId: 'p', goal: 'g', target: 'code', scope: 'M', reasoning: 'r'.repeat(60), tasks: [task(params)] });

test('the output shape is the call\'s wire schema and the catalog lists each template\'s slot paths, marking whole-params slots', async () => {
	const bare = { id: 'custom.bare', target: 'code', family: 'custom', kind: 'leaf', revision: 'r1', produces: ['out'] } as AnalyzeTaskTemplate;
	const catalog = [...code, bare];
	const [first] = await calls(catalog, wirePlan({ codeSubject: 'src', constraintTopic: 'logging' }));
	const user = first![1]!.content as string;
	assert.deepEqual(jsonBlockAfter(user, '## OUTPUT SHAPE'), plannerWireSchema(catalog).schema, 'the output shape is the wire schema sent');
	assert.ok(section(user, 'code.adherence.check').includes('- **emit as JSON text**: `params.constraints[]`\n'), 'an array-item slot');
	assert.ok(section(user, 'code.aggregate.report').includes('- **emit as JSON text**: `params` (whole params is a slot)\n'), 'the aggregator\'s whole params');
	assert.ok(section(user, 'custom.bare').includes('- **emit as JSON text**: `params` (whole params is a slot)\n'), 'a template with no inputSchema');
	for (const t of code.filter(x => plannerWireSchema(catalog).slots.get(x.id)!.length === 0)) {
		assert.ok(!section(user, t.id).includes('emit as JSON text'), `${t.id} has no slot line`);
	}
});

test('a correction retry echoes the rejected plan and the offending task in wire form', async () => {
	// Two inline constraints, the second refused by INV-5 (its sourceEntityId must be a string).
	const items = [{ constraint: 'every handler logs through getLogger' }, { constraint: 'no console.log', sourceEntityId: 7 }];
	const sent = items.map(i => JSON.stringify(i));
	const seen = await calls(code, wirePlan({ codeSubject: 'src', constraints: sent }));
	assert.ok(seen.length >= 2, 'a retry was made');
	const retry = seen[1]!;
	const echoed = JSON.parse(retry[2]!.content as string) as { tasks: { params: { constraints: unknown } }[] };
	assert.equal(retry[2]!.role, 'assistant');
	assert.deepEqual(echoed.tasks[0]!.params.constraints, sent, 'the echoed plan carries the constraints as JSON text');
	const feedback = retry[3]!.content as string;
	assert.ok(feedback.includes('**INV-5**'), 'the retry is for INV-5');
	const offending = jsonBlockAfter(feedback, '## OFFENDING TASK') as { params: { constraints: unknown } };
	assert.deepEqual(offending.params.constraints, sent, 'the offending-task snippet carries them as JSON text too');
});

test('the planner system prompt names the slot exception with the aggregator example and allows null for absent optional values', async () => {
	const prompt = readFileSync(new URL('../../../prompts/analyze/planner.system.md', import.meta.url), 'utf8');
	const [first] = await calls(code, wirePlan({ codeSubject: 'src', constraintTopic: 'logging' }));
	assert.ok((first![0]!.content as string).includes(prompt.trimEnd()), 'the system message carries the prompt file');
	for (const phrase of [
		'except where it, or a value inside it, is a JSON-text slot',
		'an aggregator task\'s whole params is a slot, so it emits `"params": "{}"`',
		'An optional value you do not set may be `null`; it means the value is absent.',
		'Inside a slot\'s JSON text, omit an absent key instead of writing `null`.',
	]) assert.ok(prompt.includes(phrase), `the prompt says: ${phrase}`);
	assert.ok(!prompt.includes('never `null`'), 'the old never-null rule is gone');
});
