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
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createSessionOutput, parseMarker } from '../session-output.js';
import { tick, waitFor } from './fixtures.js';
import { defaultProcessStartTime } from '../session-lock.js';
import { appendFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
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
  VIBE_TEXT_TURN,
  VIBE_TOOL_TURN,
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
  const { deps } = depsFor({ lines: [] }, ['claude', 'vibe']);
  const reg = createProviderRegistry(deps);
  assert.deepEqual([...reg.available], ['claude', 'vibe']);
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

// ---- Story E20261015067b05b6:S001 t3: ToolCallEvent.present (the documents a turn declares) ----

const claudeToolUse = (name: string, input: unknown): string[] => [
  JSON.stringify({ type: 'system', subtype: 'init', session_id: 's' }),
  JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'tu1', name, input }] } }),
  JSON.stringify({ type: 'result' }),
];
const presentOf = async (lines: string[]): Promise<readonly string[] | undefined> => {
  const { deps } = depsFor({ lines });
  const reg = createProviderRegistry(deps);
  const tc = (await collect(reg.get('claude').run(REQ({ provider: 'claude' })))).find((e) => e.kind === 'tool-call') as
    | { present?: readonly string[] }
    | undefined;
  assert.ok(tc, 'a tool-call was emitted');
  return tc.present;
};

test('the Claude mapper sets present on an insrc_present tool call from its input and leaves it off every other tool call', async () => {
  const docs = ['LLD-abc-S001', 'docs/x/PLAN.md'];
  // Server-qualified name, whichever server the MCP is registered under.
  assert.deepEqual(await presentOf(claudeToolUse('mcp__insrc__insrc_present', { documents: docs })), docs);
  assert.deepEqual(await presentOf(claudeToolUse('mcp__plugin_insrc_insrc__insrc_present', { documents: docs })), docs);
  // Every other tool leaves it off, even with the same input; a different tool named alike is not it.
  assert.equal(await presentOf(claudeToolUse('mcp__insrc__insrc_workflow_approve', { documents: docs })), undefined);
  assert.equal(await presentOf(claudeToolUse('Bash', { command: 'ls', documents: docs })), undefined);
  assert.equal(await presentOf(claudeToolUse('insrc_present', { documents: docs })), undefined, 'an unqualified Claude name is not an MCP call');
});

test('an input that is not a list of at most twenty non-empty strings leaves present absent', async () => {
  const twenty = Array.from({ length: 20 }, (_, i) => `LLD-${i}`);
  assert.deepEqual(await presentOf(claudeToolUse('mcp__insrc__insrc_present', { documents: twenty })), twenty);
  for (const bad of [
    { documents: [] },
    { documents: [...twenty, 'LLD-21'] },
    { documents: ['LLD-a', ''] },
    { documents: ['LLD-a', 7] },
    { documents: 'LLD-a' },
    { documents: { 0: 'LLD-a' } },
    {},
  ]) {
    assert.equal(await presentOf(claudeToolUse('mcp__insrc__insrc_present', bad)), undefined, JSON.stringify(bad));
  }
  // The call itself still shows as a tool row.
  const { deps } = depsFor({ lines: claudeToolUse('mcp__insrc__insrc_present', { documents: [] }) });
  const events = await collect(createProviderRegistry(deps).get('claude').run(REQ({ provider: 'claude' })));
  assert.ok(events.some((e) => e.kind === 'tool-call' && e.mcp?.name === 'insrc_present'));
});

const codexItems = (...items: unknown[]): string[] => [
  JSON.stringify({ type: 'thread.started', thread_id: 't' }),
  ...items.map((item) => JSON.stringify({ type: 'item.completed', item })),
  JSON.stringify({ type: 'turn.completed' }),
];
const codexEvents = async (lines: string[]): Promise<TurnEvent[]> => {
  const { deps } = depsFor({ lines });
  return collect(createProviderRegistry(deps).get('codex').run(REQ({ provider: 'codex' })));
};
const codexMcp = (over: Record<string, unknown>) => ({
  id: 'item_1', type: 'mcp_tool_call', server: 'stub', tool: 'insrc_present', arguments: { documents: ['LLD-abc-S001', 'docs/x.md'] },
  result: null, error: null, status: 'completed', ...over,
});

test('the pinned real Codex capture maps to exactly one tool-call event with present set to the declared documents, from the completed mcp_tool_call item and not the started one', async () => {
  // A real `codex exec --json` run (codex-cli 0.162.1) that called an MCP tool named insrc_present.
  const lines = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'codex-mcp-tool-call.jsonl'), 'utf8')
    .split('\n')
    .filter((l) => l.trim() !== '');
  const started = lines.filter((l) => (JSON.parse(l) as { type: string }).type === 'item.started');
  assert.equal(started.length, 1, 'the capture holds the started item too');
  assert.equal(((JSON.parse(started[0]!) as { item: { arguments: unknown } }).item.arguments as { documents: string[] }).documents.length, 2, 'and it carries the arguments');
  const calls = (await codexEvents(lines)).filter((e) => e.kind === 'tool-call');
  assert.equal(calls.length, 1, 'one call, though the CLI reported it twice');
  const call = calls[0] as { tool: string; present?: readonly string[]; mcp?: { server: string; name: string }; callId?: string };
  assert.deepEqual(call.present, ['LLD-abc-S001', 'docs/x.md']);
  assert.deepEqual(call.mcp, { server: 'stub', name: 'insrc_present' });
  assert.equal(call.tool, 'insrc_present');
  assert.equal(call.callId, 'item_1');
});

test('a Codex mcp_tool_call insrc_present item with status failed still sets present', async () => {
  const failed = codexMcp({ status: 'failed', error: { message: 'MCP tool call requires approval, but approval policy is never' } });
  const calls = (await codexEvents(codexItems(failed))).filter((e) => e.kind === 'tool-call') as { present?: readonly string[] }[];
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0]!.present, ['LLD-abc-S001', 'docs/x.md']);
});

