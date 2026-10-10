/**
 * Story E20260925edb76e2e:S002 / t4 — cli-adapter unit suite (fake spawner).
 *
 * Exercises the sc5 StreamAdapter + ProviderRegistry contract against scripted
 * native streams: per-provider native->TurnEvent mapping, terminal-event
 * semantics, the five LLD error paths, cancel(), capabilities.resume, and the
 * registry membership rule (only installed agentic CLIs; never Ollama).
 *
 * Run: npx tsx --test vscode-plugin/src/chat/__tests__/cli-adapter.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createProviderRegistry, classifyPermissionDenial, deriveChatTitle, nodeSpawner } from '../cli-adapter.js';
import type { AdapterDeps, ProviderId, ProviderRegistry, StreamAdapter, TurnProcess, TurnRequest, SessionHandle, SpawnedProcess, SpawnFn } from '../cli-adapter.js';
import type { TurnEvent } from '../stream-events.js';
import {
  makeFakeSpawner,
  tick,
  CLAUDE_TEXT_TURN,
  CLAUDE_TOOL_TURN,
  CLAUDE_ERROR_TURN,
  CODEX_TEXT_TURN,
  CLAUDE_PERMISSION_TURN,
  CLAUDE_PERMISSION_IDLESS,
  CODEX_PERMISSION_TURN,
  type FakeProcScript,
} from './fixtures.js';

const REQ = (over: Partial<TurnRequest> & { provider: ProviderId }): TurnRequest => ({
  prompt: 'hi',
  cwd: '/repo',
  ...over,
});

function depsFor(script: FakeProcScript | FakeProcScript[], installed: ProviderId[] = ['claude', 'codex']) {
  const spawner = makeFakeSpawner(script);
  const warns: string[] = [];
  const deps: AdapterDeps = {
    spawn: spawner.spawn,
    isInstalled: (id) => installed.includes(id),
    logger: { warn: (m) => warns.push(m), error: () => {} },
  };
  return { deps, spawner, warns };
}

async function collect(stream: AsyncIterable<TurnEvent>): Promise<TurnEvent[]> {
  const out: TurnEvent[] = [];
  for await (const ev of stream) out.push(ev);
  return out;
}

test('claude: text turn maps to status + assistant-delta(s) + done(ok)', async () => {
  const { deps } = depsFor({ lines: CLAUDE_TEXT_TURN });
  const reg = createProviderRegistry(deps);
  const events = await collect(reg.get('claude').run(REQ({ provider: 'claude' })));

  assert.deepEqual(events.map((e) => e.kind), ['status', 'assistant-delta', 'assistant-delta', 'done']);
  const deltas = events.filter((e) => e.kind === 'assistant-delta').map((e) => (e as { text: string }).text);
  assert.deepEqual(deltas, ['Hello ', 'world']);
  assert.equal((events.at(-1) as { ok: boolean }).ok, true);
});

test('claude: tool_use maps to tool-call (with mcp parse) and file-edit with a hunk diff', async () => {
  const { deps } = depsFor({ lines: CLAUDE_TOOL_TURN });
  const reg = createProviderRegistry(deps);
  const events = await collect(reg.get('claude').run(REQ({ provider: 'claude' })));

  const tool = events.find((e) => e.kind === 'tool-call') as
    | { tool: string; mcp?: { server: string; name: string } }
    | undefined;
  assert.ok(tool, 'a tool-call event was emitted');
  assert.equal(tool!.tool, 'mcp__insrc__insrc_analyze_step');
  assert.deepEqual(tool!.mcp, { server: 'insrc', name: 'insrc_analyze_step' });

  const edit = events.find((e) => e.kind === 'file-edit') as { path: string; diff: { hunks: unknown[] } } | undefined;
  assert.ok(edit, 'a file-edit event was emitted');
  assert.equal(edit!.path, '/repo/a.ts');
  assert.equal(edit!.diff.hunks.length, 1);
});

test('claude: is_error result maps to done(ok:false)', async () => {
  const { deps } = depsFor({ lines: CLAUDE_ERROR_TURN });
  const reg = createProviderRegistry(deps);
  const events = await collect(reg.get('claude').run(REQ({ provider: 'claude' })));
  const done = events.at(-1) as { kind: string; ok: boolean };
  assert.equal(done.kind, 'done');
  assert.equal(done.ok, false);
});

test('nothing is yielded after the terminal event, even if the stream continues', async () => {
  const trailing = [...CLAUDE_TEXT_TURN, JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'LATE' }] } })];
  const { deps } = depsFor({ lines: trailing });
  const reg = createProviderRegistry(deps);
  const events = await collect(reg.get('claude').run(REQ({ provider: 'claude' })));
  assert.equal(events.filter((e) => e.kind === 'done').length, 1, 'exactly one terminal event');
  assert.equal(events.at(-1)!.kind, 'done', 'done is last');
  assert.ok(!events.some((e) => e.kind === 'assistant-delta' && (e as { text: string }).text === 'LATE'), 'no post-terminal event');
});

test('codex: item.completed + turn.completed maps to assistant-delta + done(ok)', async () => {
  const { deps } = depsFor({ lines: CODEX_TEXT_TURN });
  const reg = createProviderRegistry(deps);
  const events = await collect(reg.get('codex').run(REQ({ provider: 'codex' })));
  assert.ok(events.some((e) => e.kind === 'assistant-delta' && (e as { text: string }).text === 'Done reasoning.'));
  assert.equal(events.at(-1)!.kind, 'done');
  assert.equal((events.at(-1) as { ok: boolean }).ok, true);
});

test('an in-stream error is terminal: nothing (incl. a second done) is yielded after it', async () => {
  // Regression for HIGH-1: a codex error mid-stream followed by more lines.
  const lines = [
    JSON.stringify({ type: 'thread.started', thread_id: 't' }),
    JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'partial' } }),
    JSON.stringify({ type: 'error', message: 'provider blew up' }),
    JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'LATE' } }),
    JSON.stringify({ type: 'turn.completed' }),
  ];
  const { deps } = depsFor({ lines });
  const reg = createProviderRegistry(deps);
  const events = await collect(reg.get('codex').run(REQ({ provider: 'codex' })));
  const terminals = events.filter((e) => e.kind === 'done' || e.kind === 'error');
  assert.equal(terminals.length, 1, 'exactly one terminal event');
  assert.equal(events.at(-1)!.kind, 'error', 'error is last');
  assert.ok(!events.some((e) => e.kind === 'assistant-delta' && (e as { text: string }).text === 'LATE'), 'no post-terminal event');
});

test('a stdout stream error surfaces as a terminal error event (never throws/rejects)', async () => {
  // Regression for HIGH-2.
  const { deps } = depsFor({ lines: [JSON.stringify({ type: 'system', subtype: 'init', session_id: 's' })], throwAfter: 1 });
  const reg = createProviderRegistry(deps);
  let events: TurnEvent[] = [];
  await assert.doesNotReject(async () => {
    events = await collect(reg.get('claude').run(REQ({ provider: 'claude' })));
  });
  assert.equal(events.at(-1)!.kind, 'error', 'a terminal error is yielded');
  assert.match((events.at(-1) as { message: string }).message, /EPIPE/);
});

test('abandoning the stream early kills the subprocess (no orphan)', async () => {
  // Regression for HIGH-3: consumer breaks out of the for-await after the first event.
  const { deps, spawner } = depsFor({ lines: [JSON.stringify({ type: 'system', subtype: 'init', session_id: 's' })], hangUntilKilled: true });
  const reg = createProviderRegistry(deps);
  for await (const ev of reg.get('claude').run(REQ({ provider: 'claude' }))) {
    if (ev.kind === 'status') break;
  }
  assert.equal(spawner.procs.length, 1);
  assert.ok(spawner.procs[0]!.wasKilled(), 'the abandoned subprocess was killed on generator return');
});

test('the terminal done carries the captured native session id (resume handle for S005)', async () => {
  // Regression for MED-4: the session-id capture must reach the caller.
  const { deps } = depsFor({ lines: CLAUDE_TEXT_TURN });
  const reg = createProviderRegistry(deps);
  const events = await collect(reg.get('claude').run(REQ({ provider: 'claude' })));
  const done = events.at(-1) as { kind: string; sessionId?: string };
  assert.equal(done.kind, 'done');
  assert.equal(done.sessionId, 'sess-claude-1');
});

// ---- the five LLD error paths ----------------------------------------------

test('error path 1: spawn throws synchronously -> terminal error event (never rejects)', async () => {
  const warns: string[] = [];
  const deps: AdapterDeps = {
    spawn: () => {
      throw new Error('EACCES');
    },
    isInstalled: () => true,
    logger: { warn: (m) => warns.push(m), error: () => {} },
  };
  const reg = createProviderRegistry(deps);
  const events = await collect(reg.get('claude').run(REQ({ provider: 'claude' })));
  assert.equal(events.length, 1);
  assert.equal(events[0]!.kind, 'error');
  assert.match((events[0] as { message: string }).message, /EACCES/);
});

test('error path 2: ENOENT spawn error -> terminal error naming the missing CLI', async () => {
  const { deps } = depsFor({ lines: [], spawnErrorCode: 'ENOENT' });
  const reg = createProviderRegistry(deps);
  const events = await collect(reg.get('codex').run(REQ({ provider: 'codex' })));
  assert.equal(events.at(-1)!.kind, 'error');
  assert.match((events.at(-1) as { message: string }).message, /codex CLI not found/);
});

test('error path 3: non-zero exit with no terminal event -> error carrying the stderr tail', async () => {
  const { deps } = depsFor({ lines: [], exit: { code: 2, signal: null }, stderr: 'boom: bad flag' });
  const reg = createProviderRegistry(deps);
  const events = await collect(reg.get('claude').run(REQ({ provider: 'claude' })));
  assert.equal(events.at(-1)!.kind, 'error');
  assert.match((events.at(-1) as { message: string }).message, /exited with code 2.*boom: bad flag/s);
});

test('error path 4: an auth-failure stderr -> a re-login error message', async () => {
  const { deps } = depsFor({ lines: [], exit: { code: 1, signal: null }, stderr: 'Error: Unauthorized (401)' });
  const reg = createProviderRegistry(deps);
  const events = await collect(reg.get('claude').run(REQ({ provider: 'claude' })));
  assert.equal(events.at(-1)!.kind, 'error');
  assert.match((events.at(-1) as { message: string }).message, /not authenticated/);
});

test('error path 5: an unparseable stream line is skipped+warned, not fatal', async () => {
  const lines = [
    JSON.stringify({ type: 'system', subtype: 'init', session_id: 's' }),
    'this is not json {',
    JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'ok' }] } }),
    JSON.stringify({ type: 'result', is_error: false }),
  ];
  const { deps, warns } = depsFor({ lines });
  const reg = createProviderRegistry(deps);
  const events = await collect(reg.get('claude').run(REQ({ provider: 'claude' })));
  assert.ok(events.some((e) => e.kind === 'assistant-delta' && (e as { text: string }).text === 'ok'), 'valid lines still map');
  assert.equal(events.at(-1)!.kind, 'done');
  assert.equal(warns.length, 1, 'the malformed line was warned once');
});

// ---- cancel ----------------------------------------------------------------

test('cancel(): kills the in-flight subprocess and yields a terminal done(ok:false)', async () => {
  const { deps } = depsFor({ lines: [JSON.stringify({ type: 'system', subtype: 'init', session_id: 's' })], hangUntilKilled: true });
  const reg = createProviderRegistry(deps);
  const adapter = reg.get('claude');
  const events: TurnEvent[] = [];
  const stream = adapter.run(REQ({ provider: 'claude' }));
  const pump = (async () => {
    for await (const ev of stream) {
      events.push(ev);
      // Cancel as soon as the turn is live (after the first status event).
      if (ev.kind === 'status') {
        // turnId is embedded in the event; cancel by it.
        adapter.cancel((ev as { turnId: string }).turnId);
      }
    }
  })();
  await pump;
  assert.equal(events.at(-1)!.kind, 'done');
  assert.equal((events.at(-1) as { ok: boolean }).ok, false, 'killed turn resolves not-ok');
});

// ---- S001 (E20261010d6a4bc79): the process outlives its stream ---------------


/** Settles with the stream's events, or rejects if it has not completed within `ms`. */
function collectWithin(stream: AsyncIterable<TurnEvent>, ms: number): Promise<TurnEvent[]> {
  return Promise.race([
    collect(stream),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`run() did not complete within ${ms} ms`)), ms)),
  ]);
}

