/**
 * Story E20260925edb76e2e:S003 / t1 + t5 — sc4 session-store unit suite.
 *
 * Run: npx tsx --test vscode-plugin/src/chat/__tests__/session-store.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createMementoChatSessionStore,
  createInMemoryChatSessionStore,
  type MementoLike,
} from '../session-store.js';

function fakeMemento(): { memento: MementoLike; map: Map<string, unknown>; keys: () => string[] } {
  const map = new Map<string, unknown>();
  return {
    map,
    keys: () => [...map.keys()],
    memento: {
      get<T>(key: string): T | undefined {
        return map.get(key) as T | undefined;
      },
      update(key: string, value: unknown): void {
        map.set(key, value);
      },
    },
  };
}

const fixed = { now: () => '2026-01-01T00:00:00.000Z', genId: (() => { let n = 0; return () => `id-${++n}`; })() };

test('round-trip: create/append/save then get/list reflect it', () => {
  const store = createInMemoryChatSessionStore({ now: () => '2026-01-01T00:00:00.000Z', genId: (() => { let n = 0; return () => `id-${++n}`; })() });
  const s = store.create('claude');
  assert.equal(s.provider, 'claude');
  assert.equal(s.editMode, 'auto');
  assert.deepEqual(s.transcript, []);
  store.append(s.id, { role: 'user', text: 'hi', at: '2026-01-01T00:00:01.000Z' });
  const got = store.get(s.id);
  assert.equal(got?.transcript.length, 1);
  assert.equal(got?.transcript[0]?.text, 'hi');
  const list = store.list();
  assert.equal(list.length, 1);
  assert.equal(list[0]?.id, s.id);
  assert.equal(list[0]?.updatedAt, '2026-01-01T00:00:01.000Z');
});

test('corrupt/missing entry degrades to undefined / [] (no throw)', () => {
  const f = fakeMemento();
  const store = createMementoChatSessionStore(f);
  // A malformed session object under a session key + a non-array index.
  f.map.set('insrc.chat.session.bad', { not: 'a session' });
  f.map.set('insrc.chat.index', 'not-an-array');
  assert.equal(store.get('bad'), undefined);
  assert.doesNotThrow(() => store.list());
  assert.deepEqual(store.list(), []);
  assert.equal(store.get('missing'), undefined);
});

test('append to a missing session is a no-op (never throws)', () => {
  const store = createInMemoryChatSessionStore();
  assert.doesNotThrow(() => store.append('nope', { role: 'user', text: 'x', at: 'now' }));
});

test('k3: writes go ONLY to the injected memento, under the insrc.chat.* namespace', () => {
  const f = fakeMemento();
  const store = createMementoChatSessionStore({ ...f, ...fixed });
  const s = store.create('codex');
  store.append(s.id, { role: 'assistant', text: 'ok', at: 'now' });
  for (const k of f.keys()) assert.ok(k.startsWith('insrc.chat.'), `key ${k} is under insrc.chat.*`);
  assert.ok(f.keys().includes('insrc.chat.index'));
});

test('list sorts by updatedAt descending', () => {
  const store = createInMemoryChatSessionStore({ genId: (() => { let n = 0; return () => `id-${++n}`; })() });
  const a = store.create('claude');
  const b = store.create('claude');
  store.append(a.id, { role: 'user', text: 'first', at: '2026-01-01T00:00:05.000Z' });
  store.append(b.id, { role: 'user', text: 'later', at: '2026-01-01T00:00:09.000Z' });
  const ids = store.list().map((c) => c.id);
  assert.deepEqual(ids, [b.id, a.id]);
});
