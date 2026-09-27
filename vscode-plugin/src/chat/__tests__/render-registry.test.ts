/**
 * Story E20260926f9563bf5:S001 / t1 — the sc1 render registry + collapse primitive.
 *
 * The webview factory (renderRegistryWebviewSource) is CSP-safe pure JS, so the tests
 * eval it and drive it against a minimal fake `document` + fake `line` — verifying the
 * render logic without a real DOM (the same eval'd-source pattern as markers.test.ts).
 *
 * Run: npx tsx --test vscode-plugin/src/chat/__tests__/render-registry.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { marked } from 'marked';
import { renderRegistryWebviewSource, RENDER_REGISTRY_STYLE, toViewModel } from '../render-registry.js';
import type { RowViewModel } from '../render-registry.js';
import type { TranscriptEntry } from '../session-store.js';
import type { TurnEvent } from '../stream-events.js';

// S001 (bugfix): the webview render now delegates assistant markdown to the bundled `marked`
// (global in the real webview). Provide it to the eval'd source so renderAssistantMd runs the
// real library; the fake node stores the resulting HTML as its `innerHTML` string property, which
// the tests assert on (guardMd's querySelectorAll no-ops on the fake node, wrapped in try/catch).
(globalThis as unknown as { marked: unknown }).marked = marked;

/** A tiny DOM stand-in: records className/textContent/children + click listeners. */
interface FakeNode {
  tag: string;
  className: string;
  textContent: string;
  innerHTML?: string; // S001: renderAssistantMd assigns marked's HTML here (asserted by the md tests)
  attrs: Record<string, string>;
  children: FakeNode[];
  listeners: Record<string, Array<() => void>>;
  appendChild(c: FakeNode): void;
  setAttribute(k: string, v: string): void;
  addEventListener(ev: string, fn: () => void): void;
  click(): void;
}
function makeNode(tag: string): FakeNode {
  const n: FakeNode = {
    tag,
    className: '',
    textContent: '',
    attrs: {},
    children: [],
    listeners: {},
    appendChild(c) { this.children.push(c); },
    setAttribute(k, v) { this.attrs[k] = v; },
    addEventListener(ev, fn) { (this.listeners[ev] ??= []).push(fn); },
    click() { (this.listeners['click'] ?? []).forEach((f) => f()); },
  };
  return n;
}
function fakeDocument(): { document: { createElement(tag: string): FakeNode } } {
  return { document: { createElement: (tag: string) => makeNode(tag) } };
}

interface Registry {
  register(kind: string, fn: (vm: unknown, host: unknown) => unknown): void;
  renderRow(vm: unknown): FakeNode | null;
  collapsible(el: FakeNode, opts: { defaultCollapsed: boolean }): FakeNode;
  toViewModel(entry: unknown): RowViewModel;
  appendKeyed(vm: unknown, key: string | null): FakeNode | null;
  resetKeys(): void;
  onApprovalDecision(cb: (requestId: string, decision: 'approve' | 'deny') => void): void;
}
function makeRegistry(): { reg: Registry; appended: FakeNode[] } {
  const { document } = fakeDocument();
  const appended: FakeNode[] = [];
  // The real bootstrap's line(s,cls): create a div, set class/text, append, RETURN it.
  const line = (s: string, cls?: string): FakeNode => {
    const d = document.createElement('div');
    if (cls) d.className = cls;
    d.textContent = s;
    appended.push(d);
    return d;
  };
  // eslint-disable-next-line no-eval
  const factory = eval(`(${renderRegistryWebviewSource()})`) as (doc: unknown, line: unknown) => Registry;
  return { reg: factory(document, line), appended };
}