test('run() ends at the first done event without killing the process, and onSpawn hands over pid, exit and stop', async () => {
  // A CLI that answers, then keeps running with stdout open (a pending background task).
  const { deps, spawner } = depsFor({ lines: CLAUDE_TEXT_TURN, hangUntilKilled: true, pid: 4242 });
  const adapter = createProviderRegistry(deps).get('claude');
  let handed: TurnProcess | undefined;
  const events = await collectWithin(adapter.run(REQ({ provider: 'claude' }), { onSpawn: (p) => (handed = p) }), 1000);

  assert.equal(events.at(-1)!.kind, 'done', 'the stream completed at done');
  assert.deepEqual(events.map((e) => e.kind), ['status', 'assistant-delta', 'assistant-delta', 'done'], 'the same events as before');
  const proc = spawner.procs[0]!;
  assert.deepEqual(proc.signals(), [], 'no kill after done');
  assert.equal(proc.exited(), false, 'the process is still running');

  assert.ok(handed, 'onSpawn was called');
  assert.equal(handed!.pid, 4242);
  assert.equal(typeof handed!.stop, 'function');
  let exitSettled = false;
  void handed!.exit.then(() => (exitSettled = true));
  await tick();
  assert.equal(exitSettled, false, 'exit is the live process exit');
  await handed!.stop();
  assert.deepEqual(proc.signals(), ['SIGTERM'], 'stop() signals the process');
  assert.equal(exitSettled, true, 'stop() resolves after the exit');
});

test('cancel() stops the process group and resolves only after the exit; the real spawner starts the CLI detached in its own group', async (t) => {
  // Fake: SIGTERM is ignored, so cancel() escalates to SIGKILL after the grace.
  const spawner = makeFakeSpawner({ lines: [JSON.stringify({ type: 'system', subtype: 'init', session_id: 's' })], hangUntilKilled: true, ignoreSigterm: true });
  const adapter = createProviderRegistry({ spawn: spawner.spawn, isInstalled: () => true, stopGraceMs: 30 }).get('claude');
  const it = adapter.run(REQ({ provider: 'claude' }))[Symbol.asyncIterator]();
  const first = await it.next();
  const turnId = (first.value as TurnEvent).turnId;
  let resolved = false;
  const cancelling = adapter.cancel(turnId).then(() => (resolved = true));
  await tick(10);
  assert.deepEqual(spawner.procs[0]!.signals(), ['SIGTERM'], 'SIGTERM first');
  assert.equal(resolved, false, 'cancel() waits while the process is alive');
  await cancelling;
  assert.deepEqual(spawner.procs[0]!.signals(), ['SIGTERM', 'SIGKILL'], 'SIGKILL after the grace');
  assert.equal(spawner.procs[0]!.exited(), true, 'resolved after the exit');
  await it.return?.(undefined);

  // Real spawner: the CLI leads its own process group, and kill() reaches the whole group.
  if (process.platform === 'win32') return t.diagnostic('process groups are POSIX-only');
  const proc = nodeSpawner('sh', ['-c', 'sleep 30 & wait'], { cwd: process.cwd() });
  assert.equal(await proc.spawnError, undefined);
  const pid = proc.pid!;
  assert.ok(typeof pid === 'number', 'exposes the pid');
  const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
  const pgrp = Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[2]);
  assert.equal(pgrp, pid, 'detached: the CLI is its own process group leader');
  proc.kill('SIGTERM');
  const result = await proc.exit;
  assert.equal(result.signal, 'SIGTERM');
  const groupAlive = (): boolean => {
    try {
      process.kill(-pid, 0);
      return true;
    } catch {
      return false;
    }
  };
  for (let i = 0; i < 100 && groupAlive(); i++) await tick(10);
  assert.equal(groupAlive(), false, 'the background child in the group was stopped too');
});

