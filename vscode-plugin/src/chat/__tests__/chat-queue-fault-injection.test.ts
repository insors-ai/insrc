// Epic E20261014613abdb3 Story S004 t8 — FAULT INJECTION, not the live hand check.
// The real claude adapter runs over a scripted fake CLI that prints an overload result, through the
// chat host, the worker and the real SQLite queue. It shows the wiring end to end; it does NOT show
// that a real provider's failure text matches the classifier.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createChatPanelHost, type ChatPanelChannel } from '../chat-panel.js';
import { createInMemoryChatSessionStore } from '../session-store.js';
import { createProviderRegistry } from '../cli-adapter.js';
import { createChatQueueStore, type SqliteDatabase } from '../chat-queue-store.js';
import { createChatQueueWorker } from '../chat-queue-worker.js';
import { RETRY_DELAYS_MS } from '../chat-failure.js';
import { CLAUDE_TEXT_TURN, makeFakeSpawner, waitFor, type FakeProcScript } from './fixtures.js';

const overload = JSON.stringify({ type: 'result', subtype: 'error_during_execution', is_error: true, result: 'API Error: 529 {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}', session_id: 'sess-x' });
const init = JSON.stringify({ type: 'system', subtype: 'init', session_id: 'sess-x' });
const edit = JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Edit', input: { file_path: '/repo/a.ts', old_string: 'a', new_string: 'b' } }] }, session_id: 'sess-x' });

function setup(scripts: FakeProcScript[]) {
  const dir = mkdtempSync(join(tmpdir(), 'insrc-fault-'));
  const clock = { t: Date.now() };
  const store = createChatQueueStore({ path: join(dir, 'q.sqlite'), openDatabase: (p) => new DatabaseSync(p) as unknown as SqliteDatabase, now: () => clock.t, pluginVersion: 't' });
  const spawner = makeFakeSpawner(scripts);
  const providers = createProviderRegistry({ spawn: spawner.spawn, isInstalled: (id) => id === 'claude', logger: { warn: () => {}, error: () => {} } });
  const sessions = createInMemoryChatSessionStore();
  const posted: Array<{ payload: { type: string; [k: string]: unknown } }> = [];
  let onMsg: ((m: unknown) => void) | undefined;
  const channel: ChatPanelChannel = { setHtml: () => {}, postMessage: (m) => void posted.push(m as never), onMessage: (l) => { onMsg = l; }, onDidDispose: () => {}, reveal: () => {}, dispose: () => {} };
  let worker: ReturnType<typeof createChatQueueWorker> | undefined;
  const host = createChatPanelHost({
    createPanel: () => channel, providers, store: sessions, cwd: () => '/repo',
    queue: (runner) => (worker = createChatQueueWorker({ store, claim: { windowKey: 'w', pid: process.pid }, runner, isAlive: () => false, now: () => clock.t })),
  });
  host.open();
  onMsg?.({ v: 1, payload: { type: 'ready' } });
  const session = sessions.create('claude');
  sessions.save(session);
  return {
    clock, store, spawner, sessions, session, worker: () => worker!,
    done: () => { host.dispose(); store.close(); rmSync(dir, { recursive: true, force: true }); },
  };
}

test('FAULT INJECTION: an overload result before any tool call waits as retrying, runs again when due, and ends done with one user row and the retrying line stored; retry-now runs it at once; an overload after an edit stays failed', async () => {
  // A: overload (no tool call), then success when retried.
  const a = setup([{ lines: [init, overload] }, { lines: CLAUDE_TEXT_TURN }]);
  try {
    assert.ok(a.worker().submit({ sessionId: a.session.id, text: 'do it', origin: 'typed', attachments: [] }).ok);
    await waitFor(() => a.store.list().some((m) => m.state === 'retrying'), 4000);
    const row = a.store.list().find((m) => m.state === 'retrying')!;
    assert.equal(row.attempts, 1);
    assert.match(row.error ?? '', /overloaded/);
    assert.equal(a.spawner.calls.length, 1, 'not run again before it is due');
    a.clock.t += RETRY_DELAYS_MS[0]! + 1;
    await waitFor(() => a.spawner.calls.length === 2, 4000);
    await waitFor(() => a.store.list().length === 0, 4000);
    const t = a.sessions.get(a.session.id)!.transcript;
    assert.equal(t.filter((r) => r.role === 'user').length, 1, 'a single user row');
    assert.ok(t.some((r) => r.role === 'assistant' && /the turn failed with overloaded; retrying \(attempt 1 of 3\)/.test(r.text)), 'the retrying line is stored');
  } finally {
    a.done();
  }

  // B: retry-now runs a retrying row at once, without moving the clock.
  const b = setup([{ lines: [init, overload] }, { lines: CLAUDE_TEXT_TURN }]);
  try {
    assert.ok(b.worker().submit({ sessionId: b.session.id, text: 'again', origin: 'typed', attachments: [] }).ok);
    await waitFor(() => b.store.list().some((m) => m.state === 'retrying'), 4000);
    assert.deepEqual(b.worker().act(b.store.list()[0]!.seq, 'retry-now'), { ok: true });
    await waitFor(() => b.spawner.calls.length === 2, 4000);
  } finally {
    b.done();
  }

  // C: an edit before the overload: never retried.
  const c = setup([{ lines: [init, edit, overload] }, { lines: CLAUDE_TEXT_TURN }]);
  try {
    assert.ok(c.worker().submit({ sessionId: c.session.id, text: 'edit it', origin: 'typed', attachments: [] }).ok);
    await waitFor(() => c.store.list().some((m) => m.state === 'failed'), 4000);
    assert.equal(c.store.list().find((m) => m.state === 'failed')?.attempts, 0);
    c.clock.t += RETRY_DELAYS_MS[0]! + 1000;
    await new Promise((r) => setTimeout(r, 700));
    assert.equal(c.spawner.calls.length, 1, 'never run again');
  } finally {
    c.done();
  }
});
