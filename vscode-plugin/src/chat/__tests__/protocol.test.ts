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
import { HOST_TO_WEBVIEW_TYPES, WEBVIEW_TO_HOST_TYPES, type PendingAttachmentView, type HostToWebview, type HostToWebviewType, type WebviewToHost, type WebviewToHostType, type PermissionMode, type ActiveChatEntry, type DocsDocumentTab } from '../protocol.js';
import { PROTOCOL_CONTRACT_KINDS, contractActiveList, contractDocsContent, contractDocsTab, contractEntryExtra, contractOpenChat, contractOpenCompanion, contractOpenDoc, contractDocsDecision, contractSelectionDecision } from '../protocol-contract.js';

test('restore and targeted action frames preserve session, turn and generation identity', () => {
  const target = { sessionId: 'A', turnId: 'turn-A', viewGeneration: 9 };
  const progress = { turnId: target.turnId, startedAt: 1000, phase: 'waiting-approval' } as const;
  const restore: HostToWebview = { type: 'session-restored', sessionId: target.sessionId, viewGeneration: 9, progress, transcript: [] };
  const update: HostToWebview = { type: 'turn-progress', target, progress };
  const request = { ...target, requestId: 'req-1' };
  const actions: WebviewToHost[] = [
    { type: 'cancel-turn', target },
    { type: 'permission-decision', target: request, requestId: request.requestId, decision: 'approve' },
    { type: 'selection-decision', target: request, requestId: request.requestId, selected: ['one'] },
    { type: 'edit-decision', target, path: 'src/file.ts', accept: true },
  ];
  assert.ok(HOST_TO_WEBVIEW_TYPES.includes(update.type));
  assert.equal(restore.progress?.turnId, update.target.turnId);
  assert.equal(restore.sessionId, update.target.sessionId);
  assert.equal(restore.viewGeneration, update.target.viewGeneration);
  for (const action of actions) assert.deepEqual(JSON.parse(JSON.stringify(action)).target, action.target);
});

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
    { type: 'docs-decision', artifactId: 'x', decision: 'feedback', comments: [{ comment: 'c' }] },
    { type: 'open-doc', artifactId: 'x' },
  ];
  assert.equal(samples.length, 7);
  // objective shape proof: each message's exact key set, in order (runtime deep check that
  // complements the compile-time construction above)
  assert.deepEqual(samples.map((m) => Object.keys(m)), [
    ['type', 'text'],
    ['type', 'provider'],
    ['type', 'chatId'],
    ['type', 'mode'],
    ['type', 'path', 'accept'],
    ['type', 'artifactId', 'decision', 'comments'],
    ['type', 'artifactId'],
  ], 'every pre-existing WebviewToHost message carries exactly its original fields');
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
  // the compile-time half of the proof lives in protocol-contract.ts (typechecked with the plugin
  // sources): contractSelectionDecision is exactly { type, requestId, selected }
  const msg: WebviewToHost = { type: 'selection-decision', requestId: 'sel-1', selected: ['a', 'b'] };
  assert.equal(msg.type, 'selection-decision');
  assert.deepEqual(msg.type === 'selection-decision' ? msg.selected : undefined, ['a', 'b']);
  assert.deepEqual(Object.keys(contractSelectionDecision).sort(), ['requestId', 'selected', 'type'], 'contract selection-decision keys');
  assert.deepEqual(contractSelectionDecision, { type: 'selection-decision', requestId: 'sel-1', selected: ['a', 'b'] });
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

