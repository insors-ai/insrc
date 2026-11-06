/**
 * Story E20260925edb76e2e:S002 / sc5 — the CLI provider + stream adapter.
 *
 * The boundary that spawns a selected agentic CLI (claude / codex) for one chat
 * turn and yields a normalized {@link TurnEvent} stream (sc2), plus the native
 * session-resume handle. This is the ONLY place a provider difference lives
 * (k1, k4): each provider has a private native->TurnEvent mapper, and nothing
 * provider-specific escapes past this module.
 *
 * Execution is EXTENSION-MANAGED and bypasses the daemon (k1): run() spawns the
 * CLI directly via an injected `spawn` seam (the production seam wraps
 * node:child_process — see {@link nodeSpawner}). Cloud LLM access happens only
 * through the user's own CLI OAuth session; this module makes NO direct cloud
 * REST call and stores no credentials (k2). Ollama and other plain-completion
 * providers are never registered (k4).
 *
 * vscode-free + deps-injected (the createWebviewPanelHost(deps) idiom), so all
 * of it is unit-testable with a fake spawner.
 *
 * Spike-pinned native stream contracts (S002 migration step 1):
 *   claude: `claude -p --input-format=stream-json --output-format=stream-json --replay-user-messages --verbose`
 *           (+ `--resume <session_id>`). Emits NDJSON lines:
 *             {type:'system',subtype:'init',session_id} — session id for resume
 *             {type:'assistant',message:{content:[{type:'text'|'tool_use',...}]}}
 *             {type:'result',user_message_uuid|user_message_uuids,...} — terminal only for own UUID
 *             {type:'rate_limit_event'|...}             — ignored noise
 *   codex:  `codex exec --json <prompt>` (+ `codex exec resume <id> --json`).
 *           Emits JSONL events; mapped best-effort (validated by the opt-in live test).
 *   vibe:   `vibe --prompt=<prompt> --output streaming` (+ `--resume <session_id>`).
 *           Emits one JSON session-entry object per line (the same entries the
 *           `--output json` array holds at the end): {type:'message', role,
 *           sessionId, content:[{type:'text'|'tool_call', ...}]}, plus
 *           {type:'reasoning'|'effect'} noise. tool_call blocks carry their
 *           arguments as a JSON STRING in `arguments_json`. There is no terminal
 *           event line — the adapter synthesizes `done` when the process exits 0.
 */
import { onUtf8Data } from '../../../src/shared/utf8-stream.js';
import { spawn as nodeChildSpawn, execFileSync } from 'node:child_process';
import { closeSync, openSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { ollamaClaudeEnv, type ChatOllamaTarget } from './ollama-routing.js';
import type { TurnEvent, UnifiedDiff } from './stream-events.js';
import type { PermissionMode } from './protocol.js';
import { DEFAULT_GRACE_MS, defaultIsAlive, defaultKillGroup, defaultProcessStartTime, signalGroup, stopProcess } from './session-lock.js';
import { parseMarker, SegmentGone, type SegmentCursor, type SessionOutput } from './session-output.js';

export type ProviderId = 'claude' | 'codex' | 'vibe';

export interface SessionHandle {
  readonly provider: ProviderId;
  readonly nativeSessionId: string;
}

export interface TurnRequest {
  readonly provider: ProviderId;
  readonly prompt: string;
  readonly resume?: SessionHandle;
  readonly cwd: string;
  /**
   * S004 (additive-optional): the tool-permission mode for this turn. `review`
   * makes the CLI raise host-answered permission prompts (surfaced as approval
   * cards); `auto` passes a no-prompt/bypass flag so the agent never blocks.
   * Undefined preserves today's argv exactly (k2) — the CLI's own default.
   */
  readonly permissionMode?: PermissionMode;
  /**
   * S001 (bugfix): tools to pre-allow for THIS turn (claude `--allowedTools`). Used by the
   * review-mode grant flow: claude in review mode denies a permission-needing tool and ends the
   * turn (it emits `system/permission_denied`, surfaced as an approval card); on Approve the host
   * re-runs the blocked action resuming the session with the tool named here, so it proceeds.
   */
  readonly allowedTools?: readonly string[];
  /**
   * Story E2026101259da3204:S001: directories outside `cwd` the CLI may read this turn — the
   * session's attachments directory when the session has an attachment (claude `--add-dir`).
   * The host sets it, never a click on an approval card. Codex needs no flag: it reads the
   * attached paths named in the prompt.
   */
  readonly readDirs?: readonly string[];
  /**
   * Run config from the chat panel's bottom-right controls: `model` is an id/alias of
   * the provider's family (absent = the CLI's own default), `effort` a level the
   * model accepts (absent = the CLI's default). Mapped per CLI in buildArgs; vibe
   * pins the model via VIBE_ACTIVE_MODEL (see envFor) and cannot take an effort.
   */
  readonly model?: string | undefined;
  readonly effort?: string | undefined;
}

/** The started CLI process of a turn, handed to the caller so it can tie a session lease to it. */
export interface TurnProcess {
  readonly pid: number | undefined;
  /** Settles when the process has exited. */
  readonly exit: Promise<{ code: number | null; signal: string | null }>;
  /** Signals the process group. */
  kill(signal: 'SIGTERM' | 'SIGKILL'): void;
  /** SIGTERM, then SIGKILL after a grace; resolves once the exit is confirmed (or the grace runs out). */
  stop(): Promise<void>;
  /**
   * MR3-R4b: like stop(), but resolves true ONLY when the exit was confirmed (false when the
   * process ignored even SIGKILL within the grace) — the verified-stop contract recovery needs.
   */
  stopVerified?(): Promise<boolean>;
  /** With a session output: where the turn's segment starts (session, turn, generation, offset). */
  readonly cursor?: SegmentCursor | undefined;
  /** With a session output: the session file the process writes to. */
  readonly outPath?: string | undefined;
}

export type TurnCursor = SegmentCursor;

export interface ResumeRequest {
  readonly cursor: SegmentCursor;
  /** The turn's CLI process, as recorded when it started. */
  readonly pid: number | undefined;
  /** That process's start time (processStartTime), so a reused pid is never mistaken for it. */
  readonly startedAt: number | null;
  /**
   * E202611031bd72813:S001 t5: the persisted decoder state for this cursor (selectionSeq counter +
   * a split selection marker's buffer), so a resumed read never reuses a selection id or loses a
   * marker that spans chunks. Absent -> an empty state (today's behaviour).
   */
  readonly decoderState?: {
    readonly selectionSeq?: number | undefined;
    readonly selectionBuffer?: string | undefined;
    readonly sessionId?: string | undefined;
    /** tool_use id -> command, and -> edit file path: without them a budget boundary between tool_use and tool_result loses the correlation. */
    readonly toolCommands?: Readonly<Record<string, string>> | undefined;
    readonly editPaths?: Readonly<Record<string, string>> | undefined;
  } | undefined;
  /**
   * E202611031bd72813:S001 t5: a terminal was already ingested at/before this cursor (checkpoint
   * flag) — the resume must not report a synthetic EOF failure for it.
   */
  readonly sawTerminal?: boolean | undefined;
}

export interface ResumeOptions {
  readonly onProgress?: ((cursor: TurnCursor) => void) | undefined;
  /**
   * E202611031bd72813:S001 t5: the adapter's live decoder state after each ingested line, so the
   * observer can persist it (checkpoint) and a later resume continues with the same ids/buffers.
   */
  readonly onDecoderState?: ((state: {
    readonly selectionSeq: number;
    readonly selectionBuffer: string;
    readonly sessionId?: string | undefined;
    readonly toolCommands?: Readonly<Record<string, string>> | undefined;
    readonly editPaths?: Readonly<Record<string, string>> | undefined;
  }) => void) | undefined;
  /** Aborting it stops following; the process is left running. */
  readonly signal?: AbortSignal | undefined;
  /** Hands over the followed turn's process, so Stop can end it. */
  readonly onAttach?: ((proc: TurnProcess) => void) | undefined;
  /**
   * E202611031bd72813:S001 t5: keep reading the WHOLE segment past the terminal event (the observer
   * uses this: 'caught up' means drained, and a request can arrive after the result line). Default
   * false: resume ends at the first terminal event, as before.
   */
  readonly drain?: boolean | undefined;
}

export interface RunOptions {
  /** Called once the CLI process has started. */
  readonly onSpawn?: ((proc: TurnProcess) => void) | undefined;
  /** Called after the events of each output line have been yielded, with the position after that line. */
  readonly onProgress?: ((cursor: TurnCursor) => void) | undefined;
  /**
   * E202611031bd72813:S001 t5: the stateful decoder progress (selectionSeq + split-marker buffer)
   * after each output line, so a detach/reattach of the LIVE run resumes with it (the live cursor's
   * own checkpoint, independent of the observer's).
   */
  readonly onDecoderState?: ((state: {
    readonly selectionSeq: number;
    readonly selectionBuffer: string;
    readonly sessionId?: string | undefined;
    readonly toolCommands?: Readonly<Record<string, string>> | undefined;
    readonly editPaths?: Readonly<Record<string, string>> | undefined;
  }) => void) | undefined;
  /**
   * MR3-R2 (manual review): cancellation predicate rechecked immediately BEFORE the child spawn —
   * the session-output beginTurn() await above can outlast the delivery timeout, so the lifecycle's
   * pre-run check alone cannot stop a timed-out continuation from launching.
   */
  readonly shouldSpawn?: (() => boolean) | undefined;
  /**
   * The chat session the turn belongs to. With AdapterDeps.sessionOutput, the turn's output is
   * kept in that session's file. Pass it only while holding the session's lease.
   */
  readonly sessionId?: string | undefined;
}

export interface StreamAdapter {
  /**
   * Spawn + stream one turn, yielding normalized sc2 events. Completes right after the first
   * terminal done/error event WITHOUT stopping the process: a CLI that keeps running after its
   * answer keeps running, and its live entry (for decide()) is dropped when it exits.
   */
  run(req: TurnRequest, opts?: RunOptions): AsyncIterable<TurnEvent>;
  /**
   * Follow an earlier turn's segment of the session file from a saved cursor (after a reload):
   * the same events a live run would have yielded for the lines after it, ending at the terminal
   * event, at the segment's end, or with an error once the recorded process is gone without one.
   */
  resume(req: ResumeRequest, opts?: ResumeOptions): AsyncIterable<TurnEvent>;
  /**
   * Stop an in-flight turn's process group by id (SIGTERM, then SIGKILL after a grace);
   * resolves once the exit is confirmed. No-op for unknown/exited turns.
   */
  cancel(turnId: string): Promise<void>;
  /**
   * MR3-R5: stop the process of EXACTLY this turn (identity-bound by turnId), resolving true only
   * when its exit was confirmed; `undefined` when this adapter holds no live process for it (the
   * caller must fail closed then — never stop another turn as a substitute).
   */
  stopTurnVerified?(turnId: string): Promise<boolean | undefined>;
  /**
   * S004: relay a review-mode permission decision back to the live turn's CLI.
   * Looks up the pending request registered for (turnId, requestId); if live, writes
   * the provider control response via the process write() seam and clears it. A
   * decision for an unknown/stale/dead requestId is a no-op (nothing written), and at
   * most one control response is ever written per requestId. Idempotent + safe.
   * E202611031bd72813:S001 t6: returns whether the decision was DELIVERED — a failed
   * write does not consume the request, so the caller can fall back to a follow-up run.
   */
  decide(turnId: string, requestId: string, decision: 'approve' | 'deny'): { readonly delivered: boolean };
  /** E202611031bd72813:S001 t6: re-register a restored request (reattach/reload) so decide() can answer it. */
  registerPending?(turnId: string, requestId: string): void;
  /** E202611031bd72813:S001 t6: subscribe to ASYNC write failures of a delivered decision — the
   * caller corrects the recorded outcome (delivery-failed) and can fall back to a follow-up run. */
  onDeliveryFailed?(cb: (turnId: string, requestId: string, decision: 'approve' | 'deny') => void): void;
  /** Static capabilities of this provider (e.g. whether native session resume is supported). */
  readonly capabilities: { readonly resume: boolean };
}

export interface ProviderRegistry {
  get(id: ProviderId): StreamAdapter;
  readonly available: ReadonlyArray<ProviderId>;
}

// ---- injected seams ---------------------------------------------------------

/** A spawned CLI process, reduced to the surface the adapter needs. Injectable for tests. */
export interface SpawnedProcess {
  /** stdout as decoded, newline-delimited lines (trailing partial line flushed on close). */
  lines(): AsyncIterable<string>;
  /** Accumulated stderr text (for the failure-message tail). */
  stderr(): string;
  /** Resolves when the process exits. `code` null + a signal means it was killed. */
  readonly exit: Promise<{ code: number | null; signal: string | null }>;
  /** Reject reason if the process could not be spawned (e.g. ENOENT); undefined once spawned. */
  readonly spawnError: Promise<NodeJS.ErrnoException | undefined>;
  /** The OS pid, when known (the real spawner); fakes may omit it. */
  readonly pid?: number | undefined;
  /** Signal the process (its whole group, for the real spawner). Default SIGTERM. Idempotent. */
  kill(signal?: 'SIGTERM' | 'SIGKILL'): void;
  /**
   * S004 (additive-optional): write a native control line to the process stdin —
   * the review-mode permission-decision relay (host answers the CLI's prompt).
   * Optional so existing spawner impls/tests that never answer prompts keep
   * compiling and behaving as today (k2); the decision relay guards on its
   * presence before calling. Claude also requires it for initial structured user input.
   * A returned promise acknowledges writing; rejections are surfaced by the adapter.
   */
  /** E202611031bd72813:S001 t6: returns whether the write reached the process (false = dead/absent stdin). */
  write?(data: string, onError?: (err: unknown) => void): boolean;
  /**
   * Optional: end the process stdin (EOF). A CLI that reads structured input keeps waiting for
   * more after its result, so the adapter ends the input once a correlated turn is terminal and
   * the CLI exits, releasing the session's chat lock. Idempotent; never throws.
   */
  endInput?(): void;
  /** With a session output: the position just after the last line lines() yielded. */
  readonly cursor?: SegmentCursor | undefined;
}

/**
 * Where a turn's output goes when it is kept in the session's output file (session-output.ts):
 * the CLI's stdout and stderr are appended to these files, and lines() reads the turn's segment.
 */
export interface SpawnOutput {
  readonly outPath: string;
  readonly errPath: string;
  /** Just after the turn's turn-start marker. */
  readonly cursor: SegmentCursor;
  readonly tail: (cursor: SegmentCursor, finished: () => boolean) => AsyncIterable<{ readonly line: string; readonly cursor: SegmentCursor }>;
  readonly errTail: () => string;
}

export type SpawnFn = (
  command: string,
  args: readonly string[],
  opts: {
    readonly cwd: string;
    readonly output?: SpawnOutput | undefined;
    /**
     * ISSUE-2284d9b4: start the CLI with no input stream. For a CLI that reads its input as
     * prompt text until it ends, an open pipe means it never starts the turn.
     */
    readonly closeInput?: boolean | undefined;
    /** Full child environment (merged over nothing — pass a complete env). Absent -> inherit. */
    readonly env?: NodeJS.ProcessEnv | undefined;
  },
) => SpawnedProcess;

/** Minimal logger seam (the vscode-plugin does not pull the daemon's pino logger; never console.log). */
export interface AdapterLogger {
  warn(msg: string): void;
  error(msg: string): void;
}

/** Probe whether a provider's CLI binary is usable on this machine. */
export type BinaryProbe = (id: ProviderId) => boolean;

export interface AdapterDeps {
  readonly spawn: SpawnFn;
  readonly isInstalled: BinaryProbe;
  /** Resolve the selected model at launch, never from webview-supplied endpoint/auth data. */
  readonly resolveOllamaTarget?: ((request: TurnRequest) => Promise<ChatOllamaTarget | undefined>) | undefined;
  readonly logger?: AdapterLogger;
  /** cancel()'s wait after SIGTERM, and again after SIGKILL. Default 5000 ms. */
  readonly stopGraceMs?: number;
  /** Keeps each turn's output in its session's file; without it every turn uses the pipe. */
  readonly sessionOutput?: SessionOutput | undefined;
  /** Process seams for resume() (defaults: the real ones from session-lock.ts). */
  readonly isAlive?: ((pid: number) => boolean) | undefined;
  readonly killGroup?: ((pid: number, signal: 'SIGTERM' | 'SIGKILL') => void) | undefined;
  readonly processStartTime?: ((pid: number) => number | undefined) | undefined;
  /** How often resume() checks whether the followed process is still alive. Default 200 ms. */
  readonly livenessPollMs?: number | undefined;
}

const NOOP_LOGGER: AdapterLogger = { warn: () => {}, error: () => {} };

// ---- provider mappers (private) ---------------------------------------------

/** Mutable per-turn state a mapper may thread across lines (e.g. the captured native session id). */
interface TurnState {
  /** Expected native request identity, reconstructed from the durable host turn id. */
  requestUuid?: string;
  /** Most recent native result; legacy readers defer it until the segment ends. */
  result?: Extract<TurnEvent, { kind: 'done' }>;
  sessionId?: string;
  /**
   * S001 (dev-chat ux polish): tool_use `id` -> the command it ran, remembered so a later
   * claude tool_result message (which carries only `tool_use_id`) can correlate the command
   * back onto its ToolResultEvent. Absent when the tool exposed no command.
   */
  toolCommands?: Record<string, string>;
  /**
   * Story E20261013b2e8109f:S001: tool_use `id` of an edit tool call -> the file it was asked to
   * change, remembered so its tool_result (which carries only `tool_use_id`) can say which edit it
   * answers.
   */
  editPaths?: Record<string, string>;
  /**
   * S004 (dev-chat ux polish): a partially-streamed `insrc:select` marker — the text from an
   * OPENED fence whose closing fence has not yet arrived in this turn's stream. Buffered here so
   * a half-marker never emits a selection-request and never leaks a partial fence to the visible
   * assistant text; flushed (parsed) once the closing fence arrives. See {@link extractSelectionMarkers}.
   */
  selectionBuffer?: string;
  /** S004: monotonically increasing per-turn counter used to mint a unique selection requestId. */
  selectionSeq?: number;
}

/**
 * S001 (dev-chat ux polish): coerce a claude tool_result block's `content` into a single output
 * string. claude sends it either as a plain string or as an array of `{type:'text',text}` blocks;
 * anything else (or an empty payload) yields '' (an empty-output tool result is still surfaced).
 */
function coerceToolResultOutput(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((b) => (isRecord(b) && b['type'] === 'text' && typeof b['text'] === 'string' ? (b['text'] as string) : ''))
      .join('');
  }
  return '';
}

