/**
 * Story E20260925edb76e2e:S007 / t6 — docs-review host unit + rendered-shell contract.
 *
 * FakePanel + fake DocsReviewClient, no vscode runtime. Proves the host lists pending
 * artifacts, opens one, drives approve/request-changes through the client, surfaces a
 * daemon block-verdict non-lossily, re-fetches after every decision, and renders a
 * single nonce'd CSP script with textContent-only DOM (the S003 shell invariants).
 *
 * Run: npx tsx --test vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDocsReviewHost } from '../docs-review-panel.js';
import type { ChatPanelChannel } from '../chat-panel.js';
import type { DocsReviewClient, DocsContent } from '../docs-review-client.js';
import type { DocsArtifactSummary } from '../protocol.js';
import type { WorkflowApproveResult } from '../../../../src/workflow/gates.js';

interface FakeChannel {
  channel: ChatPanelChannel;
  posted: Array<{ v: number; payload: { type: string; [k: string]: unknown } }>;
  send(message: unknown): void;
  fireDispose(): void;
  html(): string;
}
function fakeChannel(): FakeChannel {
  const posted: FakeChannel['posted'] = [];
  let onMsg: ((m: unknown) => void) | undefined;
  let onDisp: (() => void) | undefined;
  let html = '';
  return {
    posted,
    html: () => html,
    send: (m) => onMsg?.(m),
    fireDispose: () => onDisp?.(),
    channel: {
      setHtml: (h) => { html = h; },
      postMessage: (m) => { posted.push(m as FakeChannel['posted'][number]); },
      onMessage: (l) => { onMsg = l; },
      onDidDispose: (l) => { onDisp = l; },
      reveal: () => {},
      dispose: () => {},
    },
  };
}

const env = (type: string, extra: Record<string, unknown> = {}) => ({ v: 1, payload: { type, ...extra } });
const tick = () => new Promise((r) => setTimeout(r, 0));

interface ClientCalls {
  pending: number;
  content: string[];
  approve: string[];
  comment: Array<{ id: string; note: string }>;
}
function fakeClient(over: Partial<{
  pending: () => DocsArtifactSummary[];
  content: (id: string) => DocsContent;
  approve: (id: string) => WorkflowApproveResult;
  comment: (id: string, note: string) => void;
}> = {}): { client: DocsReviewClient; calls: ClientCalls } {
  const calls: ClientCalls = { pending: 0, content: [], approve: [], comment: [] };
  const defPending: DocsArtifactSummary[] = [
    { id: 'LLD-abc-s7', kind: 'LLD', title: 'Docs review pane', status: 'pending' },
  ];
  const client: DocsReviewClient = {
    async pending() { calls.pending++; return (over.pending ?? (() => defPending))(); },
    async content(id) { calls.content.push(id); return (over.content ?? (() => ({ markdown: '# body', openQuestions: ['q?'], blocked: false })))(id); },
    async approve(id) { calls.approve.push(id); return (over.approve ?? (() => ({ approved: [{ path: id, result: {} }], skipped: [], codeReview: [] } as unknown as WorkflowApproveResult)))(id); },
    async comment(id, note) { calls.comment.push({ id, note }); (over.comment ?? (() => {}))(id, note); },
  };
  return { client, calls };
}

test('open() posts the pending list from client.pending()', async () => {
  const fc = fakeChannel();
  const { client, calls } = fakeClient();
  const host = createDocsReviewHost({ createPanel: () => fc.channel, client });
  host.open();
  await tick();
  assert.ok(calls.pending >= 1, 'called client.pending()');
  const list = fc.posted.find((p) => p.payload.type === 'docs-list');
  assert.ok(list, 'posted docs-list');
  assert.deepEqual((list!.payload as { artifacts: DocsArtifactSummary[] }).artifacts[0]!.id, 'LLD-abc-s7');
});

test('open-doc for a known id posts docs-content mapped from the client', async () => {
  const fc = fakeChannel();
  const { client } = fakeClient({ content: () => ({ markdown: 'the body', openQuestions: ['why?'], blocked: false }) });
  const host = createDocsReviewHost({ createPanel: () => fc.channel, client });
  host.open();
  await tick();
  fc.send(env('open-doc', { artifactId: 'LLD-abc-s7' }));
  await tick();
  const content = fc.posted.find((p) => p.payload.type === 'docs-content');
  assert.ok(content, 'posted docs-content');
  assert.equal(content!.payload.markdown, 'the body');
  assert.deepEqual(content!.payload.openQuestions, ['why?']);
  assert.equal(content!.payload.blocked, false);
});

test('open-doc for a stale/unknown id does NOT fetch content — it refreshes the list', async () => {
  const fc = fakeChannel();
  const { client, calls } = fakeClient();
  const host = createDocsReviewHost({ createPanel: () => fc.channel, client });
  host.open();
  await tick();
  const pendingBefore = calls.pending;
  fc.send(env('open-doc', { artifactId: 'GHOST-s9' }));
  await tick();
  assert.equal(calls.content.length, 0, 'never fetched content for a stale id');
  assert.ok(calls.pending > pendingBefore, 're-fetched pending instead');
});

test('docs-decision accept approves via the client and re-fetches pending', async () => {
  const fc = fakeChannel();
  const { client, calls } = fakeClient();
  const host = createDocsReviewHost({ createPanel: () => fc.channel, client });
  host.open();
  await tick();
  const pendingBefore = calls.pending;
  fc.send(env('docs-decision', { artifactId: 'LLD-abc-s7', accept: true }));
  await tick();
  assert.deepEqual(calls.approve, ['LLD-abc-s7'], 'approved the artifact');
  assert.ok(calls.pending > pendingBefore, 're-fetched pending after the decision');
});

test('a blocked approve (skipped[], nothing approved) surfaces the reason non-lossily and stays pending', async () => {
  const fc = fakeChannel();
  const { client, calls } = fakeClient({
    approve: () => ({ approved: [], skipped: [{ path: 'docs/x/S007/LLD.md', reason: 'unresolved HIGH finding' }], codeReview: [] } as unknown as WorkflowApproveResult),
  });
  const host = createDocsReviewHost({ createPanel: () => fc.channel, client });
  host.open();
  await tick();
  fc.send(env('docs-decision', { artifactId: 'LLD-abc-s7', accept: true }));
  await tick();
  const blocked = fc.posted.filter((p) => p.payload.type === 'docs-content').find((p) => p.payload.blocked === true);
  assert.ok(blocked, 'posted a blocked docs-content notice');
  assert.match(String(blocked!.payload.markdown), /unresolved HIGH finding/, 'relays the daemon skip reason');
  assert.ok(calls.pending >= 2, 'still re-fetches pending (artifact stays pending)');
});

test('docs-decision reject records the reviewer note via client.comment and re-fetches', async () => {
  const fc = fakeChannel();
  const { client, calls } = fakeClient();
  const host = createDocsReviewHost({ createPanel: () => fc.channel, client });
  host.open();
  await tick();
  fc.send(env('docs-decision', { artifactId: 'LLD-abc-s7', accept: false, note: 'tighten error paths' }));
  await tick();
  assert.deepEqual(calls.comment, [{ id: 'LLD-abc-s7', note: 'tighten error paths' }]);
  assert.equal(calls.approve.length, 0, 'reject never approves');
});

test('a stale decision (id no longer pending) is dropped, not sent to the client', async () => {
  const fc = fakeChannel();
  const { client, calls } = fakeClient();
  const host = createDocsReviewHost({ createPanel: () => fc.channel, client });
  host.open();
  await tick();
  fc.send(env('docs-decision', { artifactId: 'GHOST-s9', accept: true }));
  await tick();
  assert.equal(calls.approve.length, 0, 'never approved a non-pending id');
});

test('client.pending() throwing yields an empty list + an inline unavailable notice (never a blank pane)', async () => {
  const fc = fakeChannel();
  const { client } = fakeClient({ pending: () => { throw new Error('daemon down'); } });
  const host = createDocsReviewHost({ createPanel: () => fc.channel, client });
  host.open();
  await tick();
  const list = fc.posted.find((p) => p.payload.type === 'docs-list');
  assert.deepEqual((list!.payload as { artifacts: unknown[] }).artifacts, [], 'empty list');
  const notice = fc.posted.find((p) => p.payload.type === 'docs-content' && String(p.payload.markdown).includes('unavailable'));
  assert.ok(notice, 'posted an unavailable notice');
});

test('HIGH-1: a content-fetch failure posts blocked:true so approve is suppressed (review not defeated)', async () => {
  const fc = fakeChannel();
  const { client } = fakeClient({ content: () => { throw new Error('daemon timeout'); } });
  const host = createDocsReviewHost({ createPanel: () => fc.channel, client });
  host.open();
  await tick();
  fc.send(env('open-doc', { artifactId: 'LLD-abc-s7' }));
  await tick();
  const content = fc.posted.find((p) => p.payload.type === 'docs-content' && p.payload.artifactId === 'LLD-abc-s7');
  assert.ok(content, 'posted docs-content for the failed open');
  assert.equal(content!.payload.blocked, true, 'approve is suppressed when the body never loaded');
  assert.match(String(content!.payload.markdown), /unavailable/, 'shows the unavailable notice');
});

test('MED-4: commentable is true for LLD/HLD/DEF and false for other pending kinds (PLAN)', async () => {
  const fcL = fakeChannel();
  const { client: cL } = fakeClient(); // default pending is an LLD
  const hL = createDocsReviewHost({ createPanel: () => fcL.channel, client: cL });
  hL.open();
  await tick();
  fcL.send(env('open-doc', { artifactId: 'LLD-abc-s7' }));
  await tick();
  const lld = fcL.posted.find((p) => p.payload.type === 'docs-content' && p.payload.artifactId === 'LLD-abc-s7');
  assert.equal(lld!.payload.commentable, true, 'LLD is commentable');

  const fcP = fakeChannel();
  const { client: cP } = fakeClient({ pending: () => [{ id: 'PLAN-abc-s7', kind: 'PLAN', title: 'plan', status: 'pending' }] });
  const hP = createDocsReviewHost({ createPanel: () => fcP.channel, client: cP });
  hP.open();
  await tick();
  fcP.send(env('open-doc', { artifactId: 'PLAN-abc-s7' }));
  await tick();
  const plan = fcP.posted.find((p) => p.payload.type === 'docs-content' && p.payload.artifactId === 'PLAN-abc-s7');
  assert.equal(plan!.payload.commentable, false, 'PLAN is not commentable (daemon resolveComment only supports DEF/HLD/LLD)');
});

test('MED-3: a slow refresh response cannot overwrite a newer one (sequence guard)', async () => {
  const fc = fakeChannel();
  // First pending() resolves LATER than the second; the guard must keep the second (newer).
  let call = 0;
  const first: DocsArtifactSummary[] = [{ id: 'OLD-s1', kind: 'LLD', title: 'old', status: 'pending' }];
  const second: DocsArtifactSummary[] = [{ id: 'NEW-s2', kind: 'LLD', title: 'new', status: 'pending' }];
  const gates: Array<(v: DocsArtifactSummary[]) => void> = [];
  const client: DocsReviewClient = {
    pending: () => new Promise<DocsArtifactSummary[]>((resolve) => { gates[call++] = resolve; }),
    async content() { return { markdown: 'b', openQuestions: [], blocked: false }; },
    async approve(id) { return { approved: [{ path: id, result: {} }], skipped: [], codeReview: [] } as unknown as WorkflowApproveResult; },
    async comment() {},
  };
  const host = createDocsReviewHost({ createPanel: () => fc.channel, client });
  host.open();            // triggers refresh #1 (index 0)
  await tick();
  fc.send(env('open-doc', { artifactId: '' })); // boot-ping triggers refresh #2 (index 1)
  await tick();
  // Resolve #2 first (newer), then #1 (older, must be dropped by the guard).
  gates[1]!(second);
  await tick();
  gates[0]!(first);
  await tick();
  const lists = fc.posted.filter((p) => p.payload.type === 'docs-list');
  const last = lists[lists.length - 1]!;
  assert.deepEqual((last.payload as { artifacts: DocsArtifactSummary[] }).artifacts, second, 'the newer response wins regardless of completion order');
});

test('rendered shell: one nonce, strict CSP, docs-review surface, no innerHTML', () => {
  const fc = fakeChannel();
  const { client } = fakeClient();
  const host = createDocsReviewHost({ createPanel: () => fc.channel, client, genNonce: () => 'NONCE123' });
  host.open();
  const html = fc.html();
  assert.match(html, /<meta http-equiv="Content-Security-Policy"[^>]*script-src 'nonce-NONCE123'/, 'CSP pins the one script nonce');
  const scripts = html.match(/<script/g) ?? [];
  assert.equal(scripts.length, 1, 'exactly one inline script');
  assert.match(html, /class="insrc-term-review"/, 'renders the docs-review surface class');
  assert.doesNotMatch(html, /innerHTML/, 'no innerHTML in the webview script');
});

test('the docs-review host + client modules are vscode-free', async () => {
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const { dirname, join } = await import('node:path');
  const here = dirname(fileURLToPath(import.meta.url));
  for (const f of ['docs-review-panel.ts', 'docs-review-client.ts']) {
    const src = readFileSync(join(here, '..', f), 'utf8');
    assert.doesNotMatch(src, /from ['"]vscode['"]/, `${f} imports nothing from vscode`);
    assert.doesNotMatch(src, /require\(['"]vscode['"]\)/, `${f} has no vscode require`);
  }
});
