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

import { execFileSync, spawn as nodeSpawn } from 'node:child_process';
import { createHash } from 'node:crypto';
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
	/** The adapter's own validated read-only capability (sc3), synchronously reflecting
	 *  the qualification cache's current entry for this adapter's stable descriptor. */
	readonly readOnly: ReadOnlyCapability;
	/** Start a turn; a 'session' event opens it, the result carries identity + exit evidence. */
	startTurn(request: VibeTurnRequest): AsyncIterable<VibeTurnEvent> & { readonly result: Promise<VibeTurnResult> };
}

/** Fail-closed read-only authorization (sc3, Story s2) -- ADAPTER-OWNED. Callers never
 *  construct this: the adapter runs the live qualification itself and exposes only the
 *  validated result. `provenAgainst` binds the capability to a STABLE authorization
 *  descriptor (excluding the per-turn --output-dir value) and to the binary's own
 *  effective-config self-report; either changing invalidates the capability. */
export interface ReadOnlyCapability {
	readonly status: 'qualified' | 'unavailable';
	readonly allowedTools: readonly VibeInsrcAnalysisToolId[];
	/** Set when unavailable: the refusal reason, surfaced to the session's answer and the ledger. */
	readonly reason?: string | undefined;
	readonly provenAgainst: { readonly stableDescriptorHash: string; readonly effectiveConfigFingerprint: string } | undefined;
}

/** Module-level qualification cache, keyed by stableDescriptorHash. Empty at module load;
 *  populated by the live qualification suite (a later Task of this Story). */
const readOnlyQualificationCache = new Map<string, ReadOnlyCapability>();

/** Test-only: inspect the qualification cache without exposing it to production callers. */
export function _readOnlyQualificationCacheForTests(): Map<string, ReadOnlyCapability> { return readOnlyQualificationCache; }

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
	/** Test-only: overrides the real `which`-based PATH resolution every stable-descriptor
	 *  computation this adapter makes (qualification, the construction-time readOnly
	 *  snapshot, read-only dispatch) uses to turn `command` into the executable identity it
	 *  hashes and spawns. Production never supplies this. */
	readonly resolveCommandPath?: ((command: string, env: Readonly<Record<string, string>> | undefined) => string) | undefined;
	/** Test-only: overrides the binary-identity stat lookup paired with `resolveCommandPath`
	 *  above (a DIFFERENT shape than the directory-check `statSync` above it). */
	readonly identityStatSync?: ((path: string) => { readonly size: number; readonly mtimeMs: number }) | undefined;
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

// -- Read-only qualification suite (sc3, Story s2) ---------------------------------------
//
// A STANDALONE probe dispatcher, deliberately separate from runTurn (s1's real-dispatch
// path): the suite must read export.json BEFORE tempDir is removed, and needs none of
// runTurn's caller-facing cancellation/deadline/dual-process-group machinery -- a probe is
// an internal qualification concern, not a caller's turn. Always kills the whole process on
// its own timeout; cleans up tempDir in a finally, after export.json has been read.

const QUALIFICATION_PROBE_TIMEOUT_MS = 60_000;

interface QualificationProbeResult {
	readonly events: readonly VibeTurnEvent[];
	readonly exportObj: Record<string, unknown> | undefined;
	readonly error: Error | undefined;
}