/** A provider mapper turns ONE native stdout line into zero or more normalized TurnEvents. */
interface ProviderMapper {
  readonly id: ProviderId;
  readonly resume: boolean;
  /** Build the argv for a turn (prompt + optional resume). */
  buildArgs(req: TurnRequest): string[];
  /** Initial structured user input; absent for providers using argv/stdin prompt text. */
  formatInput?(req: TurnRequest, requestUuid: string): string;
  /** Map one native line to 0..n TurnEvents. Return [] to ignore (noise). Throw to signal an unparseable line. */
  mapLine(line: string, turnId: string, state: TurnState): TurnEvent[];
  /**
   * S004: format the native control line that answers a permission request on the
   * CLI's stdin (review-mode decision relay). The one place the provider's approval
   * wire-shape lives; the run-loop registry writes it via SpawnedProcess.write. The
   * exact envelope is pinned by the INSRC_LIVE_TESTS suite against the installed CLI.
   */
  formatDecision(requestId: string, decision: 'approve' | 'deny'): string;
  /**
   * ISSUE-2284d9b4: the CLI reads its input stream as prompt text until it ends, so it is started
   * with that input closed. Nothing can then be written to it: a decision for such a CLI is
   * reported as undeliverable. Absent -> the input stays open for the decision relay.
   */
  readonly inputIsPrompt?: boolean | undefined;
  /**
   * Per-turn environment for the spawn (e.g. vibe pins its model with VIBE_ACTIVE_MODEL,
   * which has no --model flag). Absent -> the child inherits the extension host's env.
   */
  envFor?(req: TurnRequest): NodeJS.ProcessEnv | undefined;
}

// ---- S004: permission-request normalizing adapter (over field aliases) -------
//
// The claude control line and the codex approval item name their fields
// differently (and may rename them cosmetically between versions). Rather than
// hard-code one shape, each mapper DETECTS its own permission line, then hands the
// raw object(s) to this shared normalizer, which maps a small candidate set of
// aliases onto the internal ApprovalRequest -> ApprovalRequestEvent. A line with no
// resolvable requestId yields null (the mapper returns [] — no uncorrelatable card).

const APPROVAL_ID_KEYS = ['request_id', 'requestId', 'id', 'call_id', 'callId'] as const;
const APPROVAL_TITLE_KEYS = ['title', 'tool_name', 'toolName', 'summary', 'name'] as const;
const APPROVAL_DETAIL_KEYS = ['detail', 'command', 'description', 'message', 'reason'] as const;
const APPROVAL_TOOL_KEYS = ['tool_name', 'toolName', 'tool', 'name'] as const;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** First non-empty string found for any of `keys` across the candidate `sources`, in order. */
function pickString(sources: ReadonlyArray<Record<string, unknown>>, keys: ReadonlyArray<string>): string | undefined {
  for (const src of sources) {
    for (const k of keys) {
      const v = src[k];
      if (typeof v === 'string' && v !== '') return v;
    }
  }
  return undefined;
}

/**
 * Normalize a provider's permission/approval object(s) into an ApprovalRequestEvent,
 * or null when no requestId can be resolved (an uncorrelatable line — the mapper
 * then yields []). `raw` and its common nested carriers (request / item / input)
 * are all searched for aliased fields.
 */
function normalizeApprovalEvent(turnId: string, raw: Record<string, unknown>): TurnEvent | null {
  const nested = [raw['request'], raw['item'], raw['input'], isRecord(raw['item']) ? raw['item']['input'] : undefined];
  const sources = [raw, ...nested].filter(isRecord);
  const requestId = pickString(sources, APPROVAL_ID_KEYS);
  if (requestId === undefined) return null; // idless -> no card (k2: not an error, just noise)
  const toolName = pickString(sources, APPROVAL_TOOL_KEYS);
  const title = pickString(sources, APPROVAL_TITLE_KEYS) ?? toolName ?? 'Permission request';
  const detail = pickString(sources, APPROVAL_DETAIL_KEYS) ?? '';
  return {
    kind: 'approval-request',
    turnId,
    requestId,
    title,
    detail,
    ...(toolName !== undefined ? { toolName } : {}),
    // ISSUE-6a811b8a: every request normalized here waits inside the running turn for decide().
    resolution: 'in-turn',
  };
}

