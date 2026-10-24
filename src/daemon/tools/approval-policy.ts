/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The pure half of the approval step (sc4): which class a call has, whether it asks, and
 * the request it asks with. No broker and no IO; the executor does the asking.
 *
 *   destructive  always asks. Nothing else is consulted: not the setting, the chat mode,
 *                the caller or the arguments (ac5).
 *   common       asks when the effective mode is manual or edit-auto; the effective mode is the
 *                call's approvalMode (a chat's edits mode) and otherwise tools.commonApproval.
 *   none         never asks.
 */

import { randomUUID } from 'node:crypto';

import { APPROVAL_WAIT_MS } from '../approval-broker.js';
import type { ApprovalClass, ApprovalRequest, CommonApprovalMode, Tool, ToolDeps, ToolInput } from './types.js';

/** A string argument longer than this is truncated for display (the executed call keeps the full value). */
export const ARGUMENT_DISPLAY_MAX = 2000;

/** The class of this call. A class function that throws is treated as destructive, the safe side. */
export function resolveApprovalClass(tool: Pick<Tool, 'approval'>, input: ToolInput): ApprovalClass {
	const a = tool.approval;
	if (a === undefined) return 'none';
	if (typeof a !== 'function') return a;
	try {
		return a(input);
	} catch {
		return 'destructive';
	}
}

/** Whether a call of this class asks the user. `flag` is tools.commonApproval. */
export function shouldAsk(cls: ApprovalClass, deps: Pick<ToolDeps, 'approvalMode'>, flag: CommonApprovalMode): boolean {
	if (cls === 'destructive') return true;
	if (cls === 'none') return false;
	const effective = deps.approvalMode ?? flag;
	return effective === 'manual' || effective === 'edit-auto';
}

function truncate(value: unknown, depth = 0): unknown {
	if (typeof value === 'string') {
		return value.length > ARGUMENT_DISPLAY_MAX
			? `${value.slice(0, ARGUMENT_DISPLAY_MAX)}... [${value.length} characters in total]`
			: value;
	}
	if (depth >= 4 || value === null || typeof value !== 'object') return value;
	if (Array.isArray(value)) return value.map(v => truncate(v, depth + 1));
	return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, truncate(v, depth + 1)]));
}

const genericPreview = (tool: Pick<Tool, 'id'>, args: Record<string, unknown>): { title: string; content: string } => ({
	title: tool.id,
	content: JSON.stringify(args, null, 2),
});

/** The request for this call: the exact tool, repository and arguments, with a preview. */
export async function buildApprovalRequest(opts: {
	readonly tool:  Pick<Tool, 'id' | 'buildApprovalGate'>;
	readonly cls:   'common' | 'destructive';
	readonly input: ToolInput;
	readonly deps:  Pick<ToolDeps, 'repoPath'>;
	readonly now?:  number | undefined;
}): Promise<ApprovalRequest> {
	const { tool, cls, input, deps } = opts;
	const cwd = input['cwd'];
	const args = truncate(input) as Record<string, unknown>;
	let preview = genericPreview(tool, args);
	if (tool.buildApprovalGate !== undefined) {
		try {
			const gate = await tool.buildApprovalGate(input);
			preview = { title: gate.title, content: gate.content };
		} catch {
			// the generic preview stands
		}
	}
	return {
		requestId: randomUUID(),
		toolId: tool.id,
		approvalClass: cls,
		repoPath: typeof cwd === 'string' && cwd.length > 0 ? cwd : deps.repoPath,
		arguments: args,
		preview,
		reason: cls === 'destructive' ? `${tool.id} can destroy work and always asks` : `${tool.id} needs approval`,
		expiresAt: new Date((opts.now ?? Date.now()) + APPROVAL_WAIT_MS).toISOString(),
	};
}
