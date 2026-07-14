/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Stub workflow — Phase A only.
 *
 * Three deterministic runners that echo their input params (no LLM
 * involvement) and one synthesize step that demonstrates placeholder
 * substitution end-to-end. Kept in the repo as the smoke test for
 * the executor + storage + synthesizer + MCP tool wiring.
 *
 * The stub workflow is retired once the real workflows land, but
 * its tests stay as a regression fixture for the framework
 * primitives.
 */

import type { StepRunner } from '../../types.js';
import { registerRunner } from '../../executor.js';

// ---------------------------------------------------------------------------
// echo.a — always emits `{ echoed: <input>, marker: 'a' }`
// ---------------------------------------------------------------------------

const echoA: StepRunner = {
	id:       'echo.a',
	workflow: 'stub',
	async run(ctx) {
		return {
			type:   'output',
			output: { echoed: ctx.params, marker: 'a' },
			summary: 'echo.a: emitted',
		};
	},
};

// ---------------------------------------------------------------------------
// echo.b — reads $s1.echoed, tags with marker b
// ---------------------------------------------------------------------------

const echoB: StepRunner = {
	id:       'echo.b',
	workflow: 'stub',
	async run(ctx) {
		return {
			type:   'output',
			output: {
				fromA:  ctx.params,     // will contain substituted $s1.echoed
				marker: 'b',
			},
			summary: 'echo.b: emitted',
		};
	},
};

// ---------------------------------------------------------------------------
// echo.c — final assembler
// ---------------------------------------------------------------------------

const echoC: StepRunner = {
	id:       'echo.c',
	workflow: 'stub',
	async run(ctx) {
		return {
			type:   'output',
			output: {
				assembled: ctx.params,   // will contain substituted refs to s1/s2
				marker:    'c',
			},
			summary: 'echo.c: emitted',
		};
	},
};

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

let registered = false;

export function registerStubRunners(): void {
	if (registered) return;
	registerRunner(echoA);
	registerRunner(echoB);
	registerRunner(echoC);
	registered = true;
}
