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
 * Built across two Tasks of this Story: t1 added the types, the
 * construction-time factory, and startTurn's request validation/refusal
 * paths. t2 (this revision) completes the turn-execution internals: live
 * JSONL event production (the installed `vibe` 3.1.4 binary's headless
 * `--output streaming` emits one whole journal entry per line -- the same
 * {type, role, content/detail/state} shape vibe-session.ts's historyLines
 * already parses from the app-server's live JSON-RPC notifications, live-
 * confirmed against the real binary for this Task), the dual process-group
 * policy with cleanup on every exit path, exit-evidence readback from
 * --output-dir export.json, the MCP naming split, and runVibeTurn -- the
 * adapter-owned turn entry whose parameter shape is the OLD VibeTurnOptions
 * (from vibe-session.ts) so a later Task's call-site re-point is mechanical.
 * Nothing imports this module until the consumers are rewired in later Tasks.
 */

import { spawn as nodeSpawn } from 'node:child_process';
import { statSync } from 'node:fs';
import { mkdtemp as mkdtempAsync, readFile as readFileAsync, rm as rmAsync } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Readable, Writable } from 'node:stream';

import { killProcessGroup } from './process-group.js';
import { onUtf8Data } from './utf8-stream.js';

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

/** General MCP identity parsing: ANY insrc MCP tool as the installed CLI spells it
 *  (`mcp_<server>.<tool>`, live-confirmed against vibe 3.1.4) -- the chat's
 *  tool-activity parser uses this, including insrc_present. */
export interface VibeMcpNaming {
	readonly fromStreamedName: (streamedName: string) => VibeMcpToolIdentity | undefined;
}

/** The restricted analysis allowlist for read-only sessions -- a fixed set, NOT the general naming. */
export type VibeInsrcAnalysisToolId = 'insrc_analyze' | 'insrc_analyze_step';
export const VIBE_INSRC_ANALYSIS_TOOL_IDS: readonly VibeInsrcAnalysisToolId[] = ['insrc_analyze', 'insrc_analyze_step'];

const INSRC_SERVER_NAME = 'insrc';

/** `mcp_insrc.insrc_analyze` -> {server:'insrc', tool:'insrc_analyze', ...}; anything that
 *  isn't `mcp_<server>.<tool>` for server 'insrc' (a vibe-native tool like `read_file`,
 *  or another MCP server entirely) returns undefined -- never a guess. */
export function fromStreamedName(streamedName: string): VibeMcpToolIdentity | undefined {
	const prefix = 'mcp_';
	if (!streamedName.startsWith(prefix)) return undefined;
	const rest = streamedName.slice(prefix.length);
	const dot = rest.indexOf('.');
	if (dot <= 0 || dot >= rest.length - 1) return undefined;
	const server = rest.slice(0, dot);
	if (server !== INSRC_SERVER_NAME) return undefined;
	return { server, tool: rest.slice(dot + 1), streamedName };
}

export const vibeMcpNaming: VibeMcpNaming = { fromStreamedName };

export type VibeDispatchState = 'not-sent' | 'possibly-sent' | 'accepted';

/** A cancelled turn's AbortError keeps its recognizable name/identity (callers
 *  distinguish cancellation from an operational failure by `name === 'AbortError'`,
 *  the same convention used throughout this codebase) but still carries the
 *  dispatch state it had at the moment of cancellation, via this same-named
 *  property, so a caller that only cares about replay safety (not the
 *  cancel-vs-failure distinction) can read it off either error shape. */
export function vibeDispatchState(error: unknown): VibeDispatchState | undefined {
	if (error instanceof VibeTurnError) return error.dispatchState;
	if (error instanceof Error && error.name === 'AbortError') {
		const state = (error as { dispatchState?: unknown }).dispatchState;
		if (state === 'not-sent' || state === 'possibly-sent' || state === 'accepted') return state;
	}
	return undefined;
}