test('after run() returns at done, decide() still reaches the live process, and the live entry is dropped only when the exit settles', async () => {
  // The permission turn ends with a result (done) while the process stays alive.
  const { deps, spawner } = depsFor({ lines: CLAUDE_PERMISSION_TURN, hangUntilKilled: true });
  const adapter = createProviderRegistry(deps).get('claude');
  const events = await collectWithin(adapter.run(REQ({ provider: 'claude', permissionMode: 'manual' })), 1000);
  const appr = events.find((e) => e.kind === 'approval-request') as Extract<TurnEvent, { kind: 'approval-request' }> | undefined;
  assert.ok(appr, 'surfaced an approval-request');
  assert.equal(events.at(-1)!.kind, 'done');
  adapter.decide(appr!.turnId, appr!.requestId, 'approve');
  assert.equal(spawner.procs[0]!.writes().length, 1, 'the decision reached the live process after run() returned');

  // Same again, but the process exits before the decision: the entry is gone.
  const { deps: deps2, spawner: spawner2 } = depsFor({ lines: CLAUDE_PERMISSION_TURN, hangUntilKilled: true });
  const adapter2 = createProviderRegistry(deps2).get('claude');
  const events2 = await collectWithin(adapter2.run(REQ({ provider: 'claude', permissionMode: 'manual' })), 1000);
  const appr2 = events2.find((e) => e.kind === 'approval-request') as Extract<TurnEvent, { kind: 'approval-request' }>;
  spawner2.procs[0]!.exitNow();
  await tick();
  adapter2.decide(appr2.turnId, appr2.requestId, 'approve');
  assert.equal(spawner2.procs[0]!.writes().length, 0, 'no write once the process has exited');
  await adapter2.cancel(appr2.turnId);
  assert.deepEqual(spawner2.procs[0]!.signals(), [], 'cancel() after the exit finds no live entry and signals nothing');
});

test('cancel(): unknown/finished turnId is a no-op (idempotent, no throw)', async () => {
  const { deps } = depsFor({ lines: CLAUDE_TEXT_TURN });
  const reg = createProviderRegistry(deps);
  const adapter = reg.get('claude');
  await collect(adapter.run(REQ({ provider: 'claude' })));
  assert.doesNotThrow(() => adapter.cancel('no-such-turn'));
  assert.doesNotThrow(() => adapter.cancel('no-such-turn'));
});

// ---- capabilities.resume ----------------------------------------------------

test('capabilities.resume is true for both providers; a resume request passes the native flag', async () => {
  const { deps, spawner } = depsFor({ lines: CLAUDE_TEXT_TURN });
  const reg = createProviderRegistry(deps);
  assert.equal(reg.get('claude').capabilities.resume, true);
  assert.equal(reg.get('codex').capabilities.resume, true);

  const handle: SessionHandle = { provider: 'claude', nativeSessionId: 'sess-claude-1' };
  await collect(reg.get('claude').run(REQ({ provider: 'claude', resume: handle })));
  const args = spawner.calls[0]!.args;
  assert.ok(args.includes('--resume') && args.includes('sess-claude-1'), 'claude resume passes --resume <id>');
});

// ---- ProviderRegistry -------------------------------------------------------

test('ProviderRegistry.available lists only installed agentic CLIs (never Ollama)', () => {
  const { deps } = depsFor({ lines: [] }, ['claude']);
  const reg = createProviderRegistry(deps);
  assert.deepEqual([...reg.available], ['claude']);
  assert.ok(!(reg.available as string[]).includes('ollama'), 'ollama is never a member (k4)');
});

test('ProviderRegistry.get() on an absent provider throws unknown-provider', () => {
  const { deps } = depsFor({ lines: [] }, ['claude']);
  const reg = createProviderRegistry(deps);
  assert.throws(() => reg.get('codex'), /unknown-provider/);
});

// ---- S001 t3: ToolCallEvent.command population (sc2 additive) -------------------

const toolCall = (events: TurnEvent[]): { tool: string; command?: string; mcp?: unknown } | undefined =>
  events.find((e) => e.kind === 'tool-call') as { tool: string; command?: string; mcp?: unknown } | undefined;

test('claude: a Bash tool_use sets ToolCallEvent.command from input.command', async () => {
  const lines = [
    JSON.stringify({ type: 'system', subtype: 'init', session_id: 's' }),
    JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: 'ls -la' } }] } }),
    JSON.stringify({ type: 'result' }),
  ];
  const { deps } = depsFor({ lines });
  const reg = createProviderRegistry(deps);
  const tc = toolCall(await collect(reg.get('claude').run(REQ({ provider: 'claude' }))));
  assert.ok(tc, 'a tool-call was emitted');
  assert.equal(tc!.tool, 'Bash');
  assert.equal(tc!.command, 'ls -la', 'the real command is surfaced');
});

test('claude: a command-less tool_use omits command (renders as the tool name, k2)', async () => {
  const lines = [
    JSON.stringify({ type: 'system', subtype: 'init', session_id: 's' }),
    JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Read', input: { file_path: '/repo/x.ts' } }] } }),
    JSON.stringify({ type: 'result' }),
  ];
  const { deps } = depsFor({ lines });
  const reg = createProviderRegistry(deps);
  const tc = toolCall(await collect(reg.get('claude').run(REQ({ provider: 'claude' }))));
  assert.ok(tc, 'a tool-call was emitted');
  assert.equal(tc!.tool, 'Read');
  assert.equal(tc!.command, undefined, 'command is omitted for a command-less tool');
});

test('codex: a command_execution item sets command from item.command', async () => {
  const lines = [
    JSON.stringify({ type: 'thread.started', thread_id: 't' }),
    JSON.stringify({ type: 'item.completed', item: { type: 'command_execution', command: 'grep -rn foo src' } }),
    JSON.stringify({ type: 'turn.completed' }),
  ];
  const { deps } = depsFor({ lines });
  const reg = createProviderRegistry(deps);
  const tc = toolCall(await collect(reg.get('codex').run(REQ({ provider: 'codex' }))));
  assert.ok(tc, 'a tool-call was emitted');
  assert.equal(tc!.command, 'grep -rn foo src', 'the codex command is surfaced');
  assert.equal(tc!.tool, 'grep -rn foo src', 'tool keeps its existing command-as-label fallback');
});

test('codex: a tool_call item without a command omits command (k2)', async () => {
  const lines = [
    JSON.stringify({ type: 'thread.started', thread_id: 't' }),
    JSON.stringify({ type: 'item.completed', item: { type: 'tool_call', tool: 'search' } }),
    JSON.stringify({ type: 'turn.completed' }),
  ];
  const { deps } = depsFor({ lines });
  const reg = createProviderRegistry(deps);
  const tc = toolCall(await collect(reg.get('codex').run(REQ({ provider: 'codex' }))));
  assert.ok(tc, 'a tool-call was emitted');
  assert.equal(tc!.tool, 'search');
  assert.equal(tc!.command, undefined, 'command is omitted for a command-less item');
});

// ---- S001 (ux polish): ToolResultEvent emission --------------------------------

const toolResult = (events: TurnEvent[]): { output: string; command?: string; exitCode?: number } | undefined =>
  events.find((e) => e.kind === 'tool-result') as { output: string; command?: string; exitCode?: number } | undefined;

