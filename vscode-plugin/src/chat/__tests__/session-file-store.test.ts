/**
 * Story E20261012c96a97a2:S001 — the file-backed chat session store.
 *
 * The store runs over an in-memory SessionFilesFs that records every call, so what a save writes
 * is observed and not assumed.
 *
 *   npx tsx --test src/chat/__tests__/session-file-store.test.ts
 */
import { test } from 'node:test';
import { pageBefore } from '../transcript-window.js';
import assert from 'node:assert/strict';
import { createFileChatSessionStore, HEAD_SUFFIX, migrateChatSessionsFromMemento, ROWS_SUFFIX } from '../session-file-store.js';
import { sessionFileName } from '../session-output.js';
import { createMementoChatSessionStore, INDEX_KEY, SESSION_PREFIX, type ChatSession, type ChatSessionStore, type MementoLike, type TranscriptEntry } from '../session-store.js';
import { fakeSessionFs, type FakeSessionFs } from './fake-session-fs.js';

const ROOT = '/sessions';
const headPath = (id: string): string => `${ROOT}/${sessionFileName(id)}${HEAD_SUFFIX}`;
const rowsPath = (id: string): string => `${ROOT}/${sessionFileName(id)}${ROWS_SUFFIX}`;

let nextId = 0;
/** A store over a fresh fake, with a clock that moves a second per call and ids unique across stores. */
function makeStore(over: { fake?: FakeSessionFs; warns?: string[] } = {}): { store: ChatSessionStore; fake: FakeSessionFs; warns: string[] } {
  const fake = over.fake ?? fakeSessionFs();
  const warns = over.warns ?? [];
  let tick = 0;
  const store = createFileChatSessionStore({
    root: ROOT,
    fs: fake.fs,
    now: () => new Date(Date.UTC(2026, 0, 1, 0, 0, ++tick)).toISOString(),
    genId: () => `s${++nextId}`,
    logger: { warn: (m) => warns.push(m) },
  });
  return { store, fake, warns };
}
const row = (i: number): TranscriptEntry => ({ role: i % 2 === 0 ? 'user' : 'assistant', text: `row ${i}`, at: new Date(Date.UTC(2026, 1, 1, 0, 0, i)).toISOString() });
const rowsOnDisk = (fake: FakeSessionFs, id: string): unknown[] =>
  (fake.files.get(rowsPath(id)) ?? '').split('\n').filter((l) => l !== '').map((l) => JSON.parse(l) as unknown);
/** The bytes a run of calls wrote: appended text plus whole-file writes. */
const bytesWritten = (fake: FakeSessionFs): number =>
  fake.ops('appendText', 'writeText').reduce((sum, c) => sum + Buffer.byteLength(c.data ?? '', 'utf8'), 0);

test('a save of a session with new rows appends exactly those rows to the rows file and replaces the head; the bytes written do not grow with the rows already stored (1,000 stored rows, one new row)', () => {
  const measure = (stored: number): { bytes: number; fake: FakeSessionFs; s: ChatSession } => {
    const { store, fake } = makeStore();
    const s = store.draft('claude');
    for (let i = 0; i < stored; i++) s.transcript.push(row(i));
    store.save(s);
    fake.clear();
    s.transcript.push({ role: 'user', text: 'the new row', at: '2026-03-01T00:00:00.000Z' });
    store.save(s);
    return { bytes: bytesWritten(fake), fake, s };
  };
  const big = measure(1000);
  // Exactly the new row is appended, as one line, and nothing else touches the rows file.
  const appends = big.fake.ops('appendText');
  assert.equal(appends.length, 1);
  assert.equal(appends[0]!.path, rowsPath(big.s.id));
  assert.equal(appends[0]!.data, `${JSON.stringify(big.s.transcript[1000])}\n`);
  assert.deepEqual(big.fake.ops('writeText', 'rename', 'truncate', 'remove').filter((c) => c.path === rowsPath(big.s.id) || c.to === rowsPath(big.s.id)), []);
  assert.equal(rowsOnDisk(big.fake, big.s.id).length, 1001);
  // The head is replaced through a temporary file and a rename, after the rows.
  const writes = big.fake.ops('writeText');
  const renames = big.fake.ops('rename');
  assert.equal(writes.length, 1);
  assert.notEqual(writes[0]!.path, headPath(big.s.id), 'the head is not written in place');
  assert.deepEqual(renames.map((c) => [c.path, c.to]), [[writes[0]!.path, headPath(big.s.id)]]);
  const order = big.fake.ops('appendText', 'writeText', 'rename').map((c) => c.op);
  assert.deepEqual(order, ['appendText', 'writeText', 'rename'], 'rows first, then the head');
  const head = JSON.parse(big.fake.files.get(headPath(big.s.id))!) as Record<string, unknown>;
  assert.equal(head['rows'], 1001);
  assert.equal(head['updatedAt'], '2026-03-01T00:00:00.000Z');
  assert.equal('transcript' in head, false, 'the head holds no transcript');
  // The cost of the save does not depend on the rows already stored.
  const small = measure(10);
  assert.ok(Math.abs(big.bytes - small.bytes) <= 4, `1,000 stored rows: ${big.bytes} bytes; 10 stored rows: ${small.bytes} bytes`);
  assert.ok(big.bytes < 1000, `a save of one row wrote ${big.bytes} bytes`);
});

test('a save with no new rows writes the head only', () => {
  const { store, fake } = makeStore();
  const s = store.draft('claude');
  s.transcript.push(row(0), row(1));
  store.save(s);
  const rowsBefore = fake.files.get(rowsPath(s.id));
  fake.clear();
  s.title = 'a derived title';
  s.mode = 'auto';
  store.save(s);
  assert.deepEqual(fake.ops('appendText', 'truncate', 'remove'), [], 'nothing touches the rows file');
  assert.deepEqual(fake.ops('rename').map((c) => c.to), [headPath(s.id)]);
  assert.equal(fake.ops('writeText').length, 1);
  assert.equal(fake.files.get(rowsPath(s.id)), rowsBefore);
  const head = JSON.parse(fake.files.get(headPath(s.id))!) as Record<string, unknown>;
  assert.deepEqual([head['title'], head['mode'], head['rows']], ['a derived title', 'auto', 2]);
});

test('a draft writes nothing until its first save, which writes its rows and then its head; create() saves at once', () => {
  const { store, fake } = makeStore();
  const d = store.draft('codex');
  assert.deepEqual([d.provider, d.title, d.editMode, d.mode, d.transcript.length], ['codex', 'new chat', 'auto', 'manual', 0]);
  assert.deepEqual(fake.calls, [], 'a draft makes no file call');
  assert.equal(fake.files.size, 0);
  assert.deepEqual(store.list(), []);
  assert.equal(store.get(d.id), undefined, 'a draft is not in the store');
  fake.clear();
  d.transcript.push(row(0), row(1));
  store.save(d);
  assert.deepEqual(fake.ops('mkdir').map((c) => c.path), [ROOT], 'the directory is made');
  assert.deepEqual(fake.ops('appendText', 'rename').map((c) => c.to ?? c.path), [rowsPath(d.id), headPath(d.id)], 'rows, then head');
  assert.deepEqual(rowsOnDisk(fake, d.id), d.transcript);
  assert.deepEqual(store.list().map((c) => c.id), [d.id]);
  // create() persists at once, with no rows file needed for an empty transcript.
  const c = store.create('claude');
  assert.ok(fake.files.has(headPath(c.id)));
  assert.equal(fake.files.has(rowsPath(c.id)), false);
  assert.deepEqual(store.get(c.id)?.transcript, []);
  assert.deepEqual(store.list().map((x) => x.id).sort(), [c.id, d.id].sort());
});