async function dispatchQualificationProbe(
	context: VibeAdapterContext,
	deps: ResolvedVibeAdapterDeps,
	request: VibeTurnRequest,
	timeoutMs: number,
	signal?: AbortSignal,
): Promise<QualificationProbeResult> {
	const events: VibeTurnEvent[] = [];
	let tempDir: string | undefined;
	try {
		tempDir = await deps.mkdtemp();
		const argv = buildArgv(request, tempDir);
		// adapter-owned (detached: true), exactly like runTurn's own adapter-owned
		// mode: killProcessGroup's `process.kill(-pid, ...)` only ever targets the
		// right group when this child IS that group's leader -- detached: false (the
		// original shape here) put it in the DAEMON's own group, so a timeout's kill
		// silently missed the hung child entirely (ESRCH on an unrelated group id,
		// swallowed), and the probe waited out the full offline hang every time
		// (review finding 4).
		const child = deps.spawn(deps.command, argv, { cwd: context.cwd, env: context.env, detached: true });
		child.stdin?.on('error', () => undefined);
		child.stdin?.end(request.prompt);

		let buffer = '';
		function handleLine(line: string): void {
			const trimmed = line.trim();
			if (trimmed === '') return;
			for (const event of parseJournalLine(trimmed).events) events.push(event);
		}
		onUtf8Data(child.stdout, chunk => {
			buffer += chunk;
			let newline = buffer.indexOf('\n');
			while (newline >= 0) { handleLine(buffer.slice(0, newline)); buffer = buffer.slice(newline + 1); newline = buffer.indexOf('\n'); }
		});
		child.stdout?.on('end', () => { if (buffer !== '') handleLine(buffer); buffer = ''; });
		let stderrText = '';
		onUtf8Data(child.stderr, chunk => { stderrText += chunk; });

		function killNow(): void {
			if (child.pid !== undefined) deps.killProcessGroup(child.pid); else child.kill('SIGKILL');
		}
		const onAbort = (): void => killNow();
		signal?.addEventListener('abort', onAbort, { once: true });
		if (signal?.aborted === true) killNow();
		const timeout = setTimeout(killNow, Math.max(0, timeoutMs));
		const exitCode = await new Promise<number | null>(resolve => {
			child.once('error', () => resolve(null));
			// Sweep the group on the leader's own exit too (not only on timeout): a
			// descendant that outlives a clean leader exit must not survive this probe.
			child.on('exit', () => killNow());
			child.on('close', code => resolve(code));
		});
		clearTimeout(timeout);
		signal?.removeEventListener('abort', onAbort);
		if (exitCode !== 0) {
			return { events, exportObj: undefined, error: new Error(stderrText.trim() !== '' ? stderrText.trim() : `qualification probe exited with code ${String(exitCode)}`) };
		}

		let exportObj: Record<string, unknown> | undefined;
		try {
			const raw = await deps.readFile(join(tempDir, 'export.json'));
			exportObj = record(JSON.parse(raw));
		} catch { exportObj = undefined; }
		return { events, exportObj, error: undefined };
	} catch (error) {
		return { events, exportObj: undefined, error: error as Error };
	} finally {
		if (tempDir !== undefined) { try { await deps.rm(tempDir); } catch { /* best-effort cleanup */ } }
	}
}

/** The qualification probe's own self-reported `enabled_tools` catalog (live-confirmed
 *  export.json field: `config.enabled_tools`, a string array). `--enabled-tools` disables
 *  every OTHER tool by construction (live-confirmed via `vibe --help`), so this one field
 *  alone is sufficient structural evidence for BOTH required-tool presence and bypass
 *  absence -- no second, separate probe is needed. */
function enabledToolsFrom(exportObj: Record<string, unknown>): readonly string[] | undefined {
	const config = record(exportObj['config']);
	const enabled = config?.['enabled_tools'];
	if (!Array.isArray(enabled)) return undefined;
	return enabled.filter((t): t is string => typeof t === 'string');
}

/** A fingerprint of the probe's own effective configuration (live-confirmed export.json
 *  fields: `vibe_version` + the full `config` object, which carries no per-run-volatile
 *  fields of its own). Undefined when `config` itself could not be read. */
function effectiveConfigFingerprintFrom(exportObj: Record<string, unknown>): string | undefined {
	const config = record(exportObj['config']);
	if (config === undefined) return undefined;
	const vibeVersion = typeof exportObj['vibe_version'] === 'string' ? exportObj['vibe_version'] : '';
	return createHash('sha256').update(JSON.stringify({ vibeVersion, config })).digest('hex');
}

/** The exact plausible name forms (bare / connector-prefixed / MCP-streamed) a completed
 *  call to `toolId` may show up as -- never a substring test: 'insrc_analyze' is a literal
 *  prefix of 'insrc_analyze_step', so a loose `.includes()` check would let a completed call
 *  to the STEP tool alone also count as confirming the (never-actually-called) plain tool,
 *  pushing qualification toward a false 'qualified' verdict -- the dangerous direction. */
function candidateNameForms(toolId: VibeInsrcAnalysisToolId): readonly string[] {
	return [toolId, `connector_insrc_${toolId}`, `mcp_insrc.${toolId}`];
}

/** The full set of name forms ANY required tool may legitimately show up as -- used both to
 *  confirm each required tool's own completed call and to recognize a completed call to
 *  anything else as disallowed (review finding 2). */
function allowedCallNameForms(): ReadonlySet<string> {
	return new Set(VIBE_INSRC_ANALYSIS_TOOL_IDS.flatMap(candidateNameForms));
}

