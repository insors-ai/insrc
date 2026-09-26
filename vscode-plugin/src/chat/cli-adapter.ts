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
 *   claude: `claude -p <prompt> --output-format=stream-json --verbose`
 *           (+ `--resume <session_id>`). Emits NDJSON lines:
 *             {type:'system',subtype:'init',session_id} — session id for resume
 *             {type:'assistant',message:{content:[{type:'text'|'tool_use',...}]}}
 *             {type:'result',subtype,is_error,result}   — terminal
 *             {type:'rate_limit_event'|...}             — ignored noise
 *   codex:  `codex exec --json <prompt>` (+ `codex exec resume <id> --json`).
 *           Emits JSONL events; mapped best-effort (validated by the opt-in live test).
 */
import { spawn as nodeChildSpawn, execFileSync } from 'node:child_process';
import type { TurnEvent, UnifiedDiff } from './stream-events.js';

export type ProviderId = 'claude' | 'codex';

export interface SessionHandle {
  readonly provider: ProviderId;
  readonly nativeSessionId: string;
}

export interface TurnRequest {
  readonly provider: ProviderId;
  readonly prompt: string;
  readonly resume?: SessionHandle;
  readonly cwd: string;
}

export interface StreamAdapter {
  /** Spawn + stream one turn, yielding normalized sc2 events. Completes after a terminal done/error event. */
  run(req: TurnRequest): AsyncIterable<TurnEvent>;
  /** Abort an in-flight turn by id (idempotent; no-op for unknown/finished). */
  cancel(turnId: string): void;
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
  /** Terminate the process (SIGTERM). Idempotent. */
  kill(): void;
}

export type SpawnFn = (command: string, args: readonly string[], opts: { readonly cwd: string }) => SpawnedProcess;

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
  readonly logger?: AdapterLogger;
}

const NOOP_LOGGER: AdapterLogger = { warn: () => {}, error: () => {} };

// ---- provider mappers (private) ---------------------------------------------

/** Mutable per-turn state a mapper may thread across lines (e.g. the captured native session id). */
interface TurnState {
  sessionId?: string;
}

/** A provider mapper turns ONE native stdout line into zero or more normalized TurnEvents. */
interface ProviderMapper {
  readonly id: ProviderId;
  readonly resume: boolean;
  /** Build the argv for a turn (prompt + optional resume). */
  buildArgs(req: TurnRequest): string[];
  /** Map one native line to 0..n TurnEvents. Return [] to ignore (noise). Throw to signal an unparseable line. */
  mapLine(line: string, turnId: string, state: TurnState): TurnEvent[];
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
    const args = ['-p', req.prompt, '--output-format=stream-json', '--verbose'];
    if (req.resume) args.push('--resume', req.resume.nativeSessionId);
    return args;
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
      return [{ kind: 'status', turnId, phase: 'thinking' }];
    }
    if (type === 'assistant') {
      const message = obj['message'] as { content?: unknown } | undefined;
      const content = Array.isArray(message?.content) ? (message?.content as Array<Record<string, unknown>>) : [];
      const out: TurnEvent[] = [];
      for (const block of content) {
        const btype = block['type'];
        if (btype === 'text' && typeof block['text'] === 'string') {
          out.push({ kind: 'assistant-delta', turnId, text: block['text'] as string });
        } else if (btype === 'tool_use') {
          const toolName = typeof block['name'] === 'string' ? (block['name'] as string) : 'tool';
          const input = (block['input'] as Record<string, unknown> | undefined) ?? {};
          if (CLAUDE_EDIT_TOOLS.has(toolName) && typeof input['file_path'] === 'string') {
            out.push({ kind: 'file-edit', turnId, path: input['file_path'] as string, diff: diffFromClaudeEdit(input['file_path'] as string, input) });
          } else {
            const mcp = parseMcpTool(toolName);
            out.push(mcp ? { kind: 'tool-call', turnId, tool: toolName, mcp } : { kind: 'tool-call', turnId, tool: toolName });
          }
        }
      }
      return out;
    }
    if (type === 'result') {
      return [{ kind: 'done', turnId, ok: obj['is_error'] !== true }];
    }
    // rate_limit_event and any other envelope: ignored noise.
    return [];
  },
};

