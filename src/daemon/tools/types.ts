/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Unified Tool type.
 *
 * A Tool is a single capability. Tools are invoked by whatever loop
 * happens to be in front of them -- an LLM tool-call loop, a direct
 * IPC handler, or a CLI subcommand. Cleanup-scrubbed from the previous
 * agent-coupled contract: `ToolDeps.session: Session` (rich agent
 * Session with context manager + provider resolver + access store) was
 * replaced with the minimal `ToolContext { repoPath, send, requestId,
 * signal, todos? }`. Access-gate fields + `AccessPolicy` were removed
 * along with `shared/access.ts`; the next backend can reintroduce
 * gating in a generic form when tool-loop wiring lands.
 */

import type { TSchema } from '@sinclair/typebox';
import type { ApprovalRequest, IpcStreamMessage, LLMProvider } from '../../shared/types.js';
import type { TodosApi } from '../../shared/todos.js';


// ---------------------------------------------------------------------------
// Tool contract
// ---------------------------------------------------------------------------

export type ToolFormat =
	| 'text' | 'markdown' | 'code' | 'json' | 'diff' | 'table';

export interface ToolInput { [key: string]: unknown }

/** Why a tool call failed, as a callable kind (sc5). */
export type ToolFailureKind =
	| 'missing-tool' | 'missing-signin' | 'unreachable' | 'timed-out'
	| 'rejected' | 'conversion-failed' | 'schema-mismatch' | 'denied';

/** Why an approval was not given. Declared here so the executor does not depend on the approval broker. */
export type ToolDenialReason = 'declined' | 'timed-out' | 'no-client' | 'cancelled';

// ---------------------------------------------------------------------------
// Approval (sc4)
// ---------------------------------------------------------------------------

/** How a tool, or one call of it, is approved: never, per the common setting, or every time. */
export type ApprovalClass = 'none' | 'common' | 'destructive';

/** The chat's edits modes; also the values of the tools.commonApproval setting. */
export type CommonApprovalMode = 'manual' | 'edit-auto' | 'auto';

/** Why an approval was not given; the same four values as ToolDenialReason. */
export type ApprovalDenial = ToolDenialReason;

export type { ApprovalRequest };

export interface ApprovalAnswer {
	requestId: string;
	decision: 'approve' | 'decline';
}

/** The daemon-side holder of pending requests; never rejects. */
export interface ApprovalGate {
	ask(req: ApprovalRequest, signal?: AbortSignal): Promise<ApprovalAnswer | ApprovalDenial>;
}

export interface ToolFailure {
	kind: ToolFailureKind;
	message: string;
	/** The tool's own output, truncated, kept for diagnosis. */
	original?: string | undefined;
	/** Present only when kind is 'denied'. */
	denial?: ToolDenialReason | undefined;
}

export interface ToolResult {
	/** Rendered output surfaced to the caller. */
	output: string;
	/** Render hint for the UI. */
	format: ToolFormat;
	/** True when execution completed without an error. */
	success: boolean;
	/** Error message when success is false. */
	error?: string | undefined;
	/**
	 * Optional structured payload for callers that want more than a string
	 * (e.g. web-search exposing its result list to the LLM for further
	 * reasoning without re-parsing the rendered text).
	 */
	data?: unknown;
	/** Typed failure kind; present on a failed result produced by the executor or a typed tool. */
	failure?: ToolFailure | undefined;
}

/** Providers for the two text-conversion roles, resolved by the conversion module. */
export interface ConversionProviders {
	resolveProvider(role: 'tools.convert' | 'tools.convert.escalate'): LLMProvider;
}