/**
 * S001 (bugfix): classify a permission-denial message into what the host can actually do about it.
 * A tool-permission gate ('tool-gate') can be granted by pre-allowing the tool on a resume re-run
 * (--allowedTools); a working-directory / sandbox-allowlist block ('dir-block') CANNOT — no tool
 * grant adds a directory to the session's allowed working dirs, so Approve must not pretend to.
 *
 * CONSERVATIVE: only the sandbox working-directory phrasing (matched case-insensitively on
 * "allowed working directories") is a dir-block; everything else — including unknown/empty — is a
 * tool-gate (the safe default). A real tool-gate is never mis-classified as dir-block.
 */
export function classifyPermissionDenial(detail: string): 'tool-gate' | 'dir-block' {
  return /allowed working directories/i.test(detail) ? 'dir-block' : 'tool-gate';
}

// ---- S004: the `insrc:select` selection-marker parser -----------------------
//
// The provider streams carry NO native selection signal, so a selection request rides
// the assistant text as a fenced marker the model is asked to emit:
//
//   ```insrc:select
//   {"prompt":"Pick one","options":[{"id":"a","label":"Option A"}],"multi":false}
//   ```
//
// Grammar: a ``` code fence whose info string is EXACTLY `insrc:select`, whose body is a
// single JSON object { prompt: string (non-empty), options: [{id,label}, …] (non-empty),
// multi?: boolean }. Option ids SHOULD be unique — the webview keys chips by array index, so
// duplicate ids still render distinctly but map back ambiguously. A COMPLETE, VALID marker →
// one SelectionRequestEvent (with a minted requestId) + the raw marker stripped from the
// visible assistant text. A MALFORMED marker (bad JSON / missing prompt / empty options) →
// NO event, the raw marker left in the visible text, never a throw. A marker whose closing
// fence has not yet streamed is BUFFERED in TurnState so a half-marker never emits.

const SELECT_FENCE_INFO = 'insrc:select';
const SELECT_FENCE_OPEN = '```' + SELECT_FENCE_INFO;

/** A parsed selection marker body -> a SelectionRequestEvent, or null if the body is malformed. */
function parseSelectionBody(turnId: string, body: string, state: TurnState): TurnEvent | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null; // not valid JSON -> not a marker (leave the raw text)
  }
  if (!isRecord(parsed)) return null;
  const prompt = parsed['prompt'];
  if (typeof prompt !== 'string' || prompt === '') return null; // prompt required + non-empty
  const rawOptions = parsed['options'];
  if (!Array.isArray(rawOptions) || rawOptions.length === 0) return null; // non-empty options required
  const options: { id: string; label: string }[] = [];
  for (const o of rawOptions) {
    if (!isRecord(o)) return null;
    const id = o['id'];
    const label = o['label'];
    if (typeof id !== 'string' || typeof label !== 'string') return null;
    options.push({ id, label });
  }
  const multi = parsed['multi'] === true;
  const seq = state.selectionSeq ?? 0;
  state.selectionSeq = seq + 1;
  const requestId = `sel-${turnId}-${seq}`;
  return { kind: 'selection-request', turnId, requestId, prompt, options, ...(multi ? { multi: true } : {}) };
}

/**
 * Scan an incoming assistant-text chunk for `insrc:select` fenced markers, prepending any
 * buffered partial from a prior chunk. Returns the VISIBLE text (markers stripped) plus any
 * SelectionRequestEvents parsed from complete, valid markers. An opened-but-unclosed marker is
 * buffered in `state.selectionBuffer` (nothing emitted for it until the closing fence arrives).
 * Pure over its inputs except for the buffer/seq it threads through `state`; never throws.
 */
function extractSelectionMarkers(turnId: string, incoming: string, state: TurnState): { text: string; events: TurnEvent[] } {
  let buf = (state.selectionBuffer ?? '') + incoming;
  delete state.selectionBuffer;
  let visible = '';
  const events: TurnEvent[] = [];
  for (;;) {
    const open = buf.indexOf(SELECT_FENCE_OPEN);
    if (open === -1) {
      visible += buf;
      break;
    }
    visible += buf.slice(0, open);
    const rest = buf.slice(open);
    const infoEnd = rest.indexOf('\n');
    if (infoEnd === -1) {
      // The opening fence line has not finished streaming — buffer from the fence and wait.
      state.selectionBuffer = rest;
      break;
    }
    // Require the info string to be EXACTLY `insrc:select` (guards `insrc:selectN` false positives).
    if (rest.slice(3, infoEnd).trim() !== SELECT_FENCE_INFO) {
      // Not our fence: emit the ``` and keep scanning past it (never an infinite loop — the
      // backticks are consumed, so the next indexOf cannot re-match at the same spot).
      visible += rest.slice(0, 3);
      buf = rest.slice(3);
      continue;
    }
    const close = rest.indexOf('\n```', infoEnd);
    if (close === -1) {
      // Opened, not yet closed — buffer the whole marker and wait for the closing fence.
      state.selectionBuffer = rest;
      break;
    }
    const body = rest.slice(infoEnd + 1, close);
    const afterFence = rest.indexOf('\n', close + 4); // skip past the closing ``` line
    const consumedEnd = afterFence === -1 ? rest.length : afterFence + 1;
    const ev = parseSelectionBody(turnId, body, state);
    if (ev !== null) {
      events.push(ev); // valid marker -> emit + strip (already excluded from `visible`)
    } else {
      visible += rest.slice(0, consumedEnd); // malformed -> leave the raw marker as visible text
    }
    buf = rest.slice(consumedEnd);
  }
  return { text: visible, events };
}

/**
 * S004: emit assistant text, first extracting any `insrc:select` markers. When there is no fence
 * in the chunk and no buffered partial, this is byte-identical to today (one assistant-delta, or
 * none for empty text); otherwise the visible (stripped) text becomes the delta and each complete
 * marker becomes a SelectionRequestEvent that follows it.
 */
function emitAssistantText(turnId: string, raw: string, state: TurnState): TurnEvent[] {
  if (state.selectionBuffer === undefined && !raw.includes(SELECT_FENCE_OPEN)) {
    return raw === '' ? [] : [{ kind: 'assistant-delta', turnId, text: raw }];
  }
  const { text, events } = extractSelectionMarkers(turnId, raw, state);
  const out: TurnEvent[] = [];
  if (text !== '') out.push({ kind: 'assistant-delta', turnId, text });
  out.push(...events);
  return out;
}

/** Build a UnifiedDiff (single hunk) from a claude Edit/Write tool_use input. Best-effort, hunk-shaped. */
function diffFromClaudeEdit(path: string, input: Record<string, unknown>): UnifiedDiff {
  const before = typeof input['old_string'] === 'string' ? (input['old_string'] as string) : '';
  const after =
    typeof input['new_string'] === 'string'
      ? (input['new_string'] as string)
      : typeof input['content'] === 'string'
        ? (input['content'] as string)
        : '';
  const oldLines = before === '' ? 0 : before.split('\n').length;
  const newLines = after === '' ? 0 : after.split('\n').length;
  const lines = [
    ...(before === '' ? [] : before.split('\n').map((l) => `-${l}`)),
    ...(after === '' ? [] : after.split('\n').map((l) => `+${l}`)),
  ];
  return { path, hunks: [{ oldStart: 1, oldLines, newStart: 1, newLines, lines }] };
}

// Only the tools whose payload diffFromClaudeEdit actually parses (old_string/
// new_string/content). MultiEdit (edits[]) and NotebookEdit (new_source) would
// yield a degenerate hunk, so they surface as generic tool-calls for now (a
// richer diff for them is S006's concern).
const CLAUDE_EDIT_TOOLS = new Set(['Edit', 'Write']);

