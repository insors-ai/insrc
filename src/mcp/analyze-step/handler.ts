/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Top-level `insrc_analyze_step` handler. Dispatches on the `phase`
 * argument to the corresponding phase handler + serialises the
 * `StepOutput` into an MCP tool-response envelope (JSON in a text
 * content block).
 *
 * See plans/mcp-multi-turn-analyze.md for the full protocol.
 */

import { appendFileSync } from 'node:fs';

import { getLogger } from '../../shared/logger.js';
import { handleBundle } from './phases/bundle.js';
import { handleNarrow } from './phases/narrow.js';
import { handlePlan } from './phases/plan.js';
import { handleStart } from './phases/start.js';
import type {
	StepInput,
	StepMcpEnvelope,
	StepOutput,
	StepOutputError,
} from './types.js';

/**
 * When `INSRC_ANALYZE_STEP_TRACE=/some/file.jsonl` is set in the MCP
 * subprocess env, every dispatch call appends a JSONL record of
 * `{input, output}`. Off by default. Used to diagnose multi-turn
 * loop drift (client emits a bad plan, echoes a bad state token,
 * skips the narrow phase, etc.). Register the MCP server with the
 * env set to enable, e.g.:
 *
 *   claude mcp add insrc \
 *     -e INSRC_ANALYZE_STEP_TRACE=/tmp/insrc-step.jsonl \
 *     -e INSRC_REPO=/path/to/repo \
 *     -- node /path/to/out/insrc/bin/insrc-mcp.js
 */
const TRACE_PATH = process.env['INSRC_ANALYZE_STEP_TRACE'];

const log = getLogger('mcp:analyze-step:handler');

// ---------------------------------------------------------------------------
// Public entry
// ---------------------------------------------------------------------------

/**
 * Dispatch on the `phase` field + wrap the phase handler's result in
 * an MCP `{ content: [{type:'text', text: '<json>'}] }` envelope.
 * Errors that phase handlers didn't catch bubble to
 * `errorResult('internal')`.
 */
export async function handleAnalyzeStep(input: unknown): Promise<StepMcpEnvelope> {
	const result = await dispatch(input);
	if (TRACE_PATH !== undefined) {
		try {
			appendFileSync(
				TRACE_PATH,
				JSON.stringify({
					// Redact the incoming state blob so trace files stay
					// human-readable (a full state blob is 5-40KB base64).
					input: redactState(input),
					output: redactState(result),
				}) + '\n',
				'utf8',
			);
		} catch { /* trace is best-effort */ }
	}
	return {
		content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
		...(result.next === 'error' ? { isError: true } : {}),
	};
}

/** No-op passthrough. Kept as a hook so trace records can be reshaped
 *  for legibility without changing dispatch semantics. */
function redactState(v: unknown): unknown {
	return v;
}

async function dispatch(input: unknown): Promise<StepOutput> {
	if (typeof input !== 'object' || input === null || !('phase' in input)) {
		return errorResult(
			'bad-input',
			'insrc_analyze_step: input must be an object with a `phase` field.',
			false,
		);
	}
	const step = input as StepInput;
	try {
		switch (step.phase) {
			case 'start':  return await handleStart(step);
			case 'plan':   return await handlePlan(step);
			case 'narrow': return await handleNarrow(step);
			case 'bundle': return await handleBundle(step);
			default:
				return errorResult(
					'bad-phase',
					`insrc_analyze_step: unknown phase '${(step as { phase: string }).phase}'. ` +
					`Expected 'start' | 'plan' | 'narrow' | 'bundle'.`,
					false,
				);
		}
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		log.warn({ phase: step.phase, err: msg }, 'insrc_analyze_step: uncaught error');
		return errorResult('internal', msg, false);
	}
}

function errorResult(code: string, message: string, retryable: boolean): StepOutputError {
	return {
		next:  'error',
		error: { code, message, retryable },
	};
}
