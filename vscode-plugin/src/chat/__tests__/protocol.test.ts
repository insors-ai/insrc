/**
 * Story E20260926f9563bf5:S002 / t1 — the additive 'cancel-turn' WebviewToHost message.
 *
 * Pins the additive-only contract change: WEBVIEW_TO_HOST_TYPES reserves 'cancel-turn'
 * (WebviewToHostType derives it) with every prior message kind unchanged (k2). The
 * runtime no-op-when-idle behaviour is proven in chat-panel.test.ts (t2).
 *
 * Run: npx tsx --test vscode-plugin/src/chat/__tests__/protocol.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WEBVIEW_TO_HOST_TYPES, type WebviewToHost, type WebviewToHostType } from '../protocol.js';

test("WEBVIEW_TO_HOST_TYPES reserves 'cancel-turn' alongside every prior kind (additive, k2)", () => {
  for (const k of ['submit-turn', 'new-chat', 'open-chat', 'set-edit-mode', 'edit-decision', 'docs-decision', 'open-doc']) {
    assert.ok(WEBVIEW_TO_HOST_TYPES.includes(k as WebviewToHostType), `existing kind ${k} still present`);
  }
  assert.ok(WEBVIEW_TO_HOST_TYPES.includes('cancel-turn'), "'cancel-turn' is reserved");
});

test("a { type: 'cancel-turn' } WebviewToHost message typechecks and carries no other field", () => {
  const msg: WebviewToHost = { type: 'cancel-turn' };
  assert.equal(msg.type, 'cancel-turn');
  assert.deepEqual(Object.keys(msg), ['type']);
});

test('every existing WebviewToHost message still constructs with its original shape (no drift, k2)', () => {
  const samples: WebviewToHost[] = [
    { type: 'submit-turn', text: 'hi' },
    { type: 'new-chat', provider: 'claude' },
    { type: 'open-chat', chatId: 'c1' },
    { type: 'set-edit-mode', mode: 'auto' },
    { type: 'edit-decision', path: 'a.ts', accept: true },
    { type: 'docs-decision', artifactId: 'x', accept: false },
    { type: 'open-doc', artifactId: 'x' },
  ];
  assert.equal(samples.length, 7);
});
