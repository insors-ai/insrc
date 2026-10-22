/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Top-level dispatcher for `insrc_build_step`. Mirrors the shape of
 * `daemon/steps/workflow-step/handler.ts`, but the surface is STATELESS — every call is
 * self-contained given its `target` (no continuation token).
 */

import { appendFileSync } from 'node:fs';

import { getLogger } from '../../../shared/logger.js';
import { TeamGateRefusedError } from '../../../workflow/team/gate.js';
import { handleImplement } from './phases/implement.js';
import { handleValidate } from './phases/validate.js';
import type { BuildStepInput, BuildStepMcpEnvelope, BuildStepOutput, BuildStepError } from './types.js';
import { repoSchemaRefusalOfInput } from '../../repo-schema-guard.js';

const TRACE_PATH = process.env['INSRC_BUILD_STEP_TRACE'];

const log = getLogger('mcp:build-step:handler');

export async function handleBuildStep(input: unknown): Promise<BuildStepMcpEnvelope> {
	const result = await dispatch(input);
	if (TRACE_PATH !== undefined) {
		try {
			appendFileSync(TRACE_PATH, JSON.stringify({ input, output: result }) + '\n', 'utf8');
		} catch { /* trace is best-effort */ }
	}
	return {
		content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
		...(result.next === 'error' ? { isError: true } : {}),
	};
}

async function dispatch(input: unknown): Promise<BuildStepOutput> {
	if (typeof input !== 'object' || input === null || !('phase' in input)) {
		return errorResult('bad-input', 'insrc_build_step: input must be an object with a `phase` field.');
	}
	const step = input as BuildStepInput;
	const refusal = repoSchemaRefusalOfInput(step);
	if (refusal !== undefined) return errorResult('repo-schema-unconverted', refusal);
	try {
		switch (step.phase) {
			case 'implement':        return await handleImplement(step);
			case 'validate':         return await handleValidate(step);
			default:
				return errorResult(
					'bad-phase',
					`insrc_build_step: unknown phase '${(step as { phase: string }).phase}'. ` +
					`Expected 'implement' | 'validate'.`,
				);
		}
	} catch (err) {
		// The team gate refused the action: say so with its own code and the reason (it names the holder).
		if (err instanceof TeamGateRefusedError) return errorResult('team-gate-refused', err.reason);
		const msg = err instanceof Error ? err.message : String(err);
		log.warn({ phase: step.phase, err: msg }, 'insrc_build_step: uncaught error');
		return errorResult('internal', msg);
	}
}

function errorResult(code: string, message: string): BuildStepError {
	return { next: 'error', error: { code, message, retryable: false } };
}
