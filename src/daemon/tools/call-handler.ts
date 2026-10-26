/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * tools.call (stream): runs one registry tool for a client with a validated caller.
 *
 * The call belongs to the stream that carries it: the server aborts the stream signal when the
 * client closes the socket, and executeTool turns that into a cancelled approval and a killed
 * process tree. Approvals are not tied to this stream; they go to approval.subscribe clients.
 */

import type { IpcStreamMessage, ToolsCallDone, ToolsCallParams } from '../../shared/types.js';
import type { TrustedRpcContext } from '../request-context.js';
import { executeTool } from './executor.js';
import type { ToolDeps } from './types.js';

const CALLERS: readonly string[] = ['agent', 'daemon', 'workflow'];
const MODES: readonly string[] = ['manual', 'edit-auto', 'auto'];

/** Daemon-side request ids for the calls this handler runs. */
let nextRequestId = 0;

/** The params as a ToolsCallParams, or the reason they are not one. */
function validate(params: unknown): ToolsCallParams | string {
	if (params === null || typeof params !== 'object' || Array.isArray(params)) return 'params must be an object';
	const p = params as Record<string, unknown>;
	if (typeof p['toolId'] !== 'string' || p['toolId'] === '') return 'toolId must be a non-empty string';
	if (p['input'] === null || typeof p['input'] !== 'object' || Array.isArray(p['input'])) return 'input must be an object';
	if (typeof p['repoPath'] !== 'string' || p['repoPath'] === '') return 'repoPath must be a non-empty string';
	if (typeof p['caller'] !== 'string' || !CALLERS.includes(p['caller'])) return "caller must be 'agent', 'daemon' or 'workflow'";
	if (p['approvalMode'] !== undefined && (typeof p['approvalMode'] !== 'string' || !MODES.includes(p['approvalMode']))) {
		return "approvalMode must be 'manual', 'edit-auto' or 'auto'";
	}
	return p as unknown as ToolsCallParams;
}

export async function toolsCall(
	params: unknown,
	send: (msg: IpcStreamMessage) => void,
	signal: AbortSignal,
	context?: TrustedRpcContext | undefined,
): Promise<void> {
	const p = validate(params);
	if (typeof p === 'string') {
		send({ id: 0, stream: 'error', data: { code: 'invalid-params', message: `tools.call: ${p}`, recoverable: true } });
		return;
	}
	const requestId = ++nextRequestId;
	const deps: ToolDeps = {
		connectionExecution: context?.connectionExecution,
		sessionId: context === undefined ? 'tools-call' : `tools-call:${context.connectionIdentity}`,
		repoPath: p.repoPath,
		send,
		requestId,
		signal,
		caller: p.caller,
		approvalMode: p.approvalMode,
	};
	const result = await executeTool(p.toolId, p.input, deps);
	const done: ToolsCallDone = { result };
	send({ id: requestId, stream: 'done', data: done });
}