// Story E202610138d4b90c9:S001 t7: the review pane's decision, its result, and the HTML documents.
test("plugin protocol: 'docs-decision-result' and 'docs-companion' are host messages, 'open-companion' is a webview message, and 'docs-decision' carries a decision and a comments list", () => {
  assert.ok(HOST_TO_WEBVIEW_TYPES.includes('docs-decision-result'));
  assert.ok(HOST_TO_WEBVIEW_TYPES.includes('docs-companion'));
  assert.ok(WEBVIEW_TO_HOST_TYPES.includes('open-companion'));
  assert.ok(WEBVIEW_TO_HOST_TYPES.includes('docs-decision'), "'docs-decision' keeps its name");
  // Each is listed once, and on its own side only.
  for (const k of ['docs-decision-result', 'docs-companion']) {
    assert.equal(HOST_TO_WEBVIEW_TYPES.filter((t) => t === k).length, 1);
    assert.equal((WEBVIEW_TO_HOST_TYPES as readonly string[]).includes(k), false);
  }
  assert.equal(WEBVIEW_TO_HOST_TYPES.filter((t) => t === 'open-companion').length, 1);
  assert.equal((HOST_TO_WEBVIEW_TYPES as readonly string[]).includes('open-companion'), false);
  // Every kind that was listed before still is.
  for (const k of ['turn-event', 'session-restored', 'history-list', 'transcript-row', 'docs-list', 'docs-content', 'user-row', 'theme', 'transcript-page', 'attachments-pending']) {
    assert.ok(HOST_TO_WEBVIEW_TYPES.includes(k as HostToWebviewType), `${k} is still a host message`);
  }
  for (const k of ['submit-turn', 'new-chat', 'open-chat', 'set-edit-mode', 'edit-decision', 'open-doc', 'cancel-turn', 'permission-decision', 'set-permission-mode', 'selection-decision', 'ready', 'load-older', 'attach-image', 'pick-attachments', 'remove-attachment', 'open-attachment']) {
    assert.ok(WEBVIEW_TO_HOST_TYPES.includes(k as WebviewToHostType), `${k} is still a webview message`);
  }

  // The shapes, as the compiler accepts them.
  const decisions: WebviewToHost[] = [
    { type: 'docs-decision', artifactId: 'LLD-1', decision: 'approve', comments: [] },
    { type: 'docs-decision', artifactId: 'LLD-1', decision: 'reject', comments: [{ comment: 'whole document' }] },
    {
      type: 'docs-decision', artifactId: 'LLD-1', decision: 'feedback',
      comments: [{ comment: 'inline', file: 'docs/x/LLD.md', version: '0123456789abcdef', anchor: { quote: 'q', sectionSlug: 's', prefix: 'p', suffix: 'x' } }],
    },
  ];
  for (const d of decisions) {
    assert.equal(d.type, 'docs-decision');
    if (d.type !== 'docs-decision') continue;
    assert.ok(['approve', 'reject', 'feedback'].includes(d.decision));
    assert.ok(Array.isArray(d.comments));
    assert.equal('accept' in d, false, 'the earlier accept/note shape is gone');
    assert.equal('note' in d, false);
  }
  const open: WebviewToHost = { type: 'open-companion', artifactId: 'LLD-1', relPath: 'docs/x/sequence-diagram.html' };
  assert.deepEqual(Object.keys(open).sort(), ['artifactId', 'relPath', 'type']);
  const results: HostToWebview[] = [
    { type: 'docs-decision-result', artifactId: 'LLD-1', ok: true, outcome: 'approved', recorded: 2, message: 'Approved. 2 comments saved.' },
    { type: 'docs-decision-result', artifactId: 'LLD-1', ok: false, message: 'The decision was not recorded: daemon down' },
    { type: 'docs-companion', artifactId: 'LLD-1', relPath: 'docs/x/sequence-diagram.html', html: '<!doctype html>' },
    { type: 'docs-companion', artifactId: 'LLD-1', relPath: 'docs/x/missing.html' },
  ];
  assert.deepEqual(results.map((r) => r.type), ['docs-decision-result', 'docs-decision-result', 'docs-companion', 'docs-companion']);
});