test('a Codex mcp_tool_call for another tool, a server-qualified tool name, or string arguments sets no present, and command_execution and tool_call items map as before', async () => {
  const none = async (item: unknown): Promise<TurnEvent> => {
    const calls = (await codexEvents(codexItems(item))).filter((e) => e.kind === 'tool-call');
    assert.equal(calls.length, 1, JSON.stringify(item));
    return calls[0]!;
  };
  for (const item of [
    codexMcp({ tool: 'insrc_workflow_approve' }),
    codexMcp({ tool: 'mcp__stub__insrc_present' }),
    codexMcp({ arguments: JSON.stringify({ documents: ['LLD-abc-S001'] }) }),
    codexMcp({ arguments: { documents: [] } }),
    codexMcp({ arguments: ['LLD-abc-S001'] }),
    codexMcp({ arguments: null }),
  ]) {
    assert.equal((await none(item) as { present?: unknown }).present, undefined, JSON.stringify(item));
  }
  // The unchanged item types still map exactly as before: no present, no mcp.
  const cmd = await none({ id: 'c1', type: 'command_execution', command: 'ls -la', documents: ['LLD-abc-S001'] }) as { tool: string; command?: string; present?: unknown; mcp?: unknown; callId?: string };
  assert.deepEqual({ tool: cmd.tool, command: cmd.command, present: cmd.present, mcp: cmd.mcp, callId: cmd.callId }, { tool: 'ls -la', command: 'ls -la', present: undefined, mcp: undefined, callId: 'c1' });
  const plain = await none({ type: 'tool_call', tool: 'insrc_present', arguments: { documents: ['LLD-abc-S001'] } }) as { tool: string; present?: unknown; mcp?: unknown };
  assert.deepEqual({ tool: plain.tool, present: plain.present, mcp: plain.mcp }, { tool: 'insrc_present', present: undefined, mcp: undefined });
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
  const base = ['-p', '--output-format=stream-json', '--verbose'];
  const end = ['--', 'hi'];
  // undefined: no permission flag (k2 — byte-identical to today's argv).
  {
    const { deps, spawner } = depsFor(CLAUDE_TEXT_TURN);
    await collect(createProviderRegistry(deps).get('claude').run(REQ({ provider: 'claude' })));
    assert.deepEqual(spawner.calls[0]!.args, [...base, ...end]);
  }
  // manual: host answers EVERY prompt; never a bypass or acceptEdits flag.
  {
    const { deps, spawner } = depsFor(CLAUDE_TEXT_TURN);
    await collect(createProviderRegistry(deps).get('claude').run(REQ({ provider: 'claude', permissionMode: 'manual' })));
    assert.deepEqual(spawner.calls[0]!.args, [...base, '--permission-prompts', 'host', ...end]);
  }
  // edit-auto: auto-accept edits, host answers the rest.
  {
    const { deps, spawner } = depsFor(CLAUDE_TEXT_TURN);
    await collect(createProviderRegistry(deps).get('claude').run(REQ({ provider: 'claude', permissionMode: 'edit-auto' })));
    assert.deepEqual(spawner.calls[0]!.args, [...base, '--permission-mode', 'acceptEdits', '--permission-prompts', 'host', ...end]);
  }
  // auto: bypass all checks, never a host-answered flag.
  {
    const { deps, spawner } = depsFor(CLAUDE_TEXT_TURN);
    await collect(createProviderRegistry(deps).get('claude').run(REQ({ provider: 'claude', permissionMode: 'auto' })));
    const args = spawner.calls[0]!.args;
    assert.deepEqual(args, [...base, '--permission-mode', 'bypassPermissions', ...end]);
    assert.ok(!args.includes('--permission-prompts'), 'auto never asks the host');
  }
});

test('S004 t4: codex buildArgs — undefined/review keep today argv; auto adds --dangerously-bypass-approvals-and-sandbox', async () => {
  // undefined: byte-identical to today.
  {
    const { deps, spawner } = depsFor(CODEX_TEXT_TURN);
    await collect(createProviderRegistry(deps).get('codex').run(REQ({ provider: 'codex' })));
    assert.deepEqual(spawner.calls[0]!.args, ['exec', '--json', '--', 'hi']);
  }
  // review: codex default on-request approval — no extra flag (same argv as undefined).
  {
    const { deps, spawner } = depsFor(CODEX_TEXT_TURN);
    await collect(createProviderRegistry(deps).get('codex').run(REQ({ provider: 'codex', permissionMode: 'manual' })));
    assert.deepEqual(spawner.calls[0]!.args, ['exec', '--json', '--', 'hi']);
  }
  // auto: bypass flag, placed before the positional prompt.
  {
    const { deps, spawner } = depsFor(CODEX_TEXT_TURN);
    await collect(createProviderRegistry(deps).get('codex').run(REQ({ provider: 'codex', permissionMode: 'auto' })));
    assert.deepEqual(spawner.calls[0]!.args, ['exec', '--json', '--dangerously-bypass-approvals-and-sandbox', '--', 'hi']);
  }
});

// ---- vibe provider -----------------------------------------------------------

test('vibe: streaming text turn maps to assistant-deltas + a synthesized done(ok) carrying the sessionId', async () => {
  const { deps, spawner } = depsFor({ lines: VIBE_TEXT_TURN }, ['vibe']);
  const reg = createProviderRegistry(deps);
  const events = await collect(reg.get('vibe').run(REQ({ provider: 'vibe' })));
  assert.deepEqual(events.map((e) => e.kind), ['assistant-delta', 'assistant-delta', 'done']);
  assert.deepEqual(events.filter((e) => e.kind === 'assistant-delta').map((e) => (e as { text: string }).text), ['Hello ', 'world']);
  const done = events.at(-1) as { ok: boolean; sessionId?: string };
  assert.equal(done.ok, true, 'vibe streams no terminal line; the adapter synthesizes done on exit 0');
  assert.equal(done.sessionId, 'sess-vibe-1');
  assert.equal(spawner.calls[0]!.command, 'vibe');
  assert.deepEqual(spawner.calls[0]!.args, ['-p', '--output', 'streaming', '--', 'hi']);
  assert.equal(spawner.calls[0]!.closeInput, true, 'vibe reads stdin as the prompt, so input is closed and the prompt is positional');
});

