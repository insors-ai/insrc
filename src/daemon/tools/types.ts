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

import type { IpcStreamMessage, LLMProvider } from '../../shared/types.js';
import type { TodosApi } from '../../shared/todos.js';


// ---------------------------------------------------------------------------
// Tool contract
// ---------------------------------------------------------------------------

export type ToolFormat =
	| 'text' | 'markdown' | 'code' | 'json' | 'diff' | 'table';

export interface ToolInput { [key: string]: unknown }

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
	 * When truthy, the executor fires an Approve / Skip / Edit gate before
	 * calling execute(). A predicate lets a tool opt in per-input (e.g.
	 * shell:exec auto-runs low-risk commands, gates higher-risk ones).
	 *
	 * Gate semantics are deferred to the next backend; the field is
	 * preserved as metadata for now.
	 */
	readonly requiresApproval?: boolean | ((input: ToolInput) => boolean);

	/**
	 * Optional alias IDs. Lets legacy tool names (Read, Bash, WebSearch, ...)
	 * resolve to the canonical entry during migration. Aliases are preferred
	 * over duplicate registrations.
	 */
	readonly aliases?: readonly string[];

	/** Flags the tool as destructive / irreversible. The next backend may apply additional confirms. */
	readonly destructive?: boolean;

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
