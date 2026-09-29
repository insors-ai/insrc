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
import { WEBVIEW_TO_HOST_TYPES, type WebviewToHost, type WebviewToHostType, type PermissionMode } from '../protocol.js';

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

test("S004: WEBVIEW_TO_HOST_TYPES reserves 'permission-decision' + 'set-permission-mode' (additive, k2)", () => {
  assert.ok(WEBVIEW_TO_HOST_TYPES.includes('permission-decision'), "'permission-decision' is reserved");
  assert.ok(WEBVIEW_TO_HOST_TYPES.includes('set-permission-mode'), "'set-permission-mode' is reserved");
  // Every prior kind (incl. S002's cancel-turn) is still present.
  for (const k of ['submit-turn', 'new-chat', 'open-chat', 'set-edit-mode', 'edit-decision', 'docs-decision', 'open-doc', 'cancel-turn']) {
    assert.ok(WEBVIEW_TO_HOST_TYPES.includes(k as WebviewToHostType), `existing kind ${k} still present`);
  }
});

test("S004 (ux polish): WEBVIEW_TO_HOST_TYPES reserves 'selection-decision' (additive, exhaustiveness passes, k2)", () => {
  assert.ok(WEBVIEW_TO_HOST_TYPES.includes('selection-decision'), "'selection-decision' is reserved");
  // Every prior kind is still present, unchanged.
  for (const k of ['submit-turn', 'new-chat', 'open-chat', 'set-edit-mode', 'edit-decision', 'docs-decision', 'open-doc', 'cancel-turn', 'permission-decision', 'set-permission-mode', 'ready']) {
    assert.ok(WEBVIEW_TO_HOST_TYPES.includes(k as WebviewToHostType), `existing kind ${k} still present`);
  }
});

test('S004 (ux polish): a selection-decision message typechecks with requestId + selected ids', () => {
  const msg: WebviewToHost = { type: 'selection-decision', requestId: 'sel-1', selected: ['a', 'b'] };
  assert.equal(msg.type, 'selection-decision');
  assert.deepEqual(msg.type === 'selection-decision' ? msg.selected : undefined, ['a', 'b']);
  // A single-select confirm carries exactly one id.
  const single: WebviewToHost = { type: 'selection-decision', requestId: 'sel-2', selected: ['only'] };
  assert.deepEqual(single.type === 'selection-decision' ? single.selected : undefined, ['only']);
});

test('S004: permission-decision typechecks with optional accepted-but-inert scope; set-permission-mode carries a PermissionMode', () => {
  // Without scope (the required-fields form).
  const once: WebviewToHost = { type: 'permission-decision', requestId: 'r1', decision: 'approve' };
  assert.equal(once.type === 'permission-decision' ? once.scope : 'x', undefined);
  // With scope (parsed but inert this Story — 'once' behaviour).
  const sess: WebviewToHost = { type: 'permission-decision', requestId: 'r2', decision: 'deny', scope: 'session' };
  assert.equal(sess.type === 'permission-decision' ? sess.scope : undefined, 'session');
  // set-permission-mode carries the canonical PermissionMode.
  const review: PermissionMode = 'review';
  const setMode: WebviewToHost = { type: 'set-permission-mode', mode: review };
  assert.equal(setMode.type === 'set-permission-mode' ? setMode.mode : undefined, 'review');
  const auto: WebviewToHost = { type: 'set-permission-mode', mode: 'auto' };
  assert.equal(auto.type === 'set-permission-mode' ? auto.mode : undefined, 'auto');
});