test('claude: a tool_result user message emits a tool-result with the command correlated from the preceding tool_use', async () => {
  const lines = [
    JSON.stringify({ type: 'system', subtype: 'init', session_id: 's' }),
    JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'tu-1', name: 'Bash', input: { command: 'npm test' } }] } }),
    JSON.stringify({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'tu-1', content: 'ok\n42 passing' }] } }),
    JSON.stringify({ type: 'result' }),
  ];
  const { deps } = depsFor({ lines });
  const reg = createProviderRegistry(deps);
  const tr = toolResult(await collect(reg.get('claude').run(REQ({ provider: 'claude' }))));
  assert.ok(tr, 'a tool-result was emitted');
  assert.equal(tr!.output, 'ok\n42 passing', 'the tool output text is surfaced');
  assert.equal(tr!.command, 'npm test', 'the command is correlated from the preceding tool_use (via tool_use_id)');
});

test('claude: a tool_result with array content is coerced to a joined string; no correlation -> command omitted', async () => {
  const lines = [
    JSON.stringify({ type: 'system', subtype: 'init', session_id: 's' }),
    // No preceding tool_use tracked for tu-9 -> command omitted (LLD allows undefined command).
    JSON.stringify({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'tu-9', content: [{ type: 'text', text: 'line one\n' }, { type: 'text', text: 'line two' }] }] } }),
    JSON.stringify({ type: 'result' }),
  ];
  const { deps } = depsFor({ lines });
  const reg = createProviderRegistry(deps);
  const tr = toolResult(await collect(reg.get('claude').run(REQ({ provider: 'claude' }))));
  assert.ok(tr, 'a tool-result was emitted');
  assert.equal(tr!.output, 'line one\nline two', 'array text blocks are joined into one output string');
  assert.equal(tr!.command, undefined, 'no easy correlation -> command omitted (k2)');
});

test('claude: a tool_result with empty content still emits a tool-result (empty output)', async () => {
  const lines = [
    JSON.stringify({ type: 'system', subtype: 'init', session_id: 's' }),
    JSON.stringify({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'tu-e', content: '' }] } }),
    JSON.stringify({ type: 'result' }),
  ];
  const { deps } = depsFor({ lines });
  const reg = createProviderRegistry(deps);
  const tr = toolResult(await collect(reg.get('claude').run(REQ({ provider: 'claude' }))));
  assert.ok(tr, 'a tool-result was emitted even with empty output');
  assert.equal(tr!.output, '');
});

test('claude: a user message with no tool_result blocks yields no tool-result (byte-identical -> [])', async () => {
  const lines = [
    JSON.stringify({ type: 'system', subtype: 'init', session_id: 's' }),
    JSON.stringify({ type: 'user', message: { content: [{ type: 'text', text: 'just prose' }] } }),
    JSON.stringify({ type: 'result' }),
  ];
  const { deps } = depsFor({ lines });
  const reg = createProviderRegistry(deps);
  const events = await collect(reg.get('claude').run(REQ({ provider: 'claude' })));
  assert.ok(!events.some((e) => e.kind === 'tool-result'), 'a tool_result-less user line emits nothing new');
});

test('codex: a completed command_execution with output emits both a tool-call and a tool-result', async () => {
  const lines = [
    JSON.stringify({ type: 'thread.started', thread_id: 't' }),
    JSON.stringify({ type: 'item.completed', item: { type: 'command_execution', command: 'ls -la', aggregated_output: 'a.ts\nb.ts', exit_code: 0 } }),
    JSON.stringify({ type: 'turn.completed' }),
  ];
  const { deps } = depsFor({ lines });
  const reg = createProviderRegistry(deps);
  const events = await collect(reg.get('codex').run(REQ({ provider: 'codex' })));
  const tc = toolCall(events);
  assert.ok(tc, 'a tool-call was emitted');
  assert.equal(tc!.command, 'ls -la');
  const tr = toolResult(events);
  assert.ok(tr, 'a tool-result was emitted alongside');
  assert.equal(tr!.output, 'a.ts\nb.ts', 'the aggregated output is surfaced');
  assert.equal(tr!.command, 'ls -la', 'the tool-result carries the same command');
  assert.equal(tr!.exitCode, 0, 'the exit code is surfaced');
});

test('codex: a completed command_execution WITHOUT output emits only the tool-call (byte-identical, k2)', async () => {
  const lines = [
    JSON.stringify({ type: 'thread.started', thread_id: 't' }),
    JSON.stringify({ type: 'item.completed', item: { type: 'command_execution', command: 'grep -rn foo src' } }),
    JSON.stringify({ type: 'turn.completed' }),
  ];
  const { deps } = depsFor({ lines });
  const reg = createProviderRegistry(deps);
  const events = await collect(reg.get('codex').run(REQ({ provider: 'codex' })));
  assert.ok(toolCall(events), 'a tool-call was emitted');
  assert.ok(!events.some((e) => e.kind === 'tool-result'), 'no output -> no tool-result (k2)');
});

// ---- deriveChatTitle (LLM chat titling, option 1) ------------------------------

function titleReg(adapter: StreamAdapter): ProviderRegistry {
  return { available: ['claude'], get: (id) => { if (id !== 'claude') throw new Error('unknown'); return adapter; } };
}
function scriptedTitleAdapter(run: (req: TurnRequest) => AsyncIterable<TurnEvent>): StreamAdapter {
  return { run, cancel: () => {}, decide: () => {}, capabilities: { resume: true } };
}
async function* emit(events: TurnEvent[]): AsyncIterable<TurnEvent> {
  for (const ev of events) { await Promise.resolve(); yield ev; }
}

test('deriveChatTitle: concatenates the assistant text of the one-shot (no resume passed)', async () => {
  let sawResume: unknown = 'unset';
  const reg = titleReg(scriptedTitleAdapter((req) => { sawResume = req.resume; return emit([
    { kind: 'assistant-delta', turnId: 't', text: 'Status ' },
    { kind: 'assistant-delta', turnId: 't', text: 'JSON Flag' },
    { kind: 'done', turnId: 't', ok: true, sessionId: 'x' },
  ]); }));
  const out = await deriveChatTitle(reg, { provider: 'claude', prompt: 'add a --json flag', cwd: '/repo' });
  assert.equal(out, 'Status JSON Flag');
  assert.equal(sawResume, undefined, 'the title one-shot does NOT resume (never pollutes the conversation)');
});

test('deriveChatTitle: a hung provider is cancel()led at the timeout -> undefined (does not stall)', async () => {
  let cancelled = false;
  // Emits an init event (so the turnId is known), then hangs until cancel() is called.
  const adapter: StreamAdapter = {
    async *run() {
      yield { kind: 'status', turnId: 'th', phase: 'thinking' };
      while (!cancelled) await new Promise((r) => setTimeout(r, 5));
    },
    cancel: (turnId) => { assert.equal(turnId, 'th', 'cancels the captured turnId'); cancelled = true; },
    decide: () => {},
    capabilities: { resume: true },
  };
  const start = Date.now();
  const out = await deriveChatTitle(titleReg(adapter), { provider: 'claude', prompt: 'x', cwd: '/repo' }, { timeoutMs: 40 });
  assert.equal(out, undefined, 'timed out -> undefined');
  assert.equal(cancelled, true, 'the hung CLI turn was cancelled (killed) on timeout');
  assert.ok(Date.now() - start < 1500, 'returned promptly at the timeout, not hung');
});

test('deriveChatTitle: an error event -> undefined; an unknown provider -> undefined', async () => {
  const errReg = titleReg(scriptedTitleAdapter(() => emit([{ kind: 'error', turnId: 't', message: 'boom' }])));
  assert.equal(await deriveChatTitle(errReg, { provider: 'claude', prompt: 'x', cwd: '/repo' }), undefined);
  const badReg: ProviderRegistry = { available: [], get: () => { throw new Error('unknown'); } };
  assert.equal(await deriveChatTitle(badReg, { provider: 'claude', prompt: 'x', cwd: '/repo' }), undefined);
});

