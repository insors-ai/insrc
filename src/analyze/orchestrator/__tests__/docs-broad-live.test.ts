/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The broad docs request that stopped at the aggregate step on 2026-10-08 (LLD-b9d5c5c40df5a574-s3, task t14), run live.
 *
 * It goes through the running daemon (this process never opens the stores), so the daemon must run THIS code: build, push
 * and update the daemon first. It needs the repository registered and indexed, a configured provider, and a few minutes.
 * The run is recorded in docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S003/LIVE-RUN.json as the
 * regression record: run id, the handling line, the parts, the completeness and when it ran.
 *
 * Run:
 *   INSRC_LIVE_TESTS=1 npx tsx --test src/analyze/orchestrator/__tests__/docs-broad-live.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openStream } from '../../../shared/ipc-client.js';
import type { AnswerReport } from '../../completeness.js';

const LIVE = process.env['INSRC_LIVE_TESTS'] === '1';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const RECORD = join(ROOT, 'docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S003/LIVE-RUN.json');

interface Terminal {
	readonly ok: boolean;
	readonly runId?: string;
	readonly stage?: string;
	readonly error?: { readonly code: string; readonly message: string };
	readonly report?: AnswerReport;
	readonly finalReport?: { readonly summary: string };
}

test('the broad docs request on this repository runs to a final report and the run id, handling line, parts and completeness are recorded as the regression record', { skip: LIVE ? false : 'set INSRC_LIVE_TESTS=1 (needs the daemon running this code)', timeout: 40 * 60_000 }, async () => {
	const terminal = await new Promise<Terminal>((resolveRun, reject) => {
		let result: Terminal | undefined;
		const handle = openStream(
			'analyze.run.start',
			{
				runId: `docs-broad-live-${Date.now().toString(36)}`,
				userPrompt: 'What do the documents of this repository say about the daemon, the workflow framework, the analyzers, the storage layer and the clients? Cover every area.',
				scopeRef: { kind: 'repo', value: ROOT },
				targetHint: 'docs',
			},
			frame => {
				// The daemon sends the result and then `done`, and keeps the socket open: the test settles on the result
				// itself and closes the stream, instead of waiting for a close that does not come.
				if (frame.stream === 'analyze.result') { result = frame.data as Terminal; handle.close(); resolveRun(result); }
			},
			err => { handle.close(); if (result !== undefined) resolveRun(result); else reject(err ?? new Error('the stream ended with no result')); },
		);
	});
	assert.equal(terminal.ok, true, terminal.ok ? '' : `${terminal.stage}/${terminal.error?.code}: ${terminal.error?.message}`);
	const summary = terminal.finalReport?.summary ?? '';
	assert.ok(summary.length > 0, 'a final report is delivered');
	const head = summary.split('\n\n')[0]!.split('\n');
	const handlingLine = head.find(l => l.startsWith('Handling: '));
	assert.ok(handlingLine !== undefined, `the head states how the answer was handled:\n${head.join('\n')}`);
	const handling = terminal.report?.handling;
	// The record is evidence only if it is whole: refuse to write one with a field missing.
	assert.ok(typeof terminal.runId === 'string' && terminal.runId.length > 0, 'the run id is recorded');
	assert.ok(handling !== undefined, 'the report carries how it was handled');
	assert.equal(handling.method, 'partitioned', 'a broad request is answered in parts');
	assert.ok(Number.isInteger(handling.parts) && handling.parts >= 2, 'the parts are counted');
	assert.ok(Array.isArray(handling.notCovered), 'what was not covered is listed');
	assert.ok(terminal.report?.completeness !== undefined && typeof terminal.report.completeness.complete === 'boolean', 'completeness is recorded');
	writeFileSync(RECORD, JSON.stringify({
		recordedAt: new Date().toISOString(),
		runId: terminal.runId,
		handlingLine,
		method: handling?.method,
		parts: handling?.parts,
		notCovered: handling?.notCovered ?? [],
		combineStages: handling?.combineStages,
		complete: terminal.report?.completeness.complete,
		incomplete: terminal.report?.completeness.incomplete.length,
		failed: terminal.report?.completeness.failed.length,
	}, null, 2) + '\n');
});
