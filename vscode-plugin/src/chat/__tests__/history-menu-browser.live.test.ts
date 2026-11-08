/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * ISSUE-0d3939248a956860 — smoke: the chat history menu, opened on a fresh chat, shows the most
 * recent chats in a real browser.
 *
 * The shell tests run the webview script against a fake DOM with no layout, so they cannot see
 * where a scrollable menu ends up. This test renders the real shell, replays the host's own
 * messages for a long history into it in headless Chrome, opens the history menu and reads back
 * what is on screen: the top of the menu, the most recent chat's row inside the visible area, no
 * empty "new chat" row, the top again after a scroll + reopen, and a click on that row posting
 * open-chat for it.
 *
 * Gated like the repo's other browser checks: it runs only with INSRC_LIVE_TESTS=1 and a Chrome
 * binary (google-chrome, chromium, chromium-browser, or the macOS Google Chrome app), and skips
 * cleanly otherwise.
 *
 *   INSRC_LIVE_TESTS=1 npx tsx --test src/chat/__tests__/history-menu-browser.live.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createChatPanelHost, type ChatPanelChannel } from '../chat-panel.js';
import { createInMemoryChatSessionStore } from '../session-store.js';
import type { ProviderRegistry, StreamAdapter } from '../cli-adapter.js';
import type { TurnEvent } from '../stream-events.js';

const MAC_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

function chromeBinary(): string | undefined {
  for (const bin of ['google-chrome', 'chromium', 'chromium-browser']) {
    if (spawnSync(bin, ['--version'], { stdio: 'ignore' }).status === 0) return bin;
  }
  return existsSync(MAC_CHROME) ? MAC_CHROME : undefined;
}

const CHROME = process.env['INSRC_LIVE_TESTS'] === '1' ? chromeBinary() : undefined;

const NONCE = 'N';
const CHATS = 30;

/** The real shell plus every message the host posted on open + ready, for a long history. */
function renderShell(): { html: string; posted: unknown[]; newestId: string } {
  const store = createInMemoryChatSessionStore();
  let newestId = '';
  for (let i = 0; i < CHATS; i++) {
    const s = store.create(i % 2 === 0 ? 'claude' : 'codex');
    s.title = `Chat ${i}`;
    s.transcript.push({ role: 'user', text: `q${i}`, at: new Date(Date.UTC(2026, 10, 1, 0, i)).toISOString() });
    store.save(s);
    newestId = s.id;
  }
  for (let i = 0; i < 8; i++) store.create('claude'); // empty "new chat" sessions, as on a real disk

  let html = '';
  let onMsg: ((m: unknown) => void) | undefined;
  let onDispose: (() => void) | undefined;
  const posted: unknown[] = [];
  const channel: ChatPanelChannel = {
    setHtml: (h) => { html = h; },
    postMessage: (m) => { posted.push(m); },
    onMessage: (l) => { onMsg = l; },
    onDidDispose: (l) => { onDispose = l; },
    reveal: () => {},
    dispose: () => {},
  };
  const adapter: StreamAdapter = { async *run(): AsyncIterable<TurnEvent> {}, async *resume(): AsyncIterable<TurnEvent> {}, cancel: async () => {}, decide: () => ({ delivered: true }), capabilities: { resume: true } };
  const providers: ProviderRegistry = { available: ['claude', 'codex'], get: () => adapter };
  const host = createChatPanelHost({ createPanel: () => channel, providers, store, cwd: () => '/repo', genNonce: () => NONCE });
  host.open();
  onMsg?.({ v: 1, payload: { type: 'ready' } });
  host.dispose();
  onDispose?.(); // the panel is gone: the host clears its timers
  return { html, posted, newestId };
}