test('get returns the saved session with every row variant, editMode, mode, nativeSessionId and liveTurn unchanged, and the same object on a second call without reading the files again', () => {
  const { store, fake } = makeStore();
  const s = store.draft('claude');
  s.title = 'every kind of row';
  s.editMode = 'review';
  s.mode = 'edit-auto';
  s.nativeSessionId = 'native-42';
  s.liveTurn = { cursor: { turnId: 't1', generation: 3, offset: 1234 }, ownerHostPid: 77, pid: 88, startedAt: 99 };
  s.transcript.push(
    { role: 'user', text: 'a question with "quotes", a\nnewline and ünïcödé ✓', at: '2026-02-01T00:00:00.000Z' },
    { role: 'assistant', text: 'an answer', at: '2026-02-01T00:00:01.000Z' },
    { role: 'marker', text: 'tool call', cssClass: 'insrc-term-marker--tool', at: '2026-02-01T00:00:02.000Z' },
    { role: 'marker', text: 'no class', at: '2026-02-01T00:00:03.000Z' },
    { role: 'tool-result', command: 'ls -la', output: 'total 0\n', at: '2026-02-01T00:00:04.000Z' },
    { role: 'tool-result', output: '', at: '2026-02-01T00:00:05.000Z' },
    { role: 'permission-outcome', toolName: 'Bash', decision: 'approved', at: '2026-02-01T00:00:06.000Z' },
    { role: 'selection-outcome', chosen: ['one', 'two'], at: '2026-02-01T00:00:07.000Z' },
  );
  store.save(s);
  const expected = JSON.parse(JSON.stringify(s)) as ChatSession;
  // The saving store hands back the object it was given.
  assert.equal(store.get(s.id), s);
  // Another store over the same files reads an equal session.
  const other = makeStore({ fake });
  const read = other.store.get(s.id);
  assert.deepEqual(read, expected);
  assert.notEqual(read, s);
  // A second call returns the same object and reads no file.
  fake.clear();
  assert.equal(other.store.get(s.id), read);
  assert.deepEqual(fake.ops('readText'), [], 'no file is read again');
  // A session without the optional fields reads back without them.
  const plain = other.store.create('codex');
  const third = makeStore({ fake });
  const back = third.store.get(plain.id)!;
  assert.deepEqual(back, JSON.parse(JSON.stringify(plain)));
  assert.equal('liveTurn' in back, false);
  assert.equal('nativeSessionId' in back, false);
  // append() adds one row through a save.
  third.store.append(plain.id, row(0));
  assert.deepEqual(makeStore({ fake }).store.get(plain.id)?.transcript, [row(0)]);
  third.store.append('missing', row(1)); // a no-op, never a throw
});

test('list reads head files only, never a rows file, and returns id, provider, title and updatedAt sorted by updatedAt descending', () => {
  const { store, fake } = makeStore();
  const a = store.draft('claude');
  a.title = 'oldest';
  a.transcript.push({ role: 'user', text: 'a', at: '2026-02-01T00:00:00.000Z' });
  store.save(a);
  const b = store.draft('codex');
  b.title = 'newest';
  b.transcript.push({ role: 'user', text: 'b', at: '2026-02-03T00:00:00.000Z' });
  store.save(b);
  const c = store.draft('claude');
  c.title = 'no rows';
  store.save(c); // updatedAt is its createdAt, in January
  const d = store.draft('claude');
  d.title = 'middle';
  d.transcript.push({ role: 'user', text: 'd', at: '2026-02-02T00:00:00.000Z' });
  store.save(d);
  fake.files.set(`${ROOT}/stray.txt`, 'not a session');
  const fresh = makeStore({ fake });
  fake.clear();
  const list = fresh.store.list();
  assert.deepEqual(list.map((x) => x.title), ['newest', 'middle', 'oldest', 'no rows']);
  assert.deepEqual(list[0], { id: b.id, provider: 'codex', title: 'newest', updatedAt: '2026-02-03T00:00:00.000Z' });
  assert.equal(list[3]!.updatedAt, c.createdAt);
  const read = fake.ops('readText').map((x) => x.path);
  assert.equal(read.length, 4);
  assert.ok(read.every((p) => p.endsWith(HEAD_SUFFIX)), 'only head files are read');
  assert.deepEqual(fake.calls.filter((x) => x.path.endsWith(ROWS_SUFFIX)), [], 'no rows file is touched in any way');
  // A missing directory lists as empty.
  assert.deepEqual(createFileChatSessionStore({ root: '/nowhere', fs: fake.fs }).list(), []);
});

test('a damaged head reads as no session and is left out of list; a rows file with a torn last line is read without it and cut back before the next append; a bad line in the middle is skipped', () => {
  const { store, fake } = makeStore();
  const good = store.draft('claude');
  good.transcript.push(row(0), row(1), row(2));
  store.save(good);
  const bad = store.create('claude');
  const notHead = store.create('claude');
  // Damaged heads: not JSON, and JSON that is not a session head.
  fake.files.set(headPath(bad.id), '{"v":1,"id":"');
  fake.files.set(headPath(notHead.id), JSON.stringify({ v: 1, id: notHead.id, provider: 'claude' }));
  const r1 = makeStore({ fake });
  assert.equal(r1.store.get(bad.id), undefined);
  assert.equal(r1.store.get(notHead.id), undefined);
  assert.equal(r1.store.get('never-existed'), undefined);
  assert.deepEqual(r1.store.list().map((x) => x.id), [good.id]);
  assert.ok(fake.files.has(headPath(bad.id)), 'a damaged head is not deleted');
  r1.store.get(bad.id);
  assert.equal(r1.warns.filter((w) => w.includes(headPath(bad.id))).length, 1, 'warned once per file');

  // A torn last line with no trailing newline.
  const whole = fake.files.get(rowsPath(good.id))!;
  fake.files.set(rowsPath(good.id), `${whole}{"role":"assistant","text":"half a ro`);
  const r2 = makeStore({ fake });
  const s2 = r2.store.get(good.id)!;
  assert.deepEqual(s2.transcript, [row(0), row(1), row(2)], 'read without the torn line');
  assert.equal(fake.files.get(rowsPath(good.id)), whole, 'the file is cut back to the last complete line');
  s2.transcript.push(row(3));
  r2.store.save(s2);
  assert.deepEqual(rowsOnDisk(fake, good.id), [row(0), row(1), row(2), row(3)], 'the next append starts on a clean line');

  // A torn last line that ends with a newline but is not JSON, holding a multi-byte character.
  const whole4 = fake.files.get(rowsPath(good.id))!;
  fake.files.set(rowsPath(good.id), `${whole4}{"role":"assistant","text":"ünï\n`);
  const r3 = makeStore({ fake });
  assert.deepEqual(r3.store.get(good.id)!.transcript, [row(0), row(1), row(2), row(3)]);
  assert.equal(fake.files.get(rowsPath(good.id)), whole4);

  // A bad line in the middle is skipped, logged, and the file is left as it is.
  const lines = whole4.split('\n');
  const withBad = [lines[0], 'not json at all', ...lines.slice(1)].join('\n');
  fake.files.set(rowsPath(good.id), withBad);
  const r4 = makeStore({ fake });
  assert.deepEqual(r4.store.get(good.id)!.transcript, [row(0), row(1), row(2), row(3)]);
  assert.equal(fake.files.get(rowsPath(good.id)), withBad, 'the file is not rewritten');
  assert.ok(r4.warns.some((w) => /line 2 is not a transcript row/.test(w)));

  // A read that throws is absent, not a throw.
  fake.failOn = (c) => (c.op === 'readText' ? new Error('EIO') : undefined);
  const r5 = makeStore({ fake });
  assert.equal(r5.store.get(good.id), undefined);
  assert.deepEqual(r5.store.list(), []);
  fake.failOn = undefined;
});

