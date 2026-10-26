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

import { assertAnalysisConnectionExecution } from '../../analyze/connection-access.js';
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
	const tool = getTool(toolId);
	if (tool && ['docs_retrieve', 'docs_project_context', 'docs_summary_get', 'docs_family_list', 'graph_search', 'data_lineage'].includes(tool.id)) assertNoSessionEmbedding(deps.connectionExecution);
	if (!tool) {
		log.error({ toolId }, 'unknown tool');
		return {
			output: `Unknown tool: ${toolId}`,
			format: 'text',
			success: false,
			error: `No tool registered for '${toolId}'`,
		};
	}

	log.info({ id: tool.id }, 'executing tool');

	const needsGate = tool.requiresApproval === true
		|| (typeof tool.requiresApproval === 'function' && tool.requiresApproval(input));
	if (needsGate) {
		log.warn({ id: tool.id }, 'tool requires approval but the gate dispatcher is gone; auto-approving');
	}

	try {
		const result = await tool.execute(input, deps);
		assertAnalysisConnectionExecution(deps.connectionExecution);
		return result;
	} catch (err) {
		if (deps.connectionExecution?.mode === 'session-memory') return { output: 'Temporary connection operation failed.', format: 'text', success: false, error: 'Temporary connection operation failed.' };
		const errMsg = err instanceof Error ? err.message : String(err);
		log.error({ id: tool.id, err: errMsg }, 'tool execution failed');
		return {
			output: `[Tool failed] ${errMsg}`,
			format: 'text',
			success: false,
			error: errMsg,
		};
	}
}
