/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** E2 s1 — the board host over a fake panel channel and the real reducer: open, reveal, out-of-order answers, failures, dispose, and the webview document. */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { ChatPanelChannel } from '../../chat/chat-panel.js';
import { BOARD_VIEW_TYPE, BOARD_WEBVIEW_SCRIPT, createDeliveryBoardHost, renderBoardDocument } from '../board-host.js';
import { parseBoardUpMessage, type BoardDownMessage, type Envelope } from '../board-protocol.js';
import type { DeliveryClient, DeliveryResult } from '../delivery-client.js';
import type { DeliverySnapshot } from '../delivery-contract.js';
import { item, snapshot as fixtureSnapshot } from './board-fixtures.js';
import { flush } from './flush.js';

interface FakeChannel extends ChatPanelChannel {
  html: string;
  readonly posted: Envelope<BoardDownMessage>[];
  reveals: number;
  send(raw: unknown): void;
  close(): void;
}

function fakeChannel(): FakeChannel {
  let onMsg: ((m: unknown) => void) | undefined;
  let onDispose: (() => void) | undefined;
  const ch: FakeChannel = {
    html: '',
    posted: [],
    reveals: 0,
    setHtml(h) { ch.html = h; },
    postMessage(m) { ch.posted.push(m as Envelope<BoardDownMessage>); },
    onMessage(l) { onMsg = l; },
    onDidDispose(l) { onDispose = l; },
    reveal() { ch.reveals++; },
    dispose() { onDispose?.(); },
    send(raw) { onMsg?.(raw); },
    close() { onDispose?.(); },
  };
  return ch;
}

interface Deferred { resolve(r: DeliveryResult<DeliverySnapshot>): void }

/** A client whose snapshot() calls stay outstanding until the test answers them, in any order. */
function controlledClient(): { client: DeliveryClient; calls: Deferred[] } {
  const calls: Deferred[] = [];
  const client: DeliveryClient = {
    snapshot: () => new Promise(resolve => { calls.push({ resolve }); }),
    evidence: async () => ({ ok: false, failure: { kind: 'read-failed', message: 'unused' } }),
  };
  return { client, calls };
}

/** Scoped stories with the given ids, in the given order. */
function snapshot(ids: readonly string[], takenAt: string): DeliverySnapshot {
  return fixtureSnapshot(ids.map(id => item({ id })), { takenAt });
}

function setup() {
  const channels: FakeChannel[] = [];
  const created: { viewType: string; title: string }[] = [];
  const logs = { warn: [] as string[], error: [] as string[] };
  const { client, calls } = controlledClient();
  const host = createDeliveryBoardHost({
    createPanel: (opts) => { created.push({ ...opts }); const c = fakeChannel(); channels.push(c); return c; },
    client,
    logger: { warn: m => logs.warn.push(m), error: m => logs.error.push(m) },
    now: () => '2026-10-09T12:00:00.000Z',
    genNonce: () => 'N0NCE',
  });
  return { host, channels, created, logs, calls };
}

const payloads = (c: FakeChannel) => c.posted.map(e => e.payload);
const lastBoard = (c: FakeChannel) => {
  const m = payloads(c).filter(p => p.type === 'board').at(-1);
  return m?.type === 'board' ? m.model : null;
};
/** Every card id on the last board posted, column by column. */
const lastItems = (c: FakeChannel) => lastBoard(c)?.columns.flatMap(col => col.cards.map(k => k.itemId)) ?? null;

