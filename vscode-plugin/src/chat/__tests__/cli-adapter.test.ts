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
import { createProviderRegistry } from '../cli-adapter.js';
import type { AdapterDeps, ProviderId, TurnRequest, SessionHandle, SpawnedProcess, SpawnFn } from '../cli-adapter.js';
import type { TurnEvent } from '../stream-events.js';
import {
  makeFakeSpawner,
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

// ---- deriveChatTitle (LLM chat titling, option 1) ------------------------------

import { deriveChatTitle } from '../cli-adapter.js';
import type { StreamAdapter, ProviderRegistry } from '../cli-adapter.js';

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

test('S004 t4: claude buildArgs — undefined is byte-identical to today; review/auto add the right flag only', async () => {
  // undefined: no permission flag (k2 — byte-identical to today's argv).
  {
    const { deps, spawner } = depsFor(CLAUDE_TEXT_TURN);
    await collect(createProviderRegistry(deps).get('claude').run(REQ({ provider: 'claude' })));
    assert.deepEqual(spawner.calls[0]!.args, ['-p', 'hi', '--output-format=stream-json', '--verbose']);
  }
  // review: host answers prompts, never a bypass flag.
  {
    const { deps, spawner } = depsFor(CLAUDE_TEXT_TURN);
    await collect(createProviderRegistry(deps).get('claude').run(REQ({ provider: 'claude', permissionMode: 'review' })));
    const args = spawner.calls[0]!.args;
    assert.deepEqual(args, ['-p', 'hi', '--output-format=stream-json', '--verbose', '--permission-prompts', 'host']);
    assert.ok(!args.includes('bypassPermissions'), 'review never bypasses');
  }
  // auto: bypass, never a host-answered flag.
  {
    const { deps, spawner } = depsFor(CLAUDE_TEXT_TURN);
    await collect(createProviderRegistry(deps).get('claude').run(REQ({ provider: 'claude', permissionMode: 'auto' })));
    const args = spawner.calls[0]!.args;
    assert.deepEqual(args, ['-p', 'hi', '--output-format=stream-json', '--verbose', '--permission-mode', 'bypassPermissions']);
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
    await collect(createProviderRegistry(deps).get('codex').run(REQ({ provider: 'codex', permissionMode: 'review' })));
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
  const events = await collect(createProviderRegistry(deps).get('claude').run(REQ({ provider: 'claude', permissionMode: 'review' })));
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
  const events = await collect(createProviderRegistry(deps).get('codex').run(REQ({ provider: 'codex', permissionMode: 'review' })));
  const apprs = events.filter((e) => e.kind === 'approval-request');
  assert.equal(apprs.length, 1);
  const ev = apprs[0]!;
  if (ev.kind === 'approval-request') {
    assert.equal(ev.requestId, 'perm-codex-1');
    assert.equal(ev.detail, 'git push');
  }
});

test('S004 t5: an idless permission line yields no approval-request (normalizer -> null -> [])', async () => {
  const { deps } = depsFor({ lines: CLAUDE_PERMISSION_IDLESS });
  const events = await collect(createProviderRegistry(deps).get('claude').run(REQ({ provider: 'claude', permissionMode: 'review' })));
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
  const it = adapter.run(REQ({ provider: providerId, permissionMode: 'review' }))[Symbol.asyncIterator]();
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