const claudeMapper: ProviderMapper = {
  id: 'claude',
  resume: true,
  buildArgs(req: TurnRequest): string[] {
    // Structured input supplies stable request correlation and safely carries leading-dash prompts.
    const args = ['-p', '--input-format=stream-json', '--output-format=stream-json', '--replay-user-messages', '--verbose'];
    if (req.resume) args.push('--resume', req.resume.nativeSessionId);
    // Attachments: the directories the turn may read, before the permission flags. The next
    // flag (or the closing `--`) ends the variadic list. None => today's argv exactly.
    if (req.readDirs && req.readDirs.length > 0) args.push('--add-dir', ...req.readDirs);
    // S004: permission-mode flags (k3, verified spike 7100435). Undefined => no flag,
    // byte-identical argv to today (k2). review => host answers prompts (approval cards);
    // auto => bypass so the agent never blocks. Never both.
    // S001 (bugfix): the single chat mode → claude permission flags. manual: host answers every
    // prompt (edits + commands). edit-auto: auto-accept edits, host answers the rest. auto: bypass
    // all checks. Undefined => no flag (k2, today's argv). Never a bypass in manual/edit-auto.
    if (req.permissionMode === 'manual') args.push('--permission-prompts', 'host');
    else if (req.permissionMode === 'edit-auto') args.push('--permission-mode', 'acceptEdits', '--permission-prompts', 'host');
    else if (req.permissionMode === 'auto') args.push('--permission-mode', 'bypassPermissions');
    // Run config (chat panel): --model / --effort when set; absent = the CLI's own defaults.
    if (req.model !== undefined && req.model !== '') args.push('--model', req.model);
    if (req.effort !== undefined && req.effort !== '') args.push('--effort', req.effort);
    // S001 (bugfix): the manual/edit-auto grant re-run pre-allows the approved tool so the resumed
    // action proceeds instead of denying again. Space-separated names after --allowedTools.
    if (req.allowedTools && req.allowedTools.length > 0) args.push('--allowedTools', ...req.allowedTools);
    // End variadic tool/directory options; the prompt travels only in structured stdin.
    args.push('--');
    return args;
  },
  formatInput(req, requestUuid) {
    return JSON.stringify({ type: 'user', uuid: requestUuid, session_id: '', parent_tool_use_id: null,
      message: { role: 'user', content: req.prompt } }) + '\n';
  },
  mapLine(line: string, turnId: string, state: TurnState): TurnEvent[] {
    const trimmed = line.trim();
    if (trimmed === '') return [];
    const obj = JSON.parse(trimmed) as Record<string, unknown>; // throws on unparseable -> caller skips+logs
    const type = obj['type'];
    if (typeof obj['session_id'] === 'string' && state.sessionId === undefined) {
      state.sessionId = obj['session_id'] as string;
    }
    if (type === 'system') {
      // S001 (bugfix): claude's REAL review-mode permission signal — a tool that needs permission
      // surfaces as system/permission_denied (verified against the installed CLI; its capabilities
      // lack the in-turn can_use_tool control channel), then the turn ends. Surface it as the
      // in-chat approval card (the request that was NOT showing up). requestId = tool_use_id;
      // toolName rides the event so the host's grant re-run can pre-allow exactly that tool.
      if (obj['subtype'] === 'permission_denied') {
        const toolName = typeof obj['tool_name'] === 'string' ? (obj['tool_name'] as string) : 'tool';
        const rid =
          typeof obj['tool_use_id'] === 'string' && obj['tool_use_id'] !== ''
            ? (obj['tool_use_id'] as string)
            : `perm-${turnId}`;
        const message = typeof obj['message'] === 'string' ? (obj['message'] as string) : `${toolName} needs your permission`;
        // S001 (bugfix): harvest the blocked command when the line carries one (top-level `command`
        // or a nested `input.command`), so the Approve grant re-run can name the EXACT command
        // instead of a vague nudge. Empty string counts as absent; when there is no command the
        // emitted event is byte-identical to today (k2).
        const cmd =
          typeof obj['command'] === 'string'
            ? (obj['command'] as string)
            : isRecord(obj['input']) && typeof obj['input']['command'] === 'string'
              ? (obj['input']['command'] as string)
              : undefined;
        return [
          {
            kind: 'approval-request',
            turnId,
            requestId: rid,
            title: `Permission: ${toolName}`,
            detail: message,
            toolName,
            ...(cmd !== undefined && cmd !== '' ? { command: cmd } : {}),
            // ISSUE-6a811b8a: claude ends the turn after this line, so the approval is carried by a follow-up.
            resolution: 'turn-ended',
          },
        ];
      }
      return [{ kind: 'status', turnId, phase: 'thinking' }];
    }
    if (type === 'assistant') {
      const message = obj['message'] as { content?: unknown } | undefined;
      const content = Array.isArray(message?.content) ? (message?.content as Array<Record<string, unknown>>) : [];
      const out: TurnEvent[] = [];
      for (const block of content) {
        const btype = block['type'];
        if (btype === 'text' && typeof block['text'] === 'string') {
          // S004: extract any `insrc:select` marker(s) — the visible text streams as an
          // assistant-delta, a complete marker becomes a selection-request (raw fence stripped).
          out.push(...emitAssistantText(turnId, block['text'] as string, state));
        } else if (btype === 'tool_use') {
          const toolName = typeof block['name'] === 'string' ? (block['name'] as string) : 'tool';
          const input = (block['input'] as Record<string, unknown> | undefined) ?? {};
          if (CLAUDE_EDIT_TOOLS.has(toolName) && typeof input['file_path'] === 'string') {
            if (typeof block['id'] === 'string' && block['id'] !== '') {
              (state.editPaths ??= {})[block['id'] as string] = input['file_path'] as string;
            }
            out.push({ kind: 'file-edit', turnId, path: input['file_path'] as string, diff: diffFromClaudeEdit(input['file_path'] as string, input) });
          } else {
            const mcp = parseMcpTool(toolName);
            // S001 sc2: surface the real command the tool ran (Bash `input.command`), when the
            // provider exposes one; command-less tools omit it and render as the tool name (k2).
            const command = typeof input['command'] === 'string' ? (input['command'] as string) : undefined;
            // S001 (dev-chat ux polish): remember this tool_use's command keyed by its id, so the
            // later tool_result message (carrying only tool_use_id) can correlate the command back.
            if (command !== undefined && typeof block['id'] === 'string' && block['id'] !== '') {
              (state.toolCommands ??= {})[block['id'] as string] = command;
            }
            // The declaration lives in the call's own input (never a tool result): Claude names the
            // tool server-qualified, so it is matched on the parsed MCP name, whichever server it is.
            const present = mcp?.name === PRESENT_TOOL ? declaredDocuments(input['documents']) : undefined;
            out.push({
              kind: 'tool-call',
              turnId,
              tool: toolName,
              ...(mcp ? { mcp } : {}),
              ...(present !== undefined ? { present } : {}),
              ...(command !== undefined ? { command } : {}),
              ...(typeof block['id'] === 'string' && block['id'] !== '' ? { callId: block['id'] as string } : {}),
            });
          }
        }
      }
      return out;
    }
    if (type === 'user') {
      // S001 (dev-chat ux polish): claude reports a tool's OUTPUT as a `type:'user'` message whose
      // content carries tool_result block(s). Surface each as a ToolResultEvent, correlating the
      // command from the preceding tool_use (via tool_use_id) when we tracked one. Previously this
      // line hit the noise fall-through and returned [] — that was the legibility gap.
      const message = obj['message'] as { content?: unknown } | undefined;
      const content = Array.isArray(message?.content) ? (message?.content as Array<Record<string, unknown>>) : [];
      const out: TurnEvent[] = [];
      for (const block of content) {
        if (block['type'] !== 'tool_result') continue;
        const output = coerceToolResultOutput(block['content']);
        const tid = typeof block['tool_use_id'] === 'string' ? (block['tool_use_id'] as string) : undefined;
        const command = tid !== undefined ? state.toolCommands?.[tid] : undefined;
        const editPath = tid !== undefined ? state.editPaths?.[tid] : undefined;
        out.push({
          kind: 'tool-result',
          turnId,
          output,
          ...(command !== undefined ? { command } : {}),
          ...(tid !== undefined && tid !== '' ? { callId: tid } : {}),
          ...(editPath !== undefined ? { editPath } : {}),
          ...(block['is_error'] === true ? { isError: true } : {}),
        });
      }
      return out;
    }
    if (type === 'result') {
      if (state.requestUuid !== undefined) {
        const ids = obj['user_message_uuids'];
        const matched = obj['user_message_uuid'] === state.requestUuid ||
          (Array.isArray(ids) && ids.every(id => typeof id === 'string') && ids.includes(state.requestUuid));
        if (!matched) return []; // queued/background result, not this submitted request
      }
      // Story S004: an is_error result carries the provider's text; keep it on the done event.
      const failed = obj['is_error'] === true;
      const text = failed && typeof obj['result'] === 'string' && (obj['result'] as string).trim() !== '' ? (obj['result'] as string).trim() : undefined;
      state.result = { kind: 'done', turnId, ok: !failed, ...(text !== undefined ? { message: text } : {}) };
      return [state.result];
    }
    // S004: a host-answered permission prompt (--permission-prompts host). claude raises
    // it as a control_request / permission_request envelope (or a nested can_use_tool
    // request). Normalize to one ApprovalRequestEvent; an idless line -> [] (noise).
    const request = obj['request'];
    if (
      type === 'control_request' ||
      type === 'permission_request' ||
      type === 'can_use_tool' ||
      (isRecord(request) && request['subtype'] === 'can_use_tool')
    ) {
      const ev = normalizeApprovalEvent(turnId, obj);
      return ev ? [ev] : [];
    }
    // rate_limit_event and any other envelope: ignored noise.
    return [];
  },
  formatDecision(requestId: string, decision: 'approve' | 'deny'): string {
    // claude's stream-json control-response for a can_use_tool prompt. The exact
    // envelope is pinned by the live suite; the correlation (request_id) + behavior
    // are the load-bearing fields the host must supply.
    return (
      JSON.stringify({
        type: 'control_response',
        response: {
          subtype: 'can_use_tool',
          request_id: requestId,
          behavior: decision === 'approve' ? 'allow' : 'deny',
        },
      }) + '\n'
    );
  },
};

/** The MCP tool a controller calls to declare the documents a turn presents for review. */
const PRESENT_TOOL = 'insrc_present';
/** The most documents one declaration may name (the tool's own limit). */
const PRESENT_MAX_DOCUMENTS = 20;

/** The documents a declaration names: a list of one to twenty non-empty strings, else undefined. */
function declaredDocuments(value: unknown): readonly string[] | undefined {
  if (!Array.isArray(value) || value.length === 0 || value.length > PRESENT_MAX_DOCUMENTS) return undefined;
  const docs: string[] = [];
  for (const d of value as unknown[]) {
    if (typeof d !== 'string' || d === '') return undefined;
    docs.push(d);
  }
  return docs;
}

/** claude MCP tool-use names look like `mcp__<server>__<name>`. */
function parseMcpTool(tool: string): { server: string; name: string } | undefined {
  const m = /^mcp__([^_]+(?:_[^_]+)*)__(.+)$/.exec(tool);
  if (!m || m[1] === undefined || m[2] === undefined) return undefined;
  return { server: m[1], name: m[2] };
}

const codexMapper: ProviderMapper = {
  id: 'codex',
  resume: true,
  // `codex exec` waits for its input to end before it starts ("Reading additional input from stdin...").
  inputIsPrompt: true,
  buildArgs(req: TurnRequest): string[] {
    // `codex exec --json <prompt>`; resume via the `exec resume <id>` subcommand.
    // S004: auto => bypass approvals+sandbox so the agent never blocks (k3, spike 7100435);
    // review => codex's default on-request approval routing (no extra flag); undefined =>
    // byte-identical argv to today (k2). The flag goes before the prompt (positional).
    // ISSUE-65cb63f7: `--` ends the options, so a prompt starting with '-' stays the prompt.
    const auto = req.permissionMode === 'auto' ? ['--dangerously-bypass-approvals-and-sandbox'] : [];
    // Run config (chat panel): -m / -c model_reasoning_effort= when set; absent = CLI defaults.
    const runCfg = [
      ...(req.model !== undefined && req.model !== '' ? ['-m', req.model] : []),
      ...(req.effort !== undefined && req.effort !== '' ? ['-c', `model_reasoning_effort=${req.effort}`] : []),
    ];
    if (req.resume) return ['exec', 'resume', req.resume.nativeSessionId, '--json', ...auto, ...runCfg, '--', req.prompt];
    return ['exec', '--json', ...auto, ...runCfg, '--', req.prompt];
  },
  mapLine(line: string, turnId: string, state: TurnState): TurnEvent[] {
    const trimmed = line.trim();
    if (trimmed === '') return [];
    const obj = JSON.parse(trimmed) as Record<string, unknown>; // throws -> caller skips+logs
    const sid = obj['session_id'] ?? obj['thread_id'] ?? obj['id'];
    if (typeof sid === 'string' && state.sessionId === undefined && (obj['type'] === 'thread.started' || obj['type'] === 'session.created')) {
      state.sessionId = sid;
    }
    const type = typeof obj['type'] === 'string' ? (obj['type'] as string) : '';
    // S004: a codex approval request (default on-request approval routing) — top-level
    // (e.g. exec_approval_request / apply_patch_approval_request) or a completed item whose
    // type names an approval. Normalize to one ApprovalRequestEvent; an idless line -> [].
    const approvalItem = isRecord(obj['item']) ? (obj['item'] as Record<string, unknown>) : undefined;
    const approvalItemType = approvalItem && typeof approvalItem['type'] === 'string' ? (approvalItem['type'] as string) : '';
    if (type.includes('approval') || approvalItemType.includes('approval')) {
      const ev = normalizeApprovalEvent(turnId, approvalItem ?? obj);
      return ev ? [ev] : [];
    }
    // codex exec --json emits item/thread events; map the ones we normalize, ignore the rest.
    if (type.endsWith('.delta') || type === 'agent_message_delta') {
      const text = typeof obj['delta'] === 'string' ? (obj['delta'] as string) : typeof obj['text'] === 'string' ? (obj['text'] as string) : '';
      // S004: extract any `insrc:select` marker(s) from the streamed delta (buffered across chunks).
      return emitAssistantText(turnId, text, state);
    }
    if (type === 'item.completed' || type === 'agent_message') {
      const item = (obj['item'] as Record<string, unknown> | undefined) ?? obj;
      const itemType = item['type'];
      if (itemType === 'file_change' || itemType === 'patch') {
        // Story E20261013b2e8109f:S001: a patch item lists every file it changed (`changes`); an
        // older shape names one `path`. The change is on disk unless the item failed.
        const changes = Array.isArray(item['changes']) ? (item['changes'] as Array<Record<string, unknown> | null>) : [];
        const listed = changes.map((c) => c?.['path']).filter((p): p is string => typeof p === 'string' && p !== '');
        const paths = listed.length > 0 ? listed : [typeof item['path'] === 'string' ? (item['path'] as string) : '(unknown)'];
        const applied = item['status'] !== 'failed';
        return paths.map((path): TurnEvent => ({ kind: 'file-edit', turnId, path, diff: { path, hunks: [] }, ...(applied ? { applied: true as const } : {}) }));
      }
      if (itemType === 'mcp_tool_call' && typeof item['tool'] === 'string' && item['tool'] !== '') {
        // Story E20261015067b05b6:S001: a codex MCP call (codex-cli 0.162.1: server, a bare tool name
        // and an `arguments` object, reported on item.started AND item.completed, even when the call
        // failed). Only the completed item is read here, so a call declares once. The declaration is
        // the call's own arguments, never its result.
        const name = item['tool'] as string;
        const server = typeof item['server'] === 'string' && item['server'] !== '' ? (item['server'] as string) : undefined;
        const args = item['arguments'];
        const present =
          name === PRESENT_TOOL && typeof args === 'object' && args !== null && !Array.isArray(args)
            ? declaredDocuments((args as Record<string, unknown>)['documents'])
            : undefined;
        const callId = typeof item['id'] === 'string' && item['id'] !== '' ? (item['id'] as string) : undefined;
        return [
          {
            kind: 'tool-call',
            turnId,
            tool: name,
            ...(server !== undefined ? { mcp: { server, name } } : {}),
            ...(present !== undefined ? { present } : {}),
            ...(callId !== undefined ? { callId } : {}),
          },
        ];
      }
      if (itemType === 'command_execution' || itemType === 'tool_call') {
        // S001 sc2: carry the actual command (codex `item.command`) as the additive command
        // field, while `tool` keeps its existing label fallback. Command-less items omit it (k2).
        const command = typeof item['command'] === 'string' ? (item['command'] as string) : undefined;
        const tool = typeof item['tool'] === 'string' ? (item['tool'] as string) : command ?? 'tool';
        // ISSUE-1163888072faa9f2: the item id pairs this call's result onto its row (live-only).
        const callId = typeof item['id'] === 'string' && item['id'] !== '' ? (item['id'] as string) : undefined;
        const events: TurnEvent[] = [
          { kind: 'tool-call', turnId, tool, ...(command !== undefined ? { command } : {}), ...(callId !== undefined ? { callId } : {}) },
        ];
        // S001 (dev-chat ux polish): a completed codex command/tool item also carries its OUTPUT
        // (aggregated_output / output / stdout) — surface it as a ToolResultEvent so the transcript
        // shows the collapsed result. An output-less completion is byte-identical to today (k2).
        const rawOut = item['aggregated_output'] ?? item['output'] ?? item['stdout'];
        if (typeof rawOut === 'string') {
          const exitCode = typeof item['exit_code'] === 'number' ? (item['exit_code'] as number) : undefined;
          events.push({
            kind: 'tool-result',
            turnId,
            output: rawOut,
            ...(command !== undefined ? { command } : {}),
            ...(exitCode !== undefined ? { exitCode } : {}),
            ...(callId !== undefined ? { callId } : {}),
          });
        }
        return events;
      }
      const text = typeof item['text'] === 'string' ? (item['text'] as string) : '';
      // S004: a completed assistant message item may also carry an `insrc:select` marker.
      return emitAssistantText(turnId, text, state);
    }
    if (type === 'turn.completed' || type === 'thread.completed' || type === 'result') {
      // Story S004: a failed codex result carries its error text (a string, or an object with a message, or the result text).
      const failed = obj['is_error'] === true || obj['error'] !== undefined;
      const err = obj['error'];
      const text = !failed
        ? undefined
        : typeof err === 'string'
          ? err
          : typeof err === 'object' && err !== null && typeof (err as { message?: unknown }).message === 'string'
            ? (err as { message: string }).message
            : typeof obj['result'] === 'string'
              ? (obj['result'] as string)
              : undefined;
      return [{ kind: 'done', turnId, ok: !failed, ...(text !== undefined && text.trim() !== '' ? { message: text.trim() } : {}) }];
    }
    if (type === 'error' || type === 'turn.failed') {
      const message = typeof obj['message'] === 'string' ? (obj['message'] as string) : 'codex turn failed';
      return [{ kind: 'error', turnId, message }];
    }
    return [];
  },
  formatDecision(requestId: string, decision: 'approve' | 'deny'): string {
    // codex submission op answering an approval request. Envelope pinned by the live
    // suite; the correlation id + decision are the load-bearing fields.
    return (
      JSON.stringify({
        id: requestId,
        op: { type: 'approval', decision: decision === 'approve' ? 'approved' : 'denied' },
      }) + '\n'
    );
  },
};