/** claude MCP tool-use names look like `mcp__<server>__<name>`. */
function parseMcpTool(tool: string): { server: string; name: string } | undefined {
  const m = /^mcp__([^_]+(?:_[^_]+)*)__(.+)$/.exec(tool);
  if (!m || m[1] === undefined || m[2] === undefined) return undefined;
  return { server: m[1], name: m[2] };
}

const codexMapper: ProviderMapper = {
  id: 'codex',
  resume: true,
  buildArgs(req: TurnRequest): string[] {
    // `codex exec --json <prompt>`; resume via the `exec resume <id>` subcommand.
    if (req.resume) return ['exec', 'resume', req.resume.nativeSessionId, '--json', req.prompt];
    return ['exec', '--json', req.prompt];
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
    // codex exec --json emits item/thread events; map the ones we normalize, ignore the rest.
    if (type.endsWith('.delta') || type === 'agent_message_delta') {
      const text = typeof obj['delta'] === 'string' ? (obj['delta'] as string) : typeof obj['text'] === 'string' ? (obj['text'] as string) : '';
      return text === '' ? [] : [{ kind: 'assistant-delta', turnId, text }];
    }
    if (type === 'item.completed' || type === 'agent_message') {
      const item = (obj['item'] as Record<string, unknown> | undefined) ?? obj;
      const itemType = item['type'];
      if (itemType === 'file_change' || itemType === 'patch') {
        const path = typeof item['path'] === 'string' ? (item['path'] as string) : '(unknown)';
        return [{ kind: 'file-edit', turnId, path, diff: { path, hunks: [] } }];
      }
      if (itemType === 'command_execution' || itemType === 'tool_call') {
        const tool = typeof item['tool'] === 'string' ? (item['tool'] as string) : typeof item['command'] === 'string' ? (item['command'] as string) : 'tool';
        return [{ kind: 'tool-call', turnId, tool }];
      }
      const text = typeof item['text'] === 'string' ? (item['text'] as string) : '';
      return text === '' ? [] : [{ kind: 'assistant-delta', turnId, text }];
    }
    if (type === 'turn.completed' || type === 'thread.completed' || type === 'result') {
      return [{ kind: 'done', turnId, ok: obj['is_error'] !== true && obj['error'] === undefined }];
    }
    if (type === 'error' || type === 'turn.failed') {
      const message = typeof obj['message'] === 'string' ? (obj['message'] as string) : 'codex turn failed';
      return [{ kind: 'error', turnId, message }];
    }
    return [];
  },
};

const MAPPERS: Record<ProviderId, ProviderMapper> = { claude: claudeMapper, codex: codexMapper };

/** Heuristic: does a native line/stderr indicate an auth failure the user must fix by re-logging-in? */
function looksLikeAuthError(text: string): boolean {
  return /\b(unauthorized|not (logged in|authenticated)|authentication (failed|required)|please (run )?login|401)\b/i.test(text);
}

// ---- adapter ----------------------------------------------------------------

const BINARY: Record<ProviderId, string> = { claude: 'claude', codex: 'codex' };