/** True when some tool-result event for `toolId` shows a confirmed completed call -- exact
 *  match against its own known plausible name forms. Found by self-review before this
 *  Story's BUILD was presented (substring matching previously here let a step-tool-only call
 *  wrongly also confirm the plain tool). */
function hasConfirmedCompletedCall(events: readonly VibeTurnEvent[], toolId: VibeInsrcAnalysisToolId): boolean {
	const candidates = new Set(candidateNameForms(toolId));
	const callNamesById = new Map<string, string>();
	for (const event of events) if (event.kind === 'tool-call') callNamesById.set(event.toolCallId, event.toolName);
	return events.some(event => event.kind === 'tool-result' && event.ok && candidates.has(callNamesById.get(event.toolCallId) ?? ''));
}

/** The name of a completed tool call the journal itself shows that is NOT one of the
 *  required tools' own known name forms, or undefined when every completed call stays inside
 *  the allowlist. The config-reported `enabled_tools` catalog (checked separately, in
 *  `runQualificationSuite`) only proves what the launch profile CLAIMS is enabled; this
 *  checks what the journal shows ACTUALLY ran, so a catalog that under-reports (or a runtime
 *  that doesn't honor it) cannot silently let a disallowed tool execute unnoticed (review
 *  finding 2). */
function observedDisallowedCompletedCall(events: readonly VibeTurnEvent[], allowed: ReadonlySet<string>): string | undefined {
	const callNamesById = new Map<string, string>();
	for (const event of events) if (event.kind === 'tool-call') callNamesById.set(event.toolCallId, event.toolName);
	for (const event of events) {
		if (event.kind !== 'tool-result' || !event.ok) continue;
		const name = callNamesById.get(event.toolCallId);
		if (name !== undefined && !allowed.has(name)) return name;
	}
	return undefined;
}

const QUALIFICATION_PROBE_PROMPT = 'Call the insrc_analyze tool once, then the insrc_analyze_step tool once, each with a trivial unrelated question. Report back briefly once both calls are done.';

/** Bounds on how long `runQualificationSuite` will keep retrying/probing for a caller that
 *  passed its own cancellation/deadline (review finding 1): never past the caller's own
 *  signal/deadline, and never past this suite's own per-probe ceiling either. */
interface QualificationBudget {
	readonly signal?: AbortSignal | undefined;
	readonly deadlineMs?: number | undefined;
}

/** The live qualification suite itself: bounded-retry allow-side probe (an actual
 *  completed call is required for EACH of the two required tools), immediate-fail
 *  deny/bypass probes using the SAME probe's own structural catalog evidence PLUS the
 *  journal's own observed execution evidence (review finding 2 -- config claims and actual
 *  completed calls are both checked, never just one), and export.json fingerprint extraction
 *  with fail-closed behavior on a missing or unparsable export. Never throws -- every failure
 *  mode resolves to 'unavailable' with a reason naming it. */