test('an id with characters outside A-Za-z0-9_- is stored under sessionFileName(id) and read back with its real id', () => {
  const fake = fakeSessionFs();
  const id = 'weird/id: with spaces & ünï.json';
  const store = createFileChatSessionStore({ root: ROOT, fs: fake.fs, genId: () => id, now: () => '2026-01-01T00:00:00.000Z' });
  const s = store.draft('claude');
  s.transcript.push(row(0));
  store.save(s);
  const name = sessionFileName(id);
  assert.match(name, /^[A-Za-z0-9_-]+$/);
  assert.notEqual(name, id);
  assert.deepEqual([...fake.files.keys()].sort(), [`${ROOT}/${name}${HEAD_SUFFIX}`, `${ROOT}/${name}${ROWS_SUFFIX}`].sort());
  const other = createFileChatSessionStore({ root: ROOT, fs: fake.fs });
  assert.equal(other.get(id)?.id, id);
  assert.deepEqual(other.get(id)?.transcript, [row(0)]);
  assert.deepEqual(other.list().map((x) => x.id), [id]);
  // Another id that maps to the same file name is not this session.
  assert.equal(other.get(name), undefined);
});

// --- several windows, whole-file writes, failing writes and the cap ------------------------------

/** Whether any call replaced, cut or removed a session's rows file (an append does not count). */
const rowsFileReplaced = (fake: FakeSessionFs, id: string): boolean =>
  fake.calls.some((c) => (c.op === 'rename' && c.to === rowsPath(id)) || ((c.op === 'writeText' || c.op === 'truncate' || c.op === 'remove') && c.path === rowsPath(id)));
const texts = (rows: readonly unknown[]): string[] => rows.map((r) => (r as { text: string }).text);
const say = (text: string): TranscriptEntry => ({ role: 'user', text, at: '2026-02-01T00:00:00.000Z' });

test('after another writer has appended to the rows file, the same held session object is saved three times (with a new row, with only a head change, and after a get of its id): every save only appends, the rows file is never replaced, it holds both writers\' rows in save order, and the get returns a fresh object with all of them (mutation: untrack the object when the cached copy is dropped)', () => {
  const fake = fakeSessionFs();
  const a = makeStore({ fake }).store; // this window
  const b = makeStore({ fake }).store; // another window
  const held = a.draft('claude');
  held.transcript.push(say('a1'), say('a2'));
  a.save(held);
  // The other window opens the same session and appends two rows.
  const theirs = b.get(held.id)!;
  theirs.transcript.push(say('b1'), say('b2'));
  b.save(theirs);
  fake.clear();

  // 1. A new row.
  held.transcript.push(say('a3'));
  a.save(held);
  assert.deepEqual(fake.ops('appendText').map((c) => c.data), [`${JSON.stringify(say('a3'))}\n`], 'only the new row is appended');
  // 2. Only a head change.
  held.title = 'renamed';
  a.save(held);
  assert.equal(fake.ops('appendText').length, 1, 'nothing more is appended');
  // 3. After a get of its id: the get reads the files and returns a fresh object with every row.
  const fresh = a.get(held.id)!;
  assert.notEqual(fresh, held, 'the held object lacks the other window\'s rows, so it is not handed out again');
  assert.deepEqual(texts(fresh.transcript), ['a1', 'a2', 'b1', 'b2', 'a3']);
  assert.equal(fresh.title, 'renamed');
  held.transcript.push(say('a4'));
  a.save(held);
  assert.deepEqual(fake.ops('appendText').map((c) => c.data), [`${JSON.stringify(say('a3'))}\n`, `${JSON.stringify(say('a4'))}\n`]);

  assert.equal(rowsFileReplaced(fake, held.id), false, 'the rows file was never replaced');
  assert.deepEqual(texts(rowsOnDisk(fake, held.id)), ['a1', 'a2', 'b1', 'b2', 'a3', 'a4'], 'both writers\' rows, in save order');
  assert.deepEqual(texts(held.transcript), ['a1', 'a2', 'a3', 'a4'], 'the held object keeps its own view');
  // The held object is still not handed out; a later get reads every row.
  const again = a.get(held.id)!;
  assert.notEqual(again, held);
  assert.deepEqual(texts(again.transcript), ['a1', 'a2', 'b1', 'b2', 'a3', 'a4']);
  // The other window, saving its own held object, appends after all of that.
  theirs.transcript.push(say('b3'));
  b.save(theirs);
  assert.deepEqual(texts(rowsOnDisk(fake, held.id)), ['a1', 'a2', 'b1', 'b2', 'a3', 'a4', 'b3']);
  assert.equal(rowsFileReplaced(fake, held.id), false);
});

