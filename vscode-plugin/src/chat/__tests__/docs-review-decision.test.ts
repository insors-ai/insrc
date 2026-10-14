/**
 * Story E202610138d4b90c9:S001 t8 — the review pane's host: the open document, the one
 * decision call, the result line, the chat message, the HTML companions and the re-post on
 * a rebuilt shell.
 *
 * Over a fake channel and a fake client (no vscode, no daemon). Each case drives the host
 * through the messages the shell sends and reads what it posts and calls.
 *
 * Run: npx tsx --test vscode-plugin/src/chat/__tests__/docs-review-decision.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDocsReviewHost, stampScriptNonce, type DocsReviewHostDeps } from '../docs-review-panel.js';
import type { ChatPanelChannel } from '../chat-panel.js';
import type { DocsReviewClient, DocsContent, ReviewDecisionComment, ReviewDecisionResult } from '../docs-review-client.js';
import type { DocsArtifactSummary } from '../protocol.js';

type Payload = { type: string; [k: string]: unknown };
interface FakeChannel {
  channel: ChatPanelChannel;
  posted: Payload[];
  send(type: string, extra?: Record<string, unknown>): void;
  html(): string;
  /** The user closes the panel. */
  close(): void;
}
function fakeChannel(): FakeChannel {
  const posted: Payload[] = [];
  let onMsg: ((m: unknown) => void) | undefined;
  let onClose: (() => void) | undefined;
  let html = '';
  return {
    posted,
    html: () => html,
    close: () => onClose?.(),
    send: (type, extra = {}) => onMsg?.({ v: 1, payload: { type, ...extra } }),
    channel: {
      setHtml: (h) => { html = h; },
      postMessage: (m) => { posted.push((m as { payload: Payload }).payload); },
      onMessage: (l) => { onMsg = l; },
      onDidDispose: (l) => { onClose = l; },
      reveal: () => {},
      dispose: () => {},
    },
  };
}
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
const settle = async (): Promise<void> => { await tick(); await tick(); await tick(); };

const DIR = 'docs/epics/x/S007';
const LLD_PATH = `${DIR}/LLD.md`;
const SEQ_PATH = `${DIR}/sequence-diagram.html`;
const UX_PATH = `${DIR}/ux-mock.html`;
const LLD: DocsArtifactSummary = { id: 'LLD-abc-s7', kind: 'LLD', title: 'Docs review pane', status: 'pending' };
const PLAN: DocsArtifactSummary = { id: 'PLAN-abc-s7', kind: 'PLAN', title: 'Docs review plan', status: 'pending' };
const BUILD_PATH = 'docs/e/S007/BUILD.md';

const COMPANIONS = [
  { kind: 'diagram-mermaid', relPath: SEQ_PATH, title: 'Sequence diagram' },
  { kind: 'ux-mock', relPath: UX_PATH, title: 'UX mock' },
] as unknown as NonNullable<DocsContent['companions']>;

/** The path a document is read by: an id from the pending list, or a docs/ path. */
const pathOf = (idOrPath: string): string => (idOrPath === LLD.id ? LLD_PATH : idOrPath === PLAN.id ? `${DIR}/PLAN.md` : idOrPath);

interface DecideCall { path: string; decision: string; comments: readonly ReviewDecisionComment[] }
interface Harness {
  readonly fc: FakeChannel;
  readonly host: ReturnType<typeof createDocsReviewHost>;
  readonly content: string[];
  readonly decide: DecideCall[];
  readonly chat: string[];
  readonly companionReads: string[];
  readonly warnings: string[];
  /** The pending list the daemon answers with from now on. */
  setPending(list: DocsArtifactSummary[]): void;
  pendingReads(): number;
  results(): Payload[];
  contents(): Payload[];
  companions(): Payload[];
}
function harness(o: {
  pending?: DocsArtifactSummary[];
  content?: (path: string) => Partial<DocsContent>;
  decide?: (call: DecideCall) => Partial<ReviewDecisionResult>;
  /** 'absent' leaves the dependency out. */
  notifyChat?: DocsReviewHostDeps['notifyChat'] | 'absent';
  readCompanion?: DocsReviewHostDeps['readCompanion'] | 'absent';
  nonce?: string;
  /** More deps for the host (the watcher and the timer). */
  deps?: Partial<DocsReviewHostDeps>;
  /** Called at the start of every pending read. */
  onPending?: () => void;
} = {}): Harness {
  const fc = fakeChannel();
  let pending = o.pending ?? [LLD];
  let pendingReads = 0;
  const content: string[] = [];
  const decide: DecideCall[] = [];
  const chat: string[] = [];
  const companionReads: string[] = [];
  const warnings: string[] = [];
  const client: DocsReviewClient = {
    async pending() { pendingReads += 1; o.onPending?.(); return pending; },
    async content(idOrPath) {
      content.push(idOrPath);
      const path = pathOf(idOrPath);
      return { markdown: `# body of ${path}`, openQuestions: [], blocked: false, docPath: path, companions: COMPANIONS, ...(o.content?.(path) ?? {}) };
    },
    async decide(path, decision, comments) {
      const call = { path, decision, comments };
      decide.push(call);
      const base: ReviewDecisionResult = {
        artifactId: path === LLD_PATH ? LLD.id : path === BUILD_PATH ? 'BUILD-abc-s7' : 'X',
        decision,
        outcome: decision === 'approve' ? 'approved' : decision === 'reject' ? 'rejected' : 'recorded',
        recorded: comments.length,
        entryIds: comments.map((_, i) => `e${i + 1}`),
        author: 'Rev Iewer',
      };
      return { ...base, ...(o.decide?.(call) ?? {}) };
    },
  };
  const notifyChat: DocsReviewHostDeps['notifyChat'] = o.notifyChat === 'absent'
    ? undefined
    : (o.notifyChat ?? ((text: string) => { chat.push(text); return 'queued' as const; }));
  const readCompanion: DocsReviewHostDeps['readCompanion'] = o.readCompanion === 'absent'
    ? undefined
    : (o.readCompanion ?? (async (relPath: string) => { companionReads.push(relPath); return `<html><script>draw('${relPath}')</script></html>`; }));
  const host = createDocsReviewHost({
    createPanel: () => fc.channel,
    client,
    genNonce: () => o.nonce ?? 'N0NCE',
    logger: { warn: (m) => void warnings.push(m), error: () => {} },
    ...(notifyChat !== undefined ? { notifyChat } : {}),
    ...(readCompanion !== undefined ? { readCompanion } : {}),
    ...(o.deps ?? {}),
  });
  const of = (type: string) => (): Payload[] => fc.posted.filter((p) => p.type === type);
  return {
    fc, host, content, decide, chat, companionReads, warnings,
    setPending: (list) => { pending = list; },
    pendingReads: () => pendingReads,
    results: of('docs-decision-result'),
    contents: of('docs-content'),
    companions: of('docs-companion'),
  };
}