async function runQualificationSuite(
	context: VibeAdapterContext,
	deps: ResolvedVibeAdapterDeps,
	descriptorKey: string,
	maxAllowRetries: number,
	budget: QualificationBudget = {},
): Promise<ReadOnlyCapability> {
	const required = VIBE_INSRC_ANALYSIS_TOOL_IDS.map(id => `connector_insrc_${id}`);
	const allowedNames = allowedCallNameForms();
	const probeRequest: VibeTurnRequest = { prompt: QUALIFICATION_PROBE_PROMPT, outputMode: 'streaming', session: { kind: 'new' }, mode: 'read-only' };
	const deadlineAt = budget.deadlineMs !== undefined ? Date.now() + budget.deadlineMs : undefined;

	let lastReason = 'qualification probe never ran';
	for (let attempt = 1; attempt <= Math.max(1, maxAllowRetries); attempt++) {
		if (budget.signal?.aborted === true) { lastReason = 'qualification cancelled by the caller'; break; }
		if (deadlineAt !== undefined && Date.now() >= deadlineAt) { lastReason = "qualification exceeded the caller's deadline"; break; }
		const probeTimeoutMs = deadlineAt !== undefined ? Math.min(QUALIFICATION_PROBE_TIMEOUT_MS, deadlineAt - Date.now()) : QUALIFICATION_PROBE_TIMEOUT_MS;
		if (probeTimeoutMs <= 0) { lastReason = "qualification exceeded the caller's deadline"; break; }

		const probe = await dispatchQualificationProbe(context, deps, probeRequest, probeTimeoutMs, budget.signal);
		if (probe.error !== undefined) { lastReason = `qualification probe failed to run: ${probe.error.message}`; continue; }
		if (probe.exportObj === undefined) { lastReason = "qualification probe's export.json is missing or unparsable"; continue; }

		const enabledTools = enabledToolsFrom(probe.exportObj);
		if (enabledTools === undefined) { lastReason = "qualification probe's export.json carried no readable enabled_tools catalog"; continue; }

		// Bypass-absence check (terminal, never retried): a tool outside the two-tool
		// allowlist actually reachable under the pinned descriptor is a genuine safety
		// finding, not ambient flakiness. Checked two ways -- what the launch profile
		// CLAIMS is enabled (config), and what the journal shows ACTUALLY completed
		// (execution evidence) -- either one alone would miss the other's failure mode.
		const bypassing = enabledTools.filter(t => !required.includes(t));
		if (bypassing.length > 0) {
			return { status: 'unavailable', allowedTools: [], reason: `bypass-absence failure: tool(s) outside the allowlist are enabled: ${bypassing.join(', ')}`, provenAgainst: undefined };
		}
		const disallowedCall = observedDisallowedCompletedCall(probe.events, allowedNames);
		if (disallowedCall !== undefined) {
			return { status: 'unavailable', allowedTools: [], reason: `bypass-absence failure: an out-of-allowlist tool call completed: ${disallowedCall}`, provenAgainst: undefined };
		}
		// Required-tool-exclusion check (terminal for THIS descriptor's launch profile,
		// not ambient flakiness -- the profile itself is not enabling what it claims to):
		// the reconciled polarity (review r3 finding 3).
		const missingRequired = required.filter(t => !enabledTools.includes(t));
		if (missingRequired.length > 0) {
			return { status: 'unavailable', allowedTools: [], reason: `required tool(s) excluded from the enabled-tool catalog: ${missingRequired.join(', ')}`, provenAgainst: undefined };
		}

		// Allow-side probe: both required tools must show an actual confirmed completed
		// call -- structural catalog presence alone is not enough. A failure here IS
		// retried (bounded): ambient connector flakiness, not a structural finding.
		const bothCompleted = VIBE_INSRC_ANALYSIS_TOOL_IDS.every(toolId => hasConfirmedCompletedCall(probe.events, toolId));
		if (!bothCompleted) { lastReason = `allow-side probe: insrc_analyze and/or insrc_analyze_step did not show a confirmed completed call (attempt ${String(attempt)}/${String(maxAllowRetries)})`; continue; }

		const fingerprint = effectiveConfigFingerprintFrom(probe.exportObj);
		if (fingerprint === undefined) { lastReason = "qualification probe's export.json carried no readable config to fingerprint"; continue; }

		return { status: 'qualified', allowedTools: VIBE_INSRC_ANALYSIS_TOOL_IDS, provenAgainst: { stableDescriptorHash: descriptorKey, effectiveConfigFingerprint: fingerprint } };
	}
	return { status: 'unavailable', allowedTools: [], reason: lastReason, provenAgainst: undefined };
}

const inFlightQualifications = new Map<string, Promise<ReadOnlyCapability>>();

/** Runs the live qualification suite for this context/command's stable descriptor and
 *  populates the module cache with the result. Concurrent calls for the IDENTICAL
 *  descriptor share one in-flight run rather than each running the probe suite -- callers
 *  that want a non-blocking snapshot read the module cache directly (via the adapter's own
 *  readOnly field) instead of awaiting this. Never throws: a stable-descriptor computation
 *  failure resolves to 'unavailable' with a reason, the same as every other failure mode.
 *  `opts.signal`/`opts.deadlineMs` bound a COLD-cache run to the caller's own budget (review
 *  finding 1) -- a warm cache still returns immediately regardless, and `opts` is otherwise
 *  ignored once an identical descriptor's run is already in flight. */