test('an object the store has never tracked, saved for an id whose files exist, replaces the rows file whole through a temporary file and a rename; so does a tracked object whose transcript is shorter than its count', () => {
  const { store, fake } = makeStore();
  const s = store.draft('claude');
  s.transcript.push(say('one'), say('two'), say('three'));
  store.save(s);
  // An object this store never handed out, for the same id.
  const stranger: ChatSession = { ...(JSON.parse(JSON.stringify(s)) as ChatSession), transcript: [say('x'), say('y')] };
  fake.clear();
  store.save(stranger);
  const wholeWrites = fake.ops('rename').filter((c) => c.to === rowsPath(s.id));
  assert.equal(wholeWrites.length, 1, 'the rows file is replaced by a rename');
  assert.ok(fake.ops('writeText').some((c) => c.path === wholeWrites[0]!.path && c.path !== rowsPath(s.id)), 'through a temporary file');
  assert.deepEqual(fake.ops('appendText'), []);
  assert.deepEqual(texts(rowsOnDisk(fake, s.id)), ['x', 'y']);
  // It is tracked from then on: its next save appends.
  fake.clear();
  stranger.transcript.push(say('z'));
  store.save(stranger);
  assert.equal(fake.ops('appendText').length, 1);
  assert.equal(rowsFileReplaced(fake, s.id), false);
  assert.deepEqual(texts(rowsOnDisk(fake, s.id)), ['x', 'y', 'z']);

  // A tracked object whose transcript got shorter than what it wrote.
  const t = store.draft('claude');
  t.transcript.push(say('1'), say('2'), say('3'));
  store.save(t);
  fake.clear();
  t.transcript.length = 1;
  store.save(t);
  assert.equal(fake.ops('rename').filter((c) => c.to === rowsPath(t.id)).length, 1);
  assert.deepEqual(fake.ops('appendText'), []);
  assert.deepEqual(texts(rowsOnDisk(fake, t.id)), ['1']);
  assert.deepEqual(texts(makeStore({ fake }).store.get(t.id)!.transcript), ['1']);
  // A never-tracked object for an id with no files is simply written.
  const brandNew: ChatSession = { id: 'brand-new', provider: 'claude', createdAt: '2026-01-01T00:00:00.000Z', title: 't', editMode: 'auto', transcript: [say('n')] };
  fake.clear();
  store.save(brandNew);
  assert.equal(fake.ops('appendText').length, 1);
  assert.deepEqual(texts(store.get('brand-new')!.transcript), ['n']);
});

test('a failing append or head write makes save throw and leaves the object\'s count where the rows on disk are, so the next save writes the missing rows once and none twice', () => {
  const { store, fake } = makeStore();
  const s = store.draft('claude');
  s.transcript.push(say('one'));
  store.save(s);
  // The append fails: nothing is on disk, and the next save writes both missing rows once.
  s.transcript.push(say('two'));
  fake.failOn = (c) => (c.op === 'appendText' ? new Error('disk full') : undefined);
  assert.throws(() => store.save(s), /disk full/);
  assert.deepEqual(texts(rowsOnDisk(fake, s.id)), ['one']);
  fake.failOn = undefined;
  s.transcript.push(say('three'));
  store.save(s);
  assert.deepEqual(texts(rowsOnDisk(fake, s.id)), ['one', 'two', 'three']);
  // The head write fails after the append succeeded: the row is on disk and is not written again.
  s.transcript.push(say('four'));
  s.title = 'new title';
  fake.failOn = (c) => (c.op === 'writeText' ? new Error('no space') : undefined);
  assert.throws(() => store.save(s), /no space/);
  assert.deepEqual(texts(rowsOnDisk(fake, s.id)), ['one', 'two', 'three', 'four'], 'the append before the failing head write is kept');
  fake.failOn = (c) => (c.op === 'rename' ? new Error('rename refused') : undefined);
  assert.throws(() => store.save(s), /rename refused/);
  fake.failOn = undefined;
  fake.clear();
  store.save(s);
  assert.deepEqual(fake.ops('appendText'), [], 'no row is written twice');
  assert.deepEqual(texts(rowsOnDisk(fake, s.id)), ['one', 'two', 'three', 'four']);
  // A read takes its rows from the rows file, and the head now carries the title.
  const read = makeStore({ fake }).store.get(s.id)!;
  assert.deepEqual(texts(read.transcript), ['one', 'two', 'three', 'four']);
  assert.equal(read.title, 'new title');
});

test('with maxSessions set, a save that creates a new session removes the sessions with the oldest savedAt and their rows files and calls onEvict for each, never the session being saved; a failing remove is logged and the save succeeds; a cap of 0 or less is no cap', () => {
  let tick = 0; // one clock for every store here: the windows share the time
  const capped = (maxSessions: number | undefined, fake = fakeSessionFs()): { store: ChatSessionStore; fake: FakeSessionFs; evicted: string[]; warns: string[] } => {
    const evicted: string[] = [];
    const warns: string[] = [];
    const store = createFileChatSessionStore({
      root: ROOT, fs: fake.fs, ...(maxSessions !== undefined ? { maxSessions } : {}),
      now: () => new Date(Date.UTC(2026, 0, 1, 0, 0, ++tick)).toISOString(),
      genId: () => `s${++nextId}`,
      onEvict: (id) => { evicted.push(id); },
      logger: { warn: (m) => warns.push(m) },
    });
    return { store, fake, evicted, warns };
  };
  const mk = (store: ChatSessionStore, text: string): ChatSession => {
    const s = store.draft('claude');
    s.transcript.push(say(text));
    store.save(s);
    return s;
  };
  const c = capped(2);
  const s1 = mk(c.store, 'first');
  const s2 = mk(c.store, 'second');
  assert.deepEqual(c.evicted, [], 'at the cap: nothing evicted');
  // Saving an existing session again makes it the most recently saved, and evicts nothing.
  s1.title = 'touched';
  c.store.save(s1);
  assert.deepEqual(c.evicted, []);
  const s3 = mk(c.store, 'third');
  assert.deepEqual(c.evicted, [s2.id], 'the session saved longest ago goes, not the one being saved');
  assert.equal(c.fake.files.has(headPath(s2.id)), false);
  assert.equal(c.fake.files.has(rowsPath(s2.id)), false, 'its rows file goes too');
  assert.deepEqual(c.store.list().map((x) => x.id).sort(), [s1.id, s3.id].sort());
  assert.equal(c.store.get(s2.id), undefined);
  // Several over the cap at once (files another window wrote): all the oldest go in one save.
  const loose = capped(undefined, c.fake);
  const extra1 = mk(loose.store, 'extra1');
  const extra2 = mk(loose.store, 'extra2');
  const s4 = mk(c.store, 'fourth');
  assert.deepEqual(c.evicted, [s2.id, s1.id, s3.id, extra1.id]);
  assert.deepEqual(c.store.list().map((x) => x.id).sort(), [extra2.id, s4.id].sort());

  // A failing remove is logged, onEvict is still called, and the save succeeds.
  c.fake.failOn = (call) => (call.op === 'remove' ? new Error('EBUSY') : undefined);
  const s5 = mk(c.store, 'fifth');
  c.fake.failOn = undefined;
  assert.ok(c.fake.files.has(headPath(s5.id)), 'the save succeeded');
  assert.equal(c.evicted.at(-1), extra2.id);
  assert.ok(c.warns.some((w) => /not removed: EBUSY/.test(w)));
  // A throwing onEvict does not break the save either.
  const angry = createFileChatSessionStore({ root: ROOT, fs: c.fake.fs, maxSessions: 1, genId: () => `s${++nextId}`, onEvict: () => { throw new Error('boom'); } });
  angry.create('claude');

  // A cap of 0, a negative cap and no cap are all no cap.
  for (const max of [0, -3, undefined]) {
    const u = capped(max);
    for (let i = 0; i < 5; i++) mk(u.store, `row ${i}`);
    assert.equal(u.store.list().length, 5);
    assert.deepEqual(u.evicted, []);
  }
  // A fractional cap is its whole part.
  const f = capped(2.9);
  for (let i = 0; i < 4; i++) mk(f.store, `row ${i}`);
  assert.equal(f.store.list().length, 2);
});

