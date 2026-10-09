/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** E2 s1 — the board host over a fake panel channel and the real reducer: open, reveal, out-of-order answers, failures, dispose, and the webview document. */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { ChatPanelChannel } from '../../chat/chat-panel.js';
import { BOARD_STYLE, BOARD_VIEW_TYPE, BOARD_WEBVIEW_SCRIPT, createDeliveryBoardHost, renderBoardDocument } from '../board-host.js';
import { parseBoardUpMessage, type BoardDownMessage, type Envelope } from '../board-protocol.js';
import type { DeliveryClient, DeliveryResult } from '../delivery-client.js';
import type { DeliveryEvidenceRecord, DeliverySnapshot } from '../delivery-contract.js';
import { evidence as ev, item, snapshot as fixtureSnapshot } from './board-fixtures.js';
import { cardsIn, findAll, focusState, keyEvent, runScript, texts, type FakeEl } from './board-webview-harness.js';
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
function snapshotOf(ids: readonly string[], takenAt: string): DeliverySnapshot {
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

/** The payloads of posted envelopes, in order; payloads() reads a fake channel's, payloadsOf() any posted list. */
const payloadsOf = (posted: readonly unknown[]) => posted.map(m => (m as Envelope<BoardDownMessage>).payload);
const payloads = (c: FakeChannel) => payloadsOf(c.posted);
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
  calls[0]!.resolve({ ok: true, value: snapshotOf(['a', 'b'], '2026-10-09T11:59:00.000Z') });
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
  calls[1]!.resolve({ ok: true, value: snapshotOf(['new'], '2026-10-09T11:00:02.000Z') });
  await flush();
  const before = ch.posted.length;
  calls[0]!.resolve({ ok: true, value: snapshotOf(['old'], '2026-10-09T11:00:01.000Z') });
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
  const bad = snapshotOf(['x'], '2026-10-09T11:00:05.000Z');
  Object.defineProperty(bad.items[0], 'stage', { get() { throw new Error('unrenderable item'); } });
  calls[0]!.resolve({ ok: true, value: bad });
  await flush();
  const after = payloads(ch).filter(p => p.type === 'status').at(-1);
  assert.equal(after?.type === 'status' ? after.status.state : null, 'failed');
  assert.deepEqual(lastItems(ch), ['new'], 'the previous good board is still the one shown');
  ch.send({ v: 1, payload: { type: 'refresh' } });
  calls[1]!.resolve({ ok: true, value: snapshotOf(['fresh'], '2026-10-09T11:00:06.000Z') });
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
  calls[0]!.resolve({ ok: true, value: snapshotOf(['a'], '2026-10-09T11:00:00.000Z') });
  calls[1]!.resolve({ ok: false, failure: { kind: 'timed-out', message: 'late' } });
  await flush();
  assert.equal(ch.posted.length, before);
  assert.deepEqual(logs, { warn: [], error: [] });

  host.open();
  assert.equal(created.length, 2, 'the next open creates a new panel');
  const next = channels[1]!;
  assert.equal(calls.length, 3);
  calls[2]!.resolve({ ok: true, value: snapshotOf(['b'], '2026-10-09T11:00:03.000Z') });
  await flush();
  assert.deepEqual(lastItems(next), ['b'], 'with a fresh state');

  host.dispose();
  host.open();
  calls[3]!.resolve({ ok: true, value: snapshotOf(['c'], '2026-10-09T11:00:04.000Z') });
  await flush();
  assert.deepEqual(lastItems(next), ['b'], 'nothing reaches a panel closed through dispose()');
  assert.equal(created.length, 3);
});

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
  // Boot mirrors the webview's density to the host before 'ready' (s5); the harness then clicks refresh.
  assert.deepEqual(posted.map(m => (m as { payload: { type: string } }).payload.type), ['set-density', 'ready', 'refresh']);

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
  const cards = cardsIn(el['board']!);
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
  const sent = posted.slice(3);   // after the boot posts: set-density, ready and the harness's refresh
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

  // A refresh that removes the scoped epic keeps it selectable, with a note, so the reader can see and clear it.
  const gone = await boardModelFor(fixtureSnapshot([item({ id: 'S1', standalone: true })]));
  deliver({ v: 1, payload: { type: 'board', model: gone } });
  assert.equal(scope.value, 'epic:EB');
  assert.deepEqual(scope.children.map(o => [o.value, o.textContent]), [['all', 'All work'], ['standalone', 'Standalone'], ['epic:EB', 'Epic no longer on the board']]);
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

test('a refresh whose loading state cannot be shown is logged and asks the daemon nothing', async () => {
  let explode = false;
  const a = item({ id: 'A' });
  Object.defineProperty(a, 'title', { get() { if (explode) throw new Error('title unreadable'); return 'Alpha'; } });
  const { ch, calls, logs } = await openWith(fixtureSnapshot([a]));
  assert.deepEqual(lastItems(ch), ['A']);
  explode = true;
  const before = ch.posted.length;
  ch.send({ v: 1, payload: { type: 'refresh' } });
  await flush();
  assert.equal(calls.length, 1, 'no second snapshot request');
  assert.equal(ch.posted.length, before);
  assert.equal(logs.error.length, 1);
  assert.match(logs.error[0]!, /refresh 2 could not start: title unreadable/);
});

const lastOf = <T extends BoardDownMessage['type']>(c: FakeChannel, type: T) => {
  const m = payloads(c).filter((p): p is Extract<BoardDownMessage, { type: T }> => p.type === type).at(-1);
  return m ?? null;
};

test('switching views posts the selected view with the same selection, and switching back keeps the board page', async () => {
  const many = fixtureSnapshot([
    item({ id: 'E1', kind: 'epic', title: 'Board epic' }),
    ...Array.from({ length: 60 }, (_, n) => item({ id: `E1:S${String(n).padStart(3, '0')}`, parentId: 'E1', title: `Board story ${n}` })),
    item({ id: 'I1', kind: 'issue', standalone: true, stage: 'design-plan', title: 'Board bug', correctsRef: { resolvedItemId: 'E1:S000' } as never }),
    item({ id: 'S99', standalone: true, title: 'Unrelated' }),
  ]);
  const { ch, logs } = await openWith(many);
  ch.send({ v: 1, payload: { type: 'set-search', search: 'board' } });
  ch.send({ v: 1, payload: { type: 'show-more', stage: 'scoped' } });
  assert.equal(column(ch, 'scoped')?.cards.length, 60);
  const boardTotal = lastBoard(ch)?.totals.items;

  const before = ch.posted.length;
  ch.send({ v: 1, payload: { type: 'set-view', view: 'epics' } });
  const sent = payloads(ch).slice(before - ch.posted.length);
  assert.deepEqual(sent.map(p => p.type), ['status', 'epics'], 'only the chosen view is posted');
  const epics = lastOf(ch, 'epics')!.model;
  assert.equal(epics.totals.items, boardTotal, 'the same search applies');
  assert.deepEqual(epics.epics.map(e => e.completionLabel), ['0 of 60 stories complete']);
  assert.deepEqual(epics.scopeOptions, [{ epicItemId: 'E1', title: 'Board epic' }], 'the scope control stays current on every tab');

  ch.send({ v: 1, payload: { type: 'set-view', view: 'issues' } });
  const iv = lastOf(ch, 'issues')!.model;
  assert.deepEqual(iv.issues.map(e => [e.card.itemId, e.parent?.itemId]), [['I1', 'E1:S000']]);

  ch.send({ v: 1, payload: { type: 'set-view', view: 'board' } });
  assert.deepEqual([column(ch, 'scoped')?.cards.length, column(ch, 'scoped')?.hiddenCount], [60, 0], 'switching back keeps the page');
  assert.equal(lastBoard(ch)?.totals.items, boardTotal);
  assert.deepEqual(logs, { warn: [], error: [] });
});

