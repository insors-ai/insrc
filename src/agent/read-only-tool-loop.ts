/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The generic read-only tool loop (Epic 8315a11f s1, plan task t5): a model
 * reads the repository through tools, turn by turn, until it stops asking for
 * tools. Extracted from the analyzer's tool loop so the analyzer and the Ollama
 * reviewer session run the same loop.
 *
 * Read-only is enforced where tools RUN, not only by what is advertised: every
 * tool call the model returns is resolved (aliases included) and checked against
 * the caller's allowlist before it is dispatched. A call outside the list is
 * never executed; the model is told the tool is not available.
 */

import { isAbsolute, resolve } from 'node:path';

import { executeTool } from '../daemon/tools/executor.js';
import { getTool } from '../daemon/tools/registry.js';
import { getLogger } from '../shared/logger.js';
import type { ToolDeps, ToolResult } from '../daemon/tools/types.js';
import type { ContentBlock, LLMMessage, LLMProvider, LLMResponse, StructuredSchema, ToolDefinition } from '../shared/types.js';

const log = getLogger('read-only-tool-loop');

/** One tool interaction, reported as it happens (the analyzer's live steps). */
export type ToolLoopTraceEvent =
	| { readonly type: 'tool-call'; readonly tool: string; readonly input: unknown }
	| { readonly type: 'tool-response'; readonly tool: string; readonly ok: boolean; readonly output: ToolResult['output'] };

/** What one tool returned, kept so a loop that runs out of turns does not lose it. */
export interface GatheredToolOutput {
	readonly tool:   string;
	readonly input:  unknown;
	readonly output: ToolResult['output'];
}

export interface ReadOnlyToolLoopArgs {
	readonly provider: LLMProvider;
	readonly messages: readonly LLMMessage[];
	/** The tools advertised to the model. */
	readonly tools:    readonly ToolDefinition[];
	/** Canonical ids the loop may EXECUTE. Checked for every returned call. */
	readonly allow:    ReadonlySet<string>;
	readonly deps:     ToolDeps;
	/** The directory tools work in. The tools resolve paths against the daemon's
	 *  own cwd, so when set, a relative path argument is resolved against it, and an
	 *  optional root argument (`cwd`, or a `path` the tool does not require) that is
	 *  absent defaults to it. Absent: inputs pass through unchanged. */
	readonly root?:    string | undefined;
	readonly maxTurns: number;
	/** Cancels the loop: the turn in flight is aborted and no further turn or tool runs. */
	readonly signal?:  AbortSignal | undefined;
	/** Epoch ms after which no further turn starts ({@link ToolLoopDeadlineError}). */
	readonly deadlineAt?: number | undefined;
	readonly onTrace?: ((event: ToolLoopTraceEvent) => void) | undefined;
	/** Seam for tests; production dispatches through the tool executor. */
	readonly execute?: ((name: string, input: unknown, deps: ToolDeps) => Promise<ToolResult>) | undefined;
	readonly now?:     (() => number) | undefined;
}

export type ReadOnlyToolLoopResult =
	| { readonly done: true;  readonly messages: LLMMessage[]; readonly toolCallCount: number }
	| { readonly done: false; readonly messages: LLMMessage[]; readonly toolCallCount: number; readonly gathered: readonly GatheredToolOutput[] };

/** The loop's deadline passed before a turn could start. */
export class ToolLoopDeadlineError extends Error {
	constructor(readonly deadlineAt: number) {
		super(`the tool loop passed its deadline (${new Date(deadlineAt).toISOString()})`);
		this.name = 'ToolLoopDeadlineError';
	}
}

/** Run the loop. Returns `done: false` with everything gathered when the turns run out;
 *  the caller decides what that means. Model errors propagate unchanged. */