test('a held session object saved after its files were removed is written whole with its head, get then returns every row, and the cap is applied without removing it (mutation: append only the rows beyond its count)', () => {
  const fake = fakeSessionFs();
  const evicted: string[] = [];
  let tick = 0;
  const opts = { root: ROOT, fs: fake.fs, maxSessions: 2, now: () => new Date(Date.UTC(2026, 0, 1, 0, 0, ++tick)).toISOString(), genId: () => `s${++nextId}`, onEvict: (id: string) => { evicted.push(id); } };
  const a = createFileChatSessionStore(opts); // this window
  const b = createFileChatSessionStore(opts); // another window
  const held = a.draft('claude');
  held.transcript.push(say('one'), say('two'), say('three'));
  a.save(held);
  // The other window creates two sessions: the cap evicts the held one's files.
  const o1 = b.create('claude');
  const o2 = b.create('claude');
  assert.deepEqual(evicted, [held.id]);
  assert.equal(fake.files.has(headPath(held.id)), false);
  assert.equal(fake.files.has(rowsPath(held.id)), false);
  // The turn that still holds the object saves it with one more row.
  held.transcript.push(say('four'));
  fake.clear();
  a.save(held);
  assert.deepEqual(texts(rowsOnDisk(fake, held.id)), ['one', 'two', 'three', 'four'], 'the whole transcript, not only the new row');
  assert.equal(fake.ops('rename').filter((c) => c.to === rowsPath(held.id)).length, 1, 'written whole through a rename');
  assert.ok(fake.files.has(headPath(held.id)));
  assert.deepEqual(texts(b.get(held.id)!.transcript), ['one', 'two', 'three', 'four'], 'get returns every row');
  assert.equal(a.get(held.id), held);
  // The save created a head, so the cap was applied, and not against the session being saved.
  assert.deepEqual(evicted, [held.id, o1.id]);
  assert.deepEqual(a.list().map((x) => x.id).sort(), [held.id, o2.id].sort());
  // From then on it appends again.
  fake.clear();
  held.transcript.push(say('five'));
  a.save(held);
  assert.equal(fake.ops('appendText').length, 1);
  assert.equal(rowsFileReplaced(fake, held.id), false);

  // The same when only the rows file is shorter than this store left it, or only the head is gone.
  const short = a.draft('claude');
  short.transcript.push(say('p'), say('q'));
  a.save(short);
  fake.files.set(rowsPath(short.id), `${JSON.stringify(say('p'))}\n`);
  short.transcript.push(say('r'));
  a.save(short);
  assert.deepEqual(texts(rowsOnDisk(fake, short.id)), ['p', 'q', 'r']);
  fake.files.delete(headPath(short.id));
  short.transcript.push(say('s'));
  a.save(short);
  assert.deepEqual(texts(rowsOnDisk(fake, short.id)), ['p', 'q', 'r', 's']);
  assert.deepEqual(texts(b.get(short.id)!.transcript), ['p', 'q', 'r', 's']);
});

test('a save after the store cut back a torn last line appends and does not replace the rows file', () => {
  const { store, fake } = makeStore();
  const s = store.draft('claude');
  s.transcript.push(say('one'), say('two'));
  store.save(s);
  // A crash left half a row behind; a new window reads the session, which cuts the file back.
  const whole = fake.files.get(rowsPath(s.id))!;
  fake.files.set(rowsPath(s.id), `${whole}{"role":"user","text":"thr`);
  const reader = makeStore({ fake }).store;
  const read = reader.get(s.id)!;
  assert.equal(fake.files.get(rowsPath(s.id)), whole, 'cut back');
  fake.clear();
  read.transcript.push(say('three'));
  reader.save(read);
  assert.equal(fake.ops('appendText').length, 1, 'the save appends');
  assert.equal(rowsFileReplaced(fake, s.id), false, 'and does not replace the file');
  assert.deepEqual(texts(rowsOnDisk(fake, s.id)), ['one', 'two', 'three']);
  assert.equal(reader.get(s.id), read, 'the object is still the one handed out');
  // The store that wrote the session first also still appends: the file is back at the size it left.
  fake.clear();
  s.transcript.push(say('from the first store'));
  store.save(s);
  assert.equal(rowsFileReplaced(fake, s.id), false);
  assert.deepEqual(texts(rowsOnDisk(fake, s.id)), ['one', 'two', 'three', 'from the first store']);
});

// --- the one-time move out of globalState ---------------------------------------------------------

/** A Map-backed memento that records its reads and writes, with sessions the Memento store wrote. */
function oldState(): { memento: MementoLike; map: Map<string, unknown>; reads: string[]; writes: Array<[string, unknown]>; store: ChatSessionStore } {
  const map = new Map<string, unknown>();
  const reads: string[] = [];
  const writes: Array<[string, unknown]> = [];
  const quiet: MementoLike = { get: <T>(k: string) => map.get(k) as T | undefined, update: (k, v) => { if (v === undefined) map.delete(k); else map.set(k, v); } };
  const memento: MementoLike = {
    get: <T>(k: string) => { reads.push(k); return map.get(k) as T | undefined; },
    update: (k, v) => { writes.push([k, v]); if (v === undefined) map.delete(k); else map.set(k, v); },
  };
  let tick = 0;
  const store = createMementoChatSessionStore({ memento: quiet, now: () => new Date(Date.UTC(2026, 0, 1, 0, 0, ++tick)).toISOString(), genId: () => `m${++nextId}` });
  return { memento, map, reads, writes, store };
}
/** A session in the old store with `n` rows, the last at `at`. */
function oldSession(old: { store: ChatSessionStore }, title: string, n: number, at: string): ChatSession {
  const s = old.store.create('claude');
  s.title = title;
  for (let i = 0; i < n; i++) s.transcript.push({ role: i % 2 === 0 ? 'user' : 'assistant', text: `${title} ${i}`, at: i === n - 1 ? at : '2026-02-01T00:00:00.000Z' });
  old.store.save(s);
  return s;
}

