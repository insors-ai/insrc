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
import type { TranscriptEntry } from '../session-store.js';
import { HOST_TO_WEBVIEW_TYPES, WEBVIEW_TO_HOST_TYPES, type PendingAttachmentView, type HostToWebview, type HostToWebviewType, type WebviewToHost, type WebviewToHostType, type PermissionMode } from '../protocol.js';

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

// ---- Story E20261012ddc4ede1:S001 t2: the paging messages ----

test("WEBVIEW_TO_HOST_TYPES includes 'load-older' and HOST_TO_WEBVIEW_TYPES includes 'transcript-page', alongside every prior kind", () => {
  assert.ok(WEBVIEW_TO_HOST_TYPES.includes('load-older'));
  assert.ok(HOST_TO_WEBVIEW_TYPES.includes('transcript-page'));
  for (const k of ['submit-turn', 'new-chat', 'open-chat', 'set-edit-mode', 'edit-decision', 'docs-decision', 'open-doc', 'cancel-turn', 'permission-decision', 'set-permission-mode', 'selection-decision', 'ready']) {
    assert.ok(WEBVIEW_TO_HOST_TYPES.includes(k as WebviewToHostType), `existing kind ${k} still present`);
  }
  for (const k of ['turn-event', 'session-restored', 'history-list', 'docs-list', 'docs-content', 'user-row', 'theme']) {
    assert.ok(HOST_TO_WEBVIEW_TYPES.includes(k as HostToWebviewType), `existing kind ${k} still present`);
  }
  // The new shapes typecheck; the added fields are optional, so the old shapes still do too.
  const ask: WebviewToHost = { type: 'load-older', sessionId: 's1', before: 100 };
  const page: HostToWebview = { type: 'transcript-page', sessionId: 's1', before: 100, firstIndex: 0, rows: [], total: 250 };
  const restoredOld: HostToWebview = { type: 'session-restored', sessionId: 's1', transcript: [] };
  const restoredNew: HostToWebview = { type: 'session-restored', sessionId: 's1', transcript: [], firstIndex: 150, total: 250 };
  const live: HostToWebview = { type: 'turn-event', event: { kind: 'done', turnId: 't1', ok: true }, rowIndex: 7 };
  const echo: HostToWebview = { type: 'user-row', text: 'hi', key: 'r3', rowIndex: 3 };
  assert.deepEqual([ask.type, page.type, restoredOld.type, restoredNew.type, live.type, echo.type], ['load-older', 'transcript-page', 'session-restored', 'session-restored', 'turn-event', 'user-row']);
});

// ---- Story E2026101259da3204:S001 t3: the attachment messages ----