export async function qualifyReadOnlyCapability(
	context: VibeAdapterContext,
	deps: VibeAdapterDeps = {},
	maxAllowRetries = 3,
	opts: QualificationBudget = {},
): Promise<ReadOnlyCapability> {
	const resolved = resolvedDeps(deps);
	let descriptorKey: string;
	let resolvedCommand: string;
	try {
		resolvedCommand = resolveExecutable(deps, context, resolved.command);
		const probeRequest: VibeTurnRequest = { prompt: QUALIFICATION_PROBE_PROMPT, outputMode: 'streaming', session: { kind: 'new' }, mode: 'read-only' };
		const argv = buildArgv(probeRequest, '');
		descriptorKey = stableDescriptorHash(context, resolved.command, argv, hashDepsFor(deps, resolvedCommand));
	} catch (error) {
		return { status: 'unavailable', allowedTools: [], reason: `stable descriptor computation failed: ${(error as Error).message}`, provenAgainst: undefined };
	}

	const cached = readOnlyQualificationCache.get(descriptorKey);
	if (cached !== undefined) return cached;

	const inFlight = inFlightQualifications.get(descriptorKey);
	if (inFlight !== undefined) return inFlight;

	// The probe dispatches with the SAME resolved path the hash above was computed
	// against (review finding 3) -- never the bare command, which a concurrent PATH
	// change could resolve to a different binary by the time of the actual spawn.
	const run = runQualificationSuite(context, { ...resolved, command: resolvedCommand }, descriptorKey, maxAllowRetries, opts).finally(() => { inFlightQualifications.delete(descriptorKey); });
	inFlightQualifications.set(descriptorKey, run);
	const capability = await run;
	readOnlyQualificationCache.set(descriptorKey, capability);
	return capability;
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
	if (request.mode === 'read-only') {
		// Fixed read-only launch profile (sc3): the two connector_insrc_* allow flags and
		// NOTHING else approval-related, regardless of request.approval -- startTurn already
		// rejects a read-only request carrying an approval setting, but this stays safe on
		// its own terms too.
		for (const toolId of VIBE_INSRC_ANALYSIS_TOOL_IDS) args.push('--enabled-tools', `connector_insrc_${toolId}`);
	} else {
		args.push(...buildApprovalArgs(request.approval));
	}
	if (request.readDirs !== undefined) for (const dir of request.readDirs) args.push('--add-dir', dir);
	if (request.budget?.maxTurns !== undefined) args.push('--max-turns', String(request.budget.maxTurns));
	if (request.budget?.timeLimitSeconds !== undefined) args.push('--time-limit', String(request.budget.timeLimitSeconds));
	if (request.budget?.maxPriceDollars !== undefined) args.push('--max-price', String(request.budget.maxPriceDollars));
	if (request.budget?.maxTokens !== undefined) args.push('--max-tokens', String(request.budget.maxTokens));
	return args;
}

/** Test-only: buildArgv is intentionally unexported in production (callers get argv only
 *  via startTurn's dispatch); this lets tests observe its real output directly. */
export function _buildArgvForTests(request: VibeTurnRequest, outputDir: string): readonly string[] { return buildArgv(request, outputDir); }

/** `argv` with its `--output-dir <value>` and `--output <mode>` pairs removed. `--output-dir`
 *  excludes buildArgv's fresh mkdtemp() path, minted on every call. `--output` is excluded
 *  for the SAME reason the HLD excludes outputDir: it shapes how a caller reads the
 *  response (text/json/streaming), never which tools a launch profile authorizes -- the
 *  qualification suite's own probe request and a real caller's request (readOnlySessionOnce
 *  uses 'json'; the probe uses 'streaming') must hash identically, or the cache could never
 *  hit across the two. Discovered via s2/t6: without this, qualification and dispatch always
 *  computed different descriptors and the cache never hit for any real caller. */
function argvExcludingTurnLocalFlags(argv: readonly string[]): readonly string[] {
	let result = argv;
	for (const flag of ['--output-dir', '--output']) {
		const idx = result.indexOf(flag);
		if (idx !== -1) result = [...result.slice(0, idx), ...result.slice(idx + 2)];
	}
	return result;
}

/** Resolve a bare command name to its absolute path via `which`, run under the EXACT same
 *  env the real spawn will use (same precedent as cli-provider.ts's resolveBin) -- `which`
 *  under the resolving process's OWN inherited env could name a different binary than the
 *  one `deps.spawn` actually launches under `context.env` if the two environments' PATH
 *  differ (review finding 3); passing `env` through keeps both resolutions looking at the
 *  same PATH. `env === undefined` inherits `process.env`, identically to how Node's own
 *  `spawn` treats an omitted `env` option. Throws when `command` cannot be resolved -- every
 *  caller already treats a `stableDescriptorHash` failure as fail-closed 'unavailable', so an
 *  unresolvable executable must never silently cache under a reusable-but-wrong identity. */
