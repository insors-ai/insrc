/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Tool hook registry (sc1). A rule is registered once against a tool's canonical id and runs
 * after that tool succeeds, for every caller. executeTool calls runToolHooks at its two success
 * exits; a failing rule is reported, never thrown, and never changes whether the tool succeeded.
 * The stage has no cancellation bound: a rule that never settles holds the call.
 */

import { getLogger } from '../../shared/logger.js';
import { getTool } from './registry.js';
import type { HookFailure, Tool, ToolDeps, ToolHook, ToolResult } from './types.js';

const log = getLogger('tools-hooks');

/** HookFailure.message is cut to this many characters. */
export const HOOK_MESSAGE_MAX = 500;
const NO_MESSAGE = 'the rule failed with no message';
const UNDESCRIBABLE = 'the rule failed with a value that could not be described';
const NOT_COPIED = 'the result could not be copied for the rule';

const hooks = new Map<string, ToolHook[]>();

/** Register a rule against a tool's canonical id. Called from daemon start-up; a mistake throws. */
export function registerToolHook(hook: ToolHook): void {
	if (hook.id.trim() === '') throw new Error('registerToolHook: the hook id is empty');
	if (hook.toolId.trim() === '') throw new Error(`registerToolHook: hook ${hook.id} names no tool`);
	const tool = getTool(hook.toolId);
	if (tool !== undefined && tool.id !== hook.toolId) {
		throw new Error(`registerToolHook: ${hook.toolId} is an alias; register hook ${hook.id} under the canonical id ${tool.id}`);
	}
	const list = hooks.get(hook.toolId) ?? [];
	if (list.some(h => h.id === hook.id)) {
		throw new Error(`registerToolHook: hook ${hook.id} is already registered for ${hook.toolId}`);
	}
	hooks.set(hook.toolId, [...list, hook]);
}

/** Test seam: forget every registered hook. */
export function _resetToolHooksForTests(): void { hooks.clear(); }

/** Words for a thrown value. Never throws: whatever cannot be converted or measured gets a fixed text. */
function describe(thrown: unknown): string {
	try {
		const raw: unknown = thrown instanceof Error ? thrown.message : String(thrown);
		const text = typeof raw === 'string' ? raw : String(raw);
		return text.trim() === '' ? NO_MESSAGE : text.slice(0, HOOK_MESSAGE_MAX);
	} catch {
		return UNDESCRIBABLE;
	}
}

/**
 * Run the rules registered for a tool, one at a time in registration order. Each rule gets its own
 * deep copy of the input and the result, so nothing it does reaches the caller or the next rule.
 * Rules are looked up by the resolved tool's canonical id, never by the name the caller used.
 */
export async function runToolHooks(tool: Tool, input: unknown, result: ToolResult, deps: ToolDeps): Promise<readonly HookFailure[]> {
	const list = hooks.get(tool.id);
	if (list === undefined) return [];
	const failures: HookFailure[] = [];
	for (const hook of list) {
		log.info({ hookId: hook.id, toolId: tool.id, caller: deps.caller }, 'running tool hook');
		try {
			let ctxInput: unknown;
			let ctxResult: ToolResult;
			try {
				ctxInput = structuredClone(input);
				ctxResult = structuredClone(result);
			} catch {
				failures.push({ hookId: hook.id, message: NOT_COPIED });
				log.warn({ hookId: hook.id, toolId: tool.id, caller: deps.caller }, NOT_COPIED);
				continue;
			}
			await hook.run({ toolId: tool.id, input: ctxInput, result: ctxResult, caller: deps.caller });
		} catch (err) {
			const message = describe(err);
			failures.push({ hookId: hook.id, message });
			log.warn({ hookId: hook.id, toolId: tool.id, caller: deps.caller, err: message }, 'tool hook failed');
		}
	}
	return failures;
}