/** Re-homed verbatim from src/shared/vibe-session.ts -- structured-output.ts's retry
 *  classifier keeps using `instanceof VibeTurnError` as the non-retryable refusal marker.
 *  `mutating` marks a turn that could have executed an approved tool call --
 *  withTransientRetry uses it together with `dispatchState` to refuse replaying a turn
 *  whose effects on disk may already have happened. Only 'manual' (--approval-policy
 *  ask) is verified safe: the installed CLI denies every tool call outright in headless
 *  mode when there is no one to answer (live-confirmed -- "needs approval, which a
 *  headless run cannot give"), so a turn dispatched that way can never have mutated
 *  anything. Every other value, INCLUDING 'default'/undefined, is treated as mutating:
 *  the installed CLI's own `default_approval_policy` config setting governs an omitted
 *  policy (its own --help: "Defaults to the 'default_approval_policy' config setting"),
 *  and that setting's own default is 'accept-edits' -- an omitted policy can silently
 *  approve an edit before a later transient failure, which review finding r2-1 caught
 *  this class had wrongly assumed was safe to replay. */
export class VibeTurnError extends Error {
	constructor(
		readonly dispatchState: VibeDispatchState,
		readonly sessionId: string | undefined,
		cause: unknown,
		readonly mutating: boolean = false,
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

/** The installed tool's own fast, deterministic model-selection failure (live-confirmed
 *  wording: `Error: Unknown model: <alias>. Available: ...`) -- never retried; the shared
 *  isTransientCliError classifier does not match this wording either, so a caller that
 *  runs this error's message through it will not retry. */
export class VibeSelectionError extends Error {
	constructor(detail: string) {
		super(`Vibe model selection failed: ${detail}`);
		this.name = 'VibeSelectionError';
	}
}

const MODEL_SELECTION_FAILURE = /Error: Unknown model: .*\. Available: /;

/** A minimal child-process shape so tests can inject a fake one; satisfied by node's real ChildProcess. */
export interface VibeChildProcess {
	readonly pid: number | undefined;
	readonly stdout: Readable | null;
	readonly stderr: Readable | null;
	readonly stdin: Writable | null;
	on(event: 'exit' | 'close', listener: (code: number | null, signal: NodeJS.Signals | null) => void): void;
	once(event: 'error', listener: (error: Error) => void): void;
	kill(signal?: NodeJS.Signals): void;
}

/** Injectable seams for tests; a caller passing none gets the real filesystem/process primitives. */
export interface VibeAdapterDeps {
	readonly statSync?: ((path: string) => { readonly isDirectory: () => boolean }) | undefined;
	readonly spawn?: ((command: string, args: readonly string[], options: { readonly cwd?: string | undefined; readonly env?: Readonly<Record<string, string>> | undefined; readonly detached: boolean }) => VibeChildProcess) | undefined;
	readonly killProcessGroup?: ((pid: number) => void) | undefined;
	readonly mkdtemp?: (() => Promise<string>) | undefined;
	readonly readFile?: ((path: string) => Promise<string>) | undefined;
	readonly rm?: ((path: string) => Promise<void>) | undefined;
	/** The `vibe` binary name/path; defaults to 'vibe', the same bare command cli-provider.ts resolves. */
	readonly command?: string | undefined;
}

function record(value: unknown): Record<string, unknown> | undefined {
	return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

/** The existing chat precedence (vscode-plugin's emitEffectResult): outputText, else output,
 *  else the error message, else reason, else empty -- never an empty payload when any of these exist. */
function normalizeToolResultOutput(state: Record<string, unknown> | undefined): string {
	if (state === undefined) return '';
	const outputText = state['outputText'];
	if (typeof outputText === 'string' && outputText !== '') return outputText;
	const output = state['output'];
	if (typeof output === 'string' && output !== '') return output;
	const error = record(state['error']);
	const errorMessage = error?.['message'];
	if (typeof errorMessage === 'string' && errorMessage !== '') return errorMessage;
	const reason = state['reason'];
	if (typeof reason === 'string' && reason !== '') return reason;
	return '';
}

/** Parses one whole headless-streaming journal-entry line (vibe 3.1.4, live-confirmed) into
 *  zero or more rich events, plus the row's sessionId when present. A 'message'/user row (the
 *  echoed prompt) and a 'reasoning' row's own text are not surfaced as distinct event kinds
 *  beyond 'status'; an unrecognized row yields no events rather than guessing. */
function parseJournalLine(line: string): { readonly events: readonly VibeTurnEvent[]; readonly sessionId: string | undefined; readonly assistantText: string | undefined } {
	let parsed: unknown;
	try { parsed = JSON.parse(line); } catch { return { events: [], sessionId: undefined, assistantText: undefined }; }
	const row = record(parsed);
	if (row === undefined) return { events: [], sessionId: undefined, assistantText: undefined };
	const sessionId = typeof row['sessionId'] === 'string' ? row['sessionId'] : undefined;
	const type = row['type'];
	const events: VibeTurnEvent[] = [];
	let assistantText: string | undefined;

	if (type === 'message' && row['role'] === 'assistant' && Array.isArray(row['content'])) {
		const texts: string[] = [];
		for (const block of row['content']) {
			const item = record(block);
			if (item?.['type'] === 'text' && typeof item['text'] === 'string') texts.push(item['text']);
		}
		if (texts.length > 0) {
			assistantText = texts.join('');
			events.push({ kind: 'assistant-text', text: assistantText });
		}
	} else if (type === 'reasoning') {
		events.push({ kind: 'status', phase: 'thinking' });
	} else if (type === 'effect') {
		const toolCallId = row['toolCallId'];
		const detail = record(row['detail']);
		const toolName = detail?.['toolName'];
		if (typeof toolCallId === 'string' && typeof toolName === 'string') {
			events.push({ kind: 'tool-call', toolCallId, toolName, arguments: record(detail?.['input']) ?? {} });
			const state = record(row['state']);
			const status = state?.['status'];
			if (status === 'completed' || status === 'failed' || status === 'cancelled' || status === 'skipped') {
				const ok = status === 'completed';
				const output = normalizeToolResultOutput(state);
				events.push({ kind: 'tool-result', toolCallId, ok, output, ...(ok ? {} : { error: output }) });
			}
		}
	} else if (type === 'error') {
		const message = row['message'];
		events.push({ kind: 'error', message: typeof message === 'string' ? message : 'Vibe turn error' });
	}
	return { events, sessionId, assistantText };
}

/** Reads back `stop_reason`/`outcome`/the effective model from --output-dir's export.json
 *  (live-confirmed field names: snake_case, config.active_model). A missing file, invalid
 *  JSON, or a shape without these fields yields undefined evidence -- never a fabricated value. */
async function readExitEvidence(exportPath: string, readFile: (path: string) => Promise<string>): Promise<VibeExitEvidence | undefined> {
	let raw: string;
	try { raw = await readFile(exportPath); } catch { return undefined; }
	let parsed: unknown;
	try { parsed = JSON.parse(raw); } catch { return undefined; }
	const obj = record(parsed);
	if (obj === undefined) return undefined;
	const stopReason = typeof obj['stop_reason'] === 'string' ? obj['stop_reason'] : undefined;
	const outcome = typeof obj['outcome'] === 'string' ? obj['outcome'] : undefined;
	const config = record(obj['config']);
	const model = typeof config?.['active_model'] === 'string' && config['active_model'] !== '' ? config['active_model'] as string : undefined;
	return { stopReason, outcome, effectiveSelection: model !== undefined ? { model, thinking: undefined } : undefined };
}

/** export.json's own `session_id` field (live-confirmed) -- the ONLY source of session
 *  identity for outputMode:'text', which prints no journal entries at all. */
async function readExportSessionId(exportPath: string, readFile: (path: string) => Promise<string>): Promise<string | undefined> {
	let raw: string;
	try { raw = await readFile(exportPath); } catch { return undefined; }
	let parsed: unknown;
	try { parsed = JSON.parse(raw); } catch { return undefined; }
	const sessionId = record(parsed)?.['session_id'];
	return typeof sessionId === 'string' && sessionId !== '' ? sessionId : undefined;
}

/** `--output json` prints the SAME per-entry journal shape as `--output streaming`, just
 *  collected into one array at exit rather than streamed line by line (live-confirmed). The
 *  last `type:'message', role:'assistant'` entry's joined text blocks is the turn's answer --
 *  same precedence vibeLastAssistantText (cli-provider.ts) already applies to this shape. */
function lastAssistantTextFromEntries(stdout: string): { readonly text: string; readonly sessionId: string | undefined } {
	let parsed: unknown;
	try { parsed = JSON.parse(stdout); } catch (err) { throw new Error(`vibe --output json stdout was not parseable JSON: ${(err as Error).message}`); }
	const entries = Array.isArray(parsed) ? parsed : record(parsed)?.['messages'];
	if (!Array.isArray(entries)) throw new Error('vibe --output json did not print an entry array');
	let sessionId: string | undefined;
	for (const entry of entries) {
		const row = record(entry);
		if (typeof row?.['sessionId'] === 'string') sessionId = row['sessionId'];
	}
	for (let i = entries.length - 1; i >= 0; i--) {
		const row = record(entries[i]);
		if (row === undefined || row['type'] !== 'message' || row['role'] !== 'assistant' || !Array.isArray(row['content'])) continue;
		const text = row['content'].map(block => {
			const item = record(block);
			return item?.['type'] === 'text' && typeof item['text'] === 'string' ? item['text'] : '';
		}).join('');
		if (text.length > 0) return { text, sessionId };
	}
	throw new Error('vibe --output json carried no assistant text message');
}

/** The approval argv this launch actually honors (live-confirmed flags):
 *  'auto' -> --auto-approve; 'manual' -> --approval-policy ask; 'edit-auto' -> --approval-policy accept-edits; default -> none. */
function buildApprovalArgs(approval: VibeApproval | undefined): readonly string[] {
	if (approval === 'auto') return ['--auto-approve'];
	if (approval === 'manual') return ['--approval-policy', 'ask'];
	if (approval === 'edit-auto') return ['--approval-policy', 'accept-edits'];
	return [];
}

function buildArgv(request: VibeTurnRequest, outputDir: string): readonly string[] {
	const args: string[] = ['-p', '--output', request.outputMode, '--output-dir', outputDir];
	args.push(...buildSelectionArgs(request.session));
	args.push(...buildApprovalArgs(request.approval));
	if (request.readDirs !== undefined) for (const dir of request.readDirs) args.push('--add-dir', dir);
	if (request.budget?.maxTurns !== undefined) args.push('--max-turns', String(request.budget.maxTurns));
	if (request.budget?.timeLimitSeconds !== undefined) args.push('--time-limit', String(request.budget.timeLimitSeconds));
	if (request.budget?.maxPriceDollars !== undefined) args.push('--max-price', String(request.budget.maxPriceDollars));
	if (request.budget?.maxTokens !== undefined) args.push('--max-tokens', String(request.budget.maxTokens));
	return args;
}

/** A minimal async pull-queue: events pushed as they're parsed are drained by the iterator;
 *  once `finish` is called, remaining buffered events still drain before iteration ends. */
function createEventQueue(): {
	readonly push: (event: VibeTurnEvent) => void;
	readonly finish: (error?: Error) => void;
	readonly iterable: AsyncIterable<VibeTurnEvent>;
} {
	const events: VibeTurnEvent[] = [];
	const waiters: Array<() => void> = [];
	let done = false;
	let failure: Error | undefined;
	function wake(): void {
		while (waiters.length > 0) waiters.shift()?.();
	}
	return {
		push(event) { events.push(event); wake(); },
		finish(error) { done = true; failure = error; wake(); },
		iterable: {
			[Symbol.asyncIterator](): AsyncIterator<VibeTurnEvent> {
				let index = 0;
				return {
					async next(): Promise<IteratorResult<VibeTurnEvent>> {
						while (index >= events.length && !done) await new Promise<void>(resolve => waiters.push(resolve));
						if (index < events.length) return { value: events[index++] as VibeTurnEvent, done: false };
						if (failure !== undefined) throw failure;
						return { value: undefined, done: true };
					},
				};
			},
		},
	};
}

interface ResolvedVibeAdapterDeps {
	readonly spawn: (command: string, args: readonly string[], options: { readonly cwd?: string | undefined; readonly env?: Readonly<Record<string, string>> | undefined; readonly detached: boolean }) => VibeChildProcess;
	readonly killProcessGroup: (pid: number) => void;
	readonly mkdtemp: () => Promise<string>;
	readonly readFile: (path: string) => Promise<string>;
	readonly rm: (path: string) => Promise<void>;
	readonly command: string;
}

/** A short, bounded wait for 'close' (full stdio drain) after 'exit' -- the same grace
 *  vibe-session.ts's own transport used (CLOSE_GRACE_MS). A supervisor-owned descendant
 *  that still holds a pipe open must never hang this turn indefinitely; adapter-owned mode
 *  sweeps the group on 'exit' itself, so 'close' almost always follows immediately. */
const CLOSE_GRACE_MS = 1_000;

async function runTurn(
	context: VibeAdapterContext,
	request: VibeTurnRequest,
	deps: ResolvedVibeAdapterDeps,
	push: (event: VibeTurnEvent) => void,
	finish: (error?: Error) => void,
	resolveResult: (value: VibeTurnResult) => void,
	rejectResult: (error: Error) => void,
): Promise<void> {
	const adapterOwned = context.processGroup === 'adapter-owned';
	const mutating = request.approval !== 'manual';
	let tempDir: string | undefined;
	let child: VibeChildProcess | undefined;
	let dispatchState: VibeDispatchState = 'not-sent';
	let sessionId: string | undefined;
	let resumeHandle: string | undefined;
	let assistantText = '';
	let stderrText = '';
	let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
	let cancelled = false;
	let deadlineExpired = false;

	function killNow(): void {
		if (child === undefined) return;
		if (adapterOwned && child.pid !== undefined) deps.killProcessGroup(child.pid);
		else child.kill('SIGKILL');
	}
	function onAbort(): void { cancelled = true; killNow(); }
	function onDeadline(): void { deadlineExpired = true; killNow(); }
	// A plain function (not a bare property read) so TypeScript never narrows this
	// across statements -- AbortSignal.aborted is mutable between every check here.
	function signalAborted(): boolean { return request.signal?.aborted === true; }

	try {
		tempDir = await deps.mkdtemp();
		// Recheck cancellation after the mkdtemp hop, before any spawn -- a signal
		// aborted while this turn was only queued must never start a subprocess,
		// and still surfaces as a real, recognizable AbortError.
		if (signalAborted()) {
			cancelled = true;
			const abortError = new Error('Vibe turn aborted before dispatch', { cause: request.signal?.reason });
			abortError.name = 'AbortError';
			Object.assign(abortError, { dispatchState: 'not-sent' as VibeDispatchState });
			throw abortError;
		}

		let rawStdout = '';
		try {
			const argv = buildArgv(request, tempDir);
			child = deps.spawn(deps.command, argv, { cwd: context.cwd, env: context.env, detached: adapterOwned });
			dispatchState = 'possibly-sent';
			// A child that closes stdin early (EPIPE) reports that asynchronously on
			// the stream; its exit/close is what actually settles this turn below.
			child.stdin?.on('error', () => undefined);
			// Prompt travels via the tool's programmatic input contract (stdin), never
			// through shell-interpolated argv (k6) -- `-p` with no value reads it from here.
			child.stdin?.end(request.prompt);

			request.signal?.addEventListener('abort', onAbort, { once: true });
			if (signalAborted()) onAbort();
			if (request.deadlineMs !== undefined) deadlineTimer = setTimeout(onDeadline, request.deadlineMs);

			let buffer = '';
			function handleLine(line: string): void {
				const trimmed = line.trim();
				if (trimmed === '') return;
				const parsedLine = parseJournalLine(trimmed);
				if (parsedLine.sessionId !== undefined && sessionId === undefined) {
					sessionId = parsedLine.sessionId;
					resumeHandle = request.session.kind === 'new' ? sessionId : request.session.resumeHandle;
					push({ kind: 'session', sessionId, ...(request.session.kind === 'new' ? { resumeHandle } : {}) });
					dispatchState = 'accepted';
				}
				for (const event of parsedLine.events) push(event);
				if (parsedLine.assistantText !== undefined) assistantText = parsedLine.assistantText;
			}
			onUtf8Data(child.stdout, chunk => {
				if (request.outputMode !== 'streaming') { rawStdout += chunk; return; }
				buffer += chunk;
				let newline = buffer.indexOf('\n');
				while (newline >= 0) {
					handleLine(buffer.slice(0, newline));
					buffer = buffer.slice(newline + 1);
					newline = buffer.indexOf('\n');
				}
			});
			// A final journal row with no trailing newline (the last line before the
			// stream ends) is still a complete row once the process has exited.
			child.stdout?.on('end', () => {
				if (request.outputMode === 'streaming' && buffer !== '') handleLine(buffer);
				buffer = '';
			});
			onUtf8Data(child.stderr, chunk => { stderrText += chunk; });

			const exit = await new Promise<{ readonly code: number | null; readonly spawnError: Error | undefined }>(resolve => {
				let settled = false;
				let closeGrace: ReturnType<typeof setTimeout> | undefined;
				const settle = (result: { readonly code: number | null; readonly spawnError: Error | undefined }): void => {
					if (settled) return;
					settled = true;
					if (closeGrace !== undefined) clearTimeout(closeGrace);
					resolve(result);
				};
				child!.once('error', error => settle({ code: null, spawnError: error }));
				child!.on('exit', code => {
					// Sweep descendants immediately on leader exit -- this is what lets
					// 'close' (every stdio stream fully drained) actually follow.
					if (adapterOwned && child!.pid !== undefined) deps.killProcessGroup(child!.pid);
					closeGrace = setTimeout(() => settle({ code, spawnError: undefined }), CLOSE_GRACE_MS);
				});
				child!.on('close', code => settle({ code, spawnError: undefined }));
			});

			// The termination reason is tracked independently of the exit code: a
			// descendant that keeps stdio open past the leader's own clean exit can
			// let 'close' settle with code 0 well after a cancel()/deadline already
			// fired during that drain -- checked here, unconditionally, before any
			// code-based success/failure branching below ever runs.
			if (cancelled) throw new Error('Vibe turn aborted during output drain');
			if (deadlineExpired) throw new Error(`Vibe turn exceeded its deadline (${request.deadlineMs}ms) during output drain`);
			if (exit.spawnError !== undefined) throw exit.spawnError;
			if (exit.code !== 0) {
				const selectionMatch = MODEL_SELECTION_FAILURE.exec(stderrText);
				if (selectionMatch !== null) throw new VibeSelectionError(stderrText.trim());
				throw new Error(stderrText.trim() !== '' ? stderrText.trim() : `vibe exited with code ${exit.code}`);
			}
		} catch (dispatchError) {
			// A cancelled turn keeps its recognizable AbortError identity (callers
			// distinguish cancellation from an operational failure); everything else
			// from this phase is a genuinely uncertain dispatch.
			if (cancelled) {
				const abortError = new Error('Vibe turn aborted', { cause: request.signal?.reason ?? dispatchError });
				abortError.name = 'AbortError';
				Object.assign(abortError, { dispatchState });
				throw abortError;
			}
			if (dispatchError instanceof VibeSelectionError) throw dispatchError;
			throw new VibeTurnError(dispatchState, sessionId, dispatchError, mutating);
		}

		// The process exited successfully; shaping its output is a SEPARATE concern
		// from dispatch uncertainty -- a malformed/missing answer here is a plain
		// Error, not a VibeTurnError, so structured-output.ts's retry-with-feedback
		// path (which treats VibeTurnError alone as a non-retryable refusal) still
		// gets a chance to correct it, exactly as it did before this Story's rewire.
		if (request.outputMode === 'text') {
			assistantText = rawStdout.replace(/\n+$/, '');
			sessionId = await readExportSessionId(join(tempDir, 'export.json'), deps.readFile);
		} else if (request.outputMode === 'json') {
			const parsed = lastAssistantTextFromEntries(rawStdout);
			assistantText = parsed.text;
			sessionId = parsed.sessionId;
		}
		if (request.outputMode !== 'streaming') resumeHandle = request.session.kind === 'new' ? sessionId : request.session.resumeHandle;

		const exitEvidence = await readExitEvidence(join(tempDir, 'export.json'), deps.readFile);
		finish();
		resolveResult({ text: assistantText, sessionId, resumeHandle, exitEvidence });
	} catch (error) {
		const final = error as Error;
		finish(final);
		rejectResult(final);
	} finally {
		if (deadlineTimer !== undefined) clearTimeout(deadlineTimer);
		request.signal?.removeEventListener('abort', onAbort);
		if (tempDir !== undefined) { try { await deps.rm(tempDir); } catch { /* best-effort cleanup */ } }
	}
}

function resolvedDeps(deps: VibeAdapterDeps): ResolvedVibeAdapterDeps {
	return {
		spawn: deps.spawn ?? ((command, args, options) => nodeSpawn(command, args as string[], {
			cwd: options.cwd, env: options.env, detached: options.detached, stdio: ['pipe', 'pipe', 'pipe'],
		}) as unknown as VibeChildProcess),
		killProcessGroup: deps.killProcessGroup ?? killProcessGroup,
		mkdtemp: deps.mkdtemp ?? (() => mkdtempAsync(join(tmpdir(), 'insrc-vibe-adapter-'))),
		readFile: deps.readFile ?? (path => readFileAsync(path, 'utf8')),
		rm: deps.rm ?? (path => rmAsync(path, { recursive: true, force: true })),
		command: deps.command ?? 'vibe',
	};
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
	const resolved = resolvedDeps(deps);

	return {
		startTurn(request: VibeTurnRequest) {
			if (request.mode === 'read-only') {
				if (request.approval !== undefined) throw new VibeReadOnlyApprovalRejectedError();
				throw new VibeReadOnlyUnavailableError('no qualified capability yet (added in a later Story of this Epic)');
			}
			const queue = createEventQueue();
			let resolveResult!: (value: VibeTurnResult) => void;
			let rejectResult!: (error: Error) => void;
			const result = new Promise<VibeTurnResult>((resolve, reject) => { resolveResult = resolve; rejectResult = reject; });
			void runTurn(context, request, resolved, queue.push, queue.finish, resolveResult, rejectResult);
			return Object.assign(Object.create(null) as object, queue.iterable, { result }) as AsyncIterable<VibeTurnEvent> & { readonly result: Promise<VibeTurnResult> };
		},
	};
}

/** The OLD app-server VibeSessionOptions/VibeTurnOptions shape, re-declared here (not
 *  imported from the module being deleted) so a later Task's call-site re-point is a pure
 *  import swap: vibe-session-process.ts's runVibeChatJob already builds exactly this shape. */
export interface VibeCatalogModel {
	readonly id: string;
	readonly aliases?: readonly string[] | undefined;
	readonly efforts: readonly string[];
}
export interface VibeTurnOptions {
	readonly command: string;
	readonly cwd?: string | undefined;
	readonly env?: NodeJS.ProcessEnv | undefined;
	readonly timeoutMs: number;
	readonly signal?: AbortSignal | undefined;
	readonly agentConfig: Readonly<Record<string, unknown>>;
	readonly nativeSessionId?: string | undefined;
	readonly model?: string | undefined;
	readonly effort?: string | undefined;
	readonly catalog: readonly VibeCatalogModel[];
	readonly inheritProcessGroup?: boolean | undefined;
	readonly prompt: string;
	readonly onSession?: ((sessionId: string) => void) | undefined;
	readonly onHistory?: ((method: 'history/entryAdded' | 'history/entryUpdated', params: Record<string, unknown>) => void) | undefined;
}

/** The chat worker's own outcome shape (vibe-session.ts's VibeTurnResult) -- unchanged so
 *  runVibeChatJob's existing consumption (result.stopReason, onSession/onHistory callbacks)
 *  needs no change beyond the one call-site re-point. */
export interface VibeTurnOutcome {
	readonly sessionId: string;
	readonly stopReason: string | undefined;
}

/** Reverse of mapApprovalFlags -- the plugin's own agentConfig object (today's shape) back
 *  into the new VibeApproval enum, so runVibeTurn's mapping is total over the old options. */
function approvalFromAgentConfig(agentConfig: Readonly<Record<string, unknown>>): VibeApproval {
	if (agentConfig['autoApprove'] === true) return 'auto';
	if (agentConfig['agent'] === 'ask') return 'manual';
	if (agentConfig['agent'] === 'accept-edits') return 'edit-auto';
	return 'default';
}

/** The TOTAL field mapping from the plugin's existing VibeTurnOptions onto the new
 *  VibeAdapterContext + VibeTurnRequest (plus the adapter-construction `command`) -- every
 *  field VibeTurnOptions carries lands somewhere here; `catalog` is the one documented
 *  exception (the installed CLI self-validates --model and fails fast with its own wording,
 *  surfaced as VibeSelectionError, superseding a client-side catalog lookup). Exported so
 *  the mapping's totality is directly unit-testable without spawning anything. */
export function mapVibeTurnOptions(options: VibeTurnOptions): { readonly command: string; readonly context: VibeAdapterContext; readonly request: VibeTurnRequest } {
	const session: VibeSessionRequest = options.nativeSessionId !== undefined
		? { kind: 'resume', resumeHandle: options.nativeSessionId }
		: { kind: 'new', model: options.model, thinking: options.effort };
	const readDirs = options.agentConfig['workspaceRoots'];
	return {
		command: options.command,
		context: {
			cwd: options.cwd ?? process.cwd(),
			env: options.env as Readonly<Record<string, string>> | undefined,
			processGroup: options.inheritProcessGroup === true ? 'supervisor-owned' : 'adapter-owned',
		},
		request: {
			prompt: options.prompt,
			outputMode: 'streaming',
			session,
			mode: 'default',
			approval: approvalFromAgentConfig(options.agentConfig),
			readDirs: Array.isArray(readDirs) ? readDirs.filter((d): d is string => typeof d === 'string') : undefined,
			signal: options.signal,
			deadlineMs: options.timeoutMs,
		},
	};
}

/**
 * The adapter-owned turn entry: maps the plugin's existing VibeTurnOptions one-to-one onto
 * a VibeAdapterContext + VibeTurnRequest (via mapVibeTurnOptions) and drives startTurn,
 * bridging its rich events back onto onSession/onHistory in the exact shapes historyLines()
 * already consumes -- no mapper or event-mapping change at the call site.
 */
export async function runVibeTurn(options: VibeTurnOptions): Promise<VibeTurnOutcome> {
	const { command, context, request } = mapVibeTurnOptions(options);
	const adapter = createVibeAdapter(context, { command });
	const turn = adapter.startTurn(request);

	let sessionId: string | undefined;
	let assistantEntrySeq = 0;
	for await (const event of turn) {
		if (event.kind === 'session') {
			sessionId = event.sessionId;
			options.onSession?.(event.sessionId);
		} else if (event.kind === 'status') {
			// historyLines() needs no id for a 'reasoning' row -- it only checks type.
			options.onHistory?.('history/entryAdded', { entry: { type: 'reasoning' } });
		} else if (event.kind === 'assistant-text') {
			const id = `assistant-${sessionId ?? 'turn'}-${assistantEntrySeq++}`;
			options.onHistory?.('history/entryAdded', { entry: { id, type: 'message', role: 'assistant', content: [{ type: 'text', text: event.text }] } });
		} else if (event.kind === 'tool-call') {
			// generationStatus:'in_progress' is load-bearing: historyLines() only adds
			// this id to its active-result map when it sees this, which is what lets
			// the later history/entryUpdated (the tool's result) actually get through
			// instead of being silently discarded at the active-map lookup.
			options.onHistory?.('history/entryAdded', { entry: { type: 'effect', id: event.toolCallId, generationStatus: 'in_progress', detail: { toolName: event.toolName, input: event.arguments } } });
		} else if (event.kind === 'tool-result') {
			// The companion '/generationStatus' patch clears the active-map entry
			// historyLines() added above -- without it, every tool call this turn
			// bridges leaks an entry for the lifetime of the chat session.
			options.onHistory?.('history/entryUpdated', { entryId: event.toolCallId, patch: [
				{ path: '/state', value: { status: event.ok ? 'completed' : 'failed', outputText: event.output, ...(event.error !== undefined ? { error: { message: event.error } } : {}) } },
				{ path: '/generationStatus', value: 'completed' },
			] });
		}
	}
	const result = await turn.result;
	return { sessionId: result.sessionId ?? sessionId ?? '', stopReason: result.exitEvidence?.stopReason };
}