/** The pane open on the pending LLD, as a click on its list row leaves it. */
async function openOnLld(o: Parameters<typeof harness>[0] = {}): Promise<Harness> {
  const h = harness(o);
  h.host.open();
  await settle();
  h.fc.send('open-doc', { artifactId: LLD.id });
  await settle();
  return h;
}

const INLINE: ReviewDecisionComment = { comment: 'Say what the header shows.', version: '0123456789abcdef', anchor: { quote: 'cut to 8 lines', sectionSlug: 'header', prefix: 'is ', suffix: '.' } };
const WHOLE: ReviewDecisionComment = { comment: 'The second phase needs an owner.' };
const ON_HTML: ReviewDecisionComment = { comment: 'The arrow to the daemon is missing.', file: SEQ_PATH };
const WHAT = `LLD-abc-s7 "Docs review pane" (${LLD_PATH})`;

test("docs review host: a docs-decision calls decide once with the open document's docPath and every comment, posts docs-decision-result, re-reads the list and the document by docPath, and hands the chat one message with the decision and the numbered comments", async () => {
  const h = await openOnLld();
  assert.deepEqual(h.content, [LLD.id], 'opened from its list row, by id');
  const pendingBefore = h.pendingReads();
  h.setPending([]); // once rejected it is no longer awaiting review

  const comments = [INLINE, WHOLE, ON_HTML];
  h.fc.send('docs-decision', { artifactId: LLD.id, decision: 'reject', comments });
  await settle();

  assert.deepEqual(h.decide, [{ path: LLD_PATH, decision: 'reject', comments }], 'one call: the path, the decision and every comment');
  assert.deepEqual(h.results(), [{
    type: 'docs-decision-result', artifactId: LLD.id, ok: true, outcome: 'rejected', recorded: 3,
    message: 'Rejected. 3 comments saved. Sent to the chat; it waits its turn in the outbox.',
  }]);
  assert.ok(h.pendingReads() > pendingBefore, 'the pending list is re-read');
  assert.deepEqual(h.content, [LLD.id, LLD_PATH], 'the document is re-read by its path, not by its id');
  const again = h.contents().at(-1)!;
  assert.equal(again['artifactId'], LLD.id);
  assert.equal(again['readOnly'], true, 'it is no longer awaiting review');
  // The result is posted before the document is re-posted.
  assert.ok(h.fc.posted.indexOf(h.results()[0]!) < h.fc.posted.indexOf(again));

  assert.deepEqual(h.chat, [[
    `Review decision: rejected ${WHAT}, by Rev Iewer.`,
    'Comments:',
    '1. On "cut to 8 lines" (section header): Say what the header shows.',
    '2. The second phase needs an owner.',
    `3. On ${SEQ_PATH}: The arrow to the daemon is missing.`,
  ].join('\n')], 'one message: the decision, the artifact, the reviewer and the numbered comments');
});

test('docs review host: a decision with no comments sends the chat the decision line alone', async () => {
  const h = await openOnLld();
  h.fc.send('docs-decision', { artifactId: LLD.id, decision: 'approve', comments: [] });
  await settle();
  assert.deepEqual(h.decide, [{ path: LLD_PATH, decision: 'approve', comments: [] }]);
  assert.deepEqual(h.chat, [`Review decision: approved ${WHAT}, by Rev Iewer.`]);
  assert.equal(h.results()[0]!['message'], 'Approved. Sent to the chat; it waits its turn in the outbox.');
  assert.equal(h.results()[0]!['recorded'], 0);

  const r = await openOnLld();
  r.fc.send('docs-decision', { artifactId: LLD.id, decision: 'reject', comments: [] });
  await settle();
  assert.deepEqual(r.chat, [`Review decision: rejected ${WHAT}, by Rev Iewer.`]);
  assert.equal(r.results()[0]!['message'], 'Rejected. Sent to the chat; it waits its turn in the outbox.');
});

