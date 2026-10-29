/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The step host: the daemon's `step.call` stream request (Epic c2ba6fa6,
 * Story s11). It runs one of the seven moved step handlers for an MCP
 * forwarder, inside the caller's StepCallContext and with the stream's signal,
 * sends what the handler reports through its progress callback as 'progress'
 * frames (ISSUE-1973e125), and answers with one 'done' frame whose data is the
 * handler's reply envelope, unchanged, or one 'error' frame:
 *
 *   - `step-unknown-tool`: the tool is not in this daemon's table (a forwarder
 *     newer than the daemon);
 *   - `step-failed`: the handler threw instead of returning an envelope, or the
 *     request itself was malformed.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifyBoundedCli } from '../../agent/providers/bounded-input.js';
import type { ControllerExecutionCapability } from '../../shared/controller-review.js';
import type { StreamHandler } from '../server.js';
import { getLogger } from '../../shared/logger.js';
import { runInStepContext, requireConnectionExecution } from '../../shared/step-context.js';
import type { StepCallContext, StepClient, StepToolName, ConnectionExecutionContext } from '../../shared/step-context.js';
import { runAnalyzeOneShot } from './analyze-oneshot.js';
import { familyForClient } from '../model-registry.js';
import { runWithClientProviderContext } from '../../analyze/context/shaper-provider.js';
import { handleAnalyzeStep } from './analyze-step/handler.js';
import { handleBuildStep } from './build-step/handler.js';
import { DEFAULT_DEPS as CODE_REVIEW_DEFAULT_DEPS, handleCodeReviewStep, withStepClient } from './code-review-step/handler.js';
import type { CodeReviewStepDeps } from './code-review-step/handler.js';
import { handleReviewStep } from './review-step/handler.js';
import type { ReviewStepDeps } from './review-step/types.js';
import { handleTriageStep } from './triage-step/handler.js';
import { handleWorkflowStep } from './workflow-step/handler.js';
import { registerWorkflowRunners } from '../../workflow/index.js';

const log = getLogger('daemon:step-host');

/** The tools step.call runs (one list, shared with the MCP forwarders). */
export { STEP_TOOL_NAMES } from '../../shared/step-context.js';
export type { StepToolName } from '../../shared/step-context.js';

/** A step tool's reply: the MCP tool result the handler returns. */
export interface StepEnvelope {
	readonly content: readonly { readonly type: string; readonly text: string }[];
	readonly isError?: boolean | undefined;
}

/** `progress`: report progress, sent as a 'progress' frame before the reply. */
export type StepToolRunner = (args: unknown, signal: AbortSignal, progress?: (data: unknown) => void, execution?: ConnectionExecutionContext) => Promise<StepEnvelope>;

export interface StepHostOptions {
	/** Test seam: replace or add tool runners. */
	readonly tools?: Partial<Record<string, StepToolRunner>> | undefined;
	/** Test seam: the code-review deps the client and signal are added to. */
	readonly codeReviewDeps?: CodeReviewStepDeps | undefined;
	/** Test seam: the review deps the signal and progress are added to. */
	readonly reviewDeps?: ReviewStepDeps | undefined;
}

/** The table of the seven tools. Only the review and code-review waits take
 *  the signal and report progress; the other handlers run to completion. */
export function stepToolTable(opts: StepHostOptions = {}): Record<string, StepToolRunner> {
	// The workflow step runs the workflow runners, which the daemon otherwise
	// registers only for its own workflow requests (workflow-rpc.ts). The MCP
	// server registered them at its start while it ran the step in-process.
	// Idempotent.
	registerWorkflowRunners();
	const codeReviewBase = opts.codeReviewDeps ?? CODE_REVIEW_DEFAULT_DEPS;
	const table: Record<StepToolName, StepToolRunner> = {
		insrc_analyze:          (args, _signal, _progress, execution) => runAnalyzeOneShot(args, {}, execution),
		insrc_analyze_step:     (args, _signal, _progress, execution) => handleAnalyzeStep(args, execution),
		insrc_workflow_step:    (args) => handleWorkflowStep(args),
		insrc_build_step:       (args) => handleBuildStep(args),
		insrc_review_step:      (args, signal, progress) => handleReviewStep(args, { ...opts.reviewDeps, signal, ...(progress !== undefined ? { progress } : {}) }),
		insrc_code_review_step: (args, signal, progress) => handleCodeReviewStep(args, { ...withStepClient(codeReviewBase), signal, ...(progress !== undefined ? { progress } : {}) }),
		insrc_triage:           (args) => handleTriageStep(args),
	};
	return { ...table, ...opts.tools } as Record<string, StepToolRunner>;
}