/** vibe MCP tool-use names look like `mcp_<server>_<tool>` (single underscores,
 *  non-alphanumerics folded to `_` — e.g. `mcp_insrc_insrc_analyze_step`). */
function parseVibeMcpTool(tool: string): { server: string; name: string } | undefined {
  if (!tool.startsWith('mcp_')) return undefined;
  const rest = tool.slice('mcp_'.length);
  const sep = rest.indexOf('_');
  if (sep <= 0 || sep === rest.length - 1) return undefined;
  return { server: rest.slice(0, sep), name: rest.slice(sep + 1) };
}

const vibeMapper: ProviderMapper = {
  id: 'vibe',
  // `vibe -p --resume <session_id>` continues a saved session in headless mode.
  resume: true,
  // Vibe's bare -p reads stdin, not the positional initial prompt. Bind the
  // programmatic prompt explicitly with '=' so multiline and leading '-' text
  // remain one literal value. Stdin closes immediately. Consequence:
  // no stdin decision relay — headless vibe denies any approval nobody answers.
  inputIsPrompt: true,
  buildArgs(req: TurnRequest): string[] {
    const args = [`--prompt=${req.prompt}`, '--output', 'streaming'];
    if (req.resume) args.push('--resume', req.resume.nativeSessionId);
    // Attachments: vibe takes extra readable dirs as repeatable `--add-dir`.
    if (req.readDirs && req.readDirs.length > 0) for (const d of req.readDirs) args.push('--add-dir', d);
    // Permission modes (k3): auto => approve everything; manual => ask (denied
    // unanswered in headless); edit-auto => accept-edits agent. Undefined => no
    // flag, byte-identical argv to the default (k2). vibe has no pre-allow list
    // equivalent to claude --allowedTools (--enabled-tools DISABLES the rest in
    // headless), so req.allowedTools is not expressible and is ignored here.
    if (req.permissionMode === 'auto') args.push('--auto-approve');
    else if (req.permissionMode === 'manual') args.push('--agent', 'ask');
    else if (req.permissionMode === 'edit-auto') args.push('--agent', 'accept-edits');
    // Run config: vibe has no --model/--effort flags — the model is pinned via
    // VIBE_ACTIVE_MODEL in envFor(); effort is not forwardable (the model's own
    // `thinking` setting in the user's vibe config applies).
    return args;
  },
  envFor(req: TurnRequest): NodeJS.ProcessEnv | undefined {
    if (req.model === undefined || req.model === '') return undefined;
    return { ...process.env, VIBE_ACTIVE_MODEL: req.model };
  },
  mapLine(line: string, turnId: string, state: TurnState): TurnEvent[] {
    const trimmed = line.trim();
    if (trimmed === '') return [];
    const obj = JSON.parse(trimmed) as Record<string, unknown>; // throws -> caller skips+logs
    if (typeof obj['sessionId'] === 'string' && state.sessionId === undefined) {
      state.sessionId = obj['sessionId'] as string;
    }
    const type = typeof obj['type'] === 'string' ? (obj['type'] as string) : '';
    // An approval-shaped entry (if a future vibe emits one): normalize; idless -> [].
    if (type.includes('approval')) {
      const ev = normalizeApprovalEvent(turnId, obj);
      return ev ? [ev] : [];
    }
    if (type === 'error') {
      const message = typeof obj['message'] === 'string' ? (obj['message'] as string) : 'vibe turn failed';
      return [{ kind: 'error', turnId, message }];
    }
    if (type !== 'message') return []; // reasoning / effect / anything else: noise
    const role = obj['role'];
    const content = Array.isArray(obj['content']) ? (obj['content'] as Array<Record<string, unknown>>) : [];
    if (role === 'assistant') {
      const out: TurnEvent[] = [];
      for (const block of content) {
        const btype = block['type'];
        if (btype === 'text' && typeof block['text'] === 'string') {
          out.push(...emitAssistantText(turnId, block['text'] as string, state));
        } else if (btype === 'tool_call') {
          const toolName = typeof block['name'] === 'string' ? (block['name'] as string) : 'tool';
          // vibe carries the arguments as a JSON string in `arguments_json`.
          let input: Record<string, unknown> = {};
          if (typeof block['arguments_json'] === 'string') {
            try {
              const parsed: unknown = JSON.parse(block['arguments_json'] as string);
              if (isRecord(parsed)) input = parsed;
            } catch { /* malformed arguments_json: the call still surfaces, command-less */ }
          } else if (isRecord(block['arguments'])) {
            input = block['arguments'] as Record<string, unknown>;
          }
          const command = typeof input['command'] === 'string' ? (input['command'] as string) : undefined;
          if (command !== undefined && typeof block['id'] === 'string' && block['id'] !== '') {
            (state.toolCommands ??= {})[block['id'] as string] = command;
          }
          const mcp = parseVibeMcpTool(toolName);
          // vibe MCP names fold separators to `_`, so the present tool matches on its suffix.
          const present = mcp !== undefined && /(?:^|_)insrc_present$/.test(mcp.name)
            ? declaredDocuments(input['documents'])
            : undefined;
          out.push({
            kind: 'tool-call',
            turnId,
            tool: toolName,
            ...(mcp ? { mcp } : {}),
            ...(present !== undefined ? { present } : {}),
            ...(command !== undefined ? { command } : {}),
            ...(typeof block['id'] === 'string' && block['id'] !== '' ? { callId: block['id'] as string } : {}),
          });
        }
      }
      return out;
    }
    if (role === 'user') {
      // Tool output rides back as a user message carrying tool_result blocks
      // (ACP shape: tool_call_id + content, is_error).
      const out: TurnEvent[] = [];
      for (const block of content) {
        if (block['type'] !== 'tool_result') continue;
        const output = coerceToolResultOutput(block['content']);
        const tid = typeof block['tool_call_id'] === 'string' ? (block['tool_call_id'] as string)
          : typeof block['tool_use_id'] === 'string' ? (block['tool_use_id'] as string)
          : undefined;
        const command = tid !== undefined ? state.toolCommands?.[tid] : undefined;
        const editPath = tid !== undefined ? state.editPaths?.[tid] : undefined;
        out.push({
          kind: 'tool-result',
          turnId,
          output,
          ...(command !== undefined ? { command } : {}),
          ...(tid !== undefined && tid !== '' ? { callId: tid } : {}),
          ...(editPath !== undefined ? { editPath } : {}),
          ...(block['is_error'] === true ? { isError: true } : {}),
        });
      }
      return out;
    }
    return [];
    // No terminal event line exists in vibe's stream: the adapter synthesizes
    // `done` when the process exits (see run()).
  },
  formatDecision(requestId: string, decision: 'approve' | 'deny'): string {
    // Headless vibe has no stdin control channel (inputIsPrompt), so decide()
    // never writes this; kept for interface completeness as a JSON-RPC-style
    // response envelope, should a future vibe accept one.
    return JSON.stringify({ jsonrpc: '2.0', id: requestId, result: { decision } }) + '\n';
  },
};

const MAPPERS: Record<ProviderId, ProviderMapper> = { claude: claudeMapper, codex: codexMapper, vibe: vibeMapper };

/** Heuristic: does a native line/stderr indicate an auth failure the user must fix by re-logging-in? */
function looksLikeAuthError(text: string): boolean {
  return /\b(unauthorized|not (logged in|authenticated)|authentication (failed|required)|please (run )?login|401)\b/i.test(text);
}

// ---- adapter ----------------------------------------------------------------

const BINARY: Record<ProviderId, string> = { claude: 'claude', codex: 'codex', vibe: 'vibe' };

