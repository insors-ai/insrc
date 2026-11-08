/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The admission rule (LLD-b9d5c5c40df5a574-s3, task t3): two units that are
 * never mixed, with the checked-in local configuration and the real
 * synthesizer prompts. Pure: no model.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { HandlingBudgetError } from '../driver.js';
import {
	CLI_RESERVE_CHARS, DEFAULT_INPUT_BUDGET_CHARS, MIN_SECTION_ROOM, PART_MAX_OUTPUT_TOKENS,
	admits, assertPartRoom, decideHandling, inputLimitFor, measureInput,
} from '../handling.js';
import type { AdmissionTarget } from '../handling.js';

const LOCAL: AdmissionTarget = { kind: 'local', windowTokens: 32_768, singlePassOutputTokens: 20_480 };
const FOUND = { results: [], report: { completeness: { complete: true, incomplete: [], failed: [] } } };

function prompt(target: string): string {
	return readFileSync(fileURLToPath(new URL(`../../../prompts/analyze/synthesize.${target}.system.md`, import.meta.url)), 'utf8');
}

test('checked-in local values give 10,240 bytes, exact boundary, one byte over, multi-byte, 22,528 for parts, window too small gives HandlingBudgetError naming the configuration', () => {
	const single = inputLimitFor(LOCAL, 'single');
	assert.deepEqual(single, { unit: 'bytes', limit: 10_240, source: 'context-window', basis: 'bytes-bound' });
	assert.equal(inputLimitFor(LOCAL, 'part').limit, 22_528);
	assert.equal(inputLimitFor(LOCAL, 'combine').limit, 22_528);
	assert.equal(PART_MAX_OUTPUT_TOKENS, 8_192);

	// Exactly 10,240 bytes is admitted; one byte over is divided.
	const exact = 'x'.repeat(10_240);
	assert.equal(admits(single, measureInput(exact, 'bytes')), true);
	assert.equal(decideHandling({ size: 'S', target: LOCAL, input: exact }).method, 'single-pass');
	assert.equal(decideHandling({ size: 'S', target: LOCAL, input: `${exact}x` }).trigger, 'fit');

	// Multi-byte text is counted in bytes: 3,414 three-byte characters are 10,242 bytes.
	const multi = '€'.repeat(3_414);
	assert.equal(multi.length, 3_414);
	assert.equal(measureInput(multi, 'bytes'), 10_242);
	assert.equal(decideHandling({ size: 'S', target: LOCAL, input: multi }).trigger, 'fit');
	assert.equal(decideHandling({ size: 'S', target: LOCAL, input: '€'.repeat(3_413) }).method, 'single-pass');

	// A window that leaves less than the fixed context plus the minimum room.
	const part = inputLimitFor(LOCAL, 'part');
	assertPartRoom(part, part.limit - MIN_SECTION_ROOM, FOUND);
	assert.throws(() => assertPartRoom(part, part.limit - MIN_SECTION_ROOM + 1, FOUND, 'the reference context'), (err: unknown) => {
		assert.ok(err instanceof HandlingBudgetError);
		assert.equal(err.reason, 'input-does-not-fit');
		assert.match(err.message, /the reference context takes/);
		assert.match(err.message, /context window/);
		assert.match(err.message, /PART_MAX_OUTPUT_TOKENS/);
		return true;
	});
	const tiny = inputLimitFor({ kind: 'local', windowTokens: 11_000, singlePassOutputTokens: 20_480 }, 'part');
	assert.equal(tiny.limit, 11_000 - 8_192 - 2_048);
	assert.throws(() => assertPartRoom(tiny, 1_000, FOUND), HandlingBudgetError);
});

test('real code, adherence and docs prompt sizes, CLI characters minus 16,000, units never compared, local code and adherence handled in parts with trigger \'fit\'', () => {
	const code = prompt('code');
	const adherence = prompt('adherence');
	const docs = prompt('docs');

	// Code and adherence prompts alone exceed the single-pass limit: always handled in parts, by fit.
	for (const text of [code, adherence]) {
		assert.ok(Buffer.byteLength(text) > 10_240);
		const decision = decideHandling({ size: 'S', target: LOCAL, input: text });
		assert.equal(decision.method, 'partitioned');
		assert.equal(decision.trigger, 'fit');
	}
	// A docs request is admitted only while its evidence fits the rest of the limit.
	const room = 10_240 - Buffer.byteLength(docs);
	assert.ok(room >= 3_900 && room <= 3_920, `docs room ${room}`);
	assert.equal(decideHandling({ size: 'S', target: LOCAL, input: docs + 'e'.repeat(room) }).method, 'single-pass');
	assert.equal(decideHandling({ size: 'S', target: LOCAL, input: docs + 'e'.repeat(room + 1) }).trigger, 'fit');

	// Every part prompt plus the minimum room fits the part limit.
	const largest = Math.max(...[code, adherence, docs].map(t => Buffer.byteLength(t)));
	assert.ok(largest + MIN_SECTION_ROOM <= inputLimitFor(LOCAL, 'part').limit);

	// A CLI provider is measured in characters against its declared budget less the reserve.
	const cli: AdmissionTarget = { kind: 'cli', inputBudgetChars: 100_000 };
	const limit = inputLimitFor(cli, 'single');
	assert.deepEqual(limit, { unit: 'chars', limit: 100_000 - CLI_RESERVE_CHARS, source: 'provider', basis: 'declared' });
	assert.equal(inputLimitFor(cli, 'part').limit, limit.limit);
	// 30,000 three-byte characters are 90,000 bytes but 30,000 characters: admitted, the units are not compared.
	const wide = '€'.repeat(30_000);
	assert.equal(measureInput(wide, 'chars'), 30_000);
	assert.equal(decideHandling({ size: 'S', target: cli, input: wide }).method, 'single-pass');
	assert.equal(decideHandling({ size: 'S', target: cli, input: 'x'.repeat(84_001) }).trigger, 'fit');
	assert.equal(decideHandling({ size: 'S', target: cli, input: wide }).budget.unit, 'chars');

	// With no declared limit: the default, in characters, from the default source.
	for (const target of [{ kind: 'cli' }, { kind: 'unknown' }, { kind: 'local', windowTokens: 0, singlePassOutputTokens: 1 }] as AdmissionTarget[]) {
		assert.deepEqual(inputLimitFor(target, 'single'), { unit: 'chars', limit: DEFAULT_INPUT_BUDGET_CHARS, source: 'default', basis: 'default' });
	}
});
