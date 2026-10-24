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

import { getLogger } from '../../shared/logger.js';
import { APPROVAL_WAIT_MS } from '../approval-broker.js';
import type { ApprovalClass, ApprovalRequest, CommonApprovalMode, Tool, ToolDeps, ToolInput } from './types.js';

const log = getLogger('approval-policy');

/** A string argument longer than this is truncated for display (the executed call keeps the full value). */
export const ARGUMENT_DISPLAY_MAX = 2000;

/** Nesting deeper than this is not shown; a call that deep is shown as '[nested too deep]'. */
const DISPLAY_MAX_DEPTH = 12;

/** Shown in place of a value whose key names a secret. */
export const REDACTED = '[redacted]';

/** Keys whose values are credentials: shown as REDACTED in the request and its generic preview. */
const SECRET_KEY = /pass(word|wd)?|secret|token|api[-_]?key|account[-_]?key|access[-_]?key|private[-_]?key|credential|authorization|bearer|cookie/i;

/** The class of this call. A class function that throws is treated as destructive, the safe side. */
export function resolveApprovalClass(tool: Pick<Tool, 'approval'>, input: ToolInput): ApprovalClass {
	const a = tool.approval;
	if (a === undefined) return 'none';
	if (typeof a !== 'function') return a;
	try {
		return a(input);
	} catch (err) {
		log.warn({ err: err instanceof Error ? err.message : String(err) }, 'a tool\'s approval function threw; treating the call as destructive');
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

/**
 * The display form of the call's arguments: long strings are cut with their full length noted, values under
 * secret-looking keys are masked, and anything JSON cannot carry (a cycle, a BigInt, a function) is replaced
 * by a marker, so building the request cannot throw. The executed input is never touched.
 */
function display(value: unknown, depth = 0, seen: WeakSet<object> = new WeakSet()): unknown {
	if (typeof value === 'string') {
		return value.length > ARGUMENT_DISPLAY_MAX
			? `${value.slice(0, ARGUMENT_DISPLAY_MAX)}... [${value.length} characters in total]`
			: value;
	}
	if (typeof value === 'bigint') return value.toString();
	if (typeof value === 'function' || typeof value === 'symbol') return `[${typeof value}]`;
	if (value === null || typeof value !== 'object') return value;
	if (seen.has(value)) return '[circular]';
	if (depth >= DISPLAY_MAX_DEPTH) return '[nested too deep]';
	seen.add(value);
	try {
		if (Array.isArray(value)) return value.map(v => display(v, depth + 1, seen));
		return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(
			([k, v]) => [k, SECRET_KEY.test(k) && v !== undefined && v !== null && v !== '' ? REDACTED : display(v, depth + 1, seen)],
		));
	} finally {
		seen.delete(value);
	}
}

/** The repository of a call that names none and has no default. */
export const UNKNOWN_REPO = '(repository unknown: the call names none)';

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
	const args = display(input) as Record<string, unknown>;
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
		repoPath: typeof cwd === 'string' && cwd.length > 0 ? cwd : deps.repoPath.length > 0 ? deps.repoPath : UNKNOWN_REPO,
		arguments: args,
		preview,
		reason: cls === 'destructive' ? `${tool.id} can destroy work and always asks` : `${tool.id} needs approval`,
		expiresAt: new Date((opts.now ?? Date.now()) + APPROVAL_WAIT_MS).toISOString(),
	};
}
