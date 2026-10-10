/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** E2 s1 / t6 — the delivery board's wiring: running the registered command over fakes, and that extension.ts calls it outside the chat gate. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import type { CommandDescriptor, CommandRegistry } from '../../surfaces/command-registry.js';
import { registerDeliveryBoard, type BoardWebviewPanel } from '../board-wiring.js';
import { item, snapshot } from './board-fixtures.js';
import { flush } from './flush.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const EXT = readFileSync(join(HERE, '..', '..', 'extension.ts'), 'utf8');
const PKG = JSON.parse(readFileSync(join(HERE, '..', '..', '..', 'package.json'), 'utf8')) as {
  contributes?: { commands?: Array<{ command: string; title: string; category?: string }> };
};

interface FakePanel extends BoardWebviewPanel {
  readonly posted: unknown[];
  reveals: number;
  disposed: boolean;
  close(): void;
}

function fakePanel(): FakePanel {
  let onDispose: (() => void) | undefined;
  const p: FakePanel = {
    webview: {
      html: '',
      postMessage: (m) => { p.posted.push(m); return Promise.resolve(true); },
      onDidReceiveMessage: () => undefined,
    },
    posted: [],
    reveals: 0,
    disposed: false,
    onDidDispose: (l) => { onDispose = l; },
    reveal: () => { p.reveals++; },
    dispose: () => { p.disposed = true; onDispose?.(); },
    close: () => onDispose?.(),
  };
  return p;
}

/** [start, end) of the `if (chatEnabled) { … }` block, found by brace matching. */
function chatGateSpan(src: string): readonly [number, number] {
  const start = src.indexOf('if (chatEnabled) {');
  assert.ok(start >= 0, 'extension.ts has the chat gate');
  let depth = 0;
  for (let i = src.indexOf('{', start); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return [start, i + 1];
  }
  throw new Error('unbalanced chat gate');
}


test('extension.ts registers insrc.delivery.openBoard outside the chat gate with a warn-and-error logger and a repo-scoped delivery client', async () => {
  const cmd = PKG.contributes?.commands?.find(c => c.command === 'insrc.delivery.openBoard');
  assert.deepEqual(cmd, { command: 'insrc.delivery.openBoard', title: 'Open delivery board', category: 'insrc' });

  // extension.ts calls the wiring once, outside the insrc.chat.enabled gate, with the workspace folder and the two-sink logger.
  const [gateStart, gateEnd] = chatGateSpan(EXT);
  const call = EXT.indexOf('registerDeliveryBoard({');
  assert.ok(call >= 0 && (call < gateStart || call >= gateEnd), 'registerDeliveryBoard is called outside the chat gate');
  const args = EXT.slice(call, EXT.indexOf('});', call));
  assert.match(args, /rpc: client\.rpc/);
  assert.match(args, /repo: \(\) => vscode\.workspace\.workspaceFolders\?\.\[0\]\?\.uri\.fsPath \?\? null/);
  assert.match(args, /logger: panelLog,/);
  assert.match(EXT, /const panelLog = \{\s*warn: \(message: string\): void => console\.warn\(`\[insrc\] \$\{message\}`\),\s*error: \(message: string\): void => console\.error\(`\[insrc\] \$\{message\}`\),\s*\};/, 'the shared panel logger has warn and error sinks');
  assert.match(args, /vscode\.ViewColumn\.Active, \{ enableScripts: true \}/);

  // Running the registered command over fakes.
  const handlers = new Map<string, () => Promise<void>>();
  const commands: CommandRegistry = { register: (d: CommandDescriptor, run) => { handlers.set(d.id, run); } };
  const disposables: { dispose(): void }[] = [];
  const panels: { viewType: string; title: string; panel: FakePanel }[] = [];
  const rpcCalls: { method: string; params: unknown }[] = [];
  const logs = { warn: [] as string[], error: [] as string[] };
  let repo: string | null = '/ws';
  registerDeliveryBoard({
    commands,
    subscriptions: { push: (d) => disposables.push(d as { dispose(): void }) },
    createWebviewPanel: (viewType, title) => { const panel = fakePanel(); panels.push({ viewType, title, panel }); return panel; },
    rpc: (async (method: string, params?: unknown) => {
      rpcCalls.push({ method, params });
      throw new Error('daemon is not running — start it with: insrc daemon start');
    }) as never,
    repo: () => repo,
    logger: { warn: m => logs.warn.push(m), error: m => logs.error.push(m) },
  });
  const open = handlers.get('insrc.delivery.openBoard');
  assert.ok(open, 'the command is registered');

  await open();
  await flush();
  assert.deepEqual(panels.map(p => [p.viewType, p.title]), [['insrc.deliveryBoard', 'Delivery board']]);
  const first = panels[0]!.panel;
  assert.match(first.webview.html, /default-src 'none'/);
  const nonce = /script-src 'nonce-([^']+)'/.exec(first.webview.html)?.[1] ?? '';
  assert.match(nonce, /^[A-Za-z0-9+/]{22}==$/, 'the nonce is 16 random bytes, base64');
  assert.deepEqual(rpcCalls, [{ method: 'workflow.delivery', params: { repo: '/ws' } }], 'the client is scoped to the workspace folder');
  const states = first.posted.map(m => (m as { payload: { type: string; status?: { state: string } } }).payload).filter(p => p.type === 'status').map(p => p.status?.state);
  assert.deepEqual(states, ['loading', 'unavailable']);
  assert.equal(logs.error.length, 1, 'the failure reaches the logger\'s error sink');
  assert.match(logs.error[0]!, /daemon-unavailable/);

  await open();
  await flush();
  assert.equal(panels.length, 1, 'a second run reveals the same panel');
  assert.equal(first.reveals, 1);
  assert.equal(rpcCalls.length, 2, 'and refreshes');

  repo = '/other';
  await open();
  await flush();
  assert.deepEqual(rpcCalls[2], { method: 'workflow.delivery', params: { repo: '/other' } }, 'each refresh reads the workspace folder as it is now');

  assert.equal(disposables.length, 1);
  disposables[0]!.dispose();
  assert.equal(first.disposed, true, 'deactivation closes the board');
  await open();
  assert.equal(panels.length, 2, 'the next run opens a new panel');
});