test('docs review host: send feedback works on a read-only open and on a document just approved, while approve and reject are refused for a document that is not pending or not the open one', async () => {
  // A read-only open: an artifact that is not awaiting review, opened from the delivery board.
  {
    const h = harness();
    h.host.openArtifact({ artifactId: 'BUILD-abc-s7', mdPath: BUILD_PATH });
    await settle();
    assert.equal(h.contents().at(-1)!['readOnly'], true);
    h.fc.send('docs-decision', { artifactId: 'BUILD-abc-s7', decision: 'feedback', comments: [WHOLE] });
    await settle();
    assert.deepEqual(h.decide, [{ path: BUILD_PATH, decision: 'feedback', comments: [WHOLE] }], 'feedback is sent by the path it was read by');
    assert.equal(h.results().at(-1)!['ok'], true);
    assert.equal(h.results().at(-1)!['message'], 'Feedback sent. 1 comment saved. Sent to the chat; it waits its turn in the outbox.');
    assert.match(h.chat[0]!, /^Review feedback on BUILD-abc-s7 \(docs\/e\/S007\/BUILD\.md\), by Rev Iewer\.\nComments:\n1\. The second phase needs an owner\.$/);

    for (const decision of ['approve', 'reject'] as const) {
      h.fc.send('docs-decision', { artifactId: 'BUILD-abc-s7', decision, comments: [WHOLE] });
      await settle();
      const refused = h.results().at(-1)!;
      assert.equal(refused['ok'], false, `${decision} is refused`);
      assert.match(String(refused['message']), new RegExp(`not awaiting review, so it cannot be ${decision === 'approve' ? 'approved' : 'rejected'}`));
    }
    assert.equal(h.decide.length, 1, 'neither reached the daemon');
    assert.equal(h.chat.length, 1, 'and the chat is told of neither');
  }

  // A document just approved: feedback still works, a second approve does not.
  {
    const h = await openOnLld();
    h.setPending([]);
    h.fc.send('docs-decision', { artifactId: LLD.id, decision: 'approve', comments: [] });
    await settle();
    assert.equal(h.contents().at(-1)!['readOnly'], true, 'shown as not awaiting review');
    h.fc.send('docs-decision', { artifactId: LLD.id, decision: 'feedback', comments: [INLINE] });
    await settle();
    assert.deepEqual(h.decide.map((d) => [d.path, d.decision]), [[LLD_PATH, 'approve'], [LLD_PATH, 'feedback']]);
    assert.equal(h.results().at(-1)!['ok'], true);
    h.fc.send('docs-decision', { artifactId: LLD.id, decision: 'approve', comments: [] });
    await settle();
    assert.equal(h.results().at(-1)!['ok'], false);
    assert.equal(h.decide.length, 2);
  }

  // Not the open one: a pending document the pane does not show.
  {
    const h = await openOnLld({ pending: [LLD, PLAN] });
    for (const decision of ['approve', 'reject', 'feedback'] as const) {
      h.fc.send('docs-decision', { artifactId: PLAN.id, decision, comments: [WHOLE] });
      await settle();
      const refused = h.results().at(-1)!;
      assert.deepEqual([refused['artifactId'], refused['ok']], [PLAN.id, false]);
      assert.match(String(refused['message']), /open the document before deciding on it/);
    }
    assert.deepEqual(h.decide, [], 'a decision is acted on for the open document only');
    // Nothing open at all.
    const none = harness();
    none.host.open();
    await settle();
    none.fc.send('docs-decision', { artifactId: LLD.id, decision: 'approve', comments: [] });
    await settle();
    assert.equal(none.results().at(-1)!['ok'], false);
    assert.deepEqual(none.decide, []);
  }
});

test('docs review host: a failing decide posts a failed result, sends no chat message and keeps the open document', async () => {
  let fail = true;
  const h = await openOnLld({
    decide: () => {
      if (fail) throw new Error('daemon down');
      return {};
    },
  });
  const contentReads = h.content.length;
  const contentPosts = h.contents().length;
  h.fc.send('docs-decision', { artifactId: LLD.id, decision: 'reject', comments: [WHOLE] });
  await settle();
  assert.deepEqual(h.results(), [{ type: 'docs-decision-result', artifactId: LLD.id, ok: false, message: 'Nothing was recorded: daemon down' }]);
  assert.deepEqual(h.chat, [], 'no chat message');
  assert.equal(h.content.length, contentReads, 'the document is not re-read');
  assert.equal(h.contents().length, contentPosts, 'and what the pane shows is not replaced');
  assert.ok(h.warnings.some((w) => /decision LLD-abc-s7 failed/.test(w)));

  // The open document is kept: the same decision can be sent again and goes by its path.
  fail = false;
  h.fc.send('docs-decision', { artifactId: LLD.id, decision: 'reject', comments: [WHOLE] });
  await settle();
  assert.deepEqual(h.decide.map((d) => d.path), [LLD_PATH, LLD_PATH]);
  assert.equal(h.results().at(-1)!['ok'], true);
  assert.equal(h.chat.length, 1);

  // A refusal that shows the document has changed state re-reads it, read-only.
  fail = true;
  const stale = await openOnLld({ decide: () => { throw new Error("cannot approve 'LLD-abc-s7': it is already approved, not awaiting review"); } });
  // The list the pane holds still has it, so the host sends the decision; the daemon refuses.
  stale.fc.send('docs-decision', { artifactId: LLD.id, decision: 'approve', comments: [] });
  stale.setPending([]);
  await settle();
  assert.equal(stale.results().at(-1)!['ok'], false);
  assert.equal(stale.content.at(-1), LLD_PATH, 're-read by its path');
  assert.equal(stale.contents().at(-1)!['readOnly'], true, 'and shown as not awaiting review');
});

