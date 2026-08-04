/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { judgeAdherence, buildAdherencePrompt, ADHERENCE_FINDINGS_SCHEMA } from '../adherence.js';
import type { CodeReviewSubject, CodeReviewGrounding } from '../../types.js';
import type { LLMProvider } from '../../../../shared/types.js';

// ---- fixtures ----

const subject = (changedFiles: readonly string[] = ['src/a.ts']): CodeReviewSubject => ({
	repoPath: '/repo', epicHash: 'e', storyId: 's2', changedFiles,
	approvedLld:  { body: { framework: 'x' } } as unknown as CodeReviewSubject['approvedLld'],
	approvedPlan: { body: { tasks: [] } }     as unknown as CodeReviewSubject['approvedPlan'],
	buildRecord: null,
});

/** Mode B — LLD approved, no plan. */
const subjectLldOnly = (changedFiles: readonly string[] = ['src/a.ts']): CodeReviewSubject => ({
	...subject(changedFiles), approvedPlan: null,
});

/** Mode C — neither contract approved. */
const subjectNoContract = (changedFiles: readonly string[] = ['src/a.ts']): CodeReviewSubject => ({
	...subject(changedFiles), approvedLld: null, approvedPlan: null,
});

const grounding = (n = 1): CodeReviewGrounding => ({
	symbols: Array.from({ length: n }, (_, i) => ({
		entityId: `e${i}`, file: 'src/a.ts', kind: 'function', name: `fn${i}`,
		signature: `fn${i}(): void`, callers: [], callees: [], testsReaching: [],
	})),
});

/** A fake LLMProvider that scripts completeStructured and counts calls; any
 *  OTHER provider method is absent, so the judge touching one would throw. */
function fakeProvider(scripted: unknown): { provider: LLMProvider; calls: () => number } {
	let n = 0;
	const provider = {
		completeStructured: async () => { n++; return scripted; },
	} as unknown as LLMProvider;
	return { provider, calls: () => n };
}

// ---- ac1: findings mapped with expectationRef ----

test('judgeAdherence: maps model findings to DimensionResult{adherence} with expectationRef (ac1)', async () => {
	const { provider } = fakeProvider({ findings: [
		{ severity: 'MED', location: 'src/a.ts:10', message: 'diverges', expectationRef: 'LLD sc1 clause' },
	] });
	const res = await judgeAdherence(subject(), grounding(), provider);
	assert.equal(res.dimension, 'adherence');
	assert.equal(res.findings.length, 1);
	assert.equal(res.findings[0]!.dimension, 'adherence');
	assert.equal(res.findings[0]!.expectationRef, 'LLD sc1 clause');
	assert.equal(res.findings[0]!.location, 'src/a.ts:10');
});

// ---- ac2: satisfied / empty grounding => no manufactured findings ----

test('judgeAdherence: no departures => empty findings, no manufactured findings (ac2)', async () => {
	const { provider } = fakeProvider({ findings: [] });
	const res = await judgeAdherence(subject(), grounding(), provider);
	assert.deepEqual(res, { dimension: 'adherence', findings: [] });
});

test('judgeAdherence: empty grounding still yields a valid empty result (ac2)', async () => {
	const { provider } = fakeProvider({ findings: [] });
	const res = await judgeAdherence(subject(), grounding(0), provider);
	assert.deepEqual(res.findings, []);
});

// ---- out-of-subject drop ----

test('judgeAdherence: drops a finding whose location file is outside the changed set', async () => {
	const { provider } = fakeProvider({ findings: [
		{ severity: 'HIGH', location: 'src/a.ts:1',      message: 'in scope' },
		{ severity: 'HIGH', location: 'src/other.ts:99', message: 'out of scope' },
	] });
	const res = await judgeAdherence(subject(['src/a.ts']), grounding(), provider);
	assert.equal(res.findings.length, 1);
	assert.equal(res.findings[0]!.location, 'src/a.ts:1');
});

// ---- ac4: exactly one provider call, no other method touched ----

test('judgeAdherence: issues exactly ONE completeStructured call, no other provider method (ac4/k4/k3)', async () => {
	const { provider, calls } = fakeProvider({ findings: [] });
	await judgeAdherence(subject(), grounding(), provider);
	assert.equal(calls(), 1);
});

