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
import { createDocsReviewHost, DOCS_BODY_RENDERER_SOURCE, DOCS_SECTIONS_SOURCE, DOCS_FR_SOURCE, DOCS_DIAGRAM_SOURCE, DOCS_UX_SOURCE, DEGRADE_NOTICE, SECTION_INDEX_NOTICE, companionVisualKind } from '../docs-review-panel.js';
import type { StructuredRenderer, CompanionSlotState, CompanionRefKind } from '../docs-review-panel.js';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { deriveSectionIndex } from '../docs-sections.js';
import type { ChatPanelChannel } from '../chat-panel.js';
import type { DocsReviewClient, DocsContent } from '../docs-review-client.js';
import type { DocsArtifactSummary } from '../protocol.js';
import type { WorkflowApproveResult } from '../../../../src/workflow/gates.js';
// S004/t2 — the SHARED parity fixtures, consumed by BOTH the daemon renderer and
// the client one, so the structural diff compares two RENDERERS rather than two
// authors' intentions. They live in the plugin test tree because S004 must touch
// no file under src/.
import { UX_PARITY_FIXTURES, UX_RENESTED_FIXTURE } from './fixtures/ux-parity.js';

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

// RENAMED (S001/t4). The old name said "no innerHTML" and the old body asserted
// it, which stopped being the contract the moment the body started rendering
// markdown. Asserting the SCRUB IS PRESENT is the stronger check anyway: a
// blanket doesNotMatch(/innerHTML/) passes if someone deletes the render, while
// this fails if someone deletes the guard. Named for what it now checks, rather
// than inheriting the stale-name drift the chat-panel precedent carries.
test('rendered shell: one nonce, unwidened CSP, docs-review surface, guardMd present, no remote origin', () => {
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

  assert.match(html, /class="insrc-term-review"/, 'renders the docs-review surface class');
  // The --it-* tokens are scoped to .insrc-term, so the surface must sit inside one.
  assert.match(html, /<body class="insrc-term">/, 'the surface is nested in an .insrc-term element so its CSS variables resolve');

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

/** A minimal element stub: enough for innerHTML/textContent/className and the
 *  querySelectorAll('a'|'img') guardMd walks. */
function stubEl(): Record<string, unknown> {
  return {
    innerHTML: '',
    textContent: '',
    className: '',
    querySelectorAll: () => [] as unknown[],
  };
}

/** Evaluate DOCS_BODY_RENDERER_SOURCE with a chosen `marked` global and return
 *  its renderMarkdownBody. */
function loadRenderer(marked: unknown): (el: unknown, src: string) => {
  el: unknown; degradation: { degraded: boolean; notice?: string };
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
  const el = stubEl();
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
  const el = stubEl();
  const out = loadRenderer({ parse: () => { throw new Error('boom'); } })(el, body);

  assert.equal(el['textContent'], body, 'the FULL body text is present — degraded is plainer, never partial');
  assert.equal(el['innerHTML'], '', 'no partial markup is left behind');
  assert.equal(out.degradation.degraded, true);
  assert.equal(out.degradation.notice, DEGRADE_NOTICE);
  assert.ok((out.degradation.notice ?? '').length > 0, 'the reviewer is TOLD, not left to infer');
});

test('t4: a MISSING vendored global takes the SAME fallback path as a parse throw — one code path, one message', () => {
  const body = '# Title\n\nbody text';

  const thrown = loadRenderer({ parse: () => { throw new Error('boom'); } })(stubEl(), body);
  const missing = loadRenderer(undefined)(stubEl(), body);
  const notAFunction = loadRenderer({})(stubEl(), body);

  // Identical degradation from all three, which is what "one path, one message" means.
  assert.deepEqual(missing.degradation, thrown.degradation);
  assert.deepEqual(notAFunction.degradation, thrown.degradation);
  assert.equal(missing.degradation.notice, DEGRADE_NOTICE);

  const el = stubEl();
  loadRenderer(undefined)(el, body);
  assert.equal(el['textContent'], body, 'the full body still shows with no renderer at all');
});

test('t4: guardMd strips a non-http href and an image src from the rendered body', () => {
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
  assert.equal(safe._attrs['href'], 'https://example.com', 'an https href survives');
  assert.equal(safe._attrs['rel'], 'noopener noreferrer', 'and is opened safely');
  assert.equal(safe._attrs['target'], '_blank');
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

async function openAndGetContent(markdown: string): Promise<Record<string, unknown>> {
  const fc = fakeChannel();
  const { client } = fakeClient({ content: () => ({ markdown, openQuestions: [], blocked: false }) });
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

test('t5: opening a document posts docs-content carrying BOTH the markdown and a sections index derived from it', async () => {
  const payload = await openAndGetContent(DOC_MD);

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
    const payload = await openAndGetContent(md);
    const posted = payload['sections'] as { anchors: unknown[] };
    const rederived = deriveSectionIndex(String(payload['markdown']));
    assert.deepEqual(posted, rederived, 'the posted index is exactly what this message’s markdown yields');
  }
});

test('t5: a document with NO headings posts an empty anchors array', async () => {
  const payload = await openAndGetContent('just prose, no headings at all\n');
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
  const ok = await openAndGetContent(DOC_MD);
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
  const payload = await openAndGetContent(DOC_MD);
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

interface StubNode {
  tagName: string; id: string; className: string; textContent: string; value: string;
  children: StubNode[]; attrs: Record<string, string>; listeners: Record<string, () => void>;
  scrolled: boolean;
  appendChild(c: StubNode): void; removeChild(c: StubNode): void;
  setAttribute(k: string, v: string): void;
  addEventListener(k: string, fn: () => void): void;
  scrollIntoView(): void;
  readonly firstChild: StubNode | undefined;
}
function node(tagName = 'div'): StubNode {
  const n: StubNode = {
    tagName, id: '', className: '', textContent: '', value: '',
    children: [], attrs: {}, listeners: {}, scrolled: false,
    appendChild(c) { this.children.push(c); },
    removeChild(c) { this.children = this.children.filter((x) => x !== c); },
    setAttribute(k, v) { this.attrs[k] = v; },
    addEventListener(k, fn) { this.listeners[k] = fn; },
    scrollIntoView() { this.scrolled = true; },
    get firstChild() { return this.children[0]; },
  };
  return n;
}

/** Eval DOCS_SECTIONS_SOURCE with a stub `document`, returning its three functions. */
function loadSections(byId: Record<string, StubNode> = {}) {
  const doc = {
    createElement: (t: string) => node(t),
    getElementById: (id: string) => byId[id],
  };
  // eslint-disable-next-line no-new-func
  const make = new Function('document', `${DOCS_SECTIONS_SOURCE}; return {stampSlugs:stampSlugs,renderSectionChooser:renderSectionChooser,jumpToSection:jumpToSection,renderDegradationNotice:renderDegradationNotice};`);
  return make(doc) as {
    stampSlugs(root: unknown, sections: unknown): number;
    renderSectionChooser(host: StubNode, sections: unknown, onPick: (s: string) => void): boolean;
    jumpToSection(slug: string): boolean;
    renderDegradationNotice(host: StubNode, d: unknown): boolean;
  };
}

/** A body stub whose querySelectorAll('h1..h6') returns the given headings. */
function bodyWithHeadings(titles: string[]): { root: { querySelectorAll(s: string): StubNode[] }; heads: StubNode[] } {
  const heads = titles.map((t) => { const h = node('h2'); h.textContent = t; return h; });
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
  const host = node();
  const rendered = loadSections().renderSectionChooser(host, deriveSectionIndex('just prose'), () => {});
  assert.equal(rendered, false);
  assert.equal(host.children.length, 0, 'no select, no placeholder, no empty control');
});

test('t6: the chooser labels each entry with the heading VERBATIM and jumps to the chosen slug', () => {
  const md = ['# Low-level design', '## Contract details', '### Error paths'].join('\n');
  const index = deriveSectionIndex(md);

  const host = node();
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
  sel.listeners['change']!();
  assert.deepEqual(picked, ['contract-details']);

  // ...and the jump moves the view DIRECTLY to that element.
  const target = node('h2');
  const jumped = loadSections({ 'contract-details': target }).jumpToSection('contract-details');
  assert.equal(jumped, true);
  assert.equal(target.scrolled, true, 'scrolled straight to the section');
  // an unknown slug is a no-op, never a throw.
  assert.equal(loadSections().jumpToSection('nope'), false);
});

test('t6: the chooser placeholder selection does NOT fire a jump', () => {
  const host = node();
  const picked: string[] = [];
  const api = loadSections();
  api.renderSectionChooser(host, deriveSectionIndex('# One'), (s) => picked.push(s));
  const sel = host.children[0]!;
  sel.value = '';              // the 'jump to section…' placeholder
  sel.listeners['change']!();
  assert.deepEqual(picked, [], 'picking the placeholder is not a navigation');
});

test('t6: the ac3 notice appears when degraded and is ABSENT when not', () => {
  const api = loadSections();

  const host = node();
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

test('t6: approve and request-changes still reach workflow.approve / workflow.resolveComment unchanged, and the COMMENTABLE_KINDS gate holds', async () => {
  // approve path
  const fc = fakeChannel();
  const { client, calls } = fakeClient();
  const host = createDocsReviewHost({ createPanel: () => fc.channel, client });
  host.open();
  await tick();
  fc.send(env('docs-decision', { artifactId: 'LLD-abc-s7', accept: true }));
  await tick();
  assert.deepEqual(calls.approve, ['LLD-abc-s7'], 'approve still passes the artifact id unchanged');

  // request-changes path
  const fc2 = fakeChannel();
  const { client: c2, calls: calls2 } = fakeClient();
  createDocsReviewHost({ createPanel: () => fc2.channel, client: c2 }).open();
  await tick();
  fc2.send(env('docs-decision', { artifactId: 'LLD-abc-s7', accept: false, note: 'tighten it' }));
  await tick();
  assert.deepEqual(calls2.comment, [{ id: 'LLD-abc-s7', note: 'tighten it' }], 'resolveComment params unchanged');

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
  const host = node();
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

/** Open a document whose client returns `content`, and give back the posted payload. */
async function openWithContent(content: DocsContent): Promise<Record<string, unknown>> {
  const fc = fakeChannel();
  const { client } = fakeClient({ content: () => content });
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
  chars:  87244,
  bytes:  87304,
  sha256: '8fa812b18dadf8c59a90cecb4fca8f8d7a3ea66e14d1aab024fdcac04472e23d',
} as const;

/**
 * The pin BEFORE S004/t2, kept so the move can be ACCOUNTED FOR arithmetically
 * rather than merely declared. S004/t1 was data-only and did not touch it; t2 adds
 * the fifth source string and its CSS fragment; t6 additionally touches the
 * BOOTSTRAP, which is the one task in this Story licensed to. The test below proves
 * the sum closes EXACTLY:
 *
 *   79530  the pin before S004 touched the shell
 * +  4870  DOCS_UX_SOURCE, measured from the string itself
 * +  2346  the ux CSS fragment, measured from the emitted shell
 * +   498  the t6 BOOTSTRAP delta, declared below
 * = 87244
 *
 * so nothing slipped in alongside them.
 *
 * Every value here was COMPUTED at the fixed nonce and copied from the computation,
 * never typed. A number typed into a pin is a number nobody checked.
 */
const SHELL_BASELINE_BEFORE_S004_T2 = { chars: 79530, bytes: 79582 } as const;

/**
 * The t6 BOOTSTRAP delta, declared rather than absorbed. t1-t5 added only source
 * text; t6 is the task that changes the surface, and it does so in four places:
 * the `insrc-docs-experience` host div, the `uxHostEl` lookup, the slot build plus
 * mount call, and the frame's noun becoming kind-aware. Those are not measurable
 * from a single artefact the way a source string is, so the number is pinned here
 * and the accounting test makes it close — which is the point: a bootstrap change
 * that cannot be named would otherwise hide inside a moved hash.
 */
const BOOTSTRAP_DELTA_S004_T6 = 498;

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
    't1 is data-only: the emitted shell is unchanged from the captured pre-S002 baseline',
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

/** A node stub that records every property WRITE, so a test can prove a value
 *  reached the DOM via textContent and never through a markup-bearing property. */
interface FrNode {
  tag: string;
  // The DOM's own property name, because the shipped source reads `n.tagName`
  // (frIsHeading) — a stub that only had `tag` would silently answer undefined.
  tagName: string;
  className: string;
  textContent: string;
  children: FrNode[];
  writes: Array<{ prop: string; value: unknown }>;
  appendChild(c: FrNode): FrNode;
}
function frNode(tag: string): FrNode {
  const writes: FrNode['writes'] = [];
  const children: FrNode[] = [];
  const n = {
    tag, tagName: tag, children, writes,
    _className: '', _text: '',
    appendChild(c: FrNode) { children.push(c); return c; },
  } as unknown as FrNode & { _className: string; _text: string };
  Object.defineProperty(n, 'className', {
    get() { return n._className; },
    set(v: string) { n._className = v; writes.push({ prop: 'className', value: v }); },
  });
  Object.defineProperty(n, 'textContent', {
    get() { return n._text; },
    set(v: string) { n._text = v; writes.push({ prop: 'textContent', value: v }); },
  });
  // innerHTML / outerHTML exist ONLY to be caught: a write to either is recorded
  // and asserted against, so "no markup assignment" is executed, not grepped.
  for (const prop of ['innerHTML', 'outerHTML']) {
    Object.defineProperty(n, prop, { set(v: unknown) { writes.push({ prop, value: v }); }, get() { return ''; } });
  }
  return n as FrNode;
}

/** Eval DOCS_FR_SOURCE with a stub `document`, returning renderFunctionalRequirements. */
function loadFr(): (record: unknown) => { el: FrNode; degradation?: unknown } {
  const doc = { createElement: (t: string) => frNode(t) };
  // eslint-disable-next-line no-new-func
  const make = new Function('document', `${DOCS_FR_SOURCE}; return renderFunctionalRequirements;`);
  return make(doc) as ReturnType<typeof loadFr>;
}

/** Every node in the tree, root first. */
function frAll(n: FrNode): FrNode[] {
  return [n, ...n.children.flatMap(frAll)];
}
const frItems = (root: FrNode): FrNode[] => frAll(root).filter((n) => n.className === 'insrc-fr-item');
const frIds = (root: FrNode): string[] =>
  frAll(root).filter((n) => n.className === 'insrc-fr-id').map((n) => n.textContent);
const frGroupLabels = (root: FrNode): string[] =>
  frAll(root).filter((n) => n.className === 'insrc-fr-group-label').map((n) => n.textContent);

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
  const texts = frAll(el).map((n) => n.textContent);
  assert.ok(texts.includes('Doc-level one.'));
  assert.ok(texts.includes('because one'), 'the rationale is carried');
  assert.equal(frAll(el).filter((n) => n.className === 'insrc-fr-why').length, 1,
    'and only where the record has one');

  // EXECUTED, not grepped: every write that put a string on screen was textContent.
  const written = frAll(el).flatMap((n) => n.writes);
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
  const stmt = frAll(el).find((n) => n.className === 'insrc-fr-stmt');
  assert.ok(stmt);
  assert.equal(stmt!.textContent, HOSTILE_STMT, 'the statement is text, not markup');

  // The <script> became TEXT, not a node: one id span + one statement span only.
  assert.equal(frItems(el)[0]!.children.length, 2, 'no element was created from the markup');
  assert.equal(frAll(el).flatMap((n) => n.writes).filter((w) => w.prop !== 'className' && w.prop !== 'textContent').length, 0,
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
    frAll(dup.el).filter((n) => n.className === 'insrc-fr-stmt').map((n) => n.textContent),
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
  const doc = { createElement: (t: string) => frNode(t) };
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

test('t3 (contract): docs-sections.ts is unchanged and still has zero imports', async () => {
  const { readFileSync } = await import('node:fs');
  const { execFileSync } = await import('node:child_process');
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
  const repo = resolve(here, '..', '..', '..', '..');
  const rel = 'vscode-plugin/src/chat/docs-sections.ts';
  const atBase = execFileSync('git', ['show', `09e6efa:${rel}`], { cwd: repo, encoding: 'utf8', maxBuffer: 1 << 24 });
  assert.equal(src, atBase, 'docs-sections.ts is byte-identical to its pre-S002 state');
});

// ---------------------------------------------------------------------------
// S002/t4 — PLACEMENT. The only destructive operation in this Story, so the
// bound is PROVED rather than assumed: a removal that runs too far deletes
// document content the reviewer is about to approve.
// ---------------------------------------------------------------------------

/** A body-container stub with ORDERED children, insertBefore/removeChild/firstChild
 *  and a querySelectorAll that finds headings — enough for the sibling walk and
 *  the bounded removal, and no more. Counts createElement calls so "zero DOM
 *  activity" is assertable as an absence rather than inferred from the tree. */
interface BodyStub {
  tagName: string;
  id: string;
  textContent: string;
  children: BodyStub[];
  insertBefore(n: BodyStub, ref: BodyStub | null): BodyStub;
  removeChild(n: BodyStub): BodyStub;
  appendChild(n: BodyStub): BodyStub;
  querySelectorAll(sel: string): BodyStub[];
  // S003/t6 — the mount anchors via `#slug` and inserts after the heading, so
  // the stub must model the parent link and the sibling order too. A stub
  // missing these would make the anchored path silently take the fallback.
  querySelector(sel: string): BodyStub | null;
  parentNode: BodyStub | null;
  readonly nextSibling: BodyStub | null;
  readonly firstChild: BodyStub | null;
  // Present so the REAL bootstrap can run against these stubs: the body renderer
  // assigns innerHTML, the notice sets role, and the controls attach listeners.
  innerHTML: string;
  className: string;
  setAttribute(k: string, v: string): void;
  addEventListener(t: string, l: () => void): void;
  attrs: Record<string, string>;
  listeners: Record<string, Array<() => void>>;
}
function bodyStub(tagName: string, id = '', text = ''): BodyStub {
  const children: BodyStub[] = [];
  const attrs: Record<string, string> = {};
  const listeners: Record<string, Array<() => void>> = {};
  let html = '';
  let txt = text;
  const n: BodyStub = {
    tagName, id, children, attrs, listeners,
    className: '',
    // THE REAL DOM CONTRACT, modelled because the idempotence check depends on
    // it: assigning innerHTML or textContent REPLACES every child. That is what
    // makes renderContent's per-message rebuild clear a previously placed block
    // rather than merely not re-add one — and a stub that kept its children
    // would make that test prove nothing.
    get innerHTML() { return html; },
    set innerHTML(v: string) {
      html = v;
      children.length = 0;
      // Parse the harness's `TAG\ttext` convention into real child elements, so
      // the shipped bootstrap walks a tree rather than an opaque string.
      for (const line of v.split('\n')) {
        const i = line.indexOf('\t');
        if (i > 0) children.push(bodyStub(line.slice(0, i), '', line.slice(i + 1)));
      }
    },
    get textContent() { return txt; },
    set textContent(v: string) { txt = v; html = ''; children.length = 0; },
    setAttribute(k, v) { attrs[k] = v; },
    addEventListener(t, l) { (listeners[t] ??= []).push(l); },
    get firstChild() { return children[0] ?? null; },
    appendChild(c) { children.push(c); return c; },
    insertBefore(c, ref) {
      const i = ref === null ? children.length : children.indexOf(ref);
      children.splice(i < 0 ? children.length : i, 0, c);
      return c;
    },
    removeChild(c) {
      const i = children.indexOf(c);
      assert.ok(i >= 0, 'removeChild was called with a node that is not a child');
      children.splice(i, 1);
      return c;
    },
    querySelectorAll(sel) {
      const want = new Set(sel.split(',').map((t) => t.trim().toLowerCase()));
      const walk = (x: BodyStub): BodyStub[] =>
        x.children.flatMap((c) => [...(want.has(c.tagName.toLowerCase()) ? [c] : []), ...walk(c)]);
      return walk(n);
    },
    // Only `#id` is supported, which is all the mount uses. Anything else returns
    // null rather than guessing, so an unsupported selector shows up as a failing
    // anchor rather than a silently wrong match.
    //
    // AND IT THROWS WHERE A REAL BROWSER THROWS. A bare CSS identifier may not
    // begin with a digit, so `querySelector('#2-contract-details')` is a
    // SyntaxError (verified in Chrome). The permissive stub that simply matched
    // the string is precisely why a selector-based mount passed every test here
    // while being unable to anchor on ANY numbered heading — which is every real
    // insrc document.
    querySelector(sel) {
      if (!sel.startsWith('#')) return null;
      const want = sel.slice(1);
      if (/^[0-9]/.test(want)) {
        throw Object.assign(new Error(`'${sel}' is not a valid selector`), { name: 'SyntaxError' });
      }
      const walk = (x: BodyStub): BodyStub | null => {
        for (const c of x.children) {
          if (c.id === want) return c;
          const found = walk(c);
          if (found) return found;
        }
        return null;
      };
      return walk(n);
    },
    parentNode: null,
    get nextSibling() {
      const p = n.parentNode;
      if (!p) return null;
      const i = p.children.indexOf(n);
      return i >= 0 ? (p.children[i + 1] ?? null) : null;
    },
  };
  // Keep the parent link current however children arrive, since the mount reads
  // `h.parentNode` and `h.nextSibling` off a heading the body renderer created.
  const adopt = (c: BodyStub): BodyStub => { c.parentNode = n; return c; };
  const origAppend = n.appendChild.bind(n);
  const origInsert = n.insertBefore.bind(n);
  n.appendChild = (c) => origAppend(adopt(c));
  n.insertBefore = (c, ref) => origInsert(adopt(c), ref);
  const desc = Object.getOwnPropertyDescriptor(n, 'innerHTML')!;
  Object.defineProperty(n, 'innerHTML', {
    get: desc.get!,
    set(v: string) { desc.set!.call(n, v); for (const c of children) c.parentNode = n; },
  });
  return n;
}

/** Eval DOCS_FR_SOURCE and return placeFunctionalRequirements + the createElement count. */
function loadPlace(opts: { throwOnCall?: number; getElementById?: (id: string) => BodyStub | undefined } = {}) {
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
      { placed: string; degradation?: { degraded: boolean; notice: string } },
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
  actions: BodyStub;
  oq: BodyStub;
  posted: unknown[];
  diagram: BodyStub;
  experience: BodyStub;
  created: string[];
  deliver(payload: Record<string, unknown>): void;
}
/** Evaluate the REAL bootstrap from the emitted shell against DOM stubs. */
function runWebview(opts: { markedMissing?: boolean; breakPlacement?: boolean; breakDiagram?: boolean; breakExperience?: boolean; countCreates?: boolean } = {}): WebviewRun {
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

  const ids = ['insrc-docs-list', 'insrc-docs-body', 'insrc-docs-oq', 'insrc-docs-note',
    'insrc-docs-actions', 'insrc-docs-sections', 'insrc-docs-notice', 'insrc-docs-diagram',
    'insrc-docs-experience'];
  const byId: Record<string, BodyStub> = {};
  for (const id of ids) byId[id] = bodyStub('div', id);
  (byId['insrc-docs-note'] as unknown as { value: string }).value = '';

  const posted: unknown[] = [];
  const created: string[] = [];
  let onMessage: ((e: { data: unknown }) => void) | undefined;
  const doc = {
    getElementById: (id: string) => byId[id] ?? null,
    createElement: (t: string) => {
      created.push(t);
      const n = bodyStub(t) as BodyStub & { addEventListener(): void; innerHTML: string };
      n.addEventListener = () => {};
      return n;
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
  const win = { addEventListener: (_t: string, l: (e: { data: unknown }) => void) => { onMessage = l; } };
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
    doc, win, marked, () => ({ postMessage: (m: unknown) => { posted.push(m); } }),
  );

  return {
    body: byId['insrc-docs-body']!, notice: byId['insrc-docs-notice']!,
    sections: byId['insrc-docs-sections']!, actions: byId['insrc-docs-actions']!,
    oq: byId['insrc-docs-oq']!, posted,
    diagram: byId['insrc-docs-diagram']!, experience: byId['insrc-docs-experience']!, created,
    deliver: (payload) => onMessage?.({ data: { v: 1, payload: { type: 'docs-content', ...payload } } }),
  };
}

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
  assert.equal(w.actions.children.length, 2, 'approve + request-changes still render');
  assert.deepEqual(w.actions.children.map((c) => c.textContent), ['approve', 'request changes']);
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

test('t5: approve / request-changes, the COMMENTABLE_KINDS gate and the blocked banner behave identically to before this Story', async () => {
  // Host-side behaviour, through the real client doubles — unchanged by t5.
  const fc = fakeChannel();
  const { client, calls } = fakeClient();
  const host = createDocsReviewHost({ createPanel: () => fc.channel, client });
  host.open();
  await tick();
  fc.send(env('docs-decision', { artifactId: 'LLD-abc-s7', accept: true }));
  await tick();
  assert.deepEqual(calls.approve, ['LLD-abc-s7'], 'approve still reaches workflow.approve');

  fc.send(env('docs-decision', { artifactId: 'LLD-abc-s7', accept: false, note: 'please fix' }));
  await tick();
  assert.deepEqual(calls.comment, [{ id: 'LLD-abc-s7', note: 'please fix' }], 'request-changes still records a comment');

  // Webview side: the blocked banner replaces approve, request-changes survives.
  const w = runWebview();
  w.deliver({ artifactId: 'a', markdown: 'unavailable: boom', openQuestions: [], blocked: true, commentable: true });
  assert.equal(w.actions.children[0]!.textContent, 'blocked — not approvable');
  assert.equal(w.actions.children.length, 2, 'blocked banner + request-changes');
  // And a non-commentable kind still hides request-changes.
  const w2 = runWebview();
  w2.deliver({ artifactId: 'a', markdown: '# Doc', openQuestions: [], blocked: false, commentable: false });
  assert.deepEqual(w2.actions.children.map((c) => c.textContent), ['approve']);
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
  const shape = (n: FrNode): unknown => [n.tagName, n.className, n.textContent, n.children.map(shape)];
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
  const groups = frAll(el).filter((n) => n.className === 'insrc-fr-group');
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
 * file next to the module (relative import resolves) and runs tsc over it.
 */
function typecheckAgainstPanel(snippet: string): { ok: boolean; out: string } {
  const tsc = fileURLToPath(new URL('../../../../node_modules/typescript/bin/tsc', import.meta.url));
  assert.ok(existsSync(tsc), `tsc must be resolvable for this probe to mean anything (looked at ${tsc})`);
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

test("t3: the 'absent' state carries NO member other than state — enforced by the TYPE, not just at runtime", () => {
  const absent: CompanionSlotState = { state: 'absent' };
  // Runtime shape: exactly one own key.
  assert.deepEqual(Object.keys(absent), ['state']);

  // The property that actually matters is that the TYPE forbids more, so a later
  // Story cannot reserve space for a companion that does not exist even by
  // accident. Reading any other member off the narrowed absent arm must be a
  // COMPILE error against the real published union.
  for (const member of ['label', 'body', 'linkOut', 'kind', 'reason']) {
    const { ok, out } = typecheckAgainstPanel(`
      import type { CompanionSlotState } from './docs-review-panel.js';
      export function probe(s: CompanionSlotState): unknown {
        if (s.state === 'absent') return s.${member};
        return undefined;
      }
    `);
    assert.equal(ok, false, `reading '${member}' off the absent arm must NOT compile`);
    assert.match(out, /Property '.*' does not exist on type/, `and fail because '${member}' is absent from the arm`);
  }

  // The positive control: `state` itself IS readable, so the probe is capable of
  // passing and the failures above are about the members, not a broken probe.
  const control = typecheckAgainstPanel(`
    import type { CompanionSlotState } from './docs-review-panel.js';
    export function probe(s: CompanionSlotState): string { return s.state; }
  `);
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

test('t3: an unhandled companion kind is a COMPILE error, not an unlabelled slot', () => {
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
    // from — and asserted to exist first, because a missing binary ALSO exits
    // non-zero and would make the "tsc rejected it" assertion pass for entirely
    // the wrong reason. (It did, on the first run; the message assertion below is
    // what caught it.)
    const tsc = fileURLToPath(new URL('../../../../node_modules/typescript/bin/tsc', import.meta.url));
    assert.ok(existsSync(tsc), `tsc must be resolvable for this probe to mean anything (looked at ${tsc})`);

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

/** An SVG-aware recording node: captures every property write AND the namespace
 *  it was created in, so "built by createElementNS, labelled by textContent" is
 *  executed rather than grepped. */
interface DgNode {
  ns: string | null;
  tag: string;
  tagName: string;
  textContent: string;
  attrs: Record<string, string>;
  children: DgNode[];
  writes: Array<{ prop: string; value: unknown }>;
  appendChild(c: DgNode): DgNode;
  setAttribute(k: string, v: string): void;
}
function dgNode(tag: string, ns: string | null): DgNode {
  const writes: DgNode['writes'] = [];
  const children: DgNode[] = [];
  const attrs: Record<string, string> = {};
  const n = {
    ns, tag, tagName: tag, children, writes, attrs,
    _text: '',
    appendChild(c: DgNode) { children.push(c); return c; },
    setAttribute(k: string, v: string) { attrs[k] = String(v); writes.push({ prop: `attr:${k}`, value: v }); },
  } as unknown as DgNode & { _text: string };
  Object.defineProperty(n, 'textContent', {
    get() { return n._text; },
    set(v: string) { n._text = v; writes.push({ prop: 'textContent', value: v }); },
  });
  // Present ONLY to be caught: any write is recorded and asserted against.
  for (const prop of ['innerHTML', 'outerHTML']) {
    Object.defineProperty(n, prop, { set(v: unknown) { writes.push({ prop, value: v }); }, get() { return ''; } });
  }
  return n as DgNode;
}

interface DgApi {
  dgDeriveEr(rec: unknown): { nodes: { id: string; attrs: { name: string; range: string; dangling: boolean }[] }[]; edges: { id: string; from: string; to: string; label: string; token: string }[] } | null;
  dgRenderEr(rec: unknown): { el: DgNode } | null;
  dgBuildDiagramSlot(records: unknown, ref: unknown, anchorSlug: string | undefined): Record<string, unknown>;
  dgDeriveSeq(rec: unknown): { nodes: { id: string; label: string }[]; edges: { id: string; from: string; to: string; index: number; kind: string; label: string; note: string }[]; truncations: { at: string; note: string }[] } | null;
  dgRenderSeq(rec: unknown): { el: DgNode } | null;
  dgCrowsFoot(slot: unknown): string;
  created: DgNode[];
  createdHtml: string[];
}

/** Evaluate DOCS_DIAGRAM_SOURCE against a recording document stub. */
function loadDg(): DgApi {
  const created: DgNode[] = [];
  const createdHtml: string[] = [];
  const doc = {
    createElementNS: (ns: string, t: string) => { const n = dgNode(t, ns); created.push(n); return n; },
    // Present so a renderer reaching for the HTML factory is RECORDED rather than
    // crashing — an SVG renderer must never use it, and a test can prove it didn't.
    createElement: (t: string) => { createdHtml.push(t); return dgNode(t, null); },
  };
  // eslint-disable-next-line no-new-func
  const make = new Function('document', `${DOCS_DIAGRAM_SOURCE}; return {dgDeriveEr:dgDeriveEr,dgRenderEr:dgRenderEr,dgBuildDiagramSlot:dgBuildDiagramSlot,dgCrowsFoot:dgCrowsFoot,dgDeriveSeq:dgDeriveSeq,dgRenderSeq:dgRenderSeq};`);
  const api = make(doc) as Omit<DgApi, 'created' | 'createdHtml'>;
  return { ...api, created, createdHtml };
}

/** Flatten a built tree for assertions. */
function dgFlatten(n: DgNode, out: DgNode[] = []): DgNode[] {
  out.push(n);
  for (const c of n.children) dgFlatten(c, out);
  return out;
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
  const flat = dgFlatten(selfRef!.el);
  const lines = flat.filter((n) => n.tag === 'line');
  const degenerate = lines.filter((l) => l.attrs['x1'] === l.attrs['x2'] && l.attrs['y1'] === l.attrs['y2']);
  assert.equal(degenerate.length, 0, 'no zero-length line stands in for a self-reference');
  assert.ok(lines.length >= 3, 'the self-reference is drawn as a multi-segment loop');
});

test('t4: determinism — the same record renders an identical element tree every time', () => {
  const rec = { classes: { Order: { attributes: { id: { range: 'string' }, by: { range: 'Customer' } } }, Customer: { attributes: { id: { range: 'string' } } } } };
  const shape = (api: DgApi): string =>
    dgFlatten(api.dgRenderEr(rec)!.el)
      .map((n) => `${n.ns ?? '-'}|${n.tag}|${JSON.stringify(n.attrs)}|${n.textContent}`)
      .join('\n');
  // Two independent evaluations, so no cached state can make them agree.
  assert.equal(shape(loadDg()), shape(loadDg()), 'no randomness, no measurement-dependent reflow');
});

test('t4 ac4: every element is createElementNS in the SVG namespace and every label is textContent', () => {
  const dg = loadDg();
  const built = dg.dgRenderEr({
    classes: { Order: { attributes: { id: { range: 'string' }, by: { range: 'Customer' } } }, Customer: { attributes: { id: { range: 'string' } } } },
  })!;
  const flat = dgFlatten(built.el);
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
  const flat = dgFlatten(built.el);

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
    createElementNS: () => dgNode('x', 'ns'), createElement: () => dgNode('x', null),
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
  const flat = dgFlatten(built.el);
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
  const flat = dgFlatten(built.el);
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
  const shape = (api: DgApi): string =>
    dgFlatten(api.dgRenderSeq(rec)!.el).map((n) => `${n.ns}|${n.tag}|${JSON.stringify(n.attrs)}|${n.textContent}`).join('\n');
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
  const flat = dgFlatten(both['body'] as DgNode);
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

  const heads = dgFlatten(built.el).filter((n) => n.tag === 'rect');
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
  for (const t of dgFlatten(built.el).filter((n) => n.tag === 'text')) {
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

/** Every node under a stub, root first. */
function allOf(n: BodyStub): BodyStub[] { return [n, ...n.children.flatMap(allOf)]; }
const slotsIn = (r: WebviewRun): BodyStub[] =>
  [...allOf(r.diagram), ...allOf(r.experience), ...allOf(r.body)]
    .filter((n) => n.className === 'insrc-dg-slot');
/** The EXPERIENCE slot, found by its kind modifier wherever it ended up — the host
 *  when unanchored, the BODY when it anchored beside a heading. Looking only in the
 *  host would miss exactly the anchored case these tests exist to cover. */
const uxSlotsIn = (r: WebviewRun): BodyStub[] =>
  [...allOf(r.experience), ...allOf(r.body)]
    .filter((n) => n.className === 'insrc-dg-slot insrc-dg-slot--experience');
/** The DIAGRAM slot keeps the bare class it has always had. */
const dgSlotsIn = (r: WebviewRun): BodyStub[] =>
  [...allOf(r.diagram), ...allOf(r.body)].filter((n) => n.className === 'insrc-dg-slot');

test('t6 gate: the four-combination table, driven through the SHIPPED bootstrap', () => {
  // ref absent + record absent -> nothing anywhere
  let r = runWebview();
  r.deliver({ artifactId: 'a', markdown: DG_MD, openQuestions: [], blocked: false, sections: DG_SECTIONS });
  assert.equal(slotsIn(r).length, 0, 'no ref + no record -> no slot');

  // ref present + record present -> rendered
  r = runWebview();
  r.deliver({ artifactId: 'a', markdown: DG_MD, openQuestions: [], blocked: false, sections: DG_SECTIONS, erDefinition: DG_ER, companions: [DG_REF] });
  let slot = slotsIn(r)[0];
  assert.ok(slot, 'ref + record -> a slot');
  assert.ok(allOf(slot!).some((n) => n.tagName === 'svg'), 'and it carries a drawn diagram');

  // ref present + record absent -> unshowable, NAMED
  r = runWebview();
  r.deliver({ artifactId: 'a', markdown: DG_MD, openQuestions: [], blocked: false, sections: DG_SECTIONS, companions: [DG_REF] });
  slot = slotsIn(r)[0];
  assert.ok(slot, 'ref alone -> a slot');
  const why = allOf(slot!).find((n) => n.className === 'insrc-dg-slot-why')!;
  assert.match(why.textContent, /could not be shown here/);
  assert.match(why.textContent, /source record is not available/);
  assert.equal(allOf(slot!).some((n) => n.tagName === 'svg'), false, 'and nothing is drawn');

  // ref ABSENT + record present -> RENDERED (the contested row, q7f574776)
  r = runWebview();
  r.deliver({ artifactId: 'a', markdown: DG_MD, openQuestions: [], blocked: false, sections: DG_SECTIONS, erDefinition: DG_ER });
  slot = slotsIn(r)[0];
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
  assert.equal(slotsIn(bare).length, 0);
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
    assert.equal(slotsIn(r).length, 0, `${JSON.stringify(records)} must reserve no space`);
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
  const slot = slotsIn(r)[0];
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
  const slot = slotsIn(r)[0]!;
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
  assert.equal(slotsIn(stale).length, 1, 'the visual is NOT dropped');
  assert.equal(stale.diagram.children.length, 1, 'it falls back to the default position');
});

test('t6 IDEMPOTENCE: two identical messages leave exactly ONE slot; a third carrying neither leaves none', () => {
  const r = runWebview();
  const msg = { artifactId: 'a', markdown: DG_MD, openQuestions: [], blocked: false, sections: DG_SECTIONS, erDefinition: DG_ER, companions: [DG_REF] };
  r.deliver(msg);
  const first = slotsIn(r).length;
  r.deliver(msg);
  assert.equal(first, 1, 'one slot after the first message');
  assert.equal(slotsIn(r).length, 1, 'still exactly one after the second — the host is cleared, not appended to');
  r.deliver({ artifactId: 'a', markdown: DG_MD, openQuestions: [], blocked: false, sections: DG_SECTIONS });
  assert.equal(slotsIn(r).length, 0, 'and a message carrying neither clears it');

  // The same, ANCHORED into the body, where the body rebuild is what clears it.
  const probe = runWebview();
  probe.deliver({ artifactId: 'a', markdown: DG_MD, openQuestions: [], blocked: false, sections: DG_SECTIONS });
  const slug = probe.body.children.filter((c) => c.tagName.startsWith('h')).map((c) => c.id)[1]!;
  const a = runWebview();
  const anchoredMsg = { ...msg, diagramAnchorSlug: slug };
  a.deliver(anchoredMsg); a.deliver(anchoredMsg);
  assert.equal(slotsIn(a).length, 1, 'one slot in the body after two identical renders');
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
  const labels = r.actions.children.map((c) => c.textContent);
  assert.deepEqual(labels, ['approve', 'request changes'], 'both controls still rendered');
  assert.equal(slotsIn(r).length, 0, 'and no half-built slot was left behind');
});

test('t6 regression: approve / request-changes, the COMMENTABLE_KINDS gate and the blocked banner are unchanged', () => {
  // With a diagram present, so the regression is checked on the NEW path.
  const r = runWebview();
  const base = { markdown: DG_MD, openQuestions: [], sections: DG_SECTIONS, erDefinition: DG_ER, companions: [DG_REF] };

  r.deliver({ ...base, artifactId: 'LLD-x', blocked: false, commentable: true });
  assert.deepEqual(r.actions.children.map((c) => c.textContent), ['approve', 'request changes']);

  r.deliver({ ...base, artifactId: 'LLD-x', blocked: false, commentable: false });
  assert.deepEqual(r.actions.children.map((c) => c.textContent), ['approve'], 'the COMMENTABLE_KINDS gate still hides request-changes');

  r.deliver({ ...base, artifactId: 'LLD-x', blocked: true, commentable: true });
  assert.equal(r.actions.children[0]!.textContent, 'blocked — not approvable');
  assert.equal(r.actions.children.map((c) => c.textContent).includes('approve'), false, 'approve stays suppressed');
});

test('t6 regression: the HOST decision path still reaches the daemon unchanged', async () => {
  // The webview harness makes addEventListener a no-op on created elements, so a
  // click cannot be driven through a button there. The host end is where the
  // behaviour actually lives, and it is exercised through the real client doubles.
  const fc = fakeChannel();
  const { client, calls } = fakeClient();
  createDocsReviewHost({ createPanel: () => fc.channel, client }).open();
  await tick();
  fc.send(env('docs-decision', { artifactId: 'LLD-abc-s7', accept: true }));
  await tick();
  assert.deepEqual(calls.approve, ['LLD-abc-s7'], 'approve still reaches workflow.approve');
  fc.send(env('docs-decision', { artifactId: 'LLD-abc-s7', accept: false, note: 'please fix' }));
  await tick();
  assert.deepEqual(calls.comment, [{ id: 'LLD-abc-s7', note: 'please fix' }], 'request-changes still records a comment');
});

test('t6: the fail-closed arm shows the blocked banner and NO slot', () => {
  // openDoc already withholds the records on that arm; this proves the webview end
  // too — a reviewer who never saw the body is never shown a diagram drawn from it.
  const r = runWebview();
  r.deliver({ artifactId: 'LLD-x', markdown: 'unavailable: daemon unreachable', openQuestions: [], blocked: true, commentable: true });
  assert.equal(slotsIn(r).length, 0);
  assert.equal(r.actions.children[0]!.textContent, 'blocked — not approvable');
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

test('t6: docs-sections.ts is BYTE-IDENTICAL — this Story mints no section identity', async () => {
  const { execFileSync } = await import('node:child_process');
  const repo = fileURLToPath(new URL('../../../../', import.meta.url));
  // Compared against the commit BEFORE this Epic's S003 work began, so the claim is
  // about the whole Story and not just this task.
  const shipped = execFileSync('git', ['show', '8908338:vscode-plugin/src/chat/docs-sections.ts'], { cwd: repo, encoding: 'utf8' });
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

test('t2: the pin moved by EXACTLY the declared source string and CSS fragment — nothing else slipped in', () => {
  const html = renderShellFor(SHELL_BASELINE.nonce);

  // The two additions, measured from the artefacts themselves rather than from
  // numbers typed here: the source string's own length, and the CSS fragment
  // located in the emitted shell between its first and last rule.
  const cssStart = html.indexOf('.ux-card{');
  const cssEnd = html.indexOf('}', html.indexOf('.ux-unknown{')) + 1;
  assert.ok(cssStart > 0 && cssEnd > cssStart, 'the ux CSS fragment is in the shell');
  const cssChars = cssEnd - cssStart;

  // ARITHMETIC, not assertion: if anything OTHER than these two had joined the
  // shell, this sum would not close. That is what turns a moved pin from "I changed
  // it" into "here is what changed and why it is all of it".
  assert.equal(
    SHELL_BASELINE_BEFORE_S004_T2.chars + DOCS_UX_SOURCE.length + cssChars + BOOTSTRAP_DELTA_S004_T6,
    SHELL_BASELINE.chars,
    'the delta is exactly the source string, its CSS fragment and the declared t6 bootstrap change',
  );
  // The bootstrap delta is SMALL on purpose — t6 is one call and one host. If this
  // ever needed to grow materially, the Story would be doing something other than
  // mounting a slot.
  assert.ok(BOOTSTRAP_DELTA_S004_T6 < 1000,
    'the surface change stays a mount, not a rewrite');
  // The source string really is inlined verbatim, which is what licenses using its
  // length as the script half of the delta.
  assert.ok(html.includes(DOCS_UX_SOURCE), 'DOCS_UX_SOURCE is inlined verbatim');
  // And the shell still has the four earlier strings, so the delta is an ADDITION
  // rather than a swap that happens to balance.
  for (const earlier of [DOCS_BODY_RENDERER_SOURCE, DOCS_SECTIONS_SOURCE, DOCS_FR_SOURCE, DOCS_DIAGRAM_SOURCE]) {
    assert.ok(html.includes(earlier), 'each earlier source string is still inlined');
  }
});

test('t1: NO file under src/ is modified — the fact that makes S004 need no daemon rebuild', async () => {
  const { execFileSync } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  const { dirname, join } = await import('node:path');
  const here = dirname(fileURLToPath(import.meta.url));
  const repoRoot = join(here, '..', '..', '..', '..');
  const git = (...args: string[]): string =>
    execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' });

  // Read the Story's COMMITTED change set, not the working tree. An earlier
  // version of this test read `git status --porcelain`, which passed only while
  // the change was uncommitted and went red the moment it was committed — caught
  // by the build validation gate, which is the whole reason that gate exists.
  //
  // The build window is "every commit since this Story's PLAN was approved",
  // which is a boundary the repo itself records rather than a hash pasted here.
  const planCommit = git('log', '--format=%H', '-1', '--',
    'docs/epics/build-vs-code-plugin-ui-integration-E20260929bfe98ff7/S004/PLAN.md').trim();
  assert.match(planCommit, /^[0-9a-f]{40}$/, 'the PLAN commit is the build-window boundary');

  const committed = git('diff', '--name-only', `${planCommit}..HEAD`)
    .split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  // Union with the working tree so the check also holds mid-task, before a commit.
  const working = git('status', '--porcelain')
    .split('\n').map((l) => l.slice(3).trim()).filter((l) => l.length > 0);
  const paths = [...new Set([...committed, ...working])];

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

/** A recording node: captures every property write, every attribute and every
 *  child, so the renderer's MECHANISM is observable. Mirrors S003's dgNode, with
 *  className and style added because this renderer is an HTML one. */
interface UxNode {
  tag: string;
  className: string;
  textContent: string;
  style: Record<string, string>;
  attrs: Record<string, string>;
  children: Array<UxNode | UxTextNode>;
  writes: Array<{ prop: string; value: unknown }>;
  appendChild(c: UxNode | UxTextNode): UxNode | UxTextNode;
  setAttribute(k: string, v: string): void;
}
interface UxTextNode { nodeType: 3; data: string }

function isText(n: UxNode | UxTextNode): n is UxTextNode {
  return (n as UxTextNode).nodeType === 3;
}

function uxNodeStub(tag: string): UxNode {
  const writes: UxNode['writes'] = [];
  const children: UxNode['children'] = [];
  const attrs: Record<string, string> = {};
  const style: Record<string, string> = {};
  const n = {
    tag, children, writes, attrs, style,
    _text: '', _cls: '',
    appendChild(c: UxNode | UxTextNode) { children.push(c); return c; },
    setAttribute(k: string, v: string) { attrs[k] = String(v); writes.push({ prop: `attr:${k}`, value: v }); },
  } as unknown as UxNode & { _text: string; _cls: string };
  Object.defineProperty(n, 'textContent', {
    get() { return n._text; },
    set(v: string) { n._text = v; writes.push({ prop: 'textContent', value: v }); },
  });
  Object.defineProperty(n, 'className', {
    get() { return n._cls; },
    set(v: string) { n._cls = v; writes.push({ prop: 'className', value: v }); },
  });
  // Present ONLY to be caught: any write is recorded and asserted against.
  for (const prop of ['innerHTML', 'outerHTML']) {
    Object.defineProperty(n, prop, { set(v: unknown) { writes.push({ prop, value: v }); }, get() { return ''; } });
  }
  return n as UxNode;
}

interface UxSlot {
  state: 'absent' | 'rendered' | 'unshowable';
  kind?: string;
  label?: string;
  reason?: string;
  body?: UxNode;
  linkOut?: { relPath: string; title: string };
  anchorSlug?: string;
}

interface UxApi {
  uxRenderCard(record: unknown): { el: UxNode };
  uxElement(el: unknown, depth: number): UxNode;
  uxPickRef(companions: unknown): { kind: string; title?: string; relPath?: string } | undefined;
  uxBuildMockSlot(record: unknown, ref: unknown, anchorSlug: string | undefined): UxSlot;
  setDepthMax(n: number | null): void;
  created: string[];
  texts: string[];
  nodes: UxNode[];
}

/** Evaluate DOCS_UX_SOURCE against a recording document stub. */
function loadUx(): UxApi {
  const created: string[] = [];
  const texts: string[] = [];
  const nodes: UxNode[] = [];
  const doc = {
    createElement: (t: string) => { created.push(t); const n = uxNodeStub(t); nodes.push(n); return n; },
    createTextNode: (d: string) => { texts.push(d); return { nodeType: 3, data: d } as UxTextNode; },
    // Present so a renderer reaching for the SVG factory is RECORDED rather than
    // crashing — this renderer must never use it.
    createElementNS: (_ns: string, t: string) => { created.push(`NS:${t}`); return uxNodeStub(t); },
  };
  // eslint-disable-next-line no-new-func
  const make = new Function('document', `${DOCS_UX_SOURCE}; return {uxRenderCard:uxRenderCard,uxElement:uxElement,uxPickRef:uxPickRef,uxBuildMockSlot:uxBuildMockSlot,setDepthMax:function(n){UX_DEPTH_MAX=n;}};`);
  const api = make(doc) as Omit<UxApi, 'created' | 'texts' | 'nodes'>;
  return { ...api, created, texts, nodes };
}

/** Every element in a rendered subtree, flattened — for "does each class appear". */
function uxFlatten(n: UxNode): UxNode[] {
  const out: UxNode[] = [n];
  for (const c of n.children) if (!isText(c)) out.push(...uxFlatten(c));
  return out;
}

/** All text a subtree puts in the DOM, in order, from BOTH non-parsing channels. */
function uxAllText(n: UxNode): string[] {
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

function shapeOfClient(n: UxNode): Shape {
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
  const col = (width?: unknown): UxNode =>
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
  for (const n of uxFlatten(el)) {
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
  assert.equal((multi.children[1] as UxNode).className, 'ux-input ux-input--multi');

  const noLabel = ux.uxElement({ type: 'Input.Text', id: 'fallback-id', placeholder: '' }, 1);
  assert.deepEqual(uxAllText(noLabel), ['fallback-id', ''].filter((t) => t.length > 0));
  assert.equal((noLabel.children[0] as UxNode).textContent, 'fallback-id');
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
  const choices = (el.children[1] as UxNode);
  assert.equal(choices.className, 'ux-choices');
  assert.deepEqual(choices.children.map((c) => (isText(c) ? '#text' : c.className)), ['ux-choice', 'ux-choice']);
  // The title is a BARE text node beside the mark, exactly as the daemon emits it.
  const first = choices.children[0] as UxNode;
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
  const submit = el.children[0] as UxNode;
  const link = el.children[1] as UxNode;
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
  assert.equal((link.children[1] as UxNode).tag, 'span', 'the url is its own flex item');
  assert.deepEqual(uxAllText(link), ['Open companion', 'https://example.invalid/c.html', '\u2197']);
  // And the url reaches NO attribute anywhere — ac5 kept absolute, which is the
  // reason it is shown as text rather than mirrored into `title=`.
  for (const n of uxFlatten(el)) {
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
      const o = e as { type?: string; items?: unknown; columns?: unknown };
      const kids = o.type === 'ColumnSet' ? o.columns : o.items;
      return n + 1 + (Array.isArray(kids) ? countRecord(kids) : 0);
    }, 0);
    const expected = countRecord(record.body);
    // One DOM element per record element at minimum (several members render a
    // small subtree), and crucially NOT FEWER.
    const rendered = uxFlatten(el).length - 1; // minus the ux-card wrapper
    assert.ok(rendered >= expected,
      `${f}: ${expected} record elements must all appear; the tree has ${rendered} elements`);
    // And nothing degraded: a real, valid record must produce no ux-unknown.
    assert.equal(
      uxFlatten(el).filter((n) => n.className === 'ux-unknown').length, 0,
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
  assert.equal((card.children[0] as UxNode).textContent, 'before');
  assert.equal((card.children[6] as UxNode).textContent, 'after');
  // A missing text is an EMPTY paragraph, not a crash and not a hole.
  assert.equal((card.children[2] as UxNode).textContent, '');
  // A non-array child list degrades to an EMPTY region, as childrenOf does.
  assert.equal((card.children[4] as UxNode).children.length, 0);
  assert.equal((card.children[5] as UxNode).children.length, 0);
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
  const all = uxFlatten(el);
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
  for (const n of uxFlatten(el)) {
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

  for (const n of uxFlatten(el)) {
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
  assert.ok(uxFlatten(el).some((n) => n.className.includes(`ux-size-${marker}`)),
    'the size modifier reaches the class, as the daemon does');
});

test('t2: the renderer emits NO node/edge construct — the uxDefinitionToIr regression guard', () => {
  const ux = loadUx();
  const { el } = ux.uxRenderCard(UX_PARITY_FIXTURES_FOR_TEST.card);

  // ISSUE-85e6a58693579b6d: uxDefinitionToIr (ux.ts:282) lowers a card into a
  // node-and-edge DocumentIR, and publishing that as an "experience mock" produced
  // ~3.37 MB of graph picture where a 7 KB interface belonged. The nearest existing
  // function is the wrong one, and this guard is what stops someone reaching for it.
  const classes = uxFlatten(el).map((n) => n.className).join(' ');
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
    for (const n of uxFlatten(loadUx().uxRenderCard(fx.card).el)) {
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
    const truncated = uxFlatten(el).filter((n) => n.className === 'ux-unknown' && /nesting deeper/.test(n.textContent));
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
  const cut = uxFlatten(el).filter((n) => n.className === 'ux-unknown');
  assert.equal(cut.length, 1, 'exactly one cut point, at the bound');
  assert.match(cut[0]!.textContent, /nesting deeper than 24 levels/,
    'and it NAMES depth as the reason, so a reviewer can tell a guard from a truncation');
  // TERMINATES: the tree is bounded, not 40 deep.
  const depthOf = (n: UxNode): number =>
    1 + Math.max(0, ...n.children.filter((c): c is UxNode => !isText(c)).map(depthOf));
  assert.ok(depthOf(el) <= 26, `the walk stopped (tree depth ${depthOf(el)})`);
});

test('t4: a CYCLIC structure terminates — the case that would hang without a bound', () => {
  // A self-referential body is reachable: a card is read from a STORED artifact and
  // can be hand-edited past its type. Without the bound this recurses forever, which
  // is the difference between a guard and a nicety.
  const cyclic: Record<string, unknown> = { type: 'Container' };
  cyclic['items'] = [cyclic];

  const { el } = loadUx().uxRenderCard({ type: 'AdaptiveCard', body: [cyclic] });
  const cut = uxFlatten(el).filter((n) => n.className === 'ux-unknown');
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
  assert.equal((rendered.body as UxNode).className, 'ux-card');
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
  const shapeOf = (n: BodyStub): string =>
    JSON.stringify(allOf(n).map((x) => [x.tagName, x.className, x.textContent]));

  const diagramOnly = runWebview();
  diagramOnly.deliver(base);

  const withExperience = runWebview();
  withExperience.deliver({ ...base, uxDefinition: UX_CARD_T6, companions: [DG_REF, UX_REF_T6] });

  assert.equal(shapeOf(withExperience.diagram), shapeOf(diagramOnly.diagram),
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
  assert.ok(allOf(r.actions).length > 0, '4. the approval controls');
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

test('t6: docs-sections.ts is BYTE-IDENTICAL — this Story mints no section identity', async () => {
  const { execFileSync } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  const { dirname, join } = await import('node:path');
  const here = dirname(fileURLToPath(import.meta.url));
  const repoRoot = join(here, '..', '..', '..', '..');
  const planCommit = execFileSync('git', ['log', '--format=%H', '-1', '--',
    'docs/epics/build-vs-code-plugin-ui-integration-E20260929bfe98ff7/S004/PLAN.md'],
    { cwd: repoRoot, encoding: 'utf8' }).trim();
  const changed = execFileSync('git', ['diff', '--name-only', `${planCommit}..HEAD`], { cwd: repoRoot, encoding: 'utf8' });
  assert.ok(!changed.includes('docs-sections.ts'),
    'S004 consumes sc3 and mints none of its own section identity');
});