test('docs review host: a withheld approval and a commentsError are each reported in the result and in the chat message', async () => {
  const withheld = await openOnLld({ decide: () => ({ outcome: 'withheld', reason: 'Review blocks approval: 1 HIGH, 0 MED.' }) });
  withheld.fc.send('docs-decision', { artifactId: LLD.id, decision: 'approve', comments: [INLINE, WHOLE] });
  await settle();
  assert.deepEqual(withheld.results(), [{
    type: 'docs-decision-result', artifactId: LLD.id, ok: true, outcome: 'withheld', recorded: 2,
    message: 'Not approved: Review blocks approval: 1 HIGH, 0 MED. 2 comments saved as feedback. Sent to the chat; it waits its turn in the outbox.',
  }]);
  assert.deepEqual(withheld.chat, [[
    `Review decision: the approval of ${WHAT} by Rev Iewer was withheld: Review blocks approval: 1 HIGH, 0 MED.`,
    'The comments below were saved as feedback.',
    'Comments:',
    '1. On "cut to 8 lines" (section header): Say what the header shows.',
    '2. The second phase needs an owner.',
  ].join('\n')]);
  assert.equal('readOnly' in withheld.contents().at(-1)!, false, 'the document is still awaiting review');
  // Withheld with no comments: the decision line alone, with the reason.
  const bare = await openOnLld({ decide: () => ({ outcome: 'withheld', reason: 'no review has run' }) });
  bare.fc.send('docs-decision', { artifactId: LLD.id, decision: 'approve', comments: [] });
  await settle();
  assert.deepEqual(bare.chat, [`Review decision: the approval of ${WHAT} by Rev Iewer was withheld: no review has run.`]);
  assert.equal(bare.results()[0]!['message'], 'Not approved: no review has run. Sent to the chat; it waits its turn in the outbox.');

  const unsaved = await openOnLld({ decide: () => ({ recorded: 0, entryIds: [], commentsError: 'cannot write the artifact' }) });
  unsaved.fc.send('docs-decision', { artifactId: LLD.id, decision: 'approve', comments: [WHOLE] });
  await settle();
  assert.deepEqual(unsaved.results(), [{
    type: 'docs-decision-result', artifactId: LLD.id, ok: true, outcome: 'approved', recorded: 0,
    message: 'Approved. The comment was not saved: cannot write the artifact. Sent to the chat; it waits its turn in the outbox.',
  }], 'the decision stands; recorded 0 tells the pane to keep the drafts');
  assert.deepEqual(unsaved.chat, [[
    `Review decision: approved ${WHAT}, by Rev Iewer.`,
    'The comments below could not be saved: cannot write the artifact.',
    'Comments:',
    '1. The second phase needs an owner.',
  ].join('\n')]);
});

test('docs review host: docs-content carries the feedback list, the reviewer, the state and one document entry per HTML companion', async () => {
  const feedback = [
    { id: 'f1', author: 'Rev Iewer', timestamp: '2026-10-13T09:00:00.000Z', target: { file: LLD_PATH, version: 'aaaa' }, comment: 'First.', decision: 'feedback', batchId: 'b1', anchor: { quote: 'body' } },
    { id: 'f2', author: 'Rev Iewer', timestamp: '2026-10-13T09:00:00.000Z', target: { file: LLD_PATH }, comment: 'Second.', decision: 'feedback', batchId: 'b1' },
  ] as unknown as NonNullable<DocsContent['feedback']>;
  const reviewer = { name: 'Rev Iewer', source: 'git' } as const;
  const companions = [
    ...COMPANIONS,
    { kind: 'diagram-mermaid', relPath: SEQ_PATH, title: 'Sequence diagram again' }, // the same file twice
    { kind: 'diagram-html', relPath: `${DIR}/notes.md`, title: 'Not HTML' },
    { kind: 'diagram-html', relPath: `${DIR}/er-model.HTML`, title: '  ' },          // no title: its file name
    { kind: 'ux-mock' },                                                              // malformed
    null,
  ] as unknown as NonNullable<DocsContent['companions']>;
  const h = await openOnLld({ content: () => ({ feedback, reviewer, state: 'pending', contentVersion: '0123456789abcdef', companions }) });
  const c = h.contents().at(-1)!;
  assert.equal(c['feedback'], feedback, 'the list as the daemon sent it, in order');
  assert.equal(c['reviewer'], reviewer);
  assert.equal(c['state'], 'pending');
  assert.equal(c['docPath'], LLD_PATH);
  assert.equal(c['contentVersion'], '0123456789abcdef');
  assert.deepEqual(c['documents'], [
    { title: 'LLD.md', type: 'markdown', relPath: LLD_PATH },
    { title: 'Sequence diagram', type: 'html', relPath: SEQ_PATH },
    { title: 'UX mock', type: 'html', relPath: UX_PATH },
    { title: 'er-model.HTML', type: 'html', relPath: `${DIR}/er-model.HTML` },
  ], 'the markdown first, then each HTML companion once');
  assert.equal(c['companions'], companions, 'the refs themselves still travel unchanged');
  assert.equal(c['markdown'], `# body of ${LLD_PATH}`);

  // A document with no saved comments and no companions: absent keys, and the markdown alone.
  const bare = await openOnLld({ content: () => ({ companions: undefined as never }) });
  const b = bare.contents().at(-1)!;
  for (const key of ['feedback', 'reviewer', 'state', 'contentVersion']) assert.equal(key in b, false, `${key} is an absent key`);
  assert.deepEqual(b['documents'], [{ title: 'LLD.md', type: 'markdown', relPath: LLD_PATH }]);
  // A daemon that names no path: the document is still listed.
  const old = await openOnLld({ content: () => ({ docPath: undefined as never, companions: undefined as never }) });
  assert.deepEqual(old.contents().at(-1)!['documents'], [{ title: 'Document', type: 'markdown' }]);
  assert.equal('docPath' in old.contents().at(-1)!, false);
});