// ---- ac3: differently-decided => no finding (the model, per the prompt, raises nothing) ----

test('judgeAdherence: a differently-decided-but-faithful design raises nothing (ac3)', async () => {
	// The model (guided by the prompt) returns no findings for an alternative-but-faithful decision.
	const { provider } = fakeProvider({ findings: [] });
	const res = await judgeAdherence(subject(), grounding(), provider);
	assert.deepEqual(res.findings, []);
	// and the prompt actually carries the decision-out-of-scope instruction:
	const msgs = buildAdherencePrompt(subject(), grounding(), undefined);
	const sys = msgs.find(m => m.role === 'system')!.content as string;
	assert.match(sys, /OUT OF SCOPE|out of scope/);
	assert.match(sys, /decided differently|would have decided|would have made differently|decision itself/i);
});

// ---- retry exhaustion => failure propagates (never a fabricated pass) ----

test('judgeAdherence: invalid model output exhausts the retry cap and PROPAGATES (no fabricated pass)', async () => {
	const { provider } = fakeProvider({ wrong: true });   // no `findings` => schema-invalid every attempt
	await assert.rejects(() => judgeAdherence(subject(), grounding(), provider));
});

// ---- t1: schema shape + prompt-trailing structure ----

test('ADHERENCE_FINDINGS_SCHEMA per-finding shape is 1:1 with sc3 DimensionFinding fields', () => {
	const props = (ADHERENCE_FINDINGS_SCHEMA as { properties: { findings: { items: { properties: Record<string, unknown>; required: string[] } } } }).properties.findings.items;
	assert.deepEqual(Object.keys(props.properties).sort(), ['expectationRef', 'location', 'message', 'severity']);
	assert.deepEqual([...props.required].sort(), ['location', 'message', 'severity']);   // expectationRef optional
});

test('buildAdherencePrompt: the output-shape reminder is TRAILING (after the changed symbols)', () => {
	const user = buildAdherencePrompt(subject(), grounding(), undefined).find(m => m.role === 'user')!.content as string;
	assert.ok(user.indexOf('## Output') > user.indexOf('changed symbols'), 'output shape comes after the symbols (trailing)');
});

// ---- S001: three-mode fork points ----

test('judgeAdherence: both contracts null (mode C) -> empty result with ZERO provider calls', async () => {
	const { provider, calls } = fakeProvider({ findings: [{ severity: 'HIGH', location: 'src/a.ts:1', message: 'fabricated' }] });
	const res = await judgeAdherence(subjectNoContract(), grounding(), provider);
	assert.deepEqual(res, { dimension: 'adherence', findings: [] });
	assert.equal(calls(), 0, 'no provider call in mode C — never a fabricated departure');
});

test('judgeAdherence: a contract present -> issues exactly one completeStructured call (mode B unchanged)', async () => {
	const { provider, calls } = fakeProvider({ findings: [] });
	await judgeAdherence(subjectLldOnly(), grounding(), provider);
	assert.equal(calls(), 1);
});

test('buildAdherencePrompt: mode A includes the LLD body + the Approved plan section + implementation-correctness framing', () => {
	const msgs = buildAdherencePrompt(subject(), grounding(), undefined);
	const sys  = msgs.find(m => m.role === 'system')!.content as string;
	const user = msgs.find(m => m.role === 'user')!.content as string;
	assert.match(user, /## Approved design \(LLD body\)/);
	assert.match(user, /## Approved plan/);
	assert.match(sys, /IMPLEMENTS/);
});

test('buildAdherencePrompt: mode B (LLD only) includes the LLD body, OMITS the plan section, no null deref', () => {
	// The very fact that this returns (no throw) proves the null approvedPlan is not dereferenced.
	const msgs = buildAdherencePrompt(subjectLldOnly(), grounding(), undefined);
	const sys  = msgs.find(m => m.role === 'system')!.content as string;
	const user = msgs.find(m => m.role === 'user')!.content as string;
	assert.match(user, /## Approved design \(LLD body\)/);
	assert.ok(!user.includes('## Approved plan'), 'no plan section when there is no approved plan');
	assert.match(sys, /No plan was approved/);
});
