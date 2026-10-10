/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * E2 s1, ISSUE-348d4663 — the board host over a fake panel channel and the real reducer (open, reveal, out-of-order
 * answers, failures, dispose, navigation), and the webview script over a fake DOM: one screen at a time, the five
 * filters, collapsible stages, breadcrumb and Back, focus and scroll, the narrow form and the state panels.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { ChatPanelChannel } from '../../chat/chat-panel.js';
import { BOARD_STYLE, BOARD_VIEW_TYPE, BOARD_WEBVIEW_SCRIPT, createDeliveryBoardHost, renderBoardDocument } from '../board-host.js';
import { parseBoardUpMessage, type BoardDownMessage, type Envelope, type ScreenModel, type StagesBody } from '../board-protocol.js';
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
/** Every screen model posted, in order. */
const screensOf = (c: FakeChannel): ScreenModel[] => payloads(c).flatMap(p => (p.type === 'screen' ? [p.model] : []));
const lastScreen = (c: FakeChannel): ScreenModel | null => screensOf(c).at(-1) ?? null;
/** The body of the last screen posted when it is a board screen; null otherwise. */
const lastBoard = (c: FakeChannel): StagesBody | null => {
  const body = lastScreen(c)?.body;
  return body !== undefined && body.kind === 'stages' ? body : null;
};
/** Every card id on the last board screen posted, section by section. */
const lastItems = (c: FakeChannel) => lastBoard(c)?.sections.flatMap(sec => sec.cards.map(k => k.itemId)) ?? null;
/** Matches on a board screen, summed over its sections. */
const itemsOn = (b: StagesBody | null) => (b === null ? null : b.sections.reduce((n, sec) => n + sec.total, 0));

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
  assert.equal(screensOf(ch).some(m => m.body.kind === 'stages' && m.body.sections.some(c => c.cards.some(k => k.itemId === 'old'))), false);
  assert.deepEqual([...new Set(payloads(ch).map(p => p.type))].sort(), ['announce', 'screen', 'status'], 'only status, screen and announce are ever sent');
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
  const panelOf = { kind: 'refresh-failed', title: hostile, text: hostile, action: 'retry', stale: true, affected: [{ artifactIds: [hostile], text: hostile }] };
  deliver({ v: 1, payload: { type: 'status', status: { state: 'failed', takenAt: null, message: hostile, partialNotice: null, stale: true, freshnessLabel: null, panel: panelOf } } });
  const shown = texts(el['banner']!);
  assert.ok(shown.filter(t => t.includes(hostile)).length >= 3, 'the panel title, text and affected record are literal text');
  assert.equal(findAll(el['banner']!, e => e.tag === 'img').length, 0, 'markup never becomes elements');
  assert.equal(el['notice'], undefined, 'the old notice line is gone');
});

async function openWith(snap: DeliverySnapshot) {
  const s = setup();
  s.host.open();
  s.calls[0]!.resolve({ ok: true, value: snap });
  await flush();
  return { ...s, ch: s.channels[0]! };
}

/** A stage section of the last board screen posted. */
const column = (c: FakeChannel, stage: string) => lastBoard(c)?.sections.find(sec => sec.stage === stage);

test('show-more reveals the next page of one stage, and a new search resets paging', async () => {
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
  ch.send({ v: 1, payload: { type: 'set-search', search: '' } });
  ch.send({ v: 1, payload: { type: 'show-more', stage: 'scoped' } });
  ch.send({ v: 1, payload: { type: 'set-attention', on: true } });
  ch.send({ v: 1, payload: { type: 'set-attention', on: false } });
  assert.equal(column(ch, 'scoped')?.cards.length, 50, 'an attention change resets paging too');
  ch.send({ v: 1, payload: { type: 'show-more', stage: 'scoped' } });
  ch.send({ v: 1, payload: { type: 'set-view', view: 'standalone' } });
  ch.send({ v: 1, payload: { type: 'set-view', view: 'all' } });
  assert.equal(column(ch, 'scoped')?.cards.length, 50, 'and so does starting a new screen');

  const before = ch.posted.length;
  ch.send({ v: 1, payload: { type: 'open-epic', epicItemId: 'no-such-epic' } });
  ch.send({ v: 1, payload: { type: 'show-more', stage: 'shipped' } });
  assert.equal(ch.posted.length, before, 'an unknown epic or stage changes nothing');
  assert.equal(logs.warn.length, 2);
});

