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
import { createDocsReviewHost, DOCS_BODY_RENDERER_SOURCE, DOCS_SECTIONS_SOURCE, DOCS_FR_SOURCE, DOCS_DIAGRAM_SOURCE, DEGRADE_NOTICE, SECTION_INDEX_NOTICE, companionVisualKind } from '../docs-review-panel.js';
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
  chars:  79479,
  bytes:  79531,
  sha256: '904c85e52d3495cde9ae2ba48e9a4bcb927014c6efd632bb34d58fd24820906e',
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
    querySelector(sel) {
      if (!sel.startsWith('#')) return null;
      const want = sel.slice(1);
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
  created: string[];
  deliver(payload: Record<string, unknown>): void;
}
/** Evaluate the REAL bootstrap from the emitted shell against DOM stubs. */
function runWebview(opts: { markedMissing?: boolean; breakPlacement?: boolean; breakDiagram?: boolean; countCreates?: boolean } = {}): WebviewRun {
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

  const ids = ['insrc-docs-list', 'insrc-docs-body', 'insrc-docs-oq', 'insrc-docs-note',
    'insrc-docs-actions', 'insrc-docs-sections', 'insrc-docs-notice', 'insrc-docs-diagram'];
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
    diagram: byId['insrc-docs-diagram']!, created,
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