test('the migration writes each indexed session\'s files, reads them back equal, then removes its memento key and the index; the store then lists and returns every session as the memento store did', () => {
  const old = oldState();
  const a = oldSession(old, 'alpha', 3, '2026-02-02T00:00:00.000Z');
  const b = oldSession(old, 'beta', 5, '2026-02-04T00:00:00.000Z');
  const c = old.store.create('codex'); // no rows
  b.mode = 'auto';
  b.nativeSessionId = 'native-b';
  b.liveTurn = { cursor: { turnId: 't', generation: 1, offset: 9 }, ownerHostPid: 5 };
  old.store.save(b);
  const listBefore = old.store.list();
  const sessionsBefore = [a, b, c].map((s) => JSON.parse(JSON.stringify(old.store.get(s.id))) as ChatSession);
  const fake = fakeSessionFs();
  const infos: string[] = [];
  const result = migrateChatSessionsFromMemento({ memento: old.memento, root: ROOT, fs: fake.fs, logger: { warn: () => {}, info: (m) => infos.push(m) } });
  assert.deepEqual(result, { migrated: 3, kept: [] });
  assert.match(infos.join('\n'), /3 chat session\(s\) moved/);
  // Every key is gone from the memento, and the index with them.
  assert.deepEqual([...old.map.keys()], []);
  assert.deepEqual(old.writes.map((w) => w[0]).sort(), [INDEX_KEY, ...[a, b, c].map((s) => SESSION_PREFIX + s.id)].sort());
  assert.ok(old.writes.every((w) => w[1] === undefined));
  // Each session's key was removed only after its files were written and read back.
  for (const s of [a, b, c]) {
    const head = headPath(s.id);
    const lastRead = fake.calls.map((x, i) => (x.op === 'readText' && x.path === head ? i : -1)).filter((i) => i >= 0).at(-1)!;
    const lastWrite = fake.calls.map((x, i) => (x.op === 'rename' && x.to === head ? i : -1)).filter((i) => i >= 0).at(-1)!;
    assert.ok(lastWrite >= 0 && lastRead > lastWrite, `${s.title}: read back after it was written`);
  }
  assert.ok(fake.ops('rename').every((x) => x.path.endsWith('.tmp')), 'every file is written through a temporary file');
  const order = fake.ops('rename').map((x) => x.to);
  assert.ok(order.indexOf(rowsPath(a.id)) < order.indexOf(headPath(a.id)), 'rows before head');
  // The file store lists and returns what the memento store did.
  const store = createFileChatSessionStore({ root: ROOT, fs: fake.fs });
  assert.deepEqual(store.list(), listBefore);
  for (const before of sessionsBefore) assert.deepEqual(store.get(before.id), before);
});

test('a session whose write or read-back fails is left in the memento untouched, stays in the index and is returned in kept, and the others are still migrated', () => {
  const old = oldState();
  const a = oldSession(old, 'alpha', 2, '2026-02-02T00:00:00.000Z');
  const b = oldSession(old, 'beta', 2, '2026-02-03T00:00:00.000Z');
  const c = oldSession(old, 'gamma', 2, '2026-02-04T00:00:00.000Z');
  const d = oldSession(old, 'delta', 2, '2026-02-05T00:00:00.000Z');
  const before = new Map([...old.map].map(([k, v]) => [k, JSON.stringify(v)]));
  const fake = fakeSessionFs();
  const warns: string[] = [];
  // beta's rows cannot be written; gamma's head does not read back; delta's rows read back short.
  let deltaRead = 0;
  fake.failOn = (call) => {
    if (call.op === 'writeText' && call.path.startsWith(rowsPath(b.id))) return new Error('disk full');
    if (call.op === 'readText' && call.path === headPath(c.id)) return new Error('EIO');
    return undefined;
  };
  const realRead = fake.fs.readText;
  (fake.fs as { readText: typeof realRead }).readText = (path) => {
    const text = realRead(path);
    if (path === rowsPath(d.id) && text !== undefined && ++deltaRead >= 1) return text.split('\n').slice(0, 1).join('\n') + '\n';
    return text;
  };
  let result: ReturnType<typeof migrateChatSessionsFromMemento> | undefined;
  assert.doesNotThrow(() => { result = migrateChatSessionsFromMemento({ memento: old.memento, root: ROOT, fs: fake.fs, logger: { warn: (m) => warns.push(m) } }); });
  assert.deepEqual(result, { migrated: 1, kept: [b.id, c.id, d.id] });
  // The three that failed are untouched in the memento and still indexed; alpha is gone from it.
  for (const s of [b, c, d]) assert.equal(JSON.stringify(old.map.get(SESSION_PREFIX + s.id)), before.get(SESSION_PREFIX + s.id), `${s.title} is untouched`);
  assert.equal(old.map.has(SESSION_PREFIX + a.id), false);
  assert.deepEqual(old.map.get(INDEX_KEY), [b.id, c.id, d.id]);
  assert.deepEqual(old.writes.map((w) => w[0]).sort(), [INDEX_KEY, SESSION_PREFIX + a.id].sort(), 'no failed session\'s key was written');
  assert.ok(warns.some((w) => w.includes(b.id) && /disk full/.test(w)));
  assert.ok(warns.some((w) => w.includes(c.id)));
  assert.ok(warns.some((w) => w.includes(d.id) && /does not read back equal/.test(w)));
  // The next start, with the faults gone, migrates the rest.
  fake.failOn = undefined;
  (fake.fs as { readText: typeof realRead }).readText = realRead;
  const again = migrateChatSessionsFromMemento({ memento: old.memento, root: ROOT, fs: fake.fs });
  assert.deepEqual(again, { migrated: 3, kept: [] });
  assert.deepEqual([...old.map.keys()], []);
  const store = createFileChatSessionStore({ root: ROOT, fs: fake.fs });
  assert.deepEqual(store.list().map((x) => x.title), ['delta', 'gamma', 'beta', 'alpha']);
  for (const s of [a, b, c, d]) assert.equal(store.get(s.id)?.transcript.length, 2);
});