test('vibe: tool_call (arguments_json string) maps to tool-call with command + mcp present; tool_result correlates the command', async () => {
  const { deps } = depsFor({ lines: VIBE_TOOL_TURN }, ['vibe']);
  const events = await collect(createProviderRegistry(deps).get('vibe').run(REQ({ provider: 'vibe' })));
  const tools = events.filter((e) => e.kind === 'tool-call') as Array<{ tool: string; command?: string; callId?: string; mcp?: { server: string; name: string }; present?: readonly string[] }>;
  assert.equal(tools.length, 2);
  assert.equal(tools[0]!.tool, 'bash');
  assert.equal(tools[0]!.command, 'npm test', 'command parsed out of the arguments_json string');
  assert.equal(tools[0]!.callId, 'call-1');
  assert.equal(tools[1]!.tool, 'mcp_insrc_insrc_present');
  assert.deepEqual(tools[1]!.mcp, { server: 'insrc', name: 'insrc_present' });
  assert.deepEqual(tools[1]!.present, ['LLD-x-S001']);
  const res = events.find((e) => e.kind === 'tool-result') as { output: string; command?: string; callId?: string };
  assert.equal(res.output, 'all green');
  assert.equal(res.command, 'npm test', 'the tool_result correlates the command via tool_call_id');
  assert.equal(res.callId, 'call-1');
});

test('vibe: argv — resume, --add-dir, and the permission-mode flags', async () => {
  {
    const { deps, spawner } = depsFor(VIBE_TEXT_TURN, ['vibe']);
    await collect(createProviderRegistry(deps).get('vibe').run(REQ({ provider: 'vibe' })));
    assert.deepEqual(spawner.calls[0]!.args, ['-p', '--output', 'streaming', '--', 'hi']);
  }
  {
    const { deps, spawner } = depsFor(VIBE_TEXT_TURN, ['vibe']);
    await collect(createProviderRegistry(deps).get('vibe').run(REQ({ provider: 'vibe', permissionMode: 'auto' })));
    assert.deepEqual(spawner.calls[0]!.args, ['-p', '--output', 'streaming', '--auto-approve', '--', 'hi']);
  }
  {
    const { deps, spawner } = depsFor(VIBE_TEXT_TURN, ['vibe']);
    await collect(createProviderRegistry(deps).get('vibe').run(REQ({ provider: 'vibe', permissionMode: 'manual' })));
    assert.deepEqual(spawner.calls[0]!.args, ['-p', '--output', 'streaming', '--agent', 'ask', '--', 'hi']);
  }
  {
    const { deps, spawner } = depsFor(VIBE_TEXT_TURN, ['vibe']);
    await collect(createProviderRegistry(deps).get('vibe').run(REQ({ provider: 'vibe', permissionMode: 'edit-auto' })));
    assert.deepEqual(spawner.calls[0]!.args, ['-p', '--output', 'streaming', '--agent', 'accept-edits', '--', 'hi']);
  }
  {
    const { deps, spawner } = depsFor(VIBE_TEXT_TURN, ['vibe']);
    await collect(createProviderRegistry(deps).get('vibe').run(REQ({ provider: 'vibe', resume: { provider: 'vibe', nativeSessionId: 'sess-vibe-9' }, readDirs: ['/tmp/att'] })));
    assert.deepEqual(spawner.calls[0]!.args, ['-p', '--output', 'streaming', '--resume', 'sess-vibe-9', '--add-dir', '/tmp/att', '--', 'hi']);
  }
});

