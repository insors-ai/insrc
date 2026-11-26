/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The one shared plain-CLI Vibe execution adapter (sc1/sc2, Epic
 * unify-vibe-one-plain-cli-adapter, Story s1). Both the backend provider and
 * the VS Code plugin chat call this module directly; the session-based
 * app-server transport (src/shared/vibe-session.ts) is deleted, not demoted.
 *
 * Built across two Tasks of this Story: t1 (this file's first revision) adds
 * the types, the construction-time factory, and startTurn's request
 * validation/refusal paths -- every refusal happens before any subprocess
 * spawns. t2 completes the turn-execution internals (live event production,
 * process-group cleanup, exit-evidence readback, and the MCP naming split).
 * Nothing imports this module until the consumers are rewired in later Tasks.
 */

import { statSync } from 'node:fs';

export interface VibeAdapterContext {
	readonly cwd: string;
	readonly env?: Readonly<Record<string, string>> | undefined;
	readonly processGroup: 'adapter-owned' | 'supervisor-owned';
}

export interface VibeNewSession {
	readonly kind: 'new';
	readonly model?: string | undefined;
	readonly thinking?: string | undefined;
}

export interface VibeResumedSession {
	readonly kind: 'resume';
	readonly resumeHandle: string;
	/** A resumed turn carries NO model/thinking selection -- the flags are new-session-only. */
	readonly selection?: undefined;
}

export type VibeSessionRequest = VibeNewSession | VibeResumedSession;

/** The existing chat mapping: 'default'/undefined -> no flag, 'manual' -> agent 'ask', 'edit-auto' -> agent 'accept-edits', 'auto' -> auto-approve. */
export type VibeApproval = 'default' | 'manual' | 'edit-auto' | 'auto';

export interface VibeTurnRequest {
	readonly prompt: string;
	readonly outputMode: 'text' | 'json' | 'streaming';
	readonly session: VibeSessionRequest;
	readonly mode: 'default' | 'read-only';
	/** Ordinary sessions only. REJECTED on a mode:'read-only' request. */
	readonly approval?: VibeApproval | undefined;
	readonly readDirs?: readonly string[] | undefined;
	readonly budget?: {
		readonly maxTurns?: number | undefined;
		readonly timeLimitSeconds?: number | undefined;
		readonly maxPriceDollars?: number | undefined;
		readonly maxTokens?: number | undefined;
	} | undefined;
	readonly signal?: AbortSignal | undefined;
	readonly deadlineMs?: number | undefined;
}

export type VibeTurnEvent =
	| { readonly kind: 'session'; readonly sessionId: string; readonly resumeHandle?: string | undefined }
	| { readonly kind: 'status'; readonly phase: 'starting' | 'thinking' | 'refused' }
	| { readonly kind: 'assistant-text'; readonly text: string }
	| { readonly kind: 'tool-call'; readonly toolCallId: string; readonly toolName: string; readonly arguments: Readonly<Record<string, unknown>> }
	| { readonly kind: 'tool-result'; readonly toolCallId: string; readonly ok: boolean; readonly output: string; readonly error?: string | undefined }
	| { readonly kind: 'error'; readonly message: string };

export interface VibeExitEvidence {
	readonly stopReason?: string | undefined;
	readonly outcome?: string | undefined;
	readonly effectiveSelection?: { readonly model?: string | undefined; readonly thinking?: string | undefined } | undefined;
}

export interface VibeTurnResult {
	readonly text: string;
	readonly sessionId?: string | undefined;
	readonly resumeHandle?: string | undefined;
	readonly exitEvidence?: VibeExitEvidence | undefined;
}

export interface VibeExecutionAdapter {
	/** Start a turn; a 'session' event opens it, the result carries identity + exit evidence. */
	startTurn(request: VibeTurnRequest): AsyncIterable<VibeTurnEvent> & { readonly result: Promise<VibeTurnResult> };
}

export interface VibeMcpToolIdentity {
	readonly server: string;
	readonly tool: string;
	readonly streamedName: string;
}

export type VibeDispatchState = 'not-sent' | 'possibly-sent' | 'accepted';

/** Re-homed verbatim from src/shared/vibe-session.ts -- structured-output.ts's retry
 *  classifier keeps using `instanceof VibeTurnError` as the non-retryable refusal marker. */
export class VibeTurnError extends Error {
	constructor(
		readonly dispatchState: VibeDispatchState,
		readonly sessionId: string | undefined,
		cause: unknown,
	) {
		super(cause instanceof Error ? cause.message : 'Vibe turn failed', { cause });
		this.name = 'VibeTurnError';
	}
}

/** Read-only mode has no qualified capability yet -- a later Story of this Epic adds it. */
export class VibeReadOnlyUnavailableError extends Error {
	constructor(reason: string) {
		super(`Vibe read-only mode is unavailable: ${reason}`);
		this.name = 'VibeReadOnlyUnavailableError';
	}
}

/** The read-only authorization is the adapter's own qualified narrow policy, never a caller choice. */
export class VibeReadOnlyApprovalRejectedError extends Error {
	constructor() {
		super('Vibe read-only requests may not carry an approval setting');
		this.name = 'VibeReadOnlyApprovalRejectedError';
	}
}

/** Injectable seam for tests; a caller passing none gets the real filesystem check. */
export interface VibeAdapterDeps {
	readonly statSync?: ((path: string) => { readonly isDirectory: () => boolean }) | undefined;
}

/** The ordinary-session approval mapping chat already applies today
 *  (vscode-plugin/src/chat/vibe-session-process.ts). */
export function mapApprovalFlags(approval: VibeApproval | undefined): Readonly<Record<string, unknown>> {
	if (approval === 'auto') return { autoApprove: true };
	if (approval === 'manual') return { agent: 'ask' };
	if (approval === 'edit-auto') return { agent: 'accept-edits' };
	return {};
}

/** The new-session-only selection flags -- a resumed session's type carries no selection
 *  fields, so only --resume is ever constructed for it. */
export function buildSelectionArgs(session: VibeSessionRequest): readonly string[] {
	if (session.kind === 'resume') return ['--resume', session.resumeHandle];
	const args: string[] = [];
	if (session.model !== undefined) args.push('--model', session.model);
	if (session.thinking !== undefined) args.push('--thinking', session.thinking);
	return args;
}

export function createVibeAdapter(context: VibeAdapterContext, deps: VibeAdapterDeps = {}): VibeExecutionAdapter {
	const stat = deps.statSync ?? statSync;
	if (context.cwd === '') throw new Error('createVibeAdapter: context.cwd must not be empty');
	let isDirectory: boolean;
	try {
		isDirectory = stat(context.cwd).isDirectory();
	} catch (error) {
		throw new Error(`createVibeAdapter: context.cwd is not a directory: ${context.cwd}`, { cause: error });
	}
	if (!isDirectory) throw new Error(`createVibeAdapter: context.cwd is not a directory: ${context.cwd}`);

	return {
		startTurn(request: VibeTurnRequest) {
			if (request.mode === 'read-only') {
				if (request.approval !== undefined) throw new VibeReadOnlyApprovalRejectedError();
				throw new VibeReadOnlyUnavailableError('no qualified capability yet (added in a later Story of this Epic)');
			}
			// Validated and ready to dispatch; turn execution itself (argv/approval
			// mapping consumption, live event production, process-group cleanup,
			// exit-evidence readback) is completed in this Story's next Task.
			mapApprovalFlags(request.approval);
			buildSelectionArgs(request.session);
			throw new Error('vibe-adapter: turn execution is completed in a later Task of this Story (t2)');
		},
	};
}