test('a session whose files already hold a prefix of the memento\'s rows gets the missing rows appended and its memento key removed; one whose files hold more rows than the memento is left as it is on disk and its key removed; one that disagrees is changed in neither place and returned in kept', () => {
  const old = oldState();
  const behind = oldSession(old, 'behind', 2, '2026-02-02T00:00:00.000Z');
  const ahead = oldSession(old, 'ahead', 2, '2026-02-03T00:00:00.000Z');
  const split = oldSession(old, 'split', 2, '2026-02-04T00:00:00.000Z');
  const fake = fakeSessionFs();
  assert.deepEqual(migrateChatSessionsFromMemento({ memento: old.memento, root: ROOT, fs: fake.fs }), { migrated: 3, kept: [] });
  // A window on the previous plugin version writes the sessions to globalState again:
  // `behind` with two more rows than the files; `ahead` unchanged while the files gained a row;
  // `split` with a different second row than the files.
  const files = createFileChatSessionStore({ root: ROOT, fs: fake.fs });
  const more: TranscriptEntry[] = [say('late 1'), say('late 2')];
  old.store.save({ ...behind, title: 'behind, renamed', transcript: [...behind.transcript, ...more] });
  old.store.save(ahead);
  const aheadOnDisk = files.get(ahead.id)!;
  aheadOnDisk.transcript.push(say('written by the new version'));
  files.save(aheadOnDisk);
  old.store.save({ ...split, transcript: [split.transcript[0]!, say('a different second row')] });
  const splitRowsBefore = fake.files.get(rowsPath(split.id));
  const splitMementoBefore = JSON.stringify(old.map.get(SESSION_PREFIX + split.id));
  const aheadRowsBefore = fake.files.get(rowsPath(ahead.id));
  const aheadHeadBefore = fake.files.get(headPath(ahead.id));
  fake.clear();
  old.writes.length = 0;
  const warns: string[] = [];
  const result = migrateChatSessionsFromMemento({ memento: old.memento, root: ROOT, fs: fake.fs, logger: { warn: (m) => warns.push(m) } });
  assert.deepEqual(result, { migrated: 2, kept: [split.id] });
  // behind: the two missing rows are appended (the file is not replaced) and the head follows.
  assert.deepEqual(fake.ops('appendText').map((x) => [x.path, x.data]), [[rowsPath(behind.id), more.map((r) => `${JSON.stringify(r)}\n`).join('')]]);
  assert.equal(rowsFileReplaced(fake, behind.id), false);
  const reread = createFileChatSessionStore({ root: ROOT, fs: fake.fs });
  assert.deepEqual(texts(reread.get(behind.id)!.transcript), ['behind 0', 'behind 1', 'late 1', 'late 2']);
  assert.equal(reread.get(behind.id)!.title, 'behind, renamed');
  assert.equal(old.map.has(SESSION_PREFIX + behind.id), false);
  // ahead: nothing on disk changes, and its key is removed.
  assert.equal(fake.files.get(rowsPath(ahead.id)), aheadRowsBefore);
  assert.equal(fake.files.get(headPath(ahead.id)), aheadHeadBefore);
  assert.equal(old.map.has(SESSION_PREFIX + ahead.id), false);
  // split: neither copy is changed, it stays indexed and is in kept.
  assert.equal(fake.files.get(rowsPath(split.id)), splitRowsBefore);
  assert.equal(JSON.stringify(old.map.get(SESSION_PREFIX + split.id)), splitMementoBefore);
  assert.deepEqual(old.map.get(INDEX_KEY), [split.id]);
  assert.ok(warns.some((w) => w.includes(split.id) && /disagree at row 1/.test(w)));
  assert.deepEqual(fake.calls.filter((x) => x.op !== 'stat' && x.op !== 'readText' && (x.path.includes(sessionFileName(split.id)) || (x.to ?? '').includes(sessionFileName(split.id)))), [], 'no write of any kind for the disagreeing session');
});

test('the migration with no index, or run a second time, reads no session, writes nothing and returns no kept id; an entry isSession rejects is kept and logged', () => {
  // No index at all.
  const empty = oldState();
  const fake = fakeSessionFs();
  assert.deepEqual(migrateChatSessionsFromMemento({ memento: empty.memento, root: ROOT, fs: fake.fs }), { migrated: 0, kept: [] });
  assert.deepEqual(empty.reads, [INDEX_KEY], 'only the index is looked at');
  assert.deepEqual(empty.writes, []);
  assert.deepEqual(fake.calls, [], 'no file call');
  // An index that is not a list, and a memento that throws: nothing happens, nothing throws.
  empty.map.set(INDEX_KEY, 'not a list');
  assert.deepEqual(migrateChatSessionsFromMemento({ memento: empty.memento, root: ROOT, fs: fake.fs }), { migrated: 0, kept: [] });
  const throwing: MementoLike = { get: () => { throw new Error('state unavailable'); }, update: () => {} };
  assert.deepEqual(migrateChatSessionsFromMemento({ memento: throwing, root: ROOT, fs: fake.fs }), { migrated: 0, kept: [] });
  assert.deepEqual(fake.calls, []);

  // A second run after a full migration.
  const old = oldState();
  oldSession(old, 'alpha', 2, '2026-02-02T00:00:00.000Z');
  assert.deepEqual(migrateChatSessionsFromMemento({ memento: old.memento, root: ROOT, fs: fake.fs }), { migrated: 1, kept: [] });
  const filesAfterFirst = new Map(fake.files);
  fake.clear();
  old.reads.length = 0;
  old.writes.length = 0;
  assert.deepEqual(migrateChatSessionsFromMemento({ memento: old.memento, root: ROOT, fs: fake.fs }), { migrated: 0, kept: [] });
  assert.deepEqual(old.reads, [INDEX_KEY], 'no session is read');
  assert.deepEqual(old.writes, []);
  assert.deepEqual(fake.calls, []);
  assert.deepEqual(new Map(fake.files), filesAfterFirst);

  // Entries that are not sessions are kept, logged, and do not stop the others.
  const mixed = oldState();
  const good = oldSession(mixed, 'good', 1, '2026-02-02T00:00:00.000Z');
  mixed.map.set(SESSION_PREFIX + 'broken', { id: 'broken', provider: 'claude' });
  mixed.map.set(SESSION_PREFIX + 'wrong-id', { ...good, id: 'someone-else' });
  mixed.map.set(INDEX_KEY, ['broken', good.id, 'gone', 'wrong-id', 42]);
  const warns: string[] = [];
  const result = migrateChatSessionsFromMemento({ memento: mixed.memento, root: ROOT, fs: fake.fs, logger: { warn: (m) => warns.push(m) } });
  assert.deepEqual(result, { migrated: 1, kept: ['broken', 'gone', 'wrong-id'] });
  assert.deepEqual(mixed.map.get(INDEX_KEY), ['broken', 'gone', 'wrong-id']);
  assert.deepEqual(mixed.map.get(SESSION_PREFIX + 'broken'), { id: 'broken', provider: 'claude' }, 'left as it was');
  for (const id of ['broken', 'gone', 'wrong-id']) assert.ok(warns.some((w) => w.includes(`stored session ${id} is not a session record`)), `${id} is logged`);
  assert.equal(fake.files.has(headPath('broken')), false);
});

// --- review follow-ups -----------------------------------------------------------------------------

test('a failed whole-file write leaves no temporary file behind, and a field the store does not know is carried through a save, a read and the migration', () => {
  const { store, fake } = makeStore();
  const s = store.draft('claude');
  s.transcript.push(say('one'));
  store.save(s);
  // The head's rename fails, then its write: neither leaves a .tmp file.
  for (const op of ['rename', 'writeText'] as const) {
    fake.failOn = (c) => (c.op === op ? new Error(`${op} failed`) : undefined);
    s.title = `after a failing ${op}`;
    assert.throws(() => store.save(s), new RegExp(`${op} failed`));
    fake.failOn = undefined;
    assert.deepEqual([...fake.files.keys()].filter((p) => p.endsWith('.tmp')), [], `no temporary file after a failing ${op}`);
  }
  store.save(s);
  assert.deepEqual([...fake.files.keys()].sort(), [headPath(s.id), rowsPath(s.id)].sort());

  // A field added to ChatSession later is not dropped.
  const future = s as ChatSession & { pinned?: boolean; notes?: { text: string } };
  future.pinned = true;
  future.notes = { text: 'kept' };
  store.save(future);
  const read = makeStore({ fake }).store.get(s.id) as typeof future;
  assert.deepEqual([read.pinned, read.notes], [true, { text: 'kept' }]);
  assert.deepEqual(read, JSON.parse(JSON.stringify(future)));
  for (const added of ['v', 'updatedAt', 'rows', 'savedAt']) assert.equal(added in read, false, `the head's own ${added} is not a session field`);
  // And the migration carries it, comparing the whole stored record on read-back.
  const old = oldState();
  const m = oldSession(old, 'with extras', 2, '2026-02-02T00:00:00.000Z') as typeof future;
  m.pinned = true;
  old.store.save(m);
  const target = fakeSessionFs();
  assert.deepEqual(migrateChatSessionsFromMemento({ memento: old.memento, root: ROOT, fs: target.fs }), { migrated: 1, kept: [] });
  assert.equal((createFileChatSessionStore({ root: ROOT, fs: target.fs }).get(m.id) as typeof future).pinned, true);
});