test('the board receives the review pane when the chat setting creates one, and reads evidence itself when it does not', async () => {
  // extension.ts: docsReviewHost is declared before the chat gate, assigned inside it, and handed to the board outside it.
  const [gateStart, gateEnd] = chatGateSpan(EXT);
  const decl = EXT.indexOf('let docsReviewHost: DocsReviewHost | undefined;');
  assert.ok(decl >= 0 && decl < gateStart, 'docsReviewHost is declared before the chat gate');
  const assign = EXT.indexOf('docsReviewHost = reviewHost;');
  assert.ok(assign > gateStart && assign < gateEnd, 'and assigned inside it');
  const call = EXT.indexOf('registerDeliveryBoard({');
  assert.match(EXT.slice(call, EXT.indexOf('});', call)), /reviewPane: docsReviewHost,/, 'and passed to the board outside it');

  const snap = snapshot([item({ id: 'S1', evidence: [
    { artifactId: 'LLD-x', kind: 'LLD', mdPath: 'docs/e/S001/LLD.md', openWith: 'review-view', approval: { state: 'pending', at: null }, review: null, reviewCurrency: null },
  ] as never })]);

  /** Register the board over fakes, open it, open S1's screen and ask to open its LLD; returns what reached the pane and the daemon. */
  async function run(withPane: boolean) {
    const handlers = new Map<string, () => Promise<void>>();
    const toHost: ((m: unknown) => void)[] = [];
    const rpcCalls: { method: string; params: unknown }[] = [];
    const paneOpens: { artifactId: string; mdPath: string }[] = [];
    const panel = fakePanel();
    panel.webview.onDidReceiveMessage = (l: (m: unknown) => void) => { toHost.push(l); return { dispose() {} }; };
    registerDeliveryBoard({
      commands: { register: (d: CommandDescriptor, r) => { handlers.set(d.id, r); } },
      subscriptions: { push: () => undefined },
      createWebviewPanel: () => panel,
      rpc: (async (method: string, params?: unknown) => {
        rpcCalls.push({ method, params });
        return method === 'workflow.delivery' ? snap : { artifactId: 'LLD-x', kind: 'LLD', meta: {}, body: {}, renderedMarkdown: '# LLD' };
      }) as never,
      repo: () => '/ws',
      logger: { warn: () => {}, error: () => {} },
      ...(withPane ? { reviewPane: { openArtifact: (t: { artifactId: string; mdPath: string }) => { paneOpens.push({ ...t }); } } } : {}),
    });
    await handlers.get('insrc.delivery.openBoard')!();
    await flush();
    const sendUp = (payload: unknown) => { for (const l of toHost) l({ v: 1, payload }); };
    sendUp({ type: 'open-item', itemId: 'S1' });
    sendUp({ type: 'open-evidence', itemId: 'S1', artifactId: 'LLD-x' });
    await flush();
    // The story's own screen carries its details.
    const details = panel.posted
      .map(m => (m as { payload: { type: string; model?: { body?: { kind: string; details?: { openedRecord?: unknown } } } } }).payload)
      .filter(p => p.type === 'screen' && p.model?.body?.kind === 'story')
      .map(p => p.model!.body!);
    return { paneOpens, rpcCalls, details };
  }

  const withPane = await run(true);
  assert.deepEqual(withPane.paneOpens, [{ artifactId: 'LLD-x', mdPath: 'docs/e/S001/LLD.md' }], 'the record opens in the review pane');
  assert.deepEqual(withPane.rpcCalls.map(c => c.method), ['workflow.delivery'], 'and the board reads nothing itself');

  const without = await run(false);
  assert.deepEqual(without.paneOpens, []);
  assert.deepEqual(without.rpcCalls.map(c => c.method), ['workflow.delivery', 'workflow.deliveryEvidence'], 'without a pane the board reads the record');
  assert.deepEqual(without.rpcCalls[1]!.params, { repo: '/ws', artifactId: 'LLD-x' });
  assert.deepEqual(without.details.at(-1)!.details!.openedRecord, { artifactId: 'LLD-x', text: '# LLD' }, 'and shows it read-only');
});