test('ProviderRegistry.available lists vibe alongside claude/codex when installed', () => {
  const { deps } = depsFor({ lines: [] }, ['claude', 'codex', 'vibe']);
  const reg = createProviderRegistry(deps);
  assert.deepEqual([...reg.available], ['claude', 'codex', 'vibe']);
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
  // The event has exactly the pre-fix key set plus resolution (ISSUE-6a811b8a): no stray command key.
  assert.deepEqual(Object.keys(ev!).sort(), ['detail', 'kind', 'requestId', 'resolution', 'title', 'toolName', 'turnId']);
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

test('S001 (bugfix): claude buildArgs adds only --allowedTools, never --add-dir, on a grant with no readDirs (no sandbox widening on a click)', async () => {
  // With allowedTools passed (the grant re-run): --allowedTools present, --add-dir absent.
  {
    const { deps, spawner } = depsFor(CLAUDE_TEXT_TURN);
    await collect(createProviderRegistry(deps).get('claude').run(REQ({ provider: 'claude', permissionMode: 'manual', allowedTools: ['Bash'] })));
    const args = spawner.calls[0]!.args;
    assert.ok(args.includes('--allowedTools'), 'the grant re-run passes --allowedTools');
    assert.ok(!args.includes('--add-dir'), 'a grant alone never adds --add-dir');
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

// ---- S001 (E202610101d04e560): the CLI's output in the session file ---------------------

test("the real spawner appends the CLI's stdout to the session file inside its turn segment and stderr to the err log, and lines() yields every line including those written after the result line", async (t) => {
  if (process.platform === 'win32') return t.diagnostic('uses sh');
  const out = createSessionOutput({ root: join(mkdtempSync(join(tmpdir(), 'chat-out-')), 'chat-output'), pollMs: 5 });
  const seg = await out.beginTurn('s1', 'turn-1');
  const script = [
    `echo '{"type":"system","subtype":"init","session_id":"s"}'`,
    `echo '{"type":"result","subtype":"success","is_error":false,"session_id":"s"}'`,
    'echo "warming up" >&2',
    'sleep 0.2',
    `echo '{"type":"late","n":1}'`,
  ].join('; ');
  const proc = nodeSpawner('sh', ['-c', script], {
    cwd: process.cwd(),
    output: { outPath: seg.outPath, errPath: seg.errPath, cursor: seg.cursor, tail: (c, finished) => out.tail(c, { finished }), errTail: () => out.errTail('s1') },
  });
  assert.equal(await proc.spawnError, undefined);
  const lines: string[] = [];
  for await (const l of proc.lines()) lines.push(l);
  await proc.exit;
  assert.equal(lines.length, 3, 'every line, including the one written after the result line');
  assert.match(lines[2]!, /"late"/);
  assert.equal(proc.stderr(), 'warming up\n', 'stderr went to the err log');
  // The file holds the turn's segment: header, turn-start, then the CLI's own lines.
  const fileLines = readFileSync(seg.outPath, 'utf8').trimEnd().split('\n');
  assert.deepEqual(fileLines.slice(0, 2).map((l) => parseMarker(l)?.kind), ['file', 'turn-start']);
  assert.deepEqual(fileLines.slice(2), lines, 'the CLI wrote straight into the session file after the turn-start');
  assert.equal(proc.cursor?.offset, readFileSync(seg.outPath).length, 'the cursor is just after the last line');
});

test('marker lines reaching a mapper produce no events', async () => {
  // A marker that also looks like a claude result line: without the marker check it would map to done.
  const marker = JSON.stringify({ 'insrc.marker': 'turn-end', turnId: 'x', type: 'result', subtype: 'success', is_error: false });
  const { deps } = depsFor({ lines: [CLAUDE_TEXT_TURN[0]!, marker, ...CLAUDE_TEXT_TURN.slice(1)] });
  const events = await collect(createProviderRegistry(deps).get('claude').run(REQ({ provider: 'claude' })));
  assert.deepEqual(events.map((e) => e.kind), ['status', 'assistant-delta', 'assistant-delta', 'done'], 'the marker produced nothing');
});

test('run() yields the same events from the output file as from a pipe, reports progress offsets, and writes the turn-end marker after the process exits', async (t) => {
  if (process.platform === 'win32') return t.diagnostic('uses sh');
  const lines = [...CLAUDE_TEXT_TURN];
  // The CLI answers, then keeps running and writes once more before it exits.
  const script = `${lines.map((l) => `printf '%s\\n' '${l.replace(/'/g, "'\\''")}'`).join('; ')}; sleep 0.3; echo '{"type":"late"}'`;
  const shSpawn: SpawnFn = (_cmd, _args, opts) => nodeSpawner('sh', ['-c', script], opts);
  const root = join(mkdtempSync(join(tmpdir(), 'chat-out-')), 'chat-output');
  const sessionOutput = createSessionOutput({ root, pollMs: 5 });

  const piped = await collect(createProviderRegistry({ spawn: shSpawn, isInstalled: () => true }).get('claude').run(REQ({ provider: 'claude', cwd: process.cwd() })));

  const progress: number[] = [];
  let spawned: TurnProcess | undefined;
  const adapter = createProviderRegistry({ spawn: shSpawn, isInstalled: () => true, sessionOutput }).get('claude');
  const filed = await collect(adapter.run(REQ({ provider: 'claude', cwd: process.cwd() }), { sessionId: 's1', onProgress: (c) => progress.push(c.offset), onSpawn: (p) => (spawned = p) }));

  const strip = (evs: TurnEvent[]) => evs.map((e) => ({ ...e, turnId: '' }));
  assert.deepEqual(strip(filed), strip(piped), 'the same events from the session file as from the pipe');
  assert.equal(progress.length, 3, 'a position after each line before the terminal one');
  assert.ok(progress[0]! < progress[1]! && progress[1]! < progress[2]!, 'positions advance');
  assert.ok(spawned?.cursor !== undefined && spawned.cursor.sessionId === 's1', 'onSpawn hands over the segment start');
  assert.equal(spawned?.outPath, join(root, 's1.ndjson'));

  // The process outlives its answer; the turn-end marker follows its real exit.
  const file = join(root, 's1.ndjson');
  const turnId = filed[0]!.turnId;
  assert.doesNotMatch(readFileSync(file, 'utf8'), /"turn-end"/, 'not closed at the answer');
  await spawned!.exit;
  await waitFor(() => /"turn-end"/.test(readFileSync(file, 'utf8')));
  const all = readFileSync(file, 'utf8').trimEnd().split('\n');
  assert.match(all.at(-2)!, /"late"/, 'the late line is kept in the segment');
  assert.match(all.at(-1)!, new RegExp(`"insrc.marker":"turn-end","turnId":"${turnId}","code":0`), 'then the turn-end with the real exit code');
});

test('a beginTurn failure falls back to the pipe with one logged error', async () => {
  const errors: string[] = [];
  const outputs: unknown[] = [];
  const spawner = makeFakeSpawner({ lines: CLAUDE_TEXT_TURN });
  const spawn: SpawnFn = (cmd, args, opts) => {
    outputs.push(opts.output);
    return spawner.spawn(cmd, args, opts);
  };
  const broken = {
    beginTurn: async () => {
      throw new Error('disk full');
    },
    endTurn: async () => {},
    tail: async function* () {},
    errTail: () => '',
    remove: async () => {},
    sweep: async () => {},
  };
  const adapter = createProviderRegistry({ spawn, isInstalled: () => true, sessionOutput: broken, logger: { warn: () => {}, error: (m) => errors.push(m) } }).get('claude');
  const first = await collect(adapter.run(REQ({ provider: 'claude' }), { sessionId: 's1' }));
  const second = await collect(adapter.run(REQ({ provider: 'claude' }), { sessionId: 's1' }));
  assert.equal(first.at(-1)?.kind, 'done', 'the turn still runs, over the pipe');
  assert.equal(second.at(-1)?.kind, 'done');
  assert.deepEqual(outputs, [undefined, undefined], 'no session output was passed to the spawner');
  assert.equal(errors.length, 1, 'logged once');
  assert.match(errors[0]!, /session output unavailable \(disk full\)/);

  // Without a session id (title generation) or without a session output, the pipe is used silently.
  const plain = createProviderRegistry({ spawn, isInstalled: () => true, sessionOutput: broken }).get('claude');
  await collect(plain.run(REQ({ provider: 'claude' })));
  assert.equal(outputs.at(-1), undefined);
});

test('resume() from a saved offset yields only the later events, ends at the terminal event, and ends with an error when the process is gone without one', async () => {
  const root = join(mkdtempSync(join(tmpdir(), 'chat-out-')), 'chat-output');
  const sessionOutput = createSessionOutput({ root, pollMs: 5 });
  const adapter = createProviderRegistry({ spawn: makeFakeSpawner({ lines: [] }).spawn, isInstalled: () => true, sessionOutput, livenessPollMs: 5 }).get('claude');

  // A turn whose window reloaded after the first two lines were handled.
  const seg = await sessionOutput.beginTurn('s1', 'turn-1');
  appendFileSync(seg.outPath, `${CLAUDE_TEXT_TURN[0]}\n${CLAUDE_TEXT_TURN[1]}\n`);
  let saved = seg.cursor;
  let n = 0;
  for await (const { cursor } of sessionOutput.tail(seg.cursor, { finished: () => true })) {
    saved = cursor;
    if (++n === 2) break;
  }
  // The CLI (still this live process) goes on writing while the new window follows.
  const progress: number[] = [];
  const events: TurnEvent[] = [];
  const following = (async () => {
    for await (const ev of adapter.resume({ cursor: saved, pid: process.pid, startedAt: defaultProcessStartTime(process.pid) ?? null }, { onProgress: (c) => progress.push(c.offset) })) events.push(ev);
  })();
  await tick(20);
  appendFileSync(seg.outPath, `${CLAUDE_TEXT_TURN[2]}\n${CLAUDE_TEXT_TURN[3]}\n{"type":"after"}\n`);
  await following;
  assert.deepEqual(events.map((e) => e.kind), ['assistant-delta', 'done'], 'only the events after the saved cursor, ending at the terminal one');
  assert.equal((events[0] as { text: string }).text, 'world');
  assert.equal(events.every((e) => e.turnId === 'turn-1'), true);
  assert.equal(progress.length, 1, 'a position after the non-terminal line');

  // A turn whose process is gone without a terminal event.
  const seg2 = await sessionOutput.beginTurn('s1', 'turn-2');
  appendFileSync(seg2.outPath, `${CLAUDE_TEXT_TURN[0]}\n`);
  const gone: TurnEvent[] = [];
  for await (const ev of adapter.resume({ cursor: seg2.cursor, pid: 2 ** 22 + 77, startedAt: null })) gone.push(ev);
  assert.deepEqual(gone.map((e) => e.kind), ['status', 'error']);
  assert.match((gone[1] as { message: string }).message, /the turn ended without a result/);

  // A cursor whose generation is gone (rolled over past it) ends at once with nothing to resume.
  const lost: TurnEvent[] = [];
  for await (const ev of adapter.resume({ cursor: { ...seg2.cursor, generation: 99 }, pid: process.pid, startedAt: null })) lost.push(ev);
  assert.deepEqual(lost, [], 'nothing to resume, no hang');
});

test("resume()'s handed-over process stops the recorded pid's group only while its start time matches", async () => {
  const root = join(mkdtempSync(join(tmpdir(), 'chat-out-')), 'chat-output');
  const sessionOutput = createSessionOutput({ root, pollMs: 5 });
  const table = new Map<number, number>([[700, 5]]); // pid -> start time
  const signals: Array<[number, string]> = [];
  const deps: AdapterDeps = {
    spawn: makeFakeSpawner({ lines: [] }).spawn,
    isInstalled: () => true,
    sessionOutput,
    livenessPollMs: 5,
    stopGraceMs: 30,
    isAlive: (pid) => table.has(pid),
    processStartTime: (pid) => table.get(pid),
    killGroup: (pid, s) => {
      signals.push([pid, s]);
      table.delete(pid); // dies on SIGTERM
    },
  };
  const adapter = createProviderRegistry(deps).get('claude');
  const seg = await sessionOutput.beginTurn('s1', 't');
  const ctl = new AbortController();
  let handle: TurnProcess | undefined;
  const following = (async () => {
    for await (const _ of adapter.resume({ cursor: seg.cursor, pid: 700, startedAt: 5 }, { signal: ctl.signal, onAttach: (p) => (handle = p) })) void _;
  })();
  await waitFor(() => handle !== undefined);
  await handle!.stop();
  assert.deepEqual(signals, [[700, 'SIGTERM']], 'the recorded group was stopped');
  await following;

  // The pid now belongs to an unrelated process (different start time): never signalled.
  table.set(701, 9);
  signals.length = 0;
  let other: TurnProcess | undefined;
  const second = (async () => {
    for await (const _ of adapter.resume({ cursor: seg.cursor, pid: 701, startedAt: 5 }, { onAttach: (p) => (other = p) })) void _;
  })();
  await waitFor(() => other !== undefined);
  other!.kill('SIGKILL');
  await other!.stop();
  await second;
  assert.deepEqual(signals, [], 'a reused pid is never signalled');
});

// ---- ISSUE-65cb63f7: a prompt is never parsed as an option ------------------------

test('65cb63f7: a prompt starting with "-" or "--" reaches claude and codex verbatim, after the end-of-options marker', async () => {
  for (const prompt of ['- MED: openWithContent duplicates openAndGetContent.\n\n- MED: four copies.', '--resume not-a-flag', '-p']) {
    const cases: Array<{ provider: 'claude' | 'codex'; lines: unknown; resume?: SessionHandle; grant?: boolean }> = [
      { provider: 'claude', lines: CLAUDE_TEXT_TURN },
      { provider: 'claude', lines: CLAUDE_TEXT_TURN, resume: { provider: 'claude', nativeSessionId: 's1' } },
      { provider: 'claude', lines: CLAUDE_TEXT_TURN, grant: true },
      { provider: 'codex', lines: CODEX_TEXT_TURN },
      { provider: 'codex', lines: CODEX_TEXT_TURN, resume: { provider: 'codex', nativeSessionId: 's1' } },
    ];
    for (const c of cases) {
      const { deps, spawner } = depsFor(c.lines as never);
      await collect(createProviderRegistry(deps).get(c.provider).run(REQ({
        provider: c.provider, prompt,
        ...(c.resume !== undefined ? { resume: c.resume } : {}),
        ...(c.grant === true ? { permissionMode: 'manual' as const, allowedTools: ['Write'] } : {}),
      })));
      const args = spawner.calls[0]!.args;
      const label = `${c.provider}${c.resume ? ' resume' : ''}${c.grant ? ' grant' : ''}: ${JSON.stringify(prompt.slice(0, 12))}`;
      assert.equal(args[args.length - 1], prompt, `${label} — the prompt is the last argument, unchanged`);
      assert.equal(args[args.length - 2], '--', `${label} — directly after the end-of-options marker`);
      assert.equal(args.indexOf('--'), args.length - 2, `${label} — the only marker, so every flag precedes it`);
    }
  }
});

// ---- ISSUE-6a811b8a: where an approval request is answered ------------------------

test("claude permission_denied emits resolution 'turn-ended'; control-protocol and codex approval requests emit resolution 'in-turn'", async () => {
  const denied = JSON.stringify({ type: 'system', subtype: 'permission_denied', tool_name: 'Write', tool_use_id: 'toolu_res_1', message: 'Write needs your permission' });
  const { deps: d1 } = depsFor({ lines: [denied, JSON.stringify({ type: 'result', is_error: false })] });
  const turnEnded = apprOf(await collect(createProviderRegistry(d1).get('claude').run(REQ({ provider: 'claude', permissionMode: 'manual' }))));
  assert.equal(turnEnded?.resolution, 'turn-ended', 'claude refused and ended the turn');

  const { deps: d2 } = depsFor({ lines: CLAUDE_PERMISSION_TURN });
  const control = apprOf(await collect(createProviderRegistry(d2).get('claude').run(REQ({ provider: 'claude', permissionMode: 'manual' }))));
  assert.equal(control?.resolution, 'in-turn', 'a control-protocol request waits inside the turn');
  assert.equal(control?.toolName, 'Bash', 'and it carries a toolName, so toolName cannot tell the two apart');

  const { deps: d3 } = depsFor({ lines: CODEX_PERMISSION_TURN });
  const codex = apprOf(await collect(createProviderRegistry(d3).get('codex').run(REQ({ provider: 'codex', permissionMode: 'manual' }))));
  assert.equal(codex?.resolution, 'in-turn', 'a codex approval waits inside the turn');
});

// ---- Story E2026101259da3204:S001 t2: readDirs -> claude --add-dir ---------------

test('claude argv: readDirs adds --add-dir with each directory before the permission flags and the prompt stays last after --; without readDirs the argv is byte-identical to today', async () => {
  const argv = async (over: Partial<TurnRequest>): Promise<readonly string[]> => {
    const { deps, spawner } = depsFor(CLAUDE_TEXT_TURN);
    await collect(createProviderRegistry(deps).get('claude').run(REQ({ provider: 'claude', ...over })));
    return spawner.calls[0]!.args;
  };
  const base = ['-p', '--output-format=stream-json', '--verbose'];
  const resume = { provider: 'claude' as const, nativeSessionId: 'sess-1' };
  const dirs = ['/home/u/.insrc/chat-attachments/s1', '/other dir'];

  // With readDirs: after --resume, before every permission flag, and the prompt is still last.
  assert.deepEqual(await argv({ readDirs: [dirs[0]!] }), [...base, '--add-dir', dirs[0]!, '--', 'hi']);
  assert.deepEqual(await argv({ readDirs: dirs, resume, permissionMode: 'edit-auto', allowedTools: ['Bash', 'Read'] }), [
    ...base,
    '--resume',
    'sess-1',
    '--add-dir',
    ...dirs,
    '--permission-mode',
    'acceptEdits',
    '--permission-prompts',
    'host',
    '--allowedTools',
    'Bash',
    'Read',
    '--',
    'hi',
  ]);
  for (const permissionMode of ['manual', 'edit-auto', 'auto'] as const) {
    const args = await argv({ readDirs: dirs, permissionMode, allowedTools: ['Bash'] });
    const at = args.indexOf('--add-dir');
    assert.deepEqual(args.slice(at, at + 3), ['--add-dir', ...dirs]);
    for (const flag of ['--permission-mode', '--permission-prompts', '--allowedTools']) {
      if (args.includes(flag)) assert.ok(at < args.indexOf(flag), `--add-dir comes before ${flag}`);
    }
    assert.deepEqual(args.slice(-2), ['--', 'hi']);
  }

  // Without readDirs (absent or empty) the argv is exactly what it was, in every combination.
  const today: Array<[Partial<TurnRequest>, string[]]> = [
    [{}, [...base, '--', 'hi']],
    [{ resume }, [...base, '--resume', 'sess-1', '--', 'hi']],
    [{ permissionMode: 'manual' }, [...base, '--permission-prompts', 'host', '--', 'hi']],
    [{ permissionMode: 'edit-auto' }, [...base, '--permission-mode', 'acceptEdits', '--permission-prompts', 'host', '--', 'hi']],
    [{ permissionMode: 'auto' }, [...base, '--permission-mode', 'bypassPermissions', '--', 'hi']],
    [{ resume, permissionMode: 'manual', allowedTools: ['Bash'] }, [...base, '--resume', 'sess-1', '--permission-prompts', 'host', '--allowedTools', 'Bash', '--', 'hi']],
  ];
  for (const [over, expected] of today) {
    assert.deepEqual(await argv(over), expected);
    assert.deepEqual(await argv({ ...over, readDirs: [] }), expected);
  }
});

test('codex argv is unchanged by readDirs', async () => {
  const argv = async (over: Partial<TurnRequest>): Promise<readonly string[]> => {
    const { deps, spawner } = depsFor(CODEX_TEXT_TURN);
    await collect(createProviderRegistry(deps).get('codex').run(REQ({ provider: 'codex', ...over })));
    return spawner.calls[0]!.args;
  };
  const resume = { provider: 'codex' as const, nativeSessionId: 'thread-1' };
  const readDirs = ['/home/u/.insrc/chat-attachments/s1'];
  for (const over of [{}, { resume }, { permissionMode: 'manual' as const }, { permissionMode: 'auto' as const }, { resume, permissionMode: 'auto' as const }]) {
    const without = await argv(over);
    assert.deepEqual(await argv({ ...over, readDirs }), without);
    assert.ok(!without.includes('--add-dir'));
  }
  assert.deepEqual(await argv({ readDirs }), ['exec', '--json', '--', 'hi']);
});

// ---- ISSUE-2284d9b4: codex is started with its input closed ----

test('codex is started with no input stream and claude keeps its input open; a decision for codex is reported as undeliverable and written nowhere', async () => {
  // codex: the spawn asks for a closed input, on a fresh turn and on a resumed one.
  for (const over of [{}, { resume: { provider: 'codex' as const, nativeSessionId: 'thread-1' } }]) {
    const { deps, spawner } = depsFor(CODEX_TEXT_TURN);
    await collect(createProviderRegistry(deps).get('codex').run(REQ({ provider: 'codex', ...over })));
    assert.equal(spawner.calls[0]!.closeInput, true);
  }
  // claude: nothing changes; its decision relay writes to the input.
  {
    const { deps, spawner } = depsFor(CLAUDE_TEXT_TURN);
    await collect(createProviderRegistry(deps).get('claude').run(REQ({ provider: 'claude', permissionMode: 'manual' })));
    assert.ok(!('closeInput' in spawner.calls[0]!), 'claude is started as before');
  }
  // A codex approval request can be shown, but its answer cannot be written to the process.
  const { deps, spawner, warns } = depsFor({ lines: CODEX_PERMISSION_TURN, hangUntilKilled: true });
  const adapter = createProviderRegistry(deps).get('codex');
  let asked = false;
  for await (const ev of adapter.run(REQ({ provider: 'codex', permissionMode: 'manual' }))) {
    if (ev.kind !== 'approval-request') continue;
    asked = true;
    adapter.decide(ev.turnId, ev.requestId, 'approve');
    adapter.decide(ev.turnId, ev.requestId, 'approve'); // a second click is a no-op
    await adapter.cancel(ev.turnId);
  }
  assert.ok(asked, 'the fixture raised an approval request');
  assert.deepEqual(spawner.procs[0]!.writes(), [], 'nothing is written to a process started without an input');
  assert.equal(warns.filter((w) => /\[chat:codex\] permission decision for .* undeliverable/.test(w)).length, 1);
});

test('the real spawner with closeInput starts a process that reads its input to the end at once; without it the process waits', async (t) => {
  if (process.platform === 'win32') return t.diagnostic('uses sh');
  // Like `codex exec`: read all input first, then answer.
  const script = `cat >/dev/null; echo '{"answered":true}'`;
  const closed = nodeSpawner('sh', ['-c', script], { cwd: process.cwd(), closeInput: true });
  assert.equal(await closed.spawnError, undefined);
  const lines: string[] = [];
  for await (const l of closed.lines()) lines.push(l);
  assert.deepEqual(lines, ['{"answered":true}']);
  assert.equal((await closed.exit).code, 0);
  // A write to a process with no input does nothing and does not throw.
  assert.doesNotThrow(() => closed.write?.('late\n'));

  // With the input left open the same process is still waiting, which is the defect.
  const open = nodeSpawner('sh', ['-c', script], { cwd: process.cwd() });
  assert.equal(await open.spawnError, undefined);
  const outcome = await Promise.race([open.exit.then(() => 'exited'), tick(300).then(() => 'waiting')]);
  assert.equal(outcome, 'waiting');
  open.kill('SIGKILL');
  await open.exit;
});

// Story E20261013b2e8109f:S001 / t3 — which edit a result answers, and each file a codex patch changed.

test("claude adapter: the result of an Edit or Write call carries editPath, and isError when the block reports an error; a command's result carries neither", async () => {
  const use = (id: string, name: string, input: Record<string, unknown>): string =>
    JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', id, name, input }] } });
  const result = (id: string, content: string, isError?: boolean): string =>
    JSON.stringify({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: id, content, ...(isError ? { is_error: true } : {}) }] } });
  const lines = [
    JSON.stringify({ type: 'system', subtype: 'init', session_id: 's1' }),
    use('e1', 'Edit', { file_path: '/repo/a.ts', old_string: 'a', new_string: 'b' }),
    result('e1', 'The file /repo/a.ts has been updated.'),
    use('w1', 'Write', { file_path: '/repo/new.ts', content: 'x' }),
    result('w1', 'File created successfully'),
    use('e2', 'Edit', { file_path: '/repo/b.ts', old_string: 'nope', new_string: 'y' }),
    result('e2', 'String to replace not found in file.', true),
    use('b1', 'Bash', { command: 'false' }),
    result('b1', 'exit 1', true),
    use('b2', 'Bash', { command: 'true' }),
    result('b2', ''),
    JSON.stringify({ type: 'result', is_error: false }),
  ];
  const { deps } = depsFor({ lines });
  const events = await collect(createProviderRegistry(deps).get('claude').run(REQ({ provider: 'claude' })));
  const results = events.filter((e): e is Extract<TurnEvent, { kind: 'tool-result' }> => e.kind === 'tool-result');
  assert.deepEqual(results.map((r) => [r.callId, r.editPath, r.isError, r.command]), [
    ['e1', '/repo/a.ts', undefined, undefined],
    ['w1', '/repo/new.ts', undefined, undefined],
    ['e2', '/repo/b.ts', true, undefined],
    ['b1', undefined, true, 'false'],
    ['b2', undefined, undefined, 'true'],
  ]);
  // The fields are left out, not set to undefined or false.
  assert.equal('editPath' in results[4]!, false);
  assert.equal('isError' in results[0]!, false);
});

