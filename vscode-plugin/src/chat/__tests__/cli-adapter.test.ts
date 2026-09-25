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
import type { AdapterDeps, ProviderId, TurnRequest, SessionHandle } from '../cli-adapter.js';
import type { TurnEvent } from '../stream-events.js';
import {
  makeFakeSpawner,
  CLAUDE_TEXT_TURN,
  CLAUDE_TOOL_TURN,
  CLAUDE_ERROR_TURN,
  CODEX_TEXT_TURN,
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
