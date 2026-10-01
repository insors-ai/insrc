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
import { createDocsReviewHost, DOCS_BODY_RENDERER_SOURCE, DOCS_SECTIONS_SOURCE, DEGRADE_NOTICE } from '../docs-review-panel.js';
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
