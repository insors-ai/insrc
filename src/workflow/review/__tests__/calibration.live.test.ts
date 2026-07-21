/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Live certification of the severity rubric (R5b). Gated behind
 * INSRC_LIVE_TESTS=1 — it drives the real `claude` CLI judge over the frozen
 * calibration fixtures. Skips cleanly otherwise.
 *
 *   INSRC_LIVE_TESTS=1 npx tsx --test src/workflow/review/__tests__/calibration.live.test.ts
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CliProvider } from '../../../agent/providers/cli-provider.js';
import { renderCalibrationReport, runCalibration } from '../calibration.js';

const LIVE = process.env['INSRC_LIVE_TESTS'] === '1';

test('severity rubric certifies against the real judge (fixed claim set)', { skip: !LIVE }, async () => {
	const provider = new CliProvider({ kind: 'claude' });
	const rounds = Number.parseInt(process.env['INSRC_CAL_ROUNDS'] ?? '1', 10);
	const report = await runCalibration(provider, { rounds, onProgress: (m) => { process.stdout.write(`  ${m}\n`); } });
	process.stdout.write('\n' + renderCalibrationReport(report) + '\n');

	// SAFETY (must hold): the gate blocks on HIGH+MED, so the only dangerous
	// error is an expected-blocking case judged LOW — it would escape the gate.
	assert.equal(report.gateEscapes, 0, 'a case that should block was judged LOW — it would escape the gate');
	// QUALITY (softer): overall label agreement. A HIGH judged MED still blocks,
	// so it only dents this number, it does not compromise the gate.
	assert.ok(report.agreementRate >= 0.7, `agreement ${(report.agreementRate * 100).toFixed(0)}% below the 70% bar`);
});