// Recursive helpers over the fake node tree (the fake DOM's textContent does NOT aggregate children).
function findByClass(node: FakeNode, cls: string): FakeNode | undefined {
  if (node.className && node.className.split(/\s+/).includes(cls)) return node;
  for (const c of node.children) { const hit = findByClass(c, cls); if (hit) return hit; }
  return undefined;
}
function findByTag(node: FakeNode, tag: string): FakeNode | undefined {
  if (node.tag === tag) return node;
  for (const c of node.children) { const hit = findByTag(c, tag); if (hit) return hit; }
  return undefined;
}
function allText(node: FakeNode): string {
  return (node.textContent || '') + node.children.map(allText).join('');
}
// S001 (bugfix): a message row now nests its text in a bordered .insrc-bubble under a .insrc-who
// role label; the plain text lives on the bubble (or a widget/collapse under it), not the row.
function msgText(row: FakeNode): string {
  const b = findByClass(row, 'insrc-bubble');
  return b ? (b.textContent || '') : (row.textContent || '');
}
// S001 (bugfix): assistant messages render via marked -> the .insrc-md div's innerHTML (HTML string).
function mdHtml(row: FakeNode): string {
  return findByClass(row, 'insrc-md')?.innerHTML ?? '';
}
function mdText(row: FakeNode): string {
  return mdHtml(row).replace(/<[^>]+>/g, '').trim();
}

test('renderRow dispatches to a registered renderer for its kind', () => {
  const { reg } = makeRegistry();
  let seen: unknown;
  const sentinel = { sentinel: true };
  reg.register('user', (vm) => { seen = vm; return sentinel as unknown as FakeNode; });
  const vm = { kind: 'user', text: 'hello', collapsible: false };
  const out = reg.renderRow(vm);
  assert.equal(out, sentinel, 'renderRow returned the registered renderer output');
  assert.deepEqual(seen, vm, 'the registered renderer received the view-model');
});

test("renderRow falls back to line() for an unmapped kind (incl. the reserved 'approval-request')", () => {
  const { reg, appended } = makeRegistry();
  const out = reg.renderRow({ kind: 'approval-request', text: 'pending approval', collapsible: false });
  assert.equal(appended.length, 1, 'fallback wrote exactly one row via line()');
  assert.equal(appended[0]!.textContent, 'pending approval', 'fallback used the vm text');
  assert.equal(out, appended[0], "renderRow returned line()'s node");
});

test('the fallback renderer applies the vm cssClass (byte-identical to line(s,cls))', () => {
  const { reg, appended } = makeRegistry();
  reg.renderRow({ kind: 'fallback', text: 'done', cssClass: 'insrc-term__marker--done', collapsible: false });
  assert.equal(appended[0]!.className, 'insrc-term__marker--done');
  assert.equal(appended[0]!.textContent, 'done');
});

test('a renderer that throws is caught and the row falls back to line() (per-row isolation)', () => {
  const { reg, appended } = makeRegistry();
  reg.register('assistant-text', () => { throw new Error('boom'); });
  assert.doesNotThrow(() => reg.renderRow({ kind: 'assistant-text', text: 'oops', collapsible: false }));
  assert.equal(appended.length, 1, 'the throwing renderer fell back to line()');
  assert.equal(appended[0]!.textContent, 'oops');
});

test('collapsible: default-collapsed wraps with the collapsed class + a ▸ icon-only chevron', () => {
  const { reg } = makeRegistry();
  const inner = makeNode('div');
  inner.textContent = 'a very long tool result';
  const wrap = reg.collapsible(inner, { defaultCollapsed: true });
  assert.match(wrap.className, /insrc-collapse--collapsed/, 'starts collapsed (3-line clamp via CSS)');
  const chevron = wrap.children.find((c) => c.className === 'insrc-collapse__chevron')!;
  assert.ok(chevron, 'has a chevron toggle');
  assert.equal(chevron.textContent, '▸', 'collapsed chevron is the ▸ glyph, icon only (no label text)');
  assert.equal(chevron.attrs['role'], 'button', 'the chevron is an accessible toggle');
  const body = wrap.children.find((c) => c.className === 'insrc-collapse__body')!;
  assert.ok(body.children.includes(inner), 'the content is wrapped in the collapse body');
});

