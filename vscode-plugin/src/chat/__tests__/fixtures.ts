/**
 * Story E20260925edb76e2e:S002 — native CLI stream fixtures + a fake spawner.
 *
 * The NDJSON lines below are trimmed captures from the S002 spike (claude
 * 2.1.278 `--output-format=stream-json --verbose`; codex-cli 0.154.0
 * `exec --json`). The fake spawner lets the adapter's mappers + lifecycle be
 * unit-tested with zero real subprocess.
 */
import type { SpawnFn, SpawnedProcess } from '../cli-adapter.js';

/** A scripted process outcome: the stdout lines it emits, its exit, optional stderr, optional spawn error. */
export interface FakeProcScript {
  readonly lines: readonly string[];
  readonly exit?: { code: number | null; signal: string | null };
  readonly stderr?: string;
  readonly spawnErrorCode?: string;
  /** If set, lines() blocks after emitting `lines` until kill() is called (models an in-flight, cancellable turn). */
  readonly hangUntilKilled?: boolean;
  /** If set, lines() throws (models the stdout Readable erroring mid-stream) after emitting this many lines. */
  readonly throwAfter?: number;
}

/** Observable handle over a spawned fake process (for asserting kill / cleanup). */
export interface FakeProcHandle {
  wasKilled(): boolean;
}

export interface FakeSpawnCall {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
}

export interface FakeSpawner {
  readonly spawn: SpawnFn;
  readonly calls: FakeSpawnCall[];
  /** Handles for every process spawned so far, in spawn order. */
  readonly procs: FakeProcHandle[];
}

/** Build a fake {@link SpawnFn} that plays one script per invocation (or the same script every time). */
export function makeFakeSpawner(script: FakeProcScript | FakeProcScript[]): FakeSpawner {
  const scripts = Array.isArray(script) ? script : null;
  const single = Array.isArray(script) ? null : script;
  const calls: FakeSpawnCall[] = [];
  const procs: FakeProcHandle[] = [];
  let idx = 0;

  const spawn: SpawnFn = (command, args, opts) => {
    calls.push({ command, args: [...args], cwd: opts.cwd });
    const s = single ?? scripts![Math.min(idx++, scripts!.length - 1)]!;
    const { proc, handle } = makeFakeProc(s);
    procs.push(handle);
    return proc;
  };
  return { spawn, calls, procs };
}

function makeFakeProc(s: FakeProcScript): { proc: SpawnedProcess; handle: FakeProcHandle } {
  let killed = false;
  // Created eagerly so kill() can always resolve it, with no race against the
  // generator reaching the hang `await` (that race deadlocked the cancel test).
  let releaseHang!: () => void;
  const hang = new Promise<void>((resolve) => {
    releaseHang = resolve;
  });
  const stderr = s.stderr ?? '';

  const spawnError = Promise.resolve<NodeJS.ErrnoException | undefined>(
    s.spawnErrorCode !== undefined ? Object.assign(new Error(s.spawnErrorCode), { code: s.spawnErrorCode }) : undefined,
  );

  let resolveExit!: (v: { code: number | null; signal: string | null }) => void;
  const exit = new Promise<{ code: number | null; signal: string | null }>((r) => {
    resolveExit = r;
  });
  if (!s.hangUntilKilled) resolveExit(s.exit ?? { code: 0, signal: null });

  async function* lines(): AsyncIterable<string> {
    if (s.spawnErrorCode !== undefined) return;
    let emitted = 0;
    for (const line of s.lines) {
      if (killed) return;
      if (s.throwAfter !== undefined && emitted >= s.throwAfter) {
        throw Object.assign(new Error('EPIPE: stdout stream error'), { code: 'EPIPE' });
      }
      yield line;
      emitted++;
    }
    if (s.throwAfter !== undefined && emitted >= s.throwAfter) {
      throw Object.assign(new Error('EPIPE: stdout stream error'), { code: 'EPIPE' });
    }
    if (s.hangUntilKilled && !killed) {
      await hang;
    }
  }

  const proc: SpawnedProcess = {
    lines,
    stderr: () => stderr,
    exit,
    spawnError,
    kill: () => {
      killed = true;
      releaseHang();
      resolveExit({ code: null, signal: 'SIGTERM' });
    },
  };
  return { proc, handle: { wasKilled: () => killed } };
}

// ---- claude fixtures --------------------------------------------------------

export const CLAUDE_TEXT_TURN: readonly string[] = [
  JSON.stringify({ type: 'system', subtype: 'init', session_id: 'sess-claude-1', tools: [] }),
  JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'Hello ' }] }, session_id: 'sess-claude-1' }),
  JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'world' }] }, session_id: 'sess-claude-1' }),
  JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: 'Hello world', session_id: 'sess-claude-1' }),
];

export const CLAUDE_TOOL_TURN: readonly string[] = [
  JSON.stringify({ type: 'system', subtype: 'init', session_id: 'sess-claude-2' }),
  JSON.stringify({
    type: 'assistant',
    message: { content: [{ type: 'tool_use', name: 'mcp__insrc__insrc_analyze_step', input: { focus: 'x' } }] },
    session_id: 'sess-claude-2',
  }),
  JSON.stringify({
    type: 'assistant',
    message: { content: [{ type: 'tool_use', name: 'Edit', input: { file_path: '/repo/a.ts', old_string: 'a', new_string: 'b\nc' } }] },
    session_id: 'sess-claude-2',
  }),
  JSON.stringify({ type: 'result', subtype: 'success', is_error: false, session_id: 'sess-claude-2' }),
];

export const CLAUDE_ERROR_TURN: readonly string[] = [
  JSON.stringify({ type: 'system', subtype: 'init', session_id: 'sess-claude-3' }),
  JSON.stringify({ type: 'result', subtype: 'error_max_turns', is_error: true, session_id: 'sess-claude-3' }),
];

// ---- codex fixtures ---------------------------------------------------------

export const CODEX_TEXT_TURN: readonly string[] = [
  JSON.stringify({ type: 'thread.started', thread_id: 'thread-codex-1' }),
  JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'Done reasoning.' } }),
  JSON.stringify({ type: 'turn.completed' }),
];
