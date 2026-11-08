/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Reference context (LLD-b9d5c5c40df5a574-s3, task t5): the evidence other
 * evidence is judged against, in the admission rule and when it is itself too
 * large for one call. Pure: no model.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { ExecutedExploration, ExecutedPlan } from '../../explore/types.js';
import { HandlingBudgetError } from '../driver.js';
import { MIN_SECTION_ROOM, inputLimitFor } from '../handling.js';
import { partitionResults, planReference, ruleFacts, selectSharedContext } from '../dependency.js';
import { renderSection } from '../sections.js';

const LOCAL = { kind: 'local', windowTokens: 32_768, singlePassOutputTokens: 20_480 } as const;
const PART = inputLimitFor(LOCAL, 'part');
const FOUND = { results: [], report: { completeness: { complete: true, incomplete: [], failed: [] } } };

function exec(id: string, output: Record<string, unknown>, params: Record<string, unknown> = {}): ExecutedExploration {
	return { exploration: { id, type: output['type'], purpose: 'p', params }, output, cached: false, elapsedMs: 1 } as unknown as ExecutedExploration;
}
function plan(...results: ExecutedExploration[]): ExecutedPlan {
	return { plan: { explorations: results.map(r => r.exploration) }, results, totalMs: 1, totalCached: 0 } as unknown as ExecutedPlan;
}
const constraint = (text: string, n = 1) => ({ constraint: text, kind: 'must', sourceEntityId: `ent-${n}`, file: `docs/rule${n}.md`, heading: `Rule ${n}`, rationale: 'why' });
const enumerate = (id: string, ...cs: ReturnType<typeof constraint>[]) => exec(id, { type: 'doc.constraint.enumerate', subject: 's', constraints: cs, notFoundNote: '', retrievedSectionCount: cs.length });
const trace = (id: string) => exec(id, { type: 'doc.decision.trace', subject: 's', decisions: [{ decision: 'Use LMDB', file: 'docs/d.md', heading: 'D', sourceEntityId: 'ent-d', rationale: 'r', date: '' }], notFoundNote: '' });
const reuse = exec('e4', { type: 'capability.reuse-check', capability: 'c', candidates: [{ path: 'src/a', moduleName: 'a', verdict: 'reuse', rationale: 'r', evidenceEntities: [], conceptScore: 0.9 }], notFoundNote: '' });
const resolve = exec('e1', { type: 'concept.resolve', query: 'q', hits: [{ kind: 'module', path: 'src/h', name: 'h', score: 0.9 }, { kind: 'module', path: 'src/i', name: 'i', score: 0.5 }], anchor: { path: 'src/h', kind: 'module', source: 'ranked' } });
const profile = exec('e5', { type: 'module.profile', path: 'src/h' });

function adherencePromptSize(): number {
	return readFileSync(fileURLToPath(new URL('../../../prompts/analyze/synthesize.adherence.system.md', import.meta.url))).length;
}

test('selectSharedContext per target, blocks removed from partition blocks, rule-source count and restatement match the reference', () => {
	const executed = plan(resolve, enumerate('e2', constraint('Never open LMDB from the CLI', 1), constraint('Use IPC', 2)), trace('e3'), reuse, profile);

	// adherence: the constraint and decision outputs, each record a block with its citations; removed from the partition.
	const adherence = selectSharedContext('adherence', executed);
	assert.deepEqual(adherence.map(b => b.key), ['e2', 'e2.constraints[0]', 'e2.constraints[1]', 'e3', 'e3.decisions[0]']);
	assert.deepEqual(partitionResults('adherence', executed).map(r => r.exploration.id), ['e1', 'e4', 'e5']);
	const facts = ruleFacts(executed);
	assert.equal(facts.count, 3);
	assert.deepEqual(facts.rules.map(r => r.file), ['docs/rule1.md', 'docs/rule2.md', 'docs/d.md']);
	assert.equal(facts.rules[0]?.text, 'Never open LMDB from the CLI');
	// Every rule text of the facts is in a reference block.
	const text = adherence.map(b => b.text).join('\n');
	for (const rule of facts.rules) assert.ok(text.includes(rule.text), rule.text);

	// capability: the reuse-check outputs.
	assert.ok(selectSharedContext('capability', executed).every(b => b.key.startsWith('e4')));
	assert.deepEqual(partitionResults('capability', executed).map(r => r.exploration.id), ['e1', 'e2', 'e3', 'e5']);

	// code: the anchor extract of concept.resolve; the output itself stays evidence.
	const code = selectSharedContext('code', executed);
	assert.equal(code.length, 1);
	assert.equal(code[0]?.key, 'e1#anchor');
	const extract = JSON.parse(code[0]?.text ?? '{}') as { anchor: { path: string }; topHit?: { path: string } };
	assert.equal(extract.anchor.path, 'src/h');
	assert.equal(extract.topHit?.path, 'src/h', 'a ranked anchor carries hits[0]');
	assert.equal(partitionResults('code', executed).length, 5);
	// A named-scope anchor carries no top hit.
	const named = exec('e1', { type: 'concept.resolve', query: 'q', hits: [{ kind: 'module', path: 'src/z', name: 'z', score: 1 }], anchor: { path: 'src/a', kind: 'module', source: 'named-scope' } });
	assert.equal(JSON.parse(selectSharedContext('code', plan(named))[0]?.text ?? '{}').topHit, undefined);
	// No concept.resolve anchor, no extract.
	assert.deepEqual(selectSharedContext('code', plan(profile)), []);

	// docs, data and infra: none.
	for (const none of ['docs', 'data', 'infra'] as const) {
		assert.deepEqual(selectSharedContext(none, executed), [], none);
		assert.equal(partitionResults(none, executed).length, 5, none);
	}
});