test("docs review host: open-companion for one of the document's companions posts docs-companion with the file's text and the shell's nonce on every script tag that had none; for any other path, or when the read fails, it posts docs-companion with no html", async () => {
  const PAGE = [
    '<!doctype html><html><head>',
    '<script>window.a = 1;</script>',
    '<script nonce="keep">window.b = 2;</script>',
    '<SCRIPT type="module" src="./x.js"></SCRIPT>',
    '<script\n  defer>window.c = 3;</script>',
    '</head><body><p>a &lt;script&gt; in text</p></body></html>',
  ].join('\n');
  const reads: string[] = [];
  const h = await openOnLld({ nonce: 'SHELL-N0NCE', readCompanion: async (relPath) => { reads.push(relPath); return PAGE; } });
  assert.match(h.fc.html(), /script-src 'nonce-SHELL-N0NCE'/, "the nonce is the shell's own");

  h.fc.send('open-companion', { artifactId: LLD.id, relPath: SEQ_PATH });
  await settle();
  assert.deepEqual(reads, [SEQ_PATH]);
  const shown = h.companions().at(-1)!;
  assert.deepEqual([shown['artifactId'], shown['relPath']], [LLD.id, SEQ_PATH]);
  assert.equal(shown['html'], [
    '<!doctype html><html><head>',
    '<script nonce="SHELL-N0NCE">window.a = 1;</script>',
    '<script nonce="keep">window.b = 2;</script>',
    '<script nonce="SHELL-N0NCE" type="module" src="./x.js"></SCRIPT>',
    '<script nonce="SHELL-N0NCE"\n  defer>window.c = 3;</script>',
    '</head><body><p>a &lt;script&gt; in text</p></body></html>',
  ].join('\n'), "the file's text, with the nonce on every script tag that had none");
  assert.equal(stampScriptNonce('<p>no scripts</p>', 'n'), '<p>no scripts</p>');
  assert.equal(stampScriptNonce('<script>x</script>', 'a"b'), '<script nonce="a&quot;b">x</script>', 'the nonce is escaped as an attribute');

  // Any other path is not read and is answered with no html.
  for (const relPath of [`${DIR}/er-model.html`, 'docs/other/secret.html', '../../etc/passwd', LLD_PATH, '']) {
    h.fc.send('open-companion', { artifactId: LLD.id, relPath });
    await settle();
    const refused = h.companions().at(-1)!;
    assert.deepEqual(Object.keys(refused).sort(), ['artifactId', 'relPath', 'type'], `${relPath}: no html`);
    assert.equal(refused['relPath'], relPath);
  }
  // A companion asked for under another artifact's id is not the open document's.
  h.fc.send('open-companion', { artifactId: PLAN.id, relPath: SEQ_PATH });
  await settle();
  assert.equal('html' in h.companions().at(-1)!, false);
  assert.deepEqual(reads, [SEQ_PATH], 'none of them reached the reader');
  // A malformed request is dropped.
  const before = h.companions().length;
  h.fc.send('open-companion', { artifactId: LLD.id });
  h.fc.send('open-companion', { relPath: SEQ_PATH });
  await settle();
  assert.equal(h.companions().length, before);

  // The read fails, answers nothing, or there is no reader: no html.
  const failing: Array<Parameters<typeof harness>[0]> = [
    { readCompanion: async () => { throw new Error('EACCES'); } },
    { readCompanion: async () => undefined },
    { readCompanion: 'absent' },
  ];
  for (const o of failing) {
    const f = await openOnLld(o);
    f.fc.send('open-companion', { artifactId: LLD.id, relPath: UX_PATH });
    await settle();
    assert.deepEqual(f.companions(), [{ type: 'docs-companion', artifactId: LLD.id, relPath: UX_PATH }]);
  }
});

test("docs review host: a queued hand-over shows 'Sent to the chat; it waits its turn in the outbox.', unavailable carries the note, failed and none are unchanged, and no 'sent' wording remains", async () => {
  const cases: Array<[Parameters<typeof harness>[0], string]> = [
    [{ notifyChat: 'absent' }, 'Rejected. 1 comment saved. No chat message was sent.'],
    [{ notifyChat: () => { throw new Error('chat host disposed'); } }, 'Rejected. 1 comment saved. The chat could not be told.'],
    [{ notifyChat: () => ({ kind: 'unavailable' as const, note: 'the chat queue is full' }) }, 'Rejected. 1 comment saved. The chat could not be told: the chat queue is full.'],
    [{ notifyChat: () => 'queued' }, 'Rejected. 1 comment saved. Sent to the chat; it waits its turn in the outbox.'],
  ];
  for (const [o, message] of cases) {
    const h = await openOnLld(o);
    h.setPending([]);
    h.fc.send('docs-decision', { artifactId: LLD.id, decision: 'reject', comments: [WHOLE] });
    await settle();
    assert.deepEqual(h.decide, [{ path: LLD_PATH, decision: 'reject', comments: [WHOLE] }], 'the decision is recorded, once');
    assert.deepEqual(h.results(), [{ type: 'docs-decision-result', artifactId: LLD.id, ok: true, outcome: 'rejected', recorded: 1, message }]);
    assert.doesNotMatch(message, /The chat has been told|will be told when it is free|no chat is available/, "no 'sent' wording remains");
    assert.equal(h.content.at(-1), LLD_PATH, 'and the pane goes on to re-read the document');
    assert.equal(h.contents().at(-1)!['readOnly'], true);
  }
});