test("codex adapter: a file_change item emits one applied file-edit event per changed file, one for a bare path, and '(unknown)' when it names none; a claude edit's event has no applied", async () => {
  const edits = async (provider: ProviderId, lines: string[]): Promise<Array<[string, true | undefined]>> => {
    const { deps } = depsFor({ lines });
    const events = await collect(createProviderRegistry(deps).get(provider).run(REQ({ provider })));
    return events.filter((e): e is Extract<TurnEvent, { kind: 'file-edit' }> => e.kind === 'file-edit').map((e) => [e.path, e.applied]);
  };
  const done = JSON.stringify({ type: 'turn.completed' });
  const item = (over: Record<string, unknown>): string => JSON.stringify({ type: 'item.completed', item: { id: 'i1', type: 'file_change', ...over } });

  // The item a real codex 0.162.1 printed for a patch of two files (recorded 2026-10-13).
  const recorded = readFileSync(fileURLToPath(new URL('./codex-file-change-item.json', import.meta.url)), 'utf8');
  assert.deepEqual(await edits('codex', [JSON.stringify(JSON.parse(recorded)), done]), [
    ['/tmp/insrc-codexprobe.nLSExA/a.txt', true],
    ['/tmp/insrc-codexprobe.nLSExA/b.txt', true],
  ]);
  // The older shape: one path on the item.
  assert.deepEqual(await edits('codex', [item({ path: 'src/a.ts' }), done]), [['src/a.ts', true]]);
  // No file named: one event with the placeholder, as before.
  assert.deepEqual(await edits('codex', [item({}), done]), [['(unknown)', true]]);
  assert.deepEqual(await edits('codex', [item({ changes: [{ kind: 'update' }, null] }), done]), [['(unknown)', true]]);
  // A failed patch did not change the files: no applied.
  assert.deepEqual(await edits('codex', [item({ status: 'failed', changes: [{ path: 'x.ts', kind: 'update' }] }), done]), [['x.ts', undefined]]);

  // A claude edit's event is emitted when the call is made: never applied.
  const claude = [
    JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'e1', name: 'Edit', input: { file_path: '/repo/a.ts', old_string: 'a', new_string: 'b' } }] } }),
    JSON.stringify({ type: 'result', is_error: false }),
  ];
  assert.deepEqual(await edits('claude', claude), [['/repo/a.ts', undefined]]);
});