test('an item with an unknown stage is left off the board and logged once per refresh', async () => {
  const snap = fixtureSnapshot([item({ id: 'A', stage: 'shipped' }), item({ id: 'B', stage: 'shipped' }), item({ id: 'C', stage: 'scoped' })]);
  const { ch, calls, logs } = await openWith(snap);
  assert.deepEqual(lastItems(ch), ['C']);
  assert.equal(itemsOn(lastBoard(ch)), 1);
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

test('a filter change that cannot be rendered keeps the previous board and is logged', async () => {
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
  ch.send({ v: 1, payload: { type: 'set-view', view: 'epics' } });
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
  ch.send({ v: 1, payload: { type: 'open-item', itemId: 'nowhere' } });
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
/** The details of every story or issue screen posted, in order. */
const detailsOf = (c: FakeChannel) => screensOf(c).flatMap(m => (m.body.kind === 'story' || m.body.kind === 'issue' ? [m.body.details] : []));
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
  assert.deepEqual(detailsOf(ch), [], 'no story screen yet, so no details are posted');

  send(ch, { type: 'open-item', itemId: 'S1' });
  const loading = detailsOf(ch).at(-1)!;
  assert.equal(loading.itemId, 'S1');
  assert.ok(loading.tasks.every(t => t.dependsOn === null), 'the plan is still loading');
  assert.deepEqual(payloads(ch).slice(-3).map(p => p.type), ['status', 'screen', 'announce'], 'the story screen replaces the board, and its announcement comes last (s5)');
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
  send(ch, { type: 'back' });
  assert.equal(lastScreen(ch)!.body.kind, 'stages', 'Back shows the board again');
  send(ch, { type: 'open-item', itemId: 'S2' });
  assert.equal(detailsOf(ch).at(-1)!.itemId, 'S2');
  send(ch, { type: 'back' });
  send(ch, { type: 'open-item', itemId: 'S1' });
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
  send(ch, { type: 'open-item', itemId: 'S1' });
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

  // Leaving the story's screen clears the opened record.
  send(ch, { type: 'back' });
  send(ch, { type: 'open-item', itemId: 'S1' });
  assert.equal(detailsOf(ch).at(-1)!.openedRecord, null);

  // With no review pane, a review-view record is read too; rendered markdown is preferred, and a failure is shown.
  const s2 = detailsSetup();
  const ch2 = await openOn(s2, storySnapshot());
  send(ch2, { type: 'open-item', itemId: 'S1' });
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
  send(ch, { type: 'open-item', itemId: 'S1' });
  s.evidence[0]!.resolve({ ok: false, failure: { kind: 'read-failed', message: 'no such record' } });
  await flush();
  const failed = detailsOf(ch).at(-1)!;
  assert.equal(failed.planNotice, 'The plan could not be read: no such record');
  assert.deepEqual(failed.tasks.map(t => t.resultLabel), ['Passed', 'Failed'], 'the rest of the details stand');
  assert.ok(s.logs.error.some(e => /plan PLAN-x read-failed: no such record/.test(e)));

  // No task list, and malformed entries skipped.
  const s2 = detailsSetup();
  const ch2 = await openOn(s2, storySnapshot());
  send(ch2, { type: 'open-item', itemId: 'S1' });
  s2.evidence[0]!.resolve({ ok: true, value: planRecord({ summary: 'no tasks' }) });
  await flush();
  assert.equal(detailsOf(ch2).at(-1)!.planNotice, 'The plan could not be read: The plan record has no task list');
  const s3 = detailsSetup();
  const ch3 = await openOn(s3, storySnapshot());
  send(ch3, { type: 'open-item', itemId: 'S1' });
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
  send(ch4, { type: 'open-item', itemId: 'S1' });
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
  send(ch7, { type: 'open-item', itemId: 'S1' });
  send(ch7, { type: 'open-evidence', itemId: 'S1', artifactId: 'BUILD-x' });
  send(ch7, { type: 'refresh' });
  s7.snapshots[1]!.resolve({ ok: true, value: storySnapshot('2026-10-09T11:05:00.000Z') });
  await flush();
  s7.evidence[1]!.resolve({ ok: true, value: { artifactId: 'BUILD-x', kind: 'BUILD', meta: {}, body: {}, renderedMarkdown: '# Old build' } });
  await flush();
  assert.equal(detailsOf(ch7).at(-1)!.openedRecord, null, 'the old snapshot\'s record is not shown');

  // An item screen that cannot be rendered changes nothing: the screen shown stays.
  const s8 = detailsSetup();
  const broken = fixtureSnapshot([...storySnapshot().items, item({ id: 'S9', title: 'Broken', tasks: 42 as never })]);
  const ch8 = await openOn(s8, broken);
  send(ch8, { type: 'open-item', itemId: 'S1' });
  send(ch8, { type: 'open-evidence', itemId: 'S1', artifactId: 'BUILD-x' });
  s8.evidence[1]!.resolve({ ok: true, value: { artifactId: 'BUILD-x', kind: 'BUILD', meta: {}, body: {}, renderedMarkdown: '# Build' } });
  await flush();
  send(ch8, { type: 'back' });
  send(ch8, { type: 'open-item', itemId: 'S9' });
  assert.ok(s8.logs.error.some(e => /open-item could not be shown/.test(e)));
  send(ch8, { type: 'ready' });
  assert.equal(lastScreen(ch8)!.body.kind, 'stages', 'the board the reader went back to stays');

  // A board that cannot be re-shown when an answer arrives logs the failure instead of rejecting unseen.
  const s6 = detailsSetup();
  const ch6 = await openOn(s6, storySnapshot());
  send(ch6, { type: 'open-item', itemId: 'S1' });
  send(ch6, { type: 'open-evidence', itemId: 'S1', artifactId: 'BUILD-x' });
  ch6.postMessage = () => { throw new Error('webview gone'); };
  s6.evidence[0]!.resolve({ ok: true, value: planRecord(PLAN_BODY) });
  s6.evidence[1]!.resolve({ ok: true, value: { artifactId: 'BUILD-x', kind: 'BUILD', meta: {}, body: {}, renderedMarkdown: '# Build' } });
  await flush();
  assert.ok(s6.logs.error.some(e => /plan PLAN-x could not be shown: webview gone/.test(e)));
  assert.ok(s6.logs.error.some(e => /record BUILD-x could not be shown: webview gone/.test(e)));

  const s5 = detailsSetup();
  const ch5 = await openOn(s5, storySnapshot());
  send(ch5, { type: 'open-item', itemId: 'S1' });
  ch5.close();
  const before = ch5.posted.length;
  s5.evidence[0]!.resolve({ ok: true, value: planRecord(PLAN_BODY) });
  await flush();
  assert.equal(ch5.posted.length, before, 'a read that finishes after the panel closed posts nothing');
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

test('a filter change, Back and announcements: screen changes are announced once, a settled refresh once, and filters, density and reloads say nothing', async () => {
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
  assert.equal(payloads(ch).at(-1)!.type, 'announce', 'after the status and the screen');

  send(ch, { type: 'open-item', itemId: 'S1' });
  assert.deepEqual(payloads(ch).slice(-3).map(p => p.type), ['status', 'screen', 'announce']);
  assert.equal(announces(ch).at(-1), 'Opened: Details · Build recorded');
  send(ch, { type: 'open-item', itemId: 'S1' });
  send(ch, { type: 'open-item', itemId: 'GONE' });
  send(ch, { type: 'back' });
  send(ch, { type: 'open-item', itemId: 'E1' });
  assert.deepEqual(announces(ch).slice(1), ['Opened: Details · Build recorded', 'Back to All work', 'Epic: Epic'], 'an epic id opens the epic');
  // A return to an item names it as its breadcrumb does.
  send(ch, { type: 'set-view', view: 'all' });
  send(ch, { type: 'open-item', itemId: 'S1' });
  send(ch, { type: 'open-item', itemId: 'S2' });
  send(ch, { type: 'back' });
  assert.equal(announces(ch).at(-1), 'Back to S1');
  assert.equal(lastScreen(ch)!.crumbs.at(-1)!.label, 'S1');

  const before = announces(ch).length;
  for (const p of [{ type: 'set-search', search: 'x' }, { type: 'set-search', search: '' }, { type: 'set-attention', on: true },
    { type: 'set-density', density: 'compact' }, { type: 'show-more', stage: 'scoped' }, { type: 'ready' }, { type: 'clear-filters' }]) send(ch, p);
  assert.equal(announces(ch).length, before, 'filters, density and a reload announce nothing');

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

  // A refresh that removes what the reader is viewing says so first.
  send(ch, { type: 'set-view', view: 'all' });
  send(ch, { type: 'open-item', itemId: 'S1' });
  send(ch, { type: 'refresh' });
  s.snapshots[4]!.resolve({ ok: true, value: fixtureSnapshot([item({ id: 'S2', title: 'Second' })]) });
  await flush();
  assert.equal(announces(ch).at(-1), 'What you were viewing is no longer on the board. Board refreshed: 1 item, 0 needing attention');
  assert.equal(lastScreen(ch)!.body.kind, 'stages', 'and shows the board it was opened from');

  // An announcement that cannot be posted is only logged; the refresh still counts as rendered.
  const s2 = detailsSetup();
  s2.host.open();
  const ch2 = s2.channels[0]!;
  const post = ch2.postMessage;
  ch2.postMessage = (m) => { if ((m as Envelope<BoardDownMessage>).payload.type === 'announce') throw new Error('gone'); post(m); };
  s2.snapshots[0]!.resolve({ ok: true, value: snap });
  await flush();
  assert.ok(s2.logs.error.some(e => /result could not be announced: gone/.test(e)));
  assert.deepEqual(lastItems(ch2), ['S2', 'S1']);
});

test('clear-filters clears the screen\'s search and attention, keeps the screen, and resets paging', async () => {
  const host = await openWith(fixtureSnapshot([
    item({ id: 'E1', kind: 'epic', title: 'Board epic' }),
    item({ id: 'E2', kind: 'epic', title: 'Other epic' }),
    ...Array.from({ length: 60 }, (_, n) => item({ id: `E1:S${String(n).padStart(3, '0')}`, parentId: 'E1', title: `Story ${n}`, needsAttention: n % 2 === 0 })),
    item({ id: 'E2:S001', parentId: 'E2', title: 'Elsewhere' }),
  ]));
  send(host.ch, { type: 'set-view', view: 'epics' });
  send(host.ch, { type: 'open-epic', epicItemId: 'E1' });
  send(host.ch, { type: 'set-search', search: 'story 1' });
  send(host.ch, { type: 'set-attention', on: true });
  assert.ok(itemsOn(lastBoard(host.ch))! < 60, 'the filters narrow the epic board');
  send(host.ch, { type: 'set-search', search: '' });
  send(host.ch, { type: 'set-attention', on: false });
  send(host.ch, { type: 'show-more', stage: 'scoped' });
  assert.equal(column(host.ch, 'scoped')!.cards.length, 60, 'show-more revealed the second page');
  send(host.ch, { type: 'set-search', search: 'story' });
  send(host.ch, { type: 'set-attention', on: true });

  send(host.ch, { type: 'clear-filters' });
  assert.equal(itemsOn(lastBoard(host.ch)), 60, 'search and attention are cleared; the epic\'s board is kept (E2\'s story stays out)');
  assert.deepEqual([column(host.ch, 'scoped')!.cards.length, column(host.ch, 'scoped')!.hiddenCount], [50, 10], 'paging is back to the first page');
  assert.deepEqual(lastScreen(host.ch)!.filters, { views: false, view: null, search: '', searchPlaceholder: 'Search this epic', needsAttentionOnly: false });
  assert.equal(host.logs.warn.length, 0);

  // Back to Epics: its own (empty) filters were kept apart from the epic board's.
  send(host.ch, { type: 'back' });
  assert.equal(lastScreen(host.ch)!.body.kind, 'epics');
  send(host.ch, { type: 'set-search', search: 'nothing like this' });
  send(host.ch, { type: 'clear-filters' });
  const epics = lastScreen(host.ch)!.body;
  assert.ok(epics.kind === 'epics' && epics.rows.length === 2);

  // With no snapshot shown, clear-filters posts only the status.
  const s = setup();
  s.host.open();
  const ch = s.channels[0]!;
  send(ch, { type: 'set-search', search: 'zzz' });
  const before = ch.posted.length;
  send(ch, { type: 'clear-filters' });
  assert.deepEqual(payloads(ch).slice(before).map(p => p.type), ['status'], 'no screen without a snapshot');
  s.calls[0]!.resolve({ ok: true, value: fixtureSnapshot([item({ id: 'S1' }), item({ id: 'S2' })]) });
  await flush();
  assert.equal(itemsOn(lastBoard(ch)), 2, 'the cleared search applies when the snapshot arrives');
});

/** A workspace with two epics, standalone work and issues, for the screen tests. */
function screensSnapshot(extra: ReturnType<typeof item>[] = []): DeliverySnapshot {
  return fixtureSnapshot([
    item({ id: 'E20261009aaaaaaaa', kind: 'epic', title: 'Board epic' }),
    item({ id: 'E20261009aaaaaaaa:S001', parentId: 'E20261009aaaaaaaa', title: 'Columns', stage: 'scoped', needsAttention: true, attentionReasons: ['pending-decision'] }),
    item({ id: 'E20261009aaaaaaaa:S002', parentId: 'E20261009aaaaaaaa', title: 'Cards', stage: 'complete' }),
    item({ id: 'E20261009bbbbbbbb', kind: 'epic', title: 'Other epic' }),
    item({ id: 'E20261009bbbbbbbb:S001', parentId: 'E20261009bbbbbbbb', title: 'Counts', stage: 'design-plan' }),
    item({ id: 'H1234abcd5678ef00', kind: 'issue', title: 'Overflow', standalone: true, stage: 'design-plan', correctsRef: { resolvedItemId: 'E20261009aaaaaaaa:S001' } as never }),
    item({ id: 'SA1', title: 'Loose', standalone: true, stage: 'scoped' }),
    ...extra,
  ]);
}
const EPIC_A = 'E20261009aaaaaaaa';
const STORY_A = 'E20261009aaaaaaaa:S001';
const screenOf = (w: ReturnType<typeof runScript>) => w.el['main']!.attrs['data-screen'];
const buttonsIn = (root: FakeEl, cls: string) => findAll(root, e => e.tag === 'button' && (e.attrs['class'] ?? '').split(' ').includes(cls));
const click = (e: FakeEl) => e.listeners['click']!();

test('opening an epic and then a story replaces #main each time, and nothing from an earlier screen remains', async () => {
  const b = await liveBoard(screensSnapshot());
  const main = b.w.el['main']!;
  assert.equal(screenOf(b.w), 'stages');
  assert.deepEqual(cardsIn(main).map(c => c.attrs['data-item-id']).sort(), ['E20261009aaaaaaaa:S001', 'E20261009aaaaaaaa:S002', 'E20261009bbbbbbbb:S001', 'H1234abcd5678ef00', 'SA1']);

  click(buttonsIn(main, 'view').find(v => v.attrs['data-view'] === 'epics')!);
  b.relay();
  assert.equal(screenOf(b.w), 'epics');
  assert.equal(cardsIn(main).length, 0, 'no board card stays on the Epics screen');
  click(findAll(main, e => e.attrs['data-epic'] === EPIC_A)[0]!);
  b.relay();
  assert.equal(screenOf(b.w), 'stages');
  assert.deepEqual(cardsIn(main).map(c => c.attrs['data-item-id']).sort(), [STORY_A, 'E20261009aaaaaaaa:S002'], 'only this epic\'s stories');
  assert.equal(findAll(main, e => e.attrs['data-epic'] !== undefined).length, 0, 'no Epics row stays');

  click(cardOf(main, STORY_A));
  b.relay();
  assert.equal(screenOf(b.w), 'story');
  assert.equal(cardsIn(main).length, 0, 'no card from the epic board stays under the story');
  assert.equal(findAll(main, e => e.tag === 'details' && e.attrs['class'] === 'stage').length, 0, 'and no stage section');
  assert.ok(texts(main).includes('Columns'), 'the story\'s own screen');
  assert.deepEqual(texts(b.w.el['crumbs']!), ['Delivery', '/', 'Epics', '/', 'Board epic', '/', 'S001']);

  // Choosing another view leaves the story's screen.
  click(buttonsIn(b.w.el['crumbs']!, 'crumb')[0]!);
  b.relay();
  click(buttonsIn(main, 'view').find(v => v.attrs['data-view'] === 'issues')!);
  b.relay();
  assert.equal(screenOf(b.w), 'issues');
  assert.ok(!texts(main).includes('Columns'));
  assert.deepEqual(b.s.logs, { warn: [], error: [] });
});

test('the filter bar has exactly the four views and Needs attention, and no epic is a chip', async () => {
  const b = await liveBoard(screensSnapshot());
  const main = b.w.el['main']!;
  const bar = findAll(main, e => e.attrs['class'] === 'filters')[0]!;
  const views = buttonsIn(bar, 'view');
  assert.deepEqual(views.map(v => [v.textContent, v.attrs['aria-pressed']]), [['All work', 'true'], ['Epics', 'false'], ['Standalone', 'false'], ['Issues', 'false']]);
  const att = buttonsIn(bar, 'attention');
  assert.deepEqual(att.map(a => [a.textContent, a.attrs['aria-pressed']]), [['Needs attention', 'false']]);
  assert.equal(findAll(bar, e => e.tag === 'button').length, 5, 'five filters, nothing else');
  assert.ok(!texts(bar).some(t => /epic/i.test(t) && t !== 'Epics'), 'no epic is a chip');
  const input = findAll(bar, e => e.tag === 'input')[0]!;
  assert.deepEqual([input.attrs['type'], input.attrs['placeholder']], ['search', 'Search titles, ids, epics']);

  // Needs attention narrows the view chosen and shows pressed with ×; Show all clears it.
  click(att[0]!);
  b.relay();
  assert.deepEqual([att[0]!.textContent, att[0]!.attrs['aria-pressed']], ['Needs attention ×', 'true']);
  assert.deepEqual(cardsIn(main).map(c => c.attrs['data-item-id']), [STORY_A]);
  const totals = findAll(main, e => e.attrs['class'] === 'totals')[0]!;
  assert.match(totals.textContent, /^1 of 5 items needs attention/);
  click(buttonsIn(totals, 'show-all')[0]!);
  b.relay();
  assert.equal(att[0]!.attrs['aria-pressed'], 'false');
  assert.equal(cardsIn(main).length, 5);

  // Typing keeps the same search box: the screen's head survives a re-render.
  input.value = 'loose';
  input.listeners['input']!();
  b.relay();
  assert.equal(findAll(main, e => e.tag === 'input')[0], input, 'the search box is not rebuilt while typing');
  assert.deepEqual(cardsIn(main).map(c => c.attrs['data-item-id']), ['SA1']);

  // Each view posts set-view; the pressed one follows the screen.
  click(views[2]!);
  b.relay();
  assert.equal(buttonsIn(main, 'view').find(v => v.attrs['aria-pressed'] === 'true')!.attrs['data-view'], 'standalone');
  for (const m of b.w.posted) assert.notEqual(parseBoardUpMessage(m), null);
});

test('an Epics row opens that epic\'s board with its header, breadcrumb and ← Epics, and no view control', async () => {
  const b = await liveBoard(screensSnapshot());
  const main = b.w.el['main']!;
  click(buttonsIn(main, 'view').find(v => v.attrs['data-view'] === 'epics')!);
  b.relay();
  const rows = findAll(main, e => e.attrs['class'] === 'epic-row');
  assert.deepEqual(rows.map(r => r.attrs['data-epic']), [EPIC_A, 'E20261009bbbbbbbb'], 'one row per epic');
  assert.deepEqual(texts(rows[0]!).slice(0, 5), ['EPIC · AAAAAAAA', 'Board epic', '2 stories · 0 tasks', '1 of 2 stories complete', '1 needs attention']);
  const meter = findAll(rows[0]!, e => e.attrs['role'] === 'meter')[0]!;
  assert.deepEqual([meter.attrs['aria-valuenow'], meter.attrs['aria-valuemax'], meter.children[0]!.attrs['style']], ['1', '2', 'width:50%']);
  assert.ok(texts(main).includes('Work outside any epic is under '));
  assert.equal(findAll(main, e => e.attrs['class'] === 'totals')[0]!.textContent, '2 epics · completion counts stories at Complete');

  b.w.posted.length = 0;
  click(rows[0]!);
  assert.deepEqual(payloadsOf(b.w.posted), [{ type: 'open-epic', epicItemId: EPIC_A }], 'the whole row opens the epic');
  b.relay();
  const back = buttonsIn(main, 'back');
  assert.deepEqual(back.map(x => x.textContent), ['← Epics']);
  assert.equal(findAll(main, e => e.tag === 'h1')[0]!.textContent, 'Board epic');
  assert.ok(texts(main).includes('EPIC · AAAAAAAA') && texts(main).includes('1 of 2 stories complete'), 'the epic\'s summary with the same numbers as its row');
  assert.equal(buttonsIn(main, 'view').length, 0, 'no view control inside an epic');
  assert.equal(buttonsIn(main, 'attention').length, 1);
  assert.equal(findAll(main, e => e.tag === 'input')[0]!.attrs['placeholder'], 'Search this epic');
  assert.deepEqual(texts(b.w.el['crumbs']!), ['Delivery', '/', 'Epics', '/', 'Board epic']);
  const crumbButtons = buttonsIn(b.w.el['crumbs']!, 'crumb');
  assert.deepEqual(crumbButtons.map(c => c.textContent), ['Delivery', 'Epics'], 'the earlier crumbs return to Epics; the current place is not a button');
  b.w.posted.length = 0;
  click(crumbButtons[0]!);
  assert.deepEqual(payloadsOf(b.w.posted), [{ type: 'go-to-crumb', index: 0 }]);
  b.w.posted.length = 0;
  click(back[0]!);
  assert.deepEqual(payloadsOf(b.w.posted), [{ type: 'back' }]);
  b.relay();
  assert.equal(screenOf(b.w), 'epics');

  // The Standalone link and the Issues list.
  click(findAll(main, e => e.attrs['class'] === 'link' && e.textContent === 'Standalone')[0]!);
  b.relay();
  assert.deepEqual(cardsIn(main).map(c => c.attrs['data-item-id']).sort(), ['H1234abcd5678ef00', 'SA1']);
  assert.ok(!cardsIn(main).some(c => texts(c).includes('Standalone')), 'no Standalone line repeated on the Standalone screen');
  click(buttonsIn(main, 'view').find(v => v.attrs['data-view'] === 'issues')!);
  b.relay();
  const issueRows = findAll(main, e => e.attrs['class'] === 'issue-row');
  assert.deepEqual(texts(issueRows[0]!), ['ISSUE · 1234ABCD', 'Overflow', 'Corrects Columns · no fix story yet', 'Design & plan']);
  b.w.posted.length = 0;
  click(issueRows[0]!);
  assert.deepEqual(payloadsOf(b.w.posted), [{ type: 'open-item', itemId: 'H1234abcd5678ef00' }]);
});

test('stages render as six <details> sections in workflow order, and a toggled section stays as the reader left it across a refresh', async () => {
  const b = await liveBoard(screensSnapshot());
  const main = b.w.el['main']!;
  const sections = () => findAll(main, e => e.tag === 'details' && e.attrs['class'] === 'stage');
  assert.deepEqual(sections().map(d => [d.attrs['data-stage'], d.attrs['open'] !== undefined]), [
    ['scoped', true], ['design-plan', true], ['ready-design-approved', false], ['ready-plan-approved', false], ['build-recorded', false], ['complete', false],
  ]);
  const summaries = sections().map(d => texts(d.children[0]!));
  assert.deepEqual(summaries[2], ['Ready · design approved', '0', 'nothing at this stage'], 'an empty stage says so and stays listed');
  assert.deepEqual(summaries[5], ['Complete', '1'], 'Complete starts closed');
  assert.equal(cardsIn(sections()[5]!).length, 1, 'its card is inside the closed section, not dropped');

  // The reader opens Complete and closes Scoped; a refresh of the same screen keeps both.
  const complete = sections()[5]!;
  complete.setAttribute('open', '');
  complete.listeners['toggle']!();
  const scoped = sections()[0]!;
  scoped.removeAttribute('open');
  scoped.listeners['toggle']!();
  b.ch.send({ v: 1, payload: { type: 'refresh' } });
  b.s.snapshots[1]!.resolve({ ok: true, value: screensSnapshot() });
  await flush();
  b.pump();
  assert.deepEqual(sections().map(d => d.attrs['open'] !== undefined), [false, true, false, false, false, true]);

  // A new screen starts from the defaults again.
  click(buttonsIn(main, 'view').find(v => v.attrs['data-view'] === 'standalone')!);
  b.relay();
  assert.deepEqual(sections().map(d => d.attrs['open'] !== undefined), [true, true, false, false, false, false]);
});

test('a narrow pane shortens the breadcrumb and folds empty stages into Other stages · 0 matching, and widening re-renders the wide form', async () => {
  const b = await liveBoard(screensSnapshot());
  const main = b.w.el['main']!;
  click(buttonsIn(main, 'view').find(v => v.attrs['data-view'] === 'epics')!);
  b.relay();
  click(findAll(main, e => e.attrs['data-epic'] === EPIC_A)[0]!);
  b.relay();
  const stages = () => findAll(main, e => e.tag === 'details' && (e.attrs['class'] ?? '').startsWith('stage')).map(d => d.attrs['data-stage'] ?? 'fold');
  assert.deepEqual(stages(), ['scoped', 'design-plan', 'ready-design-approved', 'ready-plan-approved', 'build-recorded', 'complete']);

  b.w.resize(360);
  assert.deepEqual(stages(), ['scoped', 'complete', 'fold'], 'empty stages fold into one section');
  const fold = findAll(main, e => e.tag === 'details' && e.attrs['class'] === 'stage fold')[0]!;
  assert.deepEqual(texts(fold), ['Other stages · 0 matching', 'Design & plan 0 · Ready · design approved 0 · Ready · plan approved 0 · Build recorded 0']);
  assert.deepEqual(texts(b.w.el['crumbs']!), ['← Epics', 'Board epic'], 'only the back step and the current place');

  b.w.resize(900);
  assert.equal(stages().length, 6, 'widening re-renders the wide form');
  assert.deepEqual(texts(b.w.el['crumbs']!), ['Delivery', '/', 'Epics', '/', 'Board epic']);

  // Under Needs attention the empty stages fold into one line at any width.
  click(buttonsIn(main, 'attention')[0]!);
  b.relay();
  assert.deepEqual(stages(), ['scoped']);
  assert.deepEqual(findAll(main, e => e.attrs['class'] === 'fold muted').map(e => e.textContent),
    ['5 stages have nothing needing attention: Design & plan, Ready · design approved, Ready · plan approved, Build recorded, Complete.']);
});

test('Back restores the saved scroll and focuses the card that opened the story; Escape goes back', async () => {
  const b = await liveBoard(screensSnapshot());
  const main = b.w.el['main']!;
  assert.equal(focusState.active, findAll(main, e => e.tag === 'h1')[0], 'a new screen focuses its heading');
  b.w.scroll(420);
  click(cardOf(main, 'SA1'));
  b.relay();
  assert.equal(b.w.view.scrollY, 0, 'a new screen starts at the top');
  assert.equal(focusState.active, findAll(main, e => e.tag === 'h1')[0]);

  main.listeners['keydown']!(keyEvent('Escape'));
  b.relay();
  assert.equal(screenOf(b.w), 'stages');
  assert.equal(b.w.view.scrollY, 420, 'the board comes back where the reader left it');
  assert.equal(focusState.active, cardOf(main, 'SA1'), 'focused on the card that opened the story');

  // Escape on a root screen does nothing; arrows still walk the cards, Enter opens one.
  b.w.posted.length = 0;
  main.listeners['keydown']!(keyEvent('Escape'));
  assert.deepEqual(b.w.posted, []);
  const cards = cardsIn(main);
  cards[0]!.focus();
  cards[0]!.listeners['keydown']!(keyEvent('ArrowDown'));
  assert.equal(focusState.active, cards[1]);
  const enter = keyEvent('Enter');
  cards[1]!.listeners['keydown']!(enter);
  assert.equal(enter.prevented, true);
  assert.deepEqual(payloadsOf(b.w.posted), [{ type: 'open-item', itemId: cards[1]!.attrs['data-item-id'] }]);
});

test('empty replaces the screen, no matches replaces the list area with Clear filters, and a failed refresh over a story keeps the story under the banner', async () => {
  const b = await liveBoard(screensSnapshot());
  const main = b.w.el['main']!;

  // No matches: the totals and Clear filters replace the stages; the filters stay.
  const input = findAll(main, e => e.tag === 'input')[0]!;
  input.value = 'nothing like this';
  input.listeners['input']!();
  b.relay();
  assert.equal(findAll(main, e => e.tag === 'details' && e.attrs['class'] === 'stage').length, 0);
  const panel = findAll(main, e => e.attrs['class'] === 'panel')[0]!;
  assert.deepEqual([panel.attrs['data-kind'], texts(panel)[0]], ['no-matches', 'Nothing matches this view']);
  b.w.posted.length = 0;
  click(findAll(panel, e => e.tag === 'button' && e.textContent === 'Clear filters')[0]!);
  assert.deepEqual(payloadsOf(b.w.posted), [{ type: 'clear-filters' }]);
  assert.equal(input.value, '');
  b.relay();
  assert.equal(cardsIn(main).length, 5);

  // A failed refresh over a story: the banner above, the story still there.
  click(cardOf(main, 'SA1'));
  b.relay();
  b.ch.send({ v: 1, payload: { type: 'refresh' } });
  b.s.snapshots[1]!.resolve({ ok: false, failure: { kind: 'timed-out', message: 'took too long' } });
  await flush();
  b.pump();
  const banner = findAll(b.w.el['banner']!, e => e.attrs['class'] === 'panel')[0]!;
  assert.deepEqual([banner.attrs['data-kind'], texts(banner).includes('Stale')], ['refresh-failed', true]);
  assert.equal(screenOf(b.w), 'story', 'the story stays under the banner');
  b.w.posted.length = 0;
  click(findAll(banner, e => e.tag === 'button' && e.textContent === 'Retry')[0]!);
  assert.deepEqual(payloadsOf(b.w.posted), [{ type: 'refresh' }]);

  // Empty workspace: the panel replaces the screen.
  b.ch.send({ v: 1, payload: { type: 'refresh' } });
  b.s.snapshots[2]!.resolve({ ok: true, value: fixtureSnapshot([]) });
  await flush();
  b.pump();
  assert.equal(screenOf(b.w), 'panel');
  assert.deepEqual(texts(main).slice(0, 2), ['No work items yet', 'The workspace was read successfully. No epic, story or issue records were found.']);
  assert.deepEqual(texts(b.w.el['banner']!), []);
  assert.deepEqual(texts(b.w.el['crumbs']!), ['Delivery']);

  // Partial evidence sits in the banner, with its records to inspect.
  const notice = { code: 'store-incomplete', message: 'PLAN-x could not be parsed.', itemIds: [], artifactIds: ['PLAN-x'], fileNames: [] };
  b.ch.send({ v: 1, payload: { type: 'refresh' } });
  b.s.snapshots[3]!.resolve({ ok: true, value: screensSnapshot().items.length ? { ...screensSnapshot(), notices: [notice] as never } : screensSnapshot() });
  await flush();
  b.pump();
  const partial = findAll(b.w.el['banner']!, e => e.attrs['class'] === 'panel')[0]!;
  assert.equal(partial.attrs['data-kind'], 'partial');
  assert.ok(texts(partial).some(t => t === 'PLAN-x'));
  assert.equal(screenOf(b.w), 'stages', 'the board is usable under it');
});

test('CSP string unchanged, exactly one aria-live region, and the script uses textContent only and posts only BoardUpMessage envelopes', async () => {
  const doc = renderBoardDocument('N0NCE');
  assert.match(doc, /content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-N0NCE';"/);
  assert.deepEqual(doc.match(/aria-live="[^"]+"/g), ['aria-live="polite"'], 'the announcer is the only live region');
  assert.match(doc, /<p id="status" role="status"><\/p>/, 'the status keeps its role without aria-live');
  for (const part of ['<span class="wordmark">insrc</span>', '<nav id="crumbs" class="crumbs" aria-label="Breadcrumb"></nav>', '<span class="readonly">Read-only</span>',
    '<div id="banner"></div>', '<main id="main"></main>']) assert.ok(doc.includes(part), part);
  for (const gone of ['id="details"', 'id="board"', 'id="scope-chips"', 'role="tablist"', 'id="tab-']) assert.ok(!doc.includes(gone), `no ${gone}`);
  assert.doesNotMatch(BOARD_WEBVIEW_SCRIPT, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(/);

  // Hostile titles and notices are literal text on every screen, and every message posted is a board up-message.
  const hostile = '<script>alert(1)</script><img src=x onerror=alert(2)>';
  const b = await liveBoard(screensSnapshot([
    item({ id: 'E20261009cccccccc', kind: 'epic', title: `Epic ${hostile}` }),
    item({ id: 'E20261009cccccccc:S001', parentId: 'E20261009cccccccc', title: hostile, stage: 'complete',
      conflict: { failedTaskItemIds: [], storyLevelFailed: true },
      notices: [{ code: 'unknown-route', message: hostile, itemIds: [], artifactIds: [], fileNames: [], attention: true }] as never }),
  ]));
  const main = b.w.el['main']!;
  const card = cardOf(main, 'E20261009cccccccc:S001');
  assert.deepEqual(texts(card), ['STORY · CCCCCCCC / S001', hostile, `Epic ${hostile}`, 'Validation conflict', 'Unknown route']);
  assert.deepEqual(findAll(card, x => x.attrs['class'] === 'badge').map(x => x.attrs['data-tone']), ['danger', 'warning']);
  click(buttonsIn(main, 'view').find(v => v.attrs['data-view'] === 'epics')!);
  b.relay();
  assert.ok(texts(main).includes(`Epic ${hostile}`));
  click(findAll(main, e => e.attrs['data-epic'] === 'E20261009cccccccc')[0]!);
  b.relay();
  assert.ok(texts(b.w.el['crumbs']!).includes(`Epic ${hostile}`));
  assert.equal(findAll(main, e => e.tag === 'img' || e.tag === 'script').length, 0, 'markup never becomes elements');
  for (const m of [...b.ch.posted.map(() => null)]) void m;
  b.w.posted.length = 0;
  for (const e of findAll(main, x => x.tag === 'button')) e.listeners['click']?.();
  for (const m of b.w.posted) assert.notEqual(parseBoardUpMessage(m), null, `posted ${JSON.stringify(m)} is a BoardUpMessage envelope`);
});

/** A story with tasks, a conflict, records, a correcting issue, and an issue with a fix story. */
function itemsSnapshot(): DeliverySnapshot {
  return screensSnapshot([
    item({ id: 'E20261009aaaaaaaa:S003', parentId: 'E20261009aaaaaaaa', title: 'Section navigation', stage: 'complete',
      childIds: ['E20261009aaaaaaaa:S003:T1', 'E20261009aaaaaaaa:S003:T2'],
      tasks: [{ taskItemId: 'E20261009aaaaaaaa:S003:T1', result: 'passed', planned: true }, { taskItemId: 'E20261009aaaaaaaa:S003:T2', result: 'failed', planned: true }],
      validation: { passed: 1, failed: 1, unrecorded: 0, unplanned: 0 },
      conflict: { failedTaskItemIds: ['E20261009aaaaaaaa:S003:T2'], storyLevelFailed: false },
      evidence: [
        ev('BUILD-c', 'BUILD', { approval: { state: 'approved', at: '2026-10-01T11:43:00.000Z' } }),
        ev('CR-c', 'CR', { approval: { state: 'pending', at: null } }),
        ev('LLD-c', 'LLD', { mdPath: 'docs/e/S003/LLD.md', openWith: 'review-view' }),
      ],
      notices: [{ code: 'review-without-build', message: 'CR-c reviewed code early.', itemIds: [], artifactIds: ['CR-c'], fileNames: [], attention: false }] as never }),
    item({ id: 'E20261009aaaaaaaa:S003:T1', kind: 'task', parentId: 'E20261009aaaaaaaa:S003', title: 'Project records' }),
    item({ id: 'E20261009aaaaaaaa:S003:T2', kind: 'task', parentId: 'E20261009aaaaaaaa:S003', title: 'Render structure' }),
    item({ id: 'H9999aaaa0000bbbb', kind: 'issue', title: 'Jump is off by one', stage: 'design-plan', standalone: true,
      correctsRef: { resolvedItemId: 'E20261009aaaaaaaa:S003' } as never, childIds: ['H9999aaaa0000bbbb:S001'] }),
    item({ id: 'H9999aaaa0000bbbb:S001', parentId: 'H9999aaaa0000bbbb', title: 'Fix the jump', stage: 'scoped' }),
    item({ id: 'H7777cccc0000dddd', kind: 'issue', title: 'Lost parent', stage: 'scoped', standalone: true,
      correctsRef: { slug: 'gone', resolvedItemId: null } as never,
      notices: [{ code: 'unresolved-parent', message: "corrects 'gone', which is not in the store", itemIds: [], artifactIds: [], fileNames: [], attention: true }] as never }),
    item({ id: 'H5555eeee0000ffff', kind: 'issue', title: 'Epic-level', stage: 'scoped', correctsRef: { resolvedItemId: 'E20261009bbbbbbbb' } as never }),
  ]);
}
const STORY_C = 'E20261009aaaaaaaa:S003';
const tabsIn = (root: FakeEl) => findAll(root, e => e.attrs['role'] === 'tab');

/** Open the board, choose Epics, open epic A and then the story with this id. */
async function onStory(id: string) {
  const b = await liveBoard(itemsSnapshot());
  const main = b.w.el['main']!;
  click(buttonsIn(main, 'view').find(v => v.attrs['data-view'] === 'epics')!);
  b.relay();
  click(findAll(main, e => e.attrs['data-epic'] === EPIC_A)[0]!);
  b.relay();
  // Complete starts closed: its cards are still in the DOM, inside the section.
  click(cardOf(main, id));
  b.relay();
  return { ...b, main };
}

test('opening a story replaces the screen: #main holds only the story screen, with its breadcrumb and Back, and no card from the list it came from', async () => {
  const b = await onStory(STORY_C);
  assert.equal(screenOf(b.w), 'story');
  assert.equal(cardsIn(b.main).length, 0, 'no card of the epic board stays');
  assert.equal(findAll(b.main, e => e.attrs['class'] === 'filters').length, 0, 'a story screen has no filters');
  assert.deepEqual(buttonsIn(b.main, 'back').map(x => x.textContent), ['← Back to epic']);
  assert.deepEqual(findAll(b.main, e => e.tag === 'h1').map(h => h.textContent), ['Section navigation']);
  assert.deepEqual(texts(b.w.el['crumbs']!), ['Delivery', '/', 'Epics', '/', 'Board epic', '/', 'S003']);
  assert.equal(findAll(b.main, e => e.attrs['class'] === 'kicker')[0]!.textContent, 'STORY · AAAAAAAA / S003');
  assert.equal(focusState.active, findAll(b.main, e => e.tag === 'h1')[0], 'the story\'s heading has focus');
});

test('the story tabs post set-item-tab; overview shows the conflict first, tasks, why and chain; evidence is a records table with open buttons', async () => {
  const b = await onStory(STORY_C);
  const tabs = tabsIn(b.main);
  assert.deepEqual(tabs.map(t => [t.textContent, t.attrs['aria-selected'], t.attrs['tabindex']]), [
    ['Overview & tasks', 'true', '0'], ['Workflow evidence', 'false', '-1'], ['Linked work', 'false', '-1'],
  ]);
  const body = findAll(b.main, e => e.attrs['class'] === 'screen-body')[0]!;
  const order = body.children.map(c => c.attrs['class'] ?? c.tag);
  assert.ok(order.indexOf('conflict') >= 0 && order.indexOf('conflict') < order.indexOf('item-tabs'), `the warning comes before the tabs and any task: ${order}`);
  const conflict = findAll(body, e => e.attrs['class'] === 'conflict')[0]!;
  assert.deepEqual([conflict.attrs['role'], texts(conflict)[0]], ['note', 'Two records disagree']);
  const panel = findAll(b.main, e => e.attrs['role'] === 'tabpanel')[0]!;
  const tasks = findAll(panel, e => e.tag === 'details' && e.attrs['class'] === 'task');
  assert.deepEqual(tasks.map(t => texts(t.children[0]!)[0]), ['Project records', 'Render structure']);
  assert.deepEqual(findAll(tasks[1]!, e => e.attrs['class'] === 'pill').map(x => [x.textContent, x.attrs['data-tone']]), [['Failed', 'danger']]);
  assert.ok(texts(panel).includes('Why this stage?'));
  assert.ok(findAll(panel, e => e.attrs['class'] === 'chain').length === 1, 'the artifact chain');
  const cols = findAll(panel, e => e.attrs['class'] === 'item-cols')[0]!;
  assert.deepEqual(cols.children.map(c => c.attrs['class']), ['item-main', 'item-side'], 'tasks beside why and chain');

  // Left/Right walk the tabs; a tab posts set-item-tab and the panel follows.
  tabs[0]!.listeners['keydown']!(keyEvent('ArrowRight'));
  assert.equal(focusState.active, tabs[1]);
  b.w.posted.length = 0;
  click(tabs[1]!);
  assert.deepEqual(payloadsOf(b.w.posted), [{ type: 'set-item-tab', tab: 'evidence' }]);
  b.relay();
  const evidence = findAll(b.main, e => e.attrs['role'] === 'tabpanel')[0]!;
  assert.equal(evidence.attrs['data-tab'], 'evidence');
  assert.equal(findAll(evidence, e => e.attrs['class'] === 'task').length, 0, 'evidence shows no tasks');
  const wrap = findAll(evidence, e => e.attrs['class'] === 'table-wrap')[0]!;
  const rows = findAll(wrap, e => e.tag === 'tr' && e.attrs['data-artifact-id'] !== undefined);
  assert.deepEqual(rows.map(r => r.children.slice(0, 4).map(c => c.textContent)), [
    ['BUILD BUILD-c', 'Approved · 2026-10-01 11:43 UTC', '—', '—'],
    ['CR CR-c', 'Pending', '—', '—'],
    ['LLD LLD-c', 'Approved', '—', '—'],
  ], 'every record, with approval, review and override in their own columns');
  assert.deepEqual(rows.map(r => findAll(r, e => e.tag === 'button')[0]!.textContent), ['Open read-only', 'Open read-only', 'Open in review']);
  assert.ok(texts(evidence).includes('Code review without a build record: CR-c reviewed code early.'), 'notices in words');
  b.w.posted.length = 0;
  click(findAll(rows[0]!, e => e.tag === 'button')[0]!);
  assert.deepEqual(payloadsOf(b.w.posted), [{ type: 'open-evidence', itemId: STORY_C, artifactId: 'BUILD-c' }]);
  b.relay();
  b.s.evidence.at(-1)!.resolve({ ok: true, value: { artifactId: 'BUILD-c', kind: 'BUILD', meta: {}, body: {}, renderedMarkdown: '# Build <b>x</b>' } });
  await flush();
  b.pump();
  const pre = findAll(b.main, e => e.tag === 'pre')[0]!;
  assert.deepEqual([pre.attrs['class'], pre.textContent], ['opened-record', '# Build <b>x</b>'], 'the opened record as preformatted text');
  assert.equal(findAll(b.main, e => e.attrs['role'] === 'tabpanel')[0]!.attrs['data-tab'], 'evidence', 'still on the tab the reader chose');

  // A narrow pane uses the short tab labels.
  b.w.resize(360);
  assert.deepEqual(tabsIn(b.main).map(t => t.textContent), ['Overview', 'Evidence', 'Linked']);
});

test('linked work lists the epic, children and correcting issues, each opening its own screen', async () => {
  const b = await onStory(STORY_C);
  click(tabsIn(b.main)[2]!);
  b.relay();
  const panel = findAll(b.main, e => e.attrs['role'] === 'tabpanel')[0]!;
  assert.deepEqual(findAll(panel, e => e.tag === 'h2').map(h => h.textContent), ['Epic', 'Children', 'Issues correcting this story']);
  const children = findAll(panel, e => e.tag === 'ul' && e.attrs['class'] === 'linked')[1]!;
  assert.deepEqual(texts(children), ['TASK · Project records · on Overview & tasks', 'TASK · Render structure · on Overview & tasks'],
    'the story\'s children are its tasks, which have no screen of their own: named here, expanded on the overview');
  const links = findAll(panel, e => e.tag === 'button');
  assert.deepEqual(links.map(l => l.textContent), ['Board epic', 'ISSUE · Jump is off by one · Design & plan']);
  assert.ok(texts(panel).includes(' · 2 of 3 stories complete'), 'the epic with its completion');
  b.w.posted.length = 0;
  click(links[0]!);
  click(links[1]!);
  assert.deepEqual(payloadsOf(b.w.posted), [{ type: 'open-epic', epicItemId: EPIC_A }, { type: 'open-item', itemId: 'H9999aaaa0000bbbb' }]);
  b.w.posted.length = 0;
  click(links[1]!);
  b.relay();
  assert.equal(screenOf(b.w), 'issue');
  assert.deepEqual(texts(b.w.el['crumbs']!).at(-1), '9999AAAA');
  assert.deepEqual(buttonsIn(b.main, 'back').map(x => x.textContent), ['← Back to S003']);

  // A fix story of an issue is part of that issue; a standalone story has no Epic section.
  click(findAll(b.main, e => e.attrs['data-item-id'] === 'H9999aaaa0000bbbb:S001')[0]!);
  b.relay();
  click(tabsIn(b.main)[2]!);
  b.relay();
  const fixPanel = findAll(b.main, e => e.attrs['role'] === 'tabpanel')[0]!;
  assert.deepEqual(findAll(fixPanel, e => e.tag === 'h2').map(h => h.textContent), ['Part of', 'Issues correcting this story']);
  assert.deepEqual(findAll(fixPanel, e => e.tag === 'button').map(x => x.textContent), ['Jump is off by one']);
  assert.ok(texts(fixPanel).includes('No issue records this story as its parent.'));
  assert.deepEqual(b.s.logs.warn, []);
});

test('the issue screen opens what it corrects, or shows the parent notice, and lists its fix stories', async () => {
  const b = await liveBoard(itemsSnapshot());
  const main = b.w.el['main']!;
  click(buttonsIn(main, 'view').find(v => v.attrs['data-view'] === 'issues')!);
  b.relay();
  click(findAll(main, e => e.attrs['class'] === 'issue-row' && e.attrs['data-item-id'] === 'H9999aaaa0000bbbb')[0]!);
  b.relay();
  assert.equal(screenOf(b.w), 'issue');
  assert.deepEqual(buttonsIn(main, 'back').map(x => x.textContent), ['← Issues']);
  assert.deepEqual(texts(b.w.el['crumbs']!), ['Delivery', '/', 'Issues', '/', '9999AAAA']);
  const open = findAll(main, e => e.tag === 'button' && e.textContent === 'Open what it corrects →')[0]!;
  assert.ok(texts(main).includes('Corrects Section navigation · Complete'));
  const fixes = findAll(main, e => e.attrs['aria-label'] === 'Fix stories')[0]!;
  assert.deepEqual(texts(fixes), ['STORY · Fix the jump', 'Scoped'], 'each fix story with its stage');
  assert.ok(texts(main).includes('Records') && texts(main).includes('No records yet.') && texts(main).includes('Why this stage?'), 'records (none yet, said so) and why');
  b.w.posted.length = 0;
  click(open);
  assert.deepEqual(payloadsOf(b.w.posted), [{ type: 'open-item', itemId: STORY_C }]);

  // An epic parent opens the epic; an unresolved parent shows its notice and no button.
  click(findAll(b.w.el['crumbs']!, e => e.tag === 'button' && e.textContent === 'Issues')[0]!);
  b.relay();
  click(findAll(main, e => e.attrs['class'] === 'issue-row' && e.attrs['data-item-id'] === 'H5555eeee0000ffff')[0]!);
  b.relay();
  b.w.posted.length = 0;
  click(findAll(main, e => e.tag === 'button' && e.textContent === 'Open what it corrects →')[0]!);
  assert.deepEqual(payloadsOf(b.w.posted), [{ type: 'open-epic', epicItemId: 'E20261009bbbbbbbb' }]);
  b.w.posted.length = 0;
  main.listeners['keydown']!(keyEvent('Escape'));
  b.relay();
  click(findAll(main, e => e.attrs['class'] === 'issue-row' && e.attrs['data-item-id'] === 'H7777cccc0000dddd')[0]!);
  b.relay();
  assert.equal(findAll(main, e => e.textContent === 'Open what it corrects →').length, 0);
  assert.ok(texts(main).includes('Unresolved parent') && texts(main).includes("corrects 'gone', which is not in the store"));
  assert.ok(texts(main).includes('No fix story yet'));
});

test('density is restored from the webview state, saved on change and mirrored to the host, and both densities render every screen', async () => {
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
  // Every screen: the four views, an epic's board, a story's three tabs and an issue, at either density.
  const screens: unknown[][] = [
    [], [{ type: 'set-view', view: 'epics' }], [{ type: 'set-view', view: 'standalone' }], [{ type: 'set-view', view: 'issues' }],
    [{ type: 'set-view', view: 'epics' }, { type: 'open-epic', epicItemId: EPIC_A }],
    [{ type: 'open-item', itemId: 'E20261009aaaaaaaa:S003' }],
    [{ type: 'open-item', itemId: 'E20261009aaaaaaaa:S003' }, { type: 'set-item-tab', tab: 'evidence' }],
    [{ type: 'open-item', itemId: 'E20261009aaaaaaaa:S003' }, { type: 'set-item-tab', tab: 'linked' }],
    [{ type: 'open-item', itemId: 'H9999aaaa0000bbbb' }],
  ];
  const rendered: Record<string, { texts: string[]; labels: string[] }[]> = { compact: [], comfortable: [] };
  for (const density of ['compact', 'comfortable'] as const) {
    for (const intents of screens) {
      const b = await liveBoard(itemsSnapshot());
      b.w.el[`density-${density}`]!.listeners['click']!();
      for (const i of intents) b.w.posted.push({ v: 1, payload: i });
      b.relay();
      assert.equal(b.w.el['body']!.attrs['data-density'], density);
      const main = b.w.el['main']!;
      rendered[density]!.push({ texts: texts(main), labels: cardsIn(main).map(c => c.attrs['aria-label']!) });
    }
  }
  assert.deepEqual(rendered['compact'], rendered['comfortable'], 'every screen shows the same content at either density');
  assert.deepEqual(new Set(screens.map((_, k) => rendered['compact']![k]!.texts.join('|'))).size, screens.length, 'nine different screens were rendered');
  assert.ok(rendered['compact']![5]!.texts.includes('Two records disagree') && rendered['compact']![6]!.texts.includes('Records'));
  const b0 = await liveBoard(snap);
  assert.ok(texts(b0.w.el['main']!).includes('Review blocked') && texts(b0.w.el['main']!).includes('Unplanned task'));
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

test('BOARD_STYLE keeps a 320px minimum, card and column minimums, the records table scroll wrapper and only var(--vscode-*) colours, with no hiding rule', () => {
  assert.doesNotMatch(BOARD_STYLE, /#[0-9a-fA-F]{3,8}\b|rgb\(|hsl\(/, 'no literal colour');
  for (const v of BOARD_STYLE.match(/var\(--[a-zA-Z-]+/g) ?? []) assert.match(v, /^var\(--(vscode-|gap|pad|small)/, v);
  for (const hiding of [/display:\s*none/, /visibility:\s*hidden/, /clip/, /text-overflow/, /overflow:\s*hidden/, /height:\s*0[;}]/]) {
    assert.doesNotMatch(BOARD_STYLE, hiding, `no ${hiding} rule`);
  }
  // Minimum widths: the page, the card grid, the epic row's name, the story's two columns, the records table.
  assert.match(BOARD_STYLE, /body\{[^}]*min-width:320px;/);
  assert.match(BOARD_STYLE, /#main\{container-type:inline-size;\}/);
  assert.match(BOARD_STYLE, /\.cards\{display:grid;grid-template-columns:repeat\(auto-fill,minmax\(min\(240px,100%\),1fr\)\);/);
  assert.match(BOARD_STYLE, /\.epic-row\{grid-template-columns:minmax\(220px,1fr\) /);
  assert.match(BOARD_STYLE, /\.item-cols\{display:grid;grid-template-columns:minmax\(340px,1\.4fr\) minmax\(280px,1fr\);/);
  assert.match(BOARD_STYLE, /@container \(max-width:760px\)\{\.item-cols\{grid-template-columns:minmax\(0,1fr\);\}\.item-side\{order:-1;\}\}/, 'the stage explanation and chain come first when stacked');
  assert.match(BOARD_STYLE, /\.table-wrap\{overflow-x:auto;/);
  assert.match(BOARD_STYLE, /table\.records\{min-width:620px;/);
  // The old composite page is gone.
  for (const gone of [/repeat\(6,/, /@media \(max-width:600px\)/, /#details/, /\.layout/]) assert.doesNotMatch(BOARD_STYLE, gone, `no ${gone}`);
  for (const tone of ['success', 'warning', 'danger', 'neutral']) assert.match(BOARD_STYLE, new RegExp(`\\[data-tone="${tone}"\\]\\{color:var\\(--vscode-`), `${tone} pills are tinted from the theme`);
  // Density changes spacing and font size only.
  assert.match(BOARD_STYLE, /body\[data-density="compact"\]\{--gap:[^;]+;--pad:[^;]+;--small:[^;]+;font-size:[^;}]+;\}/);
  assert.match(BOARD_STYLE, /body\[data-density="comfortable"\]\{--gap:[^;]+;--pad:[^;]+;--small:[^;}]+;\}/);
  assert.match(BOARD_STYLE, /:focus-visible\{outline:2px solid var\(--vscode-focusBorder\)/);
  assert.match(BOARD_STYLE, /\.stage>summary\{cursor:pointer;/, 'a closed section\'s summary stays visible and clickable');
});