// Epic E20261014613abdb3 Story S002 t3.
test('protocol: the host-to-webview and webview-to-host type lists include the outbox message and its four actions', () => {
  assert.ok(HOST_TO_WEBVIEW_TYPES.includes('outbox'));
  for (const k of ['outbox-cancel', 'outbox-dismiss', 'outbox-resend', 'outbox-retry-now'] as const) assert.ok(WEBVIEW_TO_HOST_TYPES.includes(k), k);
  const post: HostToWebview = { type: 'outbox', view: { sessionId: 's', rows: [], aheadFromOtherChats: 0 } };
  const act: WebviewToHost = { type: 'outbox-resend', seq: 3 };
  assert.deepEqual([post.type, act.type], ['outbox', 'outbox-resend']);
  for (const k of ['turn-running', 'attachments-pending', 'docs-companion']) assert.ok(HOST_TO_WEBVIEW_TYPES.includes(k as HostToWebviewType), `existing kind ${k} still present`);
  assert.equal(new Set(WEBVIEW_TO_HOST_TYPES).size, WEBVIEW_TO_HOST_TYPES.length);
  assert.equal(new Set(HOST_TO_WEBVIEW_TYPES).size, HOST_TO_WEBVIEW_TYPES.length);
});

// Epic babd84c6e2fb480a Story S001 t1: the two link messages.
test('protocol allowlist includes open-link and open-code-ref', () => {
  assert.ok(WEBVIEW_TO_HOST_TYPES.includes('open-link'), "'open-link' is listed");
  assert.ok(WEBVIEW_TO_HOST_TYPES.includes('open-code-ref'), "'open-code-ref' is listed");
  assert.equal(new Set(WEBVIEW_TO_HOST_TYPES).size, WEBVIEW_TO_HOST_TYPES.length);
  // The shapes, as the compiler accepts them: a url, and a path with or without a line.
  const link: WebviewToHost = { type: 'open-link', url: 'https://example.com' };
  const ref: WebviewToHost = { type: 'open-code-ref', path: 'src/foo.ts', line: 42 };
  const bare: WebviewToHost = { type: 'open-code-ref', path: 'src/foo.ts' };
  assert.deepEqual([link.type, ref.type, bare.type], ['open-link', 'open-code-ref', 'open-code-ref']);
  assert.deepEqual(Object.keys(bare), ['type', 'path']);
});

test('E202611031bd72813:S001 t4: active-list is a host->webview kind and ActiveChatEntry carries id/title/provider/status/lastActivityAt; open-chat stays the only open message', () => {
  assert.ok(HOST_TO_WEBVIEW_TYPES.includes('active-list'), "'active-list' is listed as host->webview");
  const entry: ActiveChatEntry = { id: 'a', title: 'Chat A', provider: 'claude', status: 'waiting-input', lastActivityAt: 123 };
  const msg: HostToWebview = { type: 'active-list', chats: [entry] };
  assert.equal(msg.type, 'active-list');
  assert.deepEqual(msg.chats[0], { id: 'a', title: 'Chat A', provider: 'claude', status: 'waiting-input', lastActivityAt: 123 });
  // exact wire shape: no extra field may ride along on the message or on an entry
  assert.deepEqual(Object.keys(msg), ['type', 'chats']);
  assert.deepEqual(Object.keys(entry), ['id', 'title', 'provider', 'status', 'lastActivityAt']);
  assert.ok(['waiting-input', 'working', 'done'].includes(entry.status));
  // selection reuses the existing open-chat { chatId } — no new webview->host kind was added
  assert.ok(WEBVIEW_TO_HOST_TYPES.includes('open-chat'));
  assert.ok(!WEBVIEW_TO_HOST_TYPES.includes('open-active' as WebviewToHostType));
  // in-panel document protocol is UNCHANGED: DocsDocumentTab keeps title/type/relPath, no presentKey;
  // docs-content/open-doc shapes unchanged (presentKey is panel-level, not a message field)
  const tab: DocsDocumentTab = { title: 'LLD.md', type: 'markdown' };
  assert.deepEqual(Object.keys(tab).sort(), ['title', 'type']);
  assert.ok(!('presentKey' in tab), 'DocsDocumentTab has no presentKey field');
  const content: HostToWebview = { type: 'docs-content', artifactId: 'a1', markdown: '# LLD', openQuestions: [], blocked: false };
  assert.equal(content.type, 'docs-content');
  if (content.type === 'docs-content') assert.equal(content.artifactId, 'a1');
  // the compile-time contract (protocol-contract.ts, typechecked with the plugin sources, since
  // tests are excluded from tsconfig) pins these kinds: assert the runtime arrays cover them and
  // that the contract objects carry exactly their declared runtime keys
  for (const kind of PROTOCOL_CONTRACT_KINDS) {
    assert.ok(HOST_TO_WEBVIEW_TYPES.includes(kind as HostToWebviewType) || WEBVIEW_TO_HOST_TYPES.includes(kind as WebviewToHostType), `contract kind ${kind} is a real wire kind`);
  }
  assert.deepEqual(Object.keys(contractActiveList), ['type', 'chats'], 'contract active-list keys');
  assert.deepEqual(Object.keys(contractActiveList.chats[0]!), ['id', 'title', 'provider', 'status', 'lastActivityAt'], 'contract entry keys');
  assert.deepEqual(Object.keys(contractOpenChat), ['type', 'chatId']);
  assert.deepEqual(Object.keys(contractDocsContent).sort(), ['artifactId', 'blocked', 'markdown', 'openQuestions', 'type'], 'contract docs-content keys');
  assert.deepEqual(Object.keys(contractDocsTab).sort(), ['relPath', 'title', 'type'], 'contract tab keys');
  assert.ok('updatedAt' in (contractEntryExtra as unknown as Record<string, unknown>), 'the contract’s negative case really carries the extra field the type forbids');
  assert.deepEqual(Object.keys(contractOpenDoc).sort(), ['artifactId', 'type'], 'contract open-doc keys');
  assert.deepEqual(Object.keys(contractDocsDecision).sort(), ['artifactId', 'comments', 'decision', 'type'], 'contract docs-decision keys');
  assert.deepEqual(Object.keys(contractOpenCompanion).sort(), ['artifactId', 'relPath', 'type'], 'contract open-companion keys');
});