function makeStreamAdapter(mapper: ProviderMapper, deps: AdapterDeps): StreamAdapter {
  const log = deps.logger ?? NOOP_LOGGER;
  const live = new Map<string, SpawnedProcess>();
  let turnSeq = 0;

  async function* run(req: TurnRequest): AsyncIterable<TurnEvent> {
    const turnId = `${mapper.id}-${Date.now()}-${turnSeq++}`;
    // Honor the capability: if this provider can't resume, drop the handle and
    // start a fresh session rather than passing an unsupported flag (never throw).
    let effectiveReq = req;
    if (!mapper.resume && req.resume !== undefined) {
      const { resume: _drop, ...rest } = req;
      effectiveReq = rest;
    }
    let proc: SpawnedProcess;
    try {
      proc = deps.spawn(BINARY[mapper.id], mapper.buildArgs(effectiveReq), { cwd: effectiveReq.cwd });
    } catch (err) {
      yield { kind: 'error', turnId, message: failureMessage(mapper.id, err) };
      return;
    }
    live.set(turnId, proc);
    const state: TurnState = {};
    let sawError = false;
    let sawDone = false;
    // Stamp the captured native session id onto a terminal `done` so the caller
    // (S005) can persist the resume handle; a dead capture would strand resume.
    const doneEvent = (ok: boolean): TurnEvent =>
      state.sessionId !== undefined ? { kind: 'done', turnId, ok, sessionId: state.sessionId } : { kind: 'done', turnId, ok };
    try {
      const spawnErr = await proc.spawnError;
      if (spawnErr !== undefined) {
        yield { kind: 'error', turnId, message: spawnErr.code === 'ENOENT' ? `${BINARY[mapper.id]} CLI not found — install it or check your PATH` : failureMessage(mapper.id, spawnErr) };
        return;
      }
      for await (const line of proc.lines()) {
        if (sawDone || sawError) break; // ignore anything after ANY terminal event
        let events: TurnEvent[];
        try {
          events = mapper.mapLine(line, turnId, state);
        } catch {
          log.warn(`[chat:${mapper.id}] skipped unparseable stream line`);
          continue; // non-fatal: skip malformed line, never yield a malformed event
        }
        for (const ev of events) {
          // Enrich a mapper-produced done with the session id captured so far.
          yield ev.kind === 'done' ? doneEvent(ev.ok) : ev;
          if (ev.kind === 'done') sawDone = true;
          if (ev.kind === 'error') sawError = true;
          if (sawDone || sawError) break;
        }
      }
      const { code, signal } = await proc.exit;
      if (sawDone || sawError) return;
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
      } else {
        // Exited cleanly but emitted no terminal event — synthesize one.
        yield doneEvent(true);
      }
    } catch (err) {
      // Any I/O failure (e.g. the stdout stream erroring) surfaces as a terminal
      // error event, never a thrown/rejected generator — unless a terminal event
      // already went out.
      if (!sawDone && !sawError) {
        yield { kind: 'error', turnId, message: failureMessage(mapper.id, err) };
      }
    } finally {
      // Kill on the way out so an early-break/abandoned consumer never orphans the
      // child (kill is idempotent + safe on an already-exited process).
      proc.kill();
      live.delete(turnId);
    }
  }

  function cancel(turnId: string): void {
    const proc = live.get(turnId);
    if (proc === undefined) return; // unknown / already finished — no-op
    proc.kill();
  }

  return { run, cancel, capabilities: { resume: mapper.resume } };
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
  for (const id of ['claude', 'codex'] as const) {
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
  input: { readonly provider: ProviderId; readonly prompt: string; readonly cwd: string },
  opts?: { readonly timeoutMs?: number },
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
  const req: TurnRequest = { provider: input.provider, prompt: instruction, cwd: input.cwd };
  const it = adapter.run(req)[Symbol.asyncIterator]();
  const deadline = Date.now() + (opts?.timeoutMs ?? 8000);
  let turnId: string | undefined;
  let text = '';
  // The reliable stop is adapter.cancel(turnId) — it kills the CLI child, which ends the stream
  // (asyncIterator.return() cannot break a generator stuck in a no-yield await loop while a
  // .next() is pending — the S003 lesson). A zero-output turn has no turnId yet, so it cannot be
  // force-cancelled; real claude/codex emit an init event within ms, so slow titles are bounded.
  const stop = (val: string | undefined): string | undefined => {
    if (turnId !== undefined) {
      try {
        adapter.cancel(turnId);
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

// ---- production spawner (the only child_process user) ------------------------

/**
 * The production {@link SpawnFn}: spawns the CLI with node:child_process and
 * exposes stdout as decoded newline-delimited lines. This is the sole place the
 * extension launches the chat CLI — directly, never through the daemon IPC (k1),
 * and with no HTTP/REST client (k2).
 */
export const nodeSpawner: SpawnFn = (command, args, opts) => {
  const child = nodeChildSpawn(command, [...args], { cwd: opts.cwd, stdio: ['ignore', 'pipe', 'pipe'] });
  let stderrBuf = '';
  child.stderr?.on('data', (d: Buffer) => {
    stderrBuf += d.toString('utf8');
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
    resolveExit({ code, signal });
  });

  async function* lines(): AsyncIterable<string> {
    let buf = '';
    const stdout = child.stdout;
    if (stdout === null) return;
    for await (const chunk of stdout) {
      buf += (chunk as Buffer).toString('utf8');
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
    stderr: () => stderrBuf,
    exit,
    spawnError,
    kill: () => {
      child.kill('SIGTERM');
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