// Epic E20261014613abdb3 Story S004 t3 — the provider's error text rides on done(ok:false).
test('a claude result with is_error carries its text on done ok:false, a codex error result does too, and a successful result has no message', async () => {
  // claude, live: the result text of an is_error result.
  const claudeFail = [
    JSON.stringify({ type: 'system', subtype: 'init', session_id: 'sess-f' }),
    JSON.stringify({ type: 'result', subtype: 'success', is_error: true, result: 'API Error: 529 {"type":"overloaded_error"}', session_id: 'sess-f' }),
  ];
  const c = await collect(createProviderRegistry(depsFor({ lines: claudeFail }).deps).get('claude').run(REQ({ provider: 'claude' })));
  const cd = c.at(-1) as { kind: string; ok: boolean; message?: string; sessionId?: string };
  assert.equal(cd.kind, 'done');
  assert.equal(cd.ok, false);
  assert.equal(cd.message, 'API Error: 529 {"type":"overloaded_error"}');
  assert.equal(cd.sessionId, 'sess-f', 'the native session id is still carried');

  // claude with no text (error_max_turns): ok:false and no message.
  const bare = await collect(createProviderRegistry(depsFor({ lines: CLAUDE_ERROR_TURN }).deps).get('claude').run(REQ({ provider: 'claude' })));
  assert.equal((bare.at(-1) as { ok: boolean }).ok, false);
  assert.equal('message' in (bare.at(-1) as object), false, 'no invented text');

  // codex: an error object, an error string and a result text each give the message.
  for (const [lineObj, want] of [
    [{ type: 'turn.completed', error: { message: 'rate limit exceeded' } }, 'rate limit exceeded'],
    [{ type: 'turn.completed', error: 'upstream overloaded' }, 'upstream overloaded'],
    [{ type: 'result', is_error: true, result: 'connection closed mid-response' }, 'connection closed mid-response'],
  ] as const) {
    const ev = await collect(createProviderRegistry(depsFor({ lines: [JSON.stringify(lineObj)] }).deps).get('codex').run(REQ({ provider: 'codex' })));
    const d = ev.at(-1) as { kind: string; ok: boolean; message?: string };
    assert.equal(d.kind, 'done');
    assert.equal(d.ok, false);
    assert.equal(d.message, want);
  }

  // A successful result of either provider has no message.
  const okClaude = await collect(createProviderRegistry(depsFor({ lines: CLAUDE_TEXT_TURN }).deps).get('claude').run(REQ({ provider: 'claude' })));
  assert.equal((okClaude.at(-1) as { ok: boolean }).ok, true);
  assert.equal('message' in (okClaude.at(-1) as object), false);
  const okCodex = await collect(createProviderRegistry(depsFor({ lines: CODEX_TEXT_TURN }).deps).get('codex').run(REQ({ provider: 'codex' })));
  assert.equal('message' in (okCodex.at(-1) as object), false);

  // The resumed path (a window that reloaded) carries it too.
  const root = join(mkdtempSync(join(tmpdir(), 'chat-out-')), 'chat-output');
  const sessionOutput = createSessionOutput({ root, pollMs: 5 });
  const adapter = createProviderRegistry({ spawn: makeFakeSpawner({ lines: [] }).spawn, isInstalled: () => true, sessionOutput, livenessPollMs: 5 }).get('claude');
  const seg = await sessionOutput.beginTurn('s9', 'turn-9');
  appendFileSync(seg.outPath, `${claudeFail[0]}\n${claudeFail[1]}\n`);
  const resumed: TurnEvent[] = [];
  for await (const ev of adapter.resume({ cursor: seg.cursor, pid: process.pid, startedAt: defaultProcessStartTime(process.pid) ?? null })) resumed.push(ev);
  const rd = resumed.at(-1) as { kind: string; ok: boolean; message?: string };
  assert.equal(rd.kind, 'done');
  assert.equal(rd.ok, false);
  assert.equal(rd.message, 'API Error: 529 {"type":"overloaded_error"}');
});

