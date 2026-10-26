/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Unified tool executor.
 *
 * Runs a tool by id with the supplied input + deps, in this order: resolve the
 * tool, check the input (a tool that declares an outputSchema), ask for approval,
 * run, check the result. Approval (sc4): a destructive call always asks; a common
 * call asks when the effective mode is manual or edit-auto; a call nobody approves
 * is denied and the tool does not run. The asking is done by the daemon-owned
 * approval broker, which no caller can replace.
 */

import { assertAnalysisConnectionExecution } from '../../analyze/connection-access.js';
import { getLogger } from '../../shared/logger.js';
import { validateAgainstSchema } from '../../agent/providers/structured-output.js';
import type { StructuredSchema } from '../../shared/types.js';
import { readCommonApprovalMode } from '../../shared/common-approval.js';
import { getApprovalGate } from '../approval.js';
import { buildApprovalRequest, resolveApprovalClass, shouldAsk } from './approval-policy.js';
import { runToolHooks } from './hooks.js';
import { getTool } from './registry.js';
import { effectiveToolSignal, runWithToolSignal, runWithoutToolSignal } from './tool-signal.js';
import type { ApprovalDenial, ApprovalGate, CommonApprovalMode, Tool, ToolDeps, ToolFailureKind, ToolInput, ToolResult } from './types.js';

const log = getLogger('tools-executor');

/** failure.original keeps at most this many characters of the tool's own output. */
export const ORIGINAL_MAX_CHARS = 4000;

function failed(kind: ToolFailureKind, message: string, original?: string, denial?: ApprovalDenial): ToolResult {
	return {
		output: message,
		format: 'text',
		success: false,
		error: message,
		failure: {
			kind, message,
			...(original !== undefined ? { original: original.slice(0, ORIGINAL_MAX_CHARS) } : {}),
			...(denial !== undefined ? { denial } : {}),
		},
	};
}

const DENIAL_TEXT: Record<ApprovalDenial, (id: string) => string> = {
	'declined':  id => `the user declined ${id}; nothing was changed`,
	'timed-out': id => `nobody answered the approval request for ${id} in time; it was denied and nothing was changed`,
	'no-client': id => `no client was attached to answer the approval request for ${id}; it was denied and nothing was changed`,
	'cancelled': id => `the approval request for ${id} was cancelled; nothing was changed`,
};

/** Test seam: the gate the executor asks. Production uses the daemon's broker. */
let gate: () => ApprovalGate = getApprovalGate;
export function _setApprovalGateForTests(g: (() => ApprovalGate) | undefined): void { gate = g ?? getApprovalGate; }

/** Test seam: the tools.commonApproval setting. Production reads ~/.insrc/config.json on each call. */
let commonSetting: () => CommonApprovalMode = readCommonApprovalMode;
export function _setCommonApprovalForTests(f: (() => CommonApprovalMode) | undefined): void { commonSetting = f ?? readCommonApprovalMode; }

/**
 * The hook stage (sc1): run the rules registered for the tool, after a successful, checked call.
 * Only a failed rule changes the result: it stays a success and gains hookFailures and one line
 * per failure in its text. With no rule, or none failing, the very object the tool returned is returned.
 */
async function withHooks(tool: Tool, input: ToolInput, deps: ToolDeps, result: ToolResult): Promise<ToolResult> {
	// Hooks never see a tool call's signal, not even the one of an outer call this call is nested in.
	const failures = await runWithoutToolSignal(() => runToolHooks(tool, input, result, deps));
	if (failures.length === 0) return result;
	const lines = failures.map(f => `[hook failed] ${f.hookId}: ${f.message}`).join('\n');
	return { ...result, output: result.output === '' ? lines : `${result.output}\n${lines}`, hookFailures: failures };
}

/** ajv reports a schema it cannot compile as an error list that starts with this text. */
const isCompileError = (errors: readonly string[]): boolean => errors[0]?.startsWith('ajv.compile failed') === true;