export interface ToolDeps {
	/** Active session id. Used by tools that maintain per-session state. */
	sessionId: string;
	/** Workspace root for the current invocation. */
	repoPath: string;
	/** Stream-message emitter for progress events. */
	send: (msg: IpcStreamMessage) => void;
	/** IPC request id -- used to correlate stream events. */
	requestId: number;
	/** Cancellation signal. Tools that run long operations should respect this. */
	signal?: AbortSignal | undefined;
	/**
	 * Pre-built TodosApi scoped to a caller-owned `caller` namespace
	 * (e.g. 'chat'). Tools that persist to TODO-framework storage should
	 * read through this rather than constructing their own instance.
	 */
	todos?: TodosApi | undefined;
	/**
	 * Local Ollama provider for tools that embed (graph_search, artifact
	 * search, data lineage). Optional because not every tool needs an
	 * LLM; tools that depend on it should null-check and emit a clear
	 * error when missing.
	 */
	ollamaProvider?: LLMProvider | undefined;
	/**
	 * Transitive repo-dependency closure for the current session. Used
	 * by graph/lineage tools to scope queries across dependent repos.
	 * Optional; tools that depend on it default to a single-repo query
	 * when missing.
	 */
	closureRepos?: readonly string[] | undefined;
	/**
	 * Providers convertText uses to turn a text-only tool's output into its
	 * declared shape. Optional; a text-only tool fails with 'conversion-failed'
	 * when it is missing.
	 */
	conversion?: ConversionProviders | undefined;
	/**
	 * Who started the call. Set by the entry point; logged, and read by hooks,
	 * never by the approval step for a destructive call (no caller can skip it).
	 */
	caller?: 'agent' | 'daemon' | 'workflow' | undefined;
	/**
	 * The chat session's edits mode for this call, when the call came from a chat.
	 * Overrides tools.commonApproval for the common class only; absent means the
	 * setting applies. Never read for the destructive class.
	 */
	approvalMode?: CommonApprovalMode | undefined;
}

export interface ToolApprovalGate {
	title: string;
	content: string;
	/**
	 * Free-form action descriptors. The cleanup removed the strict
	 * `GateAction` shape; this widens to `Record<string, unknown>` so
	 * existing tool builtins (~110 files) keep their declarations
	 * verbatim. The next backend's gate dispatcher will pin a concrete
	 * action shape when it lands.
	 */
	actions: ReadonlyArray<Record<string, unknown>>;
}

export interface Tool {
	/** Unique canonical ID. Namespacing convention: 'domain:action'. */
	readonly id: string;

	/** One-sentence description -- surfaced to the LLM and to the gate UI. */
	readonly description: string;

	/**
	 * JSON Schema for the input. Used both to advertise the tool to the LLM
	 * and to validate input before execute() runs. Schema validation is
	 * enforced by the executor.
	 */
	readonly inputSchema: Record<string, unknown>;

	/**
	 * Optional typebox schema of the result placed in ToolResult.data. A tool
	 * that declares it has its input and data checked by the executor and can
	 * be called through callTool. Required only for tools that code calls.
	 */
	readonly outputSchema?: TSchema;

	/**
	 * The approval class of this tool, or a function of the input that gives the
	 * class of one call. Absent means none: the tool runs without asking.
	 * 'common' asks per the tools.commonApproval setting or the chat's edits mode;
	 * 'destructive' always asks, whatever the caller, setting, mode or arguments.
	 */
	readonly approval?: ApprovalClass | ((input: ToolInput) => ApprovalClass) | undefined;

	/**
	 * Optional alias IDs. Lets legacy tool names (Read, Bash, WebSearch, ...)
	 * resolve to the canonical entry during migration. Aliases are preferred
	 * over duplicate registrations.
	 */
	readonly aliases?: readonly string[];

	/**
	 * Universal Access Gate declaration -- legacy metadata field. The
	 * `AccessPolicy` type and the access store the executor consulted
	 * were both removed in the cleanup. The field is preserved on the
	 * Tool surface (widened to `unknown`) so the ~110 surviving tool
	 * builtins keep their declarations verbatim; the next backend may
	 * either repurpose this field or define a fresh access surface.
	 */
	readonly access?: unknown;

	/**
	 * Build the approval gate shown to the user. The default gate is
	 * generic -- tools that care should override to show query / command /
	 * diff previews.
	 */
	buildApprovalGate?(input: ToolInput): ToolApprovalGate | Promise<ToolApprovalGate>;

	/** Apply the user's Edit feedback to input before re-gating. */
	applyEdit?(input: ToolInput, feedback: string): ToolInput;

	/** Do the work. */
	execute(input: ToolInput, deps: ToolDeps): Promise<ToolResult>;
}