test('a follow link naming an item that is not on the board is ignored and logged', async () => {
  const { ch, logs } = await openWith(fixtureSnapshot([item({ id: 'A' }), item({ id: 'B' })]));
  ch.send({ v: 1, payload: { type: 'set-view', view: 'issues' } });
  const before = ch.posted.length;
  ch.send({ v: 1, payload: { type: 'select-item', itemId: 'gone' } });
  assert.equal(ch.posted.length, before, 'nothing is posted');
  assert.equal(logs.warn.length, 1);
  assert.match(logs.warn[0]!, /link to an item that is not on the board/);
  assert.equal(lastOf(ch, 'issues')!.model.selectedItemId, null, 'the selection is unchanged');

  ch.send({ v: 1, payload: { type: 'select-item', itemId: 'B' } });
  assert.equal(lastOf(ch, 'issues')!.model.selectedItemId, 'B', 'an item on the board is selected');
  assert.equal(logs.warn.length, 1);
});

test('the epic rollup and issue view render as text, and their tabs and links post only set-view and select-item', async () => {
  const hostile = '<img src=x onerror=alert(1)>';
  const snap = fixtureSnapshot([
    item({ id: 'E1', kind: 'epic', title: `Epic ${hostile}` }),
    item({ id: 'E1:S001', parentId: 'E1', stage: 'complete', title: 'Columns' }),
    item({ id: 'E1:S002', parentId: 'E1', stage: 'scoped', title: hostile }),
    item({ id: 'I1', kind: 'issue', standalone: true, stage: 'design-plan', title: 'Overflow', correctsRef: { resolvedItemId: 'E1:S001' } as never,
      childIds: ['I1:S001', 'I1:S002'] }),
    item({ id: 'I1:S001', parentId: 'I1', stage: 'complete', title: 'Wrap the text' }),
    item({ id: 'I1:S002', parentId: 'I1', stage: 'design-plan', title: 'Measure first' }),
    item({ id: 'I2', kind: 'issue', standalone: true, stage: 'scoped', title: 'Orphan',
      correctsRef: { resolvedItemId: null } as never,
      notices: [{ code: 'unresolved-parent', message: `cannot find ${hostile}`, itemIds: ['I2'], artifactIds: [], fileNames: [], attention: true }] as never }),
  ]);
  const host = await openWith(snap);
  host.ch.send({ v: 1, payload: { type: 'set-view', view: 'epics' } });
  const epics = lastOf(host.ch, 'epics')!;
  host.ch.send({ v: 1, payload: { type: 'set-view', view: 'issues' } });
  const issues = lastOf(host.ch, 'issues')!;

  const { posted, deliver, el } = runScript();
  deliver({ v: 1, payload: epics });
  const rows = el['board']!.children;
  assert.deepEqual(rows.map(g => texts(g)), [
    ['EPIC · E1', `Epic ${hostile}`, '1 of 2 stories complete', '2 stories · 0 tasks', 'No open gates'],
    ['Not in an epic', '1 of 2 stories complete', '2 stories · 0 tasks · 2 issues', 'No open gates'],
  ], 'titles, completion labels and counts as literal text; the fix stories (parent: their issue) are not in an epic');
  assert.equal(rows[0]!.attrs['data-epic'], 'E1');
  assert.equal(rows[1]!.attrs['data-epic'], undefined, "the 'Not in an epic' row names no epic");
  assert.equal(findAll(el['board']!, x => x.attrs['class'] === 'card').length, 0, 'the rollup lists counts, not cards');
  assert.equal(el['tab-epics']!.attrs['aria-pressed'], 'true');
  assert.equal(el['tab-board']!.attrs['aria-pressed'], 'false');
  assert.equal(el['totals']!.textContent, '6 items, 0 needing attention');

  deliver({ v: 1, payload: issues });
  const entries = el['board']!.children;
  assert.deepEqual(entries.map(e => e.attrs['data-item-id']), ['I1', 'I2']);
  assert.deepEqual(texts(entries[0]!).filter(t => !t.startsWith('Issue')), ['Standalone', 'Stage: Design & plan', 'Corrects: ', 'Story · Columns · Complete', 'Fix stories', 'Story · Wrap the text · Complete', 'Story · Measure first · Design & plan']);
  assert.ok(texts(entries[1]!).includes(`cannot find ${hostile}`), 'the unresolved-parent notice is literal text');
  assert.ok(texts(entries[1]!).includes('No fix stories yet'));
  assert.equal(el['tab-issues']!.attrs['aria-pressed'], 'true');

  // The links and tabs post only select-item and set-view.
  const links = findAll(el['board']!, x => x.attrs['class'] === 'link');
  assert.deepEqual(links.map(l => l.attrs['data-item-id']), ['E1:S001', 'I1:S001', 'I1:S002']);
  for (const l of links) l.listeners['click']!();
  for (const t of ['tab-board', 'tab-epics', 'tab-issues']) el[t]!.listeners['click']!();
  const sent = posted.slice(3);   // after the boot posts: set-density, ready and the harness's refresh
  for (const m of sent) assert.notEqual(parseBoardUpMessage(m), null, `posted ${JSON.stringify(m)} is a BoardUpMessage envelope`);
  assert.deepEqual(sent.map(m => (m as { payload: unknown }).payload), [
    { type: 'select-item', itemId: 'E1:S001' }, { type: 'select-item', itemId: 'I1:S001' }, { type: 'select-item', itemId: 'I1:S002' },
    { type: 'set-view', view: 'board' }, { type: 'set-view', view: 'epics' }, { type: 'set-view', view: 'issues' },
  ]);

  // An empty selection in either view says nothing matches.
  host.ch.send({ v: 1, payload: { type: 'set-search', search: 'no such thing' } });
  deliver({ v: 1, payload: lastOf(host.ch, 'issues')! });
  assert.equal(el['empty']!.textContent, 'Nothing on the board matches the search and filters.');
  host.ch.send({ v: 1, payload: { type: 'set-view', view: 'epics' } });
  deliver({ v: 1, payload: lastOf(host.ch, 'epics')! });
  assert.equal(el['empty']!.textContent, 'Nothing on the board matches the search and filters.');
  assert.deepEqual(el['board']!.children.map(g => g.children[0]!.textContent), [], 'no epic matches the search');

  // An issue view over a board with no issues says so, rather than that nothing matches.
  const plain = await openWith(fixtureSnapshot([item({ id: 'S1' })]));
  plain.ch.send({ v: 1, payload: { type: 'set-view', view: 'issues' } });
  deliver({ v: 1, payload: lastOf(plain.ch, 'issues')! });
  assert.equal(el['empty']!.textContent, 'There are no issues on the board.');
});