// ---- S004 t3: SpawnedProcess.write seam + fake spawner recording -------------

test('S004 t3: the fake spawner records write() calls on the spawned proc (decision-relay seam)', () => {
  const spawner = makeFakeSpawner({ lines: [], exit: { code: 0, signal: null } });
  const proc = spawner.spawn('claude', [], { cwd: '/repo' });
  // The optional write() seam is present and records what is written, in order.
  assert.equal(typeof proc.write, 'function');
  proc.write?.('{"type":"permission_response","id":"req-1","decision":"approve"}\n');
  proc.write?.('{"type":"permission_response","id":"req-2","decision":"deny"}\n');
  assert.deepEqual(spawner.procs[0]!.writes(), [
    '{"type":"permission_response","id":"req-1","decision":"approve"}\n',
    '{"type":"permission_response","id":"req-2","decision":"deny"}\n',
  ]);
});

test('S004 t3: a SpawnedProcess that omits write() still runs a turn unchanged (optional, k2)', async () => {
  // A minimal spawner whose procs have NO write() method — proves the seam is
  // additive-optional: existing spawner shapes compile and behave as today.
  const noWriteSpawn: SpawnFn = () => {
    const proc: SpawnedProcess = {
      async *lines() {
        yield JSON.stringify({ type: 'result', subtype: 'success', is_error: false, session_id: 's' });
      },
      stderr: () => '',
      exit: Promise.resolve({ code: 0, signal: null }),
      spawnError: Promise.resolve(undefined),
      kill: () => {},
    };
    return proc;
  };
  assert.equal((noWriteSpawn('claude', [], { cwd: '/repo' }) as SpawnedProcess).write, undefined);
  const deps: AdapterDeps = { spawn: noWriteSpawn, isInstalled: () => true };
  const reg = createProviderRegistry(deps);
  const events = await collect(reg.get('claude').run(REQ({ provider: 'claude' })));
  assert.equal(events.at(-1)?.kind, 'done', 'turn completes normally with a write-less proc');
});

// ---- S004 t4: permissionMode -> buildArgs review/auto flags -------------------

test('S001 (bugfix): claude buildArgs — the merged mode maps to the right flags (manual/edit-auto/auto)', async () => {
  const base = ['-p', 'hi', '--output-format=stream-json', '--verbose'];
  // undefined: no permission flag (k2 — byte-identical to today's argv).
  {
    const { deps, spawner } = depsFor(CLAUDE_TEXT_TURN);
    await collect(createProviderRegistry(deps).get('claude').run(REQ({ provider: 'claude' })));
    assert.deepEqual(spawner.calls[0]!.args, base);
  }
  // manual: host answers EVERY prompt; never a bypass or acceptEdits flag.
  {
    const { deps, spawner } = depsFor(CLAUDE_TEXT_TURN);
    await collect(createProviderRegistry(deps).get('claude').run(REQ({ provider: 'claude', permissionMode: 'manual' })));
    assert.deepEqual(spawner.calls[0]!.args, [...base, '--permission-prompts', 'host']);
  }
  // edit-auto: auto-accept edits, host answers the rest.
  {
    const { deps, spawner } = depsFor(CLAUDE_TEXT_TURN);
    await collect(createProviderRegistry(deps).get('claude').run(REQ({ provider: 'claude', permissionMode: 'edit-auto' })));
    assert.deepEqual(spawner.calls[0]!.args, [...base, '--permission-mode', 'acceptEdits', '--permission-prompts', 'host']);
  }
  // auto: bypass all checks, never a host-answered flag.
  {
    const { deps, spawner } = depsFor(CLAUDE_TEXT_TURN);
    await collect(createProviderRegistry(deps).get('claude').run(REQ({ provider: 'claude', permissionMode: 'auto' })));
    const args = spawner.calls[0]!.args;
    assert.deepEqual(args, [...base, '--permission-mode', 'bypassPermissions']);
    assert.ok(!args.includes('--permission-prompts'), 'auto never asks the host');
  }
});

test('S004 t4: codex buildArgs — undefined/review keep today argv; auto adds --dangerously-bypass-approvals-and-sandbox', async () => {
  // undefined: byte-identical to today.
  {
    const { deps, spawner } = depsFor(CODEX_TEXT_TURN);
    await collect(createProviderRegistry(deps).get('codex').run(REQ({ provider: 'codex' })));
    assert.deepEqual(spawner.calls[0]!.args, ['exec', '--json', 'hi']);
  }
  // review: codex default on-request approval — no extra flag (same argv as undefined).
  {
    const { deps, spawner } = depsFor(CODEX_TEXT_TURN);
    await collect(createProviderRegistry(deps).get('codex').run(REQ({ provider: 'codex', permissionMode: 'manual' })));
    assert.deepEqual(spawner.calls[0]!.args, ['exec', '--json', 'hi']);
  }
  // auto: bypass flag, placed before the positional prompt.
  {
    const { deps, spawner } = depsFor(CODEX_TEXT_TURN);
    await collect(createProviderRegistry(deps).get('codex').run(REQ({ provider: 'codex', permissionMode: 'auto' })));
    assert.deepEqual(spawner.calls[0]!.args, ['exec', '--json', '--dangerously-bypass-approvals-and-sandbox', 'hi']);
  }
});

// ---- S004 t5: mapLine permission branch + pending registry + decide -----------

test('S004 t5: a claude permission line maps to exactly one ApprovalRequestEvent (normalized via aliases)', async () => {
  const { deps } = depsFor({ lines: CLAUDE_PERMISSION_TURN });
  const events = await collect(createProviderRegistry(deps).get('claude').run(REQ({ provider: 'claude', permissionMode: 'manual' })));
  const apprs = events.filter((e) => e.kind === 'approval-request');
  assert.equal(apprs.length, 1, 'exactly one approval-request');
  const ev = apprs[0]!;
  if (ev.kind === 'approval-request') {
    assert.equal(ev.requestId, 'perm-claude-1');
    assert.equal(ev.toolName, 'Bash');
    assert.equal(ev.detail, 'rm -rf build');
  }
  // Non-permission lines are unchanged (still a done terminal); k2.
  assert.equal(events.at(-1)?.kind, 'done');
});

test('S004 t5: a codex approval item maps to exactly one ApprovalRequestEvent', async () => {
  const { deps } = depsFor({ lines: CODEX_PERMISSION_TURN });
  const events = await collect(createProviderRegistry(deps).get('codex').run(REQ({ provider: 'codex', permissionMode: 'manual' })));
  const apprs = events.filter((e) => e.kind === 'approval-request');
  assert.equal(apprs.length, 1);
  const ev = apprs[0]!;
  if (ev.kind === 'approval-request') {
    assert.equal(ev.requestId, 'perm-codex-1');
    assert.equal(ev.detail, 'git push');
  }
});

test('S001 (bugfix): claude system/permission_denied surfaces as an approval card (the REAL CLI envelope)', async () => {
  // Captured verbatim from the installed claude CLI: a review-mode tool that needs permission is
  // NOT a control_request — it is a system/permission_denied line, then the turn ends.
  const denied = JSON.stringify({
    type: 'system',
    subtype: 'permission_denied',
    tool_name: 'Write',
    tool_use_id: 'toolu_01UHvbWBFrXzLr2gaSHJi8cy',
    message: "Claude requested permissions to write to /repo/hello.txt, but you haven't granted it yet.",
  });
  const { deps } = depsFor({ lines: [denied, JSON.stringify({ type: 'result', is_error: false })] });
  const events = await collect(createProviderRegistry(deps).get('claude').run(REQ({ provider: 'claude', permissionMode: 'manual' })));
  const apprs = events.filter((e) => e.kind === 'approval-request');
  assert.equal(apprs.length, 1, 'the denial surfaces as exactly one approval card (was: nothing)');
  const ev = apprs[0]!;
  if (ev.kind === 'approval-request') {
    assert.equal(ev.requestId, 'toolu_01UHvbWBFrXzLr2gaSHJi8cy', 'requestId == tool_use_id');
    assert.equal(ev.toolName, 'Write', 'the tool to pre-allow on approve rides the event');
    assert.match(ev.title, /Write/, 'the card names the tool');
    assert.match(ev.detail ?? '', /grant/i, 'the card carries claude’s message');
  }
  assert.equal(events.at(-1)?.kind, 'done', 'the turn still completes (claude ended it)');
});