test('collapsible: clicking the chevron toggles collapsed<->expanded and swaps ▸/▾', () => {
  const { reg } = makeRegistry();
  const wrap = reg.collapsible(makeNode('div'), { defaultCollapsed: true });
  const chevron = wrap.children.find((c) => c.className === 'insrc-collapse__chevron')!;
  chevron.click();
  assert.doesNotMatch(wrap.className, /insrc-collapse--collapsed/, 'expanded after first click');
  assert.equal(chevron.textContent, '▾', 'expanded chevron is ▾');
  chevron.click();
  assert.match(wrap.className, /insrc-collapse--collapsed/, 'collapsed again after second click');
  assert.equal(chevron.textContent, '▸', 'collapsed chevron is ▸');
});

test('collapsible: defaultCollapsed=false starts expanded with a ▾ chevron', () => {
  const { reg } = makeRegistry();
  const wrap = reg.collapsible(makeNode('div'), { defaultCollapsed: false });
  assert.doesNotMatch(wrap.className, /insrc-collapse--collapsed/);
  const chevron = wrap.children.find((c) => c.className === 'insrc-collapse__chevron')!;
  assert.equal(chevron.textContent, '▾');
});

test('renderRegistryWebviewSource() is CSP-safe: no import/remote/vscode; innerHTML only via guarded marked', () => {
  const src = renderRegistryWebviewSource();
  assert.doesNotMatch(src, /\bimport\b/, 'no import');
  assert.doesNotMatch(src, /https?:\/\//, 'no remote origin');
  assert.doesNotMatch(src, /asWebviewUri/, 'no asWebviewUri');
  assert.doesNotMatch(src, /\bvscode\b/, 'no vscode reference');
  // S001 (bugfix): innerHTML is used ONLY for the marked render, and every assignment is paired
  // with guardMd sanitization in the same statement (marked escapes text; the CSP blocks scripts).
  assert.equal((src.match(/\.innerHTML=/g) ?? []).length, 1, 'exactly one innerHTML assignment (the marked render)');
  assert.match(src, /\.innerHTML=[^;]*marked\.parse[^;]*;guardMd\(/, 'the innerHTML render is marked + guardMd');
});

test('RENDER_REGISTRY_STYLE clamps the collapsed body to a 3-line preview', () => {
  assert.match(RENDER_REGISTRY_STYLE, /-webkit-line-clamp:3/, '3-line clamp (k6 b)');
  assert.match(RENDER_REGISTRY_STYLE, /\.insrc-collapse__chevron\{[^}]*cursor:pointer/, 'the chevron is a clickable icon');
});

// ---- t4: toViewModel mapping + the registered renderers -------------------------

test('toViewModel maps transcript rows: user/assistant/marker to the right kind + role', () => {
  const user: TranscriptEntry = { role: 'user', text: 'hi there', at: 't' };
  assert.deepEqual(toViewModel(user), { kind: 'user', role: 'user', text: 'hi there', collapsible: true });
  const asst: TranscriptEntry = { role: 'assistant', text: 'hello', at: 't' };
  assert.deepEqual(toViewModel(asst), { kind: 'assistant-text', role: 'assistant', text: 'hello', collapsible: true });
  const marker: TranscriptEntry = { role: 'marker', text: 'done', cssClass: 'insrc-term__marker--done', at: 't' };
  assert.deepEqual(toViewModel(marker), { kind: 'fallback', text: 'done', cssClass: 'insrc-term__marker--done', collapsible: false });
});

test('toViewModel maps live events: assistant-delta -> assistant-text (ac2), tool-call -> tool-command (ac3)', () => {
  const delta: TurnEvent = { kind: 'assistant-delta', turnId: 't', text: 'step output' };
  assert.deepEqual(toViewModel(delta), { kind: 'assistant-text', role: 'assistant', text: 'step output', collapsible: true });
  // command-bearing -> the command is the row text.
  const withCmd: TurnEvent = { kind: 'tool-call', turnId: 't', tool: 'Bash', command: 'npm test' };
  assert.deepEqual(toViewModel(withCmd), { kind: 'tool-command', text: 'npm test', collapsible: false });
  // command-less -> the tool name.
  const noCmd: TurnEvent = { kind: 'tool-call', turnId: 't', tool: 'Read' };
  assert.deepEqual(toViewModel(noCmd), { kind: 'tool-command', text: 'Read', collapsible: false });
  // mcp, command-less -> `${server} · ${name}`.
  const mcp: TurnEvent = { kind: 'tool-call', turnId: 't', tool: 'x', mcp: { server: 'insrc', name: 'insrc_analyze_step' } };
  assert.deepEqual(toViewModel(mcp), { kind: 'tool-command', text: 'insrc · insrc_analyze_step', collapsible: false });
});

test('toViewModel is total: an unrecognised event maps to a fallback row', () => {
  const status: TurnEvent = { kind: 'status', turnId: 't', phase: 'thinking' };
  assert.deepEqual(toViewModel(status), { kind: 'fallback', text: '', collapsible: false });
  const unknown = { kind: 'reasoning', turnId: 't' } as unknown as TurnEvent;
  assert.deepEqual(toViewModel(unknown), { kind: 'fallback', text: '', collapsible: false });
});

test('parity: eval(webview toViewModel) equals host toViewModel for every sample (drift fails build)', () => {
  const { reg } = makeRegistry();
  const samples: Array<TranscriptEntry | TurnEvent> = [
    { role: 'user', text: 'hi', at: 't' },
    { role: 'assistant', text: 'yo', at: 't' },
    { role: 'marker', text: 'done', cssClass: 'insrc-term__marker--done', at: 't' },
    { role: 'marker', text: 'plain', at: 't' },
    { kind: 'assistant-delta', turnId: 't', text: 'd' },
    { kind: 'tool-call', turnId: 't', tool: 'Bash', command: 'ls' },
    { kind: 'tool-call', turnId: 't', tool: 'Read' },
    { kind: 'tool-call', turnId: 't', tool: 'x', mcp: { server: 'insrc', name: 'n' } },
    { kind: 'status', turnId: 't', phase: 'thinking' },
  ];
  for (const s of samples) {
    assert.deepEqual(reg.toViewModel(s), toViewModel(s), `webview/host toViewModel drift on ${JSON.stringify(s)}`);
  }
});

test('integration: an assistant multi-step turn renders each step\'s actual text (ac2)', () => {
  const { reg, appended } = makeRegistry();
  const steps: TurnEvent[] = [
    { kind: 'assistant-delta', turnId: 't', text: 'first step' },
    { kind: 'assistant-delta', turnId: 't', text: 'second step' },
  ];
  for (const ev of steps) reg.renderRow(reg.toViewModel(ev));
  assert.deepEqual(appended.map((n) => mdText(n)), ['first step', 'second step']);
});

test('integration: a command-bearing tool-call renders the command; a command-less one renders the tool name (ac3)', () => {
  const { reg, appended } = makeRegistry();
  reg.renderRow(reg.toViewModel({ kind: 'tool-call', turnId: 't', tool: 'Bash', command: 'grep -rn foo' } as TurnEvent));
  reg.renderRow(reg.toViewModel({ kind: 'tool-call', turnId: 't', tool: 'Read' } as TurnEvent));
  // S001 (bugfix): a tool-call now renders the mock's bordered .toolrow under a '▸ tool' label.
  assert.match(appended[0]!.className, /insrc-msg--tool/, 'the tool row carries the tool role tone');
  assert.ok(findByClass(appended[0]!, 'insrc-toolrow'), 'the command sits in the bordered toolrow');
  assert.ok(allText(appended[0]!).includes('grep -rn foo'), 'the command is shown inline');
  assert.ok(allText(appended[1]!).includes('Read'), 'command-less falls back to the tool name');
});

test('the tool-command renderer never wraps its content in the collapse primitive (k6 d)', () => {
  const { reg, appended } = makeRegistry();
  const node = reg.renderRow(reg.toViewModel({ kind: 'tool-call', turnId: 't', tool: 'Bash', command: 'x' } as TurnEvent));
  // The rendered node is the flat line() div, never an .insrc-collapse wrapper.
  assert.equal(node, appended[0], 'renderRow returned the flat row node');
  assert.doesNotMatch(node!.className, /insrc-collapse/, 'the tool-command row is not collapsible');
});

// ---- t5: keyed append reconciliation (lc1) --------------------------------------

test('lc1: appendKeyed renders once per key — a live echo and its replay twin reconcile to one row', () => {
  const { reg, appended } = makeRegistry();
  const vm = reg.toViewModel({ role: 'user', text: 'hello', at: 't' } as TranscriptEntry);
  const first = reg.appendKeyed(vm, 'r0');
  const second = reg.appendKeyed(vm, 'r0'); // the session-restored twin of the same row
  assert.equal(appended.length, 1, 'the same key rendered exactly one row (no double-render)');
  assert.equal(second, first, 'the second append returns the already-rendered node');
});

test('lc1: distinct keys render distinct rows (two identical prompts -> two rows)', () => {
  const { reg, appended } = makeRegistry();
  const vm = reg.toViewModel({ role: 'user', text: 'same', at: 't' } as TranscriptEntry);
  reg.appendKeyed(vm, 'r0');
  reg.appendKeyed(vm, 'r1');
  assert.equal(appended.length, 2, 'two distinct keys -> two rows');
});

test('lc1: resetKeys() clears the map so a fresh replay re-renders (restore after a live echo)', () => {
  const { reg, appended } = makeRegistry();
  const vm = reg.toViewModel({ role: 'user', text: 'hello', at: 't' } as TranscriptEntry);
  reg.appendKeyed(vm, 'r0'); // live echo
  reg.resetKeys(); // session-restored clears the terminal + the reconciliation map
  reg.appendKeyed(vm, 'r0'); // fresh replay after the clear
  assert.equal(appended.length, 2, 'after resetKeys the same key renders again (fresh replay)');
});

test('appendKeyed(vm, null) always renders (unkeyed rows are never reconciled)', () => {
  const { reg, appended } = makeRegistry();
  const vm = reg.toViewModel({ kind: 'assistant-delta', turnId: 't', text: 'x' } as TurnEvent);
  reg.appendKeyed(vm, null);
  reg.appendKeyed(vm, null);
  assert.equal(appended.length, 2, 'unkeyed appends are never deduped');
});

// ---- S003 t2: role differentiation + collapse-when-long ----

test('S003 ac1: the user and assistant-text renderers emit distinct role tones', () => {
  const { reg } = makeRegistry();
  const u = reg.renderRow({ kind: 'user', role: 'user', text: 'hi', collapsible: true });
  const a = reg.renderRow({ kind: 'assistant-text', role: 'assistant', text: 'yo', collapsible: true });
  assert.match(u!.className, /insrc-msg--user/, 'user row carries the user tone');
  assert.match(a!.className, /insrc-msg--assistant/, 'assistant row carries the assistant tone');
  assert.notEqual(u!.className, a!.className, 'the two roles are visually distinct');
});

test('S003 ac2: a >3-line message is wrapped in the collapse primitive (default-collapsed); a short one is not', () => {
  const { reg } = makeRegistry();
  const longText = 'l1\nl2\nl3\nl4\nl5';
  const longRow = reg.renderRow({ kind: 'assistant-text', role: 'assistant', text: longText, collapsible: true });
  // S001 (bugfix): the collapse now lives inside the .insrc-bubble, not as a direct child of the row.
  const wrap = findByClass(longRow!, 'insrc-collapse');
  assert.ok(wrap, 'a long message is wrapped in the collapse primitive');
  assert.match(wrap!.className, /insrc-collapse--collapsed/, 'default-collapsed (3-line preview)');
  const chevron = wrap!.children.find((c) => c.className === 'insrc-collapse__chevron');
  assert.equal(chevron!.textContent, '▸', 'icon-only chevron, collapsed glyph');
  const shortRow = reg.renderRow({ kind: 'user', role: 'user', text: 'just one line', collapsible: true });
  assert.ok(!findByClass(shortRow!, 'insrc-collapse'), 'a short message is NOT wrapped');
  assert.equal(msgText(shortRow!), 'just one line', 'short message keeps its plain text');
});

test('S003 k6 d: the tool-command renderer stays inline, never wrapped in collapse', () => {
  const { reg, appended } = makeRegistry();
  const node = reg.renderRow({ kind: 'tool-command', text: 'grep -rn foo', collapsible: false });
  assert.equal(node, appended[0], 'tool-command is the row node');
  assert.match(node!.className, /insrc-msg--tool/, 'the tool role tone');
  assert.doesNotMatch(node!.className, /insrc-collapse/, 'never collapsed');
  assert.ok(allText(node!).includes('grep -rn foo'), 'the command is shown inline in the toolrow');
});

// ---- S003 t3: assistant content-type widgets ----

test('S001 (bugfix): a top-level JSON value renders as a formatted json code block (via marked)', () => {
  const { reg } = makeRegistry();
  const row = reg.renderRow({ kind: 'assistant-text', role: 'assistant', text: '{"a":1,"b":"x"}', collapsible: true })!;
  const html = mdHtml(row);
  assert.match(html, /<pre>/, 'rendered as a code block');
  assert.match(html, /language-json/, 'tagged as json');
  const decoded = html.replace(/&quot;/g, '"'); // marked HTML-escapes code content
  assert.ok(decoded.includes('"a"') && decoded.includes('"b"'), 'the JSON content is present (pretty-printed)');
});

test('S001 (bugfix): markdown renders via marked (heading + list + inline code) as HTML', () => {
  const { reg } = makeRegistry();
  const md = '# Title\n\n- item one\n- item two\n\nsome `code` here';
  const row = reg.renderRow({ kind: 'assistant-text', role: 'assistant', text: md, collapsible: true })!;
  const html = mdHtml(row); // marked HTML lives on the .insrc-md div's innerHTML
  assert.match(html, /<h1[^>]*>Title<\/h1>/, 'heading rendered');
  assert.match(html, /<ul>[\s\S]*<li>item one<\/li>/, 'list rendered');
  assert.match(html, /<code>code<\/code>/, 'inline code rendered');
});

test('S001 (bugfix): plain prose renders as a paragraph (marked), text preserved', () => {
  const { reg } = makeRegistry();
  const row = reg.renderRow({ kind: 'assistant-text', role: 'assistant', text: 'just some prose without markers', collapsible: true })!;
  assert.ok(findByClass(row, 'insrc-md'), 'wrapped in the marked container');
  assert.ok(mdText(row).includes('just some prose without markers'), 'the prose text is preserved');
});

test('S001 (bugfix): malformed JSON does not throw — it renders as markdown text', () => {
  const { reg } = makeRegistry();
  let row: FakeNode | null = null;
  assert.doesNotThrow(() => { row = reg.renderRow({ kind: 'assistant-text', role: 'assistant', text: '{not valid json', collapsible: true }); });
  assert.ok(mdText(row!).includes('not valid json'), 'the raw text survives as markdown');
});

test('S001 (bugfix): the render source uses marked + sanitizes with guardMd (no unsanitized innerHTML)', () => {
  const src = renderRegistryWebviewSource();
  assert.match(src, /marked\.parse\(/, 'delegates to the marked library');
  assert.match(src, /function guardMd\(/, 'defines the sanitizer');
  // Every innerHTML assignment is immediately followed (in the same statement) by guardMd(...).
  assert.match(src, /\.innerHTML=[^;]*;guardMd\(/, 'innerHTML is always paired with guardMd sanitization');
});

// ---- S003 t4: collapsible inline-diff + tool-result renderers (k6 c) ----

test('S003 k6 c: inline-diff + tool-result wrap their body in the collapse primitive with a caption', () => {
  const { reg } = makeRegistry();
  for (const kind of ['inline-diff', 'tool-result']) {
    const row = reg.renderRow({ kind, text: 'line a\nline b', collapsible: true } as unknown as RowViewModel)!;
    const cap = findByClass(row, 'insrc-caption');
    assert.ok(cap, `${kind} has a caption`);
    const wrap = findByClass(row, 'insrc-collapse');
    assert.ok(wrap, `${kind} wraps its body in the collapse primitive`);
    assert.match(wrap!.className, /insrc-collapse--collapsed/, `${kind} is default-collapsed (collapsed to caption)`);
  }
});

// ---- S004 t6: the approval-card renderer -------------------------------------

test("S004 t6: the 'approval' renderer builds an icon-only approve/deny card via className/textContent", () => {
  const { reg } = makeRegistry();
  const vm = {
    kind: 'approval',
    text: 'Permission request',
    collapsible: false,
    meta: { requestId: 'perm-1', title: 'Run a shell command', detail: 'rm -rf build', toolName: 'Bash' },
  };
  const card = reg.renderRow(vm);
  assert.ok(card, 'rendered a node');
  assert.ok(card!.className.split(' ').includes('insrc-approval'), 'card carries the insrc-approval class');
  assert.equal(card!.attrs['data-request-id'], 'perm-1', 'card carries the correlation id');
  // Title + detail come from meta, via textContent (no innerHTML).
  assert.equal(findByClass(card!, 'insrc-approval__title')?.textContent, 'Run a shell command');
  assert.equal(findByClass(card!, 'insrc-approval__detail')?.textContent, 'rm -rf build');
  // Icon-only buttons: glyphs only, no text label (k6 i).
  const approve = findByClass(card!, 'insrc-approval__btn--approve')!;
  const deny = findByClass(card!, 'insrc-approval__btn--deny')!;
  assert.equal(approve.tag, 'button');
  assert.equal(deny.tag, 'button');
  assert.equal(approve.textContent, '✓', 'approve is an icon-only check');
  assert.equal(deny.textContent, '✗', 'deny is an icon-only cross');
  assert.equal(approve.attrs['aria-label'], 'approve', 'a11y label present since the button is icon-only');
  assert.equal(deny.attrs['aria-label'], 'deny');
});

test('S004 t6: card buttons invoke the registered decision sink with (requestId, decision)', () => {
  const { reg } = makeRegistry();
  const decisions: Array<[string, string]> = [];
  reg.onApprovalDecision((requestId, decision) => decisions.push([requestId, decision]));
  const card = reg.renderRow({ kind: 'approval', text: '', collapsible: false, meta: { requestId: 'perm-9', title: 'x' } })!;
  findByClass(card, 'insrc-approval__btn--approve')!.click();
  findByClass(card, 'insrc-approval__btn--deny')!.click();
  assert.deepEqual(decisions, [['perm-9', 'approve'], ['perm-9', 'deny']]);
});

test('S004 t6: an approval card with no decision sink registered does not throw on click', () => {
  const { reg } = makeRegistry();
  const card = reg.renderRow({ kind: 'approval', text: '', collapsible: false, meta: { requestId: 'perm-2', title: 'y' } })!;
  assert.doesNotThrow(() => findByClass(card, 'insrc-approval__btn--approve')!.click());
});

// ---- S001 (bugfix): markdown tables + ordered lists + blockquotes (were raw pipes/text) ----

test('S001 (bugfix): marked renders GFM tables (thead/tbody/th/td), ordered lists, and blockquotes', () => {
  const { reg } = makeRegistry();
  const md = '# Title\n\n| A | B |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |\n\n1. first\n2. second\n\n> a quoted line\n\ntail paragraph';
  const row = reg.renderRow({ kind: 'assistant-text', role: 'assistant', text: md, collapsible: true })!;
  const html = mdHtml(row);
  assert.match(html, /<table>[\s\S]*<thead>[\s\S]*<tbody>/, 'a real table (thead + tbody), not raw pipes');
  assert.equal((html.match(/<th[\s>]/g) ?? []).length, 2, 'two header cells');
  assert.equal((html.match(/<td[\s>]/g) ?? []).length, 4, 'four body cells (2 rows x 2 cols)');
  assert.ok(!/\| A \| B \|/.test(html), 'the raw pipe row did not leak through');
  assert.match(html, /<ol>[\s\S]*<li>first<\/li>/, 'ordered list rendered as <ol>');
  assert.match(html, /<blockquote>/, 'blockquote rendered');
});

test('S001 (bugfix): a table-only response still renders as a table (marked GFM)', () => {
  const { reg } = makeRegistry();
  const md = '| Col1 | Col2 |\n| --- | --- |\n| x | y |';
  const row = reg.renderRow({ kind: 'assistant-text', role: 'assistant', text: md, collapsible: true })!;
  assert.match(mdHtml(row), /<table>/, 'a bare table renders as <table>');
});
