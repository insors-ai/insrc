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

test('draft(): an in-memory session NOT persisted until saved (no empty chats in history)', () => {
  const store = createInMemoryChatSessionStore({ now: () => '2026-01-01T00:00:00.000Z', genId: (() => { let n = 0; return () => `id-${++n}`; })() });
  const d = store.draft('claude');
  assert.equal(d.provider, 'claude');
  assert.deepEqual(d.transcript, []);
  assert.equal(store.list().length, 0, 'a draft is not in the store/history yet');
  assert.equal(store.get(d.id), undefined, 'a draft is not retrievable until saved');
  // It enters the store only once it has content and is saved (mirrors the first chat turn).
  d.transcript.push({ role: 'user', text: 'hi', at: '2026-01-01T00:00:01.000Z' });
  store.save(d);
  assert.equal(store.list().length, 1, 'saved once it has a message');
  assert.equal(store.get(d.id)?.transcript.length, 1);
});

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

// ---- S005: bounded index (maxSessions) + title round-trip ----

const seqId = () => { let n = 0; return () => `id-${++n}`; };

test('S005: save() with maxSessions=N keeps at most N; oldest evicted, blob gone', () => {
  const f = fakeMemento();
  const store = createMementoChatSessionStore({ ...f, maxSessions: 2, now: () => 't', genId: seqId() });
  const s1 = store.create('claude'); // id-1
  const s2 = store.create('claude'); // id-2
  const s3 = store.create('claude'); // id-3 -> evicts s1 (oldest)
  assert.equal(store.list().length, 2, 'index capped at 2');
  assert.deepEqual(store.list().map((c) => c.id).sort(), [s2.id, s3.id].sort());
  assert.equal(store.get(s1.id), undefined, 'oldest session evicted');
  assert.equal(f.map.get('insrc.chat.session.' + s1.id), undefined, 'no live orphan blob for the evicted id');
});

test('S005: eviction never removes the id being saved / active session even when oldest', () => {
  const f = fakeMemento();
  const store = createMementoChatSessionStore({ ...f, maxSessions: 2, now: () => 't', genId: seqId() });
  const s1 = store.create('claude'); // id-1
  const s2 = store.create('claude'); // id-2
  store.save(s1); // active use of the oldest -> moves it to most-recent
  const s3 = store.create('claude'); // now the oldest is s2, not s1
  assert.equal(store.get(s1.id)?.id, s1.id, 's1 survived because it was just saved');
  assert.equal(store.get(s2.id), undefined, 's2 evicted as the true oldest');
  assert.ok(store.get(s3.id), 's3 (just saved) survives');
});

test('S005: unset maxSessions preserves the unbounded S003 behaviour', () => {
  const store = createInMemoryChatSessionStore({ genId: seqId() });
  for (let i = 0; i < 5; i++) store.create('claude');
  assert.equal(store.list().length, 5, 'no eviction when maxSessions is unset');
});

test('S005: an updated (first-prompt) title round-trips through get()/list()', () => {
  const store = createInMemoryChatSessionStore({ genId: seqId() });
  const s = store.create('claude');
  assert.equal(s.title, 'new chat', 'create default');
  s.title = 'fix the parser';
  store.save(s);
  assert.equal(store.get(s.id)?.title, 'fix the parser');
  assert.equal(store.list()[0]?.title, 'fix the parser', 'ChatSummary.title reflects the update');
});

test('S005: maxSessions <= 0 is treated as unbounded (never wipes the active session)', () => {
  const store = createInMemoryChatSessionStore({ genId: seqId(), maxSessions: 0 });
  const s1 = store.create('claude');
  const s2 = store.create('claude');
  assert.equal(store.list().length, 2, 'no eviction with a non-positive cap');
  assert.ok(store.get(s1.id) && store.get(s2.id), 'both sessions survive');
});

// ---- S008: marker cssClass round-trip + backward-compat (ac2/ac3) ----

test('S008: a marker row cssClass round-trips through append/save -> get() (ac2)', () => {
  const f = fakeMemento();
  const store = createMementoChatSessionStore({ ...f, now: () => 't', genId: seqId() });
  const s = store.create('claude');
  store.append(s.id, { role: 'marker', text: 'done', cssClass: 'insrc-term__marker--done', at: 't' });
  const row = store.get(s.id)?.transcript[0];
  assert.equal(row?.role, 'marker');
  assert.equal(row?.text, 'done');
  assert.equal(row?.cssClass, 'insrc-term__marker--done', 'the sc1 class survived the memento round-trip');
});

test('S008: an older session whose marker rows lack cssClass still validates + restores unchanged (ac3, no migration)', () => {
  const f = fakeMemento();
  // Seed a pre-S008 session blob directly: a marker row with NO cssClass field + no maxSessions.
  f.map.set('insrc.chat.index', ['old']);
  f.map.set('insrc.chat.session.old', {
    id: 'old', provider: 'claude', createdAt: 't', title: 'legacy', editMode: 'auto',
    transcript: [{ role: 'marker', text: 'done', at: 't' }],
  });
  const store = createMementoChatSessionStore({ ...f, now: () => 't', genId: seqId() });
  const got = store.get('old');
  assert.ok(got, 'a pre-S008 session still validates (isSession does no per-row check)');
  const row = got!.transcript[0];
  assert.equal(row?.text, 'done');
  assert.equal(row?.cssClass, undefined, 'the legacy marker row has no cssClass -> restores as plain text');
  assert.equal(store.list().length, 1, 'the legacy session is listed');
});

test('S008: user/assistant rows never carry a cssClass', () => {
  const store = createInMemoryChatSessionStore({ genId: seqId() });
  const s = store.create('claude');
  store.append(s.id, { role: 'user', text: 'hi', at: 't' });
  store.append(s.id, { role: 'assistant', text: 'ok', at: 't' });
  for (const row of store.get(s.id)!.transcript) {
    assert.equal(row.cssClass, undefined, `${row.role} row carries no cssClass`);
  }
});

// ---- S006: per-session editMode (sc4) round-trip ----

test('S006: editMode defaults to auto on create and a review update round-trips through save()/get()', () => {
  const f = fakeMemento();
  const store = createMementoChatSessionStore({ ...f, now: () => 't', genId: seqId() });
  const s = store.create('claude');
  assert.equal(s.editMode, 'auto', 'defaults to auto');
  s.editMode = 'review';
  store.save(s);
  assert.equal(store.get(s.id)?.editMode, 'review', 'editMode round-trips through the memento');
  // list summaries are unaffected by the editMode field
  assert.equal(store.list().length, 1);
});