/** The request's context, checked: a forwarder always sends a cwd. */
function contextOf(raw: unknown, verifyController: (client: StepClient, cwd: string) => void = (client, cwd) => verifyBoundedCli(client, client, cwd)): StepCallContext | string {
	if (typeof raw !== 'object' || raw === null) return '`context` (object) is required';
	const c = raw as Record<string, unknown>;
	if (typeof c['cwd'] !== 'string' || c['cwd'].length === 0) return '`context.cwd` (non-empty string) is required';
	if (c['envRepo'] !== undefined && typeof c['envRepo'] !== 'string') return '`context.envRepo` must be a string';
	// The client's identity; the daemon maps it to a model family where a family is
	// needed (familyForClient), so a client no family runs still reaches its tools.
	if (c['client'] !== undefined && c['client'] !== 'claude' && c['client'] !== 'codex' && c['client'] !== 'vibe') return "`context.client` must be 'claude', 'codex' or 'vibe'";
 let controllerReview: ControllerExecutionCapability | undefined;
 if (c['controllerReview'] !== undefined) {
  const descriptor = c['controllerReview'];
  if (typeof descriptor !== 'object' || descriptor === null || Array.isArray(descriptor)) return 'invalid isolated controller helper descriptor';
  const d = descriptor as Record<string, unknown>, client = c['client'];
  if ((client !== 'claude' && client !== 'codex' && client !== 'vibe') || d['adapterId'] !== `cli-${client}` || !Number.isSafeInteger(d['maxInputChars']) || (d['maxInputChars'] as number) <= 0 || (d['maxInputChars'] as number) > 384_000 || typeof d['helperEpoch'] !== 'string' || d['helperEpoch'].length === 0 || typeof d['modelLabel'] !== 'string' || !d['modelLabel'].startsWith(`cli-${client}:`) || Object.keys(d).some(k => !['adapterId', 'maxInputChars', 'helperEpoch', 'modelLabel'].includes(k))) return 'unsupported isolated controller helper identity';
  const dir = mkdtempSync(join(tmpdir(), 'insrc-controller-host-'));
  try { verifyController(client, dir); } catch { return 'installed CLI cannot verify isolated controller capability'; } finally { rmSync(dir, { recursive: true, force: true }); }
  controllerReview = { adapterId: d['adapterId'] as ControllerExecutionCapability['adapterId'], maxInputChars: d['maxInputChars'] as number, helperEpoch: d['helperEpoch'], modelLabel: d['modelLabel'] };
 }
 return {
  ...(controllerReview !== undefined ? { controllerReview } : {}),
		cwd: c['cwd'],
		...(typeof c['envRepo'] === 'string' ? { envRepo: c['envRepo'] } : {}),
		...(c['client'] !== undefined ? { client: c['client'] as StepClient } : {}),
	};
}

/** The `step.call` stream handler over `table`. */
export function createStepCallHandler(table: Record<string, StepToolRunner> = stepToolTable(), deps: { readonly verifyControllerCli?: ((client: StepClient, cwd: string) => void) | undefined } = {}): StreamHandler {
	return async (params, send, signal, trusted) => {
        const execution = trusted?.connectionExecution;
        const bound = trusted?.connectionSession !== undefined || execution?.mode === 'session-memory';
		const fail = (code: 'step-unknown-tool' | 'step-failed' | 'session-expired' | 'upgrade-required' | 'unsupported-temporary', error: string): void => {
			send({ id: 0, stream: 'error', data: { code, error, recoverable: false } });
		};
        if (bound) {
         try { requireConnectionExecution(execution); } catch { fail('session-expired', 'Connection session is unavailable.'); return; }
         if (execution?.mode !== 'session-memory' || execution.audience !== 'workbench-ui') { fail('unsupported-temporary', 'Temporary connections are unavailable for this operation.'); return; }
        }
		const p = (typeof params === 'object' && params !== null ? params : {}) as { tool?: unknown; args?: unknown; context?: unknown };
		if (typeof p.tool !== 'string' || !Object.hasOwn(table, p.tool)) {
			fail('step-unknown-tool', `step.call: this daemon has no tool '${String(p.tool)}'. Update the daemon and restart it.`);
			return;
		}
        if (bound && !['insrc_analyze', 'insrc_analyze_step'].includes(String(p.tool))) { fail('upgrade-required', 'This operation is unavailable for this connection session.'); return; }
		const ctx = bound && execution ? { cwd: execution.connectionAccess.lookupRoot, envRepo: execution.connectionAccess.lookupRoot, connectionExecution: execution } : contextOf(p.context, deps.verifyControllerCli);
		if (typeof ctx === 'string') {
			fail('step-failed', `step.call: ${ctx}`);
			return;
		}
  if (ctx.controllerReview !== undefined && p.tool !== 'insrc_code_review_step') { fail('step-failed', 'Isolated controller capability belongs only to code review.'); return; }
		const run = table[p.tool]!;
		// Never fails the step: a send that throws (the caller went away) is logged and dropped,
		// and progress reported after the reply is ignored.
		let answered = false;
		const progress = (data: unknown): void => {
			if (answered) return;
            if (execution) { try { execution.assertActive(); } catch { return; } }
			try {
				send({ id: 0, stream: 'progress', data });
			} catch (err) {
				if (!bound) log.debug({ tool: p.tool, err: err instanceof Error ? err.message : String(err) }, 'step.call: a progress frame was not sent');
			}
		};
		let envelope: StepEnvelope;
		try {
			// The step runs in the client provider context of the family the calling
			// client implies (Claude Code → the family running claude), as an MCP call did.
			const family = familyForClient((ctx as StepCallContext).client);
			const call = (): Promise<StepEnvelope> => run(p.args, signal, progress, execution);
			envelope = await runInStepContext(ctx, () => family !== undefined ? runWithClientProviderContext(family, call) : call());
		} catch (err) {
			answered = true;
			const message = bound ? 'Connection session operation failed.' : err instanceof Error ? err.message : String(err);
			if (!bound) log.warn({ tool: p.tool, err: message }, 'step.call: the handler threw');
			fail('step-failed', message);
			return;
		}
		answered = true;
        if (execution) { try { execution.assertActive(); } catch { fail('session-expired', 'Connection session is unavailable.'); return; } }
		send({ id: 0, stream: 'done', data: envelope });
	};
}