/** Reads and discards the rest of a stream (stdout after the terminal event). Never throws. */
async function drain(it: AsyncIterator<string>): Promise<void> {
  try {
    for (;;) if ((await it.next()).done === true) return;
  } catch {
    /* stdout closed or errored: nothing left to discard */
  }
}

function makeStreamAdapter(mapper: ProviderMapper, deps: AdapterDeps): StreamAdapter {
  const log = deps.logger ?? NOOP_LOGGER;
  const stopGraceMs = deps.stopGraceMs ?? DEFAULT_GRACE_MS;
  let outputFallbackLogged = false;
  const live = new Map<string, SpawnedProcess>();
  // S004: outstanding permission requests per live turn (the a2 pending-request registry).
  // t6: listeners notified when a decision's stdin write fails ASYNChronously (after decide()
  // already returned delivered:true) so the host can correct the outcome and fall back
  const deliveryFailedCbs = new Set<(turnId: string, requestId: string, decision: 'approve' | 'deny') => void>();

  // register on an emitted approval-request; decide() consumes; auto-cleaned on cancel()/exit.
  const pendingByTurn = new Map<string, Set<string>>();
  let turnSeq = 0;

  async function* run(req: TurnRequest, opts?: RunOptions): AsyncIterable<TurnEvent> {
    const requestUuid = mapper.formatInput === undefined ? undefined : randomUUID();
    const turnId = requestUuid === undefined ? `${mapper.id}-${Date.now()}-${turnSeq++}` : `claude-request-${requestUuid}`;
    // Honor the capability: if this provider can't resume, drop the handle and
    // start a fresh session rather than passing an unsupported flag (never throw).
    let effectiveReq = req;
    if (!mapper.resume && req.resume !== undefined) {
      const { resume: _drop, ...rest } = req;
      effectiveReq = rest;
    }
    let ollama: ChatOllamaTarget | undefined;
    try {
      if (deps.resolveOllamaTarget !== undefined) ollama = await deps.resolveOllamaTarget(effectiveReq);
      if (ollama !== undefined) {
        if (mapper.id !== 'claude') throw new Error('Ollama chat routing is supported only for Claude.');
        effectiveReq = { ...effectiveReq, model: ollama.model };
      }
    } catch (err) {
      yield { kind: 'error', turnId, message: err instanceof Error ? err.message : String(err) };
      return;
    }
    // Keep the turn's output in its session's file when we can; otherwise the pipe, as before.
    const sessionOutput = deps.sessionOutput;
    const sessionId = opts?.sessionId;
    let segment: Awaited<ReturnType<SessionOutput['beginTurn']>> | undefined;
    if (sessionOutput !== undefined && sessionId !== undefined) {
      try {
        segment = await sessionOutput.beginTurn(sessionId, turnId);
      } catch (err) {
        if (!outputFallbackLogged) log.error(`[chat:${mapper.id}] session output unavailable (${err instanceof Error ? err.message : String(err)}); reading this turn from the pipe`);
        outputFallbackLogged = true;
      }
    }
    const output: SpawnOutput | undefined =
      segment !== undefined && sessionOutput !== undefined && sessionId !== undefined
        ? {
            outPath: segment.outPath,
            errPath: segment.errPath,
            cursor: segment.cursor,
            tail: (cursor, finished) => sessionOutput.tail(cursor, { finished }),
            errTail: () => sessionOutput.errTail(sessionId),
          }
        : undefined;
    // MR3-R2: recheck cancellation immediately before the actual spawn; a timed-out continuation
    // whose delivery-failed was already recorded must not launch a child. The begun output segment
    // is closed again so no orphaned turn file remains.
    if (opts?.shouldSpawn !== undefined && !opts.shouldSpawn()) {
      if (segment !== undefined && sessionOutput !== undefined && sessionId !== undefined) {
        void sessionOutput.endTurn(sessionId, turnId, { code: null, signal: null }).catch(() => {});
      }
      return;
    }
    let proc: SpawnedProcess;
    try {
      proc = deps.spawn(BINARY[mapper.id], mapper.buildArgs(effectiveReq), {
        cwd: effectiveReq.cwd,
        ...(output !== undefined ? { output } : {}),
        ...(mapper.inputIsPrompt === true ? { closeInput: true } : {}),
        ...(ollama !== undefined
          ? { env: ollamaClaudeEnv(process.env, ollama.host) }
          : mapper.envFor !== undefined ? (() => { const env = mapper.envFor!(effectiveReq); return env !== undefined ? { env } : {}; })() : {}),
      });
    } catch (err) {
      if (segment !== undefined && sessionOutput !== undefined && sessionId !== undefined) {
        void sessionOutput.endTurn(sessionId, turnId, { code: null, signal: null }).catch(() => {});
      }
      yield { kind: 'error', turnId, message: failureMessage(mapper.id, err) };
      return;
    }
    live.set(turnId, proc);
    // The live entry (decide()'s route to stdin) and the turn's pending permission requests
    // last as long as the process, not the stream: a CLI may keep running after its answer.
    const forget = (): void => {
      if (live.get(turnId) === proc) live.delete(turnId);
      pendingByTurn.delete(turnId);
    };
    proc.exit.then(forget, forget);
    if (segment !== undefined && sessionOutput !== undefined && sessionId !== undefined) {
      // Close the turn's segment after the process's real exit (not at its answer). If this host is
      // gone by then, the next beginTurn closes it instead.
      const close = (e: { code: number | null; signal: string | null }): void => {
        void sessionOutput.endTurn(sessionId, turnId, e).catch((err: unknown) => log.warn(`[chat:${mapper.id}] could not close the output segment of ${turnId}: ${String(err)}`));
      };
      proc.exit.then(close, () => close({ code: null, signal: null }));
    }
    const state: TurnState = requestUuid === undefined ? {} : { requestUuid };
    let sawError = false;
    let sawDone = false;
    let inputFailure: Error | undefined;
    // Set BEFORE a terminal event is yielded, so a consumer that returns at it (the panel)
    // does not stop the process in the finally below.
    let terminal = false;
    // Stamp the captured native session id onto a terminal `done` so the caller
    // (S005) can persist the resume handle; a dead capture would strand resume.
    const doneEvent = (ok: boolean, message?: string): TurnEvent => ({
      kind: 'done',
      turnId,
      ok,
      ...(state.sessionId !== undefined ? { sessionId: state.sessionId } : {}),
      ...(!ok && message !== undefined ? { message } : {}),
    });
    const stdout = proc.lines()[Symbol.asyncIterator]();
    try {
      const spawnErr = await proc.spawnError;
      if (spawnErr !== undefined) {
        forget();
        terminal = true;
        yield { kind: 'error', turnId, message: spawnErr.code === 'ENOENT' ? `${BINARY[mapper.id]} CLI not found — install it or check your PATH` : failureMessage(mapper.id, spawnErr) };
        return;
      }
      if (mapper.formatInput !== undefined && requestUuid !== undefined) {
        if (proc.write === undefined) throw new Error('CLI stdin unavailable for correlated input');
        // The turn's one user message goes through the same seam as the approval decisions: false is a
        // dead or absent stdin, and an asynchronous failure arrives on onError. Either one fails the turn.
        let accepted = false;
        try {
          accepted = proc.write(mapper.formatInput(effectiveReq, requestUuid), (err) => {
            if (inputFailure === undefined) inputFailure = new Error(`CLI stdin write failed: ${err instanceof Error ? err.message : String(err)}`);
            proc.kill('SIGTERM');
          });
        } catch { /* a seam that throws is a seam that did not deliver */ }
        if (!accepted) throw new Error('CLI stdin is closed');
      }
      opts?.onSpawn?.({
        pid: proc.pid,
        exit: proc.exit,
        kill: (signal) => proc.kill(signal),
        stop: () => stopTurnProcess(proc).then(() => {}),
        stopVerified: () => stopTurnProcess(proc),
        ...(segment !== undefined ? { cursor: segment.cursor, outPath: segment.outPath } : {}),
      });
      for (;;) {
        const next = await stdout.next();
        if (inputFailure !== undefined) throw inputFailure;
        if (next.done === true) break;
        let events: TurnEvent[];
        try {
          // Host-written marker lines (session output segments) are never CLI events.
          events = parseMarker(next.value) !== undefined ? [] : mapper.mapLine(next.value, turnId, state);
        } catch {
          log.warn(`[chat:${mapper.id}] skipped unparseable stream line`);
          continue; // non-fatal: skip malformed line, never yield a malformed event
        }
        for (const ev of events) {
          // S004: register a surfaced permission request so decide() can later answer it.
          if (ev.kind === 'approval-request') {
            let set = pendingByTurn.get(turnId);
            if (set === undefined) {
              set = new Set<string>();
              pendingByTurn.set(turnId, set);
            }
            set.add(ev.requestId);
          }
          if (ev.kind === 'done') sawDone = true;
          if (ev.kind === 'error') sawError = true;
          if (sawDone || sawError) {
            terminal = true;
            // Keep reading (and discarding) stdout so a CLI that outlives its answer never
            // blocks on a full pipe; nothing after the terminal event is yielded.
            void drain(stdout);
            // A correlated turn has its answer: end the input the CLI is still waiting on so it
            // exits and frees the session's chat lock instead of idling until the next turn kills it.
            if (state.requestUuid !== undefined) proc.endInput?.();
          }
          // Checkpoint before terminal yield: consumers commonly return immediately at done.
          if (terminal && proc.cursor !== undefined) {
            opts?.onDecoderState?.(decoderSnapshot(state));
            opts?.onProgress?.(proc.cursor);
          }
          // Enrich a mapper-produced done with the session id captured so far.
          yield ev.kind === 'done' ? doneEvent(ev.ok, ev.message) : ev;
          if (sawDone || sawError) return;
        }
        // Every event of this line has been handed over: report the position after it, and the
        // decoder progress (selectionSeq / split-marker buffer) with it.
        const at = proc.cursor;
        // decoder state FIRST, then the offset (same consistent-save ordering as resume)
        opts?.onDecoderState?.({
          selectionSeq: state.selectionSeq ?? 0,
          selectionBuffer: state.selectionBuffer ?? '',
          ...(state.sessionId !== undefined ? { sessionId: state.sessionId } : {}),
          ...(state.toolCommands !== undefined ? { toolCommands: { ...state.toolCommands } } : {}),
          ...(state.editPaths !== undefined ? { editPaths: { ...state.editPaths } } : {}),
        });
        if (at !== undefined) opts?.onProgress?.(at);
      }
      if (inputFailure !== undefined) throw inputFailure;
      // stdout closed without a terminal event: the process is ending; report how.
      const { code, signal } = await proc.exit;
      terminal = true;
      if (signal !== null) {
        // Killed (e.g. via cancel()) without a terminal event from the stream.
        yield doneEvent(false);
        return;
      }
      const stderrTail = proc.stderr().slice(-2000);
      if (looksLikeAuthError(stderrTail)) {
        yield { kind: 'error', turnId, message: `${BINARY[mapper.id]} is not authenticated — run its login command, then retry` };
      } else if (code !== 0) {
        yield { kind: 'error', turnId, message: `${BINARY[mapper.id]} exited with code ${code}${stderrTail ? `: ${stderrTail.trim()}` : ''}` };
      } else if (state.requestUuid !== undefined) {
        yield { kind: 'error', turnId, message: 'Claude ended without a result for this request; update the CLI if it does not support request correlation' };
      } else {
        // Exited cleanly but emitted no terminal event — synthesize one.
        yield doneEvent(true);
      }
    } catch (err) {
      // Any I/O failure (e.g. the stdout stream erroring) surfaces as a terminal
      // error event, never a thrown/rejected generator — unless a terminal event
      // already went out. The stream is unusable, so the process is stopped.
      if (!terminal) {
        terminal = true;
        proc.kill('SIGTERM');
        yield { kind: 'error', turnId, message: failureMessage(mapper.id, err) };
      }
    } finally {
      // A correlated Claude turn waits for more input after its answer, so a reader that is
      // abandoned before the result must end the input: the CLI then finishes its in-flight work
      // (background tasks included) and exits, releasing the session's chat lock. Never earlier
      // than that; a failing seam must not skip the cleanup below.
      if (!terminal && state.requestUuid !== undefined) {
        try { proc.endInput?.(); } catch { /* the seam failed; the cleanup below still runs */ }
      }
      // A consumer that abandons a PIPE turn before any terminal event must never orphan the
      // child: stop it (kill is idempotent + safe on an already-exited process). A turn writing to
      // its session file is only detached from: the CLI goes on writing there and the turn can be
      // resumed from its cursor. After a terminal event the process is left to finish either way.
      if (!terminal && output === undefined) {
        proc.kill('SIGTERM');
        pendingByTurn.delete(turnId);
      }
    }
  }

  function stopTurnProcess(proc: SpawnedProcess): Promise<boolean> {
    return stopProcess({ pid: proc.pid, exit: proc.exit, kill: (signal) => proc.kill(signal) }, stopGraceMs);
  }

  async function cancel(turnId: string): Promise<void> {
    // Clear outstanding permission requests first so a decide() racing the teardown is a
    // guaranteed no-op.
    pendingByTurn.delete(turnId);
    const proc = live.get(turnId);
    if (proc === undefined) return; // unknown / already exited — no-op
    await stopTurnProcess(proc);
  }

  async function stopTurnVerified(turnId: string): Promise<boolean | undefined> {
    const proc = live.get(turnId);
    if (proc === undefined) return undefined; // no handle for THIS turn — the caller fails closed
    return stopTurnProcess(proc);
  }

  function decide(turnId: string, requestId: string, decision: 'approve' | 'deny'): { delivered: boolean } {
    const set = pendingByTurn.get(turnId);
    if (set === undefined || !set.has(requestId)) return { delivered: false }; // unknown / stale / already answered — no-op
    const proc = live.get(turnId);
    if (proc === undefined || typeof proc.write !== 'function' || mapper.inputIsPrompt === true) {
      // Process gone or no write seam: the decision is undeliverable — and NOT consumed, so a
      // later retry or a follow-up run can still answer this requestId. Never throw into the caller.
      log.warn(`[chat:${mapper.id}] permission decision for ${requestId} undeliverable (no live stdin)`);
      return { delivered: false };
    }
    let written = false;
    try {
      written = proc.write(mapper.formatDecision(requestId, decision), (err) => {
        if (err !== null && err !== undefined) {
          // ASYNC write failure: the CLI never got the decision. Re-register the request (the
          // entry was consumed synchronously below) so a later decide stays possible, and notify
          // the host so the recorded outcome is corrected to delivery-failed and the follow-up
          // fallback answers the request instead of leaving it approved.
          log.warn(`[chat:${mapper.id}] permission decision for ${requestId} failed asynchronously: ${err instanceof Error ? err.message : String(err)}`);
          let set2 = pendingByTurn.get(turnId);
          if (set2 === undefined) {
            set2 = new Set();
            pendingByTurn.set(turnId, set2);
          }
          set2.add(requestId);
          for (const cb of deliveryFailedCbs) {
            try {
              cb(turnId, requestId, decision);
            } catch { /* a failing listener must not break the stream loop */ }
          }
        }
      });
    } catch {
      written = false;
    }
    if (!written) {
      log.warn(`[chat:${mapper.id}] permission decision for ${requestId} undeliverable (write failed)`);
      return { delivered: false };
    }
    // Consume on write acceptance, so a duplicate/late decide is a guaranteed no-op (at most one
    // control response per requestId); an async failure re-registers + notifies (see callback).
    set.delete(requestId);
    if (set.size === 0) pendingByTurn.delete(turnId);
    return { delivered: true };
  }

  function onDeliveryFailed(cb: (turnId: string, requestId: string, decision: 'approve' | 'deny') => void): void {
    deliveryFailedCbs.add(cb);
  }

  function registerPending(turnId: string, requestId: string): void {
    let set = pendingByTurn.get(turnId);
    if (set === undefined) {
      set = new Set();
      pendingByTurn.set(turnId, set);
    }
    set.add(requestId);
  }

  async function* resume(req: ResumeRequest, opts?: ResumeOptions): AsyncIterable<TurnEvent> {
    const turnId = req.cursor.turnId;
    const sessionOutput = deps.sessionOutput;
    if (sessionOutput === undefined) {
      yield { kind: 'error', turnId, message: `${mapper.id} turn output is not kept, so it cannot be resumed` };
      return;
    }
    const isAlive = deps.isAlive ?? defaultIsAlive;
    const killGroup = deps.killGroup ?? defaultKillGroup;
    const startTime = deps.processStartTime ?? defaultProcessStartTime;
    const pid = req.pid;
    // The recorded process, and only while it is still that process (never a reused pid).
    const isTheProcess = (): boolean =>
      pid !== undefined && isAlive(pid) && (req.startedAt === null || startTime(pid) === req.startedAt);
    const exit = new Promise<{ code: number | null; signal: string | null }>((resolve) => {
      const check = (): void => {
        if (isTheProcess()) return;
        clearInterval(timer);
        resolve({ code: null, signal: null });
      };
      const timer = setInterval(check, deps.livenessPollMs ?? 200);
      timer.unref?.();
      check();
    });
    const handle: TurnProcess = {
      pid,
      exit,
      cursor: req.cursor,
      kill: (signal) => {
        if (pid !== undefined && isTheProcess()) killGroup(pid, signal);
      },
      stop: () => stopProcess({ pid, exit, kill: (signal) => handle.kill(signal) }, stopGraceMs).then(() => {}),
      stopVerified: () => stopProcess({ pid, exit, kill: (signal) => handle.kill(signal) }, stopGraceMs),
    };
    opts?.onAttach?.(handle);

    const requestUuid = mapper.id === 'claude' ? /^claude-request-([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/.exec(turnId)?.[1] : undefined;
    // E202611031bd72813:S001 t5: restore the persisted decoder state instead of starting empty, so a
    // resumed read never reuses a selection id (sel-<turn>-<seq>) or loses a split marker.
    const state: TurnState = requestUuid === undefined ? {} : { requestUuid };
    if (req.decoderState?.selectionSeq !== undefined) state.selectionSeq = req.decoderState.selectionSeq;
    if (req.decoderState?.selectionBuffer !== undefined) state.selectionBuffer = req.decoderState.selectionBuffer;
    // the native session id captured by an earlier pass (codex thread.started / claude init) survives the resume
    if (req.decoderState?.sessionId !== undefined) state.sessionId = req.decoderState.sessionId;
    // and so do the tool_use -> command/edit-path correlations, so a pass boundary between
    // tool_use and tool_result cannot drop them
    if (req.decoderState?.toolCommands !== undefined) state.toolCommands = { ...req.decoderState.toolCommands };
    if (req.decoderState?.editPaths !== undefined) state.editPaths = { ...req.decoderState.editPaths };
    const doneEvent = (ok: boolean, message?: string): TurnEvent => ({
      kind: 'done',
      turnId,
      ok,
      ...(state.sessionId !== undefined ? { sessionId: state.sessionId } : {}),
      ...(!ok && message !== undefined ? { message } : {}),
    });
    let sawTerminalInDrain = req.sawTerminal === true;
    try {
      // A caller that carries no saved decoder state (a reloaded live reader) has a saved cursor
      // that holds identity but not the result: rebuild it from the turn's prefix without replaying
      // visible events. The background observer passes its decoder state and checkpoint, so it never
      // re-reads the turn from its start on every pass (sync decision D8).
      if (requestUuid !== undefined && req.decoderState === undefined && req.sawTerminal !== true) {
        for await (const { line } of sessionOutput.tail(req.cursor, {
          finished: () => true, fromTurnStart: true, beforeOffset: req.cursor.offset, signal: opts?.signal,
        })) {
          try { mapper.mapLine(line, turnId, state); }
          catch { log.warn(`[chat:${mapper.id}] skipped unparseable prefix line`); }
          if (state.result !== undefined) break;
        }
        if (opts?.signal?.aborted === true) return;
        // The terminal line may have been checkpointed immediately before a reload.
        if (state.result !== undefined) {
          yield doneEvent(state.result.ok, state.result.message);
          return;
        }
      }
      // E202611031bd72813:S001 t5: the read ends at the segment's turn-end marker or when the writer
      // is dead — never at a soft EOF while it lives (an unterminated trailing line may still be
      // completed by the writer and must not be abandoned).
      // E202611031bd72813:S001 t5: an ABSENT pid is not 'finished' (unverifiable) — the read ends at
      // the turn-end marker or a verified-dead recorded pid only.
      const finished = (): boolean => pid !== undefined && !isTheProcess();
      for await (const { line, cursor } of sessionOutput.tail(req.cursor, { finished, signal: opts?.signal })) {
        let events: TurnEvent[];
        try {
          events = parseMarker(line) !== undefined ? [] : mapper.mapLine(line, turnId, state);
        } catch {
          log.warn(`[chat:${mapper.id}] skipped unparseable stream line`);
          continue;
        }
        for (const ev of events) {
          // A draining reader (the observer) keeps its cursor before the terminal until it has caught up, so
          // its rewind has a pre-terminal point (sync decision D8); any other follower checkpoints first.
          if ((ev.kind === 'done' || ev.kind === 'error') && opts?.drain !== true) {
            opts?.onDecoderState?.(decoderSnapshot(state));
            opts?.onProgress?.(cursor);
          }
          yield ev.kind === 'done' ? doneEvent(ev.ok, ev.message) : ev;
          // Default: end at the first terminal event. With drain (the observer), keep reading to the
          // segment's end so nothing after the terminal is abandoned.
          if (ev.kind === 'done' || ev.kind === 'error') {
            sawTerminalInDrain = true;
            if (opts?.drain !== true) return;
          }
        }
        // decoder state FIRST, then the offset: the lifecycle saves liveTurn on both, and the
        // later (offset) save must already carry this line's decoder state — no stale-buffer window.
        opts?.onDecoderState?.({
          selectionSeq: state.selectionSeq ?? 0,
          selectionBuffer: state.selectionBuffer ?? '',
          ...(state.sessionId !== undefined ? { sessionId: state.sessionId } : {}),
          ...(state.toolCommands !== undefined ? { toolCommands: { ...state.toolCommands } } : {}),
          ...(state.editPaths !== undefined ? { editPaths: { ...state.editPaths } } : {}),
        });
        opts?.onProgress?.(cursor);
      }
    } catch (err) {
      if (err instanceof SegmentGone) {
        // The file rolled over past this turn's segment: report an OBSERVATION failure (not a
        // terminal) so the caller can re-anchor into an older retained generation and replay.
        log.warn(`[chat:${mapper.id}] ${err.message}`);
        yield { kind: 'error', turnId, message: err.message, observationFailure: true };
        return;
      }
      yield { kind: 'error', turnId, message: `the output of this turn could not be read: ${err instanceof Error ? err.message : String(err)}`, observationFailure: true };
      return;
    }
    if (opts?.signal?.aborted === true) return; // stopped following; the turn goes on
    // E202611031bd72813:S001 t5: EOF without a terminal event is an OBSERVATION failure (no real
    // terminal was ingested and the pid may still be alive) — never a synthetic completion. A drain
    // that DID see a terminal ends cleanly instead (the segment's turn-end marker closed it).
    if (sawTerminalInDrain && opts?.drain === true) return;
    // E202611031bd72813:S001 t5: EOF without a terminal event — a plain terminal error ONLY when a
    // recorded pid is verified dead; alive OR ABSENT pid is an observation failure (an absent pid
    // is unverifiable, never a synthetic completion).
    const verifiedDead = pid !== undefined && !isTheProcess();
    yield { kind: 'error', turnId, message: 'the turn ended without a result', ...(verifiedDead ? {} : { observationFailure: true }) };
  }

  return { run, resume, cancel, stopTurnVerified, decide, registerPending, onDeliveryFailed, capabilities: { resume: mapper.resume } };
}

/** The decoder progress a reader reports with every checkpoint (selection ids, split marker, correlations). */
function decoderSnapshot(state: TurnState): {
  readonly selectionSeq: number;
  readonly selectionBuffer: string;
  readonly sessionId?: string | undefined;
  readonly toolCommands?: Readonly<Record<string, string>> | undefined;
  readonly editPaths?: Readonly<Record<string, string>> | undefined;
} {
  return {
    selectionSeq: state.selectionSeq ?? 0,
    selectionBuffer: state.selectionBuffer ?? '',
    ...(state.sessionId !== undefined ? { sessionId: state.sessionId } : {}),
    ...(state.toolCommands !== undefined ? { toolCommands: { ...state.toolCommands } } : {}),
    ...(state.editPaths !== undefined ? { editPaths: { ...state.editPaths } } : {}),
  };
}

function failureMessage(provider: ProviderId, reason: unknown): string {
  const raw = reason instanceof Error ? reason.message : String(reason);
  return `${provider} turn failed: ${raw}`;
}

/**
 * Build the provider registry over injected deps. `available` reflects only the
 * agentic coding CLIs actually installed (per the binary probe) — Ollama and
 * other plain-completion providers are never members (k4).
 */
export function createProviderRegistry(deps: AdapterDeps): ProviderRegistry {
  const adapters = new Map<ProviderId, StreamAdapter>();
  const available: ProviderId[] = [];
  for (const id of ['claude', 'codex', 'vibe'] as const) {
    if (deps.isInstalled(id)) {
      adapters.set(id, makeStreamAdapter(MAPPERS[id], deps));
      available.push(id);
    }
  }
  return {
    available,
    get(id: ProviderId): StreamAdapter {
      const a = adapters.get(id);
      if (a === undefined) throw new Error(`unknown-provider: ${id} is not installed/registered`);
      return a;
    },
  };
}

/**
 * LLM chat titling (option 1): a SEPARATE one-shot over the provider — no `resume`, so it never
 * pollutes the real conversation — that asks for a short title for the chat's first message. It is
 * TIMEOUT-BOUNDED and abandons the iterator (`it.return()`) on timeout/error so a slow or hung CLI
 * can NEVER stall the caller (unlike a bare `for await`). Returns the raw model text (the caller
 * sanitizes) or undefined on any failure. vscode-free; the host injects this via deps.deriveTitle.
 */
export async function deriveChatTitle(
  providers: ProviderRegistry,
  input: { readonly provider: ProviderId; readonly prompt: string; readonly cwd: string; readonly model?: string | undefined; readonly effort?: string | undefined },
  opts?: { readonly timeoutMs?: number | undefined },
): Promise<string | undefined> {
  let adapter: StreamAdapter;
  try {
    adapter = providers.get(input.provider);
  } catch {
    return undefined;
  }
  const instruction =
    `Reply with ONLY a concise 3-6 word title (no quotes, no punctuation, no preamble) ` +
    `for a developer chat that begins with this message:\n\n${input.prompt}`;
  const req: TurnRequest = { provider: input.provider, prompt: instruction, cwd: input.cwd, ...(input.model !== undefined ? { model: input.model } : {}), ...(input.effort !== undefined ? { effort: input.effort } : {}) };
  let stopped = false;
  const it = adapter.run(req, { shouldSpawn: () => !stopped })[Symbol.asyncIterator]();
  const deadline = Date.now() + (opts?.timeoutMs ?? 8000);
  let turnId: string | undefined;
  let text = '';
  // The reliable stop is adapter.cancel(turnId) — it kills the CLI child, which ends the stream
  // (asyncIterator.return() cannot break a generator stuck in a no-yield await loop while a
  // .next() is pending — the S003 lesson). A zero-output turn has no turnId yet, so it cannot be
  // force-cancelled; real claude/codex emit an init event within ms, so slow titles are bounded.
  const stop = (val: string | undefined): string | undefined => {
    stopped = true;
    if (turnId !== undefined) {
      try {
        void adapter.cancel(turnId);
      } catch {
        /* already finished */
      }
    }
    try {
      void it.return?.(undefined);
    } catch {
      /* returning an already-finished iterator is a no-op */
    }
    return val;
  };
  try {
    for (;;) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) return stop(undefined);
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<'timeout'>((r) => {
        timer = setTimeout(() => r('timeout'), remaining);
      });
      const res = await Promise.race([it.next(), timeout]);
      if (timer !== undefined) clearTimeout(timer);
      if (res === 'timeout') return stop(undefined);
      if (res.done === true) return stop(text);
      const ev = res.value;
      turnId = ev.turnId;
      if (ev.kind === 'assistant-delta') text += ev.text;
      else if (ev.kind === 'error') return stop(undefined);
    }
  } catch {
    return stop(undefined);
  }
}