test('docs review host: a boot ping while a document is open re-posts that document by its path, for a pending document and for one that is no longer pending', async () => {
  // Pending.
  {
    const h = await openOnLld();
    const posts = h.contents().length;
    h.fc.send('open-doc', { artifactId: '' }); // the rebuilt shell's boot ping
    await settle();
    assert.deepEqual(h.content, [LLD.id, LLD_PATH], 're-read by its path');
    assert.equal(h.contents().length, posts + 1);
    const again = h.contents().at(-1)!;
    assert.equal(again['artifactId'], LLD.id);
    assert.equal('readOnly' in again, false, 'still awaiting review');
    assert.equal(again['commentable'], true, 'with its kind');
    // And it can still be decided on.
    h.fc.send('docs-decision', { artifactId: LLD.id, decision: 'approve', comments: [] });
    await settle();
    assert.equal(h.decide.length, 1);
  }

  // Opened read-only (not awaiting review).
  {
    const h = harness();
    h.host.openArtifact({ artifactId: 'BUILD-abc-s7', mdPath: BUILD_PATH });
    await settle();
    const reads = h.content.length;
    h.fc.send('open-doc', { artifactId: '' });
    await settle();
    assert.equal(h.content.length, reads + 1);
    assert.equal(h.content.at(-1), BUILD_PATH);
    assert.deepEqual([h.contents().at(-1)!['artifactId'], h.contents().at(-1)!['readOnly']], ['BUILD-abc-s7', true]);
  }

  // Opened while pending, and approved elsewhere since.
  {
    const h = await openOnLld();
    h.setPending([]);
    h.fc.send('open-doc', { artifactId: '' });
    await settle();
    assert.equal(h.content.at(-1), LLD_PATH, 'it is not in the list any more, and is still re-posted');
    assert.equal(h.contents().at(-1)!['readOnly'], true);
    h.fc.send('docs-decision', { artifactId: LLD.id, decision: 'feedback', comments: [WHOLE] });
    await settle();
    assert.equal(h.results().at(-1)!['ok'], true, 'feedback can still be sent on it');
  }

  // Nothing open: the ping loads the list and posts no document.
  {
    const h = harness();
    h.host.open();
    await settle();
    const reads = h.pendingReads();
    h.fc.send('open-doc', { artifactId: '' });
    await settle();
    assert.ok(h.pendingReads() > reads);
    assert.deepEqual(h.content, []);
  }
});

// Story E202610131f74c81f:S001 t2: the host forwards the summaries as the client gave them.
test('docs review host: docs-list carries openQuestions and workItemId', async () => {
  const rich = { ...LLD, openQuestions: 3, workItemId: 'E20261013abc:S007' };
  const h = harness({ pending: [rich, PLAN] });
  h.host.open();
  await settle();
  const list = h.fc.posted.filter((p) => p.type === 'docs-list').at(-1)!;
  assert.deepEqual(list['artifacts'], [rich, PLAN], 'unchanged, and a summary without them has no such keys');
  assert.equal((list['artifacts'] as unknown[])[0], rich, 'forwarded by reference');
});

// ---------------------------------------------------------------------------
// Story E202610131f74c81f:S001 t3 — the host watches the open document, reloads it after a
// change, and marks what it posts.
// ---------------------------------------------------------------------------

interface FakeWatch { readonly paths: readonly string[]; readonly change: () => void; disposed: boolean }
interface WatchKit {
  readonly watches: FakeWatch[];
  /** The timers started and not cancelled or run, with their delays. */
  readonly timers: Array<{ readonly ms: number; readonly fn: () => void }>;
  readonly deps: Partial<DocsReviewHostDeps>;
  live(): FakeWatch[];
  /** Run the waiting timer, as the quiet period ending. */
  runTimer(): Promise<void>;
}
function watchKit(): WatchKit {
  const watches: FakeWatch[] = [];
  const timers: WatchKit['timers'] = [];
  return {
    watches, timers,
    live: () => watches.filter((w) => !w.disposed),
    runTimer: async () => {
      assert.equal(timers.length, 1, 'one quiet period is running');
      const t = timers.shift()!;
      t.fn();
      await settle();
    },
    deps: {
      watchDocument: (paths, onChange) => {
        const w: FakeWatch = { paths: [...paths], change: onChange, disposed: false };
        watches.push(w);
        return { dispose: () => { w.disposed = true; } };
      },
      setTimer: (fn, ms) => {
        const t = { ms, fn };
        timers.push(t);
        return { cancel: () => { const i = timers.indexOf(t); if (i >= 0) timers.splice(i, 1); } };
      },
    },
  };
}
const LLD_JSON = '.insrc/artifacts/LLD-abc-s7.json';

