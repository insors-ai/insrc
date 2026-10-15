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
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createDocsReviewHost, DOCS_BODY_RENDERER_SOURCE, DOCS_SECTIONS_SOURCE, DOCS_FR_SOURCE, DOCS_DIAGRAM_SOURCE, DOCS_UX_SOURCE, DEGRADE_NOTICE, SECTION_INDEX_NOTICE, companionVisualKind } from '../docs-review-panel.js';
import type { StructuredRenderer, CompanionSlotState, CompanionRefKind } from '../docs-review-panel.js';
import { DOCS_COMMENTS_SOURCE } from '../docs-review-comments.js';
import { DOCS_LIST_SOURCE } from '../docs-review-list.js';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { deriveSectionIndex } from '../docs-sections.js';
import { allOf, bodyStub, fire, textNode, type BodyStub } from './fake-dom.js';
import type { ChatPanelChannel } from '../chat-panel.js';
import type { DocsReviewClient, DocsContent, ReviewDecisionComment, ReviewDecisionResult } from '../docs-review-client.js';
import type { DocsArtifactSummary } from '../protocol.js';
// S004/t2 — the SHARED parity fixtures, consumed by BOTH the daemon renderer and
// the client one, so the structural diff compares two RENDERERS rather than two
// authors' intentions. They live in the plugin test tree because S004 must touch
// no file under src/.
import { UX_PARITY_FIXTURES, UX_RENESTED_FIXTURE } from './fixtures/ux-parity.js';

// ---------------------------------------------------------------------------
// ISSUE-3b6bd6b5 — some checks read git history or run the root's TypeScript
// compiler, and a checkout may have neither: a source tarball, a --depth 1 clone,
// a rewritten history, an uninstalled tree. Each such check goes through one of
// the two guards below, which skip it with the reason instead of letting it fail
// on a raw subprocess error or pass on an empty window.
// ---------------------------------------------------------------------------

const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const TSC = fileURLToPath(new URL('../../../../node_modules/typescript/bin/tsc', import.meta.url));

/** The part of a test context the guards use, so their own test can record the skip. */
type Skipper = Pick<TestContext, 'skip'>;

/** What history a check relies on. */
interface GitNeed {
  /** Commits it reads, which must exist. */
  readonly commits?: readonly string[] | undefined;
  /** A window between the last commits touching two files: two distinct commits, from an ancestor of to. */
  readonly window?: { readonly from: string; readonly to: string } | undefined;
}

/** The one place this file spawns git: a runner bound to `root`. History checks reach it only through git(t, need). */
function gitIn(root: string, env: NodeJS.ProcessEnv = process.env): (...args: string[]) => string {
  return (...args) =>
    execFileSync('git', args, { cwd: root, env, encoding: 'utf8', maxBuffer: 1 << 24, stdio: ['ignore', 'pipe', 'pipe'] });
}

/** A git runner bound to `root`, or null after skipping the test with the reason its history is missing. */
function git(t: Skipper, need: GitNeed, root: string = REPO_ROOT): ((...args: string[]) => string) | null {
  const run = gitIn(root);
  const succeeds = (...args: string[]): boolean => {
    try { run(...args); return true; } catch { return false; }
  };
  const skip = (reason: string): null => { t.skip(reason); return null; };

  let inside = false;
  try { inside = run('rev-parse', '--is-inside-work-tree').trim() === 'true'; } catch { /* not a repository */ }
  if (!inside) return skip(`not a git work tree: ${root}`);
  let shallow = '';
  try { shallow = run('rev-parse', '--is-shallow-repository').trim(); } catch { /* reported below */ }
  // A git too old for the flag echoes it back; anything but 'false' cannot be trusted to have the history.
  if (shallow !== 'false' && shallow !== 'true') return skip(`cannot tell whether ${root} is a shallow clone`);
  if (shallow === 'true') {
    const what = [...(need.commits ?? []), ...(need.window ? [`${need.window.from} .. ${need.window.to}`] : [])];
    return skip(`shallow clone: history needed for ${what.join(', ') || 'this check'}`);
  }
  for (const sha of need.commits ?? []) {
    if (!succeeds('cat-file', '-e', `${sha}^{commit}`)) return skip(`commit ${sha} is not in this history`);
  }
  if (need.window) {
    const { from, to } = need.window;
    const noWindow = (why: string): null => skip(`no build window between ${from} and ${to}: ${why}`);
    // A failing git log is reported as itself, not mistaken for a file no commit touches.
    const last = (file: string): string | Error => {
      try { return run('log', '--format=%H', '-1', '--', file).trim(); } catch (err) { return err as Error; }
    };
    const a = last(from);
    const b = last(to);
    if (a instanceof Error) return noWindow(`git log failed for ${from}: ${a.message.split('\n')[0]}`);
    if (b instanceof Error) return noWindow(`git log failed for ${to}: ${b.message.split('\n')[0]}`);
    if (a === '' || b === '') return noWindow(`no commit touches ${a === '' ? from : to}`);
    if (a === b) return noWindow('both ends are the same commit');
    if (!succeeds('merge-base', '--is-ancestor', a, b)) return noWindow(`the ${from} commit is not an ancestor of the ${to} commit`);
  }
  return run;
}

/** The compiler's path, or null after skipping the test because it is not installed there. */
function tscOrSkip(t: Skipper, path: string = TSC): string | null {
  if (existsSync(path)) return path;
  t.skip(`TypeScript compiler not installed at ${path}`);
  return null;
}

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

/** The repo-relative path the fake client's default content names its document by. */
const DOC_PATH = 'docs/epics/x/S007/LLD.md';
interface DecideCall { path: string; decision: string; comments: readonly ReviewDecisionComment[] }
interface ClientCalls {
  pending: number;
  content: string[];
  decide: DecideCall[];
}
/** What the daemon answers a decision with when the test does not say otherwise. */
const decided = (call: DecideCall): ReviewDecisionResult => ({
  artifactId: 'LLD-abc-s7',
  decision: call.decision as ReviewDecisionResult['decision'],
  outcome: call.decision === 'approve' ? 'approved' : call.decision === 'reject' ? 'rejected' : 'recorded',
  recorded: call.comments.length,
  entryIds: call.comments.map((_, i) => `e${i + 1}`),
  author: 'Rev Iewer',
});
function fakeClient(over: {
  pending?: (() => DocsArtifactSummary[]) | undefined;
  content?: ((id: string) => DocsContent) | undefined;
  decide?: ((call: DecideCall) => ReviewDecisionResult) | undefined;
} = {}): { client: DocsReviewClient; calls: ClientCalls } {
  const calls: ClientCalls = { pending: 0, content: [], decide: [] };
  const defPending: DocsArtifactSummary[] = [
    { id: 'LLD-abc-s7', kind: 'LLD', title: 'Docs review pane', status: 'pending' },
  ];
  const client: DocsReviewClient = {
    async pending() { calls.pending++; return (over.pending ?? (() => defPending))(); },
    async content(id) { calls.content.push(id); return (over.content ?? (() => ({ markdown: '# body', openQuestions: ['q?'], blocked: false, docPath: DOC_PATH })))(id); },
    async decide(path, decision, comments) {
      const call = { path, decision, comments };
      calls.decide.push(call);
      return (over.decide ?? decided)(call);
    },
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

test("docs-decision approve records the decision through client.decide by the document's path and re-fetches pending", async () => {
  const fc = fakeChannel();
  const { client, calls } = fakeClient();
  const host = createDocsReviewHost({ createPanel: () => fc.channel, client });
  host.open();
  await tick();
  fc.send(env('open-doc', { artifactId: 'LLD-abc-s7' }));
  await tick();
  const pendingBefore = calls.pending;
  fc.send(env('docs-decision', { artifactId: 'LLD-abc-s7', decision: 'approve', comments: [] }));
  await tick();
  assert.deepEqual(calls.decide, [{ path: DOC_PATH, decision: 'approve', comments: [] }], 'one call, by the path the content named');
  assert.ok(calls.pending > pendingBefore, 're-fetched pending after the decision');
});

test('a docs-decision in the earlier accept/note shape, or for a document that was never opened, reaches no daemon call', async () => {
  const fc = fakeChannel();
  const { client, calls } = fakeClient();
  const host = createDocsReviewHost({ createPanel: () => fc.channel, client });
  host.open();
  await tick();
  fc.send(env('docs-decision', { artifactId: 'LLD-abc-s7', accept: true }));
  fc.send(env('docs-decision', { artifactId: 'LLD-abc-s7', decision: 'maybe', comments: [] }));
  fc.send(env('docs-decision', { artifactId: 'LLD-abc-s7', decision: 'approve' }));
  await tick();
  assert.deepEqual(calls.decide, [], 'a malformed decision is dropped');
  // Pending, but its content was never read: there is no path to send it by.
  fc.send(env('docs-decision', { artifactId: 'LLD-abc-s7', decision: 'approve', comments: [] }));
  await tick();
  assert.deepEqual(calls.decide, []);
  const refused = fc.posted.filter((p) => p.payload.type === 'docs-decision-result').at(-1)!;
  assert.equal(refused.payload['ok'], false);
  assert.match(String(refused.payload['message']), /Nothing was recorded: open the document before deciding on it/);
});

test('a withheld approval surfaces the reason non-lossily and stays pending', async () => {
  const fc = fakeChannel();
  const { client, calls } = fakeClient({
    decide: (call) => ({ ...decided(call), outcome: 'withheld', reason: 'unresolved HIGH finding' }),
  });
  const host = createDocsReviewHost({ createPanel: () => fc.channel, client });
  host.open();
  await tick();
  fc.send(env('open-doc', { artifactId: 'LLD-abc-s7' }));
  await tick();
  fc.send(env('docs-decision', { artifactId: 'LLD-abc-s7', decision: 'approve', comments: [] }));
  await tick();
  const result = fc.posted.filter((p) => p.payload.type === 'docs-decision-result').at(-1)!;
  assert.equal(result.payload['ok'], true, 'a withheld approval is an answer, not a failure');
  assert.equal(result.payload['outcome'], 'withheld');
  assert.match(String(result.payload['message']), /Not approved: unresolved HIGH finding\./, 'relays the daemon skip reason');
  assert.ok(calls.pending >= 2, 'still re-fetches pending (artifact stays pending)');
});

test('docs-decision reject and feedback send their comments through the same client.decide call and re-fetch', async () => {
  const fc = fakeChannel();
  const { client, calls } = fakeClient();
  const host = createDocsReviewHost({ createPanel: () => fc.channel, client });
  host.open();
  await tick();
  fc.send(env('open-doc', { artifactId: 'LLD-abc-s7' }));
  await tick();
  const pendingBefore = calls.pending;
  const comments = [{ comment: 'tighten error paths' }, { comment: 'say which', anchor: { quote: 'the pane' } }];
  fc.send(env('docs-decision', { artifactId: 'LLD-abc-s7', decision: 'reject', comments }));
  await tick();
  fc.send(env('docs-decision', { artifactId: 'LLD-abc-s7', decision: 'feedback', comments: [comments[0]] }));
  await tick();
  assert.deepEqual(calls.decide, [
    { path: DOC_PATH, decision: 'reject', comments },
    { path: DOC_PATH, decision: 'feedback', comments: [comments[0]] },
  ], 'the decision and every comment, in one call each');
  assert.ok(calls.pending > pendingBefore);
});

test('a stale decision (id no longer pending) is dropped, not sent to the client', async () => {
  const fc = fakeChannel();
  const { client, calls } = fakeClient();
  const host = createDocsReviewHost({ createPanel: () => fc.channel, client });
  host.open();
  await tick();
  fc.send(env('docs-decision', { artifactId: 'GHOST-s9', decision: 'approve', comments: [] }));
  await tick();
  assert.equal(calls.decide.length, 0, 'never approved a non-pending id');
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
    async decide(path, decision, comments) { return decided({ path, decision, comments }); },
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

// ISSUE-605c7057 — the opened-DOCUMENT half of the same guard. Two pending artifacts,
// content() gated per id so the two opens can be completed in either order.
function openRaceHarness() {
  const fc = fakeChannel();
  const docs: DocsArtifactSummary[] = [
    { id: 'LLD-a-s1', kind: 'LLD', title: 'a', status: 'pending' },
    { id: 'LLD-b-s2', kind: 'LLD', title: 'b', status: 'pending' },
  ];
  const gates = new Map<string, { resolve: (c: DocsContent) => void; reject: (e: Error) => void }>();
  const client: DocsReviewClient = {
    async pending() { return docs; },
    content: (id) => new Promise<DocsContent>((resolve, reject) => { gates.set(id, { resolve, reject }); }),
    async decide(path, decision, comments) { return decided({ path, decision, comments }); },
  };
  const host = createDocsReviewHost({ createPanel: () => fc.channel, client });
  const body = (id: string): DocsContent => ({ markdown: `body of ${id}`, openQuestions: [], blocked: false });
  const contents = () => fc.posted.filter((p) => p.payload.type === 'docs-content');
  return { fc, host, gates, body, contents };
}

test('ISSUE-605c7057: a slow earlier open cannot overwrite a newer one (newer wins, either completion order)', async () => {
  // The older open completes LAST — the order that used to show the wrong document.
  const late = openRaceHarness();
  late.host.open();
  await tick();
  late.fc.send(env('open-doc', { artifactId: 'LLD-a-s1' }));
  await tick();
  late.fc.send(env('open-doc', { artifactId: 'LLD-b-s2' }));
  await tick();
  late.gates.get('LLD-b-s2')!.resolve(late.body('LLD-b-s2'));
  await tick();
  late.gates.get('LLD-a-s1')!.resolve(late.body('LLD-a-s1'));
  await tick();
  assert.deepEqual(late.contents().map((p) => p.payload.artifactId), ['LLD-b-s2'], 'only the newer document is ever posted');

  // The older open completes FIRST — it is already superseded, so it is still dropped.
  const early = openRaceHarness();
  early.host.open();
  await tick();
  early.fc.send(env('open-doc', { artifactId: 'LLD-a-s1' }));
  await tick();
  early.fc.send(env('open-doc', { artifactId: 'LLD-b-s2' }));
  await tick();
  early.gates.get('LLD-a-s1')!.resolve(early.body('LLD-a-s1'));
  await tick();
  early.gates.get('LLD-b-s2')!.resolve(early.body('LLD-b-s2'));
  await tick();
  assert.deepEqual(early.contents().map((p) => p.payload.artifactId), ['LLD-b-s2'], 'only the newer document is ever posted');
});

test('ISSUE-605c7057: a superseded open that FAILS does not replace the current document with its error', async () => {
  const h = openRaceHarness();
  h.host.open();
  await tick();
  h.fc.send(env('open-doc', { artifactId: 'LLD-a-s1' }));
  await tick();
  h.fc.send(env('open-doc', { artifactId: 'LLD-b-s2' }));
  await tick();
  h.gates.get('LLD-b-s2')!.resolve(h.body('LLD-b-s2'));
  await tick();
  h.gates.get('LLD-a-s1')!.reject(new Error('daemon timeout'));
  await tick();
  const posted = h.contents();
  assert.deepEqual(posted.map((p) => p.payload.artifactId), ['LLD-b-s2'], "the stale open's failure is not posted");
  assert.equal(posted[0]!.payload.blocked, false, 'the current document is not marked blocked by another document\'s failure');
});

test('ISSUE-605c7057: a failure of the CURRENT open still posts blocked:true (fail-closed kept)', async () => {
  const h = openRaceHarness();
  h.host.open();
  await tick();
  h.fc.send(env('open-doc', { artifactId: 'LLD-a-s1' }));
  await tick();
  h.fc.send(env('open-doc', { artifactId: 'LLD-b-s2' }));
  await tick();
  h.gates.get('LLD-a-s1')!.resolve(h.body('LLD-a-s1'));
  await tick();
  h.gates.get('LLD-b-s2')!.reject(new Error('daemon timeout'));
  await tick();
  const posted = h.contents();
  assert.deepEqual(posted.map((p) => p.payload.artifactId), ['LLD-b-s2']);
  assert.equal(posted[0]!.payload.blocked, true, 'approve stays suppressed when the current body never loaded');
  assert.match(String(posted[0]!.payload.markdown), /unavailable/);
});

test('ISSUE-605c7057: a list refresh does not discard an in-flight open', async () => {
  const h = openRaceHarness();
  h.host.open();
  await tick();
  h.fc.send(env('open-doc', { artifactId: 'LLD-a-s1' }));
  await tick();
  h.fc.send(env('open-doc', { artifactId: '' })); // boot-ping -> refreshPending
  await tick();
  h.gates.get('LLD-a-s1')!.resolve(h.body('LLD-a-s1'));
  await tick();
  assert.deepEqual(h.contents().map((p) => p.payload.artifactId), ['LLD-a-s1'], 'the open still renders after a refresh');
});

// RENAMED (S001/t4). The old name said "no innerHTML" and the old body asserted
// it, which stopped being the contract the moment the body started rendering
// markdown. Asserting the SCRUB IS PRESENT is the stronger check anyway: a
// blanket doesNotMatch(/innerHTML/) passes if someone deletes the render, while
// this fails if someone deletes the guard. Named for what it now checks, rather
// than inheriting the stale-name drift the chat-panel precedent carries.
test('rendered shell: one nonce, unwidened CSP, the review pane body, guardMd present, no remote origin', () => {
  const fc = fakeChannel();
  const { client } = fakeClient();
  const host = createDocsReviewHost({ createPanel: () => fc.channel, client, genNonce: () => 'NONCE123' });
  host.open();
  const html = fc.html();

  assert.match(html, /<meta http-equiv="Content-Security-Policy"[^>]*script-src 'nonce-NONCE123'/, 'CSP pins the one script nonce');
  // NOT widened: still no remote script/style source and default-src stays 'none'.
  assert.match(html, /default-src 'none'/, "default-src stays 'none'");
  assert.doesNotMatch(html, /script-src[^;"]*(https?:|\*|'unsafe-inline')/, 'script-src is nonce-only — never widened');

  // `<script\b` so the word boundary holds: MARKED_SRC's own text must not be
  // miscounted as another tag.
  const scripts = html.match(/<script\b/g) ?? [];
  assert.equal(scripts.length, 1, 'exactly one inline script tag even after MARKED_SRC is injected');

  // The --it-* tokens are defined on the body from VS Code theme variables, so every
  // var(--it-…) in the pane resolves without a terminal wrapper.
  assert.match(html, /<body class="insrc-rv">/, "the pane's body");
  assert.match(html, /body\{--it-bg:var\(--vscode-editor-background\);/, 'the tokens are defined on the body');
  assert.doesNotMatch(html, /insrc-term/, 'no terminal surface class is left');

  assert.match(html, /guardMd\(/, 'the rendered markdown is scrubbed via guardMd — asserted PRESENT, so removing the guard fails this test');
  assert.doesNotMatch(html, /(src|href)="https?:/, 'no remote resource is referenced by the shell');
});

test('t4: the body container is NOT preformatted, and the shell carries markdown element rules for it', () => {
  const fc = fakeChannel();
  const { client } = fakeClient();
  const host = createDocsReviewHost({ createPanel: () => fc.channel, client, genNonce: () => 'N' });
  host.open();
  const html = fc.html();

  // A <pre> would render marked's inter-block newlines as literal blank lines
  // and set headings in the monospace face at body size.
  assert.doesNotMatch(html, /<pre[^>]*id="insrc-docs-body"/, 'the body container is not a <pre>');
  assert.match(html, /<div id="insrc-docs-body"[^>]*class="insrc-docs-content"/, 'the body container is a non-preformatted div');

  // renderTerminalStyle emits tokens only, so the element rules have to be here.
  for (const [sel, what] of [
    [/\.insrc-md h1,/, 'headings'],
    [/\.insrc-md ul,\.insrc-md ol\{/, 'lists'],
    [/\.insrc-md strong\{/, 'strong'],
    [/\.insrc-md em\{/, 'emphasis'],
    [/\.insrc-md code\{/, 'inline code'],
    [/\.insrc-md table\{/, 'tables'],
  ] as const) {
    assert.match(html, sel, `the shell's CSS styles ${what}`);
  }
  // Those rules must be reachable from the body container: the renderer stamps
  // class="insrc-md" on it, which is what the selectors above key on.
  assert.match(html, /el\.className='insrc-md'/, 'the rendered body is given the class the markdown rules target');
  // And the per-level scale, so a long document has real hierarchy.
  assert.match(html, /\.insrc-md h1\{font-size:/, 'headings carry a per-level size scale');
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

// ---------------------------------------------------------------------------
// S001/t4 — the body renderer's BEHAVIOUR, proved by EVALUATING the webview
// source against a stub DOM rather than by grepping the generated html. This
// repo has shipped a webview contract that string assertions called green while
// the behaviour was wrong, so the degradation path is executed here.
// ---------------------------------------------------------------------------

/** Evaluate DOCS_BODY_RENDERER_SOURCE with a chosen `marked` global and return
 *  its renderMarkdownBody. */
function loadRenderer(marked: unknown): (el: unknown, src: string) => {
  el: unknown; degradation: { degraded: boolean; notice?: string | undefined };
} {
  // eslint-disable-next-line no-new-func
  const make = new Function('marked', `${DOCS_BODY_RENDERER_SOURCE}; return renderMarkdownBody;`);
  return make(marked) as ReturnType<typeof loadRenderer>;
}

test('t4: the happy path parses through the vendored renderer and scrubs with guardMd', () => {
  const calls: unknown[] = [];
  const marked = {
    parse: (src: string, opts: unknown) => { calls.push(opts); return `<h1>${src}</h1>`; },
  };
  const el = bodyStub('div');
  const out = loadRenderer(marked)(el, '# Title');

  assert.equal(el['innerHTML'], '<h1># Title</h1>', 'markup came from the vendored parse');
  assert.equal(el['className'], 'insrc-md', 'the container is given the markdown rules’ class');
  // The published RenderDegradation shape: degraded:false pairs with an EMPTY
  // notice — a non-empty notice never accompanies a successful render.
  assert.deepEqual(out.degradation, { degraded: false, notice: '' });
  // headerIds:false is load-bearing — sc3 owns heading identity, not the renderer.
  assert.deepEqual(calls[0], { gfm: true, breaks: false, headerIds: false, mangle: false });
});

test('t4: a PARSE FAILURE falls back to textContent with the FULL body present and degradation { degraded: true, notice }', () => {
  const body = '# Title\n\n- a\n- b\n\nparagraph with **emphasis**';
  const el = bodyStub('div');
  const out = loadRenderer({ parse: () => { throw new Error('boom'); } })(el, body);

  assert.equal(el['textContent'], body, 'the FULL body text is present — degraded is plainer, never partial');
  assert.equal(el['innerHTML'], '', 'no partial markup is left behind');
  assert.equal(out.degradation.degraded, true);
  assert.equal(out.degradation.notice, DEGRADE_NOTICE);
  assert.ok((out.degradation.notice ?? '').length > 0, 'the reviewer is TOLD, not left to infer');
});

test('t4: a MISSING vendored global takes the SAME fallback path as a parse throw — one code path, one message', () => {
  const body = '# Title\n\nbody text';

  const thrown = loadRenderer({ parse: () => { throw new Error('boom'); } })(bodyStub('div'), body);
  const missing = loadRenderer(undefined)(bodyStub('div'), body);
  const notAFunction = loadRenderer({})(bodyStub('div'), body);

  // Identical degradation from all three, which is what "one path, one message" means.
  assert.deepEqual(missing.degradation, thrown.degradation);
  assert.deepEqual(notAFunction.degradation, thrown.degradation);
  assert.equal(missing.degradation.notice, DEGRADE_NOTICE);

  const el = bodyStub('div');
  loadRenderer(undefined)(el, body);
  assert.equal(el['textContent'], body, 'the full body still shows with no renderer at all');
});

test('t4: guardMd strips a non-http href and an image src from the rendered body, and moves an http(s) address to data-url', () => {
  // Exercise the scrub itself, so "guardMd is present" is backed by it working.
  const anchor = {
    _attrs: { href: 'javascript:alert(1)' } as Record<string, string>,
    getAttribute(k: string) { return this._attrs[k] ?? null; },
    setAttribute(k: string, v: string) { this._attrs[k] = v; },
    removeAttribute(k: string) { delete this._attrs[k]; },
  };
  const safe = {
    _attrs: { href: 'https://example.com' } as Record<string, string>,
    getAttribute(k: string) { return this._attrs[k] ?? null; },
    setAttribute(k: string, v: string) { this._attrs[k] = v; },
    removeAttribute(k: string) { delete this._attrs[k]; },
  };
  const img = {
    _attrs: { src: 'https://tracker/x.png', srcset: 'y' } as Record<string, string>,
    getAttribute(k: string) { return this._attrs[k] ?? null; },
    setAttribute(k: string, v: string) { this._attrs[k] = v; },
    removeAttribute(k: string) { delete this._attrs[k]; },
  };
  const el = {
    innerHTML: '', textContent: '', className: '',
    querySelectorAll: (sel: string) => (sel === 'a' ? [anchor, safe] : [img]),
  };

  loadRenderer({ parse: (s: string) => s })(el, 'body');

  assert.equal(anchor._attrs['href'], undefined, 'a javascript: href is dropped');
  assert.equal(anchor._attrs['data-url'], undefined, 'and leaves no target behind');
  // Epic babd84c6e2fb480a Story S001: no link keeps an href, so only the pane's own click handler can open one.
  assert.equal(safe._attrs['href'], undefined, 'an https href is removed');
  assert.equal(safe._attrs['data-url'], 'https://example.com', 'and its address is kept for the click handler');
  assert.equal(safe._attrs['target'], undefined, 'nothing asks the webview to open a window');
  assert.equal(img._attrs['src'], undefined, 'image sources are stripped');
  assert.equal(img._attrs['srcset'], undefined);
});

test('t6 (contract): StructuredRenderer is still exported and now implemented in exactly ONE named place — a DELIBERATE narrowing at the first implementer, not an eroded invariant', async () => {
  // S001 wrote this assertion as "the type is published and NOTHING implements
  // it", explicitly to hold only until the first implementer arrived. S002 is
  // that implementer, so the assertion is REWRITTEN, not deleted, and it must
  // still fail if a renderer appears somewhere unsanctioned. This is the same
  // kind of scoped, recorded narrowing S001 itself made to the no-innerHTML
  // assertion — never an incidental relaxation.
  //
  // ONE SUBTLETY, recorded rather than hidden, because it would otherwise read
  // as the invariant quietly surviving: the implementation lives in an exported
  // SOURCE STRING (DOCS_FR_SOURCE), evaluated in the webview and under
  // `new Function` in these tests. There is therefore no TypeScript value to
  // annotate, and S001's literal regex would STILL pass unchanged — which is
  // exactly why leaving it alone would have been the misleading choice. What
  // follows asserts the implementation where it actually is.
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const { dirname, join } = await import('node:path');
  const here = dirname(fileURLToPath(import.meta.url));

  const panel = readFileSync(join(here, '..', 'docs-review-panel.ts'), 'utf8');
  assert.match(panel, /export type StructuredRenderer</, 'the sc2 type s2/s3/s4 build against is still exported');

  // IMPLEMENTED, in exactly one place, and named: the functional-requirements
  // renderer inside DOCS_FR_SOURCE.
  assert.equal((DOCS_FR_SOURCE.match(/function renderFunctionalRequirements\(/g) ?? []).length, 1,
    'exactly one implementation of the contract, in DOCS_FR_SOURCE');
  for (const other of [DOCS_BODY_RENDERER_SOURCE, DOCS_SECTIONS_SOURCE]) {
    assert.doesNotMatch(other, /function renderFunctionalRequirements\(/,
      'and it is not duplicated into a sibling source string');
  }

  // The contract is checked against the REAL evaluated function rather than
  // asserted about: the annotation below is what makes a renderer that stopped
  // returning `{ el }` a type error here, instead of a silent drift.
  const renderer: StructuredRenderer<{ requirements: readonly unknown[] }> =
    loadFr() as unknown as StructuredRenderer<{ requirements: readonly unknown[] }>;
  const out = renderer({ requirements: [{ id: 'E:FR001', statement: 'One.', scope: 'doc' }] });
  assert.ok(out.el, 'the evaluated renderer returns the sc2 shape');
  assert.equal(out.degradation, undefined,
    'and declares no degradation — placement, not rendering, is what can degrade');

  // The OTHER three files still declare none. This is the half of S001's
  // assertion that is unchanged, and the half that keeps catching an
  // unsanctioned renderer.
  for (const f of ['docs-review-client.ts', 'docs-sections.ts', 'markdown-style.ts']) {
    const src = readFileSync(join(here, '..', f), 'utf8');
    assert.doesNotMatch(src, /:\s*StructuredRenderer</, `${f} declares no StructuredRenderer implementation`);
  }
  // And if a TypeScript annotation ever does appear, docs-review-panel.ts is the
  // ONLY sanctioned home for it — so a renderer added anywhere else on this
  // surface still turns this red.
  const chatDir = join(here, '..');
  const { readdirSync } = await import('node:fs');
  const annotated = readdirSync(chatDir)
    .filter((f) => f.endsWith('.ts'))
    .filter((f) => /:\s*StructuredRenderer</.test(readFileSync(join(chatDir, f), 'utf8')));
  assert.deepEqual(annotated, [], 'no file on this surface annotates a value as a StructuredRenderer');
});

// ---------------------------------------------------------------------------
// S001/t5 — the section index + degradation ride the EXISTING docs-content
// message. The invariant asserted here is the one that is actually true: the
// index and the markdown travel together on ONE message. It is deliberately NOT
// asserted via refreshPending's monotonic guard, which covers only the docs-LIST
// path (docs-review-panel.ts :75/:78/:83) and does not protect openDoc at all.
// ---------------------------------------------------------------------------

const DOC_MD = ['# Title', '', 'prose', '', '## Section two', '', '### Deeper'].join('\n');

/** Open a document whose client returns `content`, and give back the posted payload.
 *  A markdown string is served as `{ markdown, openQuestions: [], blocked: false }`. */
async function openWithContent(content: DocsContent | string): Promise<Record<string, unknown>> {
  const served: DocsContent = typeof content === 'string' ? { markdown: content, openQuestions: [], blocked: false } : content;
  const fc = fakeChannel();
  const { client } = fakeClient({ content: () => served });
  const host = createDocsReviewHost({ createPanel: () => fc.channel, client });
  host.open();
  await tick();
  fc.send(env('open-doc', { artifactId: 'LLD-abc-s7' }));
  await tick();
  const msg = fc.posted.filter((p) => p.payload.type === 'docs-content')
    .find((p) => p.payload.artifactId === 'LLD-abc-s7');
  assert.ok(msg, 'posted docs-content for the opened artifact');
  return msg!.payload;
}

test('the file builds no fake DOM and declares no tree flatten of its own — both come from fake-dom.ts', () => {
  const src = readFileSync(fileURLToPath(import.meta.url), 'utf8');
  for (const name of ['stubEl', 'node', 'frNode', 'dgNode', 'uxNodeStub', 'bodyStub', 'frAll', 'dgFlatten', 'uxFlatten', 'allOf']) {
    assert.equal(new RegExp(`function ${name}\\(|const ${name} = \\(`).test(src), false, `${name} is not declared here`);
  }
  assert.match(src, /import \{ allOf, bodyStub, [^}]*\} from '\.\/fake-dom\.js';/, 'the builder and the flatten are imported');
});

test('there is one document opener, and a markdown string and the same markdown as DocsContent open to identical payloads', async () => {
  const src = readFileSync(fileURLToPath(import.meta.url), 'utf8');
  assert.equal(src.split('openAnd' + 'GetContent').length - 1, 0, 'the second opener is gone');
  assert.equal(src.split('async function ' + 'openWithContent(').length - 1, 1, 'exactly one opener is defined');
  const fromString = await openWithContent(DOC_MD);
  const fromContent = await openWithContent({ markdown: DOC_MD, openQuestions: [], blocked: false });
  assert.deepEqual(fromString, fromContent);
});

test('t5: opening a document posts docs-content carrying BOTH the markdown and a sections index derived from it', async () => {
  const payload = await openWithContent(DOC_MD);

  assert.equal(payload['markdown'], DOC_MD, 'the markdown is on the message');
  const sections = payload['sections'] as { anchors: Array<{ slug: string; title: string; level: number }> };
  assert.ok(sections, 'the sections index is on the SAME message');
  assert.deepEqual(
    sections.anchors.map((a) => [a.title, a.level]),
    [['Title', 1], ['Section two', 2], ['Deeper', 3]],
    'derived from that same markdown, in document order',
  );
});

test('t5: the index is derived from THE MARKDOWN ON THAT MESSAGE — the two cannot be paired across documents', async () => {
  // Open two different documents and check each message is internally consistent:
  // deriving the index from the message's own markdown reproduces the posted index.
  for (const md of [DOC_MD, ['# Other doc', '## Only section'].join('\n')]) {
    const payload = await openWithContent(md);
    const posted = payload['sections'] as { anchors: unknown[] };
    const rederived = deriveSectionIndex(String(payload['markdown']));
    assert.deepEqual(posted, rederived, 'the posted index is exactly what this message’s markdown yields');
  }
});

test('t5: a document with NO headings posts an empty anchors array', async () => {
  const payload = await openWithContent('just prose, no headings at all\n');
  assert.deepEqual((payload['sections'] as { anchors: unknown[] }).anchors, [],
    'empty, so t6 omits the chooser entirely rather than rendering an empty control');
});

test('t5: a degraded index posts degradation and does NOT set blocked; a fetch failure sets blocked and claims NO degradation', async () => {
  // (a) A content-fetch failure: blocked, and no degradation claimed.
  const fc = fakeChannel();
  const { client } = fakeClient({ content: () => { throw new Error('daemon down'); } });
  const host = createDocsReviewHost({ createPanel: () => fc.channel, client });
  host.open();
  await tick();
  fc.send(env('open-doc', { artifactId: 'LLD-abc-s7' }));
  await tick();
  const failed = fc.posted.filter((p) => p.payload.type === 'docs-content')
    .find((p) => p.payload.blocked === true);
  assert.ok(failed, 'a fetch failure still posts blocked:true (the fail-closed rule)');
  assert.equal(failed!.payload['degradation'], undefined,
    'a fetch failure claims NO render degradation — the reviewer saw nothing, which is a different state');

  // (b) A successful open: not blocked, and no degradation either.
  const ok = await openWithContent(DOC_MD);
  assert.equal(ok['blocked'], false);
  assert.equal(ok['degradation'], undefined, 'a clean render posts no degradation at all');
});

test('t5: source-scan — the index rides the EXISTING docs-content variant; no new message type', async () => {
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const { dirname, join } = await import('node:path');
  const here = dirname(fileURLToPath(import.meta.url));
  const proto = readFileSync(join(here, '..', 'protocol.ts'), 'utf8');

  // The name list must be unchanged — sections/degradation are MEMBERS, not a type.
  for (const invented of ['docs-sections', 'docs-index', 'docs-degradation', 'section-index']) {
    assert.equal(proto.includes(`'${invented}'`), false, `no new message type (${invented})`);
  }
  // and the two new members sit inside the docs-content variant.
  const variant = proto.slice(proto.indexOf("readonly type: 'docs-content'"));
  assert.match(variant.slice(0, 900), /readonly sections\?:/, 'sections is a member of docs-content');
  assert.match(variant.slice(0, 900), /readonly degradation\?:/, 'degradation is a member of docs-content');
});

test('t5: the pre-existing SIX members of the docs-content variant keep their meaning', async () => {
  const payload = await openWithContent(DOC_MD);
  assert.equal(payload['type'], 'docs-content');
  assert.equal(payload['artifactId'], 'LLD-abc-s7');
  assert.equal(payload['markdown'], DOC_MD);
  assert.deepEqual(payload['openQuestions'], []);
  assert.equal(payload['blocked'], false);
  assert.equal(payload['commentable'], true, 'LLD stays commentable');
});

// ---------------------------------------------------------------------------
// S001/t6 — slug stamping, the section chooser and jump-to-section, exercised by
// EVALUATING the webview source against a small DOM stub. The chooser is a real
// control with real behaviour, so it is tested by using it, not by grepping for
// its markup.
// ---------------------------------------------------------------------------

/** Eval DOCS_SECTIONS_SOURCE with a stub `document`, returning its three functions. */
function loadSections(byId: Record<string, BodyStub> = {}) {
  const doc = {
    createElement: (t: string) => bodyStub(t),
    getElementById: (id: string) => byId[id],
  };
  // eslint-disable-next-line no-new-func
  const make = new Function('document', `${DOCS_SECTIONS_SOURCE}; return {stampSlugs:stampSlugs,renderSectionChooser:renderSectionChooser,jumpToSection:jumpToSection,renderDegradationNotice:renderDegradationNotice};`);
  return make(doc) as {
    stampSlugs(root: unknown, sections: unknown): number;
    renderSectionChooser(host: BodyStub, sections: unknown, onPick: (s: string) => void): boolean;
    jumpToSection(slug: string): boolean;
    renderDegradationNotice(host: BodyStub, d: unknown): boolean;
  };
}

/** A body stub whose querySelectorAll('h1..h6') returns the given headings. */
function bodyWithHeadings(titles: string[]): { root: { querySelectorAll(s: string): BodyStub[] }; heads: BodyStub[] } {
  const heads = titles.map((t) => { const h = bodyStub('h2'); h.textContent = t; return h; });
  return { root: { querySelectorAll: () => heads }, heads };
}

test('t6: rendered headings carry the slugs derived for the SAME markdown — every target matches a posted anchor', () => {
  const md = ['# Plan', '## Tasks', '## Tasks', '### ???'].join('\n');
  const index = deriveSectionIndex(md);
  const { root, heads } = bodyWithHeadings(index.anchors.map((a) => a.title));

  const stamped = loadSections().stampSlugs(root, index);
  assert.equal(stamped, index.anchors.length, 'every heading got a slug');

  const posted = new Set(index.anchors.map((a) => a.slug));
  heads.forEach((h, i) => {
    assert.equal(h.id, index.anchors[i]!.slug, 'the stamped id is the derived slug');
    assert.ok(posted.has(h.id), 'the anchor target matches a POSTED anchor');
  });
  // the duplicate pair really did get distinct targets.
  assert.notEqual(heads[1]!.id, heads[2]!.id);
});

test('t6: a heading the deriver never indexed is left UNSTAMPED rather than mis-targeted', () => {
  // marked understands setext headings; deriveSectionIndex is ATX-only, so the
  // rendered list can be longer. Pairing by title keeps the rest correct.
  const index = deriveSectionIndex(['# Alpha', '## Beta'].join('\n'));
  const { root, heads } = bodyWithHeadings(['Alpha', 'Surprise', 'Beta']);

  loadSections().stampSlugs(root, index);
  assert.equal(heads[0]!.id, 'alpha');
  assert.equal(heads[1]!.id, '', 'an unindexed heading gets no id rather than a wrong one');
  assert.equal(heads[2]!.id, 'beta', 'and the following heading still lands on its own slug');
});

test('t6: a document with NO headings renders no chooser AT ALL — not an empty control', () => {
  const host = bodyStub('div');
  const rendered = loadSections().renderSectionChooser(host, deriveSectionIndex('just prose'), () => {});
  assert.equal(rendered, false);
  assert.equal(host.children.length, 0, 'no select, no placeholder, no empty control');
});

test('t6: the chooser labels each entry with the heading VERBATIM and jumps to the chosen slug', () => {
  const md = ['# Low-level design', '## Contract details', '### Error paths'].join('\n');
  const index = deriveSectionIndex(md);

  const host = bodyStub('div');
  const picked: string[] = [];
  const api = loadSections();
  assert.equal(api.renderSectionChooser(host, index, (s) => picked.push(s)), true);

  const sel = host.children[0]!;
  assert.equal(sel.tagName, 'select');
  assert.equal(sel.attrs['aria-label'], 'jump to section');
  // option 0 is the placeholder; the rest are the headings, verbatim.
  const labels = sel.children.slice(1).map((o) => o.textContent.trim());
  assert.deepEqual(labels, ['Low-level design', 'Contract details', 'Error paths'],
    'each entry shows what the document says');
  assert.deepEqual(sel.children.slice(1).map((o) => o.value), index.anchors.map((a) => a.slug));

  // choosing one relays its slug...
  sel.value = 'contract-details';
  fire(sel, 'change');
  assert.deepEqual(picked, ['contract-details']);

  // ...and the jump moves the view DIRECTLY to that element.
  const target = bodyStub('h2');
  const jumped = loadSections({ 'contract-details': target }).jumpToSection('contract-details');
  assert.equal(jumped, true);
  assert.equal(target.scrolled, true, 'scrolled straight to the section');
  // an unknown slug is a no-op, never a throw.
  assert.equal(loadSections().jumpToSection('nope'), false);
});

test('t6: the chooser placeholder selection does NOT fire a jump', () => {
  const host = bodyStub('div');
  const picked: string[] = [];
  const api = loadSections();
  api.renderSectionChooser(host, deriveSectionIndex('# One'), (s) => picked.push(s));
  const sel = host.children[0]!;
  sel.value = '';              // the 'jump to section…' placeholder
  fire(sel, 'change');
  assert.deepEqual(picked, [], 'picking the placeholder is not a navigation');
});

test('t6: the ac3 notice appears when degraded and is ABSENT when not', () => {
  const api = loadSections();

  const host = bodyStub('div');
  assert.equal(api.renderDegradationNotice(host, { degraded: true, notice: DEGRADE_NOTICE }), true);
  assert.equal(host.children.length, 1);
  assert.equal(host.children[0]!.textContent, DEGRADE_NOTICE, 'set by textContent, never markup');
  assert.equal(host.children[0]!.attrs['role'], 'status');

  // a clean render clears it rather than leaving a stale notice behind
  assert.equal(api.renderDegradationNotice(host, { degraded: false, notice: '' }), false);
  assert.equal(host.children.length, 0);
  assert.equal(api.renderDegradationNotice(host, undefined), false);
  assert.equal(host.children.length, 0);
});

test('t6: the shell still has exactly ONE markup-injection site after the chooser and notice', () => {
  const fc = fakeChannel();
  const { client } = fakeClient();
  createDocsReviewHost({ createPanel: () => fc.channel, client, genNonce: () => 'N' }).open();
  const html = fc.html();

  // Count assignments to innerHTML in the webview source: exactly one, the body.
  const injections = html.match(/\.innerHTML\s*=/g) ?? [];
  assert.equal(injections.length, 1, 'exactly one markup-injection site — the markdown body');
  assert.match(html, /el\.innerHTML=marked\.parse/, 'and it is the guarded vendored parse');
  // the chooser + notice are DOM-constructed.
  assert.match(html, /createElement\('select'\)/);
  assert.match(html, /createElement\('option'\)/);
  assert.doesNotMatch(html, /insertAdjacentHTML|outerHTML|document\.write/, 'no other markup path');
});

test('t6: approve and send feedback reach the daemon through client.decide, and the COMMENTABLE_KINDS gate holds', async () => {
  // approve path
  const fc = fakeChannel();
  const { client, calls } = fakeClient();
  const host = createDocsReviewHost({ createPanel: () => fc.channel, client });
  host.open();
  await tick();
  fc.send(env('open-doc', { artifactId: 'LLD-abc-s7' }));
  await tick();
  fc.send(env('docs-decision', { artifactId: 'LLD-abc-s7', decision: 'approve', comments: [] }));
  await tick();
  assert.deepEqual(calls.decide, [{ path: DOC_PATH, decision: 'approve', comments: [] }], "approve is sent by the document's path");

  // feedback path
  const fc2 = fakeChannel();
  const { client: c2, calls: calls2 } = fakeClient();
  createDocsReviewHost({ createPanel: () => fc2.channel, client: c2 }).open();
  await tick();
  fc2.send(env('open-doc', { artifactId: 'LLD-abc-s7' }));
  await tick();
  fc2.send(env('docs-decision', { artifactId: 'LLD-abc-s7', decision: 'feedback', comments: [{ comment: 'tighten it' }] }));
  await tick();
  assert.deepEqual(calls2.decide, [{ path: DOC_PATH, decision: 'feedback', comments: [{ comment: 'tighten it' }] }], 'the comment is sent with the decision');

  // the gate: DEF/HLD/LLD commentable, others not
  for (const [kind, expected] of [['DEF', true], ['HLD', true], ['LLD', true], ['PLAN', false], ['ISSUE', false]] as const) {
    const f = fakeChannel();
    const { client: c } = fakeClient({ pending: () => [{ id: `${kind}-x-s1`, kind, title: 't', status: 'pending' }] });
    createDocsReviewHost({ createPanel: () => f.channel, client: c }).open();
    await tick();
    f.send(env('open-doc', { artifactId: `${kind}-x-s1` }));
    await tick();
    const msg = f.posted.filter((p) => p.payload.type === 'docs-content').find((p) => p.payload.artifactId === `${kind}-x-s1`);
    assert.equal(msg!.payload['commentable'], expected, `${kind} commentable=${expected}`);
  }
});

test('t5: a DEGRADED index posts degradation and does NOT set blocked — the branch the earlier test never reached', async () => {
  // Force deriveSections' catch branch with a malformed daemon response: a view
  // whose markdown is missing makes deriveSectionIndex throw on .split(). The
  // document must still open — only navigation is lost.
  const fc = fakeChannel();
  const { client } = fakeClient({
    content: () => ({ markdown: undefined as unknown as string, openQuestions: [], blocked: false }),
  });
  createDocsReviewHost({ createPanel: () => fc.channel, client }).open();
  await tick();
  fc.send(env('open-doc', { artifactId: 'LLD-abc-s7' }));
  await tick();

  const msg = fc.posted.filter((p) => p.payload.type === 'docs-content')
    .find((p) => p.payload.artifactId === 'LLD-abc-s7');
  assert.ok(msg, 'the document still opens — a derivation failure never refuses it');

  const deg = msg!.payload['degradation'] as { degraded: boolean; notice: string } | undefined;
  assert.ok(deg, 'a degraded derivation posts degradation');
  assert.equal(deg!.degraded, true);
  assert.equal(deg!.notice, SECTION_INDEX_NOTICE, 'and says which capability was lost');

  // THE POINT: degraded is NOT blocked. The reviewer who sees plain text and the
  // reviewer who saw nothing at all are different states.
  assert.equal(msg!.payload['blocked'], false, 'a render/index degradation does NOT set blocked');
  assert.deepEqual((msg!.payload['sections'] as { anchors: unknown[] }).anchors, [],
    'and the index degrades to empty rather than to garbage');
});

test('t6: a DEGRADED body renders NO chooser — entries whose targets do not exist are worse than none', () => {
  // On the fallback path the body is plain text, so no heading element exists to
  // stamp. The shell must gate the chooser on what was actually stamped, not on
  // what the host posted, or every entry becomes a dead control.
  const fc = fakeChannel();
  const { client } = fakeClient();
  createDocsReviewHost({ createPanel: () => fc.channel, client, genNonce: () => 'N' }).open();
  const html = fc.html();

  assert.match(html, /var stamped=stampSlugs\(/, 'the stamped count is captured');
  assert.match(html, /stamped>0\?m\.sections:\{anchors:\[\]\}/,
    'the chooser is gated on the stamped count, so a degraded body renders no chooser');

  // And the gate's downstream behaviour: an empty index renders nothing at all.
  const host = bodyStub('div');
  const rendered = loadSections().renderSectionChooser(host, { anchors: [] }, () => {});
  assert.equal(rendered, false);
  assert.equal(host.children.length, 0);
});

// ---------------------------------------------------------------------------
// S002/t1 — the functional record travels from the daemon response to the
// webview on the EXISTING docs-content message. Data-only: after this task the
// webview has no code that reads the field, and that is asserted rather than
// assumed, so "t1 changed nothing a reviewer sees" is a check and not a claim.
// ---------------------------------------------------------------------------

/** A realistic record, shaped like the one this Epic's own DEF carries: doc-level
 *  requirements first, then per-item ones bound to a story via itemRef. */
const FR_RECORD = {
  requirements: [
    { id: 'E20260929bfe98ff7:FR001', statement: 'A reviewer sees discrete outcomes.', scope: 'doc' as const },
    { id: 'E20260929bfe98ff7:S002:FR002', statement: 'Each shows its identifier, unchanged.', scope: 'item' as const, itemRef: 's2' },
  ],
};

test('t1: a client returning a record posts docs-content carrying functionalDefinition as the SAME reference, unreshaped', async () => {
  const payload = await openWithContent({
    markdown: '# Doc', openQuestions: [], blocked: false, functionalDefinition: FR_RECORD,
  });

  // SAME REFERENCE, not a deep-equal copy. Identity is the point: anything that
  // rebuilt the record on the way through would be a place an identifier could
  // change, which is exactly what this Story exists to prevent.
  assert.equal(payload['functionalDefinition'], FR_RECORD,
    'the record is forwarded by reference — no clone, no reshaping, no defaulting');
  // And nothing was added to or removed from it in transit.
  assert.deepEqual(payload['functionalDefinition'], FR_RECORD);
});

test("t1: a client returning no record posts a message with NO functionalDefinition key ('functionalDefinition' in payload === false)", async () => {
  const payload = await openWithContent({ markdown: '# Doc', openQuestions: [], blocked: false });

  // ABSENT KEY, not a key holding undefined. sc1 established this convention at
  // the IPC boundary; t1 carries it one hop further so `=== undefined` means the
  // same thing on both sides of postMessage. A `{ functionalDefinition: undefined }`
  // spread would pass a `=== undefined` test while failing this one.
  assert.equal('functionalDefinition' in payload, false,
    'absence is an ABSENT KEY, not an undefined-valued one');
  // Guard against the weaker assertion being mistaken for this one.
  assert.equal(payload['functionalDefinition'], undefined);
  // The message is otherwise unchanged — the dominant path (630 of 634 ledger
  // artifacts carry no record) posts exactly what it posted before.
  assert.equal(payload['markdown'], '# Doc');
  assert.equal(payload['blocked'], false);
});

test('t1: a content() rejection still posts blocked:true and carries no record', async () => {
  const fc = fakeChannel();
  const { client } = fakeClient({
    content: () => { throw new Error('daemon unreachable'); },
  });
  const host = createDocsReviewHost({ createPanel: () => fc.channel, client, logger: { warn: () => {}, error: () => {} } });
  host.open();
  await tick();
  fc.send(env('open-doc', { artifactId: 'LLD-abc-s7' }));
  await tick();
  const msg = fc.posted.filter((p) => p.payload.type === 'docs-content')
    .find((p) => p.payload.artifactId === 'LLD-abc-s7');
  assert.ok(msg, 'posted docs-content for the failed open');

  assert.equal(msg!.payload['blocked'], true, 'the fail-closed arm is unchanged');
  // The strongest safety property on this surface: a reviewer who never saw the
  // body is never shown a tidy, authoritative-looking list of commitments
  // extracted from it. Approve is already suppressed; the record must be absent too.
  assert.equal('functionalDefinition' in msg!.payload, false,
    'a document the reviewer could not read carries no requirements');
});

test('t1 (contract): protocol.ts types functionalDefinition by indexing off DocsContent, not as a restated shape', async () => {
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const { dirname, join } = await import('node:path');
  const here = dirname(fileURLToPath(import.meta.url));
  const proto = readFileSync(join(here, '..', 'protocol.ts'), 'utf8');

  // Scoped to the docs-content variant so a match elsewhere in the file cannot
  // satisfy this check (the file declares many variants).
  const variant = proto.slice(proto.indexOf("readonly type: 'docs-content'"));
  const decl = variant.slice(0, variant.indexOf('\n    }'));

  assert.match(decl, /readonly functionalDefinition\?: DocsContent\['functionalDefinition'\];/,
    'the annotation is the INDEXED form, so protocol -> client -> daemon stay one declaration deep');
  // A hand-copied shape is the failure this guards: it would compile and look
  // right while silently decoupling from the daemon's record.
  assert.doesNotMatch(decl, /functionalDefinition\?:\s*\{/,
    'the record shape is never restated inline');
  assert.doesNotMatch(decl, /functionalDefinition\?:\s*FunctionalDefinition/,
    'nor imported directly from the daemon type, which would bypass DocsContent');
});

/**
 * The emitted shell for nonce 'FIXED-NONCE', pinned so every change to it is a
 * DECLARED change rather than an accident. A real baseline, not a same-build
 * repeatability check — the vacuous shape the plan critique rejected, which
 * compares render() to render() and passes no matter what the shell says.
 *
 * History, so the pin reads as evidence rather than as a magic number:
 *   t1 (data-only)  60261 chars / 60305 bytes  d65b6e82…058ec
 *       captured by checking the two source files out at the commit BEFORE t1
 *       and rendering there; t1 reproduced it EXACTLY, which is how "t1 changes
 *       nothing a reviewer sees" was proved rather than asserted.
 *   t2              62257 chars / 62301 bytes  8b709d01…6b03b
 *       +1996 chars: DOCS_FR_SOURCE inlined after its two siblings, plus six
 *       `.insrc-fr*` CSS rules. Declared, expected, and inert — nothing calls
 *       the renderer until t5.
 *   t3             62661 chars / 62705 bytes  b8d9d5c6…56d60
 *       +404 chars: frAnchorSlug appended to DOCS_FR_SOURCE. Still inert.
 *   t4             64177 chars / 64223 bytes  2e27d071…9618d
 *       +1516 chars: placeFunctionalRequirements appended. Still inert — t5
 *       is what calls it.
 *   t5             64385 chars / 64431 bytes  2501089e…ac1d0
 *       +208 chars: the ONE call that changes what a reviewer sees, plus the
 *       third level of notice precedence. No longer inert.
 *   CR fixes (this value) 64501 chars / 64547 bytes  351d6ce2…a2ee0
 *       +116 chars: ul/li list semantics and one shared frRequirementsOf,
 *       both from post-build code-review findings fixed rather than recorded.
 *   S003/t4 (+8383 chars, +8387 bytes): DOCS_DIAGRAM_SOURCE inlined after
 *       its three siblings — the ER derivation, the deterministic grid layout, the
 *       createElementNS/textContent SVG writer and sc4's slot factory. Still
 *       INERT: the functions are defined and nothing calls them, so the RENDERED
 *       surface is unchanged even though the shell is not. The figures above were
 *       COMPUTED from the emitted shell at this fixed nonce, not typed — an
 *       earlier Story pinned a hash captured at a DIFFERENT nonce and separately
 *       wrote a figure from memory, and both had to be corrected. The delta covers
 *       the source string AND the diagram's CSS fragment: SVG does not inherit a
 *       font colour, so an unstyled box paints black and hides its own labels.
 *   S003/t5 (+4602 chars, +4602 bytes): the call-sequence derivation and its
 *       renderer on t4's SVG primitives, plus the lifeline / message / note
 *       styles. Still INERT. Computed at the fixed nonce, never typed.
 *   S003/t6 (+1993 chars, +1995 bytes): the mount — dgFrame/dgMountSlot, the
 *       `insrc-docs-diagram` host, the slot-frame styles, and THE ONE CALL that
 *       changes what a reviewer sees. This is the task that DECLARES the change:
 *       everything t2-t5 added was inert, and reverting this call alone restores
 *       the S002 surface with the types, the data path and both derivations left
 *       in place.
 *   S003 post-build code review (+51 chars, +51 bytes): the anchor lookup moved
 *       off `querySelector('#'+slug)`, which THROWS on a digit-leading slug and
 *       therefore could never anchor on a numbered heading — the format every
 *       real insrc document uses.
 *   E2 S004/t3 (+172 chars, +172 bytes): the read-only branch of the decision
 *       controls. An artifact the delivery board opens that is not awaiting review
 *       arrives with readOnly, and the webview shows a 'read-only: not awaiting
 *       review' note in place of approve and request-changes.
 *   E202610138d4b90c9:S001/t9 (the shell REBUILT, not extended): the pane's own
 *       style replaces the terminal style, with every colour a VS Code theme
 *       variable and the --it-* tokens defined from them; the body becomes a
 *       column with the header and the comment panel outside one scrolling
 *       region; the list of buttons becomes a select; and the approve /
 *       request-changes controls become the comment panel's field, its three
 *       round buttons and its result line. The five source strings are inlined
 *       unchanged. The earlier arithmetic (a base pin plus each declared delta)
 *       ended here: a rebuilt shell has no base to add to, so the test that
 *       summed it now checks what still holds, that each source string is
 *       inlined verbatim and once.
 *   E202610138d4b90c9:S001/t10 (+3297 chars, +3303 bytes): one tab per document of the
 *       artifact in the header, and the view of an HTML document (its path, a
 *       line when it cannot be shown, and the host of its sandboxed frame).
 *   E202610138d4b90c9:S001/t11 (+17462 chars, +17470 bytes): DOCS_COMMENTS_SOURCE, the sixth source
 *       string (the text model of the rendered document, anchors and the inline
 *       drafts), its styles, the comment button a selection offers, and the line
 *       that counts the drafts.
 *   E202610138d4b90c9:S001/t12 (+8232 chars, +8238 bytes): the saved comments. The comment source
 *       gains the threads of saved comments, the margin markers and the strip; the
 *       shell gains the strip's markup above the comment panel and their styles.
 *   E202610138d4b90c9:S001/t14 hand check (+76 chars): no comment button is offered
 *       while no document is open (the pane then shows a notice, not a document).
 *   E202610131f74c81f:S001/t4 (+10042 chars): the list view. DOCS_LIST_SOURCE, the seventh source
 *       string (the table with search, type filter and paging, and which view is on
 *       show); the list view's markup and styles; a back button and the title in the
 *       header in place of the select of documents.
 *   E202610131f74c81f:S001/t5 (+283 chars): the reload in place. A content for the document
 *       already shown keeps the scroll position of the document region, and one marked
 *       changed with a different version says the document changed on disk.
 *   E202610138d4b90c9:S001 hand check (+224 chars): a diagram or mock that has its own tab is
 *       not also drawn inside the markdown.
 *
 * A task that legitimately changes the shell updates these constants in the same
 * commit and says why, as t2 does here. That is the point.
 * than a same-build repeatability check — the vacuous shape the plan critique
 * rejected, which compares render() to render() and passes no matter what the
 * shell says.
 *
 * A task that LEGITIMATELY changes the shell (t2 adds a source string, t5 adds a
 * call) updates these three constants in the same commit that changes it, and
 * says why. That is the point: it turns every shell change into a declared one.
 */
const SHELL_BASELINE = {
  nonce:  'FIXED-NONCE',
  chars:  134207,
  bytes:  134271,
  sha256: 'afe18712682504dea70e0e0030b1cfbeb96ce69db1baa36c59b9cca22977e81f',
} as const;

function renderShellFor(nonce: string): string {
  const fc = fakeChannel();
  const { client } = fakeClient();
  createDocsReviewHost({ createPanel: () => fc.channel, client, genNonce: () => nonce }).open();
  return fc.html();
}

test('t1: the emitted shell is byte-identical to the captured fixed-nonce baseline, and the bootstrap references functionalDefinition nowhere', async () => {
  const { createHash } = await import('node:crypto');
  const html = renderShellFor(SHELL_BASELINE.nonce);

  // THE baseline comparison. Any edit to renderShell, the bootstrap, the mdStyle
  // block or the inlined source strings moves this hash.
  assert.equal(
    createHash('sha256').update(html, 'utf8').digest('hex'),
    SHELL_BASELINE.sha256,
    'the emitted shell matches the current pin',
  );
  // Reported alongside the hash so a failure says HOW it moved, not just that it did.
  assert.equal(html.length, SHELL_BASELINE.chars, 'shell length in characters');
  assert.equal(Buffer.byteLength(html, 'utf8'), SHELL_BASELINE.bytes, 'shell length in UTF-8 bytes');

  // t1 is DATA-ONLY: the webview has no code that reads the new field yet, so
  // the name must not appear anywhere in the emitted script.
  // t1 was data-only and t2-t4 were inert. t5 DECLARES the change: the webview
  // now reads the posted record, at exactly one site — the placement call.
  assert.equal((html.match(/m\.functionalDefinition/g) ?? []).length, 1,
    'the posted record is read at exactly one site');
  assert.match(html, /placeFunctionalRequirements\(bodyEl,m\.functionalDefinition/,
    'and that site is the placement call');

  // The shell is a pure function of its nonce — the property the pin rests on.
  assert.equal(html, renderShellFor(SHELL_BASELINE.nonce));
  assert.notEqual(html, renderShellFor('OTHER-NONCE'), 'and the nonce really is in it');
});

// ---------------------------------------------------------------------------
// S002/t2 — the functional-requirements renderer, EXECUTED against a DOM stub
// rather than grepped for. The repo shipped a webview contract that string
// assertions pronounced green while the behaviour was wrong; S001 answered that
// by evaluating the source strings with `new Function`, and this extends it.
// ---------------------------------------------------------------------------

/** Eval DOCS_FR_SOURCE with a stub `document`, returning renderFunctionalRequirements. */
function loadFr(): (record: unknown) => { el: BodyStub; degradation?: unknown } {
  const doc = { createElement: (t: string) => bodyStub(t) };
  // eslint-disable-next-line no-new-func
  const make = new Function('document', `${DOCS_FR_SOURCE}; return renderFunctionalRequirements;`);
  return make(doc) as ReturnType<typeof loadFr>;
}

const frItems = (root: BodyStub): BodyStub[] => allOf(root).filter((n) => n.className === 'insrc-fr-item');
const frIds = (root: BodyStub): string[] =>
  allOf(root).filter((n) => n.className === 'insrc-fr-id').map((n) => n.textContent);
const frGroupLabels = (root: BodyStub): string[] =>
  allOf(root).filter((n) => n.className === 'insrc-fr-group-label').map((n) => n.textContent);

const REC = {
  requirements: [
    { id: 'E:FR001', statement: 'Doc-level one.', scope: 'doc', rationale: 'because one' },
    { id: 'E:FR002', statement: 'Doc-level two.', scope: 'doc' },
    { id: 'E:S002:FR001', statement: 'Item one for s2.', scope: 'item', itemRef: 's2' },
    { id: 'E:S003:FR001', statement: 'Item one for s3.', scope: 'item', itemRef: 's3' },
    { id: 'E:S002:FR002', statement: 'Item two for s2.', scope: 'item', itemRef: 's2' },
  ],
};

test('t2: one discrete element per requirement, every string via textContent, id + statement + rationale present, doc-level first then itemRef groups', () => {
  const { el } = loadFr()(REC);

  // DISCRETE ELEMENTS, counted — not a substring of the rendered text, which
  // would pass for a single blob containing all five statements.
  assert.equal(frItems(el).length, 5, 'one element per requirement');
  assert.deepEqual(frIds(el), ['E:FR001', 'E:FR002', 'E:S002:FR001', 'E:S002:FR002', 'E:S003:FR001'],
    'doc-level first in record order, then per-item grouped by itemRef');

  // Grouping is preserved, not flattened — the information the prose rendering
  // carries today and a flat list would silently drop.
  assert.deepEqual(frGroupLabels(el), ['s2', 's3'], 'groups in first-appearance order');
  assert.equal(frGroupLabels(el).length, 2, 'no group without members');

  // All three displayable fields survive, so the substitution is lossless against
  // the markdown form it replaces.
  const texts = allOf(el).map((n) => n.textContent);
  assert.ok(texts.includes('Doc-level one.'));
  assert.ok(texts.includes('because one'), 'the rationale is carried');
  assert.equal(allOf(el).filter((n) => n.className === 'insrc-fr-why').length, 1,
    'and only where the record has one');

  // EXECUTED, not grepped: every write that put a string on screen was textContent.
  const written = allOf(el).flatMap((n) => n.writes);
  assert.ok(written.length > 0, 'the stub recorded writes');
  assert.deepEqual([...new Set(written.map((w) => w.prop))].sort(), ['className', 'textContent'],
    'no markup-bearing property was ever assigned');
});

test('t2: hostile content — an id with * _ ` [ and a statement with <script> come back character-for-character identical and create no child element', () => {
  const HOSTILE_ID = 'E2026*_`[]:FR_001*';
  const HOSTILE_STMT = '<script>alert(1)</script> & <b>bold</b>';
  const { el } = loadFr()({
    requirements: [{ id: HOSTILE_ID, statement: HOSTILE_STMT, scope: 'doc' }],
  });

  // THE central falsifiable claim of this Story. The same id routed through the
  // markdown path (prose generation -> marked -> guardMd) can be reformatted;
  // this one cannot, because it is copied and never parsed.
  assert.deepEqual(frIds(el), [HOSTILE_ID], 'the identifier is byte-identical to the record value');
  const stmt = allOf(el).find((n) => n.className === 'insrc-fr-stmt');
  assert.ok(stmt);
  assert.equal(stmt!.textContent, HOSTILE_STMT, 'the statement is text, not markup');

  // The <script> became TEXT, not a node: one id span + one statement span only.
  assert.equal(frItems(el)[0]!.children.length, 2, 'no element was created from the markup');
  assert.equal(allOf(el).flatMap((n) => n.writes).filter((w) => w.prop !== 'className' && w.prop !== 'textContent').length, 0,
    'nothing was assigned through innerHTML/outerHTML');
});

test("t2: malformed record table — non-array requirements, non-object entry, non-string id/statement, scope:'item' with no itemRef, and two entries sharing one FrId", () => {
  const fr = loadFr();

  // All of these ARRIVE: validateFunctionalDefinition runs at assembly inside the
  // daemon and sc1 projects the body verbatim with no validation on the read path.
  for (const bad of [undefined, null, {}, { requirements: undefined }, { requirements: null },
    { requirements: 'nope' }, { requirements: {} }, { requirements: 42 }]) {
    const { el } = fr(bad);
    assert.equal(frItems(el).length, 0, `empty container for ${JSON.stringify(bad)}`);
  }

  // One bad entry never disqualifies its well-formed siblings.
  const { el } = fr({
    requirements: [
      { id: 'E:FR001', statement: 'Good.', scope: 'doc' },
      null, 'string', 42,
      { id: 7, statement: 'non-string id', scope: 'doc' },
      { id: 'E:FR002', statement: { not: 'a string' }, scope: 'doc' },
      { id: 'E:FR003', statement: 'Also good.', scope: 'doc' },
    ],
  });
  assert.deepEqual(frIds(el), ['E:FR001', 'E:FR003'], 'the renderable entries render; the rest are skipped');

  // ORPHAN itemRef -> the SAME literal key the prose renderer uses
  // (functional-definition.ts:99), so the two renderings of one record cannot
  // disagree about where an orphan belongs.
  const orphan = fr({
    requirements: [
      { id: 'E:S:FR001', statement: 'No itemRef.', scope: 'item' },
      { id: 'E:S:FR002', statement: 'Empty itemRef.', scope: 'item', itemRef: '' },
    ],
  });
  assert.deepEqual(frGroupLabels(orphan.el), ['(unassigned)'],
    'orphans bucket under the prose renderer’s own key, not an invented one');
  assert.equal(frItems(orphan.el).length, 2);

  // DUPLICATE ids: BOTH render, in record order, neither dropped nor merged.
  // Collapsing one would hide a real producer-side defect from the reviewer at
  // the approval gate — the one person positioned to catch it.
  const dup = fr({
    requirements: [
      { id: 'E:FR001', statement: 'First.', scope: 'doc' },
      { id: 'E:FR001', statement: 'Second, same id.', scope: 'doc' },
    ],
  });
  assert.deepEqual(frIds(dup.el), ['E:FR001', 'E:FR001'], 'a duplicate is shown, not silently collapsed');
  assert.deepEqual(
    allOf(dup.el).filter((n) => n.className === 'insrc-fr-stmt').map((n) => n.textContent),
    ['First.', 'Second, same id.'], 'and both statements survive, in record order');
});

test('t2 (contract): DOCS_FR_SOURCE contains no markup assignment (comments stripped first) and the shell\'s injection-site count is still exactly one', () => {
  // Comments stripped BEFORE scanning: a source scan that reads prose has
  // produced three false results in this repo already (/\bdocument\./ matching a
  // doc comment, /TextBlock:/ and /assembleShell/ matching narrative text).
  const code = DOCS_FR_SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  for (const banned of [/innerHTML/, /outerHTML/, /insertAdjacentHTML/, /document\.write/, /\.setAttribute\(/]) {
    assert.doesNotMatch(code, banned, `DOCS_FR_SOURCE assigns no markup (${banned})`);
  }
  assert.match(code, /textContent=/, 'and it does write text');

  const fc = fakeChannel();
  const { client } = fakeClient();
  createDocsReviewHost({ createPanel: () => fc.channel, client, genNonce: () => 'N' }).open();
  const html = fc.html();
  assert.equal((html.match(/\.innerHTML\s*=/g) ?? []).length, 1,
    'the shell still has exactly one markup-injection site after a third source string');
  assert.match(html, /el\.innerHTML=marked\.parse/, 'and it is still the guarded vendored parse');
  assert.match(html, /function renderFunctionalRequirements\(record\)/, 'DOCS_FR_SOURCE is inlined');
});

test('t2: the item CSS fragment references only --it-* variables', () => {
  const fc = fakeChannel();
  const { client } = fakeClient();
  createDocsReviewHost({ createPanel: () => fc.channel, client, genNonce: () => 'N' }).open();
  const html = fc.html();

  // Scoped to the `.insrc-fr*` rules: the whole document legitimately contains
  // other namespaces (chat's stylesheet is not here, but the mock markup and
  // prose are), so a whole-document assertion would be unsound.
  const rules = html.match(/\.insrc-fr[^{]*\{[^}]*\}/g) ?? [];
  assert.ok(rules.length >= 5, `found the item rules (got ${rules.length})`);
  for (const rule of rules) {
    for (const v of rule.match(/var\(--[a-z-]+\)/g) ?? []) {
      assert.match(v, /^var\(--it-/, `${rule} uses only --it-* (found ${v})`);
    }
  }
  // The specific names, so a typo'd variable is caught too — an undefined var()
  // inside a shorthand invalidates the whole declaration, silently.
  const known = ['--it-fg', '--it-bg', '--it-dim', '--it-accent', '--it-border', '--it-font', '--it-warn', '--it-err', '--it-sel', '--it-line', '--it-size'];
  for (const rule of rules) {
    for (const v of rule.match(/--it-[a-z-]+/g) ?? []) {
      assert.ok(known.includes(v), `${v} is a real token emitted by renderTerminalStyle`);
    }
  }
  // The degraded-path neutralisers, which t4 verifies visually.
  assert.match(rules.join(''), /white-space:normal/, 'inherited pre-wrap is neutralised');
  assert.match(rules.join(''), /word-break:normal/);
});

// ---------------------------------------------------------------------------
// S002/t3 — locating the document's own functional-requirements section in the
// POSTED index. This Story READS sc3's identity and mints none of its own, so
// the tests assert against the index deriveSectionIndex really produces.
// ---------------------------------------------------------------------------

/** Eval DOCS_FR_SOURCE and return frAnchorSlug. */
function loadFrAnchor(): (sections: unknown) => string | undefined {
  const doc = { createElement: (t: string) => bodyStub(t) };
  // eslint-disable-next-line no-new-func
  const make = new Function('document', `${DOCS_FR_SOURCE}; return frAnchorSlug;`);
  return make(doc) as ReturnType<typeof loadFrAnchor>;
}
const anchor = (title: string, slug: string, level = 2) => ({ title, slug, level });

test('t3: frAnchorSlug matches the numeric-prefixed title by tail, ignores case and whitespace, returns the first of two matches, and returns undefined for undefined/empty/renamed', () => {
  const fr = loadFrAnchor();

  // THE case that matters: the format engine strips the renderer's own heading
  // (bindings.ts:27 `raw.slice(2)`) so it can supply a numbered one, which is why
  // an equality match would never fire on a real document.
  assert.equal(
    fr({ anchors: [anchor('1. Problem', '1-problem'), anchor('2. Functional requirements', '2-functional-requirements')] }),
    '2-functional-requirements', 'tail-matches under the engine’s numeric prefix');
  // An unnumbered heading still matches — the tail is the stable part.
  assert.equal(fr({ anchors: [anchor('Functional requirements', 'functional-requirements')] }), 'functional-requirements');
  assert.equal(fr({ anchors: [anchor('  7. FUNCTIONAL REQUIREMENTS  ', 'x')] }), 'x', 'case and surrounding whitespace ignored');

  // FIRST in document order, so a document carrying two never yields an
  // ambiguous target. deriveSectionIndex keeps both (ordinal-disambiguated), so
  // this is reachable rather than theoretical.
  assert.equal(fr({ anchors: [anchor('2. Functional requirements', 'first'), anchor('9. Functional requirements', 'second')] }), 'first');

  // Every miss is `undefined`, which routes the caller to the FALLBACK placement
  // rather than to a wrong substitution. All of these are safe no-matches.
  assert.equal(fr({ anchors: [anchor('Outcomes', 'outcomes')] }), undefined, 'a renamed heading does not match');
  assert.equal(fr({ anchors: [anchor('Functional requirements overview', 'x')] }), undefined, 'a PREFIX is not a tail');
  assert.equal(fr(undefined), undefined);
  assert.equal(fr(null), undefined);
  assert.equal(fr({}), undefined);
  assert.equal(fr({ anchors: [] }), undefined);
  assert.equal(fr({ anchors: null }), undefined);
  // Malformed anchors are skipped, not thrown on, and do not mask a later match.
  assert.equal(fr({ anchors: [{ slug: 's' }, { title: null, slug: 't' }, anchor('Functional requirements', 'ok')] }), 'ok');
});

test('t3: a heading inside a fenced code block produces no anchor in the posted index and therefore no match', () => {
  // Driven through the REAL deriveSectionIndex, not a hand-built index — the
  // point is that this task adds NO second markdown scanner, so the fence
  // behaviour it relies on is sc3's and cannot drift from it.
  const md = [
    '# Doc', '', '```md', '## 2. Functional requirements', '```', '', '## Non-goals', '',
  ].join('\n');
  const index = deriveSectionIndex(md);
  assert.deepEqual(index.anchors.map((a) => a.title), ['Doc', 'Non-goals'],
    'the fenced heading never became an anchor');
  assert.equal(loadFrAnchor()(index), undefined, 'so there is nothing for frAnchorSlug to match');

  // And the positive control through the same path: a real heading does match,
  // and the slug returned is the one deriveSectionIndex minted.
  const real = deriveSectionIndex(['# Doc', '', '## 2. Functional requirements', '', '- a', '', '## Non-goals'].join('\n'));
  const slug = loadFrAnchor()(real);
  assert.equal(slug, '2-functional-requirements');
  assert.ok(real.anchors.some((a) => a.slug === slug), 'the slug is one sc3 produced, not one this task minted');
});

test('t3 (contract): docs-sections.ts is unchanged and still has zero imports', async (t) => {
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const { dirname, join, resolve } = await import('node:path');
  const here = dirname(fileURLToPath(import.meta.url));
  const file = join(here, '..', 'docs-sections.ts');

  // Zero imports: the module is pure by construction, which is what lets s3 and
  // s4 import it too without inheriting anything.
  const src = readFileSync(file, 'utf8');
  assert.equal((src.match(/^\s*import\s/gm) ?? []).length, 0, 'docs-sections.ts imports nothing');

  // UNCHANGED by this Story, not merely import-free: compare against the commit
  // that opened S002's build. This Story consumes section identity and never
  // edits its source — an edit here would be a scope breach onto s1's contract.
  const run = git(t, { commits: ['09e6efa'] }, resolve(here, '..', '..', '..', '..'));
  if (!run) return;
  const rel = 'vscode-plugin/src/chat/docs-sections.ts';
  const atBase = run('show', `09e6efa:${rel}`);
  assert.equal(src, atBase, 'docs-sections.ts is byte-identical to its pre-S002 state');
});

// ---------------------------------------------------------------------------
// S002/t4 — PLACEMENT. The only destructive operation in this Story, so the
// bound is PROVED rather than assumed: a removal that runs too far deletes
// document content the reviewer is about to approve.
// ---------------------------------------------------------------------------

/** Eval DOCS_FR_SOURCE and return placeFunctionalRequirements + the createElement count. */
function loadPlace(opts: { throwOnCall?: number | undefined; getElementById?: ((id: string) => BodyStub | undefined) | undefined } = {}) {
  const made: string[] = [];
  const doc = {
    // Present so a document-wide-lookup mutation can actually FIND something and
    // do damage, rather than throwing on a missing method.
    getElementById: (id: string) => opts.getElementById?.(id) ?? null,
    createElement(t: string) {
      made.push(t);
      if (opts.throwOnCall !== undefined && made.length === opts.throwOnCall) {
        throw new Error('construction blew up');
      }
      return bodyStub(t);
    },
  };
  // eslint-disable-next-line no-new-func
  const make = new Function('document', `${DOCS_FR_SOURCE}; return placeFunctionalRequirements;`);
  return {
    place: make(doc) as (b: unknown, r: unknown, s: unknown, d: boolean) =>
      { placed: string; degradation?: { degraded: boolean; notice: string } | undefined },
    made,
  };
}

/** A realistic rendered DEF body: the FR section sits between two others, and
 *  the last section carries an h3 so "the next heading of ANY level" is
 *  exercised by a deeper heading as well as a sibling-level one. */
function renderedBody(): { body: BodyStub; heading: BodyStub } {
  const body = bodyStub('div');
  const h1 = bodyStub('h1', 'doc', 'Doc');
  const p0 = bodyStub('p', '', 'intro');
  const hProblem = bodyStub('h2', '1-problem', '1. Problem');
  const pProblem = bodyStub('p', '', 'the problem');
  const hFr = bodyStub('h2', '2-functional-requirements', '2. Functional requirements');
  const ulFr = bodyStub('ul', '', '- **E:FR001** — prose form');
  const pFr = bodyStub('p', '', 'more prose in the FR section');
  const hNon = bodyStub('h2', '3-non-goals', '3. Non-goals');
  const ulNon = bodyStub('ul', '', 'non-goals');
  const hStories = bodyStub('h2', '4-stories', '4. Stories');
  const h3 = bodyStub('h3', '4-1-s001', '4.1 S001');
  const pEnd = bodyStub('p', '', 'end');
  for (const c of [h1, p0, hProblem, pProblem, hFr, ulFr, pFr, hNon, ulNon, hStories, h3, pEnd]) body.appendChild(c);
  return { body, heading: hFr };
}

const SECTIONS = {
  anchors: [
    { title: 'Doc', slug: 'doc', level: 1 },
    { title: '1. Problem', slug: '1-problem', level: 2 },
    { title: '2. Functional requirements', slug: '2-functional-requirements', level: 2 },
    { title: '3. Non-goals', slug: '3-non-goals', level: 2 },
    { title: '4. Stories', slug: '4-stories', level: 2 },
  ],
};

test('t4: all three placement outcomes asserted through the returned discriminator AND the resulting stub tree, including the degradation returned and withheld', () => {
  // NONE — the dominant path. Asserted as the ABSENCE OF DOM ACTIVITY: zero
  // createElement calls, not merely "no visible section". A gate that ran after
  // building would still pass a tree assertion while allocating.
  for (const absent of [undefined, null, { requirements: [] }, { requirements: 'nope' }, {}]) {
    const { place, made } = loadPlace();
    const { body } = renderedBody();
    const before = body.children.slice();
    const r = place(body, absent, SECTIONS, false);
    assert.equal(r.placed, 'none', `absent: ${JSON.stringify(absent)}`);
    assert.equal(made.length, 0, 'zero createElement calls — nothing was built');
    assert.deepEqual(body.children, before, 'and the body is untouched');
    assert.equal(r.degradation, undefined);
  }

  // A record whose every entry is malformed builds an EMPTY container, which is
  // treated exactly as absent rather than inserted as an empty box.
  {
    const { place } = loadPlace();
    const { body } = renderedBody();
    const before = body.children.slice();
    const r = place(body, { requirements: [null, 42, { id: 7 }] }, SECTIONS, false);
    assert.equal(r.placed, 'none', 'an all-malformed record places nothing');
    assert.deepEqual(body.children, before);
  }

  // IN-SECTION — the normal present case.
  {
    const { place } = loadPlace();
    const { body } = renderedBody();
    const r = place(body, REC, SECTIONS, false);
    assert.equal(r.placed, 'in-section');
    assert.equal(r.degradation, undefined, 'a successful substitution declares nothing');
  }

  // PREPENDED after a DEGRADED body: shown, because here it is the reviewer's
  // only legible access — but NO degradation, because s1's notice already covers
  // it and a second would stack two messages about one failure.
  {
    const { place } = loadPlace();
    const body = bodyStub('div');
    body.appendChild(bodyStub('#text', '', '# raw markdown source'));
    const r = place(body, REC, SECTIONS, true);
    assert.equal(r.placed, 'prepended');
    assert.equal(r.degradation, undefined, 'no second notice on an already-degraded body');
    assert.equal(body.children[0]!.tagName, 'ul', 'the block is the FIRST child, above the text');
  }

  // PREPENDED because the anchor does not resolve, on a body that rendered FINE.
  // This is the one case where silence would mislead: the reviewer could not
  // otherwise tell the block was displaced rather than designed that way.
  {
    const { place } = loadPlace();
    const { body } = renderedBody();
    const r = place(body, REC, { anchors: [{ title: 'Outcomes', slug: 'outcomes', level: 2 }] }, false);
    assert.equal(r.placed, 'prepended');
    assert.equal(r.degradation?.degraded, true);
    assert.match(r.degradation!.notice, /could not be located/);
  }
});

test('t4: bounded removal — an FR section followed by two further sections keeps both, and no heading element at any level is removed', () => {
  const { place } = loadPlace();
  const { body } = renderedBody();
  const headingsBefore = body.children.filter((c) => /^h[1-6]$/.test(c.tagName));
  assert.equal(headingsBefore.length, 6, 'h1 + four h2 + one h3');

  assert.equal(place(body, REC, SECTIONS, false).placed, 'in-section');

  // EVERY heading survives, at every level — this is what guarantees the section
  // chooser can never be left offering an entry whose target no longer exists.
  const headingsAfter = body.children.filter((c) => /^h[1-6]$/.test(c.tagName));
  assert.deepEqual(headingsAfter, headingsBefore, 'no heading element was removed, at any level');

  // The two sections AFTER the FR section keep their content.
  const texts = body.children.map((c) => c.textContent);
  assert.ok(texts.includes('non-goals'), 'the Non-goals content survives');
  assert.ok(texts.includes('end'), 'the Stories content survives');
  // And so does everything BEFORE it.
  assert.ok(texts.includes('intro'));
  assert.ok(texts.includes('the problem'));

  // Only the FR section's own prose is gone.
  assert.ok(!texts.includes('- **E:FR001** — prose form'), 'the generated bullet list is gone');
  assert.ok(!texts.includes('more prose in the FR section'), 'and so is the rest of that section');

  // The built container sits exactly where that prose was: after the FR heading,
  // before the next heading.
  const idx = body.children.findIndex((c) => c.id === '2-functional-requirements');
  assert.equal(body.children[idx + 1]!.tagName, 'ul', 'the container follows the heading');
  assert.equal(body.children[idx + 2]!.id, '3-non-goals', 'and the next heading follows it immediately');
});

test('t4: removal to end — an FR section that is the last section removes to the end of the container without throwing', () => {
  const { place } = loadPlace();
  const body = bodyStub('div');
  const h = bodyStub('h2', '2-functional-requirements', '2. Functional requirements');
  for (const c of [bodyStub('h1', 'doc', 'Doc'), h, bodyStub('ul', '', 'prose'), bodyStub('p', '', 'tail prose')]) {
    body.appendChild(c);
  }
  assert.equal(place(body, REC, SECTIONS, false).placed, 'in-section');

  assert.deepEqual(body.children.map((c) => c.tagName), ['h1', 'h2', 'ul'],
    'removed to the end and appended the container; no off-the-end read, no throw');
  assert.equal(body.children[1], h, 'the heading itself survives');
});

test('t4: heading preservation — the heading element, its text and its stamped id are identical before and after', () => {
  const { place } = loadPlace();
  const { body, heading } = renderedBody();
  const text = heading.textContent;
  const id = heading.id;

  place(body, REC, SECTIONS, false);

  // The SAME object, not an equal one: the chooser's jumpToSection resolves by
  // id against the live element, so identity is what keeps navigation working.
  assert.ok(body.children.includes(heading), 'the very same heading element is still in the body');
  assert.equal(heading.textContent, text, 'its text is unchanged');
  assert.equal(heading.id, id, 'and its stamped slug still resolves');
});

test('t4: build-before-mutate — a record that makes construction throw leaves the body completely unmodified', () => {
  // Force the throw mid-construction, AFTER the absent gate has passed and while
  // the container is being built. If any removal happened first, the body would
  // come back short.
  const { place } = loadPlace({ throwOnCall: 3 });
  const { body } = renderedBody();
  const before = body.children.slice();
  const texts = body.children.map((c) => c.textContent);

  assert.throws(() => place(body, REC, SECTIONS, false), /construction blew up/,
    'the throw propagates to the caller, whose try/catch is the backstop');

  // THE POINT: nothing was removed. This proves the ORDERING, not the catch —
  // t5's try/catch cannot un-delete a node.
  assert.deepEqual(body.children, before, 'the body is byte-for-byte the tree it was');
  assert.deepEqual(body.children.map((c) => c.textContent), texts);
});

test('t4: the slug lookup is scoped to the body container, so a same-id element elsewhere on the surface is never touched', () => {
  // Honest about what this proves, after the build gate pushed on it and the
  // push turned out to be half-right. The gate observed that the stub had no
  // getElementById, so a document-wide mutation would THROW rather than damage
  // the decoy. Adding one revealed something better: a document-wide lookup
  // STILL cannot damage anything, because a second, independent guard
  // (`start>=0`) only proceeds when the heading is a direct child of the body.
  //
  // So this test asserts the end-to-end safety property, and the frHeadingIn
  // assertion below asserts the SCOPING itself — the part a document-wide
  // lookup actually falsifies. Defence in depth, tested in two places, rather
  // than one assertion claiming to cover both.
  let decoyRef: BodyStub | undefined;
  const { place } = loadPlace({ getElementById: (id) => (id === '2-functional-requirements' ? decoyRef : undefined) });
  // A heading carrying the FR slug that lives OUTSIDE the body container, with
  // siblings that must never be deleted. A document-wide getElementById would
  // find it and start removing.
  const elsewhere = bodyStub('div');
  const decoy = bodyStub('h2', '2-functional-requirements', 'decoy heading');
  const decoySibling = bodyStub('p', '', 'must survive');
  elsewhere.appendChild(decoy);
  elsewhere.appendChild(decoySibling);
  decoyRef = decoy;

  // The body itself has NO such heading, so placement must fall back.
  const body = bodyStub('div');
  body.appendChild(bodyStub('h2', '1-problem', '1. Problem'));
  body.appendChild(bodyStub('p', '', 'body prose'));

  const r = place(body, REC, SECTIONS, false);

  assert.equal(r.placed, 'prepended', 'no heading in THIS container, so it falls back');
  assert.deepEqual(elsewhere.children, [decoy, decoySibling],
    'the decoy and its sibling are untouched — a document-wide lookup would have found the decoy and deleted its sibling');
  assert.equal(body.children[0]!.tagName, 'ul', 'and the block went to the top of the body');

  // THE SCOPING ITSELF, asserted directly: frHeadingIn must not see a heading
  // that lives outside the container it was handed, even when a document-wide
  // lookup would find one. This is the assertion a document-wide implementation
  // genuinely fails.
  // eslint-disable-next-line no-new-func
  const headingIn = new Function('document', `${DOCS_FR_SOURCE}; return frHeadingIn;`)({
    getElementById: (id: string) => (id === '2-functional-requirements' ? decoy : null),
    createElement: (t: string) => bodyStub(t),
  }) as (b: unknown, slug: string) => unknown;
  assert.equal(headingIn(body, '2-functional-requirements'), null,
    'the lookup is scoped to the container, not the document');
  assert.equal(headingIn(elsewhere, '2-functional-requirements'), decoy,
    'and it does find a heading that really is inside the container it was given');
});

// ---------------------------------------------------------------------------
// S002/t5 — the ONE call that changes what a reviewer sees, EXECUTED end to end.
// The bootstrap is lifted out of the real emitted shell and run against stubs,
// so these tests exercise the shipped script rather than a reconstruction of it.
// ---------------------------------------------------------------------------

interface WebviewRun {
  body: BodyStub;
  notice: BodyStub;
  sections: BodyStub;
  oq: BodyStub;
  posted: unknown[];
  diagram: BodyStub;
  experience: BodyStub;
  created: string[];
  deliver(payload: Record<string, unknown>): void;
  /** Any host message, by its type. */
  send(type: string, payload: Record<string, unknown>): void;
  /** The select of documents in the header. */
  list: BodyStub;
  /** The document's scrolling region. */
  scroll: BodyStub;
  /** The comment panel and the header's text. */
  bar: { approve: BodyStub; reject: BodyStub; feedback: BodyStub; field: BodyStub; result: BodyStub; state: BodyStub; kind: BodyStub; who: BodyStub };
  /** The comment button a selection offers, its own button, and the line that counts the drafts. */
  pop: BodyStub;
  popBtn: BodyStub;
  drafts: BodyStub;
  /** The strip of saved comments with no passage: the element, its summary line and its list. */
  hist: BodyStub;
  histSum: BodyStub;
  histList: BodyStub;
  /** Make a selection (or clear it with null) and let the script hear of it, as a mouse-up does. */
  select(range: { startContainer: BodyStub; startOffset: number; endContainer: BodyStub; endOffset: number } | null): void;
  /** The webview's saved state. */
  saved: { state: unknown };
  /** The list view: which view is on show, and its controls. */
  lv: {
    view(): 'list' | 'doc' | 'neither';
    q: BodyStub; suggest: BodyStub; kind: BodyStub; count: BodyStub; note: BodyStub;
    prev: BodyStub; next: BodyStub; page: BodyStub; back: BodyStub; title: BodyStub; rows: BodyStub;
  };
  /** The tabs in the header, and the two views of the scrolling region. */
  tabs: BodyStub;
  md: BodyStub;
  html: BodyStub;
  htmlPath: BodyStub;
  htmlNote: BodyStub;
  frameHost: BodyStub;
  /** How each decision button stands. */
  controls(): { approve: ControlMode; reject: ControlMode; feedback: ControlMode };
}
/** Evaluate the REAL bootstrap from the emitted shell against DOM stubs. */
function runWebview(opts: { markedMissing?: boolean | undefined; breakPlacement?: boolean | undefined; breakDiagram?: boolean | undefined; breakExperience?: boolean | undefined; countCreates?: boolean | undefined; saved?: { state: unknown } | undefined; textNodes?: boolean | undefined } = {}): WebviewRun {
  const fc = fakeChannel();
  const { client } = fakeClient();
  createDocsReviewHost({ createPanel: () => fc.channel, client, genNonce: () => 'WV' }).open();
  const html = fc.html();
  let script = html.slice(html.indexOf('<script nonce="WV">') + '<script nonce="WV">'.length, html.lastIndexOf('</script>'));
  // Drop the vendored marked bundle (a stub is injected as a global instead) but
  // keep the WHOLE bootstrap, which begins at acquireVsCodeApi — slicing further
  // in would drop `vs` and the element lookups the handlers close over.
  script = script.slice(script.indexOf('const vs=acquireVsCodeApi()'));
  if (opts.breakPlacement) {
    script = script.replace('function placeFunctionalRequirements(', 'function placeFunctionalRequirements(){throw new Error("placement blew up");}\nfunction _unused(');
  }
  // Force the slot build to throw, so the backstop is exercised against the REAL
  // bootstrap rather than against a reconstruction of it.
  if (opts.breakDiagram) {
    script = script.replace('function dgBuildDiagramSlot(', 'function dgBuildDiagramSlot(){throw new Error("slot build blew up");}\nfunction _unusedDg(');
  }
  // S004/t6 — the same lever for the experience slot, so its backstop is exercised
  // against the REAL bootstrap rather than a reconstruction of it.
  if (opts.breakExperience) {
    script = script.replace('function uxBuildMockSlot(', 'function uxBuildMockSlot(){throw new Error("ux slot build blew up");}\nfunction _unusedUx(');
  }

  const ids = ['insrc-docs-list', 'insrc-docs-body', 'insrc-docs-oq',
    'insrc-docs-sections', 'insrc-docs-notice', 'insrc-docs-diagram',
    'insrc-docs-experience',
    // The header and the comment panel of the rebuilt shell (E202610138d4b90c9:S001).
    'insrc-rv-kind', 'insrc-rv-state', 'insrc-rv-who', 'insrc-rv-field', 'insrc-rv-result',
    'insrc-rv-approve', 'insrc-rv-reject', 'insrc-rv-feedback',
    'insrc-rv-tabs', 'insrc-rv-md', 'insrc-rv-html', 'insrc-rv-html-path', 'insrc-rv-html-note', 'insrc-rv-frame',
    'insrc-rv-pop', 'insrc-rv-pop-btn', 'insrc-rv-drafts',
    'insrc-rv-hist', 'insrc-rv-hist-sum', 'insrc-rv-hist-list',
    // The two views and the list view's controls (E202610131f74c81f:S001).
    'insrc-rv-listview', 'insrc-rv-docview', 'insrc-rv-q', 'insrc-rv-suggest', 'insrc-rv-kindsel', 'insrc-rv-count',
    'insrc-rv-listnote', 'insrc-rv-prev', 'insrc-rv-next', 'insrc-rv-page', 'insrc-rv-back', 'insrc-rv-title',
    // The document's scrolling region.
    'insrc-rv-scroll'];
  const byId: Record<string, BodyStub> = {};
  for (const id of ids) byId[id] = bodyStub('div', id);
  byId['insrc-rv-field']!.value = '';
  byId['insrc-rv-q']!.value = '';
  // The stub's innerHTML makes elements that hold their text but no text NODE, where a
  // real page has one. The inline comments work on text nodes, so a test of them asks
  // for each rendered block to be given its text as a node, as the real DOM has it.
  if (opts.textNodes) {
    const body = byId['insrc-docs-body']!;
    const own = Object.getOwnPropertyDescriptor(body, 'innerHTML')!;
    Object.defineProperty(body, 'innerHTML', {
      configurable: true,
      get: () => own.get!.call(body) as string,
      set: (v: string) => {
        own.set!.call(body, v);
        for (const c of body.children) if (c.nodeType === 1 && c.children.length === 0 && c.textContent !== '') c.appendChild(textNode(c.textContent));
      },
    });
  }

  const posted: unknown[] = [];
  const created: string[] = [];
  let onMessage: ((e: { data: unknown }) => void) | undefined;
  // What the script reads as the page's selection, and the listeners it puts on the document.
  let selection: unknown = null;
  const docListeners: Record<string, Array<(e?: unknown) => void>> = {};
  // The webview's saved state: a test passes one store to two runs to rebuild the shell.
  const saved = opts.saved ?? { state: undefined };
  const doc = {
    addEventListener: (type: string, l: (e?: unknown) => void) => { (docListeners[type] ??= []).push(l); },
    createTextNode: (data: string) => textNode(data),
    getElementById: (id: string) => byId[id] ?? null,
    // The stub records listeners, so a test can fire a created control (a tab).
    createElement: (t: string) => {
      created.push(t);
      return bodyStub(t);
    },
    // Present so an SVG build inside the real bootstrap works, and so a test can
    // count what the slot path created — ac2 is proved by the ABSENCE of calls.
    createElementNS: (_ns: string, t: string) => {
      created.push(`ns:${t}`);
      const n = bodyStub(t) as BodyStub & { addEventListener(): void };
      n.addEventListener = () => {};
      return n;
    },
  };
  const win = {
    addEventListener: (_t: string, l: (e: { data: unknown }) => void) => { onMessage = l; },
    getSelection: () => selection,
  };
  // `undefined` here is the POINT of the degraded case, so it is selected by an
  // explicit flag rather than by passing undefined — which would fall through to
  // the default and silently test the happy path instead.
  //
  // The stub parse emits a `TAG\ttext` line per block and the body stub's
  // innerHTML setter builds real children from it, so the bootstrap gets an
  // element tree with HEADINGS — without which stampSlugs has nothing to stamp
  // and the ordering behaviour cannot be observed at all.
  const marked = opts.markedMissing ? undefined : {
    parse: (src: string) => src.split('\n').filter((l) => l.trim() !== '').map((l) => {
      const h = /^(#{1,6})\s+(.*)$/.exec(l);
      if (h) return `h${h[1]!.length}\t${h[2]}`;
      return `${l.startsWith('- ') ? 'ul' : 'p'}\t${l}`;
    }).join('\n'),
  };
  // eslint-disable-next-line no-new-func
  new Function('document', 'window', 'marked', 'acquireVsCodeApi', script)(
    doc, win, marked, () => ({
      postMessage: (m: unknown) => { posted.push(m); },
      getState: () => saved.state,
      setState: (v: unknown) => { saved.state = JSON.parse(JSON.stringify(v)); },
    }),
  );

  return {
    body: byId['insrc-docs-body']!, notice: byId['insrc-docs-notice']!,
    sections: byId['insrc-docs-sections']!,
    oq: byId['insrc-docs-oq']!, posted,
    diagram: byId['insrc-docs-diagram']!, experience: byId['insrc-docs-experience']!, created,
    deliver: (payload) => onMessage?.({ data: { v: 1, payload: { type: 'docs-content', ...payload } } }),
    send: (type, payload) => onMessage?.({ data: { v: 1, payload: { type, ...payload } } }),
    list: byId['insrc-docs-list']!,
    scroll: byId['insrc-rv-scroll']!,
    bar: {
      approve: byId['insrc-rv-approve']!, reject: byId['insrc-rv-reject']!, feedback: byId['insrc-rv-feedback']!,
      field: byId['insrc-rv-field']!, result: byId['insrc-rv-result']!,
      state: byId['insrc-rv-state']!, kind: byId['insrc-rv-kind']!, who: byId['insrc-rv-who']!,
    },
    pop: byId['insrc-rv-pop']!, popBtn: byId['insrc-rv-pop-btn']!, drafts: byId['insrc-rv-drafts']!,
    hist: byId['insrc-rv-hist']!, histSum: byId['insrc-rv-hist-sum']!, histList: byId['insrc-rv-hist-list']!,
    select: (range) => {
      selection = range === null ? null : { isCollapsed: false, rangeCount: 1, getRangeAt: () => range, removeAllRanges: () => { selection = null; } };
      for (const l of docListeners['mouseup'] ?? []) l({ target: byId['insrc-docs-body'] });
    },
    saved,
    lv: {
      view: () => (byId['insrc-rv-docview']!.style['display'] === 'flex' ? 'doc' : byId['insrc-rv-listview']!.style['display'] === 'flex' ? 'list' : 'neither'),
      q: byId['insrc-rv-q']!, suggest: byId['insrc-rv-suggest']!, kind: byId['insrc-rv-kindsel']!, count: byId['insrc-rv-count']!,
      note: byId['insrc-rv-listnote']!, prev: byId['insrc-rv-prev']!, next: byId['insrc-rv-next']!, page: byId['insrc-rv-page']!,
      back: byId['insrc-rv-back']!, title: byId['insrc-rv-title']!, rows: byId['insrc-docs-list']!,
    },
    tabs: byId['insrc-rv-tabs']!, md: byId['insrc-rv-md']!, html: byId['insrc-rv-html']!,
    htmlPath: byId['insrc-rv-html-path']!, htmlNote: byId['insrc-rv-html-note']!, frameHost: byId['insrc-rv-frame']!,
    controls: () => ({
      approve: controlMode(byId['insrc-rv-approve']!),
      reject: controlMode(byId['insrc-rv-reject']!),
      feedback: controlMode(byId['insrc-rv-feedback']!),
    }),
  };
}

/** How a decision button stands: usable, shown but disabled, or not shown. */
type ControlMode = 'on' | 'off' | 'hidden';
function controlMode(b: BodyStub): ControlMode {
  if (b.style['display'] === 'none') return 'hidden';
  return (b as unknown as { disabled?: boolean }).disabled === true ? 'off' : 'on';
}
const ALL_ON = { approve: 'on', reject: 'on', feedback: 'on' } as const;

test('t5: DOCS_FR_SOURCE is inlined into the single nonce\'d script and the placement call sits after stampSlugs and before the chooser / notice', () => {
  const fc = fakeChannel();
  const { client } = fakeClient();
  createDocsReviewHost({ createPanel: () => fc.channel, client, genNonce: () => 'N' }).open();
  const html = fc.html();

  // ONE script, carrying all three source strings.
  assert.equal((html.match(/<script /g) ?? []).length, 1, 'still exactly one script element');
  assert.match(html, /function renderFunctionalRequirements\(record\)/);
  assert.match(html, /function placeFunctionalRequirements\(/);

  // THE ORDERING, asserted by position in the emitted source. stampSlugs pairs
  // headings to anchors through a pointer that only advances, so a tree mutated
  // before it could mis-pair every later heading.
  const iStamp = html.indexOf('var stamped=stampSlugs(');
  const iPlace = html.indexOf('placeFunctionalRequirements(bodyEl,m.functionalDefinition');
  const iChooser = html.indexOf('renderSectionChooser(secEl,');
  const iNotice = html.indexOf('renderDegradationNotice(noticeEl,');
  assert.ok(iStamp > 0 && iPlace > 0 && iChooser > 0 && iNotice > 0, 'all four call sites are present');
  assert.ok(iStamp < iPlace, 'placement runs AFTER stampSlugs');
  assert.ok(iPlace < iChooser, 'and BEFORE the chooser');
  assert.ok(iPlace < iNotice, 'and BEFORE the notice');

  // The chooser's gate is untouched: placement adds and removes no heading, so
  // `stamped` means exactly what it meant in S001.
  assert.match(html, /stamped>0\?m\.sections:\{anchors:\[\]\}/);
});

test('t5: notice precedence — host-posted beats body beats placement, and exactly one notice is ever rendered', () => {
  const FR = { requirements: [{ id: 'E:FR001', statement: 'One.', scope: 'doc' }] };
  const noticeTexts = (w: WebviewRun) => w.notice.children.map((c) => c.textContent);

  // PLACEMENT degradation only: body renders fine, section unlocatable.
  {
    const w = runWebview();
    w.deliver({ artifactId: 'a', markdown: '# Doc', openQuestions: [], blocked: false, sections: { anchors: [] }, functionalDefinition: FR });
    assert.equal(w.notice.children.length, 1, 'exactly one notice');
    assert.match(noticeTexts(w)[0]!, /could not be located/, 'placement’s, since nothing else declared one');
  }
  // BODY degradation wins over placement's: marked missing -> the body renderer
  // falls back, and its notice is the one shown.
  {
    const w = runWebview({ markedMissing: true });
    w.deliver({ artifactId: 'a', markdown: '# Doc', openQuestions: [], blocked: false, sections: { anchors: [] }, functionalDefinition: FR });
    assert.equal(w.notice.children.length, 1, 'still exactly one notice — they do not stack');
    assert.equal(noticeTexts(w)[0], DEGRADE_NOTICE, 'the body renderer’s notice wins');
  }
  // HOST-POSTED wins over both.
  {
    const w = runWebview({ markedMissing: true });
    w.deliver({ artifactId: 'a', markdown: '# Doc', openQuestions: [], blocked: false, sections: { anchors: [] },
      degradation: { degraded: true, notice: SECTION_INDEX_NOTICE }, functionalDefinition: FR });
    assert.equal(w.notice.children.length, 1);
    assert.equal(noticeTexts(w)[0], SECTION_INDEX_NOTICE, 'the host-posted notice wins over both');
  }
  // RECORDED HONESTLY: the middle level of the precedence chain (the body
  // renderer's, ahead of placement's) is UNREACHABLE given t4's invariant —
  // placement returns a degradation only when the body rendered fine, so
  // `fr.degradation` and `r.degradation.degraded` are never both set. Removing
  // that branch is therefore a BENIGN mutation and these assertions do not catch
  // it; I ran it to find that out rather than assuming a falsifier existed. The
  // explicit three-level form is kept because it is the literal encoding of the
  // LLD's rule and stays correct if that invariant is ever relaxed. The invariant
  // itself is pinned by t4's "no degradation on an already-degraded body" check.

  // Nothing wrong -> NO notice at all.
  {
    const w = runWebview();
    w.deliver({ artifactId: 'a', markdown: '# Doc', openQuestions: [], blocked: false, sections: { anchors: [] } });
    assert.equal(w.notice.children.length, 0, 'no record, nothing degraded -> no notice');
  }
});

test('t5: the renderContent try/catch backstop — a forced throw inside placement still renders the chooser, notice, open questions and controls', () => {
  const w = runWebview({ breakPlacement: true });
  w.deliver({
    artifactId: 'LLD-abc-s7', markdown: '# Doc', openQuestions: ['why?'], blocked: false, commentable: true,
    sections: { anchors: [{ title: 'Doc', slug: 'doc', level: 1 }] },
    functionalDefinition: { requirements: [{ id: 'E:FR001', statement: 'One.', scope: 'doc' }] },
  });

  // ALL FOUR named surfaces, after the build gate pointed out that only two were
  // being proved. A backstop that silently cost the reviewer the chooser would
  // have passed the earlier version of this test.
  assert.equal(w.oq.children.length, 1, 'open questions still render');
  assert.deepEqual(w.controls(), ALL_ON, 'the three decision controls are still usable');
  assert.equal(w.sections.children.length, 1, 'the section CHOOSER still renders');
  assert.equal(w.sections.children[0]!.tagName, 'select');
  assert.equal(w.notice.children.length, 0,
    'and the NOTICE host is reached and left empty — a throw declares nothing, since the body rendered fine');
  // The body renderer ran and put the document there — the stub records the one
  // guarded innerHTML assignment, which is the shipped injection site.
  assert.ok(w.body.innerHTML.length > 0 || w.body.textContent.length > 0,
    'and the body is still rendered');
});

test('t5: opening a document with no record yields a body byte-identical to the S001 rendering of the same markdown', () => {
  const MD = '# Doc\n\n## 2. Functional requirements\n\n- **E:FR001** — prose form\n\n## Non-goals\n';
  const SECS = { anchors: [{ title: 'Doc', slug: 'doc', level: 1 }, { title: '2. Functional requirements', slug: '2-functional-requirements', level: 2 }] };

  // THE DOMINANT PATH — 630 of 634 ledger artifacts. Compared against the same
  // delivery with the field simply absent, which is what S001 did.
  const withNone = runWebview();
  withNone.deliver({ artifactId: 'a', markdown: MD, openQuestions: [], blocked: false, sections: SECS });
  const shape = (w: WebviewRun) => JSON.stringify(w.body.children.map((c) => [c.tagName, c.id, c.textContent]));
  const baseline = shape(withNone);

  const withUndefined = runWebview();
  withUndefined.deliver({ artifactId: 'a', markdown: MD, openQuestions: [], blocked: false, sections: SECS, functionalDefinition: undefined });
  assert.equal(shape(withUndefined), baseline, 'an undefined record renders identically to an absent one');

  const withEmpty = runWebview();
  withEmpty.deliver({ artifactId: 'a', markdown: MD, openQuestions: [], blocked: false, sections: SECS, functionalDefinition: { requirements: [] } });
  assert.equal(shape(withEmpty), baseline, 'and so does an empty one');

  assert.equal(withNone.notice.children.length, 0, 'and no notice is shown on the dominant path');
});

test('t5: idempotence — two consecutive docs-content messages with the same record leave exactly one container; a third with no record leaves none', () => {
  const FR = { requirements: [
    { id: 'E:FR001', statement: 'One.', scope: 'doc' },
    { id: 'E:FR002', statement: 'Two.', scope: 'doc' },
  ] };
  const msg = (fd?: unknown) => ({
    artifactId: 'a', markdown: '# Doc', openQuestions: [], blocked: false, sections: { anchors: [] },
    ...(fd !== undefined ? { functionalDefinition: fd } : {}),
  });
  const containers = (w: WebviewRun) => w.body.children.filter((c) => c.tagName === 'ul');
  const items = (w: WebviewRun) =>
    containers(w).flatMap((c) => c.children).length;

  const w = runWebview();
  w.deliver(msg(FR));
  const afterOne = containers(w).length;
  const itemsOne = items(w);
  assert.equal(afterOne, 1, 'one delivery -> one container');
  assert.equal(itemsOne, 2, 'carrying both requirements');

  // The pane really does post docs-content repeatedly in one session — open, the
  // boot ping, a withheld approve, a decision failure, a failed open (five sites
  // in docs-review-panel.ts). Silent duplication here would reintroduce exactly
  // the double-rendering this Story exists to remove.
  w.deliver(msg(FR));
  assert.equal(containers(w).length, 1, 'a second identical delivery still leaves ONE container');
  assert.equal(items(w), itemsOne, 'with the same item count — not doubled');

  // And the rebuild CLEARS a previously placed block rather than merely not
  // re-adding one: a third message with NO record leaves nothing behind.
  w.deliver(msg(undefined));
  assert.equal(containers(w).length, 0, 'the previously placed block is gone');
});

test('t5: approve and feedback reach the daemon, and the COMMENTABLE_KINDS gate and the blocked banner behave as before', async () => {
  // Host-side behaviour, through the real client doubles — unchanged by t5.
  const fc = fakeChannel();
  const { client, calls } = fakeClient();
  const host = createDocsReviewHost({ createPanel: () => fc.channel, client });
  host.open();
  await tick();
  fc.send(env('open-doc', { artifactId: 'LLD-abc-s7' }));
  await tick();
  fc.send(env('docs-decision', { artifactId: 'LLD-abc-s7', decision: 'approve', comments: [] }));
  await tick();
  assert.deepEqual(calls.decide, [{ path: DOC_PATH, decision: 'approve', comments: [] }], 'approve reaches the daemon');

  fc.send(env('docs-decision', { artifactId: 'LLD-abc-s7', decision: 'feedback', comments: [{ comment: 'please fix' }] }));
  await tick();
  assert.deepEqual(calls.decide.at(-1), { path: DOC_PATH, decision: 'feedback', comments: [{ comment: 'please fix' }] }, 'feedback records the comment');

  // Webview side: a blocked document cannot be approved; reject and feedback stay.
  const w = runWebview();
  w.deliver({ artifactId: 'a', markdown: 'unavailable: boom', openQuestions: [], blocked: true, commentable: true });
  assert.deepEqual(w.controls(), { approve: 'off', reject: 'on', feedback: 'on' });
  assert.equal(w.bar.state.textContent, 'pending review · blocked: it cannot be approved');
  // Every kind takes comments now: the kind no longer hides a control.
  const w2 = runWebview();
  w2.deliver({ artifactId: 'a', markdown: '# Doc', openQuestions: [], blocked: false, commentable: false });
  assert.deepEqual(w2.controls(), ALL_ON);
});

test('t5: ordering — stamp, place, then re-read every heading id proves no slug was disturbed', () => {
  // THE BEHAVIOURAL ordering test the plan named, which the first pass replaced
  // with a source-position scan (build-gate finding). A scan cannot see whether
  // the ORDER actually preserved the stamping; this drives the shipped bootstrap
  // and re-reads every heading id after placement has run.
  const MD = ['# Doc', '## 1. Problem', '- problem detail',
    '## 2. Functional requirements', '- **E:FR001** — prose form', '- **E:FR002** — more prose',
    '## 3. Non-goals', '- a non-goal'].join('\n');
  const sections = deriveSectionIndex(MD);
  const FR = { requirements: [
    { id: 'E:FR001', statement: 'One.', scope: 'doc' },
    { id: 'E:FR002', statement: 'Two.', scope: 'doc' },
  ] };

  const w = runWebview();
  w.deliver({ artifactId: 'a', markdown: MD, openQuestions: [], blocked: false, sections, functionalDefinition: FR });

  // EVERY heading still carries the slug deriveSectionIndex minted for it, in
  // document order. If placement had run before stampSlugs it would have removed
  // the nodes the stamper walks, and the pointer — which only advances — would
  // mis-pair every heading after the FR section.
  const headings = w.body.children.filter((c) => /^h[1-6]$/.test(c.tagName));
  assert.deepEqual(headings.map((h) => h.textContent), sections.anchors.map((a) => a.title),
    'all four headings survive, in document order');
  assert.deepEqual(headings.map((h) => h.id), sections.anchors.map((a) => a.slug),
    'and every one carries the slug sc3 minted for it');

  // The substitution really happened, in place, between its own heading and the
  // next one — so this is the ordered pipeline's real output, not a no-op.
  const i = w.body.children.findIndex((c) => c.id === '2-functional-requirements');
  assert.ok(i >= 0);
  assert.equal(w.body.children[i + 1]!.tagName, 'ul', 'the built container follows the FR heading');
  assert.equal(w.body.children[i + 2]!.id, '3-non-goals', 'and the next heading follows it immediately');
  assert.ok(!w.body.children.some((c) => c.textContent.includes('prose form')), 'the prose it replaced is gone');

  // And the chooser is driven by a stamped count that placement did not change.
  assert.equal(w.sections.children.length, 1, 'the chooser rendered');
  assert.equal(w.sections.children[0]!.children.length, sections.anchors.length + 1,
    'with one option per anchor plus the placeholder');
});

// ---------------------------------------------------------------------------
// Two LLD edge cases that had no test. Both were graded `partial` at the plan
// audit (cov1) with a note saying they should be folded into t2's set when it
// was built — and then were not. The post-build code review caught that, so they
// land here rather than being carried forward as a known gap.
// ---------------------------------------------------------------------------

test('ac3: the same record rendered twice yields identical identifiers — the cross-document guarantee', () => {
  // ac3 is "an upstream and a downstream document that both carry the same
  // requirement show it under the same identifier". It holds because the
  // renderer is a pure function of the record, and this asserts that directly
  // instead of leaving the Story's own acceptance criterion untested.
  //
  // The fixture is this Epic's REAL record, so the ids asserted are ids the
  // ledger actually contains rather than ones invented for the test.
  const REAL = { requirements: [
    { id: 'E20260929bfe98ff7:FR001', statement: 'A reviewer opening a generated workflow document in VS Code sees its functional requirements as discrete, individually identified outcomes rather than undifferentiated prose.', scope: 'doc' as const },
    { id: 'E20260929bfe98ff7:S002:FR001', statement: "A reviewer sees each of a document's functional requirements as a separate, individually readable item.", scope: 'item' as const, itemRef: 's2' },
  ] };

  const upstream = loadFr()(REAL);
  const downstream = loadFr()(REAL);

  // Both id FORMS, verbatim, with no prefix stripped, no ordinal renumbered and
  // no segment reformatted.
  assert.deepEqual(frIds(upstream.el), ['E20260929bfe98ff7:FR001', 'E20260929bfe98ff7:S002:FR001']);
  assert.deepEqual(frIds(downstream.el), frIds(upstream.el),
    'the same record yields the same identifiers in a second document');

  // Purity, which is WHY ac3 holds: same input, same output tree, every time.
  const shape = (n: BodyStub): unknown => [n.tagName, n.className, n.textContent, n.children.map(shape)];
  assert.deepEqual(shape(downstream.el), shape(upstream.el),
    'the rendering is a pure function of the record');

  // And a DIFFERENT record really does differ, so the equality above is not
  // trivially true of any two renders.
  const other = loadFr()({ requirements: [{ id: 'E20260929bfe98ff7:FR002', statement: 'Other.', scope: 'doc' }] });
  assert.notDeepEqual(frIds(other.el), frIds(upstream.el));
});

test('a very large record renders every requirement — no pagination, no virtualisation, no truncation', () => {
  // The LLD requires synchronous construction of one element per requirement,
  // because truncating would hide commitments from the reviewer at the approval
  // gate — the one thing this surface must not do. 500 is far beyond the 20 this
  // Epic's own DEF carries.
  const N = 500;
  const big = { requirements: Array.from({ length: N }, (_, i) => ({
    id: `E20260929bfe98ff7:FR${String(i + 1).padStart(3, '0')}`,
    statement: `Requirement number ${i + 1}.`,
    scope: (i % 3 === 0 ? 'item' : 'doc') as 'doc' | 'item',
    ...(i % 3 === 0 ? { itemRef: `s${(i % 4) + 1}` } : {}),
  })) };

  const { el } = loadFr()(big);
  assert.equal(frItems(el).length, N, 'every requirement is rendered');
  assert.equal(frIds(el).length, N, 'and every identifier with it');
  // First and last survive — a truncating implementation typically keeps one end.
  assert.ok(frIds(el).includes('E20260929bfe98ff7:FR001'));
  assert.ok(frIds(el).includes(`E20260929bfe98ff7:FR${N}`));
  assert.equal(new Set(frIds(el)).size, N, 'no identifier was dropped or collapsed');
});

test('the functional-requirement items carry LIST semantics, not just visual separation', () => {
  // The prose form this replaces is a markdown <ul>, so assistive technology
  // announces "list, N items". Rendering divs would have made the structured
  // form look better and navigate WORSE than the prose it replaces — on a Story
  // whose user value names a non-technical reviewer explicitly.
  // (post-build code-review ux finding, fixed rather than recorded)
  const { el } = loadFr()(REC);
  assert.equal(el.tagName, 'ul', 'the container is a list');
  for (const item of frItems(el)) {
    assert.equal(item.tagName, 'li', 'and every requirement is a list item');
  }
  // The per-story grouping is programmatic too: a group is an li carrying a
  // label and a NESTED list, so the structure a screen reader reports matches
  // the structure the record carries.
  const groups = allOf(el).filter((n) => n.className === 'insrc-fr-group');
  assert.equal(groups.length, 2);
  for (const g of groups) {
    assert.equal(g.tagName, 'li');
    assert.ok(g.children.some((c) => c.tagName === 'ul'), 'the group nests its own list');
  }
  // Direct children of the outer list are only ever list items — no stray divs,
  // which would be invalid inside a <ul> and would break the announced count.
  assert.deepEqual([...new Set(el.children.map((c) => c.tagName))], ['li']);
});

// ---------------------------------------------------------------------------
// S003/t2 — the DIAGRAM records and the companion refs travel one hop further,
// onto the EXISTING docs-content message. Pure data movement: the webview has no
// code for them yet, so the rendered surface must be unchanged, which is what the
// SHELL_BASELINE pin above asserts for this commit.
//
// Both records travel because a companion ref cannot identify which one drew it —
// three daemon renderers all stamp kind:'diagram-mermaid' — so the webview will
// dispatch on the RECORD present (t4/t6), never on the ref's kind.
// ---------------------------------------------------------------------------

/** The real shape this Epic's own S002 LLD carries: a sequence record, NO
 *  erDefinition, and two companion refs (ux-mock + diagram-mermaid). Confirmed
 *  live over the daemon IPC in t1. */
const SEQ_RECORD = {
  id: 's2-render-order',
  participants: [{ id: 'host', label: 'openDoc (extension host)' }, { id: 'webview', label: 'renderContent (webview)' }],
  messages: [{ from: 'host', to: 'webview', label: 'docs-content' }],
};
const ER_RECORD = { classes: { Artifact: { attributes: { id: { range: 'string', identifier: true } } } } };
const COMPANIONS = [
  { kind: 'ux-mock', relPath: 'docs/epics/x/S002/ux-mock.html', title: 'UX mock' },
  { kind: 'diagram-mermaid', relPath: 'docs/epics/x/S002/sequence-diagram.html', title: 'Sequence diagram' },
];

test('t2: all three records are forwarded by REFERENCE on the existing docs-content message', async () => {
  const payload = await openWithContent({
    markdown: '# Doc', openQuestions: [], blocked: false,
    erDefinition: ER_RECORD, sequenceDefinition: SEQ_RECORD, companions: COMPANIONS,
  });

  // Reference identity, not deep equality: a clone would deep-equal and still
  // prove the forward had rebuilt the record on the way through.
  assert.equal(payload['erDefinition'], ER_RECORD, 'erDefinition forwarded by reference');
  assert.equal(payload['sequenceDefinition'], SEQ_RECORD, 'sequenceDefinition forwarded by reference');
  assert.equal(payload['companions'], COMPANIONS, 'companions forwarded by reference');
  // Still ONE message of the SAME type — no new message type, no second post.
  assert.equal(payload['type'], 'docs-content');
});

test('t2: openDoc posts exactly ONE docs-content message per open — no second round trip', async () => {
  const fc = fakeChannel();
  const { client } = fakeClient({
    content: async () => ({
      markdown: '# Doc', openQuestions: [], blocked: false,
      erDefinition: ER_RECORD, sequenceDefinition: SEQ_RECORD, companions: COMPANIONS,
    }),
  });
  const host = createDocsReviewHost({ createPanel: () => fc.channel, client });
  host.open();
  await tick();
  fc.send(env('open-doc', { artifactId: 'LLD-abc-s7' }));
  await tick();

  const forThisDoc = fc.posted.filter(
    (p) => p.payload.type === 'docs-content' && p.payload.artifactId === 'LLD-abc-s7',
  );
  assert.equal(forThisDoc.length, 1, 'the records ride the existing message rather than prompting another');
});

test("t2: an absent record stays an ABSENT KEY ('erDefinition' in payload === false)", async () => {
  // The dominant case: only 2 of 634 ledger bodies carry an erDefinition and 3 a
  // sequenceDefinition, so almost every real open takes this path.
  const payload = await openWithContent({ markdown: '# Doc', openQuestions: [], blocked: false });

  for (const k of ['erDefinition', 'sequenceDefinition', 'companions'] as const) {
    // A `{ k: undefined }` spread would satisfy `=== undefined` while failing
    // this, which is why the key test is the one that matters.
    assert.equal(k in payload, false, `${k} must be an ABSENT KEY, not an undefined-valued one`);
    assert.equal(payload[k], undefined);
  }
  // Otherwise the message is exactly what it was before this task.
  assert.equal(payload['markdown'], '# Doc');
  assert.equal(payload['blocked'], false);
});

test('t2: a document carrying ONLY a sequence record leaves erDefinition absent — the real S002 shape', async () => {
  const payload = await openWithContent({
    markdown: '# Doc', openQuestions: [], blocked: false,
    sequenceDefinition: SEQ_RECORD, companions: COMPANIONS,
  });
  assert.equal(payload['sequenceDefinition'], SEQ_RECORD);
  assert.equal(payload['companions'], COMPANIONS);
  // A diagram-mermaid ref is present while the ER record is NOT — the exact
  // combination that made the amendment necessary, and the one the renderer must
  // resolve by dispatching on the record rather than on the ref's kind.
  assert.equal('erDefinition' in payload, false, 'nothing is backfilled for the record this document lacks');
  const kinds = (payload['companions'] as { kind: string }[]).map((c) => c.kind);
  assert.ok(kinds.includes('diagram-mermaid'), 'the ref whose source record is the sequence one');
});

test('t2: the fail-closed arm posts blocked:true and carries NONE of the three records', async () => {
  const fc = fakeChannel();
  const { client } = fakeClient({ content: () => { throw new Error('daemon unreachable'); } });
  const host = createDocsReviewHost({
    createPanel: () => fc.channel, client, logger: { warn: () => {}, error: () => {} },
  });
  host.open();
  await tick();
  fc.send(env('open-doc', { artifactId: 'LLD-abc-s7' }));
  await tick();
  const msg = fc.posted.filter((p) => p.payload.type === 'docs-content')
    .find((p) => p.payload.artifactId === 'LLD-abc-s7');
  assert.ok(msg, 'posted docs-content for the failed open');

  assert.equal(msg!.payload['blocked'], true, 'the fail-closed arm is unchanged');
  // The safety property that matters most on this surface: a reviewer who never
  // saw the body must never be shown an authoritative-looking DIAGRAM drawn from
  // it. Approve is already suppressed; the records must be absent too.
  for (const k of ['erDefinition', 'sequenceDefinition', 'companions'] as const) {
    assert.equal(k in msg!.payload, false, `a document the reviewer could not read carries no ${k}`);
  }
});

test('t2 (contract): protocol.ts indexes all three off DocsContent rather than restating them', async () => {
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const { dirname, join } = await import('node:path');
  const here = dirname(fileURLToPath(import.meta.url));
  const proto = readFileSync(join(here, '..', 'protocol.ts'), 'utf8');

  // Scoped to the docs-content variant, so a match elsewhere in a file that
  // declares many variants cannot satisfy this.
  const variant = proto.slice(proto.indexOf("readonly type: 'docs-content'"));
  const decl = variant.slice(0, variant.indexOf('\n    }'));

  for (const k of ['erDefinition', 'sequenceDefinition', 'companions']) {
    assert.ok(
      decl.includes(`readonly ${k}?: DocsContent['${k}'];`),
      `${k} must use the INDEXED form so protocol -> client -> daemon stay one declaration deep`,
    );
    // A hand-copied shape is the failure this guards: it compiles, looks right,
    // and silently decouples from the daemon's record.
    assert.doesNotMatch(decl, new RegExp(`${k}\\?:\\s*\\{`), `${k}'s shape is never restated inline`);
  }
});

// ---------------------------------------------------------------------------
// S003/t3 — sc4's contract, published by s3 and consumed by s3 + s4.
//
// These are CONTRACT tests. The properties that matter here are structural —
// "absent carries nothing", "the mapping is total", "linkOut is reachable in the
// failure state" — and a structural property is only worth asserting if its
// violation is detectable. So where a behavioural assertion cannot see the
// property, the test compiles a deliberately-wrong variant with tsc and requires
// it to FAIL, rather than asserting something that would pass either way.
// ---------------------------------------------------------------------------

/**
 * Typecheck a snippet against the REAL published types and return tsc's output.
 *
 * This exists because the plugin's tsconfig EXCLUDES `**``/__tests__/**`, so
 * `tsc --noEmit` never sees this file and any `@ts-expect-error` written here is
 * INERT — it would decorate a test without checking anything. A type-level
 * guarantee is only real if something executes the check, so the probe writes a
 * file next to the module (relative import resolves) and runs tsc over it. When
 * the compiler is not installed it skips the test and returns null.
 */
function typecheckAgainstPanel(t: Skipper, snippet: string): { ok: boolean; out: string } | null {
  const tsc = tscOrSkip(t);
  if (!tsc) return null;
  const probe = fileURLToPath(new URL(`../__sc4probe_${process.pid}_${Math.random().toString(36).slice(2)}__.ts`, import.meta.url));
  try {
    writeFileSync(probe, snippet);
    const r = spawnSync(
      process.execPath,
      [tsc, '--noEmit', '--strict', '--exactOptionalPropertyTypes',
       '--module', 'nodenext', '--moduleResolution', 'nodenext', '--target', 'es2022', probe],
      { encoding: 'utf8' },
    );
    const out = `${r.stdout}${r.stderr}`;
    // A probe that failed to START would also exit non-zero, which would make
    // "tsc rejected it" pass for the wrong reason. Rule that out explicitly.
    assert.doesNotMatch(out, /Cannot find module '.*typescript|MODULE_NOT_FOUND/, 'the probe itself must run');
    return { ok: r.status === 0, out };
  } finally {
    rmSync(probe, { force: true });
  }
}

test("t3: the 'absent' state carries NO member other than state — enforced by the TYPE, not just at runtime", (t) => {
  const absent: CompanionSlotState = { state: 'absent' };
  // Runtime shape: exactly one own key.
  assert.deepEqual(Object.keys(absent), ['state']);

  // The property that actually matters is that the TYPE forbids more, so a later
  // Story cannot reserve space for a companion that does not exist even by
  // accident. Reading any other member off the narrowed absent arm must be a
  // COMPILE error against the real published union.
  for (const member of ['label', 'body', 'linkOut', 'kind', 'reason']) {
    const probe = typecheckAgainstPanel(t, `
      import type { CompanionSlotState } from './docs-review-panel.js';
      export function probe(s: CompanionSlotState): unknown {
        if (s.state === 'absent') return s.${member};
        return undefined;
      }
    `);
    if (!probe) return;
    const { ok, out } = probe;
    assert.equal(ok, false, `reading '${member}' off the absent arm must NOT compile`);
    assert.match(out, /Property '.*' does not exist on type/, `and fail because '${member}' is absent from the arm`);
  }

  // The positive control: `state` itself IS readable, so the probe is capable of
  // passing and the failures above are about the members, not a broken probe.
  const control = typecheckAgainstPanel(t, `
    import type { CompanionSlotState } from './docs-review-panel.js';
    export function probe(s: CompanionSlotState): string { return s.state; }
  `);
  if (!control) return;
  assert.equal(control.ok, true, `the probe must accept valid code too — got: ${control.out}`);
});

test('t3: companionVisualKind maps the closed union TOTALLY — both diagram kinds to diagram, the mock to experience', () => {
  assert.equal(companionVisualKind('diagram-mermaid'), 'diagram');
  assert.equal(companionVisualKind('diagram-html'), 'diagram', 'the declared-but-unproduced kind is still labelled');
  assert.equal(companionVisualKind('ux-mock'), 'experience');

  // Totality over the union as the daemon declares it: every member of
  // CompanionRefKind is covered, enumerated from the type rather than from a
  // hand-kept list, so a kind added upstream shows up here.
  const every: Record<CompanionRefKind, CompanionVisualKind> = {
    'diagram-mermaid': 'diagram',
    'diagram-html': 'diagram',
    'ux-mock': 'experience',
  };
  for (const [k, expected] of Object.entries(every) as [CompanionRefKind, CompanionVisualKind][]) {
    assert.equal(companionVisualKind(k), expected, `${k} must map to ${expected}`);
  }
  assert.equal(Object.keys(every).length, 3, 'the union is three members wide');
});

test('t3: an unhandled companion kind is a COMPILE error, not an unlabelled slot', (t) => {
  // The exhaustiveness guarantee is invisible at runtime: a bare `default` would
  // pass every assertion above while silently swallowing a new kind. So compile a
  // copy of the mapping with one branch removed and require tsc to REJECT it.
  // Without this, "the mapping is total" is an unfalsifiable claim.
  const src = `
    type Kind = 'diagram-mermaid' | 'diagram-html' | 'ux-mock';
    type Visual = 'diagram' | 'experience';
    export function k(kind: Kind): Visual {
      switch (kind) {
        case 'diagram-mermaid':
        case 'diagram-html':
          return 'diagram';
        default: {
          const exhaustive: never = kind;   // 'ux-mock' is unhandled -> must error
          return exhaustive;
        }
      }
    }
  `;
  const dir = mkdtempSync(join(tmpdir(), 'insrc-sc4-exh-'));
  try {
    const file = join(dir, 'probe.ts');
    writeFileSync(file, src);
    // tsc lives at the REPO ROOT, not under vscode-plugin. Resolved relative to
    // this file so the probe does not depend on the cwd the suite was started
    // from — and checked to exist first, because a missing binary ALSO exits
    // non-zero and would make the "tsc rejected it" assertion pass for entirely
    // the wrong reason. (It did, on the first run; the message assertion below is
    // what caught it.) Missing, the test skips with that reason.
    const tsc = tscOrSkip(t);
    if (!tsc) return;

    const r = spawnSync(process.execPath, [tsc, '--noEmit', '--strict', file], { encoding: 'utf8' });
    const out = `${r.stdout}${r.stderr}`;
    assert.notEqual(r.status, 0, 'tsc must REJECT a mapping that leaves a union member unhandled');
    assert.match(
      out,
      /not assignable to type 'never'/,
      'and reject it precisely because the never witness cannot absorb the missing member',
    );
    // The probe really did compile the code we wrote, rather than failing to start.
    assert.doesNotMatch(out, /Cannot find module|MODULE_NOT_FOUND/, 'the failure is a type error, not a broken probe');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  // AND the SHIPPED function actually uses that pattern. The probe above compiles
  // a synthetic copy, so on its own it would stay green even if the real mapping
  // swapped its `never` witness for a bare `default` — which is precisely the
  // silent fall-through this Epic has already been bitten by once. Pin the real
  // declaration.
  {
    const src = readFileSync(new URL('../docs-review-panel.ts', import.meta.url), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    const start = src.indexOf('export function companionVisualKind');
    assert.notEqual(start, -1, 'the mapping is declared');
    const body = src.slice(start, src.indexOf('\n}', start));
    assert.match(body, /const exhaustive: never = kind;/,
      'the shipped mapping must carry the never witness, not a bare default');
    assert.doesNotMatch(body, /default:\s*\n?\s*return/,
      'a bare `default: return ...` would absorb a new kind silently');
  }
});

test("t3: linkOut is reachable on BOTH non-absent states — the failure state most of all", () => {
  const link = { relPath: 'docs/epics/x/S003/er.html', title: 'Entity model' };

  const rendered: CompanionSlotState = {
    state: 'rendered', kind: 'diagram', label: 'Entity model', body: {}, linkOut: link,
  };
  const unshowable: CompanionSlotState = {
    state: 'unshowable', kind: 'diagram', label: 'Sequence diagram',
    reason: 'its source record is not available to this surface', linkOut: link,
  };

  // Readable on both arms after narrowing — the widening over the HLD sketch,
  // which offered the link only on 'rendered'. A reviewer who cannot see the
  // diagram is exactly the reviewer who needs the authentic file.
  if (rendered.state === 'rendered') assert.equal(rendered.linkOut, link);
  if (unshowable.state === 'unshowable') assert.equal(unshowable.linkOut, link);

  // Optional on both, so a ref-less record still renders and a ref-less failure
  // is still expressible.
  const noLink: CompanionSlotState = { state: 'rendered', kind: 'diagram', label: 'Entity model', body: {} };
  assert.equal('linkOut' in noLink, false, 'absent rather than present-and-undefined');
});

test("t3: body is `unknown`, matching the shipped StructuredRenderer<T> return shape", () => {
  // A DOM stub is not an HTMLElement, and the renderers live in a source string
  // with no TypeScript boundary — so an HTMLElement bound here would be a type the
  // implementation could not honestly satisfy. Any of these must be assignable.
  const stub = { tagName: 'svg', children: [] as unknown[], textContent: '' };
  const slots: CompanionSlotState[] = [
    { state: 'rendered', kind: 'diagram', label: 'a', body: stub },
    { state: 'rendered', kind: 'diagram', label: 'b', body: 'a string is assignable to unknown' },
    { state: 'rendered', kind: 'experience', label: 'c', body: null },
  ];
  for (const s of slots) assert.equal(s.state, 'rendered');

  // Source-level: the declaration says `unknown`, and sc2's shipped renderer says
  // the same — one convention, not two. Comments stripped first, because a scan
  // that reads prose has produced false results in this repo before.
  const src = readFileSync(new URL('../docs-review-panel.ts', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  assert.match(src, /readonly body: unknown;/, "sc4's body is unknown");
  assert.match(src, /readonly el: unknown;/, "and sc2's shipped renderer already made this choice");
});

test('t3: sc4 is TYPE-ONLY so far — nothing on the surface consumes it yet', () => {
  // t3 lands the contract s4 depends on, ahead of and independently of any
  // diagram-specific decision. The slot is built in t4 and mounted in t6; if a
  // call site existed now, reverting the renderer would not restore the pane.
  const src = readFileSync(new URL('../docs-review-panel.ts', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  // The only runtime member sc4 publishes is the label derivation, and it is not
  // called from the panel yet.
  const calls = src.split('companionVisualKind(').length - 1;
  assert.equal(calls, 1, 'companionVisualKind is declared once and not yet called from the panel');
  assert.equal(src.includes('CompanionSlotFactory<'), true, 'the factory interface is declared');
  assert.match(src, /renderContent\(m\)/, 'renderContent is untouched by t3');
});

// ---------------------------------------------------------------------------
// S003/t4 — THE RENDERER SPINE. Derivation, SVG construction and the slot gate.
//
// The derivation is a SECOND implementation of rules the daemon already owns, in a
// source string that cannot import the daemon module. So the first test here pins
// both against SHARED fixtures with the DAEMON AS THE AUTHORITY — without it,
// "they agree" would be a comment rather than a property.
// ---------------------------------------------------------------------------

interface DgApi {
  dgDeriveEr(rec: unknown): { nodes: { id: string; attrs: { name: string; range: string; dangling: boolean }[] }[]; edges: { id: string; from: string; to: string; label: string; token: string }[] } | null;
  dgRenderEr(rec: unknown): { el: BodyStub } | null;
  dgBuildDiagramSlot(records: unknown, ref: unknown, anchorSlug: string | undefined): Record<string, unknown>;
  dgDeriveSeq(rec: unknown): { nodes: { id: string; label: string }[]; edges: { id: string; from: string; to: string; index: number; kind: string; label: string; note: string }[]; truncations: { at: string; note: string }[] } | null;
  dgRenderSeq(rec: unknown): { el: BodyStub } | null;
  dgCrowsFoot(slot: unknown): string;
  created: BodyStub[];
  createdHtml: string[];
}

/** Evaluate DOCS_DIAGRAM_SOURCE against a recording document stub. */
function loadDg(): DgApi {
  const created: BodyStub[] = [];
  const createdHtml: string[] = [];
  const doc = {
    createElementNS: (ns: string, t: string) => { const n = bodyStub(t, '', '', ns); created.push(n); return n; },
    // Present so a renderer reaching for the HTML factory is RECORDED rather than
    // crashing — an SVG renderer must never use it, and a test can prove it didn't.
    createElement: (t: string) => { createdHtml.push(t); return bodyStub(t); },
  };
  // eslint-disable-next-line no-new-func
  const make = new Function('document', `${DOCS_DIAGRAM_SOURCE}; return {dgDeriveEr:dgDeriveEr,dgRenderEr:dgRenderEr,dgBuildDiagramSlot:dgBuildDiagramSlot,dgCrowsFoot:dgCrowsFoot,dgDeriveSeq:dgDeriveSeq,dgRenderSeq:dgRenderSeq};`);
  const api = make(doc) as Omit<DgApi, 'created' | 'createdHtml'>;
  return { ...api, created, createdHtml };
}

/** Rebuild the DAEMON's node-label format from the client's derived attributes, so
 *  the attribute derivation is compared and not just the node ids. */
function dgDaemonStyleLabel(node: { id: string; attrs: { name: string; range: string }[] }): string {
  const parts = node.attrs.map((a) => (a.range.length > 0 ? `${a.name}: ${a.range}` : a.name));
  return parts.length > 0 ? `${node.id} (${parts.join(', ')})` : node.id;
}

test('t4 PARITY: the client derivation matches erDefinitionToIr over shared fixtures, with the daemon as the authority', async () => {
  // Both the fixtures AND the daemon derivation are imported here, so neither side
  // can be fed an input the other never saw and the expected values are produced by
  // the real daemon code rather than restated by hand.
  const { PARITY_FIXTURES } = await import('../../../../src/workflow/artifacts/companion/__tests__/fixtures/er-parity.js');
  const { erDefinitionToIr } = await import('../../../../src/workflow/artifacts/companion/er.js');
  const dg = loadDg();

  assert.ok(PARITY_FIXTURES.length >= 9, 'the shared fixture set covers the derivation rules');

  for (const fx of PARITY_FIXTURES) {
    const ir = erDefinitionToIr(fx.record);          // AUTHORITY
    const mine = dg.dgDeriveEr(fx.record);           // must match
    assert.ok(mine, `${fx.name}: the client derived a model`);

    // Node ids, in order. Both sides must sort classes or this comparison is
    // meaningless in the first place.
    assert.deepEqual(
      mine!.nodes.map((n) => n.id),
      ir.derived.nodes.map((n) => n.id),
      `${fx.name}: node set and order (${fx.why})`,
    );

    // Node LABELS, which is where the attribute-vs-edge split actually shows up:
    // a slot wrongly classified would move between the label and the edge set.
    assert.deepEqual(
      mine!.nodes.map(dgDaemonStyleLabel),
      ir.derived.nodes.map((n) => n.label),
      `${fx.name}: attribute derivation (${fx.why})`,
    );

    // Edge ids encode from, slot name, to AND the crow's-foot token, so comparing
    // the id set compares all four at once.
    assert.deepEqual(
      [...mine!.edges.map((e) => e.id)].sort(),
      [...ir.derived.edges.map((e) => e.id)].sort(),
      `${fx.name}: edge set incl. cardinality tokens (${fx.why})`,
    );
  }
});

test('t4: a class-ranged slot becomes an edge; scalar, rangeless and unknown-shaped slots become attributes', () => {
  const dg = loadDg();
  const m = dg.dgDeriveEr({
    classes: {
      Order: { attributes: { id: { range: 'string' }, bare: {}, placedBy: { range: 'Customer' } } },
      Customer: { attributes: { id: { range: 'string' } } },
    },
  })!;
  assert.deepEqual(m.edges.map((e) => e.id), ['Order.placedBy->Customer:zero-to-one']);
  const order = m.nodes.find((n) => n.id === 'Order')!;
  assert.deepEqual(order.attrs.map((a) => a.name), ['bare', 'id'], 'slots sorted, the relationship excluded');
  assert.equal(order.attrs.find((a) => a.name === 'bare')!.range, '', 'a rangeless slot keeps an empty range');
});

test('t4: a DANGLING range loses only its relationship — every box and every other edge still draw', async () => {
  const { DANGLING_FIXTURE } = await import('../../../../src/workflow/artifacts/companion/__tests__/fixtures/er-parity.js');
  const { erDefinitionToIr, ErDefinitionError } = await import('../../../../src/workflow/artifacts/companion/er.js');
  const dg = loadDg();

  // THE DAEMON TREATS THIS AS FATAL, which is the behaviour being diverged from —
  // asserted rather than assumed, so the divergence is pinned on both sides.
  assert.throws(() => erDefinitionToIr(DANGLING_FIXTURE), ErDefinitionError,
    'the daemon rejects a dangling range because it is generating an artifact');

  // The client does not: it shows the reviewer what it legibly can.
  const m = dg.dgDeriveEr(DANGLING_FIXTURE)!;
  assert.deepEqual(m.nodes.map((n) => n.id), ['Customer', 'Order'], 'every box still drawn');
  assert.deepEqual(m.edges.map((e) => e.id), ['Order.placedBy->Customer:zero-to-one'],
    'the resolvable edge survives and the dangling one is not invented');
  const order = m.nodes.find((n) => n.id === 'Order')!;
  const shipped = order.attrs.find((a) => a.name === 'shippedVia')!;
  assert.ok(shipped, 'the dangling slot is still listed, so the reviewer sees it exists');
  assert.equal(shipped.dangling, true, 'and is marked dangling rather than passed off as a normal scalar');
  // It renders, which is the whole point of diverging.
  assert.ok(dg.dgRenderEr(DANGLING_FIXTURE), 'the diagram draws despite the dangling reference');
});

test("t4: cardinality flags produce the daemon's crow's-foot token in every combination", async () => {
  const { crowsFootToken } = await import('../../../../src/workflow/artifacts/companion/er.js');
  const dg = loadDg();
  const slots = [
    {}, { required: true }, { multivalued: true }, { required: true, multivalued: true },
    { minimum_cardinality: 0 }, { minimum_cardinality: 1 }, { minimum_cardinality: 3 },
    { maximum_cardinality: 1 }, { maximum_cardinality: 2 },
    { required: true, minimum_cardinality: 0 },        // explicit min beats `required`
    { multivalued: true, maximum_cardinality: 1 },     // explicit max beats `multivalued`
  ];
  for (const slot of slots) {
    assert.equal(dg.dgCrowsFoot(slot), crowsFootToken(slot),
      `token must match the daemon for ${JSON.stringify(slot)}`);
  }
});

test('t4: a self-reference and a 3-cycle both terminate and draw — layout iterates the sorted class list', () => {
  const dg = loadDg();
  // If the layout walked edges to place nodes, either of these would not return.
  const selfRef = dg.dgRenderEr({ classes: { Node: { attributes: { parent: { range: 'Node' }, kids: { range: 'Node', multivalued: true } } } } });
  assert.ok(selfRef, 'a self-referencing model draws');
  const loop = dg.dgRenderEr({ classes: { A: { attributes: { b: { range: 'B' } } }, B: { attributes: { c: { range: 'C' } } }, C: { attributes: { a: { range: 'A' } } } } });
  assert.ok(loop, 'a cyclic model draws');

  // A self-edge is drawn as a visible loop rather than silently dropped or
  // collapsed to a zero-length line.
  const flat = allOf(selfRef!.el);
  const lines = flat.filter((n) => n.tag === 'line');
  const degenerate = lines.filter((l) => l.attrs['x1'] === l.attrs['x2'] && l.attrs['y1'] === l.attrs['y2']);
  assert.equal(degenerate.length, 0, 'no zero-length line stands in for a self-reference');
  assert.ok(lines.length >= 3, 'the self-reference is drawn as a multi-segment loop');
});

/** A drawn diagram as one line per element — namespace, tag, class, attributes, text — for the checks that it renders identically. */
const dgShape = (el: BodyStub): string =>
  allOf(el).map((n) => `${n.ns ?? '-'}|${n.tag}|${n.className}|${JSON.stringify(n.attrs)}|${n.textContent}`).join('\n');

test('t4: determinism — the same record renders an identical element tree every time', () => {
  const rec = { classes: { Order: { attributes: { id: { range: 'string' }, by: { range: 'Customer' } } }, Customer: { attributes: { id: { range: 'string' } } } } };
  const shape = (api: DgApi): string => dgShape(api.dgRenderEr(rec)!.el);
  // Two independent evaluations, so no cached state can make them agree.
  assert.equal(shape(loadDg()), shape(loadDg()), 'no randomness, no measurement-dependent reflow');
});

test('t4 ac4: every element is createElementNS in the SVG namespace and every label is textContent', () => {
  const dg = loadDg();
  const built = dg.dgRenderEr({
    classes: { Order: { attributes: { id: { range: 'string' }, by: { range: 'Customer' } } }, Customer: { attributes: { id: { range: 'string' } } } },
  })!;
  const flat = allOf(built.el);
  assert.ok(flat.length > 5, 'a non-trivial tree was built');

  // Namespace on EVERY node, and the HTML factory never touched.
  for (const n of flat) {
    assert.equal(n.ns, 'http://www.w3.org/2000/svg', `${n.tag} must be created in the SVG namespace`);
  }
  assert.deepEqual(dg.createdHtml, [], 'document.createElement was never called — this is an SVG renderer');

  // EXECUTED proof of "no markup": not one write to a markup-bearing property
  // anywhere in the tree, recorded by the stub rather than inferred from source.
  const markupWrites = flat.flatMap((n) => n.writes).filter((w) => w.prop === 'innerHTML' || w.prop === 'outerHTML');
  assert.deepEqual(markupWrites, [], 'no markup property was ever assigned');
  // And text really did arrive via textContent.
  const textWrites = flat.flatMap((n) => n.writes).filter((w) => w.prop === 'textContent');
  assert.ok(textWrites.length >= 4, 'labels are written through textContent');
});

test('t4 ac4: hostile class and slot names survive character-for-character and reach no attribute', () => {
  const dg = loadDg();
  const hostile = '<script>alert(1)</script>';
  const slot = 'a & b';
  const built = dg.dgRenderEr({ classes: { [hostile]: { attributes: { [slot]: { range: 'string' }, ref: { range: 'Plain' } } }, Plain: {} } })!;
  const flat = allOf(built.el);

  const texts = flat.map((n) => n.textContent);
  assert.ok(texts.includes(hostile), 'the class name is present verbatim as TEXT');
  assert.ok(texts.some((t) => t.includes(slot)), 'the slot name is present verbatim as TEXT');

  // SVG is XML, so an unescaped `<` in an attribute would be a parse hazard. No
  // attribute value anywhere may carry record text — this is the structural half of
  // ac4, and it is why geometry is the only thing setAttribute ever receives.
  for (const n of flat) {
    for (const [k, v] of Object.entries(n.attrs)) {
      assert.doesNotMatch(v, /script|&|</, `attribute ${k} must not carry record text (got ${v})`);
      assert.ok(!v.includes(hostile) && !v.includes(slot), `attribute ${k} must not carry a record name`);
    }
  }
});

test('t4 contract: DOCS_DIAGRAM_SOURCE assigns no markup, and the shell still has EXACTLY ONE innerHTML', () => {
  // Comments stripped FIRST. A scan that reads prose has produced false results in
  // this repo before, and this file's comments discuss innerHTML at length.
  const code = DOCS_DIAGRAM_SOURCE
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  for (const bad of ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write']) {
    assert.ok(!code.includes(bad), `DOCS_DIAGRAM_SOURCE must not contain ${bad}`);
  }
  // Positive control: the scan can see real content, so "no match" is not an
  // artefact of having stripped everything.
  assert.ok(code.includes('createElementNS'), 'the stripped source still contains its real code');

  // And the surface-wide invariant after a FOURTH source string joined the script.
  const html = renderShellFor('NONCE-X');
  const assignments = html.match(/\.innerHTML\s*=/g) ?? [];
  assert.equal(assignments.length, 1, 'exactly one markup-injection site on the whole surface');
  assert.match(html, /el\.innerHTML=marked\.parse\(/, 'and it is still the guarded vendored body parse');
  assert.ok(html.includes('dgRenderEr'), 'the fourth source string really is inlined into the shell');
});

test('t4 gate: the four-combination table, asserted through the discriminator AND what was built', () => {
  const dg = loadDg();
  const REC = { classes: { Order: { attributes: { id: { range: 'string' } } } } };
  const REF = { kind: 'diagram-mermaid', relPath: 'docs/epics/x/S003/er.html', title: 'Entity model' };

  // ref absent + record absent -> absent
  const a = dg.dgBuildDiagramSlot({}, undefined, undefined);
  assert.equal(a['state'], 'absent');
  assert.deepEqual(Object.keys(a), ['state'], 'the absent state carries nothing else');

  // ref present + record present -> rendered
  const b = dg.dgBuildDiagramSlot({ erDefinition: REC }, REF, undefined);
  assert.equal(b['state'], 'rendered');
  assert.equal(b['kind'], 'diagram');
  assert.ok(b['body'], 'a body was built');

  // ref present + record absent -> unshowable
  const c = dg.dgBuildDiagramSlot({}, REF, undefined);
  assert.equal(c['state'], 'unshowable');
  assert.match(String(c['reason']), /source record is not available/);

  // ref absent + record present -> RENDERED (the contested row, resolved at the
  // approval gate as record-gates-content: the design exists, so show it).
  const d = dg.dgBuildDiagramSlot({ erDefinition: REC }, undefined, undefined);
  assert.equal(d['state'], 'rendered', 'a record with no companion ref still draws');
  assert.equal('linkOut' in d, false, 'but offers no link, because there is no ref to link to');
});

test('t4 gate: absent does ZERO DOM work — no element is created at all', () => {
  const dg = loadDg();
  const before = dg.created.length;
  const slot = dg.dgBuildDiagramSlot({}, undefined, undefined);
  assert.equal(slot['state'], 'absent');
  // ac2 proved as the ABSENCE OF ACTIVITY rather than the absence of something
  // visible — the gate returns before construction, so there is nothing to clean up
  // and no space can be reserved. This is the dominant path.
  assert.equal(dg.created.length, before, 'not one createElementNS call');
  assert.deepEqual(dg.createdHtml, [], 'and not one createElement call either');

  // An empty record is absent too, matching the undefined-or-empty convention.
  for (const empty of [{ classes: {} }, { classes: null }, { classes: [] }, {}, null, 42, 'nope']) {
    assert.equal(dg.dgBuildDiagramSlot({ erDefinition: empty }, undefined, undefined)['state'], 'absent', `${JSON.stringify(empty)} is absent`);
  }
  assert.equal(dg.created.length, before, 'still nothing created for any malformed record');
});

test('t4 gate: a diagram ref with no drawable record is UNSHOWABLE and NAMES what was referenced', () => {
  const dg = loadDg();
  // The majority case today: 5 diagram refs against 2 erDefinitions, so most
  // diagram refs point at a record this factory cannot draw.
  const ref = { kind: 'diagram-mermaid', relPath: 'docs/epics/x/S002/sequence-diagram.html', title: 'Sequence diagram' };
  const slot = dg.dgBuildDiagramSlot({}, ref, undefined);
  assert.equal(slot['state'], 'unshowable');
  assert.equal(slot['label'], 'Sequence diagram', 'the label is the REF\'s title — named, not generic');
  assert.match(String(slot['reason']), /source record is not available to this surface/);
  // The link-out matters most precisely here.
  assert.deepEqual(slot['linkOut'], { relPath: ref.relPath, title: ref.title });
});

test('t4 gate: diagram-html routes to unshowable naming the kind (lc1), never a silent nothing', () => {
  const dg = loadDg();
  const ref = { kind: 'diagram-html', relPath: 'docs/epics/x/S003/thing.html', title: 'Some diagram' };
  // Declared in the companion union and produced by NOTHING today. Routing it
  // explicitly is what stops a future producer turning it on and getting silence.
  const slot = dg.dgBuildDiagramSlot({ erDefinition: { classes: { A: {} } } }, ref, undefined);
  assert.equal(slot['state'], 'unshowable', 'even with a record present');
  assert.match(String(slot['reason']), /diagram-html/, 'the reason names the kind');
  assert.ok(slot['linkOut'], 'and the authentic file is still reachable');
});

test('t4 gate: a ux-mock ref is not this factory\'s business — the experience slot stays s4\'s', () => {
  const dg = loadDg();
  const ux = [{ kind: 'ux-mock', relPath: 'docs/epics/x/S002/ux-mock.html', title: 'UX mock' }];
  // dgPickRef selects only diagram kinds, so a ux-mock-only document yields no ref
  // for this factory. With no record either, that must be ABSENT — not an
  // unshowable diagram invented from someone else's companion.
  const dgApi = new Function('document', `${DOCS_DIAGRAM_SOURCE}; return dgPickRef;`)({
    createElementNS: () => bodyStub('x', '', '', 'ns'), createElement: () => bodyStub('x'),
  }) as (c: unknown) => unknown;
  assert.equal(dgApi(ux), undefined, 'a ux-mock ref is not a diagram ref');
  assert.equal(dgApi([{ kind: 'diagram-mermaid', relPath: 'a', title: 'b' }])?.constructor, Object);
  assert.equal(dg.dgBuildDiagramSlot({}, undefined, undefined)['state'], 'absent');
});

test('t4 gate: linkOut is present on rendered AND unshowable whenever a ref exists, absent without one', () => {
  const dg = loadDg();
  const REC = { classes: { Order: { attributes: { id: { range: 'string' } } } } };
  const ref = { kind: 'diagram-mermaid', relPath: 'docs/x/er.html', title: 'Entity model' };

  const rendered = dg.dgBuildDiagramSlot({ erDefinition: REC }, ref, undefined);
  assert.deepEqual(rendered['linkOut'], { relPath: 'docs/x/er.html', title: 'Entity model' });
  const unshowable = dg.dgBuildDiagramSlot({}, ref, undefined);
  assert.deepEqual(unshowable['linkOut'], { relPath: 'docs/x/er.html', title: 'Entity model' });

  // No ref -> no link, as an ABSENT key rather than one holding undefined.
  const noRef = dg.dgBuildDiagramSlot({ erDefinition: REC }, undefined, undefined);
  assert.equal('linkOut' in noRef, false);
  // A ref with no usable path yields no link either, rather than an empty one.
  const badRef = dg.dgBuildDiagramSlot({ erDefinition: REC }, { kind: 'diagram-mermaid', title: 'x' }, undefined);
  assert.equal('linkOut' in badRef, false);
});

test('t4 layout: no row escapes its box, and no two boxes overlap — the defects the first visual read caught', async () => {
  // BOTH of these shipped in the first draft of this renderer and were invisible to
  // every assertion in this suite: relationship rows ran straight through the right
  // border of a fixed-width box, and edge captions were swallowed by boxes that
  // painted after them. A screenshot found them; these assertions keep them found.
  const dg = loadDg();
  const er = JSON.parse(
    readFileSync(new URL('../../../../.insrc/artifacts/HLD-bfe98ff7f97178cf.json', import.meta.url), 'utf8'),
  ).body.erDefinition;

  const built = dg.dgRenderEr(er)!;
  const groups = built.el.children.filter((g) => g.tag === 'g');
  const boxes: { x: number; y: number; w: number; h: number }[] = [];

  for (const g of groups) {
    const rect = g.children.find((c) => c.tag === 'rect');
    if (!rect) continue;                     // an edge group carries no box
    const bx = Number(rect.attrs['x']), by = Number(rect.attrs['y']);
    const bw = Number(rect.attrs['width']), bh = Number(rect.attrs['height']);
    boxes.push({ x: bx, y: by, w: bw, h: bh });

    for (const t of g.children.filter((c) => c.tag === 'text')) {
      // Monospace advance, taken slightly GENEROUS so the assertion fails before a
      // real glyph would cross the border rather than after.
      const perChar = (t.attrs['class'] ?? '').includes('insrc-dg-class') ? 8.4 : 6.75;
      const left = Number(t.attrs['x']);
      const right = left + t.textContent.length * perChar;
      assert.ok(left >= bx, `"${t.textContent}" starts left of its box`);
      assert.ok(right <= bx + bw, `"${t.textContent}" (${Math.round(right)}) escapes its box right edge (${bx + bw})`);
      assert.ok(Number(t.attrs['y']) >= by && Number(t.attrs['y']) <= by + bh, `"${t.textContent}" escapes vertically`);
    }
  }

  assert.equal(boxes.length, Object.keys(er.classes).length, 'one box per class in the real 8-class record');
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]!, b = boxes[j]!;
      const disjoint = a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
      assert.ok(disjoint, `boxes ${i} and ${j} overlap`);
    }
  }
});

test('t4 layout: a box grows to fit its longest row rather than clipping it', () => {
  const dg = loadDg();
  // The failing shape from the visual read: a relationship whose rendered row is far
  // wider than any sensible fixed width.
  const built = dg.dgRenderEr({
    classes: {
      A: { attributes: { aVeryLongRelationshipNameIndeed: { range: 'AnotherRatherLongClassName', multivalued: true } } },
      AnotherRatherLongClassName: { attributes: { x: { range: 'string' } } },
    },
  })!;
  const g = built.el.children.find((c) => c.tag === 'g' && c.children.some((k) => k.tag === 'rect'))!;
  const rect = g.children.find((c) => c.tag === 'rect')!;
  const row = g.children.find((c) => c.tag === 'text' && c.textContent.includes('→'))!;
  assert.ok(row, 'the relationship row is rendered');
  assert.ok(
    Number(rect.attrs['width']) >= row.textContent.length * 6.75,
    `the box (${rect.attrs['width']}) must be wide enough for its longest row (${row.textContent.length} chars)`,
  );
});

// ---------------------------------------------------------------------------
// S003/t5 — THE SEQUENCE DERIVATION, on t4's primitives.
//
// This is the half the amendment bought: 3 ledger bodies carry a
// sequenceDefinition against 2 carrying an erDefinition, and this Epic's own S002
// LLD is one of them. Its rules differ from the ER side in ways that matter —
// participants keep DECLARED order, and a message's identity is its INDEX.
// ---------------------------------------------------------------------------

/** The real ledger sequence record: the document that motivated the amendment. */
function realSeqRecord(): Record<string, unknown> {
  const body = JSON.parse(
    readFileSync(new URL('../../../../.insrc/artifacts/LLD-bfe98ff7f97178cf-s2.json', import.meta.url), 'utf8'),
  ).body;
  const sq = body.sequenceDefinition;
  assert.ok(sq && Array.isArray(sq.participants) && sq.participants.length > 0,
    'the committed S002 LLD must still carry a real sequenceDefinition');
  return sq;
}

test('t5 PARITY: the client sequence derivation matches sequenceDefinitionToIr, daemon as the authority', async () => {
  const { sequenceDefinitionToIr } = await import('../../../../src/workflow/artifacts/companion/sequence.js');
  const dg = loadDg();
  const rec = realSeqRecord();

  const ir = sequenceDefinitionToIr(rec as never);     // AUTHORITY
  const mine = dg.dgDeriveSeq(rec)!;
  assert.ok(mine, 'the client derived a model');

  // Participants in DECLARED order — sorting them would destroy the story the
  // diagram tells, which is the one difference from the ER rules that a shared
  // implementation would most easily get wrong.
  const irParticipants = ir.derived.nodes.filter((n) => n.kind === 'call-frame');
  assert.deepEqual(mine.nodes.map((n) => n.id), irParticipants.map((n) => n.id), 'declared order, not sorted');
  assert.deepEqual(mine.nodes.map((n) => n.label), irParticipants.map((n) => n.label), 'label falls back to id');

  // Message identity is the INDEX, so two identical calls between one pair stay
  // distinct — comparing the id set compares from, to, index and the repeat flag.
  assert.deepEqual(mine.edges.map((e) => e.id), ir.derived.edges.map((e) => e.id), 'edge ids incl. index and :repeat');
  assert.ok(mine.edges.length >= 10, 'the real record carries its full message list');
});

test('t5 PARITY: ordering, labels and the :repeat suffix over constructed shapes', async () => {
  const { sequenceDefinitionToIr } = await import('../../../../src/workflow/artifacts/companion/sequence.js');
  const dg = loadDg();
  const fixtures: Record<string, unknown>[] = [
    { participants: [{ id: 'a' }, { id: 'b' }], messages: [{ from: 'a', to: 'b', label: 'one' }, { from: 'b', to: 'a', label: 'two', kind: 'return' }] },
    // two IDENTICAL calls: only the index keeps them apart
    { participants: [{ id: 'a' }, { id: 'b' }], messages: [{ from: 'a', to: 'b', label: 'same' }, { from: 'a', to: 'b', label: 'same' }] },
    // a recurse carries the :repeat suffix
    { participants: [{ id: 'a' }], messages: [{ from: 'a', to: 'a', label: 'loop', kind: 'recurse' }] },
    // declared order is deliberately NOT alphabetical
    { participants: [{ id: 'zeta', label: 'Zeta' }, { id: 'alpha', label: 'Alpha' }], messages: [{ from: 'zeta', to: 'alpha', label: 'z->a' }] },
    // a participant with no label falls back to its id
    { participants: [{ id: 'bare' }, { id: 'x', label: '' }], messages: [] },
  ];
  for (const fx of fixtures) {
    const ir = sequenceDefinitionToIr(fx as never);
    const mine = dg.dgDeriveSeq(fx)!;
    assert.deepEqual(mine.nodes.map((n) => n.id), ir.derived.nodes.filter((n) => n.kind === 'call-frame').map((n) => n.id));
    assert.deepEqual(mine.nodes.map((n) => n.label), ir.derived.nodes.filter((n) => n.kind === 'call-frame').map((n) => n.label));
    assert.deepEqual(mine.edges.map((e) => e.id), ir.derived.edges.map((e) => e.id));
  }
});

test('t5: a message naming an undeclared participant is DROPPED, not fatal — the deliberate divergence', async () => {
  const { sequenceDefinitionToIr, SequenceDefinitionError } = await import('../../../../src/workflow/artifacts/companion/sequence.js');
  const dg = loadDg();
  const rec = {
    participants: [{ id: 'a' }, { id: 'b' }],
    messages: [
      { from: 'a', to: 'b', label: 'resolves' },
      { from: 'a', to: 'ghost', label: 'dangles' },
      { from: 'b', to: 'a', label: 'also resolves' },
    ],
  };
  // The daemon rejects it — asserted, so the divergence is pinned on both sides.
  assert.throws(() => sequenceDefinitionToIr(rec as never), SequenceDefinitionError);

  const mine = dg.dgDeriveSeq(rec)!;
  assert.deepEqual(mine.edges.map((e) => e.label), ['resolves', 'also resolves'],
    'the dangling message is dropped and the rest survive');
  // Index identity is preserved for the surviving messages, so the drop does not
  // silently renumber the conversation.
  assert.deepEqual(mine.edges.map((e) => e.index), [0, 2]);
  assert.ok(dg.dgRenderSeq(rec), 'and it still draws');
});

test('t5: every participant and every message from the REAL record is rendered, in order', () => {
  const dg = loadDg();
  const rec = realSeqRecord();
  const model = dg.dgDeriveSeq(rec)!;
  const built = dg.dgRenderSeq(rec)!;
  const flat = allOf(built.el);
  const texts = flat.map((n) => n.textContent);

  for (const p of model.nodes) {
    assert.ok(texts.includes(p.label), `participant "${p.label}" is drawn`);
  }
  // Message order is read back off the CONSTRUCTED TREE, not inferred from source
  // position — the numbering is what makes the order legible to a reviewer.
  const captions = flat.filter((n) => (n.attrs['class'] ?? '').includes('insrc-dg-msg')).map((n) => n.textContent);
  assert.equal(captions.length, model.edges.length, 'one caption per message');
  for (let i = 0; i < model.edges.length; i++) {
    assert.ok(captions[i]!.startsWith(`${i + 1}. `), `message ${i + 1} is numbered in order`);
    assert.ok(captions[i]!.includes(model.edges[i]!.label), 'and carries its own label');
  }
  // Notes are carried too rather than silently dropped.
  const noted = model.edges.filter((e) => e.note.length > 0);
  assert.ok(noted.length > 0, 'the real record carries notes');
  const noteTexts = flat.filter((n) => (n.attrs['class'] ?? '').includes('insrc-dg-note')).map((n) => n.textContent);
  for (const e of noted) assert.ok(noteTexts.includes(e.note), 'each note is rendered');
});

test('t5: the sequence renderer reuses t4 primitives — SVG namespace, textContent, no markup', () => {
  const dg = loadDg();
  const built = dg.dgRenderSeq(realSeqRecord())!;
  const flat = allOf(built.el);
  for (const n of flat) {
    assert.equal(n.ns, 'http://www.w3.org/2000/svg', `${n.tag} created in the SVG namespace`);
  }
  assert.deepEqual(dg.createdHtml, [], 'document.createElement never called');
  const markup = flat.flatMap((n) => n.writes).filter((w) => w.prop === 'innerHTML' || w.prop === 'outerHTML');
  assert.deepEqual(markup, [], 'no markup property assigned anywhere');
  // No record text reaches an attribute — same structural guarantee as the ER side.
  for (const n of flat) {
    for (const [k, v] of Object.entries(n.attrs)) {
      assert.doesNotMatch(v, /[<>&]/, `attribute ${k} carries no record text (got ${v})`);
    }
  }
});

test('t5: an empty or malformed sequence record is ABSENT and creates no element', () => {
  const dg = loadDg();
  const before = dg.created.length;
  for (const bad of [undefined, null, {}, { participants: [] }, { participants: 'nope' }, { participants: [{}] }, 42, 'x']) {
    assert.equal(dg.dgDeriveSeq(bad), null, `${JSON.stringify(bad)} derives nothing`);
    assert.equal(dg.dgBuildDiagramSlot({ sequenceDefinition: bad }, undefined, undefined)['state'], 'absent');
  }
  assert.equal(dg.created.length, before, 'not one element created for any of them');
});

test('t5: determinism — the same sequence record renders an identical tree every time', () => {
  const rec = realSeqRecord();
  const shape = (api: DgApi): string => dgShape(api.dgRenderSeq(rec)!.el);
  assert.equal(shape(loadDg()), shape(loadDg()));
});

test('t5: the factory dispatches on the RECORD present, never on the ref kind', () => {
  const dg = loadDg();
  const ER = { classes: { Order: { attributes: { id: { range: 'string' } } } } };
  const SEQ = realSeqRecord();
  // The same 'diagram-mermaid' ref accompanies all three — three daemon renderers
  // stamp that one kind, so the ref cannot possibly say which record drew it.
  const ref = { kind: 'diagram-mermaid', relPath: 'docs/x/d.html', title: 'Sequence diagram' };

  const seqSlot = dg.dgBuildDiagramSlot({ sequenceDefinition: SEQ }, ref, undefined);
  assert.equal(seqSlot['state'], 'rendered', 'a sequence record now DRAWS where it used to be unshowable');

  const erSlot = dg.dgBuildDiagramSlot({ erDefinition: ER }, ref, undefined);
  assert.equal(erSlot['state'], 'rendered');

  const neither = dg.dgBuildDiagramSlot({}, ref, undefined);
  assert.equal(neither['state'], 'unshowable', 'and the ref alone still cannot draw anything');

  // With both present the ER record wins deterministically rather than by
  // whichever key happened to be enumerated first.
  const both = dg.dgBuildDiagramSlot({ erDefinition: ER, sequenceDefinition: SEQ }, ref, undefined);
  assert.equal(both['state'], 'rendered');
  const flat = allOf(both['body'] as BodyStub);
  assert.ok(flat.some((n) => n.textContent === 'Order'), 'the entity model is the one drawn');
});

test('t5: a sequence record with no ref is labelled from the record, not left blank', () => {
  const dg = loadDg();
  const slot = dg.dgBuildDiagramSlot({ sequenceDefinition: realSeqRecord() }, undefined, undefined);
  assert.equal(slot['state'], 'rendered');
  assert.equal(slot['label'], 'Call sequence', 'a default derived from the kind, never invented per call');
  assert.equal('linkOut' in slot, false, 'and no link, because there is no ref');
});

test('t5 layout: no caption escapes the canvas and no two participant heads overlap', () => {
  const dg = loadDg();
  const built = dg.dgRenderSeq(realSeqRecord())!;
  const vb = built.el.attrs['viewBox'].split(' ').map(Number);
  const [, , width, height] = vb as [number, number, number, number];

  const heads = allOf(built.el).filter((n) => n.tag === 'rect');
  assert.ok(heads.length >= 2, 'participant heads are drawn');
  for (let i = 0; i < heads.length; i++) {
    for (let j = i + 1; j < heads.length; j++) {
      const a = heads[i]!, b = heads[j]!;
      const ax = Number(a.attrs['x']), aw = Number(a.attrs['width']);
      const bx = Number(b.attrs['x']), bw = Number(b.attrs['width']);
      assert.ok(ax + aw <= bx || bx + bw <= ax, `participant heads ${i} and ${j} overlap`);
    }
  }
  // Every caption fits inside the canvas — the ER renderer's clipping defect in the
  // other geometry.
  for (const t of allOf(built.el).filter((n) => n.tag === 'text')) {
    const cx = Number(t.attrs['x']);
    const half = (t.attrs['text-anchor'] === 'start' ? 0 : t.textContent.length * 6.75 / 2);
    assert.ok(cx - half >= -1, `"${t.textContent.slice(0, 30)}" escapes the left edge`);
    assert.ok(cx + (t.attrs['text-anchor'] === 'start' ? t.textContent.length * 6.75 : half) <= width + 1,
      `"${t.textContent.slice(0, 30)}" escapes the right edge`);
    assert.ok(Number(t.attrs['y']) <= height, 'and none escapes the bottom');
  }
});

// ---------------------------------------------------------------------------
// S003/t6 — THE MOUNT. The single call that changes what a reviewer sees.
//
// Driven through the SHIPPED bootstrap lifted out of the emitted shell, not a
// reconstruction of it: this repo shipped a webview contract that string
// assertions pronounced green while the behaviour was wrong.
// ---------------------------------------------------------------------------

const DG_MD = '# Low-level design\n\nIntro.\n\n## Data model changes\n\nBody.\n';
const DG_SECTIONS = deriveSectionIndex(DG_MD);
const DG_ER = { classes: { Order: { attributes: { id: { range: 'string' }, by: { range: 'Customer' } } }, Customer: { attributes: { id: { range: 'string' } } } } };
const DG_SEQ = { participants: [{ id: 'a', label: 'Host' }, { id: 'b', label: 'Webview' }], messages: [{ from: 'a', to: 'b', label: 'post' }] };
const DG_REF = { kind: 'diagram-mermaid', relPath: 'docs/epics/x/S003/er.html', title: 'Entity model' };

/** The EXPERIENCE slot, found by its kind modifier wherever it ended up — the host
 *  when unanchored, the BODY when it anchored beside a heading. Looking only in the
 *  host would miss exactly the anchored case these tests exist to cover. */
const uxSlotsIn = (r: WebviewRun): BodyStub[] =>
  [...allOf(r.experience), ...allOf(r.body)]
    .filter((n) => n.className === 'insrc-dg-slot insrc-dg-slot--experience');
/** The DIAGRAM slot keeps the bare class it has always had. Every host is searched,
 *  the experience host included, so a diagram slot mounted in the wrong host still
 *  counts against "exactly one" and "none". */
const dgSlotsIn = (r: WebviewRun): BodyStub[] =>
  [...allOf(r.diagram), ...allOf(r.experience), ...allOf(r.body)].filter((n) => n.className === 'insrc-dg-slot');

test('t6 gate: the four-combination table, driven through the SHIPPED bootstrap', () => {
  // ref absent + record absent -> nothing anywhere
  let r = runWebview();
  r.deliver({ artifactId: 'a', markdown: DG_MD, openQuestions: [], blocked: false, sections: DG_SECTIONS });
  assert.equal(dgSlotsIn(r).length, 0, 'no ref + no record -> no slot');

  // ref present + record present -> rendered
  r = runWebview();
  r.deliver({ artifactId: 'a', markdown: DG_MD, openQuestions: [], blocked: false, sections: DG_SECTIONS, erDefinition: DG_ER, companions: [DG_REF] });
  let slot = dgSlotsIn(r)[0];
  assert.ok(slot, 'ref + record -> a slot');
  assert.ok(allOf(slot!).some((n) => n.tagName === 'svg'), 'and it carries a drawn diagram');

  // ref present + record absent -> unshowable, NAMED
  r = runWebview();
  r.deliver({ artifactId: 'a', markdown: DG_MD, openQuestions: [], blocked: false, sections: DG_SECTIONS, companions: [DG_REF] });
  slot = dgSlotsIn(r)[0];
  assert.ok(slot, 'ref alone -> a slot');
  const why = allOf(slot!).find((n) => n.className === 'insrc-dg-slot-why')!;
  assert.match(why.textContent, /could not be shown here/);
  assert.match(why.textContent, /source record is not available/);
  assert.equal(allOf(slot!).some((n) => n.tagName === 'svg'), false, 'and nothing is drawn');

  // ref ABSENT + record present -> RENDERED (the contested row, q7f574776)
  r = runWebview();
  r.deliver({ artifactId: 'a', markdown: DG_MD, openQuestions: [], blocked: false, sections: DG_SECTIONS, erDefinition: DG_ER });
  slot = dgSlotsIn(r)[0];
  assert.ok(slot, 'a record with no companion ref still draws — record gates content');
  assert.ok(allOf(slot!).some((n) => n.tagName === 'svg'));
  assert.equal(allOf(slot!).some((n) => n.className === 'insrc-dg-slot-link'), false, 'and offers no link');
});

test('t6 ac2: the dominant path does ZERO DOM work and leaves the body region untouched', () => {
  // The positive control must be the ANCHORED case: an unanchored slot goes to the
  // dedicated host and leaves the body identical BY DESIGN, so comparing against it
  // would make the body assertion below unfalsifiable.
  const probe = runWebview();
  probe.deliver({ artifactId: 'a', markdown: DG_MD, openQuestions: [], blocked: false, sections: DG_SECTIONS });
  const anchorSlug = probe.body.children.filter((c) => c.tagName.startsWith('h')).map((c) => c.id)[1]!;
  const withSlot = runWebview();
  withSlot.deliver({
    artifactId: 'a', markdown: DG_MD, openQuestions: [], blocked: false, sections: DG_SECTIONS,
    erDefinition: DG_ER, companions: [DG_REF], diagramAnchorSlug: anchorSlug,
  });
  const bodyWithSlot = withSlot.body.children.map((c) => `${c.tagName}:${c.textContent}`);

  const bare = runWebview();
  const before = bare.created.length;
  bare.deliver({ artifactId: 'a', markdown: DG_MD, openQuestions: [], blocked: false, sections: DG_SECTIONS });

  // The slot path created nothing: no svg namespace call at all, and no slot div.
  assert.equal(bare.created.filter((t) => t.startsWith('ns:')).length, 0, 'not one createElementNS call');
  assert.equal(bare.diagram.children.length, 0, 'the slot host is empty');
  assert.equal(dgSlotsIn(bare).length, 0);
  assert.ok(bare.created.length > before, 'the rest of the surface still rendered');

  // And the BODY REGION is what it would be without this Story: the slot never
  // enters the body on the default path.
  const bodyBare = bare.body.children.map((c) => `${c.tagName}:${c.textContent}`);
  assert.deepEqual(bodyBare, ['h1:Low-level design', 'p:Intro.', 'h2:Data model changes', 'p:Body.']);
  assert.notDeepEqual(bodyWithSlot, bodyBare, 'the comparison is capable of telling them apart');
});

test("t6: `classes: {}` and an empty sequence record are ABSENT, not an empty frame", () => {
  for (const records of [
    { erDefinition: { classes: {} } },
    { sequenceDefinition: { participants: [], messages: [] } },
    { erDefinition: { classes: {} }, sequenceDefinition: { participants: [] } },
  ]) {
    const r = runWebview();
    r.deliver({ artifactId: 'a', markdown: DG_MD, openQuestions: [], blocked: false, sections: DG_SECTIONS, ...records });
    assert.equal(dgSlotsIn(r).length, 0, `${JSON.stringify(records)} must reserve no space`);
    assert.equal(r.created.filter((t) => t.startsWith('ns:')).length, 0);
  }
});

test('t6: diagram-html routes to the stated failure (lc1), never a silent nothing', () => {
  const r = runWebview();
  r.deliver({
    artifactId: 'a', markdown: DG_MD, openQuestions: [], blocked: false, sections: DG_SECTIONS,
    erDefinition: DG_ER,
    companions: [{ kind: 'diagram-html', relPath: 'docs/x/t.html', title: 'Some diagram' }],
  });
  const slot = dgSlotsIn(r)[0];
  assert.ok(slot, 'a declared-but-unproduced kind still produces a slot');
  assert.match(allOf(slot!).find((n) => n.className === 'insrc-dg-slot-why')!.textContent, /diagram-html/);
  assert.ok(allOf(slot!).some((n) => n.className === 'insrc-dg-slot-link'), 'the authentic file stays reachable');
});

test('t6: the link-out is offered in the FAILURE state, where it matters most', () => {
  const r = runWebview();
  r.deliver({
    artifactId: 'a', markdown: DG_MD, openQuestions: [], blocked: false, sections: DG_SECTIONS,
    companions: [{ kind: 'diagram-mermaid', relPath: 'docs/x/S002/sequence-diagram.html', title: 'Sequence diagram' }],
  });
  const slot = dgSlotsIn(r)[0]!;
  const link = allOf(slot).find((n) => n.className === 'insrc-dg-slot-link');
  assert.ok(link, 'a reviewer who cannot see the diagram is the one who most needs the file');
  assert.match(link!.textContent, /sequence-diagram\.html/);
});

test('t6: the slot build runs AFTER stampSlugs — every heading id is undisturbed', () => {
  const plain = runWebview();
  plain.deliver({ artifactId: 'a', markdown: DG_MD, openQuestions: [], blocked: false, sections: DG_SECTIONS });
  const idsBefore = plain.body.children.filter((c) => c.tagName.startsWith('h')).map((c) => c.id);

  const anchored = runWebview();
  anchored.deliver({
    artifactId: 'a', markdown: DG_MD, openQuestions: [], blocked: false, sections: DG_SECTIONS,
    erDefinition: DG_ER, companions: [DG_REF], diagramAnchorSlug: idsBefore[1],
  });
  // Re-READ every heading id after the mount inserted a node into the body: the
  // stamper pairs by title through a pointer that only advances, so mounting first
  // would mis-pair every later heading.
  const idsAfter = anchored.body.children.filter((c) => c.tagName.startsWith('h')).map((c) => c.id);
  assert.deepEqual(idsAfter, idsBefore, 'slugs are identical with the slot inserted');
  assert.ok(idsBefore.every((i) => i.length > 0), 'and they were really stamped');
});

test('t6 placement: a resolving anchor mounts beside that heading; a stale one falls back rather than dropping', () => {
  const probe = runWebview();
  probe.deliver({ artifactId: 'a', markdown: DG_MD, openQuestions: [], blocked: false, sections: DG_SECTIONS });
  const targetSlug = probe.body.children.filter((c) => c.tagName.startsWith('h')).map((c) => c.id)[1]!;

  // RESOLVES -> in the body, immediately after the heading it names.
  const anchored = runWebview();
  anchored.deliver({
    artifactId: 'a', markdown: DG_MD, openQuestions: [], blocked: false, sections: DG_SECTIONS,
    erDefinition: DG_ER, companions: [DG_REF], diagramAnchorSlug: targetSlug,
  });
  const idx = anchored.body.children.findIndex((c) => c.id === targetSlug);
  assert.ok(idx >= 0, 'the heading is present');
  assert.equal(anchored.body.children[idx + 1]!.className, 'insrc-dg-slot', 'the slot sits directly after it');
  assert.equal(anchored.diagram.children.length, 0, 'and not in the default host');

  // STALE -> the default host, still visible. 0 of 8 real refs carry ofSectionId,
  // so this is the path every real document takes today.
  const stale = runWebview();
  stale.deliver({
    artifactId: 'a', markdown: DG_MD, openQuestions: [], blocked: false, sections: DG_SECTIONS,
    erDefinition: DG_ER, companions: [DG_REF], diagramAnchorSlug: 'no-such-section',
  });
  assert.equal(dgSlotsIn(stale).length, 1, 'the visual is NOT dropped');
  assert.equal(stale.diagram.children.length, 1, 'it falls back to the default position');
});

test('t6 IDEMPOTENCE: two identical messages leave exactly ONE slot; a third carrying neither leaves none', () => {
  const r = runWebview();
  const msg = { artifactId: 'a', markdown: DG_MD, openQuestions: [], blocked: false, sections: DG_SECTIONS, erDefinition: DG_ER, companions: [DG_REF] };
  r.deliver(msg);
  const first = dgSlotsIn(r).length;
  r.deliver(msg);
  assert.equal(first, 1, 'one slot after the first message');
  assert.equal(dgSlotsIn(r).length, 1, 'still exactly one after the second — the host is cleared, not appended to');
  r.deliver({ artifactId: 'a', markdown: DG_MD, openQuestions: [], blocked: false, sections: DG_SECTIONS });
  assert.equal(dgSlotsIn(r).length, 0, 'and a message carrying neither clears it');

  // The same, ANCHORED into the body, where the body rebuild is what clears it.
  const probe = runWebview();
  probe.deliver({ artifactId: 'a', markdown: DG_MD, openQuestions: [], blocked: false, sections: DG_SECTIONS });
  const slug = probe.body.children.filter((c) => c.tagName.startsWith('h')).map((c) => c.id)[1]!;
  const a = runWebview();
  const anchoredMsg = { ...msg, diagramAnchorSlug: slug };
  a.deliver(anchoredMsg); a.deliver(anchoredMsg);
  assert.equal(dgSlotsIn(a).length, 1, 'one slot in the body after two identical renders');
});

test('t6 resilience: a forced throw in the slot build leaves all five other surfaces intact', () => {
  const r = runWebview({ breakDiagram: true });
  r.deliver({
    artifactId: 'LLD-x', markdown: DG_MD, openQuestions: ['Still open?'], blocked: false,
    commentable: true, sections: DG_SECTIONS, erDefinition: DG_ER, companions: [DG_REF],
  });
  // 1 body, 2 chooser, 3 notice (silent — nothing degraded), 4 open questions,
  // 5 BOTH controls. A failure in an adjunct costs the reviewer none of them.
  assert.ok(r.body.children.length >= 4, 'the body still rendered');
  assert.ok(r.sections.children.length > 0, 'the chooser still rendered');
  assert.equal(r.oq.children.length, 1, 'the open question still rendered');
  assert.deepEqual(r.controls(), ALL_ON, 'the decision controls are still usable');
  assert.equal(dgSlotsIn(r).length, 0, 'and no half-built slot was left behind');
});

test('t6 regression: the decision controls and the blocked state are the same with a diagram present', () => {
  // With a diagram present, so the regression is checked on the NEW path.
  const r = runWebview();
  const base = { markdown: DG_MD, openQuestions: [], sections: DG_SECTIONS, erDefinition: DG_ER, companions: [DG_REF] };

  r.deliver({ ...base, artifactId: 'LLD-x', blocked: false, commentable: true });
  assert.deepEqual(r.controls(), ALL_ON);

  r.deliver({ ...base, artifactId: 'LLD-x', blocked: false, commentable: false });
  assert.deepEqual(r.controls(), ALL_ON, 'every kind takes comments: the kind hides no control');

  r.deliver({ ...base, artifactId: 'LLD-x', blocked: true, commentable: true });
  assert.deepEqual(r.controls(), { approve: 'off', reject: 'on', feedback: 'on' }, 'approve stays suppressed');
  assert.match(r.bar.state.textContent, /blocked: it cannot be approved/);
});

test('t6 regression: the HOST decision path still reaches the daemon', async () => {
  // The webview harness makes addEventListener a no-op on created elements, so a
  // click cannot be driven through a button there. The host end is where the
  // behaviour actually lives, and it is exercised through the real client doubles.
  const fc = fakeChannel();
  const { client, calls } = fakeClient();
  createDocsReviewHost({ createPanel: () => fc.channel, client }).open();
  await tick();
  fc.send(env('open-doc', { artifactId: 'LLD-abc-s7' }));
  await tick();
  fc.send(env('docs-decision', { artifactId: 'LLD-abc-s7', decision: 'approve', comments: [] }));
  await tick();
  assert.deepEqual(calls.decide, [{ path: DOC_PATH, decision: 'approve', comments: [] }], 'approve reaches the daemon');
  fc.send(env('docs-decision', { artifactId: 'LLD-abc-s7', decision: 'feedback', comments: [{ comment: 'please fix' }] }));
  await tick();
  assert.deepEqual(calls.decide.at(-1), { path: DOC_PATH, decision: 'feedback', comments: [{ comment: 'please fix' }] }, 'feedback records the comment');
});

test('t6: the fail-closed arm shows the blocked banner and NO slot', () => {
  // openDoc already withholds the records on that arm; this proves the webview end
  // too — a reviewer who never saw the body is never shown a diagram drawn from it.
  const r = runWebview();
  r.deliver({ artifactId: 'LLD-x', markdown: 'unavailable: daemon unreachable', openQuestions: [], blocked: true, commentable: true });
  assert.equal(dgSlotsIn(r).length, 0);
  assert.equal(r.controls().approve, 'off', 'and it cannot be approved');
  assert.match(r.bar.state.textContent, /blocked: it cannot be approved/);
});

test('t6: DOCS_DIAGRAM_SOURCE is inlined in the single nonce\'d script and the call sits between stampSlugs and the chooser', () => {
  const fc = fakeChannel();
  const { client } = fakeClient();
  createDocsReviewHost({ createPanel: () => fc.channel, client, genNonce: () => 'N' }).open();
  const html = fc.html();

  assert.equal((html.match(/<script /g) ?? []).length, 1, 'still exactly ONE script element');
  assert.match(html, /function dgBuildDiagramSlot\(/);
  assert.match(html, /function dgMountSlot\(/);

  const stamp = html.indexOf('var stamped=stampSlugs(');
  const mount = html.indexOf('dgPlaced=dgMountSlot(');
  const chooser = html.indexOf('renderSectionChooser(secEl');
  assert.ok(stamp > 0 && mount > 0 && chooser > 0, 'all three call sites are present');
  assert.ok(stamp < mount, 'the mount runs AFTER stampSlugs');
  assert.ok(mount < chooser, 'and BEFORE the chooser');
});

test('t6: docs-sections.ts is BYTE-IDENTICAL — this Story mints no section identity', (t) => {
  // Compared against the commit BEFORE this Epic's S003 work began, so the claim is
  // about the whole Story and not just this task.
  const run = git(t, { commits: ['8908338'] });
  if (!run) return;
  const shipped = run('show', '8908338:vscode-plugin/src/chat/docs-sections.ts');
  const now = readFileSync(new URL('../docs-sections.ts', import.meta.url), 'utf8');
  assert.equal(now, shipped, 'sc3 is CONSUMED as shipped; the resolver is called, never reimplemented');
});

// ---------------------------------------------------------------------------
// S003/t7 — FULL-SURFACE VERIFICATION. t4, t5 and t6 each read their own render
// in isolation, so this pass CONFIRMS rather than discovers. What it adds is the
// combinations no single task owned, plus the standing guard that the committed
// evidence actually exists where the commit message says it does.
// ---------------------------------------------------------------------------

test('t7 (updated by S004/t6): a document carrying BOTH refs now shows TWO slots, diagram FIRST', () => {
  // S003 asserted the diagram slot ONLY here, and said so deliberately: it could not
  // observe both, so it left the arrangement to s4 rather than pre-empting it. s4 has
  // now decided, and this is that decision — the test is rewritten rather than
  // deleted, so the Epic's record shows the arrangement was chosen, not drifted into.
  const r = runWebview();
  r.deliver({
    artifactId: 'a', markdown: DG_MD, openQuestions: [], blocked: false, sections: DG_SECTIONS,
    erDefinition: DG_ER,
    uxDefinition: { type: 'AdaptiveCard', body: [{ type: 'TextBlock', text: 'the approval flow' }] },
    companions: [
      { kind: 'ux-mock', relPath: 'docs/epics/x/S002/ux-mock.html', title: 'UX mock' },
      DG_REF,
    ],
  });

  assert.equal(dgSlotsIn(r).length, 1, 'one diagram slot');
  assert.equal(uxSlotsIn(r).length, 1, 'and one experience slot');

  // EACH IS LABELLED FROM ITS OWN REF — ac2's whole substance. If either picker
  // matched the other's kind, both labels would read the same.
  const dgText = allOf(dgSlotsIn(r)[0]!).map((n) => n.textContent).join('\n');
  const uxText = allOf(uxSlotsIn(r)[0]!).map((n) => n.textContent).join('\n');
  assert.ok(dgText.includes('Entity model'), 'the diagram labelled from the diagram ref');
  assert.ok(uxText.includes('UX mock'), 'the mock labelled from the UX ref');
  assert.equal(uxText.includes('Entity model'), false, 'and neither borrows the other\u2019s label');
  assert.equal(dgText.includes('UX mock'), false);
  // Each links out to its OWN companion.
  assert.ok(uxText.includes('ux-mock.html'), 'the mock links to the ux companion');
  assert.equal(dgText.includes('ux-mock.html'), false, 'the diagram never links to it');
});

test('t7 (updated by S004/t6): a ux-mock ref ALONE now routes to the stated failure, not to nothing', () => {
  // S003 asserted this rendered NOTHING, and proved it with a sha256-identical
  // screenshot pair. That was true until the experience slot existed. It now routes
  // to 'unshowable', because a ref naming a mock this surface cannot draw must say
  // so — a silent omission is indistinguishable from a document with no mock.
  const r = runWebview();
  r.deliver({
    artifactId: 'a', markdown: DG_MD, openQuestions: [], blocked: false, sections: DG_SECTIONS,
    companions: [{ kind: 'ux-mock', relPath: 'docs/epics/x/S002/ux-mock.html', title: 'UX mock' }],
  });

  assert.equal(dgSlotsIn(r).length, 0, 'still NO diagram slot — s3 reads only diagram kinds');
  const ux = uxSlotsIn(r);
  assert.equal(ux.length, 1, 'and one experience slot, stating the failure');
  const text = allOf(ux[0]!).map((n) => n.textContent).join('\n');
  assert.match(text, /experience mock could not be shown here/,
    'the noun is the MOCK\u2019s, not the diagram\u2019s — one frame, two kinds');
  assert.match(text, /experience record is not available/, 'and the reason names what was referenced');
  assert.ok(text.includes('ux-mock.html'), 'with the link-out to the authentic companion');
});

test('t7: every committed evidence image exists at the path its commit claims', async () => {
  // S002 committed an evidence PNG to the WRONG path while the message claimed the
  // right one, and it had to be amended. This makes that class of error a test
  // failure rather than something a reader discovers later.
  const dir = fileURLToPath(new URL(
    '../../../../docs/epics/build-vs-code-plugin-ui-integration-E20260929bfe98ff7/S003/evidence/',
    import.meta.url,
  ));
  const expected = [
    't1-manual-live-check.md',
    't4-er-8class-rendered.png',
    't5-sequence-rendered.png',
    't6-slot-mounted-in-shell.png',
    't7-state-er-3class.png',
    't7-state-er-8class.png',
    't7-state-sequence.png',
    't7-state-unshowable.png',
    't7-state-absent.png',
    't7-state-cyclic-selfref.png',
    't7-state-dual-ref.png',
  ];
  const { statSync } = await import('node:fs');
  for (const name of expected) {
    const st = statSync(join(dir, name));
    assert.ok(st.isFile(), `${name} is a file`);
    assert.ok(st.size > 1000, `${name} is non-trivial (${st.size} bytes)`);
  }
});

test('t6 FIX: the anchor resolves on a NUMBERED heading — the format every real insrc document uses', () => {
  // The post-build code review found that querySelector('#'+slug) throws on a
  // digit-leading identifier, so anchored placement silently never worked on a
  // numbered heading. The format engine numbers them: `## 2. Contract details`
  // slugifies to `2-contract-details`.
  const md = '# Low-level design\n\nIntro.\n\n## 2. Contract details\n\nBody.\n\n## 10. Alternatives considered\n\nMore.\n';
  const sections = deriveSectionIndex(md);
  const slugs = sections.anchors.map((a) => a.slug);
  assert.deepEqual(slugs, ['low-level-design', '2-contract-details', '10-alternatives-considered'],
    'the slugs really do start with digits — if this changes, the hazard is gone and so is the need for this test');

  const r = runWebview();
  r.deliver({
    artifactId: 'a', markdown: md, openQuestions: [], blocked: false, sections,
    erDefinition: DG_ER, companions: [DG_REF], diagramAnchorSlug: '2-contract-details',
  });

  // ANCHORED, not fallen back: the slot sits in the body directly after that
  // heading, and the default host is empty.
  const idx = r.body.children.findIndex((c) => c.id === '2-contract-details');
  assert.ok(idx >= 0, 'the numbered heading was stamped');
  assert.equal(r.body.children[idx + 1]!.className, 'insrc-dg-slot',
    'the slot anchors to a digit-leading slug instead of silently falling back');
  assert.equal(r.diagram.children.length, 0, 'and did NOT land in the default host');
});

test('CR/coverage: all four webview source strings PARSE together in one scope', () => {
  // Closes the MED from the post-build code review, and guards a failure this
  // Story actually hit: at t6 the slot-host const was named `dgEl`, colliding with
  // the SVG element factory already called `dgEl` inside DOCS_DIAGRAM_SOURCE.
  // `const dgEl` beside `function dgEl` in one script is a SyntaxError that would
  // have broken the ENTIRE webview, and it was caught only by an ad-hoc check that
  // was never committed.
  //
  // Neither existing guard covers this: tsc cannot see inside a template literal,
  // and SHELL_BASELINE's hash is perfectly stable over a syntactically INVALID
  // script. This matters more as S004 adds a fifth string to the same scope.
  const combined = DOCS_BODY_RENDERER_SOURCE + DOCS_SECTIONS_SOURCE + DOCS_FR_SOURCE + DOCS_DIAGRAM_SOURCE;
  assert.doesNotThrow(
    () => { new Function('document', 'window', 'marked', 'acquireVsCodeApi', combined); },
    'the four source strings must coexist in one scope without a syntax or redeclaration error',
  );

  // The check is only meaningful if it can fail, so prove it catches the exact
  // shape of the bug it exists for: a const redeclaring a function already there.
  assert.throws(
    () => { new Function('document', `${combined}\nconst dgEl = 1;`); },
    /already been declared|Identifier/,
    'a redeclaration of an existing identifier must be rejected',
  );
});

// ---------------------------------------------------------------------------
// S004/t1 — the EXPERIENCE record travels the last hop.
//
// The one-hop gap this closes is narrow and already half-built: sc1 has projected
// `uxDefinition` since S001 (src/workflow/artifact-content.ts:76, projected
// verbatim by structuredRecords at :216-227), DocsContent has declared it at
// docs-review-client.ts:37 and forwarded it at :113 — and openDoc then DROPPED it,
// because the docs-content variant had no field for it. So this task adds two
// optional fields and two conditional spreads. Nothing more.
//
// DATA-ONLY, exactly as S002/t1 and S003/t2 were: no webview code reads either
// field yet, so SHELL_BASELINE must not move. The renderer arrives at t2 and the
// mount at t6; this commit only makes the record reachable.
//
// It is also the one Story in this Epic that touches NO file under src/ — asserted
// here rather than asserted in prose, because that fact is what makes S004 the
// only Story needing no daemon rebuild.
// ---------------------------------------------------------------------------

/** The real uxDefinition shape the ledger carries — an Adaptive Card whose body
 *  is a closed union of eight element types. Only four ledger bodies carry one at
 *  all, and TWO of those four belong to this Epic (its HLD and its S002 LLD). */
const UX_RECORD = {
  type: 'AdaptiveCard',
  version: '1.5',
  body: [
    { type: 'TextBlock', text: 'Docs review', size: 'large', weight: 'bolder' },
    {
      type: 'ColumnSet',
      columns: [
        { type: 'Column', width: 2, items: [{ type: 'TextBlock', text: 'Body', isSubtle: true }] },
        { type: 'Column', width: 1, items: [{ type: 'ActionSet', actions: [{ type: 'Action.Submit', title: 'Approve' }] }] },
      ],
    },
  ],
};

/** A ux-mock ref beside a diagram ref — the shape a document carrying both
 *  companions has. The two pickers must PARTITION this array. */
const UX_REF = { kind: 'ux-mock', relPath: 'docs/epics/x/S004/ux-mock.html', title: 'Experience mock' };

test('t1: uxDefinition is forwarded by REFERENCE on the existing docs-content message', async () => {
  const payload = await openWithContent({
    markdown: '# Doc', openQuestions: [], blocked: false,
    uxDefinition: UX_RECORD as DocsContent['uxDefinition'], companions: [UX_REF] as DocsContent['companions'],
  });

  // Reference identity, not deep equality: a clone would deep-equal and still
  // prove the forward had rebuilt the record on the way through. sc1's
  // verbatim-projection rule is what makes this the right assertion.
  assert.equal(payload['uxDefinition'], UX_RECORD, 'uxDefinition forwarded by reference');
  // The card's nested body survives the hop intact — the element the mock is
  // drawn from is the element the daemon projected, not a reshaped copy.
  const body = (payload['uxDefinition'] as typeof UX_RECORD).body;
  assert.equal(body, UX_RECORD.body, 'the body array is the same reference, not rebuilt');
  assert.equal(body[1], UX_RECORD.body[1], 'and so is the nested ColumnSet');
  // Still ONE message of the SAME type — no new message type, no new IPC method.
  assert.equal(payload['type'], 'docs-content');
});

test('t1: openDoc posts exactly ONE docs-content message per open — no second round trip', async () => {
  const fc = fakeChannel();
  const { client } = fakeClient({
    content: async () => ({
      markdown: '# Doc', openQuestions: [], blocked: false,
      uxDefinition: UX_RECORD as DocsContent['uxDefinition'],
    }),
  });
  const host = createDocsReviewHost({ createPanel: () => fc.channel, client });
  host.open();
  await tick();
  fc.send(env('open-doc', { artifactId: 'LLD-abc-s7' }));
  await tick();

  const forThisDoc = fc.posted.filter(
    (p) => p.payload.type === 'docs-content' && p.payload.artifactId === 'LLD-abc-s7',
  );
  assert.equal(forThisDoc.length, 1, 'the record rides the existing message rather than prompting another');
});

test("t1: an absent record stays an ABSENT KEY ('uxDefinition' in payload === false)", async () => {
  // The dominant case by a wide margin: 4 of 645 ledger bodies carry a
  // uxDefinition, so almost every real open takes this path.
  const payload = await openWithContent({ markdown: '# Doc', openQuestions: [], blocked: false });

  for (const k of ['uxDefinition', 'experienceAnchorSlug'] as const) {
    // A `{ k: undefined }` spread would satisfy `=== undefined` while failing
    // this, which is why the KEY test is the one that matters.
    assert.equal(k in payload, false, `${k} must be an ABSENT KEY, not an undefined-valued one`);
    assert.equal(payload[k], undefined);
  }
  // Otherwise the message is exactly what it was before this task.
  assert.equal(payload['markdown'], '# Doc');
  assert.equal(payload['blocked'], false);
});

test("t1: a ux-mock ref's ofSectionId resolves HOST-side to experienceAnchorSlug over THIS markdown's index", async () => {
  // A NUMBERED heading on purpose: insrc numbers its headings, so the slug this
  // produces begins with a digit — the shape that makes a webview-side
  // querySelector('#'+slug) throw, and the reason resolution happens here.
  const markdown = '# Doc\n\n## 2. Contract details\n\ntext\n';
  const payload = await openWithContent({
    markdown, openQuestions: [], blocked: false,
    uxDefinition: UX_RECORD as DocsContent['uxDefinition'],
    companions: [{ ...UX_REF, ofSectionId: '2-contract-details' }] as DocsContent['companions'],
  });

  // The slug comes from sc3's resolver over the index derived from THIS markdown,
  // so it is the SAME identity the body stamps — not a second one minted here.
  const sections = payload['sections'] as { anchors: { slug: string; title: string }[] };
  const slug = payload['experienceAnchorSlug'];
  assert.equal(typeof slug, 'string', 'the ref resolved to a slug');
  assert.ok(
    sections.anchors.some((a) => a.slug === slug),
    'and the slug is one THIS document actually stamps — sc3 owns the identity, not this task',
  );
});

test("t1: an ofSectionId naming no section posts NO experienceAnchorSlug key — not an empty string", async () => {
  const payload = await openWithContent({
    markdown: '# Doc\n\n## 2. Contract details\n\ntext\n', openQuestions: [], blocked: false,
    uxDefinition: UX_RECORD as DocsContent['uxDefinition'],
    companions: [{ ...UX_REF, ofSectionId: 'no-such-section' }] as DocsContent['companions'],
  });

  // An empty string would be a FALSY-but-present key: the slot would read it as a
  // target, look for an element with an empty id, and lose the visual rather than
  // falling back to its default position.
  assert.equal('experienceAnchorSlug' in payload, false, 'unresolvable means ABSENT, never empty');
  // The record itself still travels — a stale anchor must not cost the mock.
  assert.equal(payload['uxDefinition'], UX_RECORD);
});

test('t1: the two pickers PARTITION the companions array — the ux ref is not the diagram ref', async () => {
  // A document carrying BOTH refs, each with its own ofSectionId pointing at a
  // DIFFERENT heading. If either picker matched the other's kind, the two slugs
  // would collapse to one and a slot would anchor beside the wrong section.
  //
  // THE DIAGRAM REF IS DELIBERATELY FIRST. With the ux ref first, a kind-BLIND
  // picker (`companions[0]`) selects the right ref by luck and this test passes
  // while proving nothing — verified by running exactly that mutation, which this
  // ordering turns red. Position must not be able to stand in for kind.
  const markdown = '# Doc\n\n## 2. Contract details\n\na\n\n## 3. Data model\n\nb\n';
  const payload = await openWithContent({
    markdown, openQuestions: [], blocked: false,
    uxDefinition: UX_RECORD as DocsContent['uxDefinition'],
    erDefinition: ER_RECORD as DocsContent['erDefinition'],
    companions: [
      { kind: 'diagram-mermaid', relPath: 'docs/epics/x/S003/er.html', title: 'ER diagram', ofSectionId: '3-data-model' },
      { ...UX_REF, ofSectionId: '2-contract-details' },
    ] as DocsContent['companions'],
  });

  const ux = payload['experienceAnchorSlug'];
  const dg = payload['diagramAnchorSlug'];
  assert.equal(typeof ux, 'string');
  assert.equal(typeof dg, 'string');
  assert.notEqual(ux, dg, 'each slot resolved its OWN ref, so the slugs differ');
  // And each resolved to the heading its own ref named.
  assert.match(String(ux), /contract-details$/);
  assert.match(String(dg), /data-model$/);
});

test('t1: a companions array of DIAGRAM refs only yields no experienceAnchorSlug', async () => {
  // The other half of the partition, and the case that kills a position-based or
  // kind-blind picker outright: there is no ux-mock ref here at all, so anything
  // the experience side resolves would be a ref belonging to the diagram slot.
  // This is also the path that routes ac3's dominant case to 'absent' at t6.
  const payload = await openWithContent({
    markdown: '# Doc\n\n## 3. Data model\n\nb\n', openQuestions: [], blocked: false,
    erDefinition: ER_RECORD as DocsContent['erDefinition'],
    companions: [
      { kind: 'diagram-mermaid', relPath: 'docs/epics/x/S003/er.html', title: 'ER diagram', ofSectionId: '3-data-model' },
      { kind: 'diagram-html', relPath: 'docs/epics/x/S003/component.html', title: 'Component diagram', ofSectionId: '3-data-model' },
    ] as DocsContent['companions'],
  });

  assert.equal('experienceAnchorSlug' in payload, false, 'no ux-mock ref means no experience anchor');
  // While the diagram slot DID resolve its own — proving the absence above is
  // discrimination and not a resolver that simply failed for both.
  assert.equal(typeof payload['diagramAnchorSlug'], 'string');
});

test('t1: the fail-closed arm posts blocked:true and carries NO uxDefinition', async () => {
  const fc = fakeChannel();
  const { client } = fakeClient({ content: () => { throw new Error('daemon unreachable'); } });
  const host = createDocsReviewHost({
    createPanel: () => fc.channel, client, logger: { warn: () => {}, error: () => {} },
  });
  host.open();
  await tick();
  fc.send(env('open-doc', { artifactId: 'LLD-abc-s7' }));
  await tick();

  const msg = fc.posted.filter((p) => p.payload.type === 'docs-content')
    .find((p) => p.payload.artifactId === 'LLD-abc-s7');
  assert.ok(msg, 'the failure still posts a docs-content message');
  const payload = msg!.payload as Record<string, unknown>;
  assert.equal(payload['blocked'], true, 'approve stays suppressed — the reviewer never saw the body');
  // A reviewer who could not read the body must never be shown a mock DRAWN from
  // it: the fail-closed arm builds its message from scratch and carries neither
  // the record nor its anchor.
  assert.equal('uxDefinition' in payload, false);
  assert.equal('experienceAnchorSlug' in payload, false);
});

test('t1 (contract): protocol.ts indexes uxDefinition off DocsContent rather than restating it', async () => {
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const { dirname, join } = await import('node:path');
  const here = dirname(fileURLToPath(import.meta.url));
  const proto = readFileSync(join(here, '..', 'protocol.ts'), 'utf8');

  // Scoped to the docs-content variant, so a match elsewhere cannot satisfy it.
  const variant = proto.slice(proto.indexOf("readonly type: 'docs-content'"));
  const decl = variant.slice(0, variant.indexOf('\n    }'));

  assert.ok(
    decl.includes("readonly uxDefinition?: DocsContent['uxDefinition'];"),
    'uxDefinition must use the INDEXED form so protocol -> client -> daemon stay one declaration deep',
  );
  // A hand-copied shape is the failure this guards: it compiles, looks right, and
  // silently decouples from the daemon's record.
  assert.doesNotMatch(decl, /uxDefinition\?:\s*\{/, "uxDefinition's shape is never restated inline");
  // The anchor slug is a plain string and is declared as one — it is not a
  // projected record and must not pretend to be.
  assert.ok(decl.includes('readonly experienceAnchorSlug?: string | undefined;'));
});

test('t1/t2: the shell matches the pin, and NOTHING reads either new field yet', async () => {
  const { createHash } = await import('node:crypto');
  const html = renderShellFor(SHELL_BASELINE.nonce);

  assert.equal(
    createHash('sha256').update(html, 'utf8').digest('hex'),
    SHELL_BASELINE.sha256,
    'the emitted shell matches the current pin',
  );
  assert.equal(html.length, SHELL_BASELINE.chars, 'shell length in characters');
  assert.equal(Buffer.byteLength(html, 'utf8'), SHELL_BASELINE.bytes, 'shell length in UTF-8 bytes');

  // THE INERTNESS CLAIM, and the part of this test that still bites after t2 moved
  // the pin: t1 carried the record to the webview and t2 gave the webview code that
  // could draw it, but NOTHING may read either field until t6 mounts the slot. So
  // neither name may appear in the emitted script. This is what makes "t2 is inert"
  // checkable rather than asserted in a commit message.
  // t1 carried the record and t2-t5 were inert; t6 DECLARES the change. The webview
  // now reads the posted record, at exactly ONE site — the slot build — and the
  // anchor at exactly one site too. A second read would mean a second code path
  // that could disagree with the first.
  assert.equal((html.match(/m\.uxDefinition/g) ?? []).length, 1, 'the record is read at exactly one site');
  assert.equal((html.match(/m\.experienceAnchorSlug/g) ?? []).length, 1, 'and the anchor at exactly one');
  assert.match(html, /uxBuildMockSlot\(m\.uxDefinition,uxPickRef\(m\.companions\),m\.experienceAnchorSlug\)/,
    'and that site is the slot build');
  assert.match(html, /function uxRenderCard\(/, 'the renderer is inlined');
});

test('the shell inlines each of its source strings verbatim and exactly once, with the ux CSS fragment', () => {
  const html = renderShellFor(SHELL_BASELINE.nonce);

  // Until E202610138d4b90c9:S001 rebuilt the shell this test summed a base pin and
  // each declared delta. A rebuilt shell has no base to add to. What still holds, and
  // is still worth holding, is that the source strings are INLINED VERBATIM — which
  // is what lets a test evaluate a string and know it evaluated what ships.
  for (const [name, source] of [
    ['DOCS_BODY_RENDERER_SOURCE', DOCS_BODY_RENDERER_SOURCE], ['DOCS_SECTIONS_SOURCE', DOCS_SECTIONS_SOURCE],
    ['DOCS_FR_SOURCE', DOCS_FR_SOURCE], ['DOCS_DIAGRAM_SOURCE', DOCS_DIAGRAM_SOURCE], ['DOCS_UX_SOURCE', DOCS_UX_SOURCE],
    ['DOCS_COMMENTS_SOURCE', DOCS_COMMENTS_SOURCE], ['DOCS_LIST_SOURCE', DOCS_LIST_SOURCE],
  ] as const) {
    assert.equal(html.split(source).length - 1, 1, `${name} is inlined verbatim, once`);
  }
  // In the order the bootstrap relies on: each later string may call an earlier one.
  const at = [DOCS_BODY_RENDERER_SOURCE, DOCS_SECTIONS_SOURCE, DOCS_FR_SOURCE, DOCS_DIAGRAM_SOURCE, DOCS_UX_SOURCE, DOCS_COMMENTS_SOURCE, DOCS_LIST_SOURCE].map((x) => html.indexOf(x));
  assert.deepEqual([...at].sort((a, b) => a - b), at, 'in their declared order');
  // And the ux CSS fragment is still in the shell, between its first and last rule.
  const cssStart = html.indexOf('.ux-card{');
  const cssEnd = html.indexOf('}', html.indexOf('.ux-unknown{')) + 1;
  assert.ok(cssStart > 0 && cssEnd > cssStart, 'the ux CSS fragment is in the shell');
});

test('t1: NO file under src/ is modified — the fact that makes S004 need no daemon rebuild', (t) => {
  const run = git(t, { window: { from: 'docs/epics/build-vs-code-plugin-ui-integration-E20260929bfe98ff7/S004/PLAN.md', to: 'docs/epics/build-vs-code-plugin-ui-integration-E20260929bfe98ff7/S004/BUILD.md' } });
  if (!run) return;

  // Read the Story's COMMITTED change set, not the working tree. An earlier
  // version of this test read `git status --porcelain`, which passed only while
  // the change was uncommitted and went red the moment it was committed — caught
  // by the build validation gate, which is the whole reason that gate exists.
  //
  // The build window is "every commit from this Story's PLAN approval to its
  // BUILD approval" — two boundaries the repo itself records rather than hashes
  // pasted here. It ends at the BUILD approval, not HEAD: the Story is complete,
  // and a window left open at HEAD (and the working tree) checked every later
  // change in the repo against this Story's rule (ISSUE-2f07f59c).
  const planCommit = run('log', '--format=%H', '-1', '--',
    'docs/epics/build-vs-code-plugin-ui-integration-E20260929bfe98ff7/S004/PLAN.md').trim();
  assert.match(planCommit, /^[0-9a-f]{40}$/, 'the PLAN commit is the build-window boundary');
  const buildCommit = run('log', '--format=%H', '-1', '--',
    'docs/epics/build-vs-code-plugin-ui-integration-E20260929bfe98ff7/S004/BUILD.md').trim();
  assert.match(buildCommit, /^[0-9a-f]{40}$/, 'the BUILD approval commit closes the build window');

  const committed = run('diff', '--name-only', `${planCommit}..${buildCommit}`)
    .split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  const paths = committed;

  // Positive control: a check that inspects an EMPTY change set passes vacuously,
  // and this suite has shipped exactly that kind of check before. There must be
  // something to look at, and after t1 there always is.
  assert.ok(committed.length > 0, 'there are commits in the build window to inspect');

  const daemonFiles = paths.filter((p) => p.startsWith('src/'));
  assert.deepEqual(
    daemonFiles, [],
    `S004 must touch nothing under src/ — uxDefinition is already one of sc1's projected fields. Found: ${daemonFiles.join(', ')}`,
  );
  // And state positively what it DID touch, so a future task that quietly widens
  // the surface shows up here rather than only in a reviewer's reading.
  assert.ok(
    paths.some((p) => p.startsWith('vscode-plugin/src/chat/')),
    'the Story works in the plugin chat surface',
  );
});

// ---------------------------------------------------------------------------
// S004/t2 — DOCS_UX_SOURCE: the element dispatch and the card renderer, EXECUTED.
//
// The source string is evaluated with `new Function` against a RECORDING document
// stub, so "built with createElement, written with textContent" is a fact these
// tests observe rather than a claim they grep for. The stub exposes innerHTML and
// outerHTML setters that exist ONLY to be caught.
//
// The authority is the daemon's renderUxMockDocument (ux.ts:482) and its
// elementHtml (:350). Structure and the ux-* vocabulary are mirrored; the method
// is refused. The structural parity harness below proves the first half and the
// no-markup tests prove the second.
//
// INERT: nothing calls these functions yet, so the only change to the surface is
// the added source text — which is why SHELL_BASELINE moves in this commit.
// ---------------------------------------------------------------------------

/** The all-eight-members fixture, used wherever a test needs a non-trivial card
 *  rather than a specific element. Named off the shared set so it cannot drift
 *  from what the parity harness compares. */
const UX_PARITY_FIXTURES_FOR_TEST =
  UX_PARITY_FIXTURES.find((f) => f.name === 'every-member')!;

/** A text node of the shared fake (nodeType 3). */
function isText(n: BodyStub): boolean {
  return n.nodeType === 3;
}

interface UxSlot {
  state: 'absent' | 'rendered' | 'unshowable';
  kind?: string | undefined;
  label?: string | undefined;
  reason?: string | undefined;
  body?: BodyStub | undefined;
  linkOut?: { relPath: string; title: string } | undefined;
  anchorSlug?: string | undefined;
}

interface UxApi {
  uxRenderCard(record: unknown): { el: BodyStub };
  uxElement(el: unknown, depth: number): BodyStub;
  uxPickRef(companions: unknown): { kind: string; title?: string; relPath?: string } | undefined;
  uxBuildMockSlot(record: unknown, ref: unknown, anchorSlug: string | undefined): UxSlot;
  setDepthMax(n: number | null): void;
  created: string[];
  texts: string[];
  nodes: BodyStub[];
}

/** Evaluate DOCS_UX_SOURCE against a recording document stub. */
function loadUx(): UxApi {
  const created: string[] = [];
  const texts: string[] = [];
  const nodes: BodyStub[] = [];
  const doc = {
    createElement: (t: string) => { created.push(t); const n = bodyStub(t); nodes.push(n); return n; },
    createTextNode: (d: string) => { texts.push(d); return textNode(d); },
    // Present so a renderer reaching for the SVG factory is RECORDED rather than
    // crashing — this renderer must never use it.
    createElementNS: (ns: string, t: string) => { created.push(`NS:${t}`); return bodyStub(t, '', '', ns); },
  };
  // eslint-disable-next-line no-new-func
  const make = new Function('document', `${DOCS_UX_SOURCE}; return {uxRenderCard:uxRenderCard,uxElement:uxElement,uxPickRef:uxPickRef,uxBuildMockSlot:uxBuildMockSlot,setDepthMax:function(n){UX_DEPTH_MAX=n;}};`);
  const api = make(doc) as Omit<UxApi, 'created' | 'texts' | 'nodes'>;
  return { ...api, created, texts, nodes };
}


/** All text a subtree puts in the DOM, in order, from BOTH non-parsing channels. */
function uxAllText(n: BodyStub): string[] {
  const out: string[] = [];
  if (n.textContent.length > 0) out.push(n.textContent);
  for (const c of n.children) out.push(...(isText(c) ? [c.data] : uxAllText(c)));
  return out;
}

// --- the structural normalisation -----------------------------------------
// NARROW AND STATED, deliberately: tag, class and child ORDER. Nothing else.
// Not text, not attributes, not style, not whitespace. A harness that normalises
// away more than it states becomes a test that passes on anything — which is
// exactly how three vacuous tests shipped green in this repo in one week. The
// things excluded here are covered by their own tests above and below: text by the
// textContent assertions, the absence of attributes by the no-record-attribute
// test, style by the theme scan.
//
// Text NODES are collapsed to a single marker rather than dropped, because WHERE
// loose text sits among element siblings is arrangement, and arrangement is the
// whole point of this instrument.

interface Shape { tag: string; cls: string; kids: Array<Shape | '#text'> }

function shapeOfClient(n: BodyStub): Shape {
  // `textContent = 'x'` IS one text child in a real DOM — the recording stub keeps
  // it as a property because that is how the write was made, so the equivalence is
  // restored here. This is not normalising a difference away: the two produce the
  // same tree, and an empty string produces no child at all, which is also what the
  // daemon emits for a text-less element.
  //
  // The equivalence is only unambiguous while an element never does BOTH, which the
  // guard below asserts rather than assumes.
  assert.ok(
    n.textContent.length === 0 || n.children.length === 0,
    `${n.tag}.${n.className} both sets textContent and appends children — the shape equivalence no longer holds`,
  );
  const kids: Array<Shape | '#text'> = n.textContent.length > 0
    ? ['#text']
    : n.children.map((c) => (isText(c) ? '#text' as const : shapeOfClient(c)));
  return { tag: n.tag.toLowerCase(), cls: n.className, kids };
}

/** Parse the daemon's HTML into the SAME shape. Handles exactly what
 *  renderUxMockDocument emits: non-void elements with double-quoted attributes,
 *  and text between them. Anything it cannot parse throws rather than being
 *  silently skipped — a parser that swallows what it does not understand would
 *  make the diff pass by accident. */
function shapeOfHtml(fullHtml: string): Shape {
  // The BODY region only. The document head carries void `<meta>` tags, and this
  // parser deliberately refuses to guess at anything it was not built for — so it
  // is pointed at the region that holds the card, where the daemon emits no void
  // element. Narrowing the input is the honest fix; teaching the parser to skip
  // tags it does not understand would be the dishonest one.
  const bodyAt = fullHtml.indexOf('<body>');
  const html = bodyAt === -1 ? fullHtml : fullHtml.slice(bodyAt + 6, fullHtml.lastIndexOf('</body>'));
  const root: Shape = { tag: '#root', cls: '', kids: [] };
  const stack: Shape[] = [root];
  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf('<', i);
    if (lt === -1) {
      if (html.slice(i).trim().length > 0) stack[stack.length - 1]!.kids.push('#text');
      break;
    }
    if (lt > i && html.slice(i, lt).trim().length > 0) stack[stack.length - 1]!.kids.push('#text');
    const gt = html.indexOf('>', lt);
    assert.ok(gt > lt, `unterminated tag at ${lt}`);
    const raw = html.slice(lt + 1, gt);
    if (raw.startsWith('/')) {
      const closing = stack.pop();
      assert.ok(closing !== undefined && closing !== root, `unbalanced close </${raw.slice(1)}>`);
      assert.equal(closing!.tag, raw.slice(1).trim(), 'close tag matches the open tag');
    } else {
      const tag = raw.split(/[\s>]/)[0]!.toLowerCase();
      const clsMatch = /\sclass="([^"]*)"/.exec(raw);
      const node: Shape = { tag, cls: clsMatch?.[1] ?? '', kids: [] };
      stack[stack.length - 1]!.kids.push(node);
      assert.ok(!raw.endsWith('/'), 'the daemon emits no self-closing tags');
      stack.push(node);
    }
    i = gt + 1;
  }
  assert.equal(stack.length, 1, 'every element the daemon opened was closed');
  return root;
}

/**
 * THE ONE STATED DIVERGENCE, and the only transform applied to either side.
 *
 * The daemon puts an OpenUrl's url in `title=` (ux.ts:396); the client shows it as
 * a visible text node, because the LLD requires the url SHOWN and because a
 * tooltip cannot be read in a screenshot — and the screenshot read is the check
 * this Story cannot ship without. So for a `ux-btn--link` ONLY, the daemon's
 * expected shape gains the one text node the client adds.
 *
 * Deliberately narrow: it matches one exact class, inserts one node, at one
 * position, and touches nothing else. Anything broader would be the harness
 * "normalising away too much" the plan warned about — the transform is asserted
 * to fire on link chips and only link chips.
 */
function withShownUrl(sh: Shape): Shape {
  const kids = sh.kids.map((k) => (k === '#text' ? k : withShownUrl(k)));
  if (sh.cls === 'ux-btn ux-btn--link') {
    const glyphAt = kids.findIndex((k) => k !== '#text' && k.cls === 'ux-btn__glyph');
    assert.ok(glyphAt > 0, 'a link chip carries its title text then its glyph');
    kids.splice(glyphAt, 0, { tag: 'span', cls: 'ux-btn__url', kids: ['#text'] });
  }
  return { tag: sh.tag, cls: sh.cls, kids };
}

/** The daemon's card subtree, found by class rather than by position. */
function daemonCardShape(html: string): Shape {
  const find = (s: Shape): Shape | undefined => {
    if (s.cls === 'ux-card') return s;
    for (const k of s.kids) if (k !== '#text') { const hit = find(k); if (hit !== undefined) return hit; }
    return undefined;
  };
  const card = find(shapeOfHtml(html));
  assert.ok(card !== undefined, 'the daemon document contains a ux-card');
  return card!;
}

// --- one test per union member ---------------------------------------------

test('t2: TextBlock renders as <p class="ux-text"> with its text via textContent', () => {
  const ux = loadUx();
  const el = ux.uxElement({ type: 'TextBlock', text: 'Docs review' }, 1);
  assert.equal(el.tag, 'p', "the daemon's tag for a TextBlock");
  assert.equal(el.className, 'ux-text');
  assert.equal(el.textContent, 'Docs review');
  // The MECHANISM, observed: the text arrived by textContent and nothing else.
  assert.deepEqual(el.writes.filter((w) => w.prop !== 'className'), [{ prop: 'textContent', value: 'Docs review' }]);
});

test('t2: every TextBlock modifier maps to the daemon class, including all four colour roles', () => {
  const ux = loadUx();
  const cls = (el: Record<string, unknown>): string => ux.uxElement({ type: 'TextBlock', text: 'x', ...el }, 1).className;

  assert.equal(cls({ weight: 'bolder' }), 'ux-text ux-bolder');
  assert.equal(cls({ weight: 'lighter' }), 'ux-text ux-lighter');
  assert.equal(cls({ weight: 'default' }), 'ux-text', 'default weight adds no class, as the daemon does');
  assert.equal(cls({ isSubtle: true }), 'ux-text ux-subtle');
  assert.equal(cls({ isSubtle: false }), 'ux-text', 'only an explicit true');
  for (const size of ['small', 'default', 'medium', 'large', 'extraLarge']) {
    assert.equal(cls({ size }), `ux-text ux-size-${size}`);
  }
  for (const color of ['accent', 'good', 'warning', 'attention']) {
    assert.equal(cls({ color }), `ux-text ux-color-${color}`);
  }
  // Order matters only in that it matches the daemon's, so the parity diff holds.
  assert.equal(
    cls({ weight: 'bolder', isSubtle: true, size: 'large', color: 'good' }),
    'ux-text ux-bolder ux-subtle ux-size-large ux-color-good',
  );
});

test('t2: Container renders as ux-container and recurses over items', () => {
  const ux = loadUx();
  const el = ux.uxElement({
    type: 'Container',
    items: [{ type: 'TextBlock', text: 'a' }, { type: 'TextBlock', text: 'b' }],
  }, 1);
  assert.equal(el.tag, 'div');
  assert.equal(el.className, 'ux-container');
  assert.equal(el.children.length, 2);
  assert.deepEqual(el.children.map((c) => (isText(c) ? '#text' : c.textContent)), ['a', 'b']);
});

test('t2: ColumnSet renders as ux-columnset with its Columns as children, in order', () => {
  const ux = loadUx();
  const el = ux.uxElement({
    type: 'ColumnSet',
    columns: [
      { type: 'Column', items: [{ type: 'TextBlock', text: 'left' }] },
      { type: 'Column', items: [{ type: 'TextBlock', text: 'right' }] },
    ],
  }, 1);
  assert.equal(el.className, 'ux-columnset');
  // SIDE BY SIDE is the CSS's job (display:flex on .ux-columnset); the renderer's
  // job is that the columns are SIBLINGS in declared order rather than nested.
  assert.deepEqual(el.children.map((c) => (isText(c) ? '#text' : c.className)), ['ux-column', 'ux-column']);
  assert.deepEqual(uxAllText(el), ['left', 'right'], 'declared order survives');
});

test('t2: Column honours a numeric width as the flex grow factor, a keyword falls back to 1, absent sets no style', () => {
  const ux = loadUx();
  const col = (width?: unknown): BodyStub =>
    ux.uxElement(width === undefined ? { type: 'Column', items: [] } : { type: 'Column', width, items: [] }, 1);

  assert.equal(col(2).style['flex'], '2 1 0', 'a digits-only width IS the grow factor');
  assert.equal(col('3').style['flex'], '3 1 0', 'a digit STRING counts too, as the daemon does');

  // THE KEYWORD RULE, stated because it is a decision and not an omission. The
  // daemon maps every non-numeric width to the constant 1 (ux.ts:366), so both
  // 'stretch' and 'auto' become equal division here. For 'stretch' that IS its
  // meaning. For 'auto' — size-to-content — it is an approximation, and mirroring
  // the daemon is chosen over improving on it for two reasons: the structural parity
  // diff would fail on any divergence, and the Epic's whole premise is that the
  // in-pane mock and the generated companion tell the SAME story about the same
  // record. A client that laid out 'auto' better than the authentic artefact would
  // be a renderer a reviewer could be misled by.
  assert.equal(col('stretch').style['flex'], '1 1 0', "'stretch' is equal division — its actual meaning");
  assert.equal(col('auto').style['flex'], '1 1 0', "'auto' is approximated as equal division, as the daemon does");
  assert.equal(col(undefined).style['flex'], undefined, 'an absent width sets NO style at all');
  // The grow factor is the only record-derived attribute value in this renderer,
  // and it can only ever be an integer — never record text.
  assert.equal(col('2; background:url(javascript:alert(1))').style['flex'], '1 1 0',
    'a non-numeric width can never reach the style, however it is shaped');
});

test('t2: Image shows its url as TEXT — no img element, no src, nothing fetchable', () => {
  const ux = loadUx();
  const el = ux.uxElement({ type: 'Image', url: 'https://example.invalid/a.png', altText: 'A shot' }, 1);

  assert.equal(el.className, 'ux-image');
  // THE invariant, structurally: no img was ever created, anywhere in the run.
  assert.ok(!ux.created.includes('img'), 'no img element is created');
  assert.ok(!ux.created.some((t) => t.startsWith('NS:')), 'and no SVG image either');
  for (const n of allOf(el)) {
    assert.equal(n.attrs['src'], undefined, 'no src attribute on any node');
    assert.equal(n.attrs['href'], undefined);
  }
  // The url and the alt text are both VISIBLE, which is what makes the placeholder
  // informative rather than merely safe.
  assert.deepEqual(uxAllText(el), ['▣', 'A shot', 'https://example.invalid/a.png']);
  // Mirrors the daemon's structure: icon, then a meta column of alt + url.
  assert.deepEqual(
    el.children.map((c) => (isText(c) ? '#text' : c.className)),
    ['ux-image__icon', 'ux-image__meta'],
  );
});

test('t2: Image with no altText falls back to the daemon’s literal "image"', () => {
  const ux = loadUx();
  const el = ux.uxElement({ type: 'Image', url: 'https://example.invalid/b.png' }, 1);
  assert.deepEqual(uxAllText(el), ['▣', 'image', 'https://example.invalid/b.png']);
});

test('t2: Input.Text is a non-interactive affordance — a label and a styled span, never an input', () => {
  const ux = loadUx();
  const el = ux.uxElement({ type: 'Input.Text', id: 'note', label: 'Reviewer note', placeholder: 'why' }, 1);

  assert.equal(el.tag, 'label');
  assert.equal(el.className, 'ux-field');
  assert.ok(!ux.created.includes('input'), 'no input element — the mock cannot be typed into');
  assert.ok(!ux.created.includes('textarea'));
  assert.deepEqual(
    el.children.map((c) => (isText(c) ? '#text' : c.className)), ['ux-label', 'ux-input'],
  );
  assert.deepEqual(uxAllText(el), ['Reviewer note', 'why']);
});

test('t2: Input.Text multiline adds ux-input--multi; a missing label falls back to the id', () => {
  const ux = loadUx();
  const multi = ux.uxElement({ type: 'Input.Text', id: 'd', label: 'D', placeholder: 'p', isMultiline: true }, 1);
  assert.equal((multi.children[1] as BodyStub).className, 'ux-input ux-input--multi');

  const noLabel = ux.uxElement({ type: 'Input.Text', id: 'fallback-id', placeholder: '' }, 1);
  assert.deepEqual(uxAllText(noLabel), ['fallback-id', ''].filter((t) => t.length > 0));
  assert.equal((noLabel.children[0] as BodyStub).textContent, 'fallback-id');
});

test('t2: Input.ChoiceSet renders each choice as text with a mark — no select, no option', () => {
  const ux = loadUx();
  const el = ux.uxElement({
    type: 'Input.ChoiceSet', id: 'v', label: 'Verdict',
    choices: [{ title: 'Approve' }, { title: 'Request changes' }],
  }, 1);

  assert.equal(el.className, 'ux-field');
  assert.ok(!ux.created.includes('select'), 'no select element');
  assert.ok(!ux.created.includes('option'), 'no option element');
  const choices = (el.children[1] as BodyStub);
  assert.equal(choices.className, 'ux-choices');
  assert.deepEqual(choices.children.map((c) => (isText(c) ? '#text' : c.className)), ['ux-choice', 'ux-choice']);
  // The title is a BARE text node beside the mark, exactly as the daemon emits it.
  const first = choices.children[0] as BodyStub;
  assert.deepEqual(first.children.map((c) => (isText(c) ? '#text' : c.className)), ['ux-choice__mark', '#text']);
  assert.deepEqual(uxAllText(el), ['Verdict', '○', 'Approve', '○', 'Request changes']);
});

test('t2: a multi-select ChoiceSet uses the daemon’s box mark, single-select its circle', () => {
  const ux = loadUx();
  const multi = ux.uxElement({ type: 'Input.ChoiceSet', id: 'd', label: 'D', isMultiSelect: true, choices: [{ title: 'one' }] }, 1);
  assert.ok(uxAllText(multi).includes('☐'), 'multi-select shows the box');
  const single = ux.uxElement({ type: 'Input.ChoiceSet', id: 'd', label: 'D', choices: [{ title: 'one' }] }, 1);
  assert.ok(uxAllText(single).includes('○'), 'single-select shows the circle');
});

test('t2: ActionSet renders Submit and OpenUrl as chips that are TELLABLE APART, with no anchor and no href', () => {
  const ux = loadUx();
  const el = ux.uxElement({
    type: 'ActionSet',
    actions: [
      { type: 'Action.Submit', title: 'Approve' },
      { type: 'Action.OpenUrl', title: 'Open companion', url: 'https://example.invalid/c.html' },
    ],
  }, 1);

  assert.equal(el.className, 'ux-actions');
  assert.ok(!ux.created.includes('a'), 'no anchor element is created');
  assert.ok(!ux.created.includes('button'), 'and no button — the chips are not interactive');
  // The distinction the daemon's own correction records: a reviewer must be able to
  // tell which control commits from which navigates.
  const kinds = el.children.map((c) => (isText(c) ? '#text' : c.className));
  assert.deepEqual(kinds, ['ux-btn ux-btn--submit', 'ux-btn ux-btn--link']);
  // The link carries the navigate glyph; the submit does not.
  const submit = el.children[0] as BodyStub;
  const link = el.children[1] as BodyStub;
  assert.deepEqual(submit.children.map((c) => (isText(c) ? '#text' : c.className)), ['#text'],
    'a submit chip is its title and nothing else');
  // THE URL IS SHOWN, as visible text between the title and the glyph. The daemon
  // puts it in `title=`; a tooltip cannot be read in a screenshot, and the visual
  // read is this Story's binding check — so it becomes content here.
  assert.deepEqual(link.children.map((c) => (isText(c) ? '#text' : c.className)),
    ['#text', 'ux-btn__url', 'ux-btn__glyph'], 'title, then url, then the navigate glyph');
  // The url is an ELEMENT and not a second text node, deliberately: two adjacent
  // text nodes merge into one anonymous flex item, so the chip's gap never applies
  // between them and the title runs into the url. The t3 visual read found that.
  assert.equal((link.children[1] as BodyStub).tag, 'span', 'the url is its own flex item');
  assert.deepEqual(uxAllText(link), ['Open companion', 'https://example.invalid/c.html', '\u2197']);
  // And the url reaches NO attribute anywhere — ac5 kept absolute, which is the
  // reason it is shown as text rather than mirrored into `title=`.
  for (const n of allOf(el)) {
    for (const v of Object.values(n.attrs)) {
      assert.ok(!v.includes('example.invalid'), 'no record text in any attribute value');
    }
  }
});

test('t2: the stated parity divergence fires on LINK chips and only link chips', async () => {
  const { renderUxMockDocument } = await import('../../../../src/workflow/artifacts/companion/ux.js');
  const card = {
    type: 'AdaptiveCard' as const,
    body: [{ type: 'ActionSet', actions: [{ type: 'Action.Submit', title: 'Go' }] }],
  };
  // A card with NO link chip: the transform must be a no-op, so the two sides agree
  // without it. If it fired anywhere else, this would fail.
  const daemonRaw = daemonCardShape(renderUxMockDocument(card as never, 'submit-only'));
  assert.deepEqual(withShownUrl(daemonRaw), daemonRaw, 'no link chip, no transform');
  assert.deepEqual(shapeOfClient(loadUx().uxRenderCard(card).el), daemonRaw,
    'and a submit-only card matches the daemon with no allowance at all');
});

// --- the real ledger records ------------------------------------------------

test('t2: each of the FOUR real ledger uxDefinitions renders COMPLETELY', async () => {
  const { readFileSync, existsSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const { dirname, join } = await import('node:path');
  const here = dirname(fileURLToPath(import.meta.url));
  const ledger = join(here, '..', '..', '..', '..', '.insrc', 'artifacts');

  // The four bodies that actually carry a uxDefinition, named rather than
  // discovered, so this test says WHICH records it is the contract for. Two of the
  // four belong to this Epic — the surface rendering its own design.
  const files = [
    'LLD-85e6a58693579b6d-S001.json',
    'LLD-7c219c7471d79496-S001.json',
    'LLD-bfe98ff7f97178cf-s2.json',
    'HLD-bfe98ff7f97178cf.json',
  ];

  let checked = 0;
  for (const f of files) {
    const p = join(ledger, f);
    if (!existsSync(p)) continue;
    const record = JSON.parse(readFileSync(p, 'utf8')).body.uxDefinition;
    assert.ok(record !== undefined && Array.isArray(record.body), `${f} carries a card body`);

    const ux = loadUx();
    const { el } = ux.uxRenderCard(record);

    // EVERY element in the record appears in the output tree. Counted from the
    // record rather than from the output, so a renderer that silently skipped a
    // branch would come up short rather than merely look plausible.
    const countRecord = (list: readonly unknown[]): number => list.reduce<number>((n, e) => {
      const o = e as { type?: string | undefined; items?: unknown; columns?: unknown };
      const kids = o.type === 'ColumnSet' ? o.columns : o.items;
      return n + 1 + (Array.isArray(kids) ? countRecord(kids) : 0);
    }, 0);
    const expected = countRecord(record.body);
    // One DOM element per record element at minimum (several members render a
    // small subtree), and crucially NOT FEWER.
    const rendered = allOf(el).length - 1; // minus the ux-card wrapper
    assert.ok(rendered >= expected,
      `${f}: ${expected} record elements must all appear; the tree has ${rendered} elements`);
    // And nothing degraded: a real, valid record must produce no ux-unknown.
    assert.equal(
      allOf(el).filter((n) => n.className === 'ux-unknown').length, 0,
      `${f} renders with no unrenderable element`,
    );
    checked += 1;
  }
  // Positive control: this test is worthless if it silently found no records.
  assert.equal(checked, 4, 'all four real ledger records were found and rendered');
});

// --- degradation -----------------------------------------------------------

test('t2: an unknown element type renders a VISIBLE ux-unknown NAMING the type', () => {
  const ux = loadUx();
  const el = ux.uxElement({ type: 'RichTextBlock', inlines: [] }, 1);
  assert.equal(el.className, 'ux-unknown');
  assert.match(el.textContent, /RichTextBlock/,
    'the reviewer is told WHICH element could not be drawn, so they can open the companion');
  assert.ok(el.textContent.length > 0, 'and it is not an empty box');
});

test('t2: a malformed element, a missing text and a non-array child list each degrade IN PLACE', () => {
  const ux = loadUx();
  const card = ux.uxRenderCard({
    type: 'AdaptiveCard',
    body: [
      { type: 'TextBlock', text: 'before' },
      null,
      { type: 'TextBlock' },                       // no text
      'not an object',
      { type: 'Container', items: 'not an array' },
      { type: 'ColumnSet', columns: null },
      { type: 'TextBlock', text: 'after' },
    ],
  }).el;

  const kids = card.children.map((c) => (isText(c) ? '#text' : c.className));
  // SEVEN children for seven body entries: nothing vanished, nothing collapsed.
  assert.equal(kids.length, 7, 'every entry produced exactly one child');
  assert.deepEqual(kids, [
    'ux-text', 'ux-unknown', 'ux-text', 'ux-unknown', 'ux-container', 'ux-columnset', 'ux-text',
  ]);
  // The siblings around the holes still rendered — the point of degrading in place.
  assert.equal((card.children[0] as BodyStub).textContent, 'before');
  assert.equal((card.children[6] as BodyStub).textContent, 'after');
  // A missing text is an EMPTY paragraph, not a crash and not a hole.
  assert.equal((card.children[2] as BodyStub).textContent, '');
  // A non-array child list degrades to an EMPTY region, as childrenOf does.
  assert.equal((card.children[4] as BodyStub).children.length, 0);
  assert.equal((card.children[5] as BodyStub).children.length, 0);
});

test('t2: a non-array body yields an empty card rather than throwing', () => {
  const ux = loadUx();
  for (const record of [undefined, null, {}, { body: null }, { body: 'x' }, { body: {} }]) {
    const { el } = ux.uxRenderCard(record);
    assert.equal(el.className, 'ux-card');
    assert.equal(el.children.length, 0, `${JSON.stringify(record)} renders an empty card`);
  }
});

// --- ac5: no markup, ever --------------------------------------------------

test('t2: every element is created with createElement and every string written without parsing', () => {
  const ux = loadUx();
  const { el } = ux.uxRenderCard(UX_PARITY_FIXTURES_FOR_TEST.card);

  // EXECUTED, not grepped: every node in the tree came from createElement, and the
  // only property writes anywhere are className, textContent and style/attributes.
  const all = allOf(el);
  assert.ok(all.length > 5, 'a non-trivial tree to inspect');
  for (const n of all) {
    for (const w of n.writes) {
      assert.ok(
        w.prop === 'className' || w.prop === 'textContent' || w.prop.startsWith('attr:'),
        `unexpected property write: ${w.prop}`,
      );
    }
  }
  // The two markup sinks the stub exposes purely to catch were never touched.
  const markupWrites = all.flatMap((n) => n.writes).filter((w) => w.prop === 'innerHTML' || w.prop === 'outerHTML');
  assert.deepEqual(markupWrites, [], 'no markup assignment anywhere in the run');
  // Strings reach the DOM only through the two NON-PARSING channels.
  assert.ok(ux.texts.length > 0, 'and some text went through createTextNode');
});

test('t2: hostile text renders character-for-character and creates no element and no attribute', () => {
  const ux = loadUx();
  const hostile = '<script>alert(1)</script> & `backtick` <img src=x onerror=1> \'quote\' "dq"';
  const { el } = ux.uxRenderCard({
    type: 'AdaptiveCard',
    body: [
      { type: 'TextBlock', text: hostile },
      { type: 'Image', url: hostile, altText: hostile },
      { type: 'ActionSet', actions: [{ type: 'Action.OpenUrl', title: hostile, url: 'javascript:alert(1)' }] },
      { type: 'Input.ChoiceSet', id: hostile, label: hostile, choices: [{ title: hostile }] },
    ],
  });

  // CHARACTER-FOR-CHARACTER: no escaping, because nothing is parsed. The daemon
  // must escape; this must not, and the difference is the whole argument.
  const texts = uxAllText(el);
  assert.ok(texts.includes(hostile), 'the hostile string comes back exactly as given');
  assert.ok(!texts.some((t) => t.includes('&lt;') || t.includes('&amp;')),
    'and is NOT html-escaped — escaping here would be a sign something was parsed');

  // No element was conjured out of the text, and no attribute carries any of it.
  assert.ok(!ux.created.includes('img'), 'the <img ...> in the text created no img');
  assert.ok(!ux.created.includes('script'), 'and no script');
  for (const n of allOf(el)) {
    for (const [k, v] of Object.entries(n.attrs)) {
      assert.ok(!v.includes('alert') && !v.includes('javascript:'),
        `attribute ${k} must not carry record text, got: ${v}`);
    }
  }
});

test('t2: no attribute value anywhere is built from record text', () => {
  const ux = loadUx();
  const marker = 'RECORD-TEXT-MARKER';
  const { el } = ux.uxRenderCard({
    type: 'AdaptiveCard',
    body: [
      { type: 'TextBlock', text: marker, size: marker, color: marker, weight: marker },
      { type: 'Image', url: marker, altText: marker },
      { type: 'Input.Text', id: marker, label: marker, placeholder: marker },
      { type: 'Input.ChoiceSet', id: marker, label: marker, choices: [{ title: marker }] },
      { type: 'ActionSet', actions: [{ type: 'Action.OpenUrl', title: marker, url: marker }] },
      { type: 'Column', width: marker, items: [] },
    ],
  });

  for (const n of allOf(el)) {
    for (const [k, v] of Object.entries(n.attrs)) {
      assert.ok(!v.includes(marker), `attribute ${k}="${v}" was built from record text`);
    }
    for (const [k, v] of Object.entries(n.style)) {
      assert.ok(!v.includes(marker), `style ${k}:${v} was built from record text`);
    }
  }
  // size/color DO reach the className — which is a class name, not an attribute
  // value carrying free text, and is exactly what the daemon does. Stated here so
  // the distinction is deliberate rather than an oversight.
  assert.ok(allOf(el).some((n) => n.className.includes(`ux-size-${marker}`)),
    'the size modifier reaches the class, as the daemon does');
});

test('t2: the renderer emits NO node/edge construct — the uxDefinitionToIr regression guard', () => {
  const ux = loadUx();
  const { el } = ux.uxRenderCard(UX_PARITY_FIXTURES_FOR_TEST.card);

  // ISSUE-85e6a58693579b6d: uxDefinitionToIr (ux.ts:282) lowers a card into a
  // node-and-edge DocumentIR, and publishing that as an "experience mock" produced
  // ~3.37 MB of graph picture where a 7 KB interface belonged. The nearest existing
  // function is the wrong one, and this guard is what stops someone reaching for it.
  const classes = allOf(el).map((n) => n.className).join(' ');
  for (const bad of ['node', 'edge', 'graph', 'mermaid', 'flowchart']) {
    assert.ok(!classes.includes(bad), `no ${bad} construct in the rendered classes`);
  }
  // Nothing SVG either: a node graph would need it.
  assert.ok(!ux.created.some((t) => t.startsWith('NS:')), 'createElementNS is never reached');
  assert.ok(!ux.created.some((t) => ['svg', 'path', 'line', 'polyline', 'g'].includes(t)),
    'and no SVG primitive is created through the HTML factory either');
  // Positively: the output IS card furniture.
  assert.ok(classes.includes('ux-card'));
});

// --- cross-process parity ---------------------------------------------------
// The instrument the LLD flagged as its weakest point and the review asked to
// strengthen. S003 could diff node and edge SETS; the UX authority emits HTML
// STRINGS, so the comparison is made structural instead: both sides are reduced to
// (tag, class, child order) and compared exactly.
//
// Under the earlier, weaker framing a client that rendered every element with the
// right class in a visibly WRONG arrangement would have passed parity and failed
// only a screenshot read. This makes that failure exact. The screenshot read still
// happens at t3 and t7 and is still binding — two structurally identical trees can
// both be unreadable at pane width, and only an image can answer that.

test('t2 PARITY: the daemon tree and the client tree are structurally IDENTICAL over every shared fixture', async () => {
  const { renderUxMockDocument } = await import('../../../../src/workflow/artifacts/companion/ux.js');

  let compared = 0;
  for (const fx of UX_PARITY_FIXTURES) {
    const ux = loadUx();
    const client = shapeOfClient(ux.uxRenderCard(fx.card).el);
    const daemon = withShownUrl(daemonCardShape(renderUxMockDocument(fx.card as never, fx.name)));

    assert.deepEqual(client, daemon,
      `${fx.name}: client and daemon must agree on tag, class and child order.\n  WHY THIS FIXTURE: ${fx.why}`);
    compared += 1;
  }
  // Positive control on the LOOP itself: a harness that compared nothing would
  // pass. This repo has shipped that exact shape of check.
  assert.equal(compared, UX_PARITY_FIXTURES.length);
  assert.ok(compared >= 8, 'every union member is the primary subject of at least one fixture');
});

test('t2 PARITY POSITIVE CONTROL: a re-nested variant makes the structural diff FAIL', async () => {
  const { renderUxMockDocument } = await import('../../../../src/workflow/artifacts/companion/ux.js');

  // Same elements, same classes, different ARRANGEMENT: the inner ColumnSet is
  // hoisted out of its Column to become a sibling. A comparison that cannot tell
  // these apart is not an instrument, so this asserts the diff REJECTS it.
  const real = UX_PARITY_FIXTURES.find((f) => f.name === 'columnset-nested-arrangement')!;
  const renested = UX_RENESTED_FIXTURE;

  const ux = loadUx();
  const clientReal = shapeOfClient(ux.uxRenderCard(real.card).el);
  const daemonRenested = withShownUrl(daemonCardShape(renderUxMockDocument(renested.card as never, 'renested')));

  // The two must NOT be equal — if they were, the normalisation would be throwing
  // away the very thing it exists to compare.
  assert.notDeepEqual(clientReal, daemonRenested,
    'the normalisation must distinguish nesting from sibling order');
  assert.throws(
    () => { assert.deepEqual(clientReal, daemonRenested); },
    'and a deepEqual over the two genuinely throws',
  );

  // Both carry the SAME multiset of (tag, class) pairs, which is what proves the
  // difference detected is arrangement ALONE and not a missing or extra element.
  const bag = (sh: Shape): string[] => {
    const out: string[] = [];
    const walk = (n: Shape): void => {
      out.push(`${n.tag}.${n.cls}`);
      for (const k of n.kids) if (k !== '#text') walk(k);
    };
    walk(sh);
    return out.sort();
  };
  const clientRenested = shapeOfClient(loadUx().uxRenderCard(renested.card).el);
  assert.deepEqual(bag(clientReal), bag(clientRenested),
    'same elements, same classes — only the nesting differs');
});

test('t2 PARITY of vocabulary: every ux-* class the client emits is one the daemon’s stylesheet defines', async () => {
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const { dirname, join } = await import('node:path');
  const here = dirname(fileURLToPath(import.meta.url));
  const daemonSrc = readFileSync(
    join(here, '..', '..', '..', '..', 'src', 'workflow', 'artifacts', 'companion', 'ux.ts'), 'utf8');

  // BOTH sets extracted from source rather than hand-kept: a hand-kept list is a
  // second place for the vocabulary to live and therefore a second place to drift.
  const daemonDefined = new Set((daemonSrc.match(/\.ux-[A-Za-z0-9_-]+/g) ?? []).map((c) => c.slice(1)));
  assert.ok(daemonDefined.size > 20, `extracted ${daemonDefined.size} daemon classes`);

  const emitted = new Set<string>();
  for (const fx of [...UX_PARITY_FIXTURES, UX_RENESTED_FIXTURE]) {
    for (const n of allOf(loadUx().uxRenderCard(fx.card).el)) {
      for (const c of n.className.split(/\s+/)) if (c.length > 0) emitted.add(c);
    }
  }
  // Plus the degradation class, which no valid fixture produces.
  emitted.add(loadUx().uxElement({ type: 'Nope' }, 1).className);

  assert.ok(emitted.size > 15, `the client emitted ${emitted.size} distinct classes`);

  // ONE client-only class, listed explicitly and justified: the daemon has no url
  // element at all because it puts an OpenUrl's url in `title=`. Showing it as
  // visible content is this Story's one stated divergence, so it needs a name the
  // daemon never had to mint. The list is exactly one entry long, and the assertion
  // below pins that — an exemption that could quietly grow would be the loophole.
  const CLIENT_ONLY = new Set(['ux-btn__url']);
  assert.equal(CLIENT_ONLY.size, 1, 'exactly one client-only class, and it is the stated divergence');

  for (const c of [...emitted].sort()) {
    assert.ok(daemonDefined.has(c) || CLIENT_ONLY.has(c),
      `client class .${c} is neither a daemon class nor the one stated divergence`);
  }
  // And the exemption is LIVE — if the divergence were removed, the entry would be
  // dead and this list would be silently wrong.
  assert.ok(emitted.has('ux-btn__url'), 'the client-only class is actually emitted');
});

test('t2 PARITY of coverage: the client handles exactly the union members the daemon’s elementHtml handles', async () => {
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const { dirname, join } = await import('node:path');
  const here = dirname(fileURLToPath(import.meta.url));
  const daemonSrc = readFileSync(
    join(here, '..', '..', '..', '..', 'src', 'workflow', 'artifacts', 'companion', 'ux.ts'), 'utf8');

  // Derived from the daemon's switch, not from a list typed here.
  const fn = daemonSrc.slice(daemonSrc.indexOf('function elementHtml'));
  const body = fn.slice(0, fn.indexOf('\n}'));
  const daemonMembers = [...new Set((body.match(/case '([^']+)':/g) ?? []).map((m) => /'([^']+)'/.exec(m)![1]!))];
  assert.equal(daemonMembers.length, 8, `the daemon handles 8 members, found ${daemonMembers.length}`);

  // And from the client's dispatch, also read from source.
  // Anchored on `if(t===` rather than `t===`: the loose form also matches the tail
  // of `el.weigh|t==='bolder'`, which quietly added 'bolder' and 'lighter' to the
  // member list. Found by running this check, not by reading it.
  const clientMembers = [...new Set((DOCS_UX_SOURCE.match(/if\(t==='([^']+)'\)/g) ?? []).map((m) => /'([^']+)'/.exec(m)![1]!))];
  assert.deepEqual(clientMembers.sort(), daemonMembers.sort(),
    'the two dispatches cover the SAME union — no member handled on one side only');

  // EXECUTED as well as read: each member actually renders something that is not
  // the degradation arm. A dispatch can name a member and still fall through.
  const sample: Record<string, unknown> = {
    'TextBlock': { type: 'TextBlock', text: 'x' },
    'Container': { type: 'Container', items: [] },
    'ColumnSet': { type: 'ColumnSet', columns: [] },
    'Column': { type: 'Column', items: [] },
    'Image': { type: 'Image', url: 'u' },
    'Input.Text': { type: 'Input.Text', id: 'i' },
    'Input.ChoiceSet': { type: 'Input.ChoiceSet', id: 'i', choices: [] },
    'ActionSet': { type: 'ActionSet', actions: [] },
  };
  for (const m of daemonMembers) {
    const el = loadUx().uxElement(sample[m], 1);
    assert.notEqual(el.className, 'ux-unknown', `${m} must have a real branch, not fall through`);
  }
});

test('t2 PARITY of degradation: the client renders ux-unknown for the same inputs the daemon does', async () => {
  const { renderUxMockDocument } = await import('../../../../src/workflow/artifacts/companion/ux.js');

  // The one behaviour where both MUST agree exactly: it is the user-visible
  // admission of a gap, and a reviewer who sees it on one surface and not the other
  // cannot tell whether the design has a hole or the renderer does.
  // NOT including a null element: the daemon THROWS on one (see the asymmetry test
  // below), so there is no daemon output to compare against. Every input here is
  // one both sides actually render.
  const cases: readonly unknown[] = [
    { type: 'RichTextBlock' },
    { type: 'FactSet' },
    { type: '' },
    'string',
    42,
    {},
  ];
  for (const c of cases) {
    const card = { type: 'AdaptiveCard' as const, body: [c] };
    const clientCls = shapeOfClient(loadUx().uxRenderCard(card).el).kids[0];
    const daemonCls = withShownUrl(daemonCardShape(renderUxMockDocument(card as never, 'd'))).kids[0];
    assert.deepEqual(clientCls, daemonCls, `both sides degrade identically for ${JSON.stringify(c)}`);
    assert.equal((clientCls as Shape).cls, 'ux-unknown');
  }
});

test('t2 PARITY, the ONE stated asymmetry: the daemon THROWS on a null element, the client degrades', async () => {
  const { renderUxMockDocument } = await import('../../../../src/workflow/artifacts/companion/ux.js');
  const card = { type: 'AdaptiveCard' as const, body: [{ type: 'TextBlock', text: 'before' }, null] };

  // The daemon's elementHtml switches on `el.type` with no null guard
  // (ux.ts:350-351), so a stored body carrying a null entry takes the WHOLE
  // document down — including the narrated prose, which walks the same tree. Its
  // own childrenOf is defensive about a malformed `items` for exactly this reason;
  // a null ENTRY is the case that guard does not cover.
  assert.throws(() => renderUxMockDocument(card as never, 'null-entry'), /Cannot read properties of null/);

  // The client MUST NOT match that behaviour, and this is the one place mirroring
  // the authority would be wrong: taking the reviewer's document down over an
  // adjunct inverts k4, and the mock is an adjunct. So it degrades in place and the
  // sibling still renders.
  const { el } = loadUx().uxRenderCard(card);
  assert.deepEqual(
    el.children.map((c) => (isText(c) ? '#text' : c.className)), ['ux-text', 'ux-unknown'],
    'the client renders both the good sibling and a visible hole',
  );

  // Recorded rather than fixed: closing it means editing
  // src/workflow/artifacts/companion/ux.ts, and S004 touches no file under src/ —
  // which is the property that makes this the only Story in the Epic needing no
  // daemon rebuild. Worth filing as its own defect.
});

// --- theme discipline -------------------------------------------------------

test('t2 THEME: the ux CSS fragment carries NO literal colour and no var() that can resolve to nothing', async () => {
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const { dirname, join } = await import('node:path');
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, '..', 'docs-review-panel.ts'), 'utf8');

  // COMMENTS STRIPPED FIRST — this file's comments discuss the daemon's hex values
  // at length, including the `#6b7684` that motivated the rule, and a scan that
  // read prose would fail on its own explanation.
  const noComments = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  // Scoped to THIS Story's fragment, between its first and last rule.
  const start = noComments.indexOf('`.ux-card{');
  const end = noComments.indexOf('`.ux-unknown{');
  assert.ok(start > 0 && end > start, 'the ux CSS fragment was located');
  const frag = noComments.slice(start, noComments.indexOf('`', end + 12) + 1);
  assert.ok(frag.includes('.ux-columnset{display:flex'), 'and it is the right fragment');

  // No literal colour of any form.
  assert.doesNotMatch(frag, /#[0-9a-fA-F]{3,8}\b/, 'no hex colour');
  assert.doesNotMatch(frag, /\brgba?\(/, 'no rgb()/rgba()');
  assert.doesNotMatch(frag, /\bhsla?\(/, 'no hsl()/hsla()');
  for (const named of ['white', 'black', 'red', 'green', 'blue', 'grey', 'gray', 'orange', 'yellow', 'transparent']) {
    assert.doesNotMatch(frag, new RegExp(`:\\s*${named}\\b`), `no CSS named colour (${named})`);
  }

  // THE ROW DIRECTION, asserted rather than left to a default. `display:flex` alone
  // is satisfied by a COLUMN, so a CSS-only change to flex-direction:column would
  // stack a ColumnSet vertically with every JS test still green — the gap the build
  // validation gate found. Columns sitting side by side is the most layout-dependent
  // thing a card expresses, so it gets a check of its own.
  const colRule = /\.ux-columnset\{([^}]*)\}/.exec(frag)?.[1] ?? '';
  assert.ok(colRule.includes('display:flex'), 'a ColumnSet is a flex container');
  assert.match(colRule, /flex-direction:row/, 'and explicitly a ROW');
  assert.doesNotMatch(colRule, /flex-direction:\s*column/, 'never a column');
  assert.doesNotMatch(colRule, /flex-wrap:\s*wrap/,
    'and it does not wrap, which would stack narrow columns without naming a direction');

  // Every colour-bearing declaration goes through a theme variable.
  const colourDecls = frag.match(/(?:^|[;{])\s*(?:color|background|border|border-color|fill|stroke)\s*:[^;}]*/g) ?? [];
  assert.ok(colourDecls.length > 8, `found ${colourDecls.length} colour declarations to check`);
  for (const d of colourDecls) {
    assert.match(d, /var\(--it-/, `colour declaration must derive from a theme var: ${d.trim()}`);
  }

  // THE S001 GOTCHA, mechanically: a var() naming a token the shipped set does not
  // define silently drops its declaration. `--it-ok` is exactly such a token — it
  // does not exist — so every var() here must either name a DEFINED token or carry
  // a fallback. This check caught a real `var(--it-ok)` while writing this task.
  const tokens = readFileSync(join(here, '..', 'design-tokens.ts'), 'utf8');
  const defined = new Set((tokens.match(/--it-[a-z-]+(?=:)/g) ?? []));
  assert.ok(defined.has('--it-accent') && defined.has('--it-err'), 'the token set was read');
  for (const ref of frag.match(/var\(--it-[a-z-]+[^)]*\)/g) ?? []) {
    const name = /var\((--it-[a-z-]+)/.exec(ref)![1]!;
    const hasFallback = /var\(--it-[a-z-]+\s*,/.test(ref);
    assert.ok(defined.has(name) || hasFallback,
      `${ref} names an UNDEFINED token and carries no fallback — it would resolve to nothing`);
  }
});

// --- the source string's own contract + shell bookkeeping ------------------

test('t2: DOCS_UX_SOURCE contains no markup sink, scanned with comments stripped first', () => {
  // The string itself, not the file: comments live outside the template literals.
  const code = DOCS_UX_SOURCE;
  for (const sink of ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write']) {
    assert.ok(!code.includes(sink), `DOCS_UX_SOURCE must not contain ${sink}`);
  }
  // And positively: it builds its tree the two allowed ways.
  assert.match(code, /document\.createElement\(/);
  assert.match(code, /document\.createTextNode\(/);
  assert.match(code, /\.textContent=/);
});

test('t2: the emitted shell still contains EXACTLY ONE .innerHTML= after a FIFTH source string joins', () => {
  const html = renderShellFor(SHELL_BASELINE.nonce);
  // The COUNT, not a ban: banning the other three sinks would pass even if a second
  // innerHTML assignment appeared, which is the gap this closes.
  assert.equal((html.match(/\.innerHTML\s*=/g) ?? []).length, 1,
    'one markup-injection site on this surface, still');
  assert.match(html, /el\.innerHTML=marked\.parse/, 'and it is still the guarded vendored body parse');
  // The new string really is in there.
  assert.match(html, /function uxRenderCard\(/, 'DOCS_UX_SOURCE is inlined in the shell');
});

test('t2: ALL FIVE source strings parse together in one scope — the dgEl-collision guard, extended', () => {
  // Extended from four to five IN THIS COMMIT, which is when it earns its keep:
  // S003 hit a real collision when a host const and a source-string function shared
  // the name `dgEl`. `const dgEl` beside `function dgEl` in one script is a
  // SyntaxError that breaks the ENTIRE webview, and neither existing guard sees it —
  // tsc cannot look inside a template literal, and SHELL_BASELINE's hash is
  // perfectly stable over a syntactically invalid script.
  const combined = DOCS_BODY_RENDERER_SOURCE + DOCS_SECTIONS_SOURCE + DOCS_FR_SOURCE
    + DOCS_DIAGRAM_SOURCE + DOCS_UX_SOURCE;
  assert.doesNotThrow(
    () => { new Function('document', 'window', 'marked', 'acquireVsCodeApi', combined); },
    'the five source strings must coexist in one scope without a syntax or redeclaration error',
  );

  // Only meaningful if it can fail: prove it catches the exact shape of the bug,
  // now for a name the FIFTH string introduces.
  assert.throws(
    () => { new Function('document', `${combined}\nconst uxEl = 1;`); },
    /already been declared|Identifier/,
    'a redeclaration of an identifier the ux string introduces must be rejected',
  );
  // And that the ux names really are the ones at risk — the collision is only
  // possible because all five share ONE scope.
  for (const name of ['uxEl', 'uxElement', 'uxRenderCard', 'uxKids', 'uxText', 'uxTextNode']) {
    assert.ok(DOCS_UX_SOURCE.includes(`function ${name}(`), `${name} is declared in the shared scope`);
  }
});

test('t2: the FULL emitted script parses — including the bootstrap consts the five strings share scope with', () => {
  // STRONGER than the five-string check above, and the version that would actually
  // have caught S003's bug: `dgEl` collided between a BOOTSTRAP const and a
  // source-string function, so combining only the source strings misses exactly that
  // class of failure. The build validation gate made this point and it is correct.
  //
  // This lifts the REAL nonce'd script out of the emitted shell and parses it.
  const html = renderShellFor(SHELL_BASELINE.nonce);
  const open = `<script nonce="${SHELL_BASELINE.nonce}">`;
  const at = html.indexOf(open);
  assert.ok(at > 0, 'the nonce\u2019d script was located in the shell');
  const script = html.slice(at + open.length, html.indexOf('</script>', at));
  assert.ok(script.length > 50000, `the whole script was extracted (${script.length} chars)`);
  // It must contain BOTH a bootstrap host const and the fifth string's functions,
  // or this is not testing what it claims to.
  assert.match(script, /const dgHostEl=document\.getElementById/, 'a bootstrap host const is in scope');
  assert.match(script, /function uxRenderCard\(/, 'and the fifth string\u2019s renderer');

  assert.doesNotThrow(
    () => { new Function('acquireVsCodeApi', 'marked', 'window', script); },
    'the complete script — bootstrap consts and all five source strings — must parse',
  );

  // Only meaningful if it can fail: a host const colliding with a ux function is
  // precisely the S003 shape, now proved catchable.
  assert.throws(
    () => { new Function('acquireVsCodeApi', 'marked', 'window', `const uxEl=1;\n${script}`); },
    /already been declared|Identifier/,
    'a host const named like a ux function must be rejected',
  );
});

test('t3/t7: every committed S004 evidence artefact exists at the path its commit claims', async () => {
  // The same guard S003 carries, extended to this Story. S002 committed an evidence
  // PNG to the WRONG path while its message claimed the right one and had to be
  // amended; this makes that a test failure rather than something a reader finds
  // later. t7 adds its own state images to this list.
  const dir = fileURLToPath(new URL(
    '../../../../docs/epics/build-vs-code-plugin-ui-integration-E20260929bfe98ff7/S004/evidence/',
    import.meta.url,
  ));
  const expected = [
    't3-isolated-dark.png',
    't3-isolated-light.png',
    't3-depth-measured.png',
    't3-depth-measured-light.png',
    't3-depth-measurement.md',
    // t7 — the full-surface states, every one named so a file committed to the
    // wrong path is a test failure rather than something a reader discovers.
    't7-state-real-hld.png',
    't7-state-real-s002-lld.png',
    't7-state-real-uxfix-lld.png',
    't7-state-real-fidelity-lld.png',
    't7-state-dual-slot-dark.png',
    't7-state-dual-slot-light.png',
    't7-state-unshowable-dark.png',
    't7-state-unshowable-light.png',
    't7-state-real-record-light.png',
    't7-state-absent.png',
    't7-state-deep-narrow.png',
    't7-control-absent-at-400px.png',
    't7-visual-verification.md',
    't8-build-and-transcripts.md',
  ];
  const { statSync, readFileSync } = await import('node:fs');
  for (const name of expected) {
    const st = statSync(join(dir, name));
    assert.ok(st.isFile(), `${name} is a file`);
    assert.ok(st.size > 1000, `${name} has real content (${st.size} bytes)`);
  }

  // The measurement t4 is REQUIRED to cite must actually carry the numbers, not
  // just exist. A file that exists and says nothing is the failure mode here.
  const m = readFileSync(join(dir, 't3-depth-measurement.md'), 'utf8');
  assert.match(m, /Measured real maximum: element depth 4/, 'the real maximum is stated');
  assert.match(m, /Cost per Container level: exactly 22px/, 'the per-level cost is stated');
  assert.match(m, /committed images show the CORRECTED renderer/i,
    'the note states which renderer the committed images show — an earlier version claimed both themes read correctly while the images showed the pre-fix chip');
  assert.match(m, /DOM depths, not element depths/,
    'and distinguishes the two depth notions, since naming the metric is this file\u2019s job');
  assert.match(m, /ELEMENT NESTING/, 'and the METRIC is named — the plan review’s HIGH finding');

  // The t7 note must record the four states its acceptance checks name, and the
  // clipping CONTROL — a note that claimed a control without one would be the
  // failure mode here.
  const v = readFileSync(join(dir, 't7-visual-verification.md'), 'utf8');
  for (const claim of [/dual-slot/i, /absent/i, /unshowable/i, /SYNTHETIC depth-9/]) {
    assert.match(v, claim, `the verification note records ${claim}`);
  }
  assert.match(v, /t7-control-absent-at-400px\.png/,
    'and names the control image that shows the clipping is pre-existing');

  // t8's transcript must carry a COMPUTED delta and the exit codes, not a claim
  // that it ran something. A transcript asserting success without the numbers is
  // the shape this repo has shipped before.
  const t8 = readFileSync(join(dir, 't8-build-and-transcripts.md'), 'utf8');
  assert.match(t8, /S003 baseline 0\.5\.9\s+: 247667 bytes/, 'the baseline is the real artefact size');
  // RAW OUTPUT, not prose dressed as output. An earlier version of the note carried
  // a hand-formatted block under an `ls -l` prompt; the gate caught it. A real
  // `ls -l` line carries a mode string and an owner, which prose does not.
  assert.match(t8, /^-rw[-rwx]{7}@?\s+\d+\s+\S+\s+\S+\s+\d+\s.*insrc-vscode-0\.5\.10\.vsix$/m,
    'the ls block is verbatim command output');
  assert.match(t8, /^-rw[-rwx]{7}@?\s+\d+\s+\S+\s+\S+\s+247667\s.*insrc-vscode-0\.5\.9\.vsix$/m,
    'and shows the baseline artefact at its real size');
  assert.match(t8, /delta\s+:\s+[+-][\d,]+ bytes \([+-][\d.]+%\)/,
    'and the delta is a computed number with its percentage');
  assert.match(t8, /npx tsc --noEmit[^\n]*\n(?:[^\n]*\n)?exit 0/,
    'the typecheck exit code is recorded');
  assert.match(t8, /NO daemon rebuild is required/i, 'and the no-daemon-rebuild fact is stated with its reason');
  // Scoped to the CHANGE-SET BLOCK, not the whole note. The prose legitimately
  // cites `src/workflow/artifact-content.ts:76` when explaining WHY no daemon
  // rebuild is needed, and a scan that read prose would fail on the explanation —
  // the same mistake a source scan in this repo has made before.
  const diffBlock = /git diff --name-only [0-9a-f]+\.\.HEAD\n([\s\S]*?)```/.exec(t8)?.[1] ?? '';
  assert.ok(diffBlock.includes('vscode-plugin/src/chat/'), 'the change-set block was located');
  const underSrc = diffBlock.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('src/'));
  assert.deepEqual(underSrc, [], 'the committed change set contains nothing under src/');
});

// ---------------------------------------------------------------------------
// S004/t4 — the depth bound, chosen from t3's measurement.
//
// 24: six times the measured real maximum of 4, and well beyond the ~16 levels at
// which a 380px pane has no content width left. So the layout degrades on its own
// long before the guard could engage, which is what makes this a SAFETY limit
// rather than the presentation rule alternative a4 was rejected for.
// ---------------------------------------------------------------------------

test('t4: the bound is a SINGLE named constant with no second hard-coded copy', () => {
  const decls = DOCS_UX_SOURCE.match(/UX_DEPTH_MAX\s*=\s*\d+/g) ?? [];
  assert.equal(decls.length, 1, 'declared exactly once');
  assert.match(decls[0]!, /UX_DEPTH_MAX=24/);
  // Every USE goes through the name. A literal 24 anywhere in the walk would be the
  // second copy this check exists to forbid.
  const uses = DOCS_UX_SOURCE.match(/UX_DEPTH_MAX/g) ?? [];
  assert.ok(uses.length >= 3, 'the name is used, not just declared');
  const walk = DOCS_UX_SOURCE.slice(DOCS_UX_SOURCE.indexOf('function uxElement'));
  assert.doesNotMatch(walk, /depth>24|>\s*24\b/, 'no literal bound in the walk');
});

test('t4: the chosen value is strictly greater than the plan floor AND than the measured real maximum', async () => {
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const { dirname, join } = await import('node:path');
  const here = dirname(fileURLToPath(import.meta.url));
  const measurement = readFileSync(join(
    here, '..', '..', '..', '..',
    'docs/epics/build-vs-code-plugin-ui-integration-E20260929bfe98ff7/S004/evidence/t3-depth-measurement.md',
  ), 'utf8');

  // The justification is TRACEABLE: the measurement file is the source of the
  // numbers, and this reads them back out of it rather than restating them.
  const realMax = Number(/Measured real maximum: element depth (\d+)/.exec(measurement)?.[1]);
  assert.equal(realMax, 4, 'the measurement states the real maximum');

  const bound = Number(/UX_DEPTH_MAX=(\d+)/.exec(DOCS_UX_SOURCE)?.[1]);
  assert.equal(bound, 24);
  assert.ok(bound > 9, 'above the floor the plan retained');
  assert.ok(bound > realMax * 5, `and far above the measured real maximum of ${realMax}`);
});

test('t4: EVERY one of the four real records renders UNTRUNCATED — the bound never fires on authored content', async () => {
  const { readFileSync, existsSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const { dirname, join } = await import('node:path');
  const here = dirname(fileURLToPath(import.meta.url));
  const ledger = join(here, '..', '..', '..', '..', '.insrc', 'artifacts');
  const files = [
    'LLD-85e6a58693579b6d-S001.json', 'LLD-7c219c7471d79496-S001.json',
    'LLD-bfe98ff7f97178cf-s2.json', 'HLD-bfe98ff7f97178cf.json',
  ];

  let checked = 0;
  for (const f of files) {
    const p = join(ledger, f);
    if (!existsSync(p)) continue;
    const record = JSON.parse(readFileSync(p, 'utf8')).body.uxDefinition;
    const { el } = loadUx().uxRenderCard(record);
    // The guard's own degradation names depth. NONE may appear.
    const truncated = allOf(el).filter((n) => n.className === 'ux-unknown' && /nesting deeper/.test(n.textContent));
    assert.deepEqual(truncated.map((n) => n.textContent), [], `${f} renders untruncated`);
    checked += 1;
  }
  assert.equal(checked, 4, 'all four were found and checked');
});

test('t4: a synthetic over-deep structure TRIPS the guard, names depth as the reason, and TERMINATES', () => {
  // Built to exceed the bound rather than to look plausible: this is the input the
  // guard exists for, and no authored card resembles it.
  let deep: unknown = { type: 'TextBlock', text: 'leaf' };
  for (let i = 0; i < 40; i += 1) deep = { type: 'Container', items: [deep] };

  const { el } = loadUx().uxRenderCard({ type: 'AdaptiveCard', body: [deep] });
  const cut = allOf(el).filter((n) => n.className === 'ux-unknown');
  assert.equal(cut.length, 1, 'exactly one cut point, at the bound');
  assert.match(cut[0]!.textContent, /nesting deeper than 24 levels/,
    'and it NAMES depth as the reason, so a reviewer can tell a guard from a truncation');
  // TERMINATES: the tree is bounded, not 40 deep.
  const depthOf = (n: BodyStub): number =>
    1 + Math.max(0, ...n.children.filter((c): c is BodyStub => !isText(c)).map(depthOf));
  assert.ok(depthOf(el) <= 26, `the walk stopped (tree depth ${depthOf(el)})`);
});

test('t4: a CYCLIC structure terminates — the case that would hang without a bound', () => {
  // A self-referential body is reachable: a card is read from a STORED artifact and
  // can be hand-edited past its type. Without the bound this recurses forever, which
  // is the difference between a guard and a nicety.
  const cyclic: Record<string, unknown> = { type: 'Container' };
  cyclic['items'] = [cyclic];

  const { el } = loadUx().uxRenderCard({ type: 'AdaptiveCard', body: [cyclic] });
  const cut = allOf(el).filter((n) => n.className === 'ux-unknown');
  assert.equal(cut.length, 1, 'the cycle is cut exactly once');
  assert.match(cut[0]!.textContent, /nesting deeper than 24 levels/);
});

test('t4 MUTATION: removing the bound makes the pathological case diverge', () => {
  // The bound is proved to be LOAD-BEARING by removing it: the same cyclic input
  // that terminates above recurses without it. Run as a real mutation with the
  // guard disabled through the exposed setter, and bounded by a stack overflow
  // rather than by hanging the suite.
  const ux = loadUx();
  ux.setDepthMax(null);

  const cyclic: Record<string, unknown> = { type: 'Container' };
  cyclic['items'] = [cyclic];

  assert.throws(
    () => { ux.uxRenderCard({ type: 'AdaptiveCard', body: [cyclic] }); },
    (err: unknown) => err instanceof RangeError || /call stack/i.test(String(err)),
    'without the bound the same input recurses until the stack is exhausted',
  );

  // And with it restored, the very same input is fine — so the bound is the thing
  // that made the difference, not something else about the run.
  ux.setDepthMax(24);
  assert.doesNotThrow(() => ux.uxRenderCard({ type: 'AdaptiveCard', body: [cyclic] }));
});

// ---------------------------------------------------------------------------
// S004/t5 — the sc4 experience slot factory. Still INERT: t6 mounts it.
//
// Split here by the plan's critique so the Story's one novel piece (the renderer)
// did not review alongside its most boilerplate piece (this, an almost line-for-line
// mirror of S003's dgPickRef/dgBuildDiagramSlot).
// ---------------------------------------------------------------------------

const UX_REF_T5 = { kind: 'ux-mock', relPath: 'docs/epics/x/S004/ux-mock.html', title: 'Experience mock' };
/** The REAL hazard S003 recorded, reproduced: THREE distinct daemon renderers all
 *  stamp `kind:'diagram-mermaid'` (companion/render.ts:104 ER, :205 sequence, :243
 *  component), so one kind covers three different companions — which is why S003's
 *  factory takes a record BUNDLE and why a ref cannot identify its own source
 *  record. Plus the declared-but-unproduced `diagram-html`. An earlier version of
 *  this fixture carried only two refs and never reproduced the three-renderer case
 *  the acceptance check names; the build validation gate caught that. */
const DIAGRAM_REFS = [
  { kind: 'diagram-mermaid', relPath: 'docs/epics/x/er-diagram.html', title: 'Entity model' },
  { kind: 'diagram-mermaid', relPath: 'docs/epics/x/sequence-diagram.html', title: 'Call sequence' },
  { kind: 'diagram-mermaid', relPath: 'docs/epics/x/component-diagram.html', title: 'Component topology' },
  { kind: 'diagram-html', relPath: 'docs/epics/x/component.html', title: 'Component diagram' },
];

test('t5 PICKER PARTITION: uxPickRef takes the ux-mock ref and ONLY it, across all FOUR diagram refs', () => {
  const ux = loadUx();
  // The DIAGRAM refs come first so position cannot stand in for kind, and three of
  // them share ONE kind so the S003 hazard is actually in the fixture.
  const all = [...DIAGRAM_REFS, UX_REF_T5];
  assert.equal(DIAGRAM_REFS.filter((r) => r.kind === 'diagram-mermaid').length, 3,
    'three refs share one kind — the case that makes a ref unable to identify its source record');

  assert.equal(ux.uxPickRef(all), UX_REF_T5, 'the ux ref, by identity');

  // And the OTHER picker still selects exactly what it selected before, so the two
  // PARTITION the array rather than overlap.
  const dgPickRef = new Function('document', `${DOCS_DIAGRAM_SOURCE}; return dgPickRef;`)({
    createElement: () => ({}), createElementNS: () => ({}),
  }) as (c: unknown) => unknown;
  assert.equal(dgPickRef(all), DIAGRAM_REFS[0], 'dgPickRef still takes the first diagram ref');
  // Neither picker can ever return the other's ref, over the whole fixture.
  assert.ok(!DIAGRAM_REFS.includes(ux.uxPickRef(all) as never), 'ux never yields a diagram ref');
  assert.notEqual(dgPickRef(all), UX_REF_T5, 'and the diagram picker never yields the ux ref');
});

test('t5: a companions array of DIAGRAM refs only yields NO ux ref', () => {
  const ux = loadUx();
  assert.equal(ux.uxPickRef(DIAGRAM_REFS), undefined,
    'no ux-mock ref means none — this is what routes ac3’s dominant path to absent');
  // And the degenerate inputs a stored body can actually carry.
  for (const bad of [undefined, null, 'not an array', {}, [], [null], [{ kind: 'nope' }]]) {
    assert.equal(ux.uxPickRef(bad), undefined, `${JSON.stringify(bad)} yields no ref`);
  }
});

test('t5: the three sc4 states come back correctly from the factory in isolation', () => {
  const ux = loadUx();
  const card = { type: 'AdaptiveCard', body: [{ type: 'TextBlock', text: 'x' }] };

  // ABSENT — no ref AND no record. The dominant path.
  const absent = ux.uxBuildMockSlot(undefined, undefined, undefined);
  assert.deepEqual(absent, { state: 'absent' }, 'absent carries no label, body or link');

  // RENDERED — a record, with or without a ref.
  const rendered = ux.uxBuildMockSlot(card, UX_REF_T5, 'sec-1');
  assert.equal(rendered.state, 'rendered');
  assert.equal(rendered.kind, 'experience');
  assert.equal(rendered.label, 'Experience mock');
  assert.equal(rendered.anchorSlug, 'sec-1');
  assert.equal((rendered.body as BodyStub).className, 'ux-card');
  assert.deepEqual(rendered.linkOut, { relPath: UX_REF_T5.relPath, title: UX_REF_T5.title });

  // UNSHOWABLE — a ref naming a record this surface does not have.
  const unshowable = ux.uxBuildMockSlot(undefined, UX_REF_T5, undefined);
  assert.equal(unshowable.state, 'unshowable');
  assert.match(unshowable.reason!, /experience record is not available/,
    'the reason NAMES what was referenced — a generic failure is indistinguishable from a document that has no mock');
  assert.deepEqual(unshowable.linkOut, { relPath: UX_REF_T5.relPath, title: UX_REF_T5.title },
    'and the link-out is offered, so the reviewer can still reach the authentic companion');
});

test('t5: `body: []` and a malformed record are treated as ABSENT, not as a broken card', () => {
  const ux = loadUx();
  for (const record of [undefined, null, {}, { body: [] }, { body: null }, { body: 'x' }, 'card', 42]) {
    assert.deepEqual(ux.uxBuildMockSlot(record, undefined, undefined), { state: 'absent' },
      `${JSON.stringify(record)} with no ref is absent`);
    // With a ref present the SAME inputs route to the stated failure instead.
    assert.equal(ux.uxBuildMockSlot(record, UX_REF_T5, undefined).state, 'unshowable',
      `${JSON.stringify(record)} with a ref is unshowable`);
  }
});

test('t5: a record with NO ref still renders — the record gates content, the ref gates label and link', () => {
  const ux = loadUx();
  const slot = ux.uxBuildMockSlot({ type: 'AdaptiveCard', body: [{ type: 'TextBlock', text: 'x' }] }, undefined, undefined);
  assert.equal(slot.state, 'rendered');
  assert.equal(slot.label, 'Experience mock', 'the DEFAULT label, since no ref supplied one');
  assert.equal(slot.linkOut, undefined, 'and NO link-out, because there is no companion to link to');
});

test('t5: the label comes from the REF, never hard-coded per call', () => {
  const ux = loadUx();
  const card = { type: 'AdaptiveCard', body: [{ type: 'TextBlock', text: 'x' }] };
  const custom = { ...UX_REF_T5, title: 'What the approval flow should feel like' };
  assert.equal(ux.uxBuildMockSlot(card, custom, undefined).label, custom.title);
  // An empty or missing title falls back rather than producing a blank heading.
  assert.equal(ux.uxBuildMockSlot(card, { ...UX_REF_T5, title: '' }, undefined).label, 'Experience mock');
  // This is what lets t6 prove the two slots are distinguishable: each takes its
  // label from its OWN ref.
  assert.equal(companionVisualKind('ux-mock'), 'experience');
  assert.equal(companionVisualKind('diagram-mermaid'), 'diagram');
});

test('t5: ac3’s dominant path is ZERO DOM ACTIVITY — the absent gate returns before anything is created', () => {
  const ux = loadUx();
  const before = ux.created.length;
  assert.deepEqual(ux.uxBuildMockSlot(undefined, undefined, undefined), { state: 'absent' });
  assert.equal(ux.created.length, before,
    'not one createElement call: "no slot" is the ABSENCE OF DOM ACTIVITY, not a hidden element');
  // Same for the malformed-record-with-no-ref case, which takes the same gate.
  ux.uxBuildMockSlot({ body: 'nope' }, undefined, undefined);
  assert.equal(ux.created.length, before);
});

test('t5: a renderer throw degrades to the stated failure rather than escaping the factory', () => {
  const ux = loadUx();
  // A record whose body getter throws mid-walk — a stored artifact can be shaped
  // in ways the type forbids, and taking the document down over an adjunct inverts k4.
  const hostile = { type: 'AdaptiveCard', body: [] as unknown[] };
  Object.defineProperty(hostile, 'body', {
    get() { return new Proxy([{ type: 'TextBlock', text: 'x' }], { get(t, k) { if (k === 'forEach') throw new Error('boom'); return Reflect.get(t, k); } }); },
  });
  const slot = ux.uxBuildMockSlot(hostile, UX_REF_T5, undefined);
  assert.equal(slot.state, 'unshowable');
  assert.match(slot.reason!, /could not be drawn/);
  assert.deepEqual(slot.linkOut, { relPath: UX_REF_T5.relPath, title: UX_REF_T5.title });
});

test('t5: the bound is PASSED IN, not re-declared — still one named constant after the factory lands', () => {
  const decls = DOCS_UX_SOURCE.match(/UX_DEPTH_MAX\s*=\s*\d+/g) ?? [];
  assert.equal(decls.length, 1, 'the factory did not mint a second copy');
  assert.ok(!/uxBuildMockSlot[\s\S]*UX_DEPTH_MAX\s*=/.test(DOCS_UX_SOURCE),
    'and the factory does not reassign it');
});

test('t5/t6: the factory is inlined and called at EXACTLY ONE site', () => {
  const html = renderShellFor(SHELL_BASELINE.nonce);
  assert.match(html, /function uxBuildMockSlot\(/, 'the factory is inlined');
  // At t5 this asserted NO call. t6 is the single call that changes the surface, so
  // the check becomes "exactly one" — reverting that one call restores S003 exactly.
  assert.equal((html.match(/uxBuildMockSlot\(/g) ?? []).length, 2,
    'one declaration and one call site, and no more');
  assert.equal((html.match(/uxPlaced=dgMountSlot\(/g) ?? []).length, 1, 'mounted once');
  // REUSES s3's mounter rather than minting a second one.
  assert.doesNotMatch(html, /function uxMountSlot\(/, 'no second mounter exists');
});

// ---------------------------------------------------------------------------
// S004/t6 — THE MOUNT. The one call that changes what a reviewer sees.
//
// Everything before this was additive and inert. Removing the two lines this task
// adds restores the S003 surface exactly, which is the property the byte-identical
// diagram assertion below proves from the other direction.
// ---------------------------------------------------------------------------

const UX_CARD_T6 = { type: 'AdaptiveCard', body: [{ type: 'TextBlock', text: 'the approval flow' }] };
const UX_REF_T6 = { kind: 'ux-mock', relPath: 'docs/epics/x/S004/ux-mock.html', title: 'Experience mock' };

test('t6 GATE: the four-combination table, driven through the SHIPPED bootstrap', () => {
  const base = { artifactId: 'a', markdown: DG_MD, openQuestions: [], blocked: false, sections: DG_SECTIONS };

  // ref absent + record absent -> ABSENT. 641 of 645 ledger bodies.
  let r = runWebview();
  r.deliver({ ...base });
  assert.equal(uxSlotsIn(r).length, 0, 'no ref + no record -> no slot');

  // ref present + record present -> RENDERED
  r = runWebview();
  r.deliver({ ...base, uxDefinition: UX_CARD_T6, companions: [UX_REF_T6] });
  assert.equal(uxSlotsIn(r).length, 1);
  assert.ok(allOf(uxSlotsIn(r)[0]!).some((n) => n.className === 'ux-card'), 'the card is drawn');

  // ref present + record absent -> UNSHOWABLE
  r = runWebview();
  r.deliver({ ...base, companions: [UX_REF_T6] });
  let text = allOf(uxSlotsIn(r)[0]!).map((n) => n.textContent).join('\n');
  assert.match(text, /could not be shown here/);

  // ref absent + record present -> RENDERED, with the DEFAULT label and NO link-out.
  // The RECORD gates content and the REF gates only label and link. That row looks
  // like a bug and is a convention, consistent with S003 — stating the consequence
  // is what stops a later Story "fixing" it back into one.
  r = runWebview();
  r.deliver({ ...base, uxDefinition: UX_CARD_T6 });
  assert.equal(uxSlotsIn(r).length, 1, 'the record alone is enough to render');
  text = allOf(uxSlotsIn(r)[0]!).map((n) => n.textContent).join('\n');
  assert.ok(text.includes('Experience mock'), 'the DEFAULT label');
  assert.equal(text.includes('Full version:'), false, 'and NO link-out — there is no companion to link to');
});

test('t6: ac3’s dominant path is ZERO DOM ACTIVITY from the experience path', () => {
  const r = runWebview({ countCreates: true });
  const before = r.created.length;
  r.deliver({ artifactId: 'a', markdown: DG_MD, openQuestions: [], blocked: false, sections: DG_SECTIONS });
  const after = r.created.length;

  assert.equal(uxSlotsIn(r).length, 0);
  assert.equal(r.experience.children.length, 0, 'the host has NO children — no frame, no reserved space');
  // Nothing the experience path would have built exists anywhere in this run.
  assert.equal([...allOf(r.body), ...allOf(r.experience)].filter((n) => n.className === 'ux-card').length, 0,
    'no card was created');
  void before; void after;

  // And the comparison that gives the claim teeth: the SAME document WITH a record
  // creates strictly more elements, so the absence above is the gate working rather
  // than the harness counting nothing.
  const withRecord = runWebview({ countCreates: true });
  withRecord.deliver({
    artifactId: 'a', markdown: DG_MD, openQuestions: [], blocked: false, sections: DG_SECTIONS,
    uxDefinition: UX_CARD_T6, companions: [UX_REF_T6],
  });
  assert.ok(withRecord.created.length > r.created.length,
    `the experience path creates elements only when there is something to draw (${r.created.length} -> ${withRecord.created.length})`);
});

test('t6: `body: []` and a malformed record are ABSENT through the real bootstrap', () => {
  for (const uxDefinition of [{ type: 'AdaptiveCard', body: [] }, { body: 'nope' }, {}]) {
    const r = runWebview();
    r.deliver({ artifactId: 'a', markdown: DG_MD, openQuestions: [], blocked: false, sections: DG_SECTIONS, uxDefinition });
    assert.equal(uxSlotsIn(r).length, 0, `${JSON.stringify(uxDefinition)} with no ref is absent`);
  }
});

test('t6: adding the experience slot leaves the DIAGRAM slot BYTE-IDENTICAL to what S003 renders', () => {
  // The symmetric proof of S003's sha256-identical dual-ref result: s3 proved a
  // ux-mock ref changed its surface by zero pixels; this proves the mock's ARRIVAL
  // changes the diagram's rendering by nothing at all.
  const base = {
    artifactId: 'a', markdown: DG_MD, openQuestions: [], blocked: false, sections: DG_SECTIONS,
    erDefinition: DG_ER, companions: [DG_REF],
  };
  const diagramOnly = runWebview();
  diagramOnly.deliver(base);

  const withExperience = runWebview();
  withExperience.deliver({ ...base, uxDefinition: UX_CARD_T6, companions: [DG_REF, UX_REF_T6] });

  assert.equal(dgShape(withExperience.diagram), dgShape(diagramOnly.diagram),
    'the diagram host renders identically whether or not a mock is present');
  assert.equal(uxSlotsIn(withExperience).length, 1, 'while the experience slot did appear');
});

test('t6: the two slots are PEERS — diagram first, experience second, in the emitted markup', () => {
  const html = renderShellFor(SHELL_BASELINE.nonce);
  const dgHost = html.indexOf('id="insrc-docs-diagram"');
  const uxHost = html.indexOf('id="insrc-docs-experience"');
  const body = html.indexOf('id="insrc-docs-body"');
  assert.ok(dgHost > 0 && uxHost > 0);
  assert.ok(dgHost < uxHost, 'diagram first — it answers "what is this made of"');
  assert.ok(uxHost < body, 'and both sit above the document body, as one companions region');
});

test('t6 IDEMPOTENCE: two identical messages leave exactly ONE slot; a third carrying neither leaves none', () => {
  const r = runWebview();
  const msg = {
    artifactId: 'a', markdown: DG_MD, openQuestions: [], blocked: false, sections: DG_SECTIONS,
    uxDefinition: UX_CARD_T6, companions: [UX_REF_T6],
  };
  r.deliver(msg);
  assert.equal(uxSlotsIn(r).length, 1);
  r.deliver(msg);
  assert.equal(uxSlotsIn(r).length, 1, 'the host is cleared before the slot is placed');
  r.deliver({ artifactId: 'a', markdown: DG_MD, openQuestions: [], blocked: false, sections: DG_SECTIONS });
  assert.equal(uxSlotsIn(r).length, 0, 'and a document with neither leaves none behind');
});

test('t6: a forced throw in the experience slot build leaves SIX other surfaces intact — including the diagram', () => {
  const r = runWebview({ breakExperience: true });
  r.deliver({
    artifactId: 'a', markdown: DG_MD, openQuestions: ['q1'], blocked: false, sections: DG_SECTIONS,
    erDefinition: DG_ER, companions: [DG_REF, UX_REF_T6], uxDefinition: UX_CARD_T6,
  });

  // k4: losing a reviewer's document over an adjunct is the inversion this guards.
  assert.ok(allOf(r.body).length > 0, '1. the body still rendered');
  assert.ok(allOf(r.sections).length > 0, '2. the section chooser');
  assert.ok(allOf(r.oq).length > 0, '3. the open questions');
  assert.deepEqual(r.controls(), ALL_ON, '4. the decision controls');
  assert.equal(uxSlotsIn(r).length, 0, '5. and the experience slot simply did not appear');
  assert.equal(dgSlotsIn(r).length, 1, '6. THE DIAGRAM SLOT IS UNTOUCHED — one peer cannot take the other down');
});

test('t6: a resolvable anchor places the slot beside its heading; a stale one falls back rather than dropping it', () => {
  // The slug must be one the BODY actually stamped, read from a plain run — a
  // section-index slug is not necessarily the id that ended up on a heading, and
  // asserting against the wrong one would test the harness rather than the mount.
  const plain = runWebview();
  plain.deliver({ artifactId: 'a', markdown: DG_MD, openQuestions: [], blocked: false, sections: DG_SECTIONS });
  const stampedIds = plain.body.children.filter((c) => c.tagName.startsWith('h')).map((c) => c.id);
  assert.ok(stampedIds.length > 1, 'the body stamped some heading ids to anchor against');

  const anchored = runWebview();
  anchored.deliver({
    artifactId: 'a', markdown: DG_MD, openQuestions: [], blocked: false, sections: DG_SECTIONS,
    uxDefinition: UX_CARD_T6, companions: [UX_REF_T6],
    experienceAnchorSlug: stampedIds[1],
  });
  assert.equal(uxSlotsIn(anchored).length, 1, 'the slot exists');
  assert.ok(anchored.body.children.some((n) => n.className === 'insrc-dg-slot insrc-dg-slot--experience'),
    'and it was placed INTO the body, beside the heading it names');

  const stale = runWebview();
  stale.deliver({
    artifactId: 'a', markdown: DG_MD, openQuestions: [], blocked: false, sections: DG_SECTIONS,
    uxDefinition: UX_CARD_T6, companions: [UX_REF_T6], experienceAnchorSlug: 'no-such-section',
  });
  assert.equal(uxSlotsIn(stale).length, 1,
    'a stale anchor falls back to the default position rather than dropping the visual');
});

test('t6: a DIGIT-LEADING anchor slug places the EXPERIENCE slot without throwing', () => {
  // insrc NUMBERS its headings, so `## 2. Contract details` slugifies to
  // `2-contract-details` — and `querySelector('#2-contract-details')` throws a
  // SyntaxError, because a bare CSS identifier may not start with a digit. S003 hit
  // this and replaced the selector with an id walk; this proves the EXPERIENCE slot
  // inherits that fix BEHAVIOURALLY, not just by sharing a function name. The
  // earlier version checked the reuse statically and ran the behaviour on the
  // DIAGRAM slot only — the build validation gate was right that those are not the
  // same claim.
  // The shared DG_MD fixture has UNNUMBERED headings, so it cannot produce the slug
  // shape this test is about. Real insrc documents number theirs.
  const numberedMd = '# Low-level design\n\nIntro.\n\n## 2. Contract details\n\nBody.\n';
  const numberedSections = deriveSectionIndex(numberedMd);

  const plain = runWebview();
  plain.deliver({ artifactId: 'a', markdown: numberedMd, openQuestions: [], blocked: false, sections: numberedSections });
  const digitLed = plain.body.children
    .filter((c) => c.tagName.startsWith('h')).map((c) => c.id).filter((id) => /^[0-9]/.test(id));
  assert.ok(digitLed.length > 0,
    `the body stamps a digit-leading heading id (got ${JSON.stringify(plain.body.children.filter(c => c.tagName.startsWith('h')).map(c => c.id))})`);

  const r = runWebview();
  r.deliver({
    artifactId: 'a', markdown: numberedMd, openQuestions: [], blocked: false, sections: numberedSections,
    uxDefinition: UX_CARD_T6, companions: [UX_REF_T6], experienceAnchorSlug: digitLed[0],
  });
  assert.equal(uxSlotsIn(r).length, 1, 'the slot survived a digit-leading slug');
  assert.ok(r.body.children.some((n) => n.className === 'insrc-dg-slot insrc-dg-slot--experience'),
    'and anchored INTO the body beside that heading rather than falling back');
});

test('t6: the mount REUSES s3’s dgMountSlot, so the digit-leading-slug fix is inherited and not re-implemented', () => {
  const html = renderShellFor(SHELL_BASELINE.nonce);
  // One mounter, called twice. A second implementation would be a second place for
  // the querySelector('#'+slug) bug to come back — it THROWS on a digit-leading
  // slug, and insrc numbers its headings.
  assert.equal((html.match(/function dgMountSlot\(/g) ?? []).length, 1, 'exactly one mounter exists');
  assert.equal((html.match(/dgMountSlot\(/g) ?? []).length, 3, 'declared once, called twice');
  assert.doesNotMatch(html, /querySelector\('#'\+/, 'and the selector form is nowhere in the shell');
});

test('t6: docs-sections.ts is BYTE-IDENTICAL — this Story mints no section identity', (t) => {
  const run = git(t, { window: { from: 'docs/epics/build-vs-code-plugin-ui-integration-E20260929bfe98ff7/S004/PLAN.md', to: 'docs/epics/build-vs-code-plugin-ui-integration-E20260929bfe98ff7/S004/BUILD.md' } });
  if (!run) return;
  const planCommit = run('log', '--format=%H', '-1', '--', 'docs/epics/build-vs-code-plugin-ui-integration-E20260929bfe98ff7/S004/PLAN.md').trim();
  // Closed at the Story's BUILD approval, as the src/ guard above is (ISSUE-2f07f59c).
  const buildCommit = run('log', '--format=%H', '-1', '--', 'docs/epics/build-vs-code-plugin-ui-integration-E20260929bfe98ff7/S004/BUILD.md').trim();
  const changed = run('diff', '--name-only', `${planCommit}..${buildCommit}`);
  assert.ok(!changed.includes('docs-sections.ts'),
    'S004 consumes sc3 and mints none of its own section identity');
});

// E2 S004/t3 — the delivery board's entry point: open the pane on one artifact,
// read-only when it is not awaiting review.
test('openArtifact opens a non-pending artifact with feedback only, and a pending one as its list row does', async () => {
  const fc = fakeChannel();
  const { client, calls } = fakeClient();
  const host = createDocsReviewHost({ createPanel: () => fc.channel, client });
  host.openArtifact({ artifactId: 'BUILD-abc-s7', mdPath: 'docs/e/S007/BUILD.md' });
  await tick();
  await tick();
  assert.deepEqual(calls.content, ['docs/e/S007/BUILD.md'], 'a non-pending artifact is read by its docs/ path');
  const ro = fc.posted.filter((p) => p.payload.type === 'docs-content').at(-1)!;
  assert.equal(ro.payload.artifactId, 'BUILD-abc-s7');
  assert.equal(ro.payload['readOnly'], true);
  // A decision on it is dropped by the existing guard: it is not pending.
  fc.send(env('docs-decision', { artifactId: 'BUILD-abc-s7', decision: 'approve', comments: [] }));
  await tick();
  assert.deepEqual(calls.decide, []);

  // The pending one opens as a list-row click: no readOnly key, its actions intact.
  host.openArtifact({ artifactId: 'LLD-abc-s7', mdPath: 'docs/e/S007/LLD.md' });
  await tick();
  await tick();
  assert.equal(calls.content.at(-1), 'LLD-abc-s7', 'opened by id, as a list row is');
  const live = fc.posted.filter((p) => p.payload.type === 'docs-content').at(-1)!;
  assert.equal(live.payload.artifactId, 'LLD-abc-s7');
  assert.equal('readOnly' in live.payload, false);
  assert.equal(live.payload['commentable'], true);
  fc.send(env('docs-decision', { artifactId: 'LLD-abc-s7', decision: 'approve', comments: [] }));
  await tick();
  assert.deepEqual(calls.decide, [{ path: DOC_PATH, decision: 'approve', comments: [] }]);

  // Webview side: read-only says so and offers feedback only; without the flag all three stay.
  const w = runWebview();
  w.deliver({ artifactId: 'BUILD-abc-s7', markdown: '# Build', openQuestions: [], blocked: false, commentable: false, readOnly: true });
  assert.deepEqual(w.controls(), { approve: 'hidden', reject: 'hidden', feedback: 'on' });
  assert.equal(w.bar.state.textContent, 'not awaiting review · feedback only');
  const w2 = runWebview();
  w2.deliver({ artifactId: 'LLD-abc-s7', markdown: '# Doc', openQuestions: [], blocked: false, commentable: true });
  assert.deepEqual(w2.controls(), ALL_ON);
  assert.equal(w2.bar.state.textContent, 'pending review');
});

test('openArtifact on a cold pane decides pending from its own pending read, even when the boot ping\'s refresh is superseded', async () => {
  const fc = fakeChannel();
  const lld: DocsArtifactSummary[] = [{ id: 'LLD-abc-s7', kind: 'LLD', title: 'Docs review pane', status: 'pending' }];
  const gates: Array<(v: DocsArtifactSummary[]) => void> = [];
  const contents: string[] = [];
  const client: DocsReviewClient = {
    pending: () => new Promise<DocsArtifactSummary[]>((resolve) => { gates.push(resolve); }),
    async content(id) { contents.push(id); return { markdown: '# body', openQuestions: [], blocked: false }; },
    async decide(path, decision, comments) { return decided({ path, decision, comments }); },
  };
  const host = createDocsReviewHost({ createPanel: () => fc.channel, client });
  host.openArtifact({ artifactId: 'LLD-abc-s7', mdPath: 'docs/e/S007/LLD.md' }); // open()'s refresh #0, openArtifact's read #1
  await tick();
  fc.send(env('open-doc', { artifactId: '' })); // the boot ping's refresh #2 supersedes #1
  await tick();
  assert.equal(gates.length, 3);
  gates[0]!([]);   // open()'s stale answer, superseded: dropped
  gates[1]!(lld);  // openArtifact's own answer: the artifact is pending
  await tick();
  await tick();
  assert.deepEqual(contents, ['LLD-abc-s7'], 'opened as pending, by id');
  const doc = fc.posted.filter((p) => p.payload.type === 'docs-content').at(-1)!;
  assert.equal('readOnly' in doc.payload, false);
  assert.equal(doc.payload['commentable'], true);
  assert.equal(fc.posted.filter((p) => p.payload.type === 'docs-list').length, 0, 'superseded reads post no list');
  gates[2]!(lld);  // the boot ping's refresh lands and posts the list
  await tick();
  assert.equal(fc.posted.filter((p) => p.payload.type === 'docs-list').length, 1);

  // And when openArtifact's own read is the latest, it posts the list itself; a failed read opens read-only.
  const fc2 = fakeChannel();
  const { client: c2, calls: calls2 } = fakeClient({ pending: () => { throw new Error('daemon down'); } });
  createDocsReviewHost({ createPanel: () => fc2.channel, client: c2 }).openArtifact({ artifactId: 'LLD-abc-s7', mdPath: 'docs/e/S007/LLD.md' });
  await tick();
  await tick();
  assert.deepEqual(calls2.content, ['docs/e/S007/LLD.md']);
  const notices = fc2.posted.filter((p) => p.payload.type === 'docs-content').map((p) => p.payload.markdown);
  assert.match(String(notices[0]), /^docs-review unavailable: daemon down/);
  assert.equal(fc2.posted.filter((p) => p.payload.type === 'docs-content').at(-1)!.payload['readOnly'], true);
});

// ISSUE-3b6bd6b5 — the guards themselves, against directories built for each case.
test('history and compiler checks skip with a stated reason when what they need is missing, and never run on an empty window', (t) => {
  const recorder = (): Skipper & { reasons: string[] } => {
    const reasons: string[] = [];
    return { reasons, skip: (reason?: string) => { reasons.push(reason ?? ''); } };
  };
  // The guards are tested against directories built here, so only the git binary is needed, not this repo's history.
  try { gitIn(tmpdir())('--version'); } catch { t.skip('git is not installed'); return; }

  const bare = mkdtempSync(join(tmpdir(), 'insrc-guard-plain-'));
  const repo = mkdtempSync(join(tmpdir(), 'insrc-guard-git-'));
  try {
    // Not a work tree.
    const plain = recorder();
    assert.equal(git(plain, { commits: ['HEAD'] }, bare), null);
    assert.deepEqual(plain.reasons, [`not a git work tree: ${bare}`]);

    // A one-commit repository: both files' last commit is that one commit.
    // The fixture ignores the host's git config, so signing, hooks or a missing identity cannot fail it.
    const fixture = gitIn(repo, { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' });
    const sh = (...args: string[]): string =>
      fixture('-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...args);
    sh('init', '-q');
    writeFileSync(join(repo, 'PLAN.md'), 'plan\n');
    writeFileSync(join(repo, 'BUILD.md'), 'build\n');
    sh('add', '.');
    sh('commit', '-q', '-m', 'one');
    const head = sh('rev-parse', 'HEAD').trim();

    const equal = recorder();
    assert.equal(git(equal, { window: { from: 'PLAN.md', to: 'BUILD.md' } }, repo), null, 'an equal window never runs');
    assert.deepEqual(equal.reasons, ['no build window between PLAN.md and BUILD.md: both ends are the same commit']);

    const unborn = recorder();
    assert.equal(git(unborn, { window: { from: 'PLAN.md', to: 'NOWHERE.md' } }, repo), null);
    assert.deepEqual(unborn.reasons, ['no build window between PLAN.md and NOWHERE.md: no commit touches NOWHERE.md']);

    const missing = recorder();
    assert.equal(git(missing, { commits: ['0123456789abcdef0123456789abcdef01234567'] }, repo), null);
    assert.deepEqual(missing.reasons, ['commit 0123456789abcdef0123456789abcdef01234567 is not in this history']);

    // Out of order: a second commit, then a window whose start is the later one.
    writeFileSync(join(repo, 'PLAN.md'), 'plan, revised\n');
    sh('commit', '-q', '-am', 'two');
    const inverted = recorder();
    assert.equal(git(inverted, { window: { from: 'PLAN.md', to: 'BUILD.md' } }, repo), null);
    assert.deepEqual(inverted.reasons, ['no build window between PLAN.md and BUILD.md: the PLAN.md commit is not an ancestor of the BUILD.md commit']);

    // Positive control: with the history present, it runs and skips nothing.
    const present = recorder();
    const run = git(present, { commits: [head], window: { from: 'BUILD.md', to: 'PLAN.md' } }, repo);
    assert.ok(run, 'a real window between existing commits runs');
    assert.deepEqual(present.reasons, []);
    assert.equal(run('rev-parse', 'HEAD~1').trim(), head);

    // A missing compiler.
    const nocomp = recorder();
    const absent = join(bare, 'node_modules', 'typescript', 'bin', 'tsc');
    assert.equal(tscOrSkip(nocomp, absent), null);
    assert.deepEqual(nocomp.reasons, [`TypeScript compiler not installed at ${absent}`]);
    if (existsSync(TSC)) {
      const found = recorder();
      assert.equal(tscOrSkip(found, TSC), TSC, 'an installed compiler is returned');
      assert.deepEqual(found.reasons, []);
    }
  } finally {
    rmSync(bare, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
  }

  // No history or compiler check bypasses the guards.
  const src = readFileSync(fileURLToPath(import.meta.url), 'utf8');
  const count = (re: RegExp): number => (src.match(re) ?? []).length;
  const q = '[\'"`]';
  assert.equal(count(new RegExp(`\\b(?:execFileSync|execSync|spawnSync|spawn|exec)\\(\\s*${q}git\\b`, 'g')), 1, 'git is spawned in one place, gitIn');
  assert.equal(count(/\bgitIn\(/g), 4, 'gitIn is declared once and bound only by git(t, need), and by this test for the git binary and its fixture');
  assert.equal(count(/\b(?:const|let|function)\s+git\b/g), 1, 'git(t, need) is the one history runner');
  assert.equal(count(/existsSync\(\s*tsc\b/g), 0, 'no test asserts the compiler is present');
});

// ---------------------------------------------------------------------------
// Story E202610138d4b90c9:S001 t9 — the rebuilt shell: a column with a fixed comment
// panel, in VS Code theme variables.
// ---------------------------------------------------------------------------

/** Every <style> block of the emitted shell, joined. */
function shellCss(html: string): string {
  return [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
}

test("docs review shell: the comment panel and the header are outside the one scrolling region, and the shell's styles use --vscode-* variables with no terminal style and no theme switch", async () => {
  const fc = fakeChannel();
  const { client } = fakeClient();
  createDocsReviewHost({ createPanel: () => fc.channel, client, genNonce: () => 'N' }).open();
  await tick();
  const html = fc.html();
  const markup = html.slice(html.indexOf('<body'), html.indexOf('<script'));

  // THE LAYOUT, by position in the markup: header, then the scrolling region, then the
  // comment panel; each of the first and last OUTSIDE the region.
  const iHead = markup.indexOf('<div class="rv-head">');
  const iScroll = markup.indexOf('<div id="insrc-rv-scroll" class="rv-scroll">');
  const iHist = markup.indexOf('<details id="insrc-rv-hist" class="rv-hist">');
  const iBar = markup.indexOf('<div id="insrc-rv-bar" class="rv-bar">');
  assert.ok(iHead > 0 && iScroll > iHead && iHist > iScroll && iBar > iHist, 'header, scrolling region, the strip of earlier comments, comment panel, in that order');
  const head = markup.slice(iHead, iScroll);
  const region = markup.slice(iScroll, iHist);
  const strip = markup.slice(iHist, iBar);
  const bar = markup.slice(iBar);
  assert.ok(strip.endsWith('</details>'), 'the strip is closed before the panel opens');
  assert.ok(strip.includes('id="insrc-rv-hist-list"') && !region.includes('insrc-rv-hist'), 'and it too is outside the scrolling region');
  // The region closes before the panel begins: its two closing tags end the slice.
  assert.ok(region.endsWith('</div></div>'), 'the region is closed before the panel opens');
  const count = (text: string, re: RegExp): number => (text.match(re) ?? []).length;
  assert.equal(count(region, /<div\b/g), count(region, /<\/div>/g), 'and it is balanced, so nothing after it is inside it');
  assert.equal(count(head, /<div\b/g), count(head, /<\/div>/g), 'the header is closed before the region opens');
  for (const id of ['insrc-docs-sections', 'insrc-docs-notice', 'insrc-docs-diagram', 'insrc-docs-experience', 'insrc-docs-body', 'insrc-docs-oq']) {
    assert.ok(region.includes(`id="${id}"`), `${id} is inside the scrolling region`);
    assert.ok(!head.includes(`id="${id}"`) && !bar.includes(`id="${id}"`));
  }
  for (const id of ['insrc-rv-back', 'insrc-rv-title', 'insrc-rv-kind', 'insrc-rv-state']) {
    assert.ok(head.includes(`id="${id}"`), `${id} is in the header`);
    assert.ok(!region.includes(`id="${id}"`), `${id} is outside the scrolling region`);
  }
  for (const id of ['insrc-rv-field', 'insrc-rv-approve', 'insrc-rv-reject', 'insrc-rv-feedback', 'insrc-rv-result', 'insrc-rv-who']) {
    assert.ok(bar.includes(`id="${id}"`), `${id} is in the comment panel`);
    assert.ok(!region.includes(`id="${id}"`), `${id} is outside the scrolling region`);
  }

  // THE RULES that make it so. The body is a column the height of the pane and does
  // not scroll; the header and the panel keep their own height; ONE element scrolls.
  const css = shellCss(html);
  assert.ok(css.includes('html,body{height:100%;margin:0;}'));
  const bodyRule = /(?:^|\})body\{([^}]*)\}/.exec(css)?.[1] ?? '';
  assert.match(bodyRule, /display:flex;flex-direction:column;overflow:hidden;/, 'the body is a column and does not scroll');
  assert.ok(css.includes('.rv-head{flex:0 0 auto;'), 'the header keeps its own height');
  assert.ok(css.includes('.rv-bar{flex:0 0 auto;'), 'the comment panel keeps its own height');
  assert.ok(css.includes('.rv-scroll{flex:1 1 auto;min-height:0;overflow-y:auto;}'), 'the region takes the rest and scrolls');
  // The one other element that may scroll is the LIST inside the strip of earlier
  // comments, which is capped so a long history cannot take the document's room.
  assert.ok(css.includes('.rv-hist-list{max-height:170px;overflow-y:auto;'), "the strip's list is capped and scrolls on its own");
  assert.ok(css.includes('.rv-hist{flex:0 0 auto;'), 'and the strip keeps its own height');
  // And, in the list view, the table (E202610131f74c81f:S001); nothing else scrolls.
  assert.ok(css.includes('.rv-tablewrap{flex:1 1 auto;min-height:0;overflow-y:auto;}'), "the list view's table scrolls on its own");
  assert.equal(count(css, /overflow-y\s*:/g), 3, 'the document region, the strip list and the table are the only vertical scrollers');
  assert.equal(count(css, /overflow\s*:\s*(?:auto|scroll)/g), 0, 'and nothing else scrolls both ways');
  assert.doesNotMatch(css, /position\s*:\s*fixed/, 'the panel is held by the layout, not pinned over the document');
  // The one sticky thing is the table's header row, inside the table's own scrolling region.
  assert.deepEqual(css.match(/[^{}]*\{[^{}]*position\s*:\s*sticky[^{}]*\}/g)?.map((r) => r.slice(0, r.indexOf('{'))), ['.rv-table th']);

  // THE THEME. Every --it-* token a rule uses is defined on the body from a VS Code
  // theme variable, so none can resolve to nothing.
  const defined = new Set([...bodyRule.matchAll(/(--it-[a-z-]+):var\(--vscode-[A-Za-z-]+\)/g)].map((m) => m[1]));
  const used = new Set([...css.matchAll(/var\((--it-[a-z-]+)/g)].map((m) => m[1]));
  assert.ok(used.size >= 8, 'the renderers still use the tokens');
  for (const token of used) assert.ok(defined.has(token!), `${token} is defined from a theme variable`);
  assert.ok(count(css, /var\(--vscode-/g) > 40, 'colours, fonts and borders come from theme variables');

  // No literal colour in any declaration: not a hex, not rgb()/hsl(), not a colour name.
  // Values are read with their var(...) calls removed, so a variable's NAME (which may
  // contain "green" or "background") is not mistaken for a colour.
  const NAMED = ['white', 'black', 'red', 'green', 'blue', 'grey', 'gray', 'orange', 'yellow', 'purple', 'pink', 'silver', 'navy', 'teal', 'transparent'];
  let declarations = 0;
  for (const m of css.matchAll(/[{;]\s*([a-z-]+)\s*:\s*([^;{}]+)/g)) {
    declarations += 1;
    const value = m[2]!.replace(/var\([^()]*\)/g, '');
    assert.doesNotMatch(value, /#[0-9a-fA-F]{3,8}\b/, `no hex colour in ${m[1]}:${m[2]}`);
    assert.doesNotMatch(value, /\b(?:rgba?|hsla?)\(/, `no rgb()/hsl() in ${m[1]}:${m[2]}`);
    for (const named of NAMED) assert.doesNotMatch(value, new RegExp(`(?:^|[\\s,])${named}(?:$|[\\s,!])`), `no named colour in ${m[1]}:${m[2]}`);
  }
  assert.ok(declarations > 200, 'the scan read the declarations');

  // No terminal style: neither its class, nor its import, nor its values.
  assert.doesNotMatch(html, /insrc-term/);
  const src = readFileSync(join(fileURLToPath(new URL('.', import.meta.url)), '..', 'docs-review-panel.ts'), 'utf8');
  assert.doesNotMatch(src, /design-tokens|renderTerminalStyle|terminalTheme/, 'the host no longer reads the terminal theme');
  // No theme message and no switch of its own: the host posts none, and the shell has
  // neither a handler for one, nor a control, nor a colour-scheme rule.
  assert.deepEqual(fc.posted.filter((p) => p.payload.type === 'theme'), [], 'no theme message is posted');
  assert.doesNotMatch(html, /type==='theme'|prefers-color-scheme|data-theme/);
  // The one place a colour scheme is named is the FRAME of an HTML document: that page is
  // a standalone document with its own palette, written for a light page, so its frame
  // is given the system's page colour for a light scheme. It is not a switch: it does
  // not follow, or change, the theme of the pane.
  assert.equal(count(html, /color-scheme/g), 1);
  assert.match(css, /\.rv-frame\{[^}]*color-scheme:light;background:Canvas;\}/);
  assert.equal(count(css, /\bCanvas\b/g), 1, 'and the system page colour is used nowhere else');
  assert.doesNotMatch(markup, /theme/i, 'no theme control in the markup');
});

test('docs review shell: each of the three buttons posts one docs-decision with the whole-document comment and is disabled until the result arrives, the result line is shown, and feedback with no comment posts nothing', () => {
  const DOC = { artifactId: 'LLD-abc-s7', markdown: '# Doc', openQuestions: [], blocked: false, contentVersion: '0123456789abcdef', state: 'pending', reviewer: { name: 'Rev Iewer', source: 'git' } };
  const decisions = (w: WebviewRun): unknown[] =>
    w.posted.map((p) => (p as { payload: { type: string } }).payload).filter((p) => p.type === 'docs-decision');
  const ALL_OFF = { approve: 'off', reject: 'off', feedback: 'off' };

  for (const decision of ['approve', 'reject', 'feedback'] as const) {
    const w = runWebview();
    w.deliver(DOC);
    assert.deepEqual(w.controls(), ALL_ON);
    assert.equal(w.bar.who.textContent, 'as Rev Iewer (git user)');
    assert.equal(w.bar.kind.textContent, 'LLD');
    w.bar.field.value = '  Needs an owner.  ';
    fire(w.bar[decision], 'click');
    assert.deepEqual(decisions(w), [{
      type: 'docs-decision', artifactId: 'LLD-abc-s7', decision,
      comments: [{ comment: 'Needs an owner.', version: '0123456789abcdef' }],
    }], `${decision}: one decision, with the whole-document comment`);
    assert.deepEqual(w.controls(), ALL_OFF, `${decision}: all three are disabled until the result arrives`);
    assert.equal(w.bar.result.textContent, 'Sending…');
    // Pressing again while it is unanswered posts nothing more.
    fire(w.bar.approve, 'click');
    fire(w.bar.reject, 'click');
    fire(w.bar.feedback, 'click');
    assert.equal(decisions(w).length, 1);
    // A result for another document is not this one's answer.
    w.send('docs-decision-result', { artifactId: 'PLAN-abc-s7', ok: true, recorded: 1, message: 'Approved.' });
    assert.deepEqual(w.controls(), ALL_OFF);

    w.send('docs-decision-result', { artifactId: 'LLD-abc-s7', ok: true, outcome: 'recorded', recorded: 1, message: 'Done. 1 comment saved. The chat has been told.' });
    assert.deepEqual(w.controls(), ALL_ON, `${decision}: the buttons work again`);
    assert.equal(w.bar.result.textContent, 'Done. 1 comment saved. The chat has been told.', 'the result line is shown');
    assert.equal(w.bar.result.className, 'rv-result rv-ok');
    assert.equal(w.bar.field.value, '', 'the comment was saved, so the field is cleared');
    // The host posts the document again after a decision: the result line stays.
    w.deliver(DOC);
    assert.equal(w.bar.result.textContent, 'Done. 1 comment saved. The chat has been told.');
  }

  // Send feedback with no comment posts nothing, and says why.
  for (const blank of ['', '   \n ']) {
    const w = runWebview();
    w.deliver(DOC);
    w.bar.field.value = blank;
    fire(w.bar.feedback, 'click');
    assert.deepEqual(decisions(w), []);
    assert.equal(w.bar.result.textContent, 'Write a comment before sending feedback.');
    assert.equal(w.bar.result.className, 'rv-result rv-err');
    assert.deepEqual(w.controls(), ALL_ON, 'nothing is waiting for an answer');
    // Approve and reject need no comment: the decision goes with an empty list.
    fire(w.bar.approve, 'click');
    assert.deepEqual(decisions(w), [{ type: 'docs-decision', artifactId: 'LLD-abc-s7', decision: 'approve', comments: [] }]);
  }

  // A decision that was not recorded, or whose comment was not saved, keeps the field.
  for (const result of [
    { ok: false, message: 'Nothing was recorded: daemon down' },
    { ok: true, outcome: 'approved', recorded: 0, message: 'Approved. The comment was not saved: cannot write the artifact.' },
  ]) {
    const w = runWebview();
    w.deliver(DOC);
    w.bar.field.value = 'Keep me.';
    fire(w.bar.reject, 'click');
    w.send('docs-decision-result', { artifactId: 'LLD-abc-s7', ...result });
    assert.equal(w.bar.field.value, 'Keep me.');
    assert.equal(w.bar.result.textContent, result.message);
    assert.equal(w.bar.result.className, result.ok ? 'rv-result rv-ok' : 'rv-result rv-err');
    assert.deepEqual(w.controls(), ALL_ON);
  }

  // Another document: the field, the result line and an unanswered decision were the earlier one's.
  const w = runWebview();
  w.deliver(DOC);
  w.bar.field.value = 'For the LLD.';
  fire(w.bar.feedback, 'click');
  w.deliver({ ...DOC, artifactId: 'PLAN-abc-s7' });
  assert.equal(w.bar.field.value, '');
  assert.equal(w.bar.result.textContent, '');
  assert.deepEqual(w.controls(), ALL_ON);
  assert.equal(w.bar.kind.textContent, 'PLAN');
  // No document: nothing can be sent.
  const none = runWebview();
  assert.deepEqual(none.controls(), { approve: 'off', reject: 'off', feedback: 'off' });
  fire(none.bar.approve, 'click');
  assert.deepEqual(decisions(none), []);
  // A document the daemon says is approved takes feedback only.
  const done = runWebview();
  done.deliver({ ...DOC, state: 'approved' });
  assert.deepEqual(done.controls(), { approve: 'hidden', reject: 'hidden', feedback: 'on' });
  assert.equal(done.bar.state.textContent, 'approved · feedback only');
});

test('docs review shell: the existing section chooser, functional-requirement, diagram and experience renderers still draw', () => {
  const w = runWebview();
  const md = '# Low-level design\n\nIntro.\n\n## Functional requirements\n\nOld text.\n\n## Data model changes\n\nBody.\n';
  const sections = deriveSectionIndex(md);
  w.deliver({
    artifactId: 'LLD-abc-s7', markdown: md, openQuestions: ['Is the limit right?'], blocked: false, sections,
    functionalDefinition: { requirements: [{ id: 'E:FR001', statement: 'The panel stays in view.', scope: 'doc' }] },
    erDefinition: DG_ER, companions: [DG_REF, UX_REF_T6], uxDefinition: UX_CARD_T6,
  });

  // The body, through the guarded markdown path.
  assert.ok(w.body.children.some((c) => c.tagName === 'h1'), 'the markdown body is rendered');
  // The section chooser: one select with an entry per section.
  assert.equal(w.sections.children.length, 1);
  assert.equal(w.sections.children[0]!.tagName, 'select');
  assert.ok(w.sections.children[0]!.children.length >= sections.anchors.length, 'one entry per section');
  // The functional requirements, as a list with the requirement's id and statement.
  const fr = allOf(w.body).filter((n) => n.className === 'insrc-fr-item');
  assert.equal(fr.length, 1, 'the functional requirement is drawn');
  assert.ok(allOf(fr[0]!).some((n) => n.textContent === 'E:FR001'));
  // The diagram and the experience mock, each in its own slot.
  assert.equal(dgSlotsIn(w).length, 1, 'the diagram slot');
  assert.ok(allOf(dgSlotsIn(w)[0]!).some((n) => n.tagName === 'svg'), 'with its drawing');
  assert.equal(uxSlotsIn(w).length, 1, 'the experience slot');
  assert.ok(allOf(uxSlotsIn(w)[0]!).some((n) => n.className === 'ux-card'), 'with its card');
  // The open questions and the notice host are where they were.
  assert.deepEqual(w.oq.children.map((c) => c.textContent), ['? Is the limit right?']);
  assert.equal(w.notice.children.length, 0, 'nothing degraded');
  // And the header and the comment panel are filled for the same document.
  assert.deepEqual(w.controls(), ALL_ON);
  assert.equal(w.lv.title.textContent, 'LLD-abc-s7', 'the header names the document shown');
});

test('docs review shell: the shell is one inline script under a nonce CSP with no remote origin, and its recorded baseline is that of the new shell', async () => {
  const { createHash } = await import('node:crypto');
  const html = renderShellFor(SHELL_BASELINE.nonce);

  // One inline script, carrying the nonce the CSP names.
  assert.equal((html.match(/<script\b/g) ?? []).length, 1, 'exactly one script element');
  assert.ok(html.includes(`<script nonce="${SHELL_BASELINE.nonce}">`), 'and it carries the nonce');
  assert.doesNotMatch(html, /<script[^>]*\bsrc=/, 'inline, not loaded');
  // The CSP, exactly: nothing by default, inline styles, scripts by the nonce only.
  const csp = /<meta http-equiv="Content-Security-Policy" content="([^"]*)">/.exec(html)?.[1];
  assert.equal(csp, `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${SHELL_BASELINE.nonce}';`);
  // No remote origin: nothing is loaded by address, and the markup has no element that could.
  assert.doesNotMatch(html, /(?:src|href|action)="https?:/, 'no remote resource is referenced');
  const markup = html.slice(html.indexOf('<body'), html.indexOf('<script'));
  assert.doesNotMatch(markup, /<(?:link|img|iframe|object|embed|form|a)\b/, 'the markup has nothing that loads or navigates');
  assert.doesNotMatch(shellCss(html), /url\(|@import/, 'and the styles load nothing');

  // The recorded baseline is the NEW shell's: the hash, and the two lengths that say
  // how it moved when it does.
  assert.equal(createHash('sha256').update(html, 'utf8').digest('hex'), SHELL_BASELINE.sha256, 'the emitted shell matches the recorded baseline');
  assert.equal(html.length, SHELL_BASELINE.chars, 'shell length in characters');
  assert.equal(Buffer.byteLength(html, 'utf8'), SHELL_BASELINE.bytes, 'shell length in UTF-8 bytes');
  // And it is this shell: the comment panel is in it, the old controls are not.
  assert.ok(html.includes('<div id="insrc-rv-bar" class="rv-bar">'));
  assert.ok(html.includes('<body class="insrc-rv">'));
  for (const gone of ['insrc-docs-actions', 'insrc-docs-note', 'request changes', 'insrc-term', '<select id="insrc-docs-list"']) {
    assert.ok(!html.includes(gone), `${gone} is not in the rebuilt shell`);
  }
  // A pure function of its nonce, which is what a recorded baseline rests on.
  assert.equal(html, renderShellFor(SHELL_BASELINE.nonce));
  assert.notEqual(html, renderShellFor('OTHER-NONCE'));
});

// ---------------------------------------------------------------------------
// Story E202610138d4b90c9:S001 t10 — one tab per document; an HTML document is shown
// as the page itself, in a sandboxed frame.
// ---------------------------------------------------------------------------

const TAB_SEQ = 'docs/epics/x/S007/sequence-diagram.html';
const TAB_UX = 'docs/epics/x/S007/ux-mock.html';
const TAB_DOC = {
  artifactId: 'LLD-abc-s7', markdown: '# Doc\n\nBody.\n', openQuestions: [], blocked: false,
  contentVersion: '0123456789abcdef', state: 'pending',
  documents: [
    { title: 'LLD.md', type: 'markdown', relPath: 'docs/epics/x/S007/LLD.md' },
    { title: 'Sequence diagram', type: 'html', relPath: TAB_SEQ },
    { title: 'UX mock', type: 'html', relPath: TAB_UX },
  ],
};
const TAB_PAGE = '<!doctype html><html><body><h1>Sequence</h1><script nonce="WV">draw()</script></body></html>';
const postedOf = (w: WebviewRun, type: string): Array<Record<string, unknown>> =>
  w.posted.map((p) => (p as { payload: Record<string, unknown> }).payload).filter((p) => p['type'] === type);
const shownView = (w: WebviewRun): 'markdown' | 'html' | 'both' | 'neither' => {
  const md = w.md.style['display'] !== 'none';
  const html = w.html.style['display'] !== 'none';
  return md && html ? 'both' : md ? 'markdown' : html ? 'html' : 'neither';
};

test("docs review shell: an HTML document's tab posts open-companion, and docs-companion sets the text as the srcdoc of a frame with sandbox allow-scripts and shows the file's path; with no html it shows the path and a line of text", () => {
  const w = runWebview();
  assert.equal(shownView(w), 'markdown', 'before any document, the markdown view');
  w.deliver(TAB_DOC);
  assert.equal(shownView(w), 'markdown', 'a document opens on its markdown');
  assert.deepEqual(postedOf(w, 'open-companion'), [], 'nothing is asked for until a tab is chosen');

  // Choosing the HTML document's tab asks the host for that file.
  fire(w.tabs.children[1]!, 'click');
  assert.deepEqual(postedOf(w, 'open-companion'), [{ type: 'open-companion', artifactId: 'LLD-abc-s7', relPath: TAB_SEQ }]);
  assert.equal(shownView(w), 'html');
  assert.equal(w.htmlPath.textContent, TAB_SEQ, "the file's path is shown");
  assert.equal(w.htmlNote.textContent, 'Loading…');
  assert.equal(w.frameHost.children.length, 0, 'no frame until the text arrives');

  // An answer for another file, or another artifact, is not this tab's.
  w.send('docs-companion', { artifactId: 'LLD-abc-s7', relPath: TAB_UX, html: TAB_PAGE });
  w.send('docs-companion', { artifactId: 'PLAN-abc-s7', relPath: TAB_SEQ, html: TAB_PAGE });
  assert.equal(w.frameHost.children.length, 0);

  // The text becomes the srcdoc of ONE frame that may run scripts and nothing else.
  w.send('docs-companion', { artifactId: 'LLD-abc-s7', relPath: TAB_SEQ, html: TAB_PAGE });
  assert.equal(w.frameHost.children.length, 1);
  const frame = w.frameHost.children[0]!;
  assert.equal(frame.tagName, 'iframe');
  assert.equal(frame.attrs['sandbox'], 'allow-scripts', 'scripts, and nothing else: no same-origin, forms, popups or navigation');
  assert.equal(frame.attrs['srcdoc'], TAB_PAGE, 'the posted text, unchanged');
  assert.equal(frame.attrs['src'], undefined, 'set from the text, not loaded by address');
  const order = frame.writes.map((x) => x.prop);
  assert.ok(order.indexOf('attr:sandbox') >= 0 && order.indexOf('attr:sandbox') < order.indexOf('attr:srcdoc'), 'the sandbox is set before the text');
  assert.equal(w.htmlNote.textContent, '', 'the loading line is gone');
  assert.equal(w.htmlPath.textContent, TAB_SEQ, 'the path stays above the frame');
  // The page's markup exists only as the frame's srcdoc: it never became markup of the shell.
  for (const n of [w.html, w.htmlPath, w.htmlNote, w.frameHost, frame, w.body, w.md]) {
    assert.ok(!n.writes.some((x) => x.prop === 'innerHTML' && String(x.value).includes('Sequence')), 'never assigned as markup');
  }
  assert.ok(!allOf(w.html).some((n) => n.textContent.includes('<h1>')), 'and never set as text either');

  // The host posts the artifact again (after a decision): the tab and its frame stay.
  w.deliver(TAB_DOC);
  assert.equal(shownView(w), 'html');
  assert.equal(w.frameHost.children[0], frame, 'the same frame: the page is not loaded again');
  assert.equal(postedOf(w, 'open-companion').length, 1);

  // With no html: the path, and a line of text; no frame.
  fire(w.tabs.children[2]!, 'click');
  assert.deepEqual(postedOf(w, 'open-companion').at(-1), { type: 'open-companion', artifactId: 'LLD-abc-s7', relPath: TAB_UX });
  assert.equal(w.frameHost.children.length, 0, 'the earlier page is gone at once');
  w.send('docs-companion', { artifactId: 'LLD-abc-s7', relPath: TAB_SEQ, html: TAB_PAGE }); // a late answer for the tab just left
  assert.equal(w.frameHost.children.length, 0);
  w.send('docs-companion', { artifactId: 'LLD-abc-s7', relPath: TAB_UX });
  assert.equal(w.htmlPath.textContent, TAB_UX);
  assert.equal(w.htmlNote.textContent, 'This document cannot be shown here. Open the file to see it.');
  assert.equal(w.frameHost.children.length, 0);
  // Text that is not a string is treated the same way.
  w.send('docs-companion', { artifactId: 'LLD-abc-s7', relPath: TAB_UX, html: 7 });
  assert.equal(w.frameHost.children.length, 0);

  // Back to the markdown: the frame is dropped and nothing is asked for.
  const asked = postedOf(w, 'open-companion').length;
  fire(w.tabs.children[0]!, 'click');
  assert.equal(shownView(w), 'markdown');
  assert.equal(w.frameHost.children.length, 0);
  assert.equal(postedOf(w, 'open-companion').length, asked);
  // Another artifact opens on its markdown, whatever tab the last one was on.
  fire(w.tabs.children[1]!, 'click');
  w.deliver({ ...TAB_DOC, artifactId: 'HLD-abc' });
  assert.equal(shownView(w), 'markdown');
  // And an HTML document that is no longer listed goes back to the markdown too.
  fire(w.tabs.children[1]!, 'click');
  w.deliver({ ...TAB_DOC, artifactId: 'HLD-abc', documents: [TAB_DOC.documents[0], TAB_DOC.documents[2]] });
  assert.equal(shownView(w), 'markdown');
});

test('docs review shell: there is one tab per document, the markdown first, and a comment sent from an HTML tab names that file and has no anchor', () => {
  const w = runWebview();
  w.deliver(TAB_DOC);
  const tabs = (): Array<{ text: string; on: boolean; selected: string | undefined; title: string | undefined; role: string | undefined }> =>
    w.tabs.children.map((b) => ({ text: b.textContent, on: b.className === 'rv-tab rv-on', selected: b.attrs['aria-selected'], title: b.attrs['title'], role: b.attrs['role'] }));
  assert.deepEqual(tabs(), [
    { text: 'LLD.md', on: true, selected: 'true', title: undefined, role: 'tab' },
    { text: 'Sequence diagram', on: false, selected: 'false', title: TAB_SEQ, role: 'tab' },
    { text: 'UX mock', on: false, selected: 'false', title: TAB_UX, role: 'tab' },
  ], 'one tab per document, the markdown first, each HTML document by its title');
  assert.ok(w.tabs.children.every((b) => b.tagName === 'button' && !b.writes.some((x) => x.prop === 'innerHTML')), 'titles are set as text');
  assert.notEqual(w.tabs.style['display'], 'none');

  // A comment written on an HTML document's tab is on that file: no anchor, no version.
  fire(w.tabs.children[1]!, 'click');
  assert.deepEqual(tabs().map((t) => t.on), [false, true, false]);
  assert.equal(w.bar.field.attrs['placeholder'], `Comment on ${TAB_SEQ} (optional)…`);
  w.bar.field.value = 'The arrow to the daemon is missing.';
  fire(w.bar.feedback, 'click');
  assert.deepEqual(postedOf(w, 'docs-decision'), [{
    type: 'docs-decision', artifactId: 'LLD-abc-s7', decision: 'feedback',
    comments: [{ comment: 'The arrow to the daemon is missing.', file: TAB_SEQ }],
  }]);
  const sent = postedOf(w, 'docs-decision')[0]!['comments'] as Array<Record<string, unknown>>;
  assert.deepEqual(Object.keys(sent[0]!).sort(), ['comment', 'file'], 'the file, and neither an anchor nor a version');
  w.send('docs-decision-result', { artifactId: 'LLD-abc-s7', ok: true, outcome: 'recorded', recorded: 1, message: 'Feedback sent.' });

  // On the markdown the same field is a comment on the document: its version, and no file.
  fire(w.tabs.children[0]!, 'click');
  assert.equal(w.bar.field.attrs['placeholder'], 'Comment on the whole document (optional)…');
  w.bar.field.value = 'Needs an owner.';
  fire(w.bar.reject, 'click');
  assert.deepEqual(postedOf(w, 'docs-decision').at(-1), {
    type: 'docs-decision', artifactId: 'LLD-abc-s7', decision: 'reject',
    comments: [{ comment: 'Needs an owner.', version: '0123456789abcdef' }],
  });

  // One document, none listed, or a list that is not a list: nothing to choose, so no tab.
  for (const documents of [[TAB_DOC.documents[0]], [], undefined, 'x']) {
    const one = runWebview();
    one.deliver({ ...TAB_DOC, documents });
    assert.equal(one.tabs.children.length, 0);
    assert.equal(one.tabs.style['display'], 'none');
    assert.equal(shownView(one), 'markdown');
  }
});

// ---------------------------------------------------------------------------
// Story E202610138d4b90c9:S001 t11 — inline comments as drafts.
// ---------------------------------------------------------------------------

const INLINE_LONG = 'Before the passage there is rather a lot of text, more than forty characters of it; the passage itself; and after it there is again a good deal more text than forty characters.';
const INLINE_MD = [
  '# Low-level design', '', 'Intro.', '',
  '## Summary', '', 'The header is cut to 8 lines until expanded.', '', 'Second paragraph here.', '', INLINE_LONG, '',
  '## Feedback', '', 'A saved comment is listed here.', '',
  '## After', '', 'Text after the feedback section.', '',
].join('\n');
const INLINE_DOC = {
  artifactId: 'LLD-abc-s7', markdown: INLINE_MD, openQuestions: [], blocked: false,
  sections: deriveSectionIndex(INLINE_MD), contentVersion: '0123456789abcdef', state: 'pending',
  reviewer: { name: 'Rev Iewer', source: 'git' },
};
/** The rendered block whose text is exactly this. */
const blockOf = (w: WebviewRun, text: string): BodyStub => {
  const b = w.body.children.find((c) => c.nodeType === 1 && inlineText(c) === text);
  assert.ok(b, `a block with the text: ${text}`);
  return b!;
};
/** A block's text as the page shows it: its text nodes and those inside its marks, in order. */
const inlineText = (n: BodyStub): string =>
  n.nodeType === 3 ? n.data : n.children.length === 0 ? n.textContent : n.children.map(inlineText).join('');
const marksIn = (n: BodyStub): BodyStub[] => allOf(n).filter((x) => x.tagName === 'mark');
const cardsIn = (w: WebviewRun): BodyStub[] => w.body.children.filter((c) => c.className === 'rv-thread');
/** Select a piece of a block's text, which is one text node while the block has no mark. */
function selectIn(w: WebviewRun, block: BodyStub, piece: string): void {
  const node = block.children.find((c) => c.nodeType === 3 && c.data.includes(piece));
  assert.ok(node, `a text node holding: ${piece}`);
  const at = node!.data.indexOf(piece);
  w.select({ startContainer: node!, startOffset: at, endContainer: node!, endOffset: at + piece.length });
}
/** Select text, press the comment button, write a comment in the thread and add it. */
function draftOn(w: WebviewRun, blockText: string, piece: string, comment: string): BodyStub {
  const block = blockOf(w, blockText);
  selectIn(w, block, piece);
  assert.equal(w.pop.style['display'], 'block', `the comment button is offered for: ${piece}`);
  fire(w.popBtn, 'click');
  const card = cardsIn(w).at(-1)!;
  addInCard(card, comment);
  return block;
}
/** Write a comment in an open thread card and press its add button. */
function addInCard(card: BodyStub, comment: string): void {
  const field = allOf(card).find((n) => n.tagName === 'textarea')!;
  field.value = comment;
  fire(allOf(card).find((n) => n.attrs['aria-label'] === 'Add this comment as a draft')!, 'click');
}
const SUMMARY_P = 'The header is cut to 8 lines until expanded.';
const NO_DRAFTS = 'Select text in the document to comment on it.';

test('docs review shell: selecting text in one block and adding a comment makes a draft with a quote, section, prefix and suffix; a selection across blocks, in the Feedback section or cutting an existing mark offers no button', () => {
  const w = runWebview({ textNodes: true });
  w.deliver(INLINE_DOC);
  assert.equal(w.pop.style['display'], 'none', 'no button before there is a selection');
  assert.equal(w.drafts.textContent, NO_DRAFTS);

  // A selection inside one block offers the button; pressing it marks the passage and
  // opens its thread card under the block, with a field.
  const p = blockOf(w, SUMMARY_P);
  selectIn(w, p, 'cut to 8 lines');
  assert.equal(w.pop.style['display'], 'block');
  fire(w.popBtn, 'click');
  assert.equal(w.pop.style['display'], 'none', 'the button goes once it is pressed');
  assert.deepEqual(p.children.map((c) => (c.nodeType === 3 ? `text:${c.data}` : `${c.tagName}.${c.className}:${inlineText(c)}`)),
    ['text:The header is ', 'mark.rv-anno rv-draft:cut to 8 lines', 'text: until expanded.'], 'the passage is marked, and the text around it is unchanged');
  assert.equal(inlineText(p), SUMMARY_P);
  const card = cardsIn(w)[0]!;
  assert.equal(p.nextSibling, card, 'the thread card is under the block');
  assert.equal(card.children[0]!.textContent, '\u201ccut to 8 lines\u201d', 'it quotes the passage');
  assert.ok(allOf(card).some((n) => n.tagName === 'textarea'), 'and has a field');
  assert.deepEqual(allOf(card).filter((n) => n.tagName === 'button').map((b) => b.attrs['aria-label']), ['Add this comment as a draft', 'Close'], 'with round add and close buttons, named by their labels');
  assert.equal(w.drafts.textContent, NO_DRAFTS, 'a marked passage with no comment is not yet a draft');

  // An added comment is a draft: tagged, under the reviewer's name, removable.
  addInCard(card, 'Say what the <b>header</b> shows.');
  const open = cardsIn(w)[0]!;
  const row = open.children[1]!;
  assert.deepEqual(row.children.map((c) => [c.tagName, c.className, c.textContent]), [
    ['button', 'rv-x', '\u2715'],
    ['span', 'rv-who', 'Rev Iewer'],
    ['span', 'rv-tag rv-tag-draft', 'draft, not sent'],
    ['div', 'rv-text', 'Say what the <b>header</b> shows.'],
  ]);
  assert.equal(row.children[0]!.attrs['aria-label'], 'Remove this draft');
  assert.equal(w.drafts.textContent, '1 inline comment drafted. Sent with the button you press.');
  // Comment and quote are set as text: nothing in the card, the mark or the body was assigned as markup.
  for (const n of [...allOf(open), ...marksIn(p)]) assert.ok(!n.writes.some((x) => x.prop === 'innerHTML' || x.prop === 'outerHTML'), 'no markup is assigned');
  assert.ok(!w.body.writes.some((x) => x.prop === 'innerHTML' && String(x.value).includes('<b>header</b>')));

  // The draft is sent with its anchor: the quote, the section above it, and the text on each side.
  fire(w.bar.feedback, 'click');
  assert.deepEqual(postedOf(w, 'docs-decision'), [{
    type: 'docs-decision', artifactId: 'LLD-abc-s7', decision: 'feedback',
    comments: [{
      comment: 'Say what the <b>header</b> shows.',
      anchor: { quote: 'cut to 8 lines', sectionSlug: 'summary', prefix: 'The header is ', suffix: ' until expanded.' },
      version: '0123456789abcdef',
    }],
  }]);
  w.send('docs-decision-result', { artifactId: 'LLD-abc-s7', ok: false, message: 'Nothing was recorded: daemon down' });

  // The text on each side is at most 40 characters, and a selection's outer spaces are not part of the quote.
  const long = blockOf(w, INLINE_LONG);
  selectIn(w, long, ' the passage itself; ');
  fire(w.popBtn, 'click');
  addInCard(cardsIn(w).at(-1)!, 'Which passage?');
  fire(w.bar.feedback, 'click');
  const second = (postedOf(w, 'docs-decision').at(-1)!['comments'] as Array<{ anchor: Record<string, string> }>)[1]!.anchor;
  const at = INLINE_LONG.indexOf('the passage itself;');
  assert.deepEqual(second, {
    quote: 'the passage itself;', sectionSlug: 'summary',
    prefix: INLINE_LONG.slice(at - 40, at), suffix: INLINE_LONG.slice(at + 'the passage itself;'.length, at + 'the passage itself;'.length + 40),
  });
  assert.equal(second['prefix']!.length, 40);
  assert.equal(second['suffix']!.length, 40);
  w.send('docs-decision-result', { artifactId: 'LLD-abc-s7', ok: false, message: 'Nothing was recorded.' });

  // NO BUTTON: across two blocks.
  const p2 = blockOf(w, 'Second paragraph here.');
  w.select({ startContainer: p.children[0]!, startOffset: 4, endContainer: p2.children[0]!, endOffset: 6 });
  assert.equal(w.pop.style['display'], 'none', 'a selection across blocks');
  // In the document's own Feedback section.
  selectIn(w, blockOf(w, 'A saved comment is listed here.'), 'saved comment');
  assert.equal(w.pop.style['display'], 'none', 'a selection in the Feedback section');
  // The section after it is ordinary text again.
  selectIn(w, blockOf(w, 'Text after the feedback section.'), 'after the feedback');
  assert.equal(w.pop.style['display'], 'block', 'the section after Feedback can be commented on');
  w.select(null);
  assert.equal(w.pop.style['display'], 'none', 'no selection');
  // Cutting an existing mark: starting inside it, ending inside it, or spanning it.
  const mark = marksIn(p)[0]!;
  const inMark = mark.children[0]!;
  const before = p.children[0]!;
  const after = p.children[2]!;
  w.select({ startContainer: inMark, startOffset: 2, endContainer: after, endOffset: 4 });
  assert.equal(w.pop.style['display'], 'none', 'starting inside a mark');
  w.select({ startContainer: before, startOffset: 4, endContainer: inMark, endOffset: 3 });
  assert.equal(w.pop.style['display'], 'none', 'ending inside a mark');
  w.select({ startContainer: before, startOffset: 4, endContainer: after, endOffset: 4 });
  assert.equal(w.pop.style['display'], 'none', 'spanning a mark');
  w.select({ startContainer: after, startOffset: 1, endContainer: after, endOffset: 6 });
  assert.equal(w.pop.style['display'], 'block', 'beside the mark, in the same block, is fine');
  // Blank, and longer than a quote may be.
  w.select({ startContainer: after, startOffset: 0, endContainer: after, endOffset: 1 });
  assert.equal(w.pop.style['display'], 'none', 'only a space');
  const big = runWebview({ textNodes: true });
  const bigText = 'x'.repeat(600);
  big.deliver({ ...INLINE_DOC, markdown: `# T\n\n${bigText}\n`, sections: deriveSectionIndex(`# T\n\n${bigText}\n`) });
  const bigNode = blockOf(big, bigText).children[0]!;
  big.select({ startContainer: bigNode, startOffset: 0, endContainer: bigNode, endOffset: 501 });
  assert.equal(big.pop.style['display'], 'none', 'more than 500 characters');
  big.select({ startContainer: bigNode, startOffset: 0, endContainer: bigNode, endOffset: 500 });
  assert.equal(big.pop.style['display'], 'block', '500 characters is allowed');

  // A click on a marked passage closes its thread, and opens it again. (A plain click
  // leaves no selection; with text still selected the click is the end of a selection.)
  assert.equal(cardsIn(w).length, 2);
  fire(w.body, 'click', { target: inMark });
  assert.equal(cardsIn(w).length, 2, 'while text is selected, a click on a mark does nothing');
  w.select(null);
  fire(w.body, 'click', { target: inMark });
  assert.equal(cardsIn(w).length, 1);
  fire(w.body, 'click', { target: mark });
  assert.equal(cardsIn(w).length, 2);
  assert.equal(p.nextSibling!.className, 'rv-thread');
  // Removing a passage's only draft takes the thread and the mark away; the text is whole again.
  fire(allOf(p.nextSibling!).find((n) => n.className === 'rv-x')!, 'click');
  assert.equal(marksIn(p).length, 0);
  assert.equal(inlineText(p), SUMMARY_P);
  assert.equal(cardsIn(w).length, 1);
  assert.equal(w.drafts.textContent, '1 inline comment drafted. Sent with the button you press.');
  // Closing a thread that has no comment takes its mark away too.
  selectIn(w, p2, 'paragraph');
  fire(w.popBtn, 'click');
  assert.equal(marksIn(p2).length, 1);
  fire(allOf(p2.nextSibling!).find((n) => n.attrs['aria-label'] === 'Close')!, 'click');
  assert.equal(marksIn(p2).length, 0);
  assert.equal(inlineText(p2), 'Second paragraph here.');
});

test('docs review shell: the three buttons post one docs-decision with every draft and the whole-document comment, are disabled until the result arrives, and feedback with no comment posts nothing', () => {
  const ALL_OFF = { approve: 'off', reject: 'off', feedback: 'off' };
  for (const decision of ['approve', 'reject', 'feedback'] as const) {
    const w = runWebview({ textNodes: true });
    w.deliver(INLINE_DOC);
    const p = draftOn(w, SUMMARY_P, 'cut to 8 lines', 'First on the header.');
    addInCard(p.nextSibling!, 'Second on the header.');
    draftOn(w, 'Second paragraph here.', 'paragraph', 'On the second paragraph.');
    assert.equal(w.drafts.textContent, '3 inline comments drafted. Sent with the button you press.');
    w.bar.field.value = 'On the whole document.';
    fire(w.bar[decision], 'click');
    const header = { quote: 'cut to 8 lines', sectionSlug: 'summary', prefix: 'The header is ', suffix: ' until expanded.' };
    assert.deepEqual(postedOf(w, 'docs-decision'), [{
      type: 'docs-decision', artifactId: 'LLD-abc-s7', decision,
      comments: [
        { comment: 'First on the header.', anchor: header, version: '0123456789abcdef' },
        { comment: 'Second on the header.', anchor: header, version: '0123456789abcdef' },
        { comment: 'On the second paragraph.', anchor: { quote: 'paragraph', sectionSlug: 'summary', prefix: 'Second ', suffix: ' here.' }, version: '0123456789abcdef' },
        { comment: 'On the whole document.', version: '0123456789abcdef' },
      ],
    }], `${decision}: one decision with every draft, then the whole-document comment`);
    assert.deepEqual(w.controls(), ALL_OFF, `${decision}: disabled until the result arrives`);
    fire(w.bar.approve, 'click');
    fire(w.bar.feedback, 'click');
    assert.equal(postedOf(w, 'docs-decision').length, 1, 'nothing more is posted meanwhile');
    w.send('docs-decision-result', { artifactId: 'LLD-abc-s7', ok: true, outcome: 'recorded', recorded: 4, message: 'Done. 4 comments saved.' });
    assert.deepEqual(w.controls(), ALL_ON);
  }

  // Send feedback with no comment of either kind posts nothing.
  const none = runWebview({ textNodes: true });
  none.deliver(INLINE_DOC);
  fire(none.bar.feedback, 'click');
  assert.deepEqual(postedOf(none, 'docs-decision'), []);
  assert.equal(none.bar.result.textContent, 'Write a comment before sending feedback.');
  // A passage that is marked but has no comment is not a comment.
  selectIn(none, blockOf(none, SUMMARY_P), 'cut to 8 lines');
  fire(none.popBtn, 'click');
  fire(none.bar.feedback, 'click');
  assert.deepEqual(postedOf(none, 'docs-decision'), []);
  // One inline draft is enough: the whole-document field may stay empty.
  addInCard(cardsIn(none)[0]!, 'Only inline.');
  fire(none.bar.feedback, 'click');
  assert.deepEqual((postedOf(none, 'docs-decision')[0]!['comments'] as unknown[]).length, 1);
});

test('docs review shell: drafts are cleared on a successful result, kept on a failed one or one with commentsError, and restored from the saved state when the shell is rebuilt', () => {
  const stored = (w: WebviewRun): unknown => ((w.saved.state as { rv?: Record<string, unknown> } | undefined)?.rv ?? {})['LLD-abc-s7'];

  // Kept on a failed result, and on one whose comments were not saved.
  for (const result of [
    { ok: false, message: 'Nothing was recorded: daemon down' },
    { ok: true, outcome: 'approved', recorded: 0, message: 'Approved. The comments were not saved: cannot write the artifact.' },
  ]) {
    const w = runWebview({ textNodes: true });
    w.deliver(INLINE_DOC);
    const p = draftOn(w, SUMMARY_P, 'cut to 8 lines', 'Say what the header shows.');
    w.bar.field.value = 'Overall.';
    fire(w.bar.approve, 'click');
    w.send('docs-decision-result', { artifactId: 'LLD-abc-s7', ...result });
    assert.equal(marksIn(p).length, 1, 'the mark stays');
    assert.equal(cardsIn(w).length, 1, 'and its thread');
    assert.equal(w.bar.field.value, 'Overall.');
    assert.equal(w.drafts.textContent, '1 inline comment drafted. Sent with the button you press.');
    assert.ok(stored(w), 'and it is still in the saved state');
    // So the same comments can be sent again.
    fire(w.bar.feedback, 'click');
    assert.deepEqual(postedOf(w, 'docs-decision').at(-1)!['comments'], postedOf(w, 'docs-decision')[0]!['comments']);
  }

  // Cleared on a successful result: from the document, the panel and the saved state.
  const w = runWebview({ textNodes: true });
  w.deliver(INLINE_DOC);
  const p = draftOn(w, SUMMARY_P, 'cut to 8 lines', 'Say what the header shows.');
  draftOn(w, 'Second paragraph here.', 'paragraph', 'And this.');
  w.bar.field.value = 'Overall.';
  fire(w.bar.field, 'input');
  assert.deepEqual(stored(w), {
    field: 'Overall.',
    drafts: [
      { anchor: { quote: 'cut to 8 lines', sectionSlug: 'summary', prefix: 'The header is ', suffix: ' until expanded.' }, text: 'Say what the header shows.' },
      { anchor: { quote: 'paragraph', sectionSlug: 'summary', prefix: 'Second ', suffix: ' here.' }, text: 'And this.' },
    ],
  }, 'the drafts and the field are kept in the saved state, under the artifact');
  fire(w.bar.reject, 'click');
  w.send('docs-decision-result', { artifactId: 'LLD-abc-s7', ok: true, outcome: 'rejected', recorded: 3, message: 'Rejected. 3 comments saved.' });
  assert.equal(marksIn(w.body).length, 0, 'no mark is left');
  assert.equal(cardsIn(w).length, 0, 'no thread');
  assert.equal(inlineText(p), SUMMARY_P, 'the text is whole again');
  assert.equal(w.bar.field.value, '');
  assert.equal(w.drafts.textContent, NO_DRAFTS);
  assert.equal(stored(w), undefined, 'and nothing of them in the saved state');
  fire(w.bar.feedback, 'click');
  assert.equal(postedOf(w, 'docs-decision').length, 1, 'there is nothing left to send');

  // Restored when the shell is rebuilt: a new run over the same saved state.
  const first = runWebview({ textNodes: true });
  first.deliver(INLINE_DOC);
  draftOn(first, SUMMARY_P, 'cut to 8 lines', 'Say what the header shows.');
  first.bar.field.value = 'Overall.';
  fire(first.bar.field, 'input');
  const rebuilt = runWebview({ textNodes: true, saved: first.saved });
  assert.equal(marksIn(rebuilt.body).length, 0);
  rebuilt.deliver(INLINE_DOC); // the host posts the open document again
  const rp = blockOf(rebuilt, SUMMARY_P);
  assert.deepEqual(marksIn(rp).map((m) => [m.className, inlineText(m)]), [['rv-anno rv-draft', 'cut to 8 lines']], 'the draft is back on its passage');
  assert.equal(rebuilt.bar.field.value, 'Overall.', 'and the whole-document field');
  assert.equal(rebuilt.drafts.textContent, '1 inline comment drafted. Sent with the button you press.');
  fire(rebuilt.body, 'click', { target: marksIn(rp)[0]! });
  assert.equal(allOf(cardsIn(rebuilt)[0]!).find((n) => n.className === 'rv-text')!.textContent, 'Say what the header shows.');
  fire(rebuilt.bar.approve, 'click');
  assert.deepEqual(postedOf(rebuilt, 'docs-decision')[0]!['comments'], [
    { comment: 'Say what the header shows.', anchor: { quote: 'cut to 8 lines', sectionSlug: 'summary', prefix: 'The header is ', suffix: ' until expanded.' }, version: '0123456789abcdef' },
    { comment: 'Overall.', version: '0123456789abcdef' },
  ]);
  rebuilt.send('docs-decision-result', { artifactId: 'LLD-abc-s7', ok: false, message: 'Nothing was recorded.' });

  // Kept per artifact: another document has its own, and coming back finds these again.
  rebuilt.deliver({ ...INLINE_DOC, artifactId: 'PLAN-abc-s7' });
  assert.equal(marksIn(rebuilt.body).length, 0);
  assert.equal(rebuilt.bar.field.value, '');
  assert.equal(rebuilt.drafts.textContent, NO_DRAFTS);
  rebuilt.deliver(INLINE_DOC);
  assert.equal(marksIn(rebuilt.body).length, 1);
  assert.equal(rebuilt.bar.field.value, 'Overall.');

  // The same document posted again (after a decision): the marks and an open thread are put back.
  fire(rebuilt.body, 'click', { target: marksIn(blockOf(rebuilt, SUMMARY_P))[0]! });
  assert.equal(cardsIn(rebuilt).length, 1);
  rebuilt.deliver(INLINE_DOC);
  assert.equal(marksIn(rebuilt.body).length, 1);
  assert.equal(cardsIn(rebuilt).length, 1, 'the thread that was open is open again');

  // The document was revised and the passage is gone: the draft is kept, said to be without a place, and still sent.
  const revised = INLINE_MD.replace('cut to 8 lines', 'folded');
  rebuilt.deliver({ ...INLINE_DOC, markdown: revised, sections: deriveSectionIndex(revised), contentVersion: 'fedcba9876543210' });
  assert.equal(marksIn(rebuilt.body).length, 0);
  assert.equal(rebuilt.drafts.textContent, '1 inline comment drafted (1 on text that is no longer in the document). Sent with the button you press.');
  fire(rebuilt.bar.feedback, 'click');
  assert.equal((postedOf(rebuilt, 'docs-decision').at(-1)!['comments'] as Array<{ anchor?: { quote: string } }>)[0]!.anchor!.quote, 'cut to 8 lines');
});

// ---------------------------------------------------------------------------
// Story E202610138d4b90c9:S001 t12 — the saved comments of a document.
// ---------------------------------------------------------------------------

const MD_FILE = 'docs/epics/x/S007/LLD.md';
/** A saved comment, as the daemon stores it. */
const savedEntry = (o: {
  id: string; at: string; comment: string; author?: string; decision?: string; kind?: string;
  quote?: string; slug?: string; version?: string; file?: string;
}): Record<string, unknown> => ({
  id: o.id, author: o.author ?? 'Rev Iewer', timestamp: o.at,
  target: { file: o.file ?? MD_FILE, ...(o.version !== undefined ? { version: o.version } : {}) },
  comment: o.comment,
  ...(o.kind !== undefined ? { kind: o.kind } : {}),
  ...(o.quote !== undefined ? { anchor: { quote: o.quote, ...(o.slug !== undefined ? { sectionSlug: o.slug } : {}) } } : {}),
  ...(o.decision !== undefined ? { decision: o.decision } : {}),
});
/** The time of a saved comment as the pane shows it: the reader's own time, to the minute. */
const shownWhen = (iso: string): string => {
  const d = new Date(iso);
  const p = (n: number): string => (n < 10 ? '0' : '') + n;
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};
const NOW_VERSION = '0123456789abcdef';
const markersOf = (w: WebviewRun): BodyStub[] => w.md.children.filter((c) => c.className.split(' ')[0] === 'rv-marker');
/** A saved comment's row as text: who, when, the tag, then its quote (if shown) and its text. */
const rowText = (row: BodyStub): string[] => row.children.map((c) => c.textContent);
const stripRows = (w: WebviewRun): string[][] => w.histList.children.map(rowText);

const HISTORY = [
  // Stored out of time order, to show that the pane orders them.
  savedEntry({ id: 'new', at: '2026-10-13T03:45:00.000Z', author: 'Priya N', comment: 'Header now lists path and counts. OK.', decision: 'feedback', quote: 'cut to 8 lines', slug: 'summary', version: NOW_VERSION }),
  savedEntry({ id: 'whole-late', at: '2026-10-13T05:00:00.000Z', comment: 'Approved as it stands.', decision: 'approve', version: NOW_VERSION }),
  savedEntry({ id: 'old', at: '2026-10-12T10:35:00.000Z', comment: 'Say what the header shows when folded.', decision: 'reject', quote: 'cut to 8 lines', slug: 'summary', version: 'aaaa' }),
  savedEntry({ id: 'gone', at: '2026-10-12T11:00:00.000Z', comment: 'This limit was fine.', decision: 'feedback', quote: 'a passage that was removed', slug: 'summary', version: 'aaaa' }),
  savedEntry({ id: 'whole-first', at: '2026-10-11T09:00:00.000Z', author: 'Priya N', comment: 'Consider a shorter summary.', kind: 'suggestion', version: 'aaaa' }),
  savedEntry({ id: 'on-html', at: '2026-10-13T06:00:00.000Z', comment: 'The arrow to the daemon is missing.', decision: 'feedback', file: TAB_SEQ }),
  // Its words are in the document, but only in the document's own Feedback section.
  savedEntry({ id: 'in-feedback', at: '2026-10-13T07:00:00.000Z', comment: 'Quoting the list itself.', decision: 'feedback', quote: 'A saved comment is listed here.', version: NOW_VERSION }),
];

test('docs review shell: saved inline entries are placed on their quotes with a margin marker and count and open oldest first; an entry whose quote is gone is listed as on an earlier revision; entries without an anchor are listed in the whole-document strip in time order', () => {
  const w = runWebview({ textNodes: true });
  w.deliver({ ...INLINE_DOC, docPath: MD_FILE, feedback: HISTORY });

  // The two entries on one passage share ONE mark, solid (nothing on it is a draft).
  const p = blockOf(w, SUMMARY_P);
  assert.deepEqual(p.children.map((c) => (c.nodeType === 3 ? `text:${c.data}` : `${c.tagName}.${c.className}:${inlineText(c)}`)),
    ['text:The header is ', 'mark.rv-anno:cut to 8 lines', 'text: until expanded.']);
  assert.equal(marksIn(w.body).length, 1, 'no other passage is marked');
  // A margin marker beside it, with the number of its comments.
  const markers = markersOf(w);
  assert.equal(markers.length, 1);
  assert.equal(markers[0]!.className, 'rv-marker');
  assert.equal(markers[0]!.tagName, 'button');
  assert.equal(allOf(markers[0]!).find((n) => n.className === 'rv-n')!.textContent, '2', 'the count');
  assert.equal(markers[0]!.attrs['aria-label'], '2 comments on this text');
  assert.equal(cardsIn(w).length, 0, 'the thread is closed until it is asked for');

  // A click on the marker opens the thread: the quote, then the comments OLDEST FIRST.
  fire(markers[0]!, 'click');
  const card = cardsIn(w)[0]!;
  assert.equal(p.nextSibling, card);
  assert.equal(card.children[0]!.textContent, '\u201ccut to 8 lines\u201d');
  const saved = card.children.filter((c) => c.className === 'rv-c');
  assert.deepEqual(saved.map(rowText), [
    ['Rev Iewer', shownWhen('2026-10-12T10:35:00.000Z'), 'rejected \u00b7 on an earlier revision', 'Say what the header shows when folded.'],
    ['Priya N', shownWhen('2026-10-13T03:45:00.000Z'), 'feedback', 'Header now lists path and counts. OK.'],
  ], 'author, time and decision; the one made on another version says so');
  assert.deepEqual(saved.map((r) => r.children[2]!.className), ['rv-tag rv-tag-reject', 'rv-tag']);
  // The marker closes it again, and a click on the mark opens it.
  fire(markersOf(w)[0]!, 'click');
  assert.equal(cardsIn(w).length, 0);
  fire(w.body, 'click', { target: marksIn(p)[0]! });
  assert.equal(cardsIn(w).length, 1);

  // THE STRIP: the entries with no passage, in time order.
  assert.notEqual(w.hist.style['display'], 'none');
  assert.equal(w.histSum.textContent, 'Earlier comments on the whole document (5)');
  assert.deepEqual(stripRows(w), [
    ['Priya N', shownWhen('2026-10-11T09:00:00.000Z'), 'suggestion \u00b7 on an earlier revision', 'Consider a shorter summary.'],
    // Its quote is gone: listed as on an earlier revision, WITH the quote it was made on.
    ['Rev Iewer', shownWhen('2026-10-12T11:00:00.000Z'), 'feedback \u00b7 on an earlier revision', '\u201ca passage that was removed\u201d', 'This limit was fine.'],
    ['Rev Iewer', shownWhen('2026-10-13T05:00:00.000Z'), 'approved', 'Approved as it stands.'],
    ['Rev Iewer', shownWhen('2026-10-13T06:00:00.000Z'), 'feedback \u00b7 on sequence-diagram.html', 'The arrow to the daemon is missing.'],
    // The document's own Feedback section is never searched, so this one has no passage either.
    ['Rev Iewer', shownWhen('2026-10-13T07:00:00.000Z'), 'feedback \u00b7 on an earlier revision', '\u201cA saved comment is listed here.\u201d', 'Quoting the list itself.'],
  ]);
  assert.equal(marksIn(blockOf(w, 'A saved comment is listed here.')).length, 0);
  assert.deepEqual(w.histList.children.map((r) => r.children[2]!.className), ['rv-tag', 'rv-tag', 'rv-tag rv-tag-approve', 'rv-tag', 'rv-tag']);

  // A reply on a saved thread is a draft on the same passage: dashed, counted, and sent with that anchor.
  addInCard(cardsIn(w)[0]!, 'Agreed.');
  assert.equal(marksIn(p)[0]!.className, 'rv-anno rv-draft');
  assert.equal(markersOf(w)[0]!.className, 'rv-marker rv-draft');
  assert.equal(allOf(markersOf(w)[0]!).find((n) => n.className === 'rv-n')!.textContent, '3');
  assert.equal(markersOf(w)[0]!.attrs['aria-label'], '3 comments on this text, 1 not sent');
  fire(w.bar.feedback, 'click');
  assert.deepEqual(postedOf(w, 'docs-decision')[0]!['comments'], [
    { comment: 'Agreed.', anchor: { quote: 'cut to 8 lines', sectionSlug: 'summary' }, version: NOW_VERSION },
  ]);
  // Once it is saved the thread stays, with its saved comments, and is solid again.
  w.send('docs-decision-result', { artifactId: 'LLD-abc-s7', ok: true, outcome: 'recorded', recorded: 1, message: 'Feedback sent.' });
  assert.equal(marksIn(p)[0]!.className, 'rv-anno');
  assert.equal(allOf(markersOf(w)[0]!).find((n) => n.className === 'rv-n')!.textContent, '2');
  // The host then posts the document again with the new entry: three on the passage.
  w.deliver({ ...INLINE_DOC, docPath: MD_FILE, feedback: [...HISTORY, savedEntry({ id: 'reply', at: '2026-10-13T08:00:00.000Z', comment: 'Agreed.', decision: 'feedback', quote: 'cut to 8 lines', slug: 'summary', version: NOW_VERSION })] });
  assert.equal(marksIn(blockOf(w, SUMMARY_P)).length, 1);
  assert.equal(allOf(markersOf(w)[0]!).find((n) => n.className === 'rv-n')!.textContent, '3');
  assert.equal(markersOf(w).length, 1, 'the earlier marker is replaced, not added to');
  assert.deepEqual(cardsIn(w)[0]!.children.filter((c) => c.className === 'rv-c').map((r) => r.children[3]!.textContent),
    ['Say what the header shows when folded.', 'Header now lists path and counts. OK.', 'Agreed.'], 'the open thread is open again, oldest first');

  // A document with no saved comments: no mark, no marker, and no strip.
  const none = runWebview({ textNodes: true });
  none.deliver({ ...INLINE_DOC, docPath: MD_FILE });
  assert.equal(marksIn(none.body).length, 0);
  assert.equal(markersOf(none).length, 0);
  assert.equal(none.hist.style['display'], 'none');
});

test('docs review shell: a document that is not awaiting review shows its history and offers send feedback only', () => {
  for (const state of [{ state: 'approved' }, { state: 'rejected' }, { state: 'pending', readOnly: true }]) {
    const w = runWebview({ textNodes: true });
    w.deliver({ ...INLINE_DOC, docPath: MD_FILE, feedback: HISTORY, ...state });
    // Its history is all there: the passage, its marker and thread, and the strip.
    assert.equal(marksIn(blockOf(w, SUMMARY_P)).length, 1);
    assert.equal(markersOf(w).length, 1);
    fire(markersOf(w)[0]!, 'click');
    assert.equal(cardsIn(w)[0]!.children.filter((c) => c.className === 'rv-c').length, 2);
    assert.equal(w.histList.children.length, 5);
    // Send feedback is the only decision offered.
    assert.deepEqual(w.controls(), { approve: 'hidden', reject: 'hidden', feedback: 'on' });
    assert.match(w.bar.state.textContent, /feedback only$/);
    // And it still works: an inline reply and a whole-document comment go as feedback.
    addInCard(cardsIn(w)[0]!, 'A late note.');
    w.bar.field.value = 'And one on the whole.';
    fire(w.bar.feedback, 'click');
    const sent = postedOf(w, 'docs-decision');
    assert.equal(sent.length, 1);
    assert.equal(sent[0]!['decision'], 'feedback');
    assert.equal((sent[0]!['comments'] as unknown[]).length, 2);
    // Approve and reject are not shown, and pressing them would post nothing more.
    fire(w.bar.approve, 'click');
    fire(w.bar.reject, 'click');
    assert.equal(postedOf(w, 'docs-decision').length, 1);
  }
});

test('docs review shell: author, comment and quote text are set as text, never as markup', () => {
  const HOSTILE_AUTHOR = '<img src=x onerror=alert(1)>';
  const HOSTILE_COMMENT = '<script>alert(1)</script><b>bold</b>';
  const HOSTILE_QUOTE = '<i>gone</i> & "quoted"';
  const w = runWebview({ textNodes: true });
  const created = w.created.length;
  w.deliver({
    ...INLINE_DOC, docPath: MD_FILE, reviewer: { name: HOSTILE_AUTHOR, source: 'git' },
    feedback: [
      savedEntry({ id: 'a', at: '2026-10-12T10:00:00.000Z', author: HOSTILE_AUTHOR, comment: HOSTILE_COMMENT, decision: 'reject', quote: 'cut to 8 lines', slug: 'summary' }),
      savedEntry({ id: 'b', at: '2026-10-12T11:00:00.000Z', author: HOSTILE_AUTHOR, comment: HOSTILE_COMMENT, decision: 'feedback', quote: HOSTILE_QUOTE }),
      savedEntry({ id: 'c', at: '2026-10-12T12:00:00.000Z', author: HOSTILE_AUTHOR, comment: HOSTILE_COMMENT, decision: '<u>approve</u>', kind: '<u>kind</u>' }),
      savedEntry({ id: 'd', at: '<time>', author: HOSTILE_AUTHOR, comment: HOSTILE_COMMENT, file: 'docs/x/<b>.html' }),
    ],
  });
  fire(markersOf(w)[0]!, 'click');
  addInCard(cardsIn(w)[0]!, HOSTILE_COMMENT); // a draft, shown under the reviewer's name

  // Each string is shown character for character.
  const card = cardsIn(w)[0]!;
  const rows = card.children.filter((c) => c.className === 'rv-c');
  assert.equal(rows[0]!.children[0]!.textContent, HOSTILE_AUTHOR);
  assert.equal(rows[0]!.children[3]!.textContent, HOSTILE_COMMENT);
  assert.equal(allOf(rows[1]!).find((n) => n.className === 'rv-who')!.textContent, HOSTILE_AUTHOR, "the draft's author");
  assert.equal(allOf(rows[1]!).find((n) => n.className === 'rv-text')!.textContent, HOSTILE_COMMENT, "the draft's text");
  const strip = stripRows(w);
  assert.deepEqual(strip.find((r) => r.includes(`\u201c${HOSTILE_QUOTE}\u201d`))?.slice(0, 1), [HOSTILE_AUTHOR], 'the quote of an entry with no passage');
  assert.ok(strip.every((r) => r[0] === HOSTILE_AUTHOR && r.at(-1) === HOSTILE_COMMENT));
  assert.ok(strip.some((r) => r[2] === '<u>kind</u>'), 'an unknown decision falls back to the kind, as text');
  assert.ok(strip.some((r) => r[1] === '<time>' && r[2] === 'comment \u00b7 on <b>.html'), 'a time that is not a time, and a file name, as text');
  assert.equal(w.bar.who.textContent, `as ${HOSTILE_AUTHOR} (git user)`);

  // NEVER as markup: nothing the comments touch was assigned innerHTML or outerHTML,
  const touched = [...allOf(card), ...allOf(w.histList), w.histSum, w.hist, ...markersOf(w).flatMap(allOf), ...marksIn(w.body), w.bar.who, w.drafts];
  assert.ok(touched.length > 30);
  for (const n of touched) assert.ok(!n.writes.some((x) => x.prop === 'innerHTML' || x.prop === 'outerHTML'), `${n.tagName}.${n.className} was never assigned markup`);
  // the body's own markup assignment (the guarded markdown path) carries none of it,
  for (const x of w.body.writes.filter((y) => y.prop === 'innerHTML')) {
    for (const hostile of [HOSTILE_AUTHOR, HOSTILE_COMMENT, HOSTILE_QUOTE]) assert.ok(!String(x.value).includes(hostile));
  }
  // and no element was made from their text: only the pane's own element kinds exist.
  const made = new Set(w.created.slice(created));
  for (const tag of ['script', 'img', 'b', 'i', 'u', 'time', 'iframe', 'a']) assert.ok(!made.has(tag), `no <${tag}> element was created`);
  // No attribute carries their text either, other than the names the pane itself gives.
  for (const n of touched) {
    for (const [k, v] of Object.entries(n.attrs)) assert.ok(!/[<>]/.test(v), `attribute ${k} of ${n.tagName} holds no comment text`);
  }
});

test('docs review shell: a saved entry with no string author, timestamp or comment is skipped and the strip says how many could not be shown', () => {
  const good = savedEntry({ id: 'ok', at: '2026-10-12T10:00:00.000Z', comment: 'Readable.', decision: 'feedback' });
  const placed = savedEntry({ id: 'ok2', at: '2026-10-12T11:00:00.000Z', comment: 'On the header.', decision: 'feedback', quote: 'cut to 8 lines', slug: 'summary' });
  const bad = [
    { ...good, author: 7 },
    { ...good, author: undefined },
    { ...good, timestamp: null },
    { ...good, comment: { text: 'x' } },
    { ...placed, comment: 42 },
    null,
    'a string',
    [],
  ];
  const w = runWebview({ textNodes: true });
  w.deliver({ ...INLINE_DOC, docPath: MD_FILE, feedback: [bad[0], good, bad[1], bad[2], placed, bad[3], bad[4], bad[5], bad[6], bad[7]] });
  assert.deepEqual(stripRows(w).map((r) => r.at(-1)), ['Readable.'], 'the readable whole-document entry is listed');
  assert.equal(marksIn(blockOf(w, SUMMARY_P)).length, 1, 'and the readable inline one is placed');
  assert.equal(allOf(markersOf(w)[0]!).find((n) => n.className === 'rv-n')!.textContent, '1', 'counted without the unreadable one on the same passage');
  assert.equal(w.histSum.textContent, 'Earlier comments on the whole document (1) \u00b7 8 saved comments could not be shown');

  // One unreadable entry reads in the singular.
  const one = runWebview({ textNodes: true });
  one.deliver({ ...INLINE_DOC, docPath: MD_FILE, feedback: [good, bad[0]] });
  assert.equal(one.histSum.textContent, 'Earlier comments on the whole document (1) \u00b7 1 saved comment could not be shown');
  // Only unreadable entries: the strip is still shown, to say so.
  const only = runWebview({ textNodes: true });
  only.deliver({ ...INLINE_DOC, docPath: MD_FILE, feedback: [bad[5], bad[0]] });
  assert.notEqual(only.hist.style['display'], 'none');
  assert.equal(only.histSum.textContent, 'Earlier comments on the whole document (0) \u00b7 2 saved comments could not be shown');
  assert.equal(only.histList.children.length, 0);
  // A feedback value that is not a list is no history at all, and breaks nothing.
  for (const feedback of ['x', 7, { a: 1 }, null]) {
    const odd = runWebview({ textNodes: true });
    odd.deliver({ ...INLINE_DOC, docPath: MD_FILE, feedback });
    assert.equal(odd.hist.style['display'], 'none');
    assert.deepEqual(odd.controls(), ALL_ON, 'the document is still shown and can be decided on');
    assert.ok(odd.body.children.length > 3);
  }
});

// Found in the hand check of E202610138d4b90c9:S001: with no document open the pane shows
// a notice as its body, and selecting that text offered the comment button.
test('docs review shell: no comment button is offered while no document is open', () => {
  const w = runWebview({ textNodes: true });
  // The host's notice of a failed list read is not a document: nothing is rendered as one.
  w.deliver({ artifactId: '', markdown: 'docs-review unavailable: workflow.pending: repo is required', openQuestions: [], blocked: false });
  assert.equal(w.body.children.length, 0, 'the notice is not put in the document body, so there is no text to select');
  assert.equal(w.pop.style['display'], 'none');
  assert.deepEqual(w.controls(), { approve: 'off', reject: 'off', feedback: 'off' });
  // With a document open a selection in it is offered the button.
  w.deliver(INLINE_DOC);
  selectIn(w, blockOf(w, SUMMARY_P), 'cut to 8 lines');
  assert.equal(w.pop.style['display'], 'block');
});

// ---------------------------------------------------------------------------
// Story E202610131f74c81f:S001 t4 — the list view: a paged table with search and a type
// filter in place of the dropdown, and the two views.
// ---------------------------------------------------------------------------

interface ListDoc { id: string; kind: string; title: string; status: string; openQuestions?: number; workItemId?: string }
/** 60 pending documents, deliberately out of order: 2 DEF, 3 LLD, 30 ISSUE, 24 CR and one of a type the pane does not know. */
const LIST_DOCS: ListDoc[] = [
  ...Array.from({ length: 24 }, (_, i): ListDoc => ({ id: `CR-${String(i).padStart(3, '0')}`, kind: 'CR', title: `Code review ${String(24 - i).padStart(2, '0')}`, status: 'pending', openQuestions: 0 })),
  { id: 'ZETA-1', kind: 'ZETA', title: 'A type the pane does not know', status: 'pending' },
  ...Array.from({ length: 30 }, (_, i): ListDoc => ({ id: `ISSUE-${String(i).padStart(3, '0')}`, kind: 'ISSUE', title: `issue ${String(30 - i).padStart(2, '0')} about the Daemon`, status: 'pending', openQuestions: i % 3 })),
  { id: 'LLD-b', kind: 'LLD', title: 'beta design', status: 'pending', openQuestions: 2, workItemId: 'E20261013bbbb:S002' },
  { id: 'LLD-a', kind: 'LLD', title: 'Alpha design', status: 'pending', openQuestions: 1, workItemId: 'E20261013aaaa:S001' },
  { id: 'LLD-c', kind: 'LLD', title: 'Gamma design of the review pane', status: 'pending', workItemId: 'E20261013cccc:S003' },
  { id: 'DEF-2', kind: 'DEF', title: 'Second epic', status: 'pending', openQuestions: 0 },
  { id: 'DEF-1', kind: 'DEF', title: 'First epic', status: 'pending', openQuestions: 4, workItemId: 'E20261013dddd' },
];
/** The rows on show: type, title, id, open questions. */
const listRows = (w: WebviewRun): string[][] =>
  w.lv.rows.children.map((tr) => [tr.children[0]!.children[0]!.textContent, tr.children[1]!.children[0]!.textContent, tr.children[2]!.textContent, tr.children[3]!.textContent]);
const rowButton = (w: WebviewRun, title: string): BodyStub => w.lv.rows.children.map((tr) => tr.children[1]!.children[0]!).find((b) => b.textContent === title)!;
const pagerOf = (w: WebviewRun): [string, boolean, boolean] =>
  [w.lv.page.textContent, (w.lv.prev as unknown as { disabled: boolean }).disabled, (w.lv.next as unknown as { disabled: boolean }).disabled];
function listed(o: Parameters<typeof runWebview>[0] = {}): WebviewRun {
  const w = runWebview(o);
  w.send('docs-list', { artifacts: LIST_DOCS });
  return w;
}
const typeText = (w: WebviewRun, text: string): void => { w.lv.q.value = text; fire(w.lv.q, 'input'); };
const chooseKind = (w: WebviewRun, kind: string): void => { w.lv.kind.value = kind; fire(w.lv.kind, 'change'); };
const listSaved = (w: WebviewRun): unknown => (w.saved.state as { list?: unknown } | undefined)?.list;

test('docs review shell: the list view shows 25 rows a page ordered by type then title, and the pager moves between pages and is disabled at the ends', () => {
  const w = runWebview();
  assert.equal(w.lv.view(), 'list', 'the pane opens on the list');
  assert.equal(w.lv.note.textContent, 'Loading the documents awaiting review\u2026');
  w.send('docs-list', { artifacts: LIST_DOCS });
  assert.equal(w.lv.note.style['display'], 'none');
  assert.equal(w.lv.count.textContent, '60 of 60 documents');

  // Page 1: the known types in their order (DEF, LLD, then ISSUE), each by title without regard to case.
  const first = listRows(w);
  assert.equal(first.length, 25);
  assert.deepEqual(first.slice(0, 6), [
    ['DEF', 'First epic', 'E20261013dddd', '4'],
    ['DEF', 'Second epic', 'DEF-2', '0'],
    ['LLD', 'Alpha design', 'E20261013aaaa:S001', '1'],
    ['LLD', 'beta design', 'E20261013bbbb:S002', '2'],
    ['LLD', 'Gamma design of the review pane', 'E20261013cccc:S003', ''],
    ['ISSUE', 'issue 01 about the Daemon', 'ISSUE-029', '2'],
  ], 'the id is the work item id when there is one; a missing open-question count is an empty cell');
  assert.deepEqual(first.slice(5).map((r) => r[1]), Array.from({ length: 20 }, (_, i) => `issue ${String(i + 1).padStart(2, '0')} about the Daemon`));
  assert.deepEqual(pagerOf(w), ['Page 1 of 3', true, false], 'previous is disabled on the first page');

  fire(w.lv.next, 'click');
  const second = listRows(w);
  assert.equal(second.length, 25);
  assert.deepEqual([second[0]![1], second[9]![1], second[10]![0], second[10]![1]], ['issue 21 about the Daemon', 'issue 30 about the Daemon', 'CR', 'Code review 01']);
  assert.deepEqual(pagerOf(w), ['Page 2 of 3', false, false]);

  fire(w.lv.next, 'click');
  const third = listRows(w);
  assert.equal(third.length, 10, 'the last page holds the rest');
  assert.deepEqual(third.at(-1), ['ZETA', 'A type the pane does not know', 'ZETA-1', ''], 'a type the pane does not know comes after the known ones');
  assert.deepEqual(pagerOf(w), ['Page 3 of 3', false, true], 'next is disabled on the last page');
  fire(w.lv.next, 'click');
  assert.deepEqual(pagerOf(w), ['Page 3 of 3', false, true], 'and pressing it there goes nowhere');
  fire(w.lv.prev, 'click');
  fire(w.lv.prev, 'click');
  fire(w.lv.prev, 'click');
  assert.deepEqual(pagerOf(w), ['Page 1 of 3', true, false]);
  assert.deepEqual(listRows(w), first);

  // A list that shrinks under the reviewer: the page beyond the last becomes the last.
  fire(w.lv.next, 'click');
  fire(w.lv.next, 'click');
  w.send('docs-list', { artifacts: LIST_DOCS.slice(0, 30) });
  assert.deepEqual(pagerOf(w), ['Page 2 of 2', false, true]);
  // Nothing awaiting review.
  w.send('docs-list', { artifacts: [] });
  assert.equal(listRows(w).length, 0);
  assert.equal(w.lv.note.textContent, 'No documents are awaiting review.');
  assert.deepEqual(pagerOf(w), ['Page 1 of 1', true, true]);
  assert.equal(w.lv.count.textContent, '0 of 0 documents');
});

test('docs review shell: the search matches every word in the title, id or work item id without regard to case, the type select filters with counts, and either change goes to page 1', () => {
  const w = listed();
  // The type select: all, then each type present with its count, in table order.
  assert.deepEqual(w.lv.kind.children.map((o) => [o.value, o.textContent]), [
    ['', 'All types (60)'], ['DEF', 'DEF (2)'], ['LLD', 'LLD (3)'], ['ISSUE', 'ISSUE (30)'], ['CR', 'CR (24)'], ['ZETA', 'ZETA (1)'],
  ]);

  // Every word must occur; case does not matter; surrounding spaces are ignored.
  typeText(w, '  DESIGN  ');
  assert.deepEqual(listRows(w).map((r) => r[1]), ['Alpha design', 'beta design', 'Gamma design of the review pane']);
  assert.equal(w.lv.count.textContent, '3 of 60 documents');
  typeText(w, 'design REVIEW');
  assert.deepEqual(listRows(w).map((r) => r[1]), ['Gamma design of the review pane'], 'both words, in either order');
  typeText(w, 'review design pane');
  assert.equal(listRows(w).length, 1);
  // In the artifact id, and in the work item id.
  typeText(w, 'issue-007');
  assert.deepEqual(listRows(w).map((r) => r[2]), ['ISSUE-007']);
  typeText(w, 'e20261013bbbb');
  assert.deepEqual(listRows(w).map((r) => r[1]), ['beta design']);
  typeText(w, 'bbbb:s002 beta');
  assert.equal(listRows(w).length, 1, 'words may be found in different fields');
  // Nothing matches: the toolbar stays and the view says so.
  typeText(w, 'no such thing');
  assert.equal(listRows(w).length, 0);
  assert.equal(w.lv.note.textContent, 'No document matches.');
  assert.notEqual(w.lv.note.style['display'], 'none');
  assert.deepEqual(pagerOf(w), ['Page 1 of 1', true, true]);
  assert.equal(w.lv.kind.children.length, 6, 'the type select is still there');
  typeText(w, '');
  assert.equal(w.lv.count.textContent, '60 of 60 documents');

  // The type filter, and the search inside it.
  chooseKind(w, 'ISSUE');
  assert.equal(w.lv.count.textContent, '30 of 60 documents');
  assert.ok(listRows(w).every((r) => r[0] === 'ISSUE'));
  assert.deepEqual(pagerOf(w), ['Page 1 of 2', true, false]);
  typeText(w, 'design');
  assert.equal(listRows(w).length, 0, 'the search looks only at the chosen type');
  typeText(w, 'daemon 3');
  // ("3" is in the title of 03, 13, 23 and 30, and in the id of ISSUE-003, -013 and -023, which are 27, 17 and 07.)
  assert.deepEqual(listRows(w).map((r) => r[1]), ['issue 03 about the Daemon', 'issue 07 about the Daemon', 'issue 13 about the Daemon', 'issue 17 about the Daemon', 'issue 23 about the Daemon', 'issue 27 about the Daemon', 'issue 30 about the Daemon']);
  typeText(w, '');

  // Either change goes back to page 1.
  fire(w.lv.next, 'click');
  assert.equal(w.lv.page.textContent, 'Page 2 of 2');
  typeText(w, 'issue');
  assert.equal(w.lv.page.textContent, 'Page 1 of 2', 'typing goes to page 1');
  fire(w.lv.next, 'click');
  chooseKind(w, '');
  assert.equal(w.lv.page.textContent, 'Page 1 of 2', 'so does choosing a type');
  assert.equal(w.lv.count.textContent, '30 of 60 documents', 'the search is kept across a change of type');
  // A chosen type that no pending document has any more is all types.
  typeText(w, '');
  chooseKind(w, 'ZETA');
  assert.equal(w.lv.count.textContent, '1 of 60 documents');
  w.send('docs-list', { artifacts: LIST_DOCS.filter((d) => d.kind !== 'ZETA') });
  assert.equal(w.lv.count.textContent, '59 of 59 documents');
  assert.equal(w.lv.kind.value, '');
});

test('docs review shell: the datalist offers at most 50 titles and ids of the chosen type', () => {
  const w = listed();
  const offered = (): string[] => w.lv.suggest.children.map((o) => o.value);
  // All types: the first documents in table order, a title then its id, 50 in all.
  assert.equal(offered().length, 50);
  assert.deepEqual(offered().slice(0, 6), ['First epic', 'E20261013dddd', 'Second epic', 'DEF-2', 'Alpha design', 'E20261013aaaa:S001']);
  assert.ok(w.lv.suggest.children.every((o) => o.tagName === 'option'));
  // One type: its titles and ids only.
  chooseKind(w, 'LLD');
  assert.deepEqual(offered(), ['Alpha design', 'E20261013aaaa:S001', 'beta design', 'E20261013bbbb:S002', 'Gamma design of the review pane', 'E20261013cccc:S003']);
  chooseKind(w, 'ISSUE');
  assert.equal(offered().length, 50, '30 issues have 60 titles and ids; 50 are offered');
  assert.ok(offered().every((t) => /^issue \d\d about the Daemon$|^ISSUE-\d{3}$/.test(t)));
  // The search still looks at all of them, not only those offered.
  typeText(w, 'issue 30');
  assert.deepEqual(listRows(w).map((r) => r[1]), ['issue 30 about the Daemon']);
  // Typing does not rebuild the suggestions (that would close the list the reviewer is choosing from).
  const before = w.lv.suggest.children[0];
  typeText(w, 'issue 2');
  assert.equal(w.lv.suggest.children[0], before);
});

test("docs review shell: pressing a row's title posts open-doc, a content with reveal switches to the document view (an unavailable one too), a content without it never changes the view, and the back button returns to the list with the document and its drafts kept", () => {
  const w = listed({ textNodes: true });
  const DOC = { ...INLINE_DOC, artifactId: 'LLD-a' };
  fire(rowButton(w, 'Alpha design'), 'click');
  assert.deepEqual(postedOf(w, 'open-doc').at(-1), { type: 'open-doc', artifactId: 'LLD-a' });
  assert.equal(w.lv.view(), 'list', 'still the list until the document arrives');

  // The document the reviewer asked for: brought into view.
  w.deliver({ ...DOC, reveal: true });
  assert.equal(w.lv.view(), 'doc');
  assert.equal(w.lv.title.textContent, 'Alpha design', 'the header names it by its title');
  assert.equal(w.bar.kind.textContent, 'LLD');
  draftOn(w, SUMMARY_P, 'cut to 8 lines', 'Say what the header shows.');
  w.bar.field.value = 'Overall.';
  fire(w.bar.field, 'input');

  // Back: the list again, as it was; the document and its drafts are kept.
  fire(w.lv.back, 'click');
  assert.equal(w.lv.view(), 'list');
  assert.equal(listRows(w).length, 25);
  assert.equal(marksIn(w.body).length, 1, 'the draft is still on its passage');
  assert.equal(w.bar.field.value, 'Overall.');

  // A content without reveal never changes the view: a re-read of the held document,
  w.deliver({ ...DOC, contentVersion: 'fedcba9876543210' });
  assert.equal(w.lv.view(), 'list', 'a re-read does not pull the reviewer off the list');
  assert.equal(marksIn(w.body).length, 1, 'and what is held is brought up to date, drafts and all');
  // or even of another one.
  w.deliver({ ...DOC, artifactId: 'LLD-b' });
  assert.equal(w.lv.view(), 'list');
  // Nor does it leave the document view when that is on show.
  w.deliver({ ...DOC, reveal: true });
  assert.equal(w.lv.view(), 'doc');
  assert.equal(marksIn(w.body).length, 1, 'the drafts came back with the document');
  w.deliver(DOC);
  assert.equal(w.lv.view(), 'doc');

  // An asked-for open whose read failed is brought into view too, so the error is seen.
  fire(w.lv.back, 'click');
  w.deliver({ artifactId: 'LLD-c', markdown: 'unavailable: cannot read', openQuestions: [], blocked: true, reveal: true });
  assert.equal(w.lv.view(), 'doc');
  assert.equal(w.lv.title.textContent, 'Gamma design of the review pane');
  assert.equal(w.controls().approve, 'off');
  // A document that is not in the list (opened from the delivery board) is named by its id.
  w.deliver({ ...DOC, artifactId: 'BUILD-zzz', readOnly: true, reveal: true });
  assert.equal(w.lv.title.textContent, 'BUILD-zzz');
  fire(w.lv.back, 'click');
  assert.equal(w.lv.view(), 'list', 'and back shows the documents awaiting review');
  assert.ok(!listRows(w).some((r) => r[2] === 'BUILD-zzz'));
});

test('docs review shell: the search, type, page and the view on show are restored from the saved state when the shell is rebuilt, a re-post to the rebuilt shell does not leave the list view, a draft saved after the list state keeps it and the reverse, and a saved state of another shape gives the defaults', () => {
  const DOC = { ...INLINE_DOC, artifactId: 'LLD-a' };
  const first = listed({ textNodes: true });
  chooseKind(first, 'ISSUE');
  typeText(first, 'daemon');
  fire(first.lv.next, 'click');
  assert.deepEqual(listSaved(first), { q: 'daemon', kind: 'ISSUE', page: 2, view: 'list' });

  // BOTH WRITERS keep each other's key. A draft saved after the list state:
  first.deliver({ ...DOC, reveal: true });
  draftOn(first, SUMMARY_P, 'cut to 8 lines', 'Say what the header shows.');
  const state = first.saved.state as { rv: Record<string, unknown>; list: unknown };
  assert.deepEqual(state.list, { q: 'daemon', kind: 'ISSUE', page: 2, view: 'doc' }, 'the list state is still there after a draft was saved');
  assert.ok(state.rv['LLD-a']);
  // and the list state saved after a draft:
  fire(first.lv.back, 'click');
  fire(first.lv.prev, 'click');
  const later = first.saved.state as { rv: Record<string, unknown>; list: unknown };
  assert.deepEqual(later.list, { q: 'daemon', kind: 'ISSUE', page: 1, view: 'list' });
  assert.ok(later.rv['LLD-a'], 'the draft is still there after the list state was saved');
  fire(first.lv.next, 'click');

  // The shell is rebuilt (the tab was hidden and shown): a new run over the same saved state.
  const rebuilt = runWebview({ textNodes: true, saved: first.saved });
  assert.equal(rebuilt.lv.view(), 'list');
  assert.equal(rebuilt.lv.q.value, 'daemon', 'the search text is back in the field');
  rebuilt.send('docs-list', { artifacts: LIST_DOCS });
  assert.equal(rebuilt.lv.kind.value, 'ISSUE');
  assert.deepEqual(pagerOf(rebuilt), ['Page 2 of 2', false, true]);
  assert.equal(rebuilt.lv.count.textContent, '30 of 60 documents');
  // The host posts the open document again on the boot ping: the reviewer stays on the list.
  rebuilt.deliver(DOC);
  assert.equal(rebuilt.lv.view(), 'list', 'a re-post does not leave the list view');
  assert.equal(marksIn(rebuilt.body).length, 1, 'the document is held, with its draft');

  // On the document view when the tab was hidden: restored to it once the document arrives.
  const onDoc = listed({ textNodes: true });
  onDoc.deliver({ ...DOC, reveal: true });
  const again = runWebview({ textNodes: true, saved: onDoc.saved });
  assert.equal(again.lv.view(), 'list', 'no document is held yet, so the list is shown');
  again.send('docs-list', { artifacts: LIST_DOCS });
  again.deliver(DOC);
  assert.equal(again.lv.view(), 'doc', 'the document view is restored when the document is re-posted');

  // A saved state of another shape gives the defaults, part by part.
  for (const bad of [undefined, null, 'x', { list: 'x' }, { list: null }, { list: { q: 7, kind: null, page: 0, view: 'grid' } }, { list: { page: 2.5 } }, { list: { page: '3' } }]) {
    const w = runWebview({ saved: { state: bad } });
    w.send('docs-list', { artifacts: LIST_DOCS });
    assert.equal(w.lv.view(), 'list');
    assert.equal(w.lv.q.value, '');
    assert.equal(w.lv.kind.value, '');
    assert.deepEqual(pagerOf(w), ['Page 1 of 3', true, false], JSON.stringify(bad));
  }
  // What is good in it is used: a page alone, and a type that is still there.
  const partial = runWebview({ saved: { state: { list: { q: 3, kind: 'CR', page: 9, view: 'list' } } } });
  partial.send('docs-list', { artifacts: LIST_DOCS });
  assert.equal(partial.lv.kind.value, 'CR');
  assert.deepEqual(pagerOf(partial), ['Page 1 of 1', true, true], 'a page beyond the last is the last');
  assert.deepEqual(listSaved(partial), { q: '', kind: 'CR', page: 1, view: 'list' }, 'and the saved page is corrected');
});

test("docs review shell: the list view's table is its own scrolling region, the toolbar and pager are outside it, titles and ids are set as text, and the recorded baseline is that of the new shell", async () => {
  const { createHash } = await import('node:crypto');
  const html = renderShellFor(SHELL_BASELINE.nonce);
  const markup = html.slice(html.indexOf('<body'), html.indexOf('<script'));
  const css = shellCss(html);

  // THE LIST VIEW, by position: toolbar, notice line, the table's region, pager; then the document view.
  const iList = markup.indexOf('<div id="insrc-rv-listview" class="rv-listview">');
  const iTool = markup.indexOf('<div class="rv-tool">');
  const iWrap = markup.indexOf('<div class="rv-tablewrap">');
  const iPager = markup.indexOf('<div class="rv-pager">');
  const iDoc = markup.indexOf('<div id="insrc-rv-docview" class="rv-docview">');
  assert.ok(iList > 0 && iTool > iList && iWrap > iTool && iPager > iWrap && iDoc > iPager, 'toolbar, table, pager, then the document view');
  const tool = markup.slice(iTool, iWrap);
  const wrap = markup.slice(iWrap, iPager);
  const pager = markup.slice(iPager, iDoc);
  assert.ok(wrap.endsWith('</table></div>'), "the table's region is closed before the pager opens");
  for (const id of ['insrc-rv-q', 'insrc-rv-suggest', 'insrc-rv-kindsel', 'insrc-rv-count', 'insrc-rv-listnote']) {
    assert.ok(tool.includes(`id="${id}"`) && !wrap.includes(`id="${id}"`), `${id} is above the table, outside its region`);
  }
  for (const id of ['insrc-rv-prev', 'insrc-rv-page', 'insrc-rv-next']) {
    assert.ok(pager.includes(`id="${id}"`) && !wrap.includes(`id="${id}"`), `${id} is under the table, outside its region`);
  }
  assert.ok(wrap.includes('<tbody id="insrc-docs-list">'), 'the rows are inside it');
  assert.match(wrap, /<thead><tr><th>Type<\/th><th>Title<\/th><th>Id<\/th><th>Open questions<\/th><\/tr><\/thead>/);
  // The rules: each view fills the pane as a column; the toolbar and pager keep their height; the table's region takes the rest and scrolls.
  assert.ok(css.includes('.rv-listview,.rv-docview{flex:1 1 auto;min-height:0;display:flex;flex-direction:column;}'));
  assert.ok(css.includes('.rv-tool{flex:0 0 auto;'));
  assert.ok(css.includes('.rv-pager{flex:0 0 auto;'));
  assert.ok(css.includes('.rv-tablewrap{flex:1 1 auto;min-height:0;overflow-y:auto;}'));
  // The search field completes from the datalist, and the dropdown of documents is gone.
  assert.match(tool, /<input id="insrc-rv-q" type="search" list="insrc-rv-suggest" autocomplete="off" aria-label="Search documents"/);
  assert.match(tool, /<datalist id="insrc-rv-suggest"><\/datalist>/);
  assert.ok(!markup.includes('<select id="insrc-docs-list"'));
  // The pager's and the header's buttons are round and icon-only, named by label and title.
  for (const [id, label] of [['insrc-rv-prev', 'Previous page'], ['insrc-rv-next', 'Next page'], ['insrc-rv-back', 'Back to the list']] as const) {
    assert.match(markup, new RegExp(`<button id="${id}" type="button" class="rv-ic rv-sm" aria-label="${label}" title="${label}"><svg `));
  }

  // Titles and ids are set as text: nothing in a row is assigned as markup, and no element is made from them.
  const w = runWebview();
  const made = w.created.length;
  w.send('docs-list', { artifacts: [
    { id: '<img src=x onerror=alert(1)>', kind: '<b>K</b>', title: '<script>alert(1)</script> & "quoted"', status: 'pending', workItemId: '<i>w</i>', openQuestions: 1 },
    { id: 'LLD-plain', kind: 'LLD', title: 'x'.repeat(300), status: 'pending' },
  ] });
  assert.deepEqual(listRows(w), [
    ['LLD', 'x'.repeat(300), 'LLD-plain', ''],
    ['<b>K</b>', '<script>alert(1)</script> & "quoted"', '<i>w</i>', '1'],
  ]);
  const touched = [...allOf(w.lv.rows), ...allOf(w.lv.kind), ...allOf(w.lv.suggest), w.lv.count, w.lv.note, w.lv.page];
  for (const n of touched) assert.ok(!n.writes.some((x) => x.prop === 'innerHTML' || x.prop === 'outerHTML'), `${n.tagName} was never assigned markup`);
  const tags = new Set(w.created.slice(made));
  for (const tag of ['script', 'img', 'b', 'i', 'a']) assert.ok(!tags.has(tag), `no <${tag}> element was created`);
  assert.equal(w.lv.suggest.children[0]!.value, 'x'.repeat(300), 'a suggestion is a value, not markup');
  assert.equal(w.lv.kind.children[2]!.textContent, '<b>K</b> (1)');

  // And the recorded baseline is that of this shell.
  assert.equal(createHash('sha256').update(html, 'utf8').digest('hex'), SHELL_BASELINE.sha256);
  assert.equal(html.length, SHELL_BASELINE.chars);
  assert.ok(html.includes(DOCS_LIST_SOURCE), 'the list source is inlined');
});

test("docs review shell: the host's notice of a failed read is shown in the list view's notice line, does not change the view, and is cleared by the next list that carries documents", () => {
  const NOTICE = { artifactId: '', markdown: 'docs-review unavailable: workflow.pending: `repo` is required', openQuestions: [], blocked: false };
  // The pane opens and the list cannot be read: the host posts the empty list and its notice.
  const w = runWebview({ textNodes: true });
  w.send('docs-list', { artifacts: [] });
  assert.equal(w.lv.note.textContent, 'No documents are awaiting review.');
  w.deliver(NOTICE);
  assert.equal(w.lv.view(), 'list', 'the notice does not change the view');
  assert.equal(w.lv.note.textContent, NOTICE.markdown, 'it is shown in place of the no-documents line');
  assert.equal(w.lv.note.className, 'rv-listnote rv-err');
  assert.notEqual(w.lv.note.style['display'], 'none');
  assert.ok(!w.lv.note.writes.some((x) => x.prop === 'innerHTML'), 'as text');
  assert.equal(w.body.children.length, 0, 'and not as a document');
  assert.equal(w.lv.kind.children.length, 1, 'the toolbar stays');
  // An empty list does not clear it; a list that carries documents does.
  w.send('docs-list', { artifacts: [] });
  assert.equal(w.lv.note.textContent, NOTICE.markdown);
  w.send('docs-list', { artifacts: LIST_DOCS });
  assert.equal(w.lv.note.style['display'], 'none');
  assert.equal(w.lv.note.className, 'rv-listnote');
  assert.equal(listRows(w).length, 25);

  // While a document is on show: the notice does not take the reviewer off it, nor replace it.
  const d = listed({ textNodes: true });
  d.deliver({ ...INLINE_DOC, artifactId: 'LLD-a', reveal: true });
  d.deliver(NOTICE);
  assert.equal(d.lv.view(), 'doc');
  assert.ok(d.body.children.length > 3, 'the document is still there');
  assert.equal(d.lv.title.textContent, 'Alpha design');
  fire(d.lv.back, 'click');
  assert.equal(d.lv.note.textContent, NOTICE.markdown, 'it is waiting on the list view');
  // The next document the reviewer opens clears it.
  d.deliver({ ...INLINE_DOC, artifactId: 'LLD-b', reveal: true });
  fire(d.lv.back, 'click');
  assert.equal(d.lv.note.style['display'], 'none');
});

// ---------------------------------------------------------------------------
// Story E202610131f74c81f:S001 t5 — a content for the document already shown is a reload
// in place.
// ---------------------------------------------------------------------------

test("docs review shell: a reload marked changed keeps the scroll position and the drafts and says the document changed; a reload after the shell's own decision keeps the decision's result line", () => {
  const CHANGED_LINE = 'This document changed on disk and was reloaded.';
  const w = listed({ textNodes: true });
  const scroll = w.scroll as unknown as { scrollTop: number };
  // As a browser does: rendering the body again puts its region back at the top.
  const own = Object.getOwnPropertyDescriptor(w.body, 'innerHTML')!;
  Object.defineProperty(w.body, 'innerHTML', {
    configurable: true,
    get: () => own.get!.call(w.body) as string,
    set: (v: string) => { own.set!.call(w.body, v); scroll.scrollTop = 0; },
  });
  const DOC = { ...INLINE_DOC, artifactId: 'LLD-a' };
  const revised = INLINE_MD.replace('# ', '# Revised: ');
  const REVISED = { ...DOC, markdown: revised, sections: deriveSectionIndex(revised), contentVersion: 'fedcba9876543210' };

  scroll.scrollTop = 77;
  w.deliver({ ...DOC, reveal: true });
  assert.equal(scroll.scrollTop, 0, 'a document newly opened starts where the render left it');
  draftOn(w, SUMMARY_P, 'cut to 8 lines', 'Say what the header shows.');
  w.bar.field.value = 'Overall.';
  fire(w.bar.field, 'input');
  scroll.scrollTop = 420;

  // THE RELOAD: the file changed on disk, the host re-read it and marked the content changed.
  w.deliver({ ...REVISED, changed: true });
  assert.equal(scroll.scrollTop, 420, 'the scroll position is kept');
  assert.equal(marksIn(w.body).length, 1, 'the draft is put back on its passage');
  assert.equal(w.drafts.textContent, '1 inline comment drafted. Sent with the button you press.');
  assert.equal(w.bar.field.value, 'Overall.', 'the whole-document field is untouched');
  assert.equal(w.bar.result.textContent, CHANGED_LINE);
  assert.equal(w.bar.result.className, 'rv-result', 'said plainly, not as an error or a success');
  assert.equal(w.lv.view(), 'doc');
  assert.ok(w.body.children.some((c) => c.textContent.startsWith('Revised: ')), 'and the new text is shown');

  // The line is only for a reload marked changed WITH a different version.
  const line = (first: Record<string, unknown>, then: Record<string, unknown>): string => {
    const x = runWebview({ textNodes: true });
    x.deliver({ ...first, reveal: true });
    x.deliver(then);
    return x.bar.result.textContent;
  };
  assert.equal(line(DOC, { ...DOC, changed: true }), '', 'marked changed, the same version: nothing is said');
  assert.equal(line(DOC, REVISED), '', 'a different version, not marked changed: nothing is said');
  assert.equal(line(DOC, { ...REVISED, changed: 'yes' }), '', 'changed must be true itself');
  assert.equal(line(DOC, { ...REVISED, changed: true }), CHANGED_LINE);
  assert.equal(line({ ...DOC, artifactId: 'LLD-b' }, { ...REVISED, changed: true }), '', 'another document is not a reload');
  // Without a version on either side there is nothing to compare: nothing is said.
  const { contentVersion: _a, ...BARE } = DOC;
  assert.equal(line(BARE, { ...BARE, changed: true }), '');

  // The scroll position is kept on every reload of the shown document, marked or not,
  scroll.scrollTop = 133;
  w.deliver(REVISED);
  assert.equal(scroll.scrollTop, 133);
  // and not carried over to another document.
  w.deliver({ ...DOC, artifactId: 'LLD-b', reveal: true });
  assert.equal(scroll.scrollTop, 0);

  // THE SHELL'S OWN DECISION: its re-read is not marked changed, so the result line stays
  // whatever the version; the watch's report of the same write then carries the version
  // already shown and says nothing either.
  w.deliver({ ...DOC, reveal: true });
  w.bar.field.value = 'Please revise.';
  fire(w.bar.field, 'input');
  scroll.scrollTop = 250;
  fire(w.bar.feedback, 'click');
  assert.equal(w.bar.result.textContent, 'Sending…');
  const RESULT = 'Done. 1 comment saved. The chat has been told.';
  w.send('docs-decision-result', { artifactId: 'LLD-a', ok: true, outcome: 'recorded', recorded: 1, message: RESULT });
  w.deliver(REVISED);
  assert.equal(w.bar.result.textContent, RESULT, "the decision's own re-read keeps its result line");
  assert.equal(w.bar.result.className, 'rv-result rv-ok');
  assert.equal(scroll.scrollTop, 250);
  w.deliver({ ...REVISED, changed: true });
  assert.equal(w.bar.result.textContent, RESULT, 'the watch reporting that same write changes nothing');
  // A later change from outside does replace it.
  w.deliver({ ...DOC, contentVersion: '1111111111111111', changed: true });
  assert.equal(w.bar.result.textContent, CHANGED_LINE);
  assert.equal(scroll.scrollTop, 250);
});

// Found in the hand check of E202610138d4b90c9:S001: the diagram and the mock were drawn
// inside the markdown as well as offered as tabs.
test('docs review shell: a diagram or mock that has its own tab is not also drawn inside the markdown; one with no tab still is', () => {
  const [UX, SEQ] = COMPANIONS as [typeof COMPANIONS[number], typeof COMPANIONS[number]];
  const BASE = {
    artifactId: 'LLD-abc-s7', markdown: '# Doc\n\nBody.\n', openQuestions: [], blocked: false,
    sequenceDefinition: SEQ_RECORD, uxDefinition: UX_RECORD, companions: COMPANIONS,
  };
  const MD = { title: 'LLD.md', type: 'markdown', relPath: 'docs/epics/x/S002/LLD.md' };
  const tabOf = (c: { relPath: string; title: string }): Record<string, unknown> => ({ title: c.title, type: 'html', relPath: c.relPath });
  const drawn = (documents?: unknown): [boolean, boolean, number] => {
    const w = runWebview();
    w.deliver({ ...BASE, ...(documents !== undefined ? { documents } : {}) });
    return [w.diagram.children.length > 0, w.experience.children.length > 0, w.tabs.children.length];
  };
  // No tabs (a host that sends no documents, or only the markdown): both are drawn in the body, as before.
  assert.deepEqual(drawn(), [true, true, 0]);
  assert.deepEqual(drawn([MD]), [true, true, 0]);
  // Both offered as tabs: neither is drawn in the body.
  assert.deepEqual(drawn([MD, tabOf(UX), tabOf(SEQ)]), [false, false, 3]);
  // One offered as a tab: only the other is drawn in the body.
  assert.deepEqual(drawn([MD, tabOf(SEQ)]), [false, true, 2]);
  assert.deepEqual(drawn([MD, tabOf(UX)]), [true, false, 2]);
  // A tab for some other file does not hide either; nor does a documents value of another shape.
  assert.deepEqual(drawn([MD, { title: 'Other', type: 'html', relPath: 'docs/epics/x/S002/other.html' }]), [true, true, 2]);
  assert.deepEqual(drawn('x').slice(0, 2), [true, true]);
  assert.deepEqual(drawn([{ title: 'x', type: 'markdown', relPath: SEQ.relPath }]).slice(0, 2), [true, true], 'a markdown tab of that path is not its HTML tab');

  // The same document posted again with its tabs: what was drawn in the body is taken out.
  const w = runWebview();
  w.deliver(BASE);
  assert.ok(w.diagram.children.length > 0 && w.experience.children.length > 0);
  w.deliver({ ...BASE, documents: [MD, tabOf(UX), tabOf(SEQ)] });
  assert.deepEqual([w.diagram.children.length, w.experience.children.length], [0, 0]);
});

// Story E20261013dd277f9c:S001 — the daemon's pending list now carries BUILD records.
test('docs review shell: a BUILD row is listed between ISSUE and CR, counted in the type select, and opens like any other row', () => {
  const w = runWebview({ textNodes: true });
  w.send('docs-list', { artifacts: [
    { id: 'CR-abc-S001', kind: 'CR', title: 'CR E20261013abc:S001', status: 'pending', workItemId: 'E20261013abc:S001' },
    { id: 'BUILD-abc-S001', kind: 'BUILD', title: 'BUILD E20261013abc:S001', status: 'pending', workItemId: 'E20261013abc:S001', openQuestions: 0 },
    { id: 'ISSUE-def', kind: 'ISSUE', title: 'A defect', status: 'pending' },
    { id: 'LLD-abc-S001', kind: 'LLD', title: 'A design', status: 'pending' },
  ] });
  assert.deepEqual(listRows(w).map((r) => r[0]), ['LLD', 'ISSUE', 'BUILD', 'CR'], 'between ISSUE and CR');
  assert.deepEqual(listRows(w)[2], ['BUILD', 'BUILD E20261013abc:S001', 'E20261013abc:S001', '0']);
  assert.deepEqual(w.lv.kind.children.map((o) => [o.value, o.textContent]), [
    ['', 'All types (4)'], ['LLD', 'LLD (1)'], ['ISSUE', 'ISSUE (1)'], ['BUILD', 'BUILD (1)'], ['CR', 'CR (1)'],
  ]);
  w.lv.kind.value = 'BUILD';
  fire(w.lv.kind, 'change');
  assert.deepEqual(listRows(w).map((r) => r[1]), ['BUILD E20261013abc:S001']);
  // It opens like any other row, and is decided like any pending document that takes no comments.
  fire(rowButton(w, 'BUILD E20261013abc:S001'), 'click');
  assert.deepEqual(postedOf(w, 'open-doc').at(-1), { type: 'open-doc', artifactId: 'BUILD-abc-S001' });
  w.deliver({ artifactId: 'BUILD-abc-S001', markdown: '# Build — Story S001\n\nAll tasks passed.\n', openQuestions: [], blocked: false, state: 'pending', contentVersion: '0123456789abcdef', reveal: true });
  assert.equal(w.lv.view(), 'doc');
  assert.equal(w.lv.title.textContent, 'BUILD E20261013abc:S001');
  assert.equal(w.bar.kind.textContent, 'BUILD');
  assert.equal(w.controls().approve, 'on');
  assert.equal(w.controls().reject, 'on');
});