function resolveCommandOnPath(command: string, env: Readonly<Record<string, string>> | undefined): string {
	if (command.includes('/')) return command;
	const out = execFileSync('which', [command], { encoding: 'utf8', env: env as NodeJS.ProcessEnv | undefined }).trim().split('\n')[0];
	if (out === undefined || out.length === 0) throw new Error(`could not resolve '${command}' to an executable path on PATH`);
	return out;
}

interface StableDescriptorHashDeps {
	readonly resolveCommandPath?: ((command: string) => string) | undefined;
	readonly statSync?: ((path: string) => { readonly size: number; readonly mtimeMs: number }) | undefined;
}

/** Resolves `command` to the exact executable this call will go on to spawn, under this
 *  context's own env (`deps.resolveCommandPath`, test-only, overrides the real `which`-based
 *  lookup) -- the one place every qualification/dispatch call site (review finding 3) turns
 *  a bare command into an identity, so the hash and the actual spawn can never disagree. */
function resolveExecutable(deps: VibeAdapterDeps, context: VibeAdapterContext, command: string): string {
	return (deps.resolveCommandPath ?? resolveCommandOnPath)(command, context.env);
}

/** The `StableDescriptorHashDeps` override pinning a hash computation to an
 *  ALREADY-resolved executable path (so hashing and dispatching never redo potentially
 *  racy resolution separately) plus this adapter's own identity-stat test seam. */
function hashDepsFor(deps: VibeAdapterDeps, resolvedCommand: string): StableDescriptorHashDeps {
	return { resolveCommandPath: () => resolvedCommand, statSync: deps.identityStatSync };
}

/** A stable authorization-descriptor key (sc3) for the read-only qualification cache:
 *  the resolved binary's own content identity (path + size + mtime -- changes on any
 *  install/upgrade) + `argv` with --output-dir excluded + the adapter's pinned env subset
 *  + cwd. Two calls whose only difference is --output-dir hash identically; a different
 *  binary, env or cwd hashes differently. Resolution and stat both run under THIS context's
 *  own `env`, the same one the real spawn uses, so the key can never describe a different
 *  executable from the one that will actually run (review finding 3) -- and both are allowed
 *  to throw: every caller already treats a failure here as fail-closed 'unavailable', so an
 *  executable whose identity cannot be established must never get a reusable, ambiguous key. */