test('a logger that throws never leaves the board loading or stops a refresh', async () => {
  const { client, calls } = controlledClient();
  const ch = fakeChannel();
  const host = createDeliveryBoardHost({
    createPanel: () => ch,
    client,
    logger: { warn: () => { throw new Error('warn sink down'); }, error: () => { throw new Error('error sink down'); } },
    now: () => '2026-10-09T12:00:00.000Z',
    genNonce: () => 'N0NCE',
  });
  host.open();
  calls[0]!.resolve({ ok: false, failure: { kind: 'timed-out', message: 'slow' } });
  await flush();
  const status = payloads(ch).filter(p => p.type === 'status').at(-1);
  assert.equal(status?.type === 'status' ? status.status.state : null, 'failed', 'the failure is shown even though logging it threw');

  ch.send({ v: 1, payload: { type: 'refresh' } });
  ch.send({ v: 1, payload: { type: 'refresh' } });
  calls[2]!.resolve({ ok: true, value: fixtureSnapshot([item({ id: 'A', stage: 'shipped' }), item({ id: 'B' })]) });
  calls[1]!.resolve({ ok: true, value: fixtureSnapshot([item({ id: 'old' })]) });
  await flush();
  assert.deepEqual(lastItems(ch), ['B'], 'the newer answer is applied; the dropped one and the unknown stage are logged into a broken sink without harm');
  ch.send({ v: 1, payload: { type: 'select-item', itemId: 'nowhere' } });
  assert.deepEqual(lastItems(ch), ['B']);
});

// ---------------------------------------------------------------------------
// E2 s4 — the item details: PLAN reads, evidence routing and the details memory.

interface EvidenceCall { artifactId: string; resolve(r: DeliveryResult<DeliveryEvidenceRecord>): void }

/** A host whose snapshot and evidence reads both stay outstanding until the test answers them. */
function detailsSetup(opts: { reviewPane?: boolean } = {}) {
  const channels: FakeChannel[] = [];
  const logs = { warn: [] as string[], error: [] as string[] };
  const snapshots: Deferred[] = [];
  const evidence: EvidenceCall[] = [];
  const opened: { artifactId: string; mdPath: string }[] = [];
  const host = createDeliveryBoardHost({
    createPanel: () => { const c = fakeChannel(); channels.push(c); return c; },
    client: {
      snapshot: () => new Promise(resolve => { snapshots.push({ resolve }); }),
      evidence: (artifactId) => new Promise(resolve => { evidence.push({ artifactId, resolve }); }),
    },
    logger: { warn: m => logs.warn.push(m), error: m => logs.error.push(m) },
    now: () => '2026-10-09T12:00:00.000Z',
    genNonce: () => 'N0NCE',
    ...(opts.reviewPane === true ? { reviewPane: { openArtifact: (t: { artifactId: string; mdPath: string }) => { opened.push({ ...t }); } } } : {}),
  });
  return { host, channels, logs, snapshots, evidence, opened };
}

/** A story with a PLAN, an LLD that opens in the review pane and a BUILD, and its two task items. */
function storySnapshot(takenAt = '2026-10-09T11:00:00.000Z'): DeliverySnapshot {
  return fixtureSnapshot([
    item({ id: 'S1', title: 'Details', stage: 'build-recorded', childIds: ['S1:T1', 'S1:T2'],
      tasks: [{ taskItemId: 'S1:T1', result: 'passed', planned: true }, { taskItemId: 'S1:T2', result: 'failed', planned: true }],
      validation: { passed: 1, failed: 1, unrecorded: 0, unplanned: 0 },
      evidence: [ev('BUILD-x', 'BUILD'), ev('LLD-x', 'LLD', { mdPath: 'docs/e/S001/LLD.md', openWith: 'review-view' }), ev('PLAN-x', 'PLAN')] }),
    item({ id: 'S1:T1', kind: 'task', parentId: 'S1', title: 'Types', sourceIds: ['t1'] }),
    item({ id: 'S1:T2', kind: 'task', parentId: 'S1', title: 'Builder', sourceIds: ['t2'] }),
    item({ id: 'S2', title: 'No plan' }),
  ], { takenAt });
}

const planRecord = (body: unknown): DeliveryEvidenceRecord => ({ artifactId: 'PLAN-x', kind: 'PLAN', meta: {}, body, renderedMarkdown: null });
const PLAN_BODY = { tasks: [
  { id: 't1', dependsOn: [], acceptanceChecks: ['types compile'] },
  { id: 't2', dependsOn: ['t1'], acceptanceChecks: ['rows built'] },
] };
const detailsOf = (c: FakeChannel) => payloads(c).filter(p => p.type === 'details').map(p => (p.type === 'details' ? p.model : null));
const send = (c: FakeChannel, payload: unknown) => c.send({ v: 1, payload });

async function openOn(s: ReturnType<typeof detailsSetup>, snap: DeliverySnapshot): Promise<FakeChannel> {
  s.host.open();
  s.snapshots[0]!.resolve({ ok: true, value: snap });
  await flush();
  return s.channels[0]!;
}

test('opening a story reads its plan once per snapshot and shows the dependencies when it arrives', async () => {
  const s = detailsSetup();
  const ch = await openOn(s, storySnapshot());
  assert.deepEqual(detailsOf(ch), [], 'nothing is selected yet, so no details are posted');

  send(ch, { type: 'select-item', itemId: 'S1' });
  const loading = detailsOf(ch).at(-1)!;
  assert.equal(loading.itemId, 'S1');
  assert.ok(loading.tasks.every(t => t.dependsOn === null), 'the plan is still loading');
  assert.deepEqual(payloads(ch).slice(-3).map(p => p.type), ['board', 'details', 'announce'], 'details come after the view message, and the selection announcement last (s5)');
  assert.deepEqual(s.evidence.map(e => e.artifactId), ['PLAN-x'], 'one evidence read for the PLAN');

  s.evidence[0]!.resolve({ ok: true, value: planRecord(PLAN_BODY) });
  await flush();
  const ready = detailsOf(ch).at(-1)!;
  assert.deepEqual(ready.tasks.map(t => [t.title, t.dependsOn, t.acceptanceChecks]), [
    ['Types', [], ['types compile']],
    ['Builder', ['Types'], ['rows built']],
  ]);
  assert.equal(ready.planNotice, null);

  // Reopening it in the same snapshot uses the read already made.
  send(ch, { type: 'close-details' });
  assert.equal(detailsOf(ch).at(-1), null, 'close-details posts details null');
  send(ch, { type: 'select-item', itemId: 'S2' });
  assert.equal(detailsOf(ch).at(-1)!.itemId, 'S2');
  send(ch, { type: 'select-item', itemId: 'S1' });
  assert.equal(s.evidence.length, 1, 'no second read in the same snapshot');
  assert.deepEqual(detailsOf(ch).at(-1)!.tasks[1]!.dependsOn, ['Types']);

  // A new snapshot reads again.
  send(ch, { type: 'refresh' });
  s.snapshots[1]!.resolve({ ok: true, value: storySnapshot('2026-10-09T11:05:00.000Z') });
  await flush();
  assert.deepEqual(s.evidence.map(e => e.artifactId), ['PLAN-x', 'PLAN-x'], 'a new snapshot reads the plan again');
  assert.ok(detailsOf(ch).at(-1)!.tasks.every(t => t.dependsOn === null), 'and shows it loading until it arrives');
});

