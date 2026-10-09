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
import type { DeliveryItem, DeliverySnapshot } from '../delivery-contract.js';
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

function snapshot(ids: readonly string[], takenAt: string): DeliverySnapshot {
  const items = ids.map(id => ({ id, kind: 'story', title: `Title ${id}`, stage: null }) as unknown as DeliveryItem);
  return { schemaVersion: 1, repo: '/ws', takenAt, recordCount: ids.length, unreadableCount: 0, items, rootIds: ids, notices: [], counts: {}, attentionRule: '' } as unknown as DeliverySnapshot;
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
const lastItems = (c: FakeChannel) => {
  const m = payloads(c).filter(p => p.type === 'items').at(-1);
  return m?.type === 'items' ? m.items.map(i => i.itemId) : null;
};

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
  assert.equal(payloads(ch).some(p => p.type === 'items' && p.items.some(i => i.itemId === 'old')), false);
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

/** A minimal DOM the script runs against: elements record textContent and children, and innerHTML throws. */
function runScript(): { posted: unknown[]; deliver(msg: unknown): void; el: Record<string, { textContent: string; children: { textContent: string }[] }> } {
  const make = () => {
    const e = {
      textContent: '', children: [] as { textContent: string }[], attrs: {} as Record<string, string>, listeners: {} as Record<string, () => void>,
      get firstChild() { return e.children[0] ?? null; },
      removeChild(c: unknown) { e.children = e.children.filter(x => x !== c); },
      appendChild(c: { textContent: string }) { e.children.push(c); },
      setAttribute(k: string, v: string) { e.attrs[k] = v; },
      addEventListener(k: string, f: () => void) { e.listeners[k] = f; },
    };
    Object.defineProperty(e, 'innerHTML', { set() { throw new Error('innerHTML used'); }, get() { throw new Error('innerHTML used'); } });
    return e;
  };
  const el: Record<string, ReturnType<typeof make>> = { status: make(), notice: make(), items: make(), refresh: make() };
  const posted: unknown[] = [];
  let onMessage: ((e: { data: unknown }) => void) | undefined;
  const document = { getElementById: (id: string) => el[id], createElement: () => make() };
  const window = { addEventListener: (_k: string, f: (e: { data: unknown }) => void) => { onMessage = f; } };
  const acquireVsCodeApi = () => ({ postMessage: (m: unknown) => posted.push(m) });
  new Function('document', 'window', 'acquireVsCodeApi', BOARD_WEBVIEW_SCRIPT)(document, window, acquireVsCodeApi);
  el.refresh!.listeners['click']!();
  return { posted, deliver: m => onMessage?.({ data: m }), el };
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
  deliver({ v: 1, payload: { type: 'items', items: [{ itemId: 'a', kind: 'story', title: hostile, stageLabel: 'Complete' }] } });
  assert.match(el['status']!.textContent, /<img src=x onerror=alert\(1\)>.*\(stale\)/);
  assert.equal(el['notice']!.textContent, hostile);
  assert.equal(el['items']!.children.length, 1);
  assert.equal(el['items']!.children[0]!.textContent, `story · ${hostile} · Complete`);
});