export function stableDescriptorHash(context: VibeAdapterContext, command: string, argv: readonly string[], deps: StableDescriptorHashDeps = {}): string {
	const resolve = deps.resolveCommandPath ?? ((cmd: string) => resolveCommandOnPath(cmd, context.env));
	const stat = deps.statSync ?? statSync;
	const resolvedPath = resolve(command);
	const s = stat(resolvedPath);
	const binaryIdentity = `${resolvedPath}:${s.size}:${s.mtimeMs}`;
	const payload = JSON.stringify({
		binaryIdentity,
		argv: argvExcludingTurnLocalFlags(argv),
		env: context.env ?? {},
		cwd: context.cwd,
	});
	return createHash('sha256').update(payload).digest('hex');
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
	/** Read-only dispatch only (sc3): awaited AFTER a successful exit's export/exit-evidence
	 *  reads but BEFORE `finish()`/`resolveResult()` publish the turn's result, so a caller
	 *  can never observe success and dispatch another read-only turn before this settles
	 *  (review finding 5 -- the previous placement, inside runTurn's own `finally`-triggered
	 *  `rm`, ran strictly AFTER the result had already resolved). Absent for an ordinary turn. */
	readonly onDispatchSettled?: ((exportPath: string) => Promise<void>) | undefined;
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
	// One construction, reused at every point this turn's lifecycle recognizes a
	// cancellation (before dispatch, during the dispatch/drain wait, and after a
	// successful exit but before output extraction settles) -- a cancelled turn
	// always keeps this same recognizable AbortError identity, never a generic
	// Error or a VibeTurnError, however far execution had already gotten.
	function throwAborted(cause?: unknown): never {
		const abortError = new Error('Vibe turn aborted', { cause: request.signal?.reason ?? cause });
		abortError.name = 'AbortError';
		Object.assign(abortError, { dispatchState });
		throw abortError;
	}

	try {
		tempDir = await deps.mkdtemp();
		// Recheck cancellation after the mkdtemp hop, before any spawn -- a signal
		// aborted while this turn was only queued must never start a subprocess,
		// and still surfaces as a real, recognizable AbortError.
		if (signalAborted()) {
			cancelled = true;
			throwAborted();
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
			if (cancelled) throwAborted(dispatchError);
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
		// The timer/abort listener are still armed through this whole extraction
		// phase (export/evidence reads are inside the cancellable lifecycle, not
		// after it): a cancel()/deadline that lands during these reads sets its
		// flag and kills an already-exited child harmlessly, but nothing re-read
		// the flag afterwards -- recheck here, immediately before publishing
		// success, or the turn would resolve as an ordinary success despite the
		// caller's own cancellation/deadline having already fired (review finding
		// r3-2).
		if (cancelled) throwAborted();
		if (deadlineExpired) throw new VibeTurnError(dispatchState, sessionId, new Error(`Vibe turn exceeded its deadline (${request.deadlineMs}ms) during output extraction`), mutating);
		// Read-only dispatch only: settle the post-dispatch fingerprint check BEFORE
		// publishing success, not after (review finding 5) -- a caller awaiting
		// `result` must never be able to start a NEXT read-only turn against a
		// cache entry this check was about to invalidate. The current turn's own
		// answer is unaffected either way (resolveResult runs right after,
		// regardless of what this found).
		if (deps.onDispatchSettled !== undefined) await deps.onDispatchSettled(join(tempDir, 'export.json'));
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

/** Supplies `onDispatchSettled` (sc3's post-dispatch check) -- reads export.json's
 *  effective-config fingerprint and invalidates the qualification cache entry on ANY failure
 *  to re-verify it: a mismatch, OR a missing/malformed/config-less export, OR a read error
 *  (review finding 5a -- the previous version left the cache entry untouched on anything
 *  short of a confirmed mismatch, which is the wrong default for a capability that is
 *  supposed to be continuously re-proven, not just innocent-until-proven-otherwise). Called
 *  by runTurn BEFORE it publishes the turn's result (review finding 5b), while tempDir still
 *  exists (runTurn's own `rm` cleanup, in its `finally`, runs later) -- never blocks or fails
 *  the turn itself; it only ever deletes a cache entry, never rejects. */
function wrapDepsForPostDispatchFingerprintCheck(resolved: ResolvedVibeAdapterDeps, descriptorKey: string, cachedFingerprint: string): ResolvedVibeAdapterDeps {
	return {
		...resolved,
		onDispatchSettled: async (exportPath: string) => {
			let freshFingerprint: string | undefined;
			try {
				const raw = await resolved.readFile(exportPath);
				const exportObj = record(JSON.parse(raw));
				freshFingerprint = exportObj !== undefined ? effectiveConfigFingerprintFrom(exportObj) : undefined;
			} catch { freshFingerprint = undefined; }
			if (freshFingerprint === undefined || freshFingerprint !== cachedFingerprint) readOnlyQualificationCache.delete(descriptorKey);
		},
	};
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

	// readOnly (sc3) is populated SYNCHRONOUSLY from the qualification cache's CURRENT
	// entry for this adapter's own stable descriptor -- a pure, side-effect-free read.
	// This function never awaits, and never itself triggers, the live qualification
	// suite: createVibeAdapter runs on EVERY turn's construction (dispatchVibeTurn,
	// cli-provider.ts), including ordinary 'default'-mode turns that never touch
	// read-only at all. Confirmed by direct experiment: self-triggering here calls
	// deps.spawn unconditionally on a cold descriptor, which breaks s1's own existing
	// contract/test ("an already-aborted request must never spawn a subprocess" --
	// vibe-adapter-turn.test.ts's spawnCalls.length===0 assertion -- becomes 1, a real
	// regression, not just a test-isolation nuisance). Triggering a fresh run on a
	// cache miss belongs to startTurn's own read-only dispatch path instead (a later
	// Task of this Story), which only runs when a caller actually requests
	// mode:'read-only'.
	let readOnly: ReadOnlyCapability;
	try {
		const probeRequest: VibeTurnRequest = { prompt: QUALIFICATION_PROBE_PROMPT, outputMode: 'streaming', session: { kind: 'new' }, mode: 'read-only' };
		const resolvedCommand = resolveExecutable(deps, context, resolved.command);
		const descriptorKey = stableDescriptorHash(context, resolved.command, buildArgv(probeRequest, ''), hashDepsFor(deps, resolvedCommand));
		const cached = readOnlyQualificationCache.get(descriptorKey);
		readOnly = cached ?? { status: 'unavailable', allowedTools: [], reason: 'read-only qualification has not completed yet for this descriptor', provenAgainst: undefined };
	} catch (error) {
		readOnly = { status: 'unavailable', allowedTools: [], reason: `stable descriptor computation failed: ${(error as Error).message}`, provenAgainst: undefined };
	}

	return {
		readOnly,
		startTurn(request: VibeTurnRequest) {
			if (request.mode === 'read-only') {
				if (request.approval !== undefined) throw new VibeReadOnlyApprovalRejectedError();
				// Always re-check the shared module-level cache by THIS call's own stable
				// descriptor -- never trust readOnly's construction-time snapshot, which may
				// be stale (a background qualification elsewhere may have since resolved).
				// Resolve the executable ONCE, under this context's own env, and reuse that
				// SAME resolved path both for the hash and for the actual dispatch below
				// (review finding 3) -- resolved.command's own bare name is never spawned
				// here, so a later PATH change between hashing and dispatch can never make
				// the two look at different binaries.
				let descriptorKey: string;
				let resolvedCommand: string;
				try {
					resolvedCommand = resolveExecutable(deps, context, resolved.command);
					descriptorKey = stableDescriptorHash(context, resolved.command, buildArgv(request, ''), hashDepsFor(deps, resolvedCommand));
				} catch (error) {
					throw new VibeReadOnlyUnavailableError(`stable descriptor computation failed: ${(error as Error).message}`);
				}
				const cached = readOnlyQualificationCache.get(descriptorKey);
				if (cached === undefined || cached.status !== 'qualified' || cached.provenAgainst === undefined) {
					throw new VibeReadOnlyUnavailableError(cached?.reason ?? 'no qualified capability yet');
				}
				const queue = createEventQueue();
				let resolveResult!: (value: VibeTurnResult) => void;
				let rejectResult!: (error: Error) => void;
				const result = new Promise<VibeTurnResult>((resolve, reject) => { resolveResult = resolve; rejectResult = reject; });
				const fingerprintCheckedDeps = wrapDepsForPostDispatchFingerprintCheck(
					{ ...resolved, command: resolvedCommand }, descriptorKey, cached.provenAgainst.effectiveConfigFingerprint,
				);
				void runTurn(context, request, fingerprintCheckedDeps, queue.push, queue.finish, resolveResult, rejectResult);
				return Object.assign(Object.create(null) as object, queue.iterable, { result }) as AsyncIterable<VibeTurnEvent> & { readonly result: Promise<VibeTurnResult> };
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
	// Held from the start, not read off `turn.result` only after the loop below:
	// the iterator and this promise reject with the exact same underlying error
	// (both driven by runTurn's single finish()/rejectResult() call), but a
	// caller that only handles the iterator's own throw never touches this
	// promise at all when that throw exits the function first -- Node then
	// reports it as an unhandled rejection and can crash the host process on an
	// otherwise-handled, ordinary CLI failure (review finding r3-1).
	const resultPromise = turn.result;
	// A no-op observer attached immediately, independent of the real `await`
	// below: if a callback throws (see the loop below) this function exits
	// before ever reaching that `await`, and resultPromise could itself go on
	// to REJECT too (the CLI call failing for its own, unrelated reason) --
	// this keeps that rejection from ever being unobserved, without changing
	// what error the caller actually sees (the callback's own throw still
	// propagates untouched).
	void resultPromise.catch(() => undefined);

	let sessionId: string | undefined;
	let assistantEntrySeq = 0;
	// Driven manually (not a bare `for await`) so only the ITERATOR's own
	// rejection is swallowed here -- resultPromise below carries that exact
	// same underlying error authoritatively. A callback (onSession/onHistory)
	// throwing is a SEPARATE, genuine event-delivery failure (e.g. historyLines()'s
	// own active-entry-limit guard) that must propagate and fail the turn even
	// when the CLI itself went on to exit cleanly -- swallowing it here, as a
	// blanket try/catch around the whole loop body previously did, silently
	// turned a real delivery failure into a reported success (review finding
	// r4-1).
	const iterator = turn[Symbol.asyncIterator]();
	for (;;) {
		let step: IteratorResult<VibeTurnEvent>;
		try {
			step = await iterator.next();
		} catch {
			break;
		}
		if (step.done === true) break;
		const event = step.value;
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
	const result = await resultPromise;
	return { sessionId: result.sessionId ?? sessionId ?? '', stopReason: result.exitEvidence?.stopReason };
}