/**
 * E202611031bd72813:S001 t6: whether a stdin write reached the process. `stream.write()` returns
 * false on BACKPRESSURE — the chunk is already buffered and will be flushed — so that boolean is
 * NOT a delivery failure; only a destroyed or ended stream is undelivered.
 */
export function writeReachedStdin(stream: { readonly destroyed: boolean; readonly writableEnded: boolean }, writeOk: boolean): boolean {
  void writeOk; // false = backpressure: the chunk is buffered and will flush, so still delivered
  return !stream.destroyed && !stream.writableEnded;
}

// ---- production spawner (the only child_process user) ------------------------

/**
 * The production {@link SpawnFn}: spawns the CLI with node:child_process and
 * exposes stdout as decoded newline-delimited lines. This is the sole place the
 * extension launches the chat CLI — directly, never through the daemon IPC (k1),
 * and with no HTTP/REST client (k2).
 */
export const nodeSpawner: SpawnFn = (command, args, opts) => {
  // stdin is a pipe (not 'ignore') so the review-mode permission-decision relay can
  // write a control line back to the CLI (S004 write() seam); stdout/stderr piped as before.
  // ISSUE-2284d9b4: with closeInput the CLI gets no input stream at all, so one that reads its
  // input to the end before starting (codex exec) starts at once.
  const stdin = opts.closeInput === true ? 'ignore' : 'pipe';
  // Off Windows the CLI leads its own process group (detached), so a stop reaches every
  // process it started, not just the direct child.
  const ownGroup = process.platform !== 'win32';
  // With a session output the CLI writes its stdout and stderr straight into the session's
  // files (append mode), so its output survives whatever happens to this extension host.
  const out = opts.output;
  const fds = out !== undefined ? [openSync(out.outPath, 'a'), openSync(out.errPath, 'a')] : undefined;
  let child: ReturnType<typeof nodeChildSpawn>;
  try {
    child = nodeChildSpawn(command, [...args], {
      cwd: opts.cwd,
      stdio: fds !== undefined ? [stdin, fds[0]!, fds[1]!] : [stdin, 'pipe', 'pipe'],
      detached: ownGroup,
      ...(opts.env !== undefined ? { env: opts.env } : {}),
    });
  } finally {
    // The child holds its own copies of the descriptors; ours are not needed after spawn.
    for (const fd of fds ?? []) closeSync(fd);
  }
  // write callbacks report failures to the adapter; the error event must also be handled.
  child.stdin?.on('error', () => {});
  let exited = false;
  child.on('exit', () => {
    exited = true;
  });
  let cursor = out?.cursor;
  let stderrBuf = '';
  onUtf8Data(child.stderr, (decodedChunk, chunkBytes) => {
    stderrBuf += decodedChunk;
  });

  let resolveSpawnErr!: (e: NodeJS.ErrnoException | undefined) => void;
  const spawnError = new Promise<NodeJS.ErrnoException | undefined>((r) => {
    resolveSpawnErr = r;
  });
  let resolveExit!: (v: { code: number | null; signal: string | null }) => void;
  const exit = new Promise<{ code: number | null; signal: string | null }>((r) => {
    resolveExit = r;
  });
  let spawned = false;
  child.on('spawn', () => {
    spawned = true;
    resolveSpawnErr(undefined);
  });
  child.on('error', (err: NodeJS.ErrnoException) => {
    if (!spawned) resolveSpawnErr(err);
    resolveExit({ code: null, signal: null });
  });
  child.on('close', (code, signal) => {
    exited = true;
    resolveExit({ code, signal });
  });

  async function* lines(): AsyncIterable<string> {
    if (out !== undefined) {
      // Read the turn's segment of the session file, until the process has exited and it is read.
      for await (const r of out.tail(out.cursor, () => exited)) {
        cursor = r.cursor;
        yield r.line;
      }
      return;
    }
    let buf = '';
    const stdout = child.stdout;
    if (stdout === null) return;
    stdout.setEncoding('utf8');
    for await (const chunk of stdout) {
      buf += chunk as string;
      let nl = buf.indexOf('\n');
      while (nl !== -1) {
        yield buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        nl = buf.indexOf('\n');
      }
    }
    if (buf !== '') yield buf;
  }

  return {
    lines,
    stderr: () => (out !== undefined ? out.errTail() : stderrBuf),
    exit,
    spawnError,
    get pid() {
      return child.pid;
    },
    get cursor() {
      return cursor;
    },
    kill: (signal = 'SIGTERM') => {
      const pid = child.pid;
      // The CLI leads its group (detached): signal the group; else, or once it is gone, the child.
      if (ownGroup && pid !== undefined && signalGroup(pid, signal)) return;
      child.kill(signal);
    },
    endInput: () => {
      const input = child.stdin;
      if (input !== null && !input.destroyed && !input.writableEnded) input.end();
    },
    write: (data: string, onError?: (err: unknown) => void) => {
      // E202611031bd72813:S001 t6: report whether the write reached the process. A closed/absent
      // stdin (destroyed/ended/writableEnded) returns false synchronously — never delivered —
      // and an ASYNC write failure is reported through onError (decide re-registers the request,
      // so it stays actionable). Never throws into the stream loop.
      const stdin = child.stdin;
      if (stdin === null || stdin === undefined) return false;
      if (stdin.destroyed || stdin.writableEnded || stdin.writableFinished) return false;
      try {
        // write() returns false on BACKPRESSURE: the chunk is already buffered and will be
        // flushed, so it counts as delivered — only a destroyed/closed stream is not.
        const ok = stdin.write(data, (err) => {
          if (err !== null && err !== undefined) {
            onError?.(err); // the caller (decide) re-registers the request; no logger in this seam
          }
        });
        return writeReachedStdin(stdin, ok);
      } catch {
        return false;
      }
    },
  };
};

/** Default binary probe: is the CLI resolvable on PATH? Uses a synchronous `which`/`where` check. */
export const defaultBinaryProbe: BinaryProbe = (id) => {
  const bin = BINARY[id];
  try {
    if (process.platform === 'win32') {
      execFileSync('where', [bin], { stdio: 'ignore' });
    } else {
      execFileSync('sh', ['-c', `command -v ${bin}`], { stdio: 'ignore' });
    }
    return true;
  } catch {
    return false;
  }
};
