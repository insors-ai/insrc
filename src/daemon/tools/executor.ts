/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Unified tool executor.
 *
 * Runs a tool by id with the supplied input + deps. Cleanup-scrubbed:
 * the approval-gate dispatcher (channel.registerExternalGate, GateAction,
 * the destructive double-confirm flow) is gone with the agent framework.
 * Tools that declare `requiresApproval: true` now auto-approve with a
 * log line; the next backend reintroduces a real gate dispatcher when
 * the chat-loop wiring lands.
 */

import { getLogger } from '../../shared/logger.js';
import { validateAgainstSchema } from '../../agent/providers/structured-output.js';
import type { StructuredSchema } from '../../shared/types.js';
import { getTool } from './registry.js';
import type { ToolDeps, ToolFailureKind, ToolInput, ToolResult } from './types.js';

const log = getLogger('tools-executor');

/** failure.original keeps at most this many characters of the tool's own output. */
const ORIGINAL_MAX_CHARS = 4000;

function failed(kind: ToolFailureKind, message: string, original?: string): ToolResult {
	return {
		output: message,
		format: 'text',
		success: false,
		error: message,
		failure: { kind, message, ...(original !== undefined ? { original: original.slice(0, ORIGINAL_MAX_CHARS) } : {}) },
	};
}

/** ajv reports a schema it cannot compile as an error list that starts with this text. */
const isCompileError = (errors: readonly string[]): boolean => errors[0]?.startsWith('ajv.compile failed') === true;

export async function executeTool(
	toolId: string,
	input: ToolInput,
	deps: ToolDeps,
): Promise<ToolResult> {
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

	const needsGate = tool.requiresApproval === true
		|| (typeof tool.requiresApproval === 'function' && tool.requiresApproval(input));
	if (needsGate) {
		log.warn({ id: tool.id }, 'tool requires approval but the gate dispatcher is gone; auto-approving');
	}

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

	try {
		const result = await tool.execute(input, deps);
		if (outputSchema === undefined || !result.success) return result;
		if (result.data === undefined) {
			log.warn({ id: tool.id }, 'tool returned no data for its declared output schema');
			return failed('schema-mismatch', `tool ${tool.id} returned no data for its declared output schema`, result.output);
		}
		const dataCheck = validateAgainstSchema(outputSchema as StructuredSchema, result.data);
		if (dataCheck.ok) return result;
		if (isCompileError(dataCheck.errors)) {
			log.error({ id: tool.id, err: dataCheck.errors[0] }, 'tool declares an invalid output schema');
			return failed('rejected', `tool ${tool.id} declares an invalid input or output schema`);
		}
		log.warn({ id: tool.id }, 'tool data does not fit its output schema');
		return failed('schema-mismatch', `tool ${tool.id} returned data that does not fit its output schema: ${dataCheck.errors.join('; ')}`, result.output);
	} catch (err) {
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
