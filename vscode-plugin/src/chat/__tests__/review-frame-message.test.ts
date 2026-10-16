/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Story E20261016f52996c2:S001 / t3 — the review pane's rule for a code reference posted by its
 * companion frame.
 *
 * The pane's real bootstrap is lifted out of the emitted shell and run against stand-ins, and the
 * frame's message is posted straight to the pane's window handler: no page is involved, so this
 * proves the pane's rule on its own.
 *
 * Run: npx tsx --test vscode-plugin/src/chat/__tests__/review-frame-message.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDocsReviewHost } from '../docs-review-panel.js';
import type { DocsReviewClient } from '../docs-review-client.js';
import type { ChatPanelChannel } from '../chat-panel.js';
import { bodyStub, fire, type BodyStub } from './fake-dom.js';

const ART = 'LLD-abc-s7';
const TAB = 'docs/epics/x/S007/sequence-diagram.html';
const DOC = {
  artifactId: ART, markdown: '# Doc\n', openQuestions: [], blocked: false, contentVersion: '0123456789abcdef', state: 'pending',
  documents: [
    { title: 'LLD.md', type: 'markdown', relPath: 'docs/epics/x/S007/LLD.md' },
    { title: 'Sequence diagram', type: 'html', relPath: TAB },
  ],
};

interface Pane {
  posted: Record<string, unknown>[];
  frame: BodyStub;
  frameWindow: object;
  /** A window message as the browser delivers it: its source and its data. */
  message(source: unknown, data: unknown): void;
}

/** Runs the pane's bootstrap with a companion frame on show. */
function pane(): Pane {
  let html = '';
  const channel: ChatPanelChannel = {
    setHtml: (h) => { html = h; }, postMessage: () => {}, onMessage: () => {}, onDidDispose: () => {}, reveal: () => {}, dispose: () => {},
  };
  const client = { async pending() { return []; }, async content() { return { markdown: '', openQuestions: [], blocked: false, docPath: '' }; }, async decide() { return { ok: false, message: '' }; } } as unknown as DocsReviewClient;
  createDocsReviewHost({ createPanel: () => channel, client, genNonce: () => 'WV' }).open();
  let script = html.slice(html.indexOf('<script nonce="WV">') + '<script nonce="WV">'.length, html.lastIndexOf('</script>'));
  script = script.slice(script.indexOf('const vs=acquireVsCodeApi()'));

  const byId: Record<string, BodyStub> = {};
  const posted: Record<string, unknown>[] = [];
  let onMessage: ((e: { data: unknown; source?: unknown }) => void) | undefined;
  const doc = {
    addEventListener: () => {},
    createTextNode: (data: string) => bodyStub('#text', undefined, data),
    getElementById: (id: string) => (byId[id] ??= bodyStub('div', id)),
    createElement: (t: string) => bodyStub(t),
    createElementNS: (_ns: string, t: string) => bodyStub(t),
  };
  const win = { addEventListener: (_t: string, l: typeof onMessage) => { onMessage = l; }, getSelection: () => null };
  // eslint-disable-next-line no-new-func
  new Function('document', 'window', 'marked', 'acquireVsCodeApi', script)(
    doc, win, { parse: (s: string) => s }, () => ({
      postMessage: (m: { payload: Record<string, unknown> }) => { posted.push(m.payload); },
      getState: () => undefined, setState: () => {},
    }),
  );
  const host = (type: string, payload: Record<string, unknown>) => onMessage?.({ data: { v: 1, payload: { type, ...payload } } });
  host('docs-content', DOC);
  fire(byId['insrc-rv-tabs']!.children[1]!, 'click');
  host('docs-companion', { artifactId: ART, relPath: TAB, html: '<html></html>' });
  const frame = byId['insrc-rv-frame']!.children[0]!;
  assert.equal(frame.tagName, 'iframe', 'a companion frame is on show');
  const frameWindow = {};
  (frame as unknown as { contentWindow: object }).contentWindow = frameWindow;
  posted.length = 0;
  return { posted, frame, frameWindow, message: (source, data) => onMessage?.({ source, data }) };
}

const REF = (extra: Record<string, unknown> = {}) => ({ type: 'insrc-open-code-ref', path: 'src/workflow/synthesizer.ts', line: 207, ...extra });

test('vscode-plugin/src/chat/__tests__/review-frame-message.test.ts: a reference from the companion frame is posted to the host as an open-code-ref message', () => {
  const p = pane();
  p.message(p.frameWindow, REF());
  assert.deepEqual(p.posted, [{ type: 'open-code-ref', path: 'src/workflow/synthesizer.ts', line: 207 }]);
  p.posted.length = 0;
  p.message(p.frameWindow, { type: 'insrc-open-code-ref', path: 'src/a/b.ts' });
  assert.deepEqual(p.posted, [{ type: 'open-code-ref', path: 'src/a/b.ts' }], 'a path with no line is sent alone');
});

test('vscode-plugin/src/chat/__tests__/review-frame-message.test.ts: a reference from any other window is ignored', () => {
  const p = pane();
  p.message({}, REF());
  p.message(undefined, REF());
  p.message(null, REF());
  assert.deepEqual(p.posted, []);
  // The frame cannot pass for the host either: its message is never read as a host message.
  p.message(p.frameWindow, { v: 1, payload: { type: 'docs-decision-result', artifactId: ART, ok: true, message: 'x' } });
  assert.deepEqual(p.posted, []);
});

test('vscode-plugin/src/chat/__tests__/review-frame-message.test.ts: a message with a missing, non-string or oversized path, or a line that is not a positive integer, is ignored', () => {
  const p = pane();
  const bad: unknown[] = [
    { type: 'insrc-open-code-ref' },
    REF({ path: 7 }), REF({ path: null }), REF({ path: '' }), REF({ path: 'a/'.repeat(300) + 'b.ts' }),
    REF({ line: 0 }), REF({ line: -3 }), REF({ line: 1.5 }), REF({ line: '12' }), REF({ line: null }), REF({ line: NaN }), REF({ line: 1e9 }),
    { type: 'something-else', path: 'src/a.ts' }, null, 'text', 5,
  ];
  for (const d of bad) p.message(p.frameWindow, d);
  assert.deepEqual(p.posted, []);
});

test('vscode-plugin/src/chat/__tests__/review-frame-message.test.ts: the frame keeps sandbox allow-scripts only', () => {
  const p = pane();
  assert.equal(p.frame.attrs['sandbox'], 'allow-scripts');
  assert.equal(p.frame.attrs['src'], undefined);
});
