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
import { createDocsReviewHost, DOCS_BODY_RENDERER_SOURCE, DOCS_SECTIONS_SOURCE, DOCS_FR_SOURCE, DEGRADE_NOTICE, SECTION_INDEX_NOTICE } from '../docs-review-panel.js';
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

test('t4: StructuredRenderer is published and nothing in s1 implements it', async () => {
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const { dirname, join } = await import('node:path');
  const here = dirname(fileURLToPath(import.meta.url));

  const panel = readFileSync(join(here, '..', 'docs-review-panel.ts'), 'utf8');
  assert.match(panel, /export type StructuredRenderer</, 'the sc2 type s2/s3/s4 build against is exported');

  // s1 declares it and implements none: no value is annotated as one anywhere.
  for (const f of ['docs-review-panel.ts', 'docs-review-client.ts', 'docs-sections.ts', 'markdown-style.ts']) {
    const src = readFileSync(join(here, '..', f), 'utf8');
    assert.doesNotMatch(src, /:\s*StructuredRenderer</, `${f} declares no StructuredRenderer implementation`);
  }
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
 *   t5 (this value) 64385 chars / 64431 bytes  2501089e…ac1d0
 *       +208 chars: the ONE call that changes what a reviewer sees, plus the
 *       third level of notice precedence. No longer inert.
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
  chars:  64385,
  bytes:  64431,
  sha256: '2501089ea924a32d1f15dd938b242e864b3afa9a900a259e73eef0e0300ac1d0',
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
    tag, children, writes,
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
    set innerHTML(v: string) { html = v; children.length = 0; },
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
  };
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
    assert.equal(body.children[0]!.tagName, 'div', 'the block is the FIRST child, above the text');
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
  assert.equal(body.children[idx + 1]!.tagName, 'div', 'the container follows the heading');
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

  assert.deepEqual(body.children.map((c) => c.tagName), ['h1', 'h2', 'div'],
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
  assert.equal(body.children[0]!.tagName, 'div', 'and the block went to the top of the body');

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
  deliver(payload: Record<string, unknown>): void;
}
/** Evaluate the REAL bootstrap from the emitted shell against DOM stubs. */
function runWebview(opts: { markedMissing?: boolean; breakPlacement?: boolean } = {}): WebviewRun {
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

  const ids = ['insrc-docs-list', 'insrc-docs-body', 'insrc-docs-oq', 'insrc-docs-note',
    'insrc-docs-actions', 'insrc-docs-sections', 'insrc-docs-notice'];
  const byId: Record<string, BodyStub> = {};
  for (const id of ids) byId[id] = bodyStub('div', id);
  (byId['insrc-docs-note'] as unknown as { value: string }).value = '';

  const posted: unknown[] = [];
  let onMessage: ((e: { data: unknown }) => void) | undefined;
  const doc = {
    getElementById: (id: string) => byId[id] ?? null,
    createElement: (t: string) => {
      const n = bodyStub(t) as BodyStub & { addEventListener(): void; innerHTML: string };
      n.addEventListener = () => {};
      return n;
    },
  };
  const win = { addEventListener: (_t: string, l: (e: { data: unknown }) => void) => { onMessage = l; } };
  // `undefined` here is the POINT of the degraded case, so it is selected by an
  // explicit flag rather than by passing undefined — which would fall through to
  // the default and silently test the happy path instead.
  const marked = opts.markedMissing ? undefined : { parse: (src: string) => src };
  // eslint-disable-next-line no-new-func
  new Function('document', 'window', 'marked', 'acquireVsCodeApi', script)(
    doc, win, marked, () => ({ postMessage: (m: unknown) => { posted.push(m); } }),
  );

  return {
    body: byId['insrc-docs-body']!, notice: byId['insrc-docs-notice']!,
    sections: byId['insrc-docs-sections']!, actions: byId['insrc-docs-actions']!,
    oq: byId['insrc-docs-oq']!, posted,
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

  // The reviewer keeps the whole surface. The backstop never costs them the rest.
  assert.equal(w.oq.children.length, 1, 'open questions still render');
  assert.equal(w.actions.children.length, 2, 'approve + request-changes still render');
  assert.deepEqual(w.actions.children.map((c) => c.textContent), ['approve', 'request changes']);
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
  const containers = (w: WebviewRun) => w.body.children.filter((c) => c.tagName === 'div');
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