// ---- run config: model/effort in argv per provider + vibe env pin ------------

test('run config: claude gets --model/--effort; codex -m/-c model_reasoning_effort=; vibe pins via env (no effort flag)', async () => {
  {
    const { deps, spawner } = depsFor({ lines: CLAUDE_TEXT_TURN });
    await collect(createProviderRegistry(deps).get('claude').run(REQ({ provider: 'claude', model: 'opus', effort: 'high' })));
    assert.deepEqual(spawner.calls[0]!.args, ['-p', '--output-format=stream-json', '--verbose', '--model', 'opus', '--effort', 'high', '--', 'hi']);
  }
  {
    const { deps, spawner } = depsFor({ lines: CODEX_TEXT_TURN });
    await collect(createProviderRegistry(deps).get('codex').run(REQ({ provider: 'codex', model: 'gpt-6-astra', effort: 'ultra' })));
    assert.deepEqual(spawner.calls[0]!.args, ['exec', '--json', '-m', 'gpt-6-astra', '-c', 'model_reasoning_effort=ultra', '--', 'hi']);
  }
  {
    // vibe: model via VIBE_ACTIVE_MODEL in the spawn env; effort not forwardable.
    const { deps, spawner } = depsFor({ lines: VIBE_TEXT_TURN }, ['vibe']);
    await collect(createProviderRegistry(deps).get('vibe').run(REQ({ provider: 'vibe', model: 'glm-5-3', effort: 'max' })));
    assert.deepEqual(spawner.calls[0]!.args, ['-p', '--output', 'streaming', '--', 'hi'], 'no --model/--effort flags for vibe');
    const env = spawner.calls[0]!.env;
    assert.equal(env?.['VIBE_ACTIVE_MODEL'], 'glm-5-3', 'the model is pinned via env');
  }
  {
    // absent run config → byte-identical argv to before (k2)
    const { deps, spawner } = depsFor({ lines: CLAUDE_TEXT_TURN });
    await collect(createProviderRegistry(deps).get('claude').run(REQ({ provider: 'claude' })));
    assert.deepEqual(spawner.calls[0]!.args, ['-p', '--output-format=stream-json', '--verbose', '--', 'hi']);
  }
});