test('S001 (bugfix): claude buildArgs pre-allows the approved tool on the grant re-run (--allowedTools)', async () => {
  const { deps, spawner } = depsFor(CLAUDE_TEXT_TURN);
  await collect(createProviderRegistry(deps).get('claude').run(REQ({ provider: 'claude', permissionMode: 'manual', allowedTools: ['Write'] })));
  const args = spawner.calls[0]!.args;
  const i = args.indexOf('--allowedTools');
  assert.ok(i >= 0, 'the grant re-run passes --allowedTools');
  assert.equal(args[i + 1], 'Write', 'with exactly the approved tool');
});

// ---- S001 (bugfix): permission_denied harvests the blocked command --------------

const apprOf = (events: TurnEvent[]): Extract<TurnEvent, { kind: 'approval-request' }> | undefined =>
  events.find((e) => e.kind === 'approval-request') as Extract<TurnEvent, { kind: 'approval-request' }> | undefined;

test('S001 (bugfix): permission_denied with a top-level command sets event.command (title/detail/toolName unchanged)', async () => {
  const denied = JSON.stringify({
    type: 'system',
    subtype: 'permission_denied',
    tool_name: 'Bash',
    tool_use_id: 'toolu_cmd_top',
    message: 'Bash needs your permission',
    command: 'npm run build',
  });
  const { deps } = depsFor({ lines: [denied, JSON.stringify({ type: 'result', is_error: false })] });
  const ev = apprOf(await collect(createProviderRegistry(deps).get('claude').run(REQ({ provider: 'claude', permissionMode: 'manual' }))));
  assert.ok(ev, 'an approval-request was emitted');
  assert.equal(ev!.command, 'npm run build', 'the top-level command is harvested');
  // The other fields are exactly as today.
  assert.equal(ev!.requestId, 'toolu_cmd_top');
  assert.equal(ev!.toolName, 'Bash');
  assert.equal(ev!.title, 'Permission: Bash');
  assert.equal(ev!.detail, 'Bash needs your permission');
});

test('S001 (bugfix): permission_denied with a nested input.command sets event.command', async () => {
  const denied = JSON.stringify({
    type: 'system',
    subtype: 'permission_denied',
    tool_name: 'Bash',
    tool_use_id: 'toolu_cmd_nested',
    message: 'Bash needs your permission',
    input: { command: 'git status', extra: 1 },
  });
  const { deps } = depsFor({ lines: [denied, JSON.stringify({ type: 'result', is_error: false })] });
  const ev = apprOf(await collect(createProviderRegistry(deps).get('claude').run(REQ({ provider: 'claude', permissionMode: 'manual' }))));
  assert.ok(ev, 'an approval-request was emitted');
  assert.equal(ev!.command, 'git status', 'the nested input.command is harvested');
  assert.equal(ev!.toolName, 'Bash');
});

test('S001 (bugfix): a top-level command takes precedence over input.command', async () => {
  const denied = JSON.stringify({
    type: 'system',
    subtype: 'permission_denied',
    tool_name: 'Bash',
    tool_use_id: 'toolu_cmd_both',
    message: 'needs perm',
    command: 'TOP',
    input: { command: 'NESTED' },
  });
  const { deps } = depsFor({ lines: [denied, JSON.stringify({ type: 'result', is_error: false })] });
  const ev = apprOf(await collect(createProviderRegistry(deps).get('claude').run(REQ({ provider: 'claude', permissionMode: 'manual' }))));
  assert.equal(ev!.command, 'TOP', 'top-level command wins');
});

test('S001 (bugfix): permission_denied WITHOUT a command omits it (byte-identical to today, k2)', async () => {
  const denied = JSON.stringify({
    type: 'system',
    subtype: 'permission_denied',
    tool_name: 'Write',
    tool_use_id: 'toolu_nocmd',
    message: 'Write needs your permission',
  });
  const { deps } = depsFor({ lines: [denied, JSON.stringify({ type: 'result', is_error: false })] });
  const ev = apprOf(await collect(createProviderRegistry(deps).get('claude').run(REQ({ provider: 'claude', permissionMode: 'manual' }))));
  assert.ok(ev, 'an approval-request was emitted');
  assert.equal(ev!.command, undefined, 'no command field when the line carries none');
  // The event has exactly the pre-fix key set (no stray command key).
  assert.deepEqual(Object.keys(ev!).sort(), ['detail', 'kind', 'requestId', 'title', 'toolName', 'turnId']);
});

test('S001 (bugfix): an EMPTY-string command is treated as absent (top-level and nested)', async () => {
  const deniedTop = JSON.stringify({
    type: 'system',
    subtype: 'permission_denied',
    tool_name: 'Bash',
    tool_use_id: 'toolu_empty_top',
    message: 'needs perm',
    command: '',
  });
  const { deps: d1 } = depsFor({ lines: [deniedTop, JSON.stringify({ type: 'result', is_error: false })] });
  const ev1 = apprOf(await collect(createProviderRegistry(d1).get('claude').run(REQ({ provider: 'claude', permissionMode: 'manual' }))));
  assert.equal(ev1!.command, undefined, 'an empty top-level command is absent');

  const deniedNested = JSON.stringify({
    type: 'system',
    subtype: 'permission_denied',
    tool_name: 'Bash',
    tool_use_id: 'toolu_empty_nested',
    message: 'needs perm',
    input: { command: '' },
  });
  const { deps: d2 } = depsFor({ lines: [deniedNested, JSON.stringify({ type: 'result', is_error: false })] });
  const ev2 = apprOf(await collect(createProviderRegistry(d2).get('claude').run(REQ({ provider: 'claude', permissionMode: 'manual' }))));
  assert.equal(ev2!.command, undefined, 'an empty nested command is absent');
});

// ---- S001 (bugfix): classifyPermissionDenial ------------------------------------

test('S001 (bugfix): classifyPermissionDenial marks the sandbox working-directory phrasing as dir-block', () => {
  assert.equal(
    classifyPermissionDenial('Bash may only run in the allowed working directories for this session.'),
    'dir-block',
  );
  assert.equal(
    classifyPermissionDenial('This path is outside the allowed working directories.'),
    'dir-block',
  );
  // Case-insensitive.
  assert.equal(classifyPermissionDenial('ALLOWED WORKING DIRECTORIES exceeded'), 'dir-block');
});

test('S001 (bugfix): classifyPermissionDenial defaults everything else to tool-gate (safe default)', () => {
  assert.equal(classifyPermissionDenial('Bash needs your permission to run this command'), 'tool-gate');
  assert.equal(classifyPermissionDenial('Claude requested permissions to write to /repo/x.ts'), 'tool-gate');
  assert.equal(classifyPermissionDenial('some unknown message'), 'tool-gate');
  assert.equal(classifyPermissionDenial(''), 'tool-gate', 'empty -> tool-gate');
});

test('S001 (bugfix): realistic tool-gate messages are NOT false-positived as dir-block', () => {
  const toolGateMessages = [
    "Claude requested permissions to write to /repo/hello.txt, but you haven't granted it yet.",
    'Bash needs your permission to run: rm -rf build',
    'Permission required to use the Edit tool.',
    'The command touches files in your working directory tree.', // "working directory" but NOT "allowed working directories"
    'This tool needs approval before it can proceed.',
    'Write to the directory was requested.',
  ];
  for (const m of toolGateMessages) {
    assert.equal(classifyPermissionDenial(m), 'tool-gate', `must not mis-classify: ${m}`);
  }
});