export async function runReadOnlyToolLoop(args: ReadOnlyToolLoopArgs): Promise<ReadOnlyToolLoopResult> {
	const execute = args.execute ?? ((name: string, input: unknown, deps: ToolDeps) => executeTool(name, input as never, deps));
	// A tool that runs long sees the loop's cancellation too.
	const deps: ToolDeps = args.signal !== undefined ? { ...args.deps, signal: args.signal } : args.deps;
	const now = args.now ?? Date.now;
	const convo: LLMMessage[] = [...args.messages];
	const gathered: GatheredToolOutput[] = [];
	let toolCallCount = 0;

	// The allowlist is checked here, where tools run: a registered tool outside it
	// is never executed. A name nothing is registered under gets the executor's
	// own answer (it can run nothing).
	const dispatch = async (name: string, input: unknown): Promise<ToolResult> => {
		const tool = getTool(name);
		if (tool === undefined) return unknownTool(name);
		if (!args.allow.has(tool.id)) return refused(name, tool.id);
		return execute(name, args.root !== undefined ? rootedInput(tool.inputSchema, input, args.root) : input, deps);
	};

	for (let turn = 0; turn < args.maxTurns; turn++) {
		throwIfAborted(args.signal);
		if (args.deadlineAt !== undefined && now() >= args.deadlineAt) throw new ToolLoopDeadlineError(args.deadlineAt);

		// disableThinking: true is critical for the qwen3.6 family -- without
		// `think: false` the model emits empty bodies (memory: qwen3_6_needs_think_false).
		const response: LLMResponse = await args.provider.complete(convo, {
			tools:           [...args.tools],
			toolChoice:      'auto',
			disableThinking: true,
			...(args.signal !== undefined ? { signal: args.signal } : {}),
		});

		const toolCalls = response.toolCalls ?? [];
		if (response.stopReason !== 'tool_use' || toolCalls.length === 0) {
			if (response.text.length > 0) convo.push({ role: 'assistant', content: response.text });
			return { done: true, messages: convo, toolCallCount };
		}

		// The assistant's tool_use turn, verbatim, so the next round sees its decisions.
		const assistantBlocks: ContentBlock[] = [];
		if (response.text.length > 0) assistantBlocks.push({ type: 'text', text: response.text });
		for (const call of toolCalls) {
			assistantBlocks.push({ type: 'tool_use', id: call.id, name: call.name, input: call.input });
		}
		convo.push({ role: 'assistant', content: assistantBlocks });

		// Serial, like every provider call in this codebase.
		const resultBlocks: ContentBlock[] = [];
		for (const call of toolCalls) {
			throwIfAborted(args.signal);
			toolCallCount += 1;
			args.onTrace?.({ type: 'tool-call', tool: call.name, input: call.input });
			const result = await dispatch(call.name, call.input);
			args.onTrace?.({ type: 'tool-response', tool: call.name, ok: result.success !== false, output: result.output });
			resultBlocks.push({ type: 'tool_result', tool_use_id: call.id, content: result.output, isError: result.success === false });
			gathered.push({ tool: call.name, input: call.input, output: result.output });
		}
		convo.push({ role: 'user', content: resultBlocks });
	}
	return { done: false, messages: convo, toolCallCount, gathered };
}

export interface StructuredAnswerArgs {
	readonly provider:    LLMProvider;
	/** The conversation so far (typically a tool loop's messages). */
	readonly messages:    readonly LLMMessage[];
	/** The final user turn asking for the answer; the schema reminder goes here (structural reference trails). */
	readonly instruction: string;
	readonly schema:      StructuredSchema;
	/** The provider's own attempt budget. Ignored when `internalRetry` is false. */
	readonly maxAttempts?:   number | undefined;
	/** false: exactly one attempt; the caller owns retries. */
	readonly internalRetry?: boolean | undefined;
	readonly maxTokens?:     number | undefined;
	readonly signal?:        AbortSignal | undefined;
	readonly onToken?:       ((delta: string) => void) | undefined;
}

/** Ask for the loop's structured answer: the conversation plus one closing
 *  instruction, answered against `schema`. Model errors propagate unchanged. */
export async function emitStructuredAnswer<T>(args: StructuredAnswerArgs): Promise<T> {
	throwIfAborted(args.signal);
	const messages: LLMMessage[] = [...args.messages, { role: 'user', content: args.instruction }];
	return args.provider.completeStructured<T>(messages, args.schema, {
		// Critical for qwen3.6 (memory: qwen3_6_needs_think_false); harmless elsewhere.
		disableThinking: true,
		...(args.maxAttempts !== undefined ? { maxAttempts: args.maxAttempts } : {}),
		...(args.internalRetry !== undefined ? { internalRetry: args.internalRetry } : {}),
		...(args.maxTokens !== undefined ? { maxTokens: args.maxTokens } : {}),
		...(args.signal !== undefined ? { signal: args.signal } : {}),
		...(args.onToken !== undefined ? { onToken: args.onToken } : {}),
	});
}

/** Path arguments the file, search and git tools take. */
const PATH_KEYS = ['path', 'file_path', 'cwd', 'from', 'to'] as const;

/** `input` with its path arguments anchored at `root` (see {@link ReadOnlyToolLoopArgs.root}). */
export function rootedInput(schema: unknown, input: unknown, root: string): unknown {
	if (input === null || typeof input !== 'object' || Array.isArray(input)) return input;
	const out: Record<string, unknown> = { ...(input as Record<string, unknown>) };
	const props = (schema as { properties?: Record<string, unknown> } | undefined)?.properties ?? {};
	const required = new Set((schema as { required?: readonly string[] } | undefined)?.required ?? []);
	for (const key of PATH_KEYS) {
		if (!(key in props)) continue;
		const v = out[key];
		if (typeof v === 'string' && v.length > 0) {
			if (!isAbsolute(v)) out[key] = resolve(root, v);
		} else if (v === undefined && !required.has(key) && (key === 'cwd' || key === 'path')) {
			out[key] = root;
		}
	}
	return out;
}

function unknownTool(name: string): ToolResult {
	return { output: `Unknown tool: ${name}`, format: 'text', success: false, error: `No tool registered for '${name}'` };
}

function refused(name: string, id: string): ToolResult {
	log.warn({ tool: name, id }, 'read-only tool loop: refused a call to a tool outside the allowlist; it was not executed');
	return {
		output:  `Tool '${name}' is not available in this session. Only the read-only tools offered to you can be used.`,
		format:  'text',
		success: false,
		error:   `tool '${name}' is not on the allowlist`,
	};
}

function throwIfAborted(signal: AbortSignal | undefined): void {
	if (signal?.aborted !== true) return;
	const err = new Error('the call was cancelled');
	err.name = 'AbortError';
	throw err;
}