test('opening the board creates one editor-tab panel with a CSP-locked document and posts the snapshot\'s items with its taken-at time', async () => {
  const { host, channels, created, calls } = setup();
  host.open();
  assert.deepEqual(created, [{ viewType: BOARD_VIEW_TYPE, title: 'Delivery board' }]);
  assert.equal(BOARD_VIEW_TYPE, 'insrc.deliveryBoard');
  const ch = channels[0]!;
  assert.match(ch.html, /content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-N0NCE';"/);
  assert.equal((ch.html.match(/<script/g) ?? []).length, 1, 'one script');
  assert.match(ch.html, /<script nonce="N0NCE">/);

  assert.equal(calls.length, 1, 'open starts a refresh');
  calls[0]!.resolve({ ok: true, value: snapshot(['a', 'b'], '2026-10-09T11:59:00.000Z') });
  await flush();
  const status = payloads(ch).filter(p => p.type === 'status').at(-1);
  assert.equal(status?.type === 'status' ? status.status.state : null, 'ready');
  assert.equal(status?.type === 'status' ? status.status.takenAt : null, '2026-10-09T11:59:00.000Z');
  assert.deepEqual(lastItems(ch), ['a', 'b']);

  host.open();
  assert.equal(created.length, 1, 'a second open reveals the same panel');
  assert.equal(ch.reveals, 1);
  assert.equal(calls.length, 2, 'and refreshes');
});

test('when the earlier refresh answers after the later one, only the later snapshot is posted', async () => {
  const { host, channels, logs, calls } = setup();
  host.open();
  const ch = channels[0]!;
  ch.send({ v: 1, payload: { type: 'refresh' } });
  assert.equal(calls.length, 2);
  calls[1]!.resolve({ ok: true, value: snapshot(['new'], '2026-10-09T11:00:02.000Z') });
  await flush();
  const before = ch.posted.length;
  calls[0]!.resolve({ ok: true, value: snapshot(['old'], '2026-10-09T11:00:01.000Z') });
  await flush();
  assert.equal(ch.posted.length, before, 'the superseded answer posts nothing');
  assert.deepEqual(lastItems(ch), ['new']);
  assert.equal(payloads(ch).some(p => p.type === 'board' && p.model.columns.some(c => c.cards.some(k => k.itemId === 'old'))), false);
  assert.equal(payloads(ch).some(p => p.type === 'items'), false, "the interim 'items' message is never sent");
  assert.equal(logs.warn.length, 1);
  assert.match(logs.warn[0]!, /dropped the answer to refresh 1 \(1 item\)/);

  ch.send({ v: 1, payload: { type: 'refresh' } });
  calls[2]!.resolve({ ok: false, failure: { kind: 'timed-out', message: 'took longer than 30 s' } });
  await flush();
  assert.equal(logs.error.length, 1, 'a failed refresh is logged through error()');
  assert.match(logs.error[0]!, /refresh 3 timed-out/);
  assert.deepEqual(lastItems(ch), ['new'], 'the last board stays shown');

  // A client that throws instead of returning a typed failure still ends the refresh.
  calls.length = 0;
  ch.send({ v: 1, payload: { type: 'refresh' } });
  (calls[0] as unknown as { resolve(v: unknown): void }).resolve(Promise.reject(new Error('socket exploded')));
  await flush();
  const status = payloads(ch).filter(p => p.type === 'status').at(-1);
  assert.equal(status?.type === 'status' ? status.status.state : null, 'failed', 'not stuck on loading');
  assert.match(status?.type === 'status' ? status.status.message ?? '' : '', /socket exploded/);

  // A snapshot the client accepts but that cannot be rendered never becomes the board's last snapshot.
  calls.length = 0;
  ch.send({ v: 1, payload: { type: 'refresh' } });
  const bad = snapshot(['x'], '2026-10-09T11:00:05.000Z');
  Object.defineProperty(bad.items[0], 'stage', { get() { throw new Error('unrenderable item'); } });
  calls[0]!.resolve({ ok: true, value: bad });
  await flush();
  const after = payloads(ch).filter(p => p.type === 'status').at(-1);
  assert.equal(after?.type === 'status' ? after.status.state : null, 'failed');
  assert.deepEqual(lastItems(ch), ['new'], 'the previous good board is still the one shown');
  ch.send({ v: 1, payload: { type: 'refresh' } });
  calls[1]!.resolve({ ok: true, value: snapshot(['fresh'], '2026-10-09T11:00:06.000Z') });
  await flush();
  assert.deepEqual(lastItems(ch), ['fresh'], 'and the next refresh recovers');
});

test('a client that throws synchronously ends the refresh as failed instead of leaving the board loading', async () => {
  const posted: Envelope<BoardDownMessage>[] = [];
  const ch = fakeChannel();
  const host = createDeliveryBoardHost({
    createPanel: () => ch,
    client: { snapshot: () => { throw new Error('no folder api'); }, evidence: () => { throw new Error('unused'); } },
    logger: { warn: () => undefined, error: () => undefined },
    now: () => '2026-10-09T12:00:00.000Z',
    genNonce: () => 'N0NCE',
  });
  host.open();
  await flush();
  posted.push(...ch.posted);
  const last = posted.map(e => e.payload).filter(p => p.type === 'status').at(-1);
  assert.equal(last?.type === 'status' ? last.status.state : null, 'failed');
  assert.match(last?.type === 'status' ? last.status.message ?? '' : '', /no folder api/);
});

test('an answer or timeout that arrives after the panel is closed is neither posted nor logged', async () => {
  const { host, channels, created, logs, calls } = setup();
  host.open();
  const ch = channels[0]!;
  ch.send({ v: 1, payload: { type: 'refresh' } });
  ch.close();
  const before = ch.posted.length;
  calls[0]!.resolve({ ok: true, value: snapshot(['a'], '2026-10-09T11:00:00.000Z') });
  calls[1]!.resolve({ ok: false, failure: { kind: 'timed-out', message: 'late' } });
  await flush();
  assert.equal(ch.posted.length, before);
  assert.deepEqual(logs, { warn: [], error: [] });

  host.open();
  assert.equal(created.length, 2, 'the next open creates a new panel');
  const next = channels[1]!;
  assert.equal(calls.length, 3);
  calls[2]!.resolve({ ok: true, value: snapshot(['b'], '2026-10-09T11:00:03.000Z') });
  await flush();
  assert.deepEqual(lastItems(next), ['b'], 'with a fresh state');

  host.dispose();
  host.open();
  calls[3]!.resolve({ ok: true, value: snapshot(['c'], '2026-10-09T11:00:04.000Z') });
  await flush();
  assert.deepEqual(lastItems(next), ['b'], 'nothing reaches a panel closed through dispose()');
  assert.equal(created.length, 3);
});

/** A fake DOM element: records text, attributes, children, listeners and form values; innerHTML throws. */
interface FakeEl {
  tag: string;
  textContent: string;
  value?: string;
  checked?: boolean;
  children: FakeEl[];
  attrs: Record<string, string>;
  listeners: Record<string, () => void>;
  readonly firstChild: FakeEl | null;
  removeChild(c: FakeEl): void;
  appendChild(c: FakeEl): void;
  setAttribute(k: string, v: string): void;
  addEventListener(k: string, f: () => void): void;
}

function makeEl(tag: string): FakeEl {
  const e: FakeEl = {
    tag, textContent: '', children: [], attrs: {}, listeners: {},
    get firstChild() { return e.children[0] ?? null; },
    removeChild(c) { e.children = e.children.filter(x => x !== c); },
    appendChild(c) { e.children.push(c); },
    setAttribute(k, v) { e.attrs[k] = v; },
    addEventListener(k, f) { e.listeners[k] = f; },
  };
  Object.defineProperty(e, 'innerHTML', { set() { throw new Error('innerHTML used'); }, get() { throw new Error('innerHTML used'); } });
  return e;
}

/** Every text in an element's subtree, depth first. */
const texts = (e: FakeEl): string[] => [e.textContent, ...e.children.flatMap(texts)].filter(t => t.length > 0);
const findAll = (e: FakeEl, pred: (x: FakeEl) => boolean): FakeEl[] => [...(pred(e) ? [e] : []), ...e.children.flatMap(c => findAll(c, pred))];

/** Run the webview script against the fake DOM; elements are created on first lookup by id. */
function runScript(): { posted: unknown[]; deliver(msg: unknown): void; el: Record<string, FakeEl> } {
  const el: Record<string, FakeEl> = {};
  const posted: unknown[] = [];
  let onMessage: ((e: { data: unknown }) => void) | undefined;
  const document = { getElementById: (id: string) => (el[id] ??= makeEl(id)), createElement: (tag: string) => makeEl(tag) };
  const window = { addEventListener: (_k: string, f: (e: { data: unknown }) => void) => { onMessage = f; } };
  const acquireVsCodeApi = () => ({ postMessage: (m: unknown) => posted.push(m) });
  new Function('document', 'window', 'acquireVsCodeApi', BOARD_WEBVIEW_SCRIPT)(document, window, acquireVsCodeApi);
  el['refresh']!.listeners['click']!();
  return { posted, deliver: m => onMessage?.({ data: m }), el };
}

/** A board model for the webview tests, built by the real host from a fixture snapshot. */
async function boardModelFor(snap: DeliverySnapshot) {
  const { ch } = await openWith(snap);
  const model = lastBoard(ch);
  assert.ok(model !== null);
  return model;
}

test('the board document inserts text only through textContent and posts only board up-messages', () => {
  const doc = renderBoardDocument('N0NCE');
  assert.doesNotMatch(doc, /innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
  assert.ok(doc.includes(BOARD_WEBVIEW_SCRIPT));

  const { posted, deliver, el } = runScript();
  assert.ok(posted.length >= 2);
  for (const m of posted) assert.notEqual(parseBoardUpMessage(m), null, `posted ${JSON.stringify(m)} is a BoardUpMessage envelope`);
  assert.deepEqual(posted.map(m => (m as { payload: { type: string } }).payload.type), ['ready', 'refresh']);

  const hostile = '<img src=x onerror=alert(1)>';
  deliver({ v: 1, payload: { type: 'status', status: { state: 'failed', takenAt: '2026-10-09T11:00:00.000Z', message: hostile, partialNotice: hostile, stale: true } } });
  assert.match(el['status']!.textContent, /<img src=x onerror=alert\(1\)>.*\(stale\)/);
  assert.equal(el['notice']!.textContent, hostile);
});

test('the board view renders titles and notices containing markup and script as literal text', async () => {
  const hostile = '<script>alert(1)</script><img src=x onerror=alert(2)>';
  const model = await boardModelFor(fixtureSnapshot([
    item({ id: 'E1', kind: 'epic', title: `Epic ${hostile}` }),
    item({ id: 'S1', parentId: 'E1', title: hostile, stage: 'complete',
      conflict: { failedTaskItemIds: ['S1:T001'], storyLevelFailed: false },
      notices: [{ code: 'unknown-route', message: hostile, itemIds: ['S1'], artifactIds: [], fileNames: [], attention: true }] as never }),
    item({ id: 'I1', kind: 'issue', standalone: true, title: 'Plain issue', stage: 'scoped' }),
  ]));
  const { deliver, el } = runScript();
  deliver({ v: 1, payload: { type: 'board', model } });

  const columns = el['board']!.children;
  assert.equal(columns.length, 6);
  assert.deepEqual(columns.map(c => c.children[0]!.textContent),
    ['Scoped (1)', 'Design & plan (0)', 'Ready · design approved (0)', 'Ready · plan approved (0)', 'Build recorded (0)', 'Complete (1)']);
  const cards = findAll(el['board']!, x => x.attrs['class'] === 'card');
  assert.deepEqual(cards.map(c => c.attrs['data-item-id']), ['I1', 'S1']);
  const s1 = cards[1]!;
  assert.deepEqual(texts(s1), [`Story · ${hostile}`, `Epic: Epic ${hostile}`, 'Validation conflict', 'Unknown route'],
    'the title, epic and badge labels are literal text');
  assert.equal(s1.attrs['aria-label'], model.columns[5]!.cards[0]!.accessibleLabel);
  assert.deepEqual(findAll(s1, x => x.attrs['class'] === 'badge').map(b => b.attrs['data-tone']), ['danger', 'warning']);
  assert.deepEqual(texts(cards[0]!), ['Issue · Plain issue', 'Standalone']);
  assert.equal(el['totals']!.textContent, '2 items, 0 needing attention');
  assert.equal(el['empty']!.textContent, '');
});

test('the board controls post only board up-messages, the scope control lists every epic, and an empty selection says nothing matches', async () => {
  const model = await boardModelFor(fixtureSnapshot([
    item({ id: 'EA', kind: 'epic', title: 'Alpha' }),
    item({ id: 'EB', kind: 'epic', title: null }),
    ...Array.from({ length: 55 }, (_, n) => item({ id: `EA:S${String(n).padStart(3, '0')}`, parentId: 'EA', stage: 'design-plan' })),
  ]));
  const { posted, deliver, el } = runScript();
  deliver({ v: 1, payload: { type: 'board', model } });

  const scope = el['scope']!;
  assert.deepEqual(scope.children.map(o => [o.value, o.textContent]), [['all', 'All work'], ['standalone', 'Standalone'], ['epic:EA', 'Alpha'], ['epic:EB', 'EB']]);
  assert.equal(scope.value, 'all');

  const more = findAll(el['board']!, x => x.tag === 'button');
  assert.deepEqual(more.map(b => b.textContent), ['Show 5 more']);
  more[0]!.listeners['click']!();
  el['search']!.value = 'alpha';
  el['search']!.listeners['input']!();
  el['attention']!.checked = true;
  el['attention']!.listeners['change']!();
  for (const v of ['epic:EA', 'standalone', 'all']) {
    scope.value = v;
    scope.listeners['change']!();
  }
  const sent = posted.slice(2);
  for (const m of sent) assert.notEqual(parseBoardUpMessage(m), null, `posted ${JSON.stringify(m)} is a BoardUpMessage envelope`);
  assert.deepEqual(sent.map(m => (m as { payload: unknown }).payload), [
    { type: 'show-more', stage: 'design-plan' },
    { type: 'set-search', search: 'alpha' },
    { type: 'set-attention', on: true },
    { type: 'set-scope', scope: { kind: 'epic', epicItemId: 'EA' } },
    { type: 'set-scope', scope: { kind: 'standalone' } },
    { type: 'set-scope', scope: { kind: 'all' } },
  ]);

  // An empty selection keeps the controls as the reader set them and says nothing matches.
  scope.value = 'epic:EB';
  const host = await openWith(fixtureSnapshot([item({ id: 'EB', kind: 'epic' }), item({ id: 'S1', standalone: true })]));
  host.ch.send({ v: 1, payload: { type: 'set-scope', scope: { kind: 'epic', epicItemId: 'EB' } } });
  const none = lastBoard(host.ch);
  assert.equal(none?.emptySelection, true, 'the host reports that the epic scope matches nothing');
  deliver({ v: 1, payload: { type: 'board', model: none } });
  assert.equal(el['empty']!.textContent, 'Nothing on the board matches the search and filters.');
  assert.equal(scope.value, 'epic:EB', 'the scope control keeps its choice');
  assert.equal(el['search']!.value, 'alpha');
});

/** Open the board and answer its first refresh with the given snapshot. */
async function openWith(snap: DeliverySnapshot) {
  const s = setup();
  s.host.open();
  s.calls[0]!.resolve({ ok: true, value: snap });
  await flush();
  return { ...s, ch: s.channels[0]! };
}

const column = (c: FakeChannel, stage: string) => lastBoard(c)?.columns.find(col => col.stage === stage);

test('show-more reveals the next page of one column, and a new search resets paging', async () => {
  const many = fixtureSnapshot([
    ...Array.from({ length: 60 }, (_, n) => item({ id: `S${String(n).padStart(3, '0')}`, title: `Story ${n}` })),
    item({ id: 'C1', stage: 'complete' }),
  ]);
  const { ch, calls, logs } = await openWith(many);
  assert.deepEqual([column(ch, 'scoped')?.cards.length, column(ch, 'scoped')?.hiddenCount, column(ch, 'scoped')?.total], [50, 10, 60]);

  ch.send({ v: 1, payload: { type: 'show-more', stage: 'scoped' } });
  assert.deepEqual([column(ch, 'scoped')?.cards.length, column(ch, 'scoped')?.hiddenCount], [60, 0], 'the next page of that column');
  assert.equal(column(ch, 'complete')?.cards.length, 1, 'other columns are unchanged');

  ch.send({ v: 1, payload: { type: 'refresh' } });
  calls[1]!.resolve({ ok: true, value: many });
  await flush();
  assert.equal(column(ch, 'scoped')?.cards.length, 60, 'a refresh keeps paging');

  ch.send({ v: 1, payload: { type: 'set-search', search: 'story' } });
  assert.deepEqual([column(ch, 'scoped')?.cards.length, column(ch, 'scoped')?.hiddenCount], [50, 10], 'a new search resets paging');
  ch.send({ v: 1, payload: { type: 'show-more', stage: 'scoped' } });
  ch.send({ v: 1, payload: { type: 'set-attention', on: false } });
  assert.equal(column(ch, 'scoped')?.cards.length, 50, 'an attention change resets paging too');
  ch.send({ v: 1, payload: { type: 'show-more', stage: 'scoped' } });
  ch.send({ v: 1, payload: { type: 'set-scope', scope: { kind: 'all' } } });
  assert.equal(column(ch, 'scoped')?.cards.length, 50, 'and so does a scope change');

  const before = ch.posted.length;
  ch.send({ v: 1, payload: { type: 'set-scope', scope: { kind: 'epic', epicItemId: 'no-such-epic' } } });
  ch.send({ v: 1, payload: { type: 'show-more', stage: 'shipped' } });
  assert.equal(ch.posted.length, before, 'an unknown epic or stage changes nothing');
  assert.equal(logs.warn.length, 2);
});

test('an item with an unknown stage is left off the board and logged once per refresh', async () => {
  const snap = fixtureSnapshot([item({ id: 'A', stage: 'shipped' }), item({ id: 'B', stage: 'shipped' }), item({ id: 'C', stage: 'scoped' })]);
  const { ch, calls, logs } = await openWith(snap);
  assert.deepEqual(lastItems(ch), ['C']);
  assert.equal(lastBoard(ch)?.totals.items, 1);
  assert.equal(logs.warn.length, 1);
  assert.match(logs.warn[0]!, /refresh 1 left items with unknown stages off the board: shipped \(2\)/);

  ch.send({ v: 1, payload: { type: 'set-search', search: 'c' } });
  ch.send({ v: 1, payload: { type: 'show-more', stage: 'scoped' } });
  ch.send({ v: 1, payload: { type: 'ready' } });
  assert.equal(logs.warn.length, 1, 'selection changes, show-more and ready do not log it again');

  ch.send({ v: 1, payload: { type: 'refresh' } });
  calls[1]!.resolve({ ok: true, value: snap });
  await flush();
  assert.equal(logs.warn.length, 2, 'the next applied refresh logs it once more');
});

test('a selection change that cannot be rendered keeps the previous board and is logged', async () => {
  // A malformed sourceIds renders while the search is empty (it is never read) and throws once a search reads it.
  const snap = fixtureSnapshot([item({ id: 'A', title: 'Alpha' }), item({ id: 'B', sourceIds: 42 as never })]);
  const { ch, logs } = await openWith(snap);
  assert.deepEqual(lastItems(ch), ['A', 'B']);

  ch.send({ v: 1, payload: { type: 'show-more', stage: 'scoped' } });
  const before = ch.posted.length;
  ch.send({ v: 1, payload: { type: 'set-search', search: 'alpha' } });
  assert.equal(ch.posted.length, before, 'nothing is posted');
  assert.equal(logs.error.length, 1);
  assert.match(logs.error[0]!, /set-search could not be shown/);

  // The previous state is kept: the search is still empty.
  ch.send({ v: 1, payload: { type: 'ready' } });
  assert.deepEqual(lastItems(ch), ['A', 'B']);
  ch.send({ v: 1, payload: { type: 'set-view', view: 'board' } });
  assert.equal(logs.error.length, 1, 'with the search unchanged, later intents render');
});