test('S001 (bugfix): claude buildArgs adds only --allowedTools, never --add-dir (no sandbox widening on a click)', async () => {
  // With allowedTools passed (the grant re-run): --allowedTools present, --add-dir absent.
  {
    const { deps, spawner } = depsFor(CLAUDE_TEXT_TURN);
    await collect(createProviderRegistry(deps).get('claude').run(REQ({ provider: 'claude', permissionMode: 'manual', allowedTools: ['Bash'] })));
    const args = spawner.calls[0]!.args;
    assert.ok(args.includes('--allowedTools'), 'the grant re-run passes --allowedTools');
    assert.ok(!args.includes('--add-dir'), 'buildArgs never adds --add-dir');
  }
  // Without allowedTools: still no --add-dir.
  {
    const { deps, spawner } = depsFor(CLAUDE_TEXT_TURN);
    await collect(createProviderRegistry(deps).get('claude').run(REQ({ provider: 'claude', permissionMode: 'manual' })));
    assert.ok(!spawner.calls[0]!.args.includes('--add-dir'), 'no --add-dir without a grant either');
  }
});

test('S004 t5: an idless permission line yields no approval-request (normalizer -> null -> [])', async () => {
  const { deps } = depsFor({ lines: CLAUDE_PERMISSION_IDLESS });
  const events = await collect(createProviderRegistry(deps).get('claude').run(REQ({ provider: 'claude', permissionMode: 'manual' })));
  assert.equal(events.filter((e) => e.kind === 'approval-request').length, 0);
  assert.equal(events.at(-1)?.kind, 'done', 'turn still completes');
});

test('S004 t5: an unparseable line is skipped+logged, never thrown (as today)', async () => {
  const { deps, warns } = depsFor({ lines: ['{ not json', JSON.stringify({ type: 'result', is_error: false })], exit: { code: 0, signal: null } });
  const events = await collect(createProviderRegistry(deps).get('claude').run(REQ({ provider: 'claude' })));
  assert.equal(events.at(-1)?.kind, 'done');
  assert.ok(warns.some((w) => /unparseable/.test(w)), 'the bad line was skipped with a warning');
});

/** Drive a review turn until the first approval-request, returning it + the live iterator (turn stays open). */
async function openUntilApproval(providerId: ProviderId, script: FakeProcScript) {
  const { deps, spawner } = depsFor(script);
  const adapter = createProviderRegistry(deps).get(providerId);
  const it = adapter.run(REQ({ provider: providerId, permissionMode: 'manual' }))[Symbol.asyncIterator]();
  let appr: Extract<TurnEvent, { kind: 'approval-request' }> | undefined;
  for (;;) {
    const { value, done } = await it.next();
    if (done) break;
    if (value.kind === 'approval-request') { appr = value; break; }
  }
  return { adapter, spawner, it, appr };
}

test('S004 t5: decide() writes the correct control response for a live requestId; stale/unknown -> no-op (<=1 write per id)', async () => {
  const hangingPerm: FakeProcScript = { lines: [...CLAUDE_PERMISSION_TURN.slice(0, 2)], hangUntilKilled: true };
  const { adapter, spawner, it, appr } = await openUntilApproval('claude', hangingPerm);
  assert.ok(appr, 'surfaced an approval-request');
  adapter.decide(appr!.turnId, appr!.requestId, 'approve');
  const writes = spawner.procs[0]!.writes();
  assert.equal(writes.length, 1, 'exactly one control response written');
  assert.match(writes[0]!, /perm-claude-1/, 'carries the correlation id');
  assert.match(writes[0]!, /allow/, 'approve -> allow behavior');
  // A duplicate/late decide for the same id is a no-op (at most one write per id).
  adapter.decide(appr!.turnId, appr!.requestId, 'deny');
  assert.equal(spawner.procs[0]!.writes().length, 1);
  // An unknown id is a no-op.
  adapter.decide(appr!.turnId, 'no-such-req', 'approve');
  assert.equal(spawner.procs[0]!.writes().length, 1);
  adapter.cancel(appr!.turnId);
  await it.return?.(undefined);
});

test('S004 t5: pending entries are auto-cleaned on cancel() -> a later decide() writes nothing (no dangling card)', async () => {
  const hangingPerm: FakeProcScript = { lines: [...CLAUDE_PERMISSION_TURN.slice(0, 2)], hangUntilKilled: true };
  const { adapter, spawner, it, appr } = await openUntilApproval('claude', hangingPerm);
  assert.ok(appr);
  adapter.cancel(appr!.turnId); // kills the turn + clears the registry
  adapter.decide(appr!.turnId, appr!.requestId, 'approve');
  assert.equal(spawner.procs[0]!.writes().length, 0, 'no write after cancel — the request was cleaned up');
  await it.return?.(undefined);
});

test('S004 t5: decide() on an unknown turn is a safe no-op (never throws)', () => {
  const { deps } = depsFor(CLAUDE_TEXT_TURN);
  const adapter = createProviderRegistry(deps).get('claude');
  assert.doesNotThrow(() => adapter.decide('no-such-turn', 'r', 'approve'));
});

// ---- S004 (dev-chat ux polish): the `insrc:select` selection-marker parse (both mappers) ----

const SEL_JSON = JSON.stringify({ prompt: 'Pick one', options: [{ id: 'a', label: 'Alpha' }, { id: 'b', label: 'Beta' }], multi: false });
const SEL_MARKER = '```insrc:select\n' + SEL_JSON + '\n```';
const claudeText = (text: string): string => JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text }] } });
const claudeInit = JSON.stringify({ type: 'system', subtype: 'init', session_id: 'sess-sel' });
const claudeResult = JSON.stringify({ type: 'result', subtype: 'success', is_error: false, session_id: 'sess-sel' });

test('claude: a valid insrc:select marker -> a selection-request event + the raw marker stripped from the delta', async () => {
  const lines = [claudeInit, claudeText('Here you go:\n' + SEL_MARKER), claudeResult];
  const { deps } = depsFor({ lines });
  const events = await collect(createProviderRegistry(deps).get('claude').run(REQ({ provider: 'claude' })));
  const sel = events.find((e) => e.kind === 'selection-request') as
    | { kind: 'selection-request'; requestId: string; prompt: string; options: Array<{ id: string; label: string }>; multi?: boolean }
    | undefined;
  assert.ok(sel, 'a selection-request event was emitted');
  assert.equal(sel!.prompt, 'Pick one');
  assert.deepEqual(sel!.options, [{ id: 'a', label: 'Alpha' }, { id: 'b', label: 'Beta' }]);
  assert.ok(typeof sel!.requestId === 'string' && sel!.requestId !== '', 'a requestId was minted');
  assert.equal(sel!.multi, undefined, 'multi:false -> the field is omitted');
  // The raw marker is stripped from every assistant-delta (the user sees the widget, not the fence).
  const deltas = events.filter((e) => e.kind === 'assistant-delta').map((e) => (e as { text: string }).text);
  assert.ok(deltas.some((t) => t.includes('Here you go:')), 'the surrounding text still streams');
  assert.ok(!deltas.some((t) => t.includes('insrc:select') || t.includes('```')), 'no raw fence leaks into a delta');
});

test('claude: a marker-only text block emits the selection-request with NO empty assistant-delta', async () => {
  const lines = [claudeInit, claudeText(SEL_MARKER), claudeResult];
  const { deps } = depsFor({ lines });
  const events = await collect(createProviderRegistry(deps).get('claude').run(REQ({ provider: 'claude' })));
  assert.equal(events.filter((e) => e.kind === 'selection-request').length, 1, 'exactly one selection-request');
  assert.equal(events.filter((e) => e.kind === 'assistant-delta').length, 0, 'no empty delta for a marker-only block');
});

