/**
 * Cross-agent integration primitives
 * (plans/analyzers/code-analyzer.md Phase 3).
 *
 * Sibling analyzer families (code-analyzer, data-analyzer,
 * deployment-analyzer) call into each other via `<family>:*` tools.
 * When a target family is unregistered, its handler errors, or
 * `crossAgentDepth >= 1`, the registry returns a `TOOL_UNAVAILABLE`
 * sentinel so callers can fall through gracefully (the analyzer's
 * review step downgrades affected tasks; the synthesise step adds
 * a "Consider running /<sibling>" hint to the report).
 *
 * The Code Analyzer's Phase 3 commit registers `code_locate`,
 * `code_trace`, `code_describe`, and `code_analyze`. Sibling
 * families register their own `data:*` / `deploy:*` tools when they
 * ship; the cross-agent envelope here is family-agnostic.
 */

// ---------------------------------------------------------------------------
// Sentinel
// ---------------------------------------------------------------------------

/**
 * Reasons a cross-agent tool dispatch can fail BEFORE invoking the
 * sibling handler. Distinct from in-handler failures (which surface
 * via the regular `success: false` ToolResult path).
 *
 * - `target_analyzer_not_registered` -- the sibling family hasn't
 *   shipped or its tools are feature-flagged off.
 * - `cross_agent_depth_exceeded`     -- `crossAgentDepth >= 1` per
 *   design §13.2; strict cap, no carve-outs.
 * - `handler_timeout`                -- the per-class envelope (60 s
 *   for `*:analyze` Flow-2; 5 s for single-target lookups) elapsed.
 * - `handler_error`                  -- the sibling handler threw.
 */
export type ToolUnavailableReason =
	| 'target_analyzer_not_registered'
	| 'cross_agent_depth_exceeded'
	| 'handler_timeout'
	| 'handler_error';

export interface ToolUnavailableSentinel {
	readonly status: 'unavailable';
	readonly reason: ToolUnavailableReason;
	/** Free-form context (e.g. the timeout value, the underlying error message). */
	readonly note?: string;
}

/**
 * Compose a TOOL_UNAVAILABLE sentinel. Callers downstream (the
 * analyzer's run-task LLM / review step) detect the shape via
 * `result.status === 'unavailable'` and react accordingly.
 */
export function toolUnavailable(
	reason: ToolUnavailableReason,
	note?: string,
): ToolUnavailableSentinel {
	return note !== undefined
		? { status: 'unavailable', reason, note }
		: { status: 'unavailable', reason };
}

/**
 * Bare sentinel for the common `target_analyzer_not_registered`
 * case (matches the plan's §3.3 example). Prefer `toolUnavailable()`
 * when a `note` is useful.
 */
export const TOOL_UNAVAILABLE: ToolUnavailableSentinel = Object.freeze({
	status: 'unavailable',
	reason: 'target_analyzer_not_registered',
});

export function isToolUnavailable(value: unknown): value is ToolUnavailableSentinel {
	return (
		value !== null &&
		typeof value === 'object' &&
		'status' in value &&
		(value as { status: unknown }).status === 'unavailable'
	);
}

// ---------------------------------------------------------------------------
// crossAgentDepth (design §13.2)
// ---------------------------------------------------------------------------

/**
 * Hard cap on cross-agent recursion. `0` = the run started without a
 * cross-agent hop; `1` = the current handler was invoked AS a
 * cross-agent dispatch and may NOT trigger another. Strict; no
 * tiered escalation.
 */
export const MAX_CROSS_AGENT_DEPTH = 1;

/**
 * Conventional input field carrying the depth counter through tool
 * dispatches. Tool input shapes that participate in the cross-agent
 * surface declare this field optional (caller may omit on the first
 * hop -> treated as 0). We use a leading underscore so the LLM-
 * facing schemas don't surface it as a normal arg.
 */
export const CROSS_AGENT_DEPTH_FIELD = '_crossAgentDepth';

/**
 * Read the depth counter from a tool input bag. Missing / non-number
 * values are treated as 0 (the entry-point default).
 */
export function readCrossAgentDepth(input: { [k: string]: unknown }): number {
	const raw = input[CROSS_AGENT_DEPTH_FIELD];
	if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) {
		return 0;
	}
	return Math.floor(raw);
}

/**
 * Returns the depth value to pass to a NESTED cross-agent dispatch
 * from inside a handler that received `currentDepth`. Equivalent to
 * `currentDepth + 1`, exposed as a helper so call sites read clearly.
 */
export function incrementCrossAgentDepth(currentDepth: number): number {
	return currentDepth + 1;
}

/**
 * Predicate: is the current cross-agent dispatch over the cap?
 * Tools call this on entry and return `TOOL_UNAVAILABLE` (reason
 * `cross_agent_depth_exceeded`) when true.
 */
export function exceedsCrossAgentDepth(depth: number): boolean {
	return depth >= MAX_CROSS_AGENT_DEPTH;
}