/** The page: a VS Code API stand-in first, then a driver that replays, opens and measures. */
function page(html: string, posted: unknown[]): string {
  const stub = `<script nonce="${NONCE}">window.__sent=[];window.acquireVsCodeApi=function(){return{postMessage:function(m){window.__sent.push(m);},getState:function(){},setState:function(){}};};</script>`;
  const driver = `<script nonce="${NONCE}">window.addEventListener('load',function(){
var P=${JSON.stringify(posted)};P.forEach(function(m){window.dispatchEvent(new MessageEvent('message',{data:m}));});
setTimeout(function(){var r={};try{
var hs=document.getElementById('insrc-history'),menu=document.getElementById('insrc-histmenu');hs.click();
var rows=menu.querySelectorAll('.item'),mr=menu.getBoundingClientRect(),first=rows[0].getBoundingClientRect();
r.open=menu.classList.contains('open');r.scrollTop=menu.scrollTop;r.scrollable=menu.scrollHeight>menu.clientHeight;
r.firstVisible=first.top>=mr.top&&first.bottom<=mr.bottom;r.firstLabel=rows[0].querySelector('.lbl').textContent;
r.labels=Array.prototype.map.call(rows,function(x){return x.querySelector('.lbl').textContent;});
var a=document.activeElement;r.focused=a&&a.querySelector&&a.querySelector('.lbl')?a.querySelector('.lbl').textContent:null;
menu.scrollTop=menu.scrollHeight;hs.click();hs.click();r.reopenScrollTop=menu.scrollTop;
rows=menu.querySelectorAll('.item');window.__sent.length=0;rows[0].click();r.sent=window.__sent.slice();
}catch(e){r.error=String(e);}var pre=document.createElement('pre');pre.id='zzout';pre.textContent=JSON.stringify(r);document.body.appendChild(pre);},300);});</script>`;
  return html.replace('<head>', `<head>${stub}`).replace('</body>', `${driver}</body>`);
}

function loadInChrome(bin: string, file: string): string {
  const r = spawnSync(bin, [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--window-size=480,640', '--virtual-time-budget=3000',
    '--dump-dom', `file://${file}`,
  ], { encoding: 'utf8', timeout: 60_000, maxBuffer: 64 * 1024 * 1024 });
  return r.stdout ?? '';
}

if (CHROME === undefined) {
  test('history-menu-browser.live: skipped (set INSRC_LIVE_TESTS=1 with Chrome installed)', { skip: true }, () => {});
} else {
  test('history-menu-browser.live: on a fresh chat the opened history menu shows the most recent chat at its top, lists no empty chat, and a click opens that chat', () => {
    const dir = mkdtempSync(join(tmpdir(), 'history-menu-browser-'));
    try {
      const { html, posted, newestId } = renderShell();
      const file = join(dir, 'shell.html');
      writeFileSync(file, page(html, posted));
      const dom = loadInChrome(CHROME, file);
      const m = /<pre id="zzout">([\s\S]*?)<\/pre>/.exec(dom);
      assert.ok(m, 'the driver reported back');
      const r = JSON.parse(m[1]!.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')) as {
        error?: string; open: boolean; scrollTop: number; scrollable: boolean; firstVisible: boolean; firstLabel: string;
        labels: string[]; focused: string | null; reopenScrollTop: number; sent: Array<{ payload: { type: string; chatId?: string } }>;
      };
      assert.equal(r.error, undefined, `the driver ran without error: ${r.error}`);
      assert.equal(r.open, true, 'the menu opened');
      assert.equal(r.scrollable, true, 'the history is long enough to scroll (the case that broke)');
      assert.equal(r.scrollTop, 0, 'the menu opens at its top');
      assert.equal(r.firstLabel, `Chat ${CHATS - 1}`, 'the top row is the most recent chat');
      assert.equal(r.firstVisible, true, 'and it is inside the visible area of the menu');
      assert.equal(r.labels.length, CHATS + 1, 'every chat with a message, plus new…');
      assert.ok(!r.labels.includes('new chat'), 'no empty "new chat" session is listed');
      assert.equal(r.focused, 'new…', 'focus is on the selected row of a fresh chat (new…)');
      assert.equal(r.reopenScrollTop, 0, 'scrolled down, closed and reopened, the menu is back at its top');
      assert.deepEqual(r.sent.map((s) => s.payload), [{ type: 'open-chat', chatId: newestId }], 'clicking the top row opens that chat');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}