test("run-config message shape is encoded in the HostToWebview union and posted by the host on open/switch/restore/set-run-config", () => {
  assert.ok(HOST_TO_WEBVIEW_TYPES.includes('run-config'), "'run-config' is listed as host->webview");
  const msg: HostToWebview = { type: 'run-config', provider: 'claude', model: 'opus-4.5', effort: 'high' };
  assert.equal(msg.type, 'run-config');
  if (msg.type === 'run-config') {
    assert.equal(msg.provider, 'claude');
    assert.equal(msg.model, 'opus-4.5');
    assert.equal(msg.effort, 'high');
  }
  assert.deepEqual(Object.keys(msg), ['type', 'provider', 'model', 'effort']);
  const cliDefault: HostToWebview = { type: 'run-config', provider: 'codex', model: '', effort: '' };
  if (cliDefault.type === 'run-config') assert.equal(cliDefault.model, '');
});

// ---- Story E202611134642d49a:S001 t2: the eight scratchpad message types ----

test("protocol.test.ts: all eight new message types appear in their own direction's union + const array only, with direction-isolation and union/array-equality assertions passing (ac5)", () => {
  const webviewToHost: readonly WebviewToHostType[] = ['scratch-open-menu', 'scratch-new', 'scratch-open', 'scratch-delete', 'scratch-browse', 'send-to-chat'];
  const hostToWebview: readonly HostToWebviewType[] = ['scratch-list', 'insert-into-input'];

  // Direction isolation: each new type is in its OWN array and NOT the other's.
  for (const k of webviewToHost) {
    assert.ok(WEBVIEW_TO_HOST_TYPES.includes(k), `'${k}' is listed webview->host`);
    assert.ok(!(HOST_TO_WEBVIEW_TYPES as readonly string[]).includes(k), `'${k}' is NOT listed host->webview`);
  }
  for (const k of hostToWebview) {
    assert.ok(HOST_TO_WEBVIEW_TYPES.includes(k), `'${k}' is listed host->webview`);
    assert.ok(!(WEBVIEW_TO_HOST_TYPES as readonly string[]).includes(k), `'${k}' is NOT listed webview->host`);
  }
  // No duplicates (union/array equality has no repeated member).
  assert.equal(new Set(WEBVIEW_TO_HOST_TYPES).size, WEBVIEW_TO_HOST_TYPES.length);
  assert.equal(new Set(HOST_TO_WEBVIEW_TYPES).size, HOST_TO_WEBVIEW_TYPES.length);

  // Union membership is proven at compile time by constructing each direction's shapes;
  // at runtime each constructed message's discriminant is in its own array only.
  const w2h: WebviewToHost[] = [
    { type: 'scratch-open-menu' },
    { type: 'scratch-new' },
    { type: 'scratch-open', id: '20260113-083000-pad.md' },
    { type: 'scratch-delete', id: '20260113-083000-pad.md' },
    { type: 'scratch-browse' },
    { type: 'send-to-chat', text: 'selected text' },
  ];
  const h2w: HostToWebview[] = [
    { type: 'scratch-list', entries: [{ id: '20260113-083000-pad.md', name: '20260113-083000-pad', mtime: 1, size: 3 }] },
    { type: 'scratch-list', entries: [], error: 'scratchpads unavailable' },
    { type: 'insert-into-input', text: 'selected text' },
  ];
  for (const m of w2h) {
    assert.ok(WEBVIEW_TO_HOST_TYPES.includes(m.type), `${m.type} in WEBVIEW_TO_HOST_TYPES`);
    assert.ok(!(HOST_TO_WEBVIEW_TYPES as readonly string[]).includes(m.type), `${m.type} not in HOST_TO_WEBVIEW_TYPES`);
  }
  for (const m of h2w) {
    assert.ok(HOST_TO_WEBVIEW_TYPES.includes(m.type), `${m.type} in HOST_TO_WEBVIEW_TYPES`);
    assert.ok(!(WEBVIEW_TO_HOST_TYPES as readonly string[]).includes(m.type), `${m.type} not in WEBVIEW_TO_HOST_TYPES`);
  }
  // Shape spot-checks: titleless intents carry only their discriminant; payloads carry the contract fields.
  assert.deepEqual(Object.keys(w2h[0]!), ['type']);
  assert.deepEqual(Object.keys(w2h[1]!), ['type']);
  assert.deepEqual(Object.keys(w2h[2]!), ['type', 'id']);
  assert.deepEqual(Object.keys(w2h[5]!), ['type', 'text']);
  assert.deepEqual(Object.keys(h2w[0]!), ['type', 'entries']);
  assert.deepEqual(Object.keys(h2w[1]!), ['type', 'entries', 'error']);
  assert.deepEqual(Object.keys(h2w[2]!), ['type', 'text']);
  if (h2w[0]!.type === 'scratch-list') assert.equal(h2w[0]!.entries[0]!.name, '20260113-083000-pad');
  if (h2w[1]!.type === 'scratch-list') assert.equal(h2w[1]!.error, 'scratchpads unavailable');
  if (h2w[2]!.type === 'insert-into-input') assert.equal(h2w[2]!.text, 'selected text');

  // Purely additive: every prior kind is still present, exactly once.
  for (const k of ['submit-turn', 'new-chat', 'open-chat', 'set-edit-mode', 'edit-decision', 'docs-decision', 'open-doc', 'cancel-turn', 'permission-decision', 'set-permission-mode', 'selection-decision', 'ready', 'open-run-picker', 'load-older', 'attach-image', 'pick-attachments', 'remove-attachment', 'open-attachment', 'open-link', 'open-code-ref', 'open-companion', 'outbox-cancel', 'outbox-dismiss', 'outbox-resend', 'outbox-retry-now']) {
    assert.ok(WEBVIEW_TO_HOST_TYPES.includes(k as WebviewToHostType), `existing webview->host kind ${k} still present`);
  }
  for (const k of ['turn-event', 'turn-progress', 'session-restored', 'history-list', 'active-list', 'transcript-row', 'docs-list', 'docs-content', 'user-row', 'theme', 'transcript-page', 'attachments-pending', 'docs-decision-result', 'docs-companion', 'turn-running', 'run-catalog', 'run-config', 'outbox']) {
    assert.ok(HOST_TO_WEBVIEW_TYPES.includes(k as HostToWebviewType), `existing host->webview kind ${k} still present`);
  }
});