// ---- Story E2026101259da3204:S001 t3: the user row's attachments ----

test('session file store: a user row with attachments round-trips unchanged', () => {
  const { store, fake } = makeStore();
  const attachments = [
    { id: '1-shot.png', name: 'shot.png', kind: 'image' as const, size: 2048, path: '/home/u/.insrc/chat-attachments/s/1-shot.png' },
    { id: '2-n.pdf', name: 'né (v2).pdf', kind: 'file' as const, size: 9, path: '/home/u/.insrc/chat-attachments/s/2-n.pdf' },
  ];
  const withFiles: TranscriptEntry = { role: 'user', text: 'see these', at: '2026-10-12T00:00:00.000Z', attachments };
  const blank: TranscriptEntry = { role: 'user', text: '', at: '2026-10-12T00:00:01.000Z', attachments: [attachments[0]!] };
  const plain: TranscriptEntry = { role: 'user', text: 'no files', at: '2026-10-12T00:00:02.000Z' };
  const s = store.draft('claude');
  s.transcript.push(withFiles, blank, plain);
  store.save(s);

  // On disk: the row as given; a row without attachments has no such key.
  assert.deepEqual(rowsOnDisk(fake, s.id), [withFiles, blank, plain]);
  assert.equal(fake.files.get(rowsPath(s.id))!.split('\n')[2], JSON.stringify(plain));
  assert.ok(!('attachments' in (rowsOnDisk(fake, s.id)[2] as object)));

  // Read back by a store that never held the object, then saved again with one more row.
  const reopened = makeStore({ fake }).store;
  const read = reopened.get(s.id)!;
  assert.deepEqual(read.transcript, [withFiles, blank, plain]);
  read.transcript.push({ role: 'assistant', text: 'ok', at: '2026-10-12T00:00:03.000Z' });
  reopened.save(read);
  assert.deepEqual(rowsOnDisk(fake, s.id).slice(0, 3), [withFiles, blank, plain]);
  assert.deepEqual(makeStore({ fake }).store.get(s.id)!.transcript.slice(0, 3), [withFiles, blank, plain]);
});

// Story E20261013b2e8109f:S001 / t4 — diff rows through the store the extension uses.
test("session file store: a diff row, a row that replaces it and a withdrawing row are appended by separate saves, with another writer's rows appended between them, and a new store over the same files reads them back so that pageBefore gives the latest version at the first row's place", () => {
  const fake = fakeSessionFs();
  const a = makeStore({ fake }).store; // this window
  const b = makeStore({ fake }).store; // another window
  const diff = (over: Record<string, unknown>): TranscriptEntry =>
    ({ role: 'diff', path: 'src/a.ts', oldStart: 3, oldLines: 2, newStart: 3, newLines: 3, added: 1, removed: 0, lines: [' x', '+v1', ' y'], at: '2026-10-13T00:00:00.000Z', ...over }) as TranscriptEntry;
  const first = diff({ sid: 'k-0' });
  const other = diff({ sid: 'k-1', path: 'src/b.ts' });
  const second = diff({ replaces: 'k-0', lines: [' x', '+v2', ' y'] });
  const gone = diff({ replaces: 'k-1', path: 'src/b.ts', lines: [], added: 0, withdrawn: true });

  const held = a.draft('claude');
  held.transcript.push(say('go'), first, other);
  a.save(held);
  // The other window appends to the same chat, so this window's later rows land after its rows.
  const theirs = b.get(held.id)!;
  theirs.transcript.push(say('b1'), say('b2'));
  b.save(theirs);
  fake.clear();

  held.transcript.push(second);
  a.save(held);
  held.transcript.push(gone);
  a.save(held);
  // Each save only appended its one new row; the rows file was never replaced.
  assert.deepEqual(fake.ops('appendText').map((c) => c.data), [`${JSON.stringify(second)}\n`, `${JSON.stringify(gone)}\n`]);
  assert.equal(rowsFileReplaced(fake, held.id), false);
  // In the file the replacing rows sit after the other window's rows: positions 5 and 6, not 3 and 4.
  assert.deepEqual(rowsOnDisk(fake, held.id), [say('go'), first, other, say('b1'), say('b2'), second, gone]);

  // A store that never held the object reads every row, and the window shows each section's latest version.
  const read = makeStore({ fake }).store.get(held.id)!;
  assert.equal(read.transcript.length, 7);
  const page = pageBefore(read.transcript, read.transcript.length);
  assert.equal(page.firstIndex, 0);
  assert.deepEqual(page.rows[1], diff({ sid: 'k-0', lines: [' x', '+v2', ' y'] }));
  assert.deepEqual(page.rows[2], diff({ sid: 'k-1', path: 'src/b.ts', lines: [], added: 0, withdrawn: true }));
  assert.deepEqual(page.rows.slice(3), [say('b1'), say('b2'), second, gone]);
});

test('run config persists in the session head file and reads back (old heads without the fields read as absent)', () => {
  const { store, fake } = makeStore();
  const s = store.create('vibe', { model: 'glm-5-3', effort: 'max' });
  store.append(s.id, row(0));
  store.save(s);
  const headRaw = JSON.parse(fake.files.get(headPath(s.id))!) as Record<string, unknown>;
  assert.equal(headRaw['model'], 'glm-5-3');
  assert.equal(headRaw['effort'], 'max');
  // A fresh store over the same fs reads them back.
  const again = makeStore({ fake });
  const got = again.store.get(s.id);
  assert.equal(got?.model, 'glm-5-3');
  assert.equal(got?.effort, 'max');
  // Back-compat: a head written before the fields existed reads as absent.
  fake.files.set(headPath('old'), JSON.stringify({ v: 1, id: 'old', provider: 'claude', createdAt: '2025-01-01T00:00:00.000Z', title: 'old chat', editMode: 'auto', mode: 'manual', updatedAt: '2025-01-01T00:00:00.000Z', rows: 0, savedAt: '2025-01-01T00:00:00.000Z' }));
  const old = again.store.get('old');
  assert.equal(old?.model, undefined);
  assert.equal(old?.effort, undefined);
});