test("docs review host: opening a document watches its markdown file and its artifact JSON, and the watch is disposed wherever the open document's record is replaced or cleared: another document, a failed open of another, the panel closing and dispose", async () => {
  const kit = watchKit();
  const ISSUE: DocsArtifactSummary = { id: 'ISSUE-x', kind: 'ISSUE', title: 'Unreadable', status: 'pending' };
  const h = await openOnLld({
    pending: [LLD, PLAN, ISSUE], deps: kit.deps,
    content: (path) => { if (path === 'ISSUE-x') throw new Error('cannot read'); return {}; },
  });
  assert.deepEqual(kit.watches.map((w) => w.paths), [[LLD_PATH, LLD_JSON]], 'the markdown file and the artifact record');
  assert.equal(kit.live().length, 1);

  // The same document read again (the boot ping): the watch is kept, not ended and restarted.
  h.fc.send('open-doc', { artifactId: '' });
  await settle();
  assert.equal(kit.watches.length, 1);
  assert.equal(kit.watches[0]!.disposed, false);

  // Another document: the earlier watch ends and one starts for the new document.
  h.fc.send('open-doc', { artifactId: PLAN.id });
  await settle();
  assert.equal(kit.watches[0]!.disposed, true);
  assert.deepEqual(kit.live().map((w) => w.paths), [[`${DIR}/PLAN.md`, '.insrc/artifacts/PLAN-abc-s7.json']]);
  // A change reported by the watch the host no longer holds does nothing.
  kit.watches[0]!.change();
  assert.equal(kit.timers.length, 0);

  // A failed open of another document clears the record: nothing is open, nothing is watched.
  h.fc.send('open-doc', { artifactId: ISSUE.id });
  await settle();
  assert.equal(kit.live().length, 0, 'the watch ends with the record');
  assert.equal(kit.watches.length, 2, 'and none is started for the document that could not be read');

  // The panel closing.
  h.fc.send('open-doc', { artifactId: LLD.id });
  await settle();
  assert.equal(kit.live().length, 1);
  kit.live()[0]!.change();
  assert.equal(kit.timers.length, 1);
  h.fc.close();
  assert.equal(kit.live().length, 0, 'closing the panel ends the watch');
  assert.equal(kit.timers.length, 0, 'and the quiet period that was running');

  // dispose().
  const kit2 = watchKit();
  const h2 = await openOnLld({ deps: kit2.deps });
  assert.equal(kit2.live().length, 1);
  h2.host.dispose();
  assert.equal(kit2.live().length, 0);
  // A document the daemon names no path for is not watched.
  const kit3 = watchKit();
  await openOnLld({ deps: kit3.deps, content: () => ({ docPath: undefined as never }) });
  assert.equal(kit3.watches.length, 0);
});

test('docs review host: a burst of changes causes one re-read of the list and of the open document by its path after the quiet period, marked changed; a change during a decision is acted on when the decision settles, whether it was recorded, refused or failed', async () => {
  // A burst: one quiet period, restarted by each change, then one re-read.
  {
    const kit = watchKit();
    const h = await openOnLld({ deps: kit.deps });
    const reads = h.pendingReads();
    const w = kit.live()[0]!;
    w.change(); w.change(); w.change();
    assert.deepEqual(kit.timers.map((t) => t.ms), [300], 'one quiet period of 300 ms, restarted by each change');
    assert.deepEqual(h.content, [LLD.id], 'nothing is read while the files are still changing');
    await kit.runTimer();
    assert.equal(h.pendingReads(), reads + 1, 'the list is read once');
    assert.deepEqual(h.content, [LLD.id, LLD_PATH], 'and the document once, by its path');
    const again = h.contents().at(-1)!;
    assert.equal(again['changed'], true, 'marked as a reload after a change');
    assert.equal('reveal' in again, false);
    assert.equal(kit.timers.length, 0);
    assert.equal(kit.live().length, 1, 'the watch is still the same one');
    assert.equal(kit.live()[0], w);
  }

  // During a decision, recorded or failed in the daemon: remembered, and acted on when it settles.
  for (const outcome of ['recorded', 'failed'] as const) {
    const kit = watchKit();
    let fired = false;
    const h = await openOnLld({
      deps: kit.deps,
      decide: () => {
        // The file changes while the daemon is handling the decision.
        kit.live()[0]!.change();
        fired = true;
        if (outcome === 'failed') throw new Error('daemon down');
        return {};
      },
    });
    h.fc.send('docs-decision', { artifactId: LLD.id, decision: 'feedback', comments: [WHOLE] });
    await settle();
    assert.equal(fired, true);
    assert.equal(h.results().at(-1)!['ok'], outcome === 'recorded');
    assert.deepEqual(kit.timers.map((t) => t.ms), [300], `${outcome}: the quiet period starts once the decision has settled, not during it`);
    const before = h.content.length;
    await kit.runTimer();
    assert.equal(h.content.length, before + 1, `${outcome}: the change is acted on`);
    assert.equal(h.content.at(-1), LLD_PATH);
    assert.equal(h.contents().at(-1)!['changed'], true);
    if (outcome === 'failed') assert.equal(before, 1, 'a failed decision did not read the document again itself, so without this the change would be lost');
  }
  // Refused by the host (approve on a document that is no longer awaiting review).
  {
    const kit = watchKit();
    let fire = false;
    const h = await openOnLld({ deps: kit.deps, onPending: () => { if (fire) { fire = false; kit.live()[0]!.change(); } } });
    h.setPending([]);
    h.fc.send('open-doc', { artifactId: '' }); // the pane learns it is no longer pending
    await settle();
    fire = true; // the change arrives during the refusal's own list read
    h.fc.send('docs-decision', { artifactId: LLD.id, decision: 'approve', comments: [] });
    assert.equal(kit.timers.length, 0, 'not while the decision is being handled');
    await settle();
    assert.equal(h.results().at(-1)!['ok'], false);
    assert.equal(h.decide.length, 0);
    assert.deepEqual(kit.timers.map((t) => t.ms), [300], 'refused: acted on when it settles');
    await kit.runTimer();
    assert.equal(h.contents().at(-1)!['changed'], true);
  }
  // No change during a decision: no quiet period afterwards.
  {
    const kit = watchKit();
    const h = await openOnLld({ deps: kit.deps });
    h.fc.send('docs-decision', { artifactId: LLD.id, decision: 'feedback', comments: [WHOLE] });
    await settle();
    assert.equal(kit.timers.length, 0);
    assert.equal('changed' in h.contents().at(-1)!, false, "the decision's own re-read is not marked changed");
  }
});

