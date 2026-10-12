/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The step host: the daemon's `step.call` stream request (Epic c2ba6fa6,
 * Story s11). It runs one of the seven moved step handlers for an MCP
 * forwarder, inside the caller's StepCallContext and with the stream's signal,
 * and answers with one 'done' frame whose data is the handler's reply envelope,
 * unchanged, or one 'error' frame:
 *
 *   - `step-unknown-tool`: the tool is not in this daemon's table (a forwarder
 *     newer than the daemon);
 *   - `step-failed`: the handler threw instead of returning an envelope, or the
 *     request itself was malformed.
 */

import type { StreamHandler } from '../server.js';
import { getLogger } from '../../shared/logger.js';
import { runInStepContext } from '../../shared/step-context.js';
import type { StepCallContext, StepToolName } from '../../shared/step-context.js';
import { runAnalyzeOneShot } from './analyze-oneshot.js';
import type { AnalyzeOneShotArgs } from './analyze-oneshot.js';
import { handleAnalyzeStep } from './analyze-step/handler.js';
import { handleBuildStep } from './build-step/handler.js';
import { DEFAULT_DEPS as CODE_REVIEW_DEFAULT_DEPS, handleCodeReviewStep, withStepClient } from './code-review-step/handler.js';
import type { CodeReviewStepDeps } from './code-review-step/handler.js';
import { handleReviewStep } from './review-step/handler.js';
import { handleTriageStep } from './triage-step/handler.js';
import { handleWorkflowStep } from './workflow-step/handler.js';

const log = getLogger('daemon:step-host');

/** The tools step.call runs (one list, shared with the MCP forwarders). */
export { STEP_TOOL_NAMES } from '../../shared/step-context.js';
export type { StepToolName } from '../../shared/step-context.js';

/** A step tool's reply: the MCP tool result the handler returns. */
export interface StepEnvelope {
	readonly content: readonly { readonly type: string; readonly text: string }[];
	readonly isError?: boolean | undefined;
}

export type StepToolRunner = (args: unknown, signal: AbortSignal) => Promise<StepEnvelope>;

export interface StepHostOptions {
	/** Test seam: replace or add tool runners. */
	readonly tools?: Partial<Record<string, StepToolRunner>> | undefined;
	/** Test seam: the code-review deps the client and signal are added to. */
	readonly codeReviewDeps?: CodeReviewStepDeps | undefined;
}

/** The table of the seven tools. Only the review and code-review waits take
 *  the signal; the other handlers run to completion. */
export function stepToolTable(opts: StepHostOptions = {}): Record<string, StepToolRunner> {
	const codeReviewBase = opts.codeReviewDeps ?? CODE_REVIEW_DEFAULT_DEPS;
	const table: Record<StepToolName, StepToolRunner> = {
		insrc_analyze:          (args) => runAnalyzeOneShot(args as AnalyzeOneShotArgs),
		insrc_analyze_step:     (args) => handleAnalyzeStep(args),
		insrc_workflow_step:    (args) => handleWorkflowStep(args),
		insrc_build_step:       (args) => handleBuildStep(args),
		insrc_review_step:      (args, signal) => handleReviewStep(args, { signal }),
		insrc_code_review_step: (args, signal) => handleCodeReviewStep(args, { ...withStepClient(codeReviewBase), signal }),
		insrc_triage:           (args) => handleTriageStep(args),
	};
	return { ...table, ...opts.tools } as Record<string, StepToolRunner>;
}

/** The request's context, checked: a forwarder always sends a cwd. */
function contextOf(raw: unknown): StepCallContext | string {
	if (typeof raw !== 'object' || raw === null) return '`context` (object) is required';
	const c = raw as Record<string, unknown>;
	if (typeof c['cwd'] !== 'string' || c['cwd'].length === 0) return '`context.cwd` (non-empty string) is required';
	if (c['envRepo'] !== undefined && typeof c['envRepo'] !== 'string') return '`context.envRepo` must be a string';
	if (c['client'] !== undefined && c['client'] !== 'claude' && c['client'] !== 'codex') return "`context.client` must be 'claude' or 'codex'";
	return {
		cwd: c['cwd'],
		...(typeof c['envRepo'] === 'string' ? { envRepo: c['envRepo'] } : {}),
		...(c['client'] !== undefined ? { client: c['client'] as 'claude' | 'codex' } : {}),
	};
}

/** The `step.call` stream handler over `table`. */
export function createStepCallHandler(table: Record<string, StepToolRunner> = stepToolTable()): StreamHandler {
	return async (params, send, signal) => {
		const fail = (code: 'step-unknown-tool' | 'step-failed', error: string): void => {
			send({ id: 0, stream: 'error', data: { code, error, recoverable: false } });
		};
		const p = (typeof params === 'object' && params !== null ? params : {}) as { tool?: unknown; args?: unknown; context?: unknown };
		if (typeof p.tool !== 'string' || !Object.hasOwn(table, p.tool)) {
			fail('step-unknown-tool', `step.call: this daemon has no tool '${String(p.tool)}'. Update the daemon and restart it.`);
			return;
		}
		const ctx = contextOf(p.context);
		if (typeof ctx === 'string') {
			fail('step-failed', `step.call: ${ctx}`);
			return;
		}
		const run = table[p.tool]!;
		let envelope: StepEnvelope;
		try {
			envelope = await runInStepContext(ctx, () => run(p.args, signal));
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			log.warn({ tool: p.tool, err: message }, 'step.call: the handler threw');
			fail('step-failed', message);
			return;
		}
		send({ id: 0, stream: 'done', data: envelope });
	};
}
