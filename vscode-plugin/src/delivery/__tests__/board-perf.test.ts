/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * E2 s5, ac5; screens, ISSUE-348d4663 — the measured board. Times the host's derive and post plus the real webview
 * script's DOM build on the fake DOM, for a 500-item, 1,000-record snapshot: the first screen (All work), then each
 * filter change and each drill-down (into an epic's board, into a story's screen), best of three. The fake
 * DOM has no layout or paint, so this is the host-and-script half of the target; the real webview's render on the
 * reference environment is measured by hand. The timings are always reported. The default run fails only at five
 * times each target, so a loaded machine cannot fail unrelated builds; INSRC_PERF=1 asserts the targets themselves.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';

import type { ChatPanelChannel } from '../../chat/chat-panel.js';
import { createDeliveryBoardHost } from '../board-host.js';
import type { BoardDownMessage, Envelope } from '../board-protocol.js';
import { largeSnapshot } from './board-fixtures.js';
import { cardsIn, runScript } from './board-webview-harness.js';
import { flush } from './flush.js';

const FIRST_RENDER_MS = 1000;
const FILTER_CHANGE_MS = 150;
const SLACK = process.env['INSRC_PERF'] === '1' ? 1 : 5;
const RUNS = 3;

/** A host whose panel delivers every post straight into the real script, so a post includes the script's DOM build. */
function boardOverScript() {
  const w = runScript();
  let toHost: ((m: unknown) => void) | undefined;
  const channel: ChatPanelChannel = {
    setHtml() {},
    postMessage(m) { w.deliver(m as Envelope<BoardDownMessage>); },
    onMessage(l) { toHost = l; },
    onDidDispose() {},
    reveal() {},
    dispose() {},
  };
  const snap = largeSnapshot();
  const host = createDeliveryBoardHost({
    createPanel: () => channel,
    client: { snapshot: async () => ({ ok: true, value: snap }), evidence: async () => ({ ok: false, failure: { kind: 'read-failed', message: 'unused' } }) },
    logger: { warn: () => {}, error: () => {} },
    now: () => '2026-10-09T12:00:00.000Z',
    genNonce: () => 'N0NCE',
  });
  return { w, host, send: (payload: unknown) => toHost?.({ v: 1, payload }) };
}

const cards = (w: ReturnType<typeof runScript>) => cardsIn(w.el['main']!).length;

test('a 500-item, 1,000-record board renders within one second and each filter change or drill-down within 150 ms, best of three', async (t) => {
  const snap = largeSnapshot();
  assert.equal(snap.items.length, 500);
  assert.equal(snap.recordCount, 1000);
  assert.deepEqual(largeSnapshot(), snap, 'the fixture is deterministic');

  // The first board: open, the snapshot arrives, the board is derived, posted and built in the script.
  let first = Infinity;
  let board = boardOverScript();
  for (let run = 0; run < RUNS; run++) {
    board = boardOverScript();
    const t0 = performance.now();
    board.host.open();
    await flush();
    first = Math.min(first, performance.now() - t0);
    assert.ok(cards(board.w) > 0, 'the board was rendered');
  }
  assert.ok(cardsIn(board.w.el['main']!).some(c => c.children.some(k => k.attrs['class'] === 'muted' && / tasks? /.test(` ${k.textContent} `))), 'the cards carry their task summaries');

  // Each filter change on the last board: search, attention and the view, each best of three, reset between runs.
  const changes: { name: string; apply: unknown; reset: unknown }[] = [
    { name: 'search', apply: { type: 'set-search', search: 'story 1' }, reset: { type: 'set-search', search: '' } },
    { name: 'attention', apply: { type: 'set-attention', on: true }, reset: { type: 'set-attention', on: false } },
    { name: 'view', apply: { type: 'set-view', view: 'standalone' }, reset: { type: 'set-view', view: 'all' } },
  ];
  const timings: Record<string, number> = {};
  for (const c of changes) {
    let best = Infinity;
    for (let run = 0; run < RUNS; run++) {
      const before = cards(board.w);
      const t0 = performance.now();
      board.send(c.apply);
      best = Math.min(best, performance.now() - t0);
      assert.notEqual(cards(board.w), before, `${c.name} changed what the board shows`);
      board.send(c.reset);
    }
    timings[c.name] = best;
  }

  // Each drill-down: into an epic's board from Epics, and into a story's screen from that board, each best of three.
  const screen = () => board.w.el['main']!.attrs['data-screen'];
  board.send({ type: 'set-view', view: 'epics' });
  for (const d of [
    { name: 'open epic', apply: { type: 'open-epic', epicItemId: 'E07' }, expect: 'stages' },
    { name: 'open story', apply: { type: 'open-item', itemId: 'E07:S003' }, expect: 'story' },
  ]) {
    let best = Infinity;
    for (let run = 0; run < RUNS; run++) {
      const t0 = performance.now();
      board.send(d.apply);
      best = Math.min(best, performance.now() - t0);
      assert.equal(screen(), d.expect, `${d.name} shows its screen`);
      if (run < RUNS - 1) board.send({ type: 'back' });
    }
    timings[d.name] = best;
  }
  assert.equal(cards(board.w), 0, 'the story\'s screen shows nothing of the board under it');

  t.diagnostic(`first board: ${first.toFixed(1)} ms (target ${FIRST_RENDER_MS} ms)`);
  for (const [name, ms] of Object.entries(timings)) t.diagnostic(`${name}: ${ms.toFixed(1)} ms (target ${FILTER_CHANGE_MS} ms)`);
  t.diagnostic(SLACK === 1 ? 'asserting the exact targets (INSRC_PERF=1)' : `asserting ${SLACK}x the targets; set INSRC_PERF=1 for the exact targets`);

  assert.ok(first <= FIRST_RENDER_MS * SLACK, `first board ${first.toFixed(1)} ms > ${FIRST_RENDER_MS * SLACK} ms`);
  for (const [name, ms] of Object.entries(timings)) {
    assert.ok(ms <= FILTER_CHANGE_MS * SLACK, `${name} ${ms.toFixed(1)} ms > ${FILTER_CHANGE_MS * SLACK} ms`);
  }
});