test('claude: a malformed insrc:select marker -> NO event, the raw text stays an assistant-delta, no throw', async () => {
  const bad = '```insrc:select\n{not valid json\n```';
  const lines = [claudeInit, claudeText(bad), claudeResult];
  const { deps } = depsFor({ lines });
  let events: TurnEvent[] = [];
  await assert.doesNotReject(async () => { events = await collect(createProviderRegistry(deps).get('claude').run(REQ({ provider: 'claude' }))); });
  assert.equal(events.filter((e) => e.kind === 'selection-request').length, 0, 'malformed -> no selection-request');
  const deltas = events.filter((e) => e.kind === 'assistant-delta').map((e) => (e as { text: string }).text).join('');
  assert.ok(deltas.includes('insrc:select') && deltas.includes('{not valid json'), 'the raw marker survives as text');
});

test('claude: a marker SPLIT across two assistant lines emits ONLY on the closing fence (half-marker never emits/leaks)', async () => {
  const part1 = '```insrc:select\n{"prompt":"Pick","opt';
  const part2 = 'ions":[{"id":"a","label":"A"}],"multi":false}\n```';
  const lines = [claudeInit, claudeText(part1), claudeText(part2), claudeResult];
  const { deps } = depsFor({ lines });
  const events = await collect(createProviderRegistry(deps).get('claude').run(REQ({ provider: 'claude' })));
  const sels = events.filter((e) => e.kind === 'selection-request');
  assert.equal(sels.length, 1, 'exactly one selection-request, emitted only when the marker completed');
  assert.equal((sels[0] as { prompt: string }).prompt, 'Pick');
  // Neither half leaked: no assistant-delta carries a partial fence or the JSON fragment.
  const deltas = events.filter((e) => e.kind === 'assistant-delta').map((e) => (e as { text: string }).text);
  assert.equal(deltas.length, 0, 'a split marker with no surrounding prose yields no delta (both halves buffered, not leaked)');
});

test('claude: a line with no marker behaves exactly as today (assistant-delta unchanged, no selection-request)', async () => {
  const lines = [claudeInit, claudeText('just a normal answer'), claudeResult];
  const { deps } = depsFor({ lines });
  const events = await collect(createProviderRegistry(deps).get('claude').run(REQ({ provider: 'claude' })));
  assert.equal(events.filter((e) => e.kind === 'selection-request').length, 0);
  assert.deepEqual(events.filter((e) => e.kind === 'assistant-delta').map((e) => (e as { text: string }).text), ['just a normal answer']);
});

const codexMsg = (text: string): string => JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text } });
const codexDelta = (delta: string): string => JSON.stringify({ type: 'agent_message_delta', delta });
const codexStart = JSON.stringify({ type: 'thread.started', thread_id: 'thread-sel' });
const codexDone = JSON.stringify({ type: 'turn.completed' });

test('codex: a valid insrc:select marker -> a selection-request event + the raw marker stripped', async () => {
  const lines = [codexStart, codexMsg('Options:\n' + SEL_MARKER), codexDone];
  const { deps } = depsFor({ lines });
  const events = await collect(createProviderRegistry(deps).get('codex').run(REQ({ provider: 'codex' })));
  const sel = events.find((e) => e.kind === 'selection-request') as { prompt: string; options: unknown[] } | undefined;
  assert.ok(sel, 'a selection-request event was emitted');
  assert.equal(sel!.prompt, 'Pick one');
  assert.equal(sel!.options.length, 2);
  const deltas = events.filter((e) => e.kind === 'assistant-delta').map((e) => (e as { text: string }).text);
  assert.ok(!deltas.some((t) => t.includes('insrc:select')), 'no raw fence leaks into a delta');
});

test('codex: a malformed marker -> NO event, the raw text stays a delta, no throw', async () => {
  const lines = [codexStart, codexMsg('```insrc:select\nnot json\n```'), codexDone];
  const { deps } = depsFor({ lines });
  let events: TurnEvent[] = [];
  await assert.doesNotReject(async () => { events = await collect(createProviderRegistry(deps).get('codex').run(REQ({ provider: 'codex' }))); });
  assert.equal(events.filter((e) => e.kind === 'selection-request').length, 0);
  assert.ok(events.filter((e) => e.kind === 'assistant-delta').map((e) => (e as { text: string }).text).join('').includes('insrc:select'), 'raw marker survives');
});

test('codex: a marker SPLIT across two delta chunks emits ONLY on the closing fence', async () => {
  const p1 = '```insrc:select\n{"prompt":"P","opti';
  const p2 = 'ons":[{"id":"x","label":"X"}]}\n```';
  const lines = [codexStart, codexDelta(p1), codexDelta(p2), codexDone];
  const { deps } = depsFor({ lines });
  const events = await collect(createProviderRegistry(deps).get('codex').run(REQ({ provider: 'codex' })));
  const sels = events.filter((e) => e.kind === 'selection-request');
  assert.equal(sels.length, 1, 'exactly one selection-request across the split');
  assert.equal((sels[0] as { prompt: string }).prompt, 'P');
  assert.equal(events.filter((e) => e.kind === 'assistant-delta').length, 0, 'no partial fence leaked as a delta');
});

test('codex: a no-marker delta behaves exactly as today', async () => {
  const lines = [codexStart, codexDelta('hello '), codexDelta('there'), codexDone];
  const { deps } = depsFor({ lines });
  const events = await collect(createProviderRegistry(deps).get('codex').run(REQ({ provider: 'codex' })));
  assert.equal(events.filter((e) => e.kind === 'selection-request').length, 0);
  assert.deepEqual(events.filter((e) => e.kind === 'assistant-delta').map((e) => (e as { text: string }).text), ['hello ', 'there']);
});

// ---- ISSUE-1163888072faa9f2: the provider call id rides tool-call + tool-result (live pairing) ----

test('claude: tool-call and its tool-result carry the tool_use id as callId', async () => {
  const lines = [
    JSON.stringify({ type: 'system', subtype: 'init', session_id: 's' }),
    JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'tu-1', name: 'Bash', input: { command: 'npm test' } }] } }),
    JSON.stringify({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'tu-1', content: 'ok' }] } }),
    JSON.stringify({ type: 'result' }),
  ];
  const { deps } = depsFor({ lines });
  const events = await collect(createProviderRegistry(deps).get('claude').run(REQ({ provider: 'claude' })));
  assert.equal((toolCall(events) as { callId?: string } | undefined)?.callId, 'tu-1');
  assert.equal((toolResult(events) as { callId?: string } | undefined)?.callId, 'tu-1');
});

test('codex: a command item with an id carries it as callId on both events; an id-less item omits it', async () => {
  const lines = [
    JSON.stringify({ type: 'thread.started', thread_id: 't' }),
    JSON.stringify({ type: 'item.completed', item: { id: 'item_3', type: 'command_execution', command: 'ls', aggregated_output: 'a' } }),
    JSON.stringify({ type: 'turn.completed' }),
  ];
  const { deps } = depsFor({ lines });
  const events = await collect(createProviderRegistry(deps).get('codex').run(REQ({ provider: 'codex' })));
  assert.equal((toolCall(events) as { callId?: string } | undefined)?.callId, 'item_3');
  assert.equal((toolResult(events) as { callId?: string } | undefined)?.callId, 'item_3');
  const noId = [
    JSON.stringify({ type: 'thread.started', thread_id: 't' }),
    JSON.stringify({ type: 'item.completed', item: { type: 'command_execution', command: 'ls', aggregated_output: 'a' } }),
    JSON.stringify({ type: 'turn.completed' }),
  ];
  const ev2 = await collect(createProviderRegistry(depsFor({ lines: noId }).deps).get('codex').run(REQ({ provider: 'codex' })));
  assert.ok(!('callId' in (toolCall(ev2) as object)), 'no id -> callId omitted');
});