test('protocol: the four new webview messages and attachments-pending are in the type lists, and user-row carries attachments', () => {
  // The lists are not checked for exhaustiveness anywhere, so each new kind is asserted by name.
  assert.ok(WEBVIEW_TO_HOST_TYPES.includes('attach-image'), "'attach-image' is listed");
  assert.ok(WEBVIEW_TO_HOST_TYPES.includes('pick-attachments'), "'pick-attachments' is listed");
  assert.ok(WEBVIEW_TO_HOST_TYPES.includes('remove-attachment'), "'remove-attachment' is listed");
  assert.ok(WEBVIEW_TO_HOST_TYPES.includes('open-attachment'), "'open-attachment' is listed");
  assert.ok(HOST_TO_WEBVIEW_TYPES.includes('attachments-pending'), "'attachments-pending' is listed");
  // Every prior kind is still there, once, and nothing is listed twice.
  for (const k of ['submit-turn', 'new-chat', 'open-chat', 'set-edit-mode', 'edit-decision', 'docs-decision', 'open-doc', 'cancel-turn', 'permission-decision', 'set-permission-mode', 'selection-decision', 'ready', 'load-older']) {
    assert.ok(WEBVIEW_TO_HOST_TYPES.includes(k as WebviewToHostType), `existing kind ${k} still present`);
  }
  for (const k of ['turn-event', 'session-restored', 'history-list', 'docs-list', 'docs-content', 'user-row', 'theme', 'transcript-page']) {
    assert.ok(HOST_TO_WEBVIEW_TYPES.includes(k as HostToWebviewType), `existing kind ${k} still present`);
  }
  assert.equal(new Set(WEBVIEW_TO_HOST_TYPES).size, WEBVIEW_TO_HOST_TYPES.length);
  assert.equal(new Set(HOST_TO_WEBVIEW_TYPES).size, HOST_TO_WEBVIEW_TYPES.length);

  // The new shapes construct; submit-turn is unchanged and carries no attachment.
  const paste: WebviewToHost = { type: 'attach-image', mime: 'image/png', dataBase64: 'AAAA', name: 'shot.png', clientId: 'c1' };
  const pasteBare: WebviewToHost = { type: 'attach-image', mime: 'image/png', dataBase64: 'AAAA' };
  const pick: WebviewToHost = { type: 'pick-attachments' };
  const remove: WebviewToHost = { type: 'remove-attachment', attachmentId: '1-shot.png' };
  const open: WebviewToHost = { type: 'open-attachment', attachmentId: '1-shot.png' };
  const submit: WebviewToHost = { type: 'submit-turn', text: 'hi' };
  assert.deepEqual(Object.keys(pick), ['type']);
  assert.deepEqual(Object.keys(submit), ['type', 'text']);
  assert.deepEqual([paste.type, pasteBare.type, remove.type, open.type], ['attach-image', 'attach-image', 'remove-attachment', 'open-attachment']);

  // A pending attachment is shown without its path.
  const view: PendingAttachmentView = { id: '1-shot.png', name: 'shot.png', kind: 'image', size: 4, clientId: 'c1' };
  assert.ok(!('path' in view));
  const pending: HostToWebview = { type: 'attachments-pending', sessionId: 's1', items: [view] };
  const refused: HostToWebview = { type: 'attachments-pending', sessionId: 's1', items: [], error: 'big.png is larger than the 20 MB limit.' };
  assert.equal(pending.type === 'attachments-pending' ? pending.items.length : -1, 1);
  assert.equal(refused.type === 'attachments-pending' ? refused.error : undefined, 'big.png is larger than the 20 MB limit.');

  // user-row and the stored user row carry attachments; without them each has today's shape.
  const ref = { id: '1-shot.png', name: 'shot.png', kind: 'image' as const, size: 4, path: '/a/1-shot.png' };
  const echo: HostToWebview = { type: 'user-row', text: 'look', key: 'r3', rowIndex: 3, attachments: [ref] };
  const echoPlain: HostToWebview = { type: 'user-row', text: 'look', key: 'r3' };
  assert.deepEqual(echo.type === 'user-row' ? echo.attachments : undefined, [ref]);
  assert.deepEqual(Object.keys(echoPlain), ['type', 'text', 'key']);
  const stored: TranscriptEntry = { role: 'user', text: 'look', at: '2026-10-12T00:00:00.000Z', attachments: [ref] };
  const storedPlain: TranscriptEntry = { role: 'user', text: 'look', at: '2026-10-12T00:00:00.000Z' };
  assert.deepEqual(stored.role === 'user' ? stored.attachments : undefined, [ref]);
  assert.deepEqual(Object.keys(storedPlain), ['role', 'text', 'at']);
});

// ---- Story E20261013b2e8109f:S001 t6: rows the host pushes outside the event path ----

test('protocol: transcript-row is a host message and edit-prompt is not', () => {
  assert.ok(HOST_TO_WEBVIEW_TYPES.includes('transcript-row'), "'transcript-row' is listed");
  assert.ok(!(HOST_TO_WEBVIEW_TYPES as readonly string[]).includes('edit-prompt'), "'edit-prompt' is gone");
  assert.equal(new Set(HOST_TO_WEBVIEW_TYPES).size, HOST_TO_WEBVIEW_TYPES.length);
  // The shape typechecks for a diff row and for a marker row.
  const diff: HostToWebview = {
    type: 'transcript-row',
    rowIndex: 4,
    row: { role: 'diff', sid: 'd1-0', path: 'src/a.ts', oldStart: 1, oldLines: 2, newStart: 1, newLines: 3, added: 1, removed: 0, lines: [' a', '+b', ' c'], at: 1 },
  };
  const marker: HostToWebview = { type: 'transcript-row', rowIndex: 5, row: { role: 'marker', text: 'src/a.ts', at: 1 } };
  assert.deepEqual([diff.type, marker.type], ['transcript-row', 'transcript-row']);
  // The webview still sends its (inert) edit-decision.
  assert.ok(WEBVIEW_TO_HOST_TYPES.includes('edit-decision'));
});