test('docs review host: a watcher or disposer that throws is logged and the document is still shown; with no watcher dep nothing is watched', async () => {
  // The watcher cannot be started.
  const failing = await openOnLld({ deps: { watchDocument: () => { throw new Error('ENOSPC: watcher limit'); } } });
  assert.equal(failing.contents().at(-1)!['markdown'], `# body of ${LLD_PATH}`, 'the document is shown as usual');
  assert.ok(failing.warnings.some((w) => /LLD\.md is not watched for changes: Error: ENOSPC/.test(w)));
  failing.fc.send('docs-decision', { artifactId: LLD.id, decision: 'feedback', comments: [WHOLE] });
  await settle();
  assert.equal(failing.results().at(-1)!['ok'], true, 'and the pane works as before');

  // A disposer that throws: logged, and the host goes on to the next document.
  const kit = watchKit();
  let n = 0;
  const h = await openOnLld({
    pending: [LLD, PLAN],
    deps: { ...kit.deps, watchDocument: (paths, onChange) => { n += 1; const w = kit.deps.watchDocument!(paths, onChange); return n === 1 ? { dispose: () => { throw new Error('already gone'); } } : w; } },
  });
  h.fc.send('open-doc', { artifactId: PLAN.id });
  await settle();
  assert.ok(h.warnings.some((w) => /could not be ended: Error: already gone/.test(w)));
  assert.equal(h.contents().at(-1)!['artifactId'], PLAN.id);
  assert.deepEqual(kit.watches.at(-1)!.paths, [`${DIR}/PLAN.md`, '.insrc/artifacts/PLAN-abc-s7.json'], 'the next document is watched');
  // The earlier watch's late report is ignored: it is not the one the host holds.
  kit.watches[0]!.change();
  assert.equal(kit.timers.length, 0);

  // No watcher dep: nothing is watched, and nothing breaks.
  const none = await openOnLld();
  assert.equal(none.contents().length, 1);
  none.host.dispose();
});

test('docs review host: docs-content carries reveal for a list-row open and for openArtifact, on the content and on the unavailable content of a failed read alike, and not for a re-read after a decision, on the boot ping or from the watch', async () => {
  const kit = watchKit();
  const h = await openOnLld({ deps: kit.deps });
  assert.equal(h.contents().at(-1)!['reveal'], true, 'a list-row open');
  // Re-reads: after a decision, on the boot ping, from the watch.
  h.fc.send('docs-decision', { artifactId: LLD.id, decision: 'feedback', comments: [WHOLE] });
  await settle();
  assert.equal('reveal' in h.contents().at(-1)!, false, 'after a decision');
  h.fc.send('open-doc', { artifactId: '' });
  await settle();
  assert.equal('reveal' in h.contents().at(-1)!, false, 'on the boot ping');
  kit.live()[0]!.change();
  await kit.runTimer();
  assert.deepEqual(['reveal' in h.contents().at(-1)!, h.contents().at(-1)!['changed']], [false, true], 'from the watch');

  // openArtifact: a pending one, and one that is not awaiting review.
  const board = harness();
  board.host.openArtifact({ artifactId: LLD.id, mdPath: LLD_PATH });
  await settle();
  assert.equal(board.contents().at(-1)!['reveal'], true);
  board.host.openArtifact({ artifactId: 'BUILD-abc-s7', mdPath: BUILD_PATH });
  await settle();
  assert.deepEqual([board.contents().at(-1)!['reveal'], board.contents().at(-1)!['readOnly']], [true, true]);

  // A failed read of an asked-for open carries it too, so the error is brought into view.
  const failing = harness({ content: () => { throw new Error('cannot read'); } });
  failing.host.open();
  await settle();
  failing.fc.send('open-doc', { artifactId: LLD.id });
  await settle();
  const failed = failing.contents().at(-1)!;
  assert.match(String(failed['markdown']), /^unavailable: cannot read/);
  assert.equal(failed['reveal'], true, 'a list row whose read failed');
  failing.host.openArtifact({ artifactId: 'BUILD-abc-s7', mdPath: BUILD_PATH });
  await settle();
  assert.equal(failing.contents().at(-1)!['reveal'], true, 'openArtifact whose read failed');
  // A failed RE-read does not: the reviewer is left where they are.
  let fail = false;
  const later = await openOnLld({ content: () => { if (fail) throw new Error('gone'); return {}; } });
  fail = true;
  later.fc.send('open-doc', { artifactId: '' });
  await settle();
  assert.match(String(later.contents().at(-1)!['markdown']), /^unavailable: gone/);
  assert.equal('reveal' in later.contents().at(-1)!, false);
});
