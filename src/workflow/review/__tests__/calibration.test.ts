/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { LLMMessage, LLMProvider, LLMResponse, StructuredSchema } from '../../../shared/types.js';
import { CALIBRATION_FIXTURES, renderCalibrationReport, runCalibration } from '../calibration.js';
import type { Severity } from '../types.js';

const SEVS = new Set<Severity>(['HIGH', 'MED', 'LOW']);

test('calibration fixtures are well-formed ground truth', () => {
	assert.ok(CALIBRATION_FIXTURES.length >= 6, 'a meaningful spread of cases');
	const ids = new Set<string>();
	for (const c of CALIBRATION_FIXTURES) {
		assert.ok(!ids.has(c.claim.id), `duplicate case id ${c.claim.id}`);
		ids.add(c.claim.id);
		assert.equal(c.evidence.claimId, c.claim.id, 'evidence is keyed to its claim');
		assert.ok(SEVS.has(c.expected), 'expected is a valid severity');
		assert.ok(c.rationale.length > 0, 'each case states why');
	}
	// The set must exercise all three severities.
	const expected = new Set(CALIBRATION_FIXTURES.map(c => c.expected));
	assert.ok(expected.has('HIGH') && expected.has('MED') && expected.has('LOW'), 'covers HIGH/MED/LOW');
});

/** A fake provider that returns a canned severity per verify call, in order. */
function fakeProvider(sequence: readonly Severity[]): LLMProvider {
	let i = 0;
	return {
		supportsTools: false,
		capabilities: { structuredOutput: true, toolCalling: false, vision: false, webSearch: false, streaming: false, embeddings: false },
		async complete(): Promise<LLMResponse> { return { text: '', stopReason: 'end_turn' }; },
		async *stream(): AsyncIterable<string> { /* unused */ },
		async embed(): Promise<number[]> { return []; },
		async completeStructured<T>(_m: LLMMessage[], _s: StructuredSchema): Promise<T> {
			const sev = sequence[i % sequence.length];
			i += 1;
			return { severity: sev, evidence: 'e', action: 'a', fixability: 'manual' } as T;
		},
	};
}

test('runCalibration scores agreement + directional errors against the fixtures', async () => {
	// One judged severity per fixture, in order. Two deliberate errors:
	//  - a case expected HIGH judged MED  → a missed-high (under-block)
	//  - a case expected MED  judged HIGH → a false-high  (over-block)
	const seq: Severity[] = CALIBRATION_FIXTURES.map(c => c.expected);
	const highIdx = CALIBRATION_FIXTURES.findIndex(c => c.expected === 'HIGH');
	const medIdx = CALIBRATION_FIXTURES.findIndex(c => c.expected === 'MED');
	seq[highIdx] = 'MED';    // missed-high
	seq[medIdx] = 'HIGH';    // false-high

	const report = await runCalibration(fakeProvider(seq), { rounds: 1 });
	assert.equal(report.cases, CALIBRATION_FIXTURES.length);
	assert.equal(report.rounds, 1);
	assert.equal(report.missedHighs, 1);
	assert.equal(report.falseHighs, 1);
	const expectedAgree = (CALIBRATION_FIXTURES.length - 2) / CALIBRATION_FIXTURES.length;
	assert.ok(Math.abs(report.agreementRate - expectedAgree) < 1e-9, `agreement ${report.agreementRate}`);
	// render smoke
	const rendered = renderCalibrationReport(report);
	assert.match(rendered, /calibration: \d+% agreement/);
	assert.match(rendered, /false-highs/);
});

test('runCalibration is fully in agreement when the provider matches ground truth', async () => {
	const seq: Severity[] = CALIBRATION_FIXTURES.map(c => c.expected);
	const report = await runCalibration(fakeProvider(seq), { rounds: 1 });
	assert.equal(report.agreementRate, 1);
	assert.equal(report.falseHighs, 0);
	assert.equal(report.missedHighs, 0);
	assert.ok(report.perCase.every(c => c.matchRate === 1));
});