export async function executeTool(
	toolId: string,
	input: ToolInput,
	deps: ToolDeps,
): Promise<ToolResult> {
	assertAnalysisConnectionExecution(deps.connectionExecution);
	const tool = getTool(toolId);
	if (!tool) {
		log.error({ toolId }, 'unknown tool');
		return {
			output: `Unknown tool: ${toolId}`,
			format: 'text',
			success: false,
			error: `No tool registered for '${toolId}'`,
			failure: { kind: 'rejected', message: `No tool registered for '${toolId}'` },
		};
	}

	log.info({ id: tool.id }, 'executing tool');

	// A tool that declares an outputSchema is checked on the way in and on the way out;
	// a tool without one is run and returned exactly as before.
	const outputSchema = tool.outputSchema;
	if (outputSchema !== undefined) {
		const inputCheck = validateAgainstSchema(tool.inputSchema as StructuredSchema, input);
		if (!inputCheck.ok) {
			if (isCompileError(inputCheck.errors)) {
				log.error({ id: tool.id, err: inputCheck.errors[0] }, 'tool declares an invalid input schema');
				return failed('rejected', `tool ${tool.id} declares an invalid input or output schema`);
			}
			const message = `input for tool ${tool.id} does not fit its input schema: ${inputCheck.errors.join('; ')}`;
			log.warn({ id: tool.id }, 'tool input rejected');
			return failed('rejected', message);
		}
	}

	// One signal for the whole call: the caller's own combined with the one of an outer tool call this
	// call runs inside. It stops the preview, the approval wait and every subprocess of the tool.
	const signal = effectiveToolSignal(deps.signal);
	const aborted = (): boolean => signal?.aborted === true;
	const cancelledResult = (): ToolResult => failed('denied', DENIAL_TEXT.cancelled(tool.id), undefined, 'cancelled');
	if (aborted()) return cancelledResult();

	// Approval. Nothing but the class, the call's mode and the setting decides whether to ask; a
	// destructive call asks whatever the caller, the mode, the setting or the arguments say.
	const cls = resolveApprovalClass(tool, input);
	if (cls !== 'none' && shouldAsk(cls, deps, cls === 'common' ? commonSetting() : 'auto')) {
		let request: Awaited<ReturnType<typeof buildApprovalRequest>>;
		try {
			request = await runWithToolSignal(signal, () => buildApprovalRequest({ tool, cls, input, deps }));
		} catch (err) {
			// A call that cannot be described to the user must not run; this is a failed result, never a throw.
			const message = `cannot describe ${tool.id} for approval (${err instanceof Error ? err.message : String(err)}); it was not run`;
			log.error({ id: tool.id, err: err instanceof Error ? err.message : String(err) }, 'approval request could not be built; tool not run');
			return failed('rejected', message);
		}
		if (aborted()) return cancelledResult();
		log.info({ id: tool.id, approvalClass: cls, requestId: request.requestId, caller: deps.caller }, 'asking for approval');
		let outcome: Awaited<ReturnType<ApprovalGate['ask']>>;
		try {
			outcome = await gate().ask(request, signal);
		} catch (err) {
			log.error({ id: tool.id, err: err instanceof Error ? err.message : String(err) }, 'approval gate failed; denying');
			outcome = 'no-client';
		}
		// Only a matching approval runs the tool: a denial, a decline, or an answer for another request does not.
		const denial: ApprovalDenial | undefined =
			typeof outcome === 'string' ? outcome
			: outcome.requestId !== request.requestId || outcome.decision !== 'approve' ? 'declined'
			: undefined;
		if (denial !== undefined) {
			log.warn({ id: tool.id, requestId: request.requestId, denial }, 'approval not given; tool not run');
			return failed('denied', DENIAL_TEXT[denial](tool.id), undefined, denial);
		}
	}

	if (aborted()) return cancelledResult();
	try {
		const result = await runWithToolSignal(signal, () => tool.execute(input, deps));
		assertAnalysisConnectionExecution(deps.connectionExecution);
		if (!result.success) return result;
		if (outputSchema === undefined) return await withHooks(tool, input, deps, result);
		if (result.data === undefined) {
			log.warn({ id: tool.id }, 'tool returned no data for its declared output schema');
			return failed('schema-mismatch', `tool ${tool.id} returned no data for its declared output schema`, result.output);
		}
		const dataCheck = validateAgainstSchema(outputSchema as StructuredSchema, result.data);
		if (dataCheck.ok) return await withHooks(tool, input, deps, result);
		if (isCompileError(dataCheck.errors)) {
			log.error({ id: tool.id, err: dataCheck.errors[0] }, 'tool declares an invalid output schema');
			return failed('rejected', `tool ${tool.id} declares an invalid input or output schema`);
		}
		log.warn({ id: tool.id }, 'tool data does not fit its output schema');
		return failed('schema-mismatch', `tool ${tool.id} returned data that does not fit its output schema: ${dataCheck.errors.join('; ')}`, result.output);
	} catch (err) {
		if (deps.connectionExecution?.mode === 'session-memory') return { output: 'Temporary connection operation failed.', format: 'text', success: false, error: 'Temporary connection operation failed.' };
		const errMsg = err instanceof Error ? err.message : String(err);
		log.error({ id: tool.id, err: errMsg }, 'tool execution failed');
		return {
			output: `[Tool failed] ${errMsg}`,
			format: 'text',
			success: false,
			error: errMsg,
			failure: { kind: 'rejected', message: errMsg },
		};
	}
}