test('a review-view record opens in the review pane and a build record opens read-only from the daemon as text', async () => {
  const s = detailsSetup({ reviewPane: true });
  const ch = await openOn(s, storySnapshot());
  send(ch, { type: 'select-item', itemId: 'S1' });
  s.evidence[0]!.resolve({ ok: true, value: planRecord(PLAN_BODY) });
  await flush();

  send(ch, { type: 'open-evidence', itemId: 'S1', artifactId: 'LLD-x' });
  assert.deepEqual(s.opened, [{ artifactId: 'LLD-x', mdPath: 'docs/e/S001/LLD.md' }]);
  assert.equal(s.evidence.length, 1, 'the review pane reads it; the board does not');

  send(ch, { type: 'open-evidence', itemId: 'S1', artifactId: 'BUILD-x' });
  assert.deepEqual(s.evidence.map(e => e.artifactId), ['PLAN-x', 'BUILD-x']);
  s.evidence[1]!.resolve({ ok: true, value: { artifactId: 'BUILD-x', kind: 'BUILD', meta: { a: 1 }, body: { b: 2 }, renderedMarkdown: null } });
  await flush();
  assert.deepEqual(detailsOf(ch).at(-1)!.openedRecord, {
    artifactId: 'BUILD-x', text: JSON.stringify({ meta: { a: 1 }, body: { b: 2 } }, null, 2),
  });

  // Two quick opens: only the later one is shown, whichever read answers last.
  send(ch, { type: 'open-evidence', itemId: 'S1', artifactId: 'PLAN-x' });
  send(ch, { type: 'open-evidence', itemId: 'S1', artifactId: 'BUILD-x' });
  assert.deepEqual(s.evidence.slice(2).map(e => e.artifactId), ['PLAN-x', 'BUILD-x']);
  s.evidence[3]!.resolve({ ok: true, value: { artifactId: 'BUILD-x', kind: 'BUILD', meta: {}, body: {}, renderedMarkdown: '# Build' } });
  await flush();
  s.evidence[2]!.resolve({ ok: true, value: planRecord(PLAN_BODY) });
  await flush();
  assert.deepEqual(detailsOf(ch).at(-1)!.openedRecord, { artifactId: 'BUILD-x', text: '# Build' }, 'the earlier open answering later is dropped');

  // A rejected open does not cancel a read still in flight.
  send(ch, { type: 'open-evidence', itemId: 'S1', artifactId: 'PLAN-x' });
  send(ch, { type: 'open-evidence', itemId: 'S1', artifactId: 'NOT-HERE' });
  s.evidence[4]!.resolve({ ok: true, value: { ...planRecord(PLAN_BODY), renderedMarkdown: '# Plan' } });
  await flush();
  assert.deepEqual(detailsOf(ch).at(-1)!.openedRecord, { artifactId: 'PLAN-x', text: '# Plan' }, 'the accepted open is still shown');

  // A record that is not the selected item's evidence is ignored and logged.
  send(ch, { type: 'open-evidence', itemId: 'S1', artifactId: 'CR-elsewhere' });
  send(ch, { type: 'open-evidence', itemId: 'S2', artifactId: 'BUILD-x' });
  assert.equal(s.evidence.length, 5);
  assert.equal(s.logs.warn.filter(w => /not the selected item's evidence/.test(w)).length, 3);

  // close-details clears the opened record.
  send(ch, { type: 'close-details' });
  send(ch, { type: 'select-item', itemId: 'S1' });
  assert.equal(detailsOf(ch).at(-1)!.openedRecord, null);

  // With no review pane, a review-view record is read too; rendered markdown is preferred, and a failure is shown.
  const s2 = detailsSetup();
  const ch2 = await openOn(s2, storySnapshot());
  send(ch2, { type: 'select-item', itemId: 'S1' });
  send(ch2, { type: 'open-evidence', itemId: 'S1', artifactId: 'LLD-x' });
  assert.deepEqual(s2.evidence.map(e => e.artifactId), ['PLAN-x', 'LLD-x']);
  s2.evidence[1]!.resolve({ ok: true, value: { artifactId: 'LLD-x', kind: 'LLD', meta: {}, body: {}, renderedMarkdown: '# LLD' } });
  await flush();
  assert.deepEqual(detailsOf(ch2).at(-1)!.openedRecord, { artifactId: 'LLD-x', text: '# LLD' });
  send(ch2, { type: 'open-evidence', itemId: 'S1', artifactId: 'BUILD-x' });
  s2.evidence[2]!.resolve({ ok: false, failure: { kind: 'timed-out', message: 'took longer than 10 s' } });
  await flush();
  assert.deepEqual(detailsOf(ch2).at(-1)!.openedRecord, { artifactId: 'BUILD-x', text: 'Could not read BUILD-x: took longer than 10 s' });
  assert.ok(s2.logs.error.some(e => /record BUILD-x timed-out/.test(e)));
});

test('a failed, malformed or stale plan read leaves the details standing with a notice', async () => {
  // Failed.
  const s = detailsSetup();
  const ch = await openOn(s, storySnapshot());
  send(ch, { type: 'select-item', itemId: 'S1' });
  s.evidence[0]!.resolve({ ok: false, failure: { kind: 'read-failed', message: 'no such record' } });
  await flush();
  const failed = detailsOf(ch).at(-1)!;
  assert.equal(failed.planNotice, 'The plan could not be read: no such record');
  assert.deepEqual(failed.tasks.map(t => t.resultLabel), ['Passed', 'Failed'], 'the rest of the details stand');
  assert.ok(s.logs.error.some(e => /plan PLAN-x read-failed: no such record/.test(e)));

  // No task list, and malformed entries skipped.
  const s2 = detailsSetup();
  const ch2 = await openOn(s2, storySnapshot());
  send(ch2, { type: 'select-item', itemId: 'S1' });
  s2.evidence[0]!.resolve({ ok: true, value: planRecord({ summary: 'no tasks' }) });
  await flush();
  assert.equal(detailsOf(ch2).at(-1)!.planNotice, 'The plan could not be read: The plan record has no task list');
  const s3 = detailsSetup();
  const ch3 = await openOn(s3, storySnapshot());
  send(ch3, { type: 'select-item', itemId: 'S1' });
  s3.evidence[0]!.resolve({ ok: true, value: planRecord({ tasks: [
    { id: 't1', dependsOn: 'not a list' },
    null,
    { id: 7, dependsOn: [], acceptanceChecks: ['no string id'] },
    { id: 't2', dependsOn: ['t1'], acceptanceChecks: ['rows built'] },
  ] }) });
  await flush();
  assert.deepEqual(detailsOf(ch3).at(-1)!.tasks.map(t => [t.dependsOn, t.acceptanceChecks]), [[[], []], [['Types'], ['rows built']]],
    'a task with a string id keeps its row, its malformed lists read as empty, and entries without a string id are skipped');

  // Stale: a read that finishes after a newer snapshot is dropped; one after the panel closed posts nothing.
  const s4 = detailsSetup();
  const ch4 = await openOn(s4, storySnapshot());
  send(ch4, { type: 'select-item', itemId: 'S1' });
  send(ch4, { type: 'refresh' });
  s4.snapshots[1]!.resolve({ ok: true, value: storySnapshot('2026-10-09T11:05:00.000Z') });
  await flush();
  s4.evidence[0]!.resolve({ ok: true, value: planRecord(PLAN_BODY) });
  await flush();
  assert.ok(detailsOf(ch4).at(-1)!.tasks.every(t => t.dependsOn === null), 'the old snapshot\'s answer is not shown');
  assert.ok(s4.logs.warn.some(w => /dropped the plan read of PLAN-x/.test(w)));
  s4.evidence[1]!.resolve({ ok: true, value: planRecord(PLAN_BODY) });
  await flush();
  assert.deepEqual(detailsOf(ch4).at(-1)!.tasks[1]!.dependsOn, ['Types'], 'the new snapshot\'s own read is');

  // A record read that answers after a newer snapshot was applied is dropped, as a stale plan read is.
  const s7 = detailsSetup();
  const ch7 = await openOn(s7, storySnapshot());
  send(ch7, { type: 'select-item', itemId: 'S1' });
  send(ch7, { type: 'open-evidence', itemId: 'S1', artifactId: 'BUILD-x' });
  send(ch7, { type: 'refresh' });
  s7.snapshots[1]!.resolve({ ok: true, value: storySnapshot('2026-10-09T11:05:00.000Z') });
  await flush();
  s7.evidence[1]!.resolve({ ok: true, value: { artifactId: 'BUILD-x', kind: 'BUILD', meta: {}, body: {}, renderedMarkdown: '# Old build' } });
  await flush();
  assert.equal(detailsOf(ch7).at(-1)!.openedRecord, null, 'the old snapshot\'s record is not shown');

  // A selection that cannot be rendered changes nothing, so the opened record stays.
  const s8 = detailsSetup();
  const broken = fixtureSnapshot([...storySnapshot().items, item({ id: 'S9', title: 'Broken', tasks: 42 as never })]);
  const ch8 = await openOn(s8, broken);
  send(ch8, { type: 'select-item', itemId: 'S1' });
  send(ch8, { type: 'open-evidence', itemId: 'S1', artifactId: 'BUILD-x' });
  s8.evidence[1]!.resolve({ ok: true, value: { artifactId: 'BUILD-x', kind: 'BUILD', meta: {}, body: {}, renderedMarkdown: '# Build' } });
  await flush();
  send(ch8, { type: 'select-item', itemId: 'S9' });
  assert.ok(s8.logs.error.some(e => /select-item could not be shown/.test(e)));
  send(ch8, { type: 'ready' });
  assert.equal(detailsOf(ch8).at(-1)!.itemId, 'S1', 'the selection stays');
  assert.deepEqual(detailsOf(ch8).at(-1)!.openedRecord, { artifactId: 'BUILD-x', text: '# Build' }, 'and so does its opened record');

  // A board that cannot be re-shown when an answer arrives logs the failure instead of rejecting unseen.
  const s6 = detailsSetup();
  const ch6 = await openOn(s6, storySnapshot());
  send(ch6, { type: 'select-item', itemId: 'S1' });
  send(ch6, { type: 'open-evidence', itemId: 'S1', artifactId: 'BUILD-x' });
  ch6.postMessage = () => { throw new Error('webview gone'); };
  s6.evidence[0]!.resolve({ ok: true, value: planRecord(PLAN_BODY) });
  s6.evidence[1]!.resolve({ ok: true, value: { artifactId: 'BUILD-x', kind: 'BUILD', meta: {}, body: {}, renderedMarkdown: '# Build' } });
  await flush();
  assert.ok(s6.logs.error.some(e => /plan PLAN-x could not be shown: webview gone/.test(e)));
  assert.ok(s6.logs.error.some(e => /record BUILD-x could not be shown: webview gone/.test(e)));

  const s5 = detailsSetup();
  const ch5 = await openOn(s5, storySnapshot());
  send(ch5, { type: 'select-item', itemId: 'S1' });
  ch5.close();
  const before = ch5.posted.length;
  s5.evidence[0]!.resolve({ ok: true, value: planRecord(PLAN_BODY) });
  await flush();
  assert.equal(ch5.posted.length, before, 'a read that finishes after the panel closed posts nothing');
});

test('the details pane renders as text and its controls post only select-item, close-details and open-evidence', async () => {
  // The model comes from the real host over a snapshot whose title, notice and opened record carry markup.
  const hostile = '<img src=x onerror=alert(1)>';
  const snap = fixtureSnapshot([
    item({ id: 'S1', title: `Details ${hostile}`, stage: 'build-recorded', parentId: 'E1', childIds: ['S1:T1'], sourceIds: ['s1'],
      tasks: [{ taskItemId: 'S1:T1', result: 'failed', planned: true }],
      validation: { passed: 0, failed: 1, unrecorded: 0, unplanned: 0 },
      conflict: { failedTaskItemIds: ['S1:T1'], storyLevelFailed: false },
      notices: [{ code: 'unplanned-task', message: `odd ${hostile}`, itemIds: ['S1'], artifactIds: [], fileNames: [] }] as never,
      evidence: [ev('BUILD-x', 'BUILD'), ev('LLD-x', 'LLD', { mdPath: 'docs/e/S001/LLD.md', openWith: 'review-view' }), ev('PLAN-x', 'PLAN')] }),
    item({ id: 'S1:T1', kind: 'task', parentId: 'S1', title: 'Types', sourceIds: ['t1'] }),
    item({ id: 'E1', kind: 'epic', title: 'Board epic', childIds: ['S1'] }),
  ]);
  const withReason = { ...snap, items: snap.items.map(i => (i.id === 'S1' ? { ...i, stage: { ...i.stage!, reason: { text: 'A build is recorded.', artifactIds: ['BUILD-x'] } } } : i)) };
  const s = detailsSetup();
  const ch = await openOn(s, withReason);
  send(ch, { type: 'select-item', itemId: 'S1' });
  s.evidence[0]!.resolve({ ok: true, value: planRecord({ tasks: [{ id: 't1', dependsOn: ['t0'], acceptanceChecks: ['types compile'] }] }) });
  await flush();
  send(ch, { type: 'open-evidence', itemId: 'S1', artifactId: 'BUILD-x' });
  s.evidence[1]!.resolve({ ok: true, value: { artifactId: 'BUILD-x', kind: 'BUILD', meta: {}, body: {}, renderedMarkdown: `# Build ${hostile}` } });
  await flush();
  const model = detailsOf(ch).at(-1)!;
  assert.ok(model.openedRecord !== null);

  const { posted, deliver, el } = runScript();
  posted.length = 0;
  deliver({ v: 1, payload: { type: 'details', model } });
  const pane = el['details']!;
  assert.equal('hidden' in pane.attrs, false, 'the pane is shown');
  const shown = texts(pane);
  for (const t of [
    `Details ${hostile}`, 'Stage: Build recorded', 'A build is recorded. (BUILD-x)',
    'The build is approved while 1 task result failed (Types).',
    '0 passed, 1 failed, 0 unrecorded, 0 unplanned', 'Types \u00b7 Failed', 'Depends on: t0', 'types compile',
    'BUILD BUILD-x \u00b7 Approved', 'LLD LLD-x \u00b7 Approved', `Unplanned task: odd ${hostile}`,
    'Parent: Board epic', 'Child: Types', 'Sources: s1', 'Record BUILD-x',
  ]) assert.ok(shown.includes(t), `shows ${t}`);
  const pre = findAll(pane, e => e.tag === 'pre');
  assert.equal(pre.length, 1);
  assert.equal(pre[0]!.textContent, `# Build ${hostile}`, 'the opened record is literal text in a <pre>');
  assert.equal(findAll(pane, e => e.tag === 'img').length, 0, 'markup never becomes elements');

  // The controls: close, one open per record, and the linked items.
  const buttons = findAll(pane, e => e.tag === 'button');
  const click = (text: string) => buttons.find(b => b.textContent === text)!.listeners['click']!();
  click('Close details');
  click('Open read-only');
  click('Open in review');
  click('Parent: Board epic');
  // A card click in the board view posts select-item.
  deliver({ v: 1, payload: { type: 'board', model: lastBoard(ch) } });
  const card = findAll(el['board']!, e => e.attrs['data-item-id'] === 'S1' && e.tag === 'li')[0]!;
  card.listeners['click']!();
  for (const m of posted) assert.notEqual(parseBoardUpMessage(m), null, `posted ${JSON.stringify(m)} is a BoardUpMessage envelope`);
  assert.deepEqual(posted.map(m => (m as { payload: unknown }).payload), [
    { type: 'close-details' },
    { type: 'open-evidence', itemId: 'S1', artifactId: 'BUILD-x' },
    { type: 'open-evidence', itemId: 'S1', artifactId: 'LLD-x' },
    { type: 'select-item', itemId: 'E1' },
    { type: 'select-item', itemId: 'S1' },
  ]);

  // A null model clears the pane.
  deliver({ v: 1, payload: { type: 'details', model: null } });
  assert.deepEqual(pane.children, []);
  assert.equal('hidden' in pane.attrs, true);
});

// ---------------------------------------------------------------------------
// E2 s5 — narrow pane, keyboard, announcements and density.

test('a narrow pane stacks the columns into one list grouped by stage, and no rule hides a card, badge or warning', async () => {
  const doc = renderBoardDocument('N0NCE');
  assert.equal((doc.match(/<style>/g) ?? []).length, 1, 'one stylesheet');
  assert.ok(doc.includes(`<style>${BOARD_STYLE}</style>`));
  assert.match(doc, /content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-N0NCE';"/, 'the CSP is unchanged');

  // Wide: columns side by side. Narrow: the same sections stacked, one per stage, under their headings.
  assert.match(BOARD_STYLE, /\.board\{display:grid;/);
  const narrow = /@media \(max-width:600px\)\{(.*)\}$/.exec(BOARD_STYLE)?.[1] ?? '';
  assert.match(narrow, /\.board\{display:block;\}/, 'below 600 px the columns stack into one list');
  assert.match(narrow, /\.board>section\{/);
  // Nothing is hidden at any width or density.
  for (const hiding of [/display:\s*none/, /visibility:\s*hidden/, /clip/, /text-overflow/, /overflow:\s*hidden/, /height:\s*0/]) {
    assert.doesNotMatch(BOARD_STYLE, hiding, `no ${hiding} rule`);
  }
  // Colours come only from the theme.
  assert.doesNotMatch(BOARD_STYLE, /#[0-9a-fA-F]{3,8}\b|rgb\(|hsl\(/, 'no literal colour');
  for (const v of BOARD_STYLE.match(/var\(--[a-zA-Z-]+/g) ?? []) {
    assert.match(v, /^var\(--(vscode-|gap|pad|small)/, `${v} is a theme or density variable`);
  }
  // Density changes spacing and size only; focus is always visible.
  assert.match(BOARD_STYLE, /body\[data-density="compact"\]\{--gap:[^;]+;--pad:[^;]+;--small:[^;]+;font-size:[^;}]+;\}/);
  assert.match(BOARD_STYLE, /body\[data-density="comfortable"\]\{--gap:[^;]+;--pad:[^;]+;--small:[^;}]+;\}/);
  assert.match(BOARD_STYLE, /:focus-visible\{outline:2px solid var\(--vscode-focusBorder\)/);

  // One announcer; the status keeps its role but is not live; the density control is two pressed-state buttons.
  assert.deepEqual(doc.match(/aria-live="[^"]+"/g), ['aria-live="polite"']);
  assert.match(doc, /<p id="announce" class="announce" aria-live="polite" aria-atomic="true"><\/p>/);
  assert.match(doc, /<p id="status" role="status"><\/p>/);
  assert.match(doc, /<button id="density-compact" type="button" aria-pressed="false">Compact<\/button>/);
  assert.match(doc, /<button id="density-comfortable" type="button" aria-pressed="true">Comfortable<\/button>/);

  // The board's DOM is still one section per stage with every card and badge, whatever the width.
  const snap = fixtureSnapshot([
    item({ id: 'S1', stage: 'scoped', title: 'One', needsAttention: true, attentionReasons: ['rejected'] }),
    item({ id: 'S2', stage: 'complete', title: 'Two' }),
  ]);
  const { ch } = await openWith(snap);
  const { deliver, el } = runScript();
  deliver({ v: 1, payload: { type: 'board', model: lastBoard(ch) } });
  const sections = findAll(el['board']!, e => e.tag === 'section');
  assert.equal(sections.length, 6, 'one group per stage');
  assert.deepEqual(cardsIn(el['board']!).map(c => c.attrs['data-item-id']), ['S1', 'S2']);
  assert.ok(texts(el['board']!).includes('Rejected'), 'the warning badge is rendered');
});

test('a selection and a settled refresh are each announced once, and loading, superseded answers, reloads and other intents announce nothing', async () => {
  const s = detailsSetup();
  const announces = (c: FakeChannel) => payloads(c).filter(p => p.type === 'announce').map(p => (p.type === 'announce' ? p.text : ''));
  s.host.open();
  const ch = s.channels[0]!;
  assert.deepEqual(announces(ch), [], 'loading announces nothing');
  const snap = fixtureSnapshot([
    item({ id: 'S1', title: 'Details', stage: 'build-recorded', needsAttention: true, attentionReasons: ['rejected'] }),
    item({ id: 'S2', title: 'Second', stage: 'scoped' }),
    item({ id: 'E1', kind: 'epic', title: 'Epic' }),
  ]);
  s.snapshots[0]!.resolve({ ok: true, value: snap });
  await flush();
  assert.deepEqual(announces(ch), ['Board refreshed: 2 items, 1 needing attention'], 'counted over the placeable items of the whole snapshot');
  assert.equal(payloads(ch).at(-1)!.type, 'announce', 'after the status and the view');

  // A selection that changes announces once, after the view and details; reselecting or a missing item says nothing.
  send(ch, { type: 'select-item', itemId: 'S1' });
  assert.deepEqual(payloads(ch).slice(-3).map(p => p.type), ['board', 'details', 'announce']);
  assert.equal(announces(ch).at(-1), 'Selected: Details \u00b7 Build recorded');
  send(ch, { type: 'select-item', itemId: 'S1' });
  send(ch, { type: 'select-item', itemId: 'GONE' });
  send(ch, { type: 'select-item', itemId: 'E1' });
  assert.deepEqual(announces(ch).slice(1), ['Selected: Details \u00b7 Build recorded', 'Selected: Epic'], 'an item with no stage is named alone');

  // Other intents and a webview reload announce nothing.
  const before = announces(ch).length;
  for (const p of [{ type: 'close-details' }, { type: 'set-view', view: 'epics' }, { type: 'set-view', view: 'board' }, { type: 'set-search', search: 'x' },
    { type: 'set-search', search: '' }, { type: 'set-scope', scope: { kind: 'standalone' } }, { type: 'set-attention', on: true },
    { type: 'set-density', density: 'compact' }, { type: 'show-more', stage: 'scoped' }, { type: 'ready' }]) send(ch, p);
  assert.equal(announces(ch).length, before);

  // A superseded answer announces nothing; the applied one announces once. A failure announces its message.
  send(ch, { type: 'refresh' });
  send(ch, { type: 'refresh' });
  s.snapshots[2]!.resolve({ ok: true, value: snap });
  await flush();
  s.snapshots[1]!.resolve({ ok: true, value: snap });
  await flush();
  assert.equal(announces(ch).length, before + 1);
  send(ch, { type: 'refresh' });
  s.snapshots[3]!.resolve({ ok: false, failure: { kind: 'timed-out', message: 'took too long' } });
  await flush();
  assert.match(announces(ch).at(-1)!, /^The refresh failed at .*: took too long Showing the board from/);
  assert.equal(announces(ch).length, before + 2);

  // A closed panel's answer announces nothing.
  send(ch, { type: 'refresh' });
  ch.close();
  s.snapshots[4]!.resolve({ ok: true, value: snap });
  await flush();
  assert.equal(announces(ch).length, before + 2);

  // An announcement that cannot be posted is only logged; the refresh still counts as rendered.
  const s2 = detailsSetup();
  s2.host.open();
  const ch2 = s2.channels[0]!;
  const post = ch2.postMessage;
  ch2.postMessage = (m) => { if ((m as Envelope<BoardDownMessage>).payload.type === 'announce') throw new Error('gone'); post(m); };
  s2.snapshots[0]!.resolve({ ok: true, value: snap });
  await flush();
  assert.ok(s2.logs.error.some(e => /result could not be announced: gone/.test(e)));
  const status = payloads(ch2).filter(p => p.type === 'status').at(-1);
  assert.equal(status?.type === 'status' ? status.status.state : null, 'ready', 'the board stays rendered');
  assert.deepEqual(lastItems(ch2), ['S2', 'S1']);
});

/** A board, rollup and issue snapshot whose cards the keyboard tests walk. */
function keyboardSnapshot(): DeliverySnapshot {
  return fixtureSnapshot([
    item({ id: 'E1', kind: 'epic', title: 'Epic', childIds: ['S1', 'S2'] }),
    item({ id: 'S1', title: 'First', parentId: 'E1', stage: 'scoped' }),
    item({ id: 'S2', title: 'Second', parentId: 'E1', stage: 'scoped' }),
    item({ id: 'S3', title: 'Third', stage: 'complete' }),
    item({ id: 'I1', kind: 'issue', title: 'Bug', stage: 'scoped', standalone: true }),
  ]);
}

/** The webview script driven by the real host: every down-message the host posts is delivered to the script. */
async function liveBoard(snap: DeliverySnapshot) {
  const s = detailsSetup();
  const ch = await openOn(s, snap);
  const w = runScript();
  let delivered = 0;
  const pump = () => { for (; delivered < ch.posted.length; delivered++) w.deliver(ch.posted[delivered]); };
  pump();
  /** Send what the script posted since the last call to the host, then deliver the host's answers. */
  const relay = () => { for (const m of w.posted.splice(0)) ch.send(m); pump(); };
  w.posted.length = 0;
  return { s, ch, w, pump, relay };
}

const cardOf = (root: FakeEl, id: string) => cardsIn(root).find(c => c.attrs['data-item-id'] === id)!;

test('every card is focusable and opens with Enter or Space, arrows move between cards, and closing the details returns focus to the card', async () => {
  const b = await liveBoard(keyboardSnapshot());
  const board = b.w.el['board']!;
  // Every card in the two card views is focusable and keeps its accessible label (the epic rollup lists counts, not cards).
  for (const view of ['board', 'issues'] as const) {
    b.ch.send({ v: 1, payload: { type: 'set-view', view } });
    b.pump();
    const cards = cardsIn(board);
    assert.ok(cards.length > 0, `${view} has cards`);
    for (const c of cards) {
      assert.equal(c.attrs['tabindex'], '0', `${view}: ${c.attrs['data-item-id']} is focusable`);
      assert.ok((c.attrs['aria-label'] ?? '').length > 0, 'and keeps its accessible label');
    }
  }
  b.ch.send({ v: 1, payload: { type: 'set-view', view: 'board' } });
  b.pump();

  // Arrows move in document order, without wrapping, and prevent the pane scrolling.
  const order = cardsIn(board).map(c => c.attrs['data-item-id']);
  assert.deepEqual(order, ['I1', 'S1', 'S2', 'S3']);
  const first = cardOf(board, 'I1');
  first.focus();
  const down = keyEvent('ArrowDown');
  first.listeners['keydown']!(down);
  assert.equal(down.prevented, true);
  assert.equal(focusState.active?.attrs['data-item-id'], 'S1');
  focusState.active!.listeners['keydown']!(keyEvent('ArrowUp'));
  assert.equal(focusState.active?.attrs['data-item-id'], 'I1');
  focusState.active!.listeners['keydown']!(keyEvent('ArrowUp'));
  assert.equal(focusState.active?.attrs['data-item-id'], 'I1', 'no wrap at the first card');
  const last = cardOf(board, 'S3');
  last.focus();
  last.listeners['keydown']!(keyEvent('ArrowDown'));
  assert.equal(focusState.active?.attrs['data-item-id'], 'S3', 'no wrap at the last card');

  // Enter and Space select, as a click does; opening the details focuses their heading.
  const enter = keyEvent('Enter');
  cardOf(board, 'S1').listeners['keydown']!(enter);
  assert.equal(enter.prevented, true);
  assert.deepEqual(b.w.posted.map(m => (m as { payload: unknown }).payload), [{ type: 'select-item', itemId: 'S1' }]);
  b.relay();
  const details = b.w.el['details']!;
  const heading = details.children.find(c => c.tag === 'h2')!;
  assert.equal(heading.attrs['tabindex'], '-1');
  assert.equal(focusState.active, heading, 'focus moves to the details heading');
  cardOf(board, 'S2').listeners['keydown']!(keyEvent(' '));
  assert.deepEqual(b.w.posted.map(m => (m as { payload: unknown }).payload), [{ type: 'select-item', itemId: 'S2' }]);
  b.relay();
  assert.equal(focusState.active, details.children.find(c => c.tag === 'h2'), 'a newly opened item focuses its own heading');

  // Escape inside the details closes them, and focus returns to the card that opened them.
  const esc = keyEvent('Escape');
  details.listeners['keydown']!(esc);
  assert.equal(esc.prevented, true);
  assert.deepEqual(b.w.posted.map(m => (m as { payload: unknown }).payload), [{ type: 'close-details' }]);
  b.relay();
  assert.equal(focusState.active, cardOf(board, 'S2'), 'focus is back on the card');
  assert.equal('hidden' in details.attrs, true);
});

test('when the card that opened the details is gone, closing them focuses the shown view\'s tab', async () => {
  const b = await liveBoard(keyboardSnapshot());
  const board = b.w.el['board']!;
  cardOf(board, 'S3').listeners['keydown']!(keyEvent('Enter'));
  b.relay();
  // A search that S3 does not match removes its card; closing the details then has no card to return to.
  b.ch.send({ v: 1, payload: { type: 'set-search', search: 'first' } });
  b.pump();
  assert.equal(cardsIn(board).some(c => c.attrs['data-item-id'] === 'S3'), false);
  b.w.el['details']!.listeners['keydown']!(keyEvent('Escape'));
  b.relay();
  assert.equal(focusState.active, b.w.el['tab-board'], 'focus lands on the shown view\'s tab');
  // And in another view, that view's tab.
  b.ch.send({ v: 1, payload: { type: 'set-view', view: 'issues' } });
  b.pump();
  b.ch.send({ v: 1, payload: { type: 'set-search', search: '' } });
  b.pump();
  cardOf(board, 'I1').listeners['keydown']!(keyEvent('Enter'));
  b.relay();
  b.ch.send({ v: 1, payload: { type: 'set-search', search: 'nothing matches' } });
  b.pump();
  b.w.el['details']!.listeners['keydown']!(keyEvent('Escape'));
  b.relay();
  assert.equal(focusState.active, b.w.el['tab-issues']);
});

test('the announce region is the only live region and is set once per message', async () => {
  const doc = renderBoardDocument('N0NCE');
  assert.equal((doc.match(/aria-live=/g) ?? []).length, 1);
  assert.match(doc, /id="announce"[^>]*aria-live="polite"/);
  const b = await liveBoard(keyboardSnapshot());
  const region = b.w.el['announce']!;
  assert.equal(region.textContent, 'Board refreshed: 4 items, 0 needing attention', 'the first refresh is announced');
  // Each message replaces the region's text with its own; the region is cleared first so a repeat is spoken again.
  const writes: string[] = [];
  Object.defineProperty(region, 'textContent', { get() { return writes.at(-1) ?? ''; }, set(v: string) { writes.push(v); }, configurable: true });
  b.w.deliver({ v: 1, payload: { type: 'announce', text: 'Selected: First' } });
  assert.deepEqual(writes, ['', 'Selected: First']);
  b.w.deliver({ v: 1, payload: { type: 'announce', text: 'Selected: First' } });
  assert.deepEqual(writes, ['', 'Selected: First', '', 'Selected: First']);
  // A selection through the real host lands in the region once.
  cardOf(b.w.el['board']!, 'S2').listeners['keydown']!(keyEvent('Enter'));
  b.relay();
  assert.deepEqual(writes.slice(4), ['', 'Selected: Second \u00b7 Scoped']);
  // The status line shows status but is not a live region.
  assert.equal(b.w.el['status']!.attrs['aria-live'], undefined);
});

test('density is restored from the webview state, saved on change and mirrored to the host, and both densities render every badge, warning and label', async () => {
  // Restored from saved state.
  const restored = runScript({ state: { density: 'compact', other: 1 } });
  assert.equal(restored.el['body']!.attrs['data-density'], 'compact');
  assert.equal(restored.el['density-compact']!.attrs['aria-pressed'], 'true');
  assert.equal(restored.el['density-comfortable']!.attrs['aria-pressed'], 'false');
  assert.deepEqual(payloadsOf(restored.posted)[0], { type: 'set-density', density: 'compact' }, 'mirrored to the host on boot');
  // Missing, invalid and throwing state all read as comfortable.
  for (const opts of [{}, { state: { density: 'huge' } }, { state: 'nonsense' }, { stateThrows: true }]) {
    const w = runScript(opts);
    assert.equal(w.el['body']!.attrs['data-density'], 'comfortable', JSON.stringify(opts));
    assert.deepEqual(payloadsOf(w.posted)[0], { type: 'set-density', density: 'comfortable' });
  }
  // A change is applied, saved (keeping other state) and posted.
  restored.posted.length = 0;
  restored.el['density-comfortable']!.listeners['click']!();
  assert.equal(restored.el['body']!.attrs['data-density'], 'comfortable');
  assert.equal(restored.el['density-comfortable']!.attrs['aria-pressed'], 'true');
  assert.deepEqual(restored.saved(), { density: 'comfortable', other: 1 });
  assert.deepEqual(payloadsOf(restored.posted), [{ type: 'set-density', density: 'comfortable' }]);
  for (const m of restored.posted) assert.notEqual(parseBoardUpMessage(m), null);

  // The host mirrors it, and both densities render the same cards, badges, warnings and labels.
  const snap = fixtureSnapshot([
    item({ id: 'S1', title: 'Warned', stage: 'scoped', needsAttention: true, attentionReasons: ['review-blocked'],
      notices: [{ code: 'unplanned-task', message: 'odd', itemIds: ['S1'], artifactIds: [], fileNames: [] }] as never }),
    item({ id: 'S2', title: 'Plain', stage: 'complete' }),
  ]);
  const rendered: { texts: string[]; labels: string[] }[] = [];
  for (const density of ['compact', 'comfortable'] as const) {
    const b = await liveBoard(snap);
    b.w.el[`density-${density}`]!.listeners['click']!();
    b.relay();
    assert.equal(b.w.el['body']!.attrs['data-density'], density);
    const board = b.w.el['board']!;
    rendered.push({ texts: texts(board), labels: cardsIn(board).map(c => c.attrs['aria-label']!) });
  }
  assert.deepEqual(rendered[0], rendered[1], 'the same content at either density');
  assert.ok(rendered[0]!.texts.includes('Review blocked') && rendered[0]!.texts.includes('Unplanned task'));
});

test('the refresh announcement text is unchanged after statusView takes now', async () => {
  const host = await openWith(fixtureSnapshot([
    item({ id: 'S1', stage: 'scoped', needsAttention: true }), item({ id: 'S2', stage: 'complete' }), item({ id: 'E1', kind: 'epic' }),
  ]));
  const posted = payloads(host.ch);
  const announced = posted.filter(p => p.type === 'announce').map(p => (p.type === 'announce' ? p.text : ''));
  assert.deepEqual(announced, ['Board refreshed: 2 items, 1 needing attention']);
  const status = posted.filter(p => p.type === 'status').at(-1);
  assert.ok(status !== undefined && status.type === 'status');
  assert.equal(status.status.freshnessLabel, 'Updated 2026-10-09 10:00 UTC', 'phrased against deps.now() (12:00) for a 10:00 snapshot');

  send(host.ch, { type: 'refresh' });
  host.calls[1]!.resolve({ ok: false, failure: { kind: 'read-failed', message: 'bad store' } });
  await flush();
  const last = payloads(host.ch).filter(p => p.type === 'announce').at(-1);
  assert.ok(last !== undefined && last.type === 'announce');
  assert.match(last.text, /^The refresh failed at 2026-10-09T12:00:00.000Z: bad store Showing the board from 2026-10-09T10:00:00.000Z\.$/);
});

test('clear-filters resets search and attention, keeps scope and view, and resets paging', async () => {
  const host = await openWith(fixtureSnapshot([
    item({ id: 'E1', kind: 'epic', title: 'Board epic' }),
    item({ id: 'E2', kind: 'epic', title: 'Other epic' }),
    ...Array.from({ length: 60 }, (_, n) => item({ id: `E1:S${String(n).padStart(3, '0')}`, parentId: 'E1', title: `Story ${n}`, needsAttention: n % 2 === 0 })),
    item({ id: 'E2:S001', parentId: 'E2', title: 'Elsewhere' }),
  ]));
  send(host.ch, { type: 'set-scope', scope: { kind: 'epic', epicItemId: 'E1' } });
  send(host.ch, { type: 'set-search', search: 'story 1' });
  send(host.ch, { type: 'set-attention', on: true });
  assert.ok(lastBoard(host.ch)!.totals.items < 60, 'the filters narrow the board');
  send(host.ch, { type: 'set-search', search: '' });
  send(host.ch, { type: 'set-attention', on: false });
  send(host.ch, { type: 'show-more', stage: 'scoped' });
  assert.equal(column(host.ch, 'scoped')!.cards.length, 60, 'show-more revealed the second page');
  send(host.ch, { type: 'set-search', search: 'story' });
  send(host.ch, { type: 'set-attention', on: true });
  send(host.ch, { type: 'show-more', stage: 'scoped' });

  send(host.ch, { type: 'clear-filters' });
  const cleared = lastBoard(host.ch)!;
  assert.equal(cleared.totals.items, 60, 'search and attention are cleared; the epic scope is kept (E2\'s story stays out)');
  assert.deepEqual([column(host.ch, 'scoped')!.cards.length, column(host.ch, 'scoped')!.hiddenCount], [50, 10], 'paging is back to the first page');
  assert.equal(host.logs.warn.length, 0);

  send(host.ch, { type: 'set-view', view: 'epics' });
  send(host.ch, { type: 'set-search', search: 'nothing like this' });
  send(host.ch, { type: 'clear-filters' });
  const types = payloads(host.ch).slice(-2).map(p => p.type);
  assert.deepEqual(types, ['status', 'epics'], 'the view is kept');
  assert.equal(lastOf(host.ch, 'epics')!.model.totals.items, 60);
});

test('clear-filters with no snapshot shown posts only the status message', async () => {
  const s = setup();
  s.host.open();
  const ch = s.channels[0]!;
  send(ch, { type: 'set-search', search: 'zzz' });
  const before = ch.posted.length;
  send(ch, { type: 'clear-filters' });
  assert.deepEqual(payloads(ch).slice(before).map(p => p.type), ['status'], 'no view model without a snapshot');
  s.calls[0]!.resolve({ ok: true, value: fixtureSnapshot([item({ id: 'S1' }), item({ id: 'S2' })]) });
  await flush();
  assert.equal(lastBoard(ch)!.totals.items, 2, 'the cleared search applies when the snapshot arrives');
});
