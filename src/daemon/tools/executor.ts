import { connectionExecutionErrorCode, ConnectionExecutionError, runWithConnectionExecution } from '../../shared/step-context.js';
import { isReadOnlyShaperTool } from '../../analyze/context/tool-surface.js';
import { assertNoSessionEmbedding } from '../../shared/connection-provider.js';
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

import { assertAnalysisConnectionExecution, captureAnalysisDiagnostics } from '../../analyze/connection-access.js';
import { getLogger } from '../../shared/logger.js';
import { getTool } from './registry.js';
import type { ToolDeps, ToolInput, ToolResult } from './types.js';

const log = getLogger('tools-executor');

export async function executeTool(
	toolId: string,
	input: ToolInput,
	deps: ToolDeps,
): Promise<ToolResult> {
	assertAnalysisConnectionExecution(deps.connectionExecution);
	const execution = deps.connectionExecution;
	const diagnostics = captureAnalysisDiagnostics(log, execution);
	const tool = getTool(toolId);
	if (execution?.mode === 'session-memory' && (!tool || !isReadOnlyShaperTool(tool.id))) throw new ConnectionExecutionError('unsupported-temporary');
	if (tool && ['docs_retrieve', 'docs_project_context', 'docs_summary_get', 'docs_family_list', 'graph_search', 'data_lineage'].includes(tool.id)) assertNoSessionEmbedding(deps.connectionExecution);
	if (!tool) {
		diagnostics.emit('error', () => [{ toolId }, 'unknown tool']);
		return {
			output: `Unknown tool: ${toolId}`,
			format: 'text',
			success: false,
			error: `No tool registered for '${toolId}'`,
		};
	}

	diagnostics.emit('info', () => [{ id: tool.id }, 'executing tool']);

	try {
	const needsGate = tool.requiresApproval === true
		|| (typeof tool.requiresApproval === 'function' && tool.requiresApproval(input));
	if (needsGate) {
			diagnostics.emit('warn', () => [{ id: tool.id }, 'tool requires approval but the gate dispatcher is gone; auto-approving']);
	}

		const result = await runWithConnectionExecution(execution, () => tool.execute(input, deps));
		assertAnalysisConnectionExecution(deps.connectionExecution);
		if (execution?.mode === 'session-memory' && !result.success) return { output: 'Temporary connection operation failed.', format: 'text', success: false, error: 'Temporary connection operation failed.' };
		return result;
	} catch (err) {
		assertAnalysisConnectionExecution(execution);
		const code = execution?.mode === 'session-memory' ? connectionExecutionErrorCode(err) : undefined; if (code) throw new ConnectionExecutionError(code);
		if (execution?.mode === 'session-memory') return { output: 'Temporary connection operation failed.', format: 'text', success: false, error: 'Temporary connection operation failed.' };
		const errMsg = err instanceof Error ? err.message : String(err);
		diagnostics.emit('error', () => [{ id: tool.id, err: errMsg }, 'tool execution failed']);
		return {
			output: `[Tool failed] ${errMsg}`,
			format: 'text',
			success: false,
			error: errMsg,
		};
	}
}