test('reference context in the admission rule, unfittable reference names the reference context, fitting reference leaves the stated section room', () => {
	const promptSize = adherencePromptSize();
	const small = selectSharedContext('adherence', plan(enumerate('e2', constraint('Never open LMDB from the CLI'))));

	// A reference that fits is one round and leaves the room for a section: limit - prompt - reference.
	const fitting = planReference({ blocks: small, limit: PART, promptSize, found: FOUND });
	assert.equal(fitting.rounds.length, 1);
	const round = fitting.rounds[0];
	assert.equal(round?.evidenceRoom, PART.limit - promptSize - (round?.size ?? 0));
	assert.ok((round?.evidenceRoom ?? 0) >= MIN_SECTION_ROOM);
	assert.ok(round?.rendered.includes('Never open LMDB from the CLI'));

	// No reference is one empty round with the room the prompt leaves.
	const none = planReference({ blocks: [], limit: PART, promptSize, found: FOUND });
	assert.equal(none.rounds[0]?.evidenceRoom, PART.limit - promptSize);

	// A prompt so large that the reference and the minimum room cannot share the call: the error names the reference context.
	assert.throws(
		() => planReference({ blocks: small, limit: PART, promptSize: PART.limit - MIN_SECTION_ROOM - 100, found: FOUND }),
		(err: unknown) => {
			assert.ok(err instanceof HandlingBudgetError);
			assert.match(err.message, /reference context/);
			assert.match(err.message, /PART_MAX_OUTPUT_TOKENS/);
			return true;
		},
	);
	// A reference whose own envelope cannot fit also names the reference context.
	const fat = [{ key: 'e2', envelope: { params: { blob: 'p'.repeat(20_000) } }, text: 'x'.repeat(30_000) }];
	assert.throws(() => planReference({ blocks: fat, limit: PART, promptSize, found: FOUND }), (err: unknown) => {
		assert.ok(err instanceof HandlingBudgetError);
		assert.match(err.message, /reference context/);
		return true;
	});
});

test('an oversized single rule record is cut into sections, each part sees every section in sequence, rule-source count from the whole reference, no HandlingBudgetError', () => {
	const promptSize = adherencePromptSize();
	const longRule = 'The daemon owns every database handle and no other process may open one. '.repeat(500);
	const executed = plan(
		enumerate('e2', constraint(longRule, 1)),
		exec('e6', { type: 'search.text', hits: [{ file: 'src/a.ts', line: 3, snippet: 's' }] }),
	);
	const blocks = selectSharedContext('adherence', executed);
	assert.ok(blocks.some(b => b.text.length > PART.limit), 'one rule record larger than the room');

	const reference = planReference({ blocks, limit: PART, promptSize, found: FOUND });
	assert.ok(reference.rounds.length > 1, 'cut into rounds');
	const roundBudget = PART.limit - promptSize - MIN_SECTION_ROOM;
	for (const r of reference.rounds) {
		assert.ok(r.size <= roundBudget, 'a round fits next to the prompt and the minimum room');
		assert.ok(r.evidenceRoom >= MIN_SECTION_ROOM);
		for (const s of r.sections.filter(x => x.blockKey === 'e2.constraints[0]')) {
			assert.equal(s.envelope['sourceEntityId'], 'ent-1', 'every section keeps the rule\'s citation');
			assert.ok(renderSection(s).includes('file: docs/rule1.md'));
		}
	}
	// The rounds hold the whole rule, in order, none dropped.
	const ruleBlock = blocks.find(b => b.key === 'e2.constraints[0]');
	const joined = reference.rounds.flatMap(r => r.sections).filter(s => s.blockKey === 'e2.constraints[0]').map(s => s.text).join('');
	assert.equal(joined, ruleBlock?.text);

	// Each part is judged against every round, in sequence: a part x round loop sees each section of the reference once per part.
	const parts = ['part 1: src/a', 'part 2: src/b'];
	const calls: string[] = [];
	for (const part of parts) for (const [i] of reference.rounds.entries()) calls.push(`${part} / round ${i + 1}`);
	assert.equal(calls.length, parts.length * reference.rounds.length);

	// The rule-source count comes from the whole reference, not from any one round.
	assert.equal(ruleFacts(executed).count, 1);
	assert.equal(ruleFacts(executed).rules[0]?.text, longRule);
});
