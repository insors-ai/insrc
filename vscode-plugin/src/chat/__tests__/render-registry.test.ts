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
  parentNode?: FakeNode; // S003: set on appendChild so removeChild can detach (the approval resolve path)
  listeners: Record<string, Array<() => void>>;
  appendChild(c: FakeNode): void;
  removeChild(c: FakeNode): void; // S003: the resolved approval card removes its .insrc-approval__actions
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
    appendChild(c) { c.parentNode = this; this.children.push(c); },
    removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); c.parentNode = undefined; },
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
  onSelectionDecision(cb: (requestId: string, selected: string[]) => void): void;
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
    // S001 (ux polish): tool-result — live event (with + without command) and its replayed twin.
    { kind: 'tool-result', turnId: 't', command: 'npm test', output: 'ok' },
    { kind: 'tool-result', turnId: 't', output: 'no cmd' },
    { role: 'tool-result', command: 'ls', output: 'a\nb', at: 't' },
    { role: 'tool-result', output: 'orphan', at: 't' },
    // S003 (ux polish): permission-outcome — live event (approved/rejected) and its replayed twin.
    { kind: 'permission-outcome', turnId: 't', toolName: 'Bash', decision: 'approved' },
    { kind: 'permission-outcome', turnId: 't', toolName: 'Write', decision: 'rejected' },
    { role: 'permission-outcome', toolName: 'Bash', decision: 'approved', at: 't' },
    { role: 'permission-outcome', toolName: 'Write', decision: 'rejected', at: 't' },
    // S004 (ux polish): selection-request (single + multi) live events, and selection-outcome
    // live event + its replayed twin.
    { kind: 'selection-request', turnId: 't', requestId: 's1', prompt: 'Pick', options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] },
    { kind: 'selection-request', turnId: 't', requestId: 's2', prompt: 'Pick many', options: [{ id: 'a', label: 'A' }], multi: true },
    { kind: 'selection-outcome', turnId: 't', chosen: ['A'] },
    { role: 'selection-outcome', chosen: ['A', 'B'], at: 't' },
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

test('S003 k6 c: inline-diff wraps its body in the collapse primitive with a caption', () => {
  const { reg } = makeRegistry();
  const row = reg.renderRow({ kind: 'inline-diff', text: 'line a\nline b', collapsible: true } as unknown as RowViewModel)!;
  const cap = findByClass(row, 'insrc-caption');
  assert.ok(cap, 'inline-diff has a caption');
  const wrap = findByClass(row, 'insrc-collapse');
  assert.ok(wrap, 'inline-diff wraps its body in the collapse primitive');
  assert.match(wrap!.className, /insrc-collapse--collapsed/, 'inline-diff is default-collapsed (collapsed to caption)');
});

// ---- S001 (ux polish): structured tool-result row (command + separator + collapsed output) ----

test('S001 (ux polish): toViewModel maps a live tool-result event and its replayed twin to the SAME view-model (dual-input)', () => {
  const live: TurnEvent = { kind: 'tool-result', turnId: 't', command: 'npm test', output: 'ok\nfine' };
  const replayed: TranscriptEntry = { role: 'tool-result', command: 'npm test', output: 'ok\nfine', at: 't' };
  const expected = { kind: 'tool-result', text: 'npm test', collapsible: true, meta: { command: 'npm test', output: 'ok\nfine' } };
  assert.deepEqual(toViewModel(live), expected, 'live event -> structured tool-result vm');
  assert.deepEqual(toViewModel(replayed), expected, 'replayed entry -> the identical vm');
  // A command-less pair: text is '' and meta.command is undefined, consistent across both inputs.
  const liveNoCmd: TurnEvent = { kind: 'tool-result', turnId: 't', output: 'x' };
  const replayNoCmd: TranscriptEntry = { role: 'tool-result', output: 'x', at: 't' };
  assert.deepEqual(toViewModel(liveNoCmd), toViewModel(replayNoCmd), 'command-less live/replayed agree');
  assert.equal(toViewModel(liveNoCmd).text, '', 'command-less row has empty command text');
});

test('S001 (ux polish): the tool-result renderer shows the command + a separator, and collapses ONLY the output', () => {
  const { reg, appended } = makeRegistry();
  const vm = reg.toViewModel({ kind: 'tool-result', turnId: 't', command: 'npm test', output: 'l1\nl2\nl3\nl4' } as TurnEvent);
  const row = reg.renderRow(vm)!;
  assert.equal(row, appended[0], 'the tool-result row self-appends via line() (like tool-command)');
  // The command line is present and visible (NOT inside the collapse wrapper).
  const cmd = findByClass(row, 'insrc-toolresult__cmd');
  assert.ok(cmd, 'the command line is rendered');
  assert.ok(allText(cmd!).includes('npm test'), 'the command text is shown');
  assert.ok(allText(cmd!).includes('$'), 'a shell $ prompt precedes the command');
  // A visual separator element sits between the command and the output.
  assert.ok(findByClass(row, 'insrc-toolresult__sep'), 'a separator element is rendered');
  // ONLY the output is wrapped in the collapse primitive (default-collapsed 3-line preview).
  const wrap = findByClass(row, 'insrc-collapse');
  assert.ok(wrap, 'the output is wrapped in the collapse primitive');
  assert.match(wrap!.className, /insrc-collapse--collapsed/, 'the output is default-collapsed');
  const out = findByClass(wrap!, 'insrc-toolresult__out');
  assert.ok(out, 'the output element sits inside the collapse body');
  assert.ok(allText(out!).includes('l1\nl2\nl3\nl4'), 'the full output is present (collapsed via CSS clamp)');
  // The command must NOT be inside the collapse wrapper (it stays always-visible).
  assert.ok(!findByClass(wrap!, 'insrc-toolresult__cmd'), 'the command line is OUTSIDE the collapse (always visible)');
});

test('S001 (ux polish): a command-less tool-result renders no command line but still collapses the output', () => {
  const { reg } = makeRegistry();
  const row = reg.renderRow(reg.toViewModel({ kind: 'tool-result', turnId: 't', output: 'just output' } as TurnEvent))!;
  assert.ok(!findByClass(row, 'insrc-toolresult__cmd'), 'no command line when the command is empty');
  const wrap = findByClass(row, 'insrc-collapse');
  assert.ok(wrap && /insrc-collapse--collapsed/.test(wrap.className), 'the output is still collapsed');
  assert.ok(allText(row).includes('just output'), 'the output text is present');
});

test('S001 (ux polish): assistant (non-tool) text is NEVER default-collapsed — a short assistant row renders in full, uncollapsed', () => {
  const { reg } = makeRegistry();
  const row = reg.renderRow({ kind: 'assistant-text', role: 'assistant', text: 'a concise answer', collapsible: true })!;
  assert.ok(!findByClass(row, 'insrc-collapse'), 'a short assistant message is not wrapped in the collapse primitive');
  assert.ok(mdText(row).includes('a concise answer'), 'the assistant text renders in full');
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
  // S003 (ux polish) ac1: a decided card resolves + drops its buttons, so approve and deny are
  // exercised on SEPARATE cards (a real card is single-use).
  const approveCard = reg.renderRow({ kind: 'approval', text: '', collapsible: false, meta: { requestId: 'perm-9', title: 'x' } })!;
  findByClass(approveCard, 'insrc-approval__btn--approve')!.click();
  const denyCard = reg.renderRow({ kind: 'approval', text: '', collapsible: false, meta: { requestId: 'perm-9', title: 'x' } })!;
  findByClass(denyCard, 'insrc-approval__btn--deny')!.click();
  assert.deepEqual(decisions, [['perm-9', 'approve'], ['perm-9', 'deny']]);
});

// ---- S003 (dev-chat ux polish) ac1: the approval card resolves + drops its buttons on decision ----

test('S003 ac1: approving the card adds the resolved (approved) class and REMOVES the actions element', () => {
  const { reg } = makeRegistry();
  const card = reg.renderRow({ kind: 'approval', text: '', collapsible: false, meta: { requestId: 'perm-a', title: 'Run', detail: 'x' } })!;
  assert.ok(findByClass(card, 'insrc-approval__actions'), 'buttons present before the decision');
  findByClass(card, 'insrc-approval__btn--approve')!.click();
  assert.match(card.className, /insrc-approval--approved/, 'card stamped with the approved resolved class');
  assert.doesNotMatch(card.className, /insrc-approval--rejected/);
  assert.ok(!findByClass(card, 'insrc-approval__actions'), 'the actions element (buttons) is removed once decided');
});

test('S003 ac1: denying the card adds the resolved (rejected) class and REMOVES the actions element', () => {
  const { reg } = makeRegistry();
  const card = reg.renderRow({ kind: 'approval', text: '', collapsible: false, meta: { requestId: 'perm-r', title: 'Run', detail: 'x' } })!;
  findByClass(card, 'insrc-approval__btn--deny')!.click();
  assert.match(card.className, /insrc-approval--rejected/, 'card stamped with the rejected resolved class');
  assert.ok(!findByClass(card, 'insrc-approval__actions'), 'the actions element is removed on deny too');
});

// ---- S003 (dev-chat ux polish) t1: the resolved permission-outcome chip ----

test('S003 t1: toViewModel maps a live permission-outcome event and its replayed twin to the SAME vm (dual-input)', () => {
  const live: TurnEvent = { kind: 'permission-outcome', turnId: 't', toolName: 'Bash', decision: 'approved' };
  const replayed: TranscriptEntry = { role: 'permission-outcome', toolName: 'Bash', decision: 'approved', at: 't' };
  const expected = { kind: 'permission-outcome', text: 'Bash', collapsible: false, meta: { toolName: 'Bash', decision: 'approved' } };
  assert.deepEqual(toViewModel(live), expected, 'live event -> resolved-chip vm');
  assert.deepEqual(toViewModel(replayed), expected, 'replayed entry -> the identical vm');
  const reject: TranscriptEntry = { role: 'permission-outcome', toolName: 'Write', decision: 'rejected', at: 't' };
  assert.deepEqual(toViewModel(reject).meta, { toolName: 'Write', decision: 'rejected' });
});

test('S003 t1: the permission-outcome renderer draws a non-actionable tool + decided badge chip (green approved)', () => {
  const { reg, appended } = makeRegistry();
  const vm = reg.toViewModel({ kind: 'permission-outcome', turnId: 't', toolName: 'Bash', decision: 'approved' } as TurnEvent);
  const row = reg.renderRow(vm)!;
  assert.equal(row, appended[0], 'the chip self-appends via line() (like tool-result)');
  const chip = findByClass(row, 'insrc-permoutcome');
  assert.ok(chip, 'the chip is rendered');
  assert.ok(allText(row).includes('Bash'), 'the tool name is shown');
  const badge = findByClass(row, 'insrc-permoutcome__badge')!;
  assert.match(badge.className, /insrc-approval__btn--approve/, 'approved badge reuses the green approve tint');
  assert.ok(badge.textContent.includes('approved'), 'the badge reads approved');
  // Non-actionable: no buttons, no click listeners anywhere on the chip.
  assert.ok(!findByTag(row, 'button'), 'the chip has no buttons (non-actionable)');
});

test('S003 t1: a rejected permission-outcome reuses the red deny tint', () => {
  const { reg } = makeRegistry();
  const row = reg.renderRow(reg.toViewModel({ role: 'permission-outcome', toolName: 'Write', decision: 'rejected', at: 't' } as TranscriptEntry))!;
  const badge = findByClass(row, 'insrc-permoutcome__badge')!;
  assert.match(badge.className, /insrc-approval__btn--deny/, 'rejected badge reuses the red deny tint');
  assert.ok(badge.textContent.includes('rejected'), 'the badge reads rejected');
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

// ---- S004 (dev-chat ux polish): the interactive selection widget + resolved chip ----

test('S004 (ux polish): toViewModel maps a live selection-request event to the card view-model (prompt/options/multi/requestId on meta)', () => {
  const live: TurnEvent = { kind: 'selection-request', turnId: 't', requestId: 's1', prompt: 'Pick one', options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] };
  assert.deepEqual(toViewModel(live), {
    kind: 'selection-request',
    text: 'Pick one',
    collapsible: false,
    meta: { prompt: 'Pick one', options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], requestId: 's1', multi: false },
  });
  const multi: TurnEvent = { kind: 'selection-request', turnId: 't', requestId: 's2', prompt: 'Pick many', options: [{ id: 'x', label: 'X' }], multi: true };
  assert.equal(toViewModel(multi).meta?.['multi'], true, 'multi:true is carried on meta');
});

test('S004 (ux polish): toViewModel maps a live selection-outcome event and its replayed twin to the SAME vm (dual-input)', () => {
  const liveEv: TurnEvent = { kind: 'selection-outcome', turnId: 't', chosen: ['A', 'C'] };
  const replayed: TranscriptEntry = { role: 'selection-outcome', chosen: ['A', 'C'], at: 't' };
  const expected = { kind: 'selection-outcome', text: 'A, C', collapsible: false, meta: { chosen: ['A', 'C'] } };
  assert.deepEqual(toViewModel(liveEv), expected, 'live event -> resolved-chip vm');
  assert.deepEqual(toViewModel(replayed), expected, 'replayed entry -> the identical vm');
});

test('S004 (ux polish): the selection-request renderer draws radio controls for single-select', () => {
  const { reg } = makeRegistry();
  const vm = reg.toViewModel({ kind: 'selection-request', turnId: 't', requestId: 's1', prompt: 'Choose', options: [{ id: 'a', label: 'Alpha' }, { id: 'b', label: 'Beta' }] } as TurnEvent);
  const row = reg.renderRow(vm)!;
  const card = findByClass(row, 'insrc-select')!;
  assert.ok(card, 'the widget card is rendered');
  assert.equal(card.attrs['data-request-id'], 's1', 'the card carries the correlation id');
  assert.ok(allText(row).includes('Choose'), 'the prompt is shown');
  // Two option rows, each control is role=radio (single-select).
  const ctls: FakeNode[] = [];
  (function walk(n: FakeNode) { if (n.className.split(/\s+/).includes('insrc-select__ctl')) ctls.push(n); n.children.forEach(walk); })(row);
  assert.equal(ctls.length, 2, 'one control per option');
  assert.ok(ctls.every((c) => c.attrs['role'] === 'radio'), 'single-select uses radio controls');
  assert.ok(allText(row).includes('Alpha') && allText(row).includes('Beta'), 'both labels are shown');
});

test('S004 (ux polish): the selection-request renderer draws checkbox controls for multi-select', () => {
  const { reg } = makeRegistry();
  const vm = reg.toViewModel({ kind: 'selection-request', turnId: 't', requestId: 's2', prompt: 'Choose many', options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], multi: true } as TurnEvent);
  const row = reg.renderRow(vm)!;
  const ctls: FakeNode[] = [];
  (function walk(n: FakeNode) { if (n.className.split(/\s+/).includes('insrc-select__ctl')) ctls.push(n); n.children.forEach(walk); })(row);
  assert.equal(ctls.length, 2);
  assert.ok(ctls.every((c) => c.attrs['role'] === 'checkbox'), 'multi-select uses checkbox controls');
});

test('S004 (ux polish): confirm is disabled until >=1 is chosen; a single pick posts exactly one selection-decision with the id', () => {
  const { reg } = makeRegistry();
  const posted: Array<[string, string[]]> = [];
  reg.onSelectionDecision((requestId, selected) => posted.push([requestId, selected]));
  const row = reg.renderRow(reg.toViewModel({ kind: 'selection-request', turnId: 't', requestId: 's1', prompt: 'Pick', options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] } as TurnEvent))!;
  const confirm = findByClass(row, 'insrc-select__confirm')!;
  assert.equal(confirm.disabled, true, 'confirm starts disabled (nothing chosen)');
  // Clicking confirm while disabled posts nothing.
  confirm.click();
  assert.equal(posted.length, 0, 'a disabled confirm is a no-op');
  // Pick the first option, then confirm.
  const opts: FakeNode[] = [];
  (function walk(n: FakeNode) { if (n.className.split(/\s+/).includes('insrc-select__opt')) opts.push(n); n.children.forEach(walk); })(row);
  opts[0]!.click();
  assert.equal(confirm.disabled, false, 'confirm enables once an option is chosen');
  confirm.click();
  assert.deepEqual(posted, [['s1', ['a']]], 'exactly one selection-decision with the chosen id');
});

test('S004 (ux polish): single-select — picking a second option replaces the first (radio semantics)', () => {
  const { reg } = makeRegistry();
  const posted: Array<[string, string[]]> = [];
  reg.onSelectionDecision((r, s) => posted.push([r, s]));
  const row = reg.renderRow(reg.toViewModel({ kind: 'selection-request', turnId: 't', requestId: 's1', prompt: 'Pick', options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] } as TurnEvent))!;
  const opts: FakeNode[] = [];
  (function walk(n: FakeNode) { if (n.className.split(/\s+/).includes('insrc-select__opt')) opts.push(n); n.children.forEach(walk); })(row);
  opts[0]!.click();
  opts[1]!.click(); // switching selection deselects the first
  findByClass(row, 'insrc-select__confirm')!.click();
  assert.deepEqual(posted, [['s1', ['b']]], 'only the last-picked id is submitted');
});

test('S004 (ux polish): multi-select — two checkboxes both submit; a zero-chosen confirm posts nothing', () => {
  const { reg } = makeRegistry();
  const posted: Array<[string, string[]]> = [];
  reg.onSelectionDecision((r, s) => posted.push([r, s]));
  const row = reg.renderRow(reg.toViewModel({ kind: 'selection-request', turnId: 't', requestId: 's2', prompt: 'Pick many', options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], multi: true } as TurnEvent))!;
  const confirm = findByClass(row, 'insrc-select__confirm')!;
  // Zero chosen -> confirm disabled -> no post.
  confirm.click();
  assert.equal(posted.length, 0, 'multi confirm with zero chosen posts nothing');
  const opts: FakeNode[] = [];
  (function walk(n: FakeNode) { if (n.className.split(/\s+/).includes('insrc-select__opt')) opts.push(n); n.children.forEach(walk); })(row);
  opts[0]!.click();
  opts[1]!.click(); // multi keeps both
  confirm.click();
  assert.deepEqual(posted, [['s2', ['a', 'b']]], 'both chosen ids are submitted');
});

test('S004 (ux polish): duplicate option ids still render distinctly (keyed by index) and both are selectable', () => {
  const { reg } = makeRegistry();
  const posted: Array<[string, string[]]> = [];
  reg.onSelectionDecision((r, s) => posted.push([r, s]));
  const row = reg.renderRow(reg.toViewModel({ kind: 'selection-request', turnId: 't', requestId: 's3', prompt: 'Dup', options: [{ id: 'dup', label: 'First' }, { id: 'dup', label: 'Second' }], multi: true } as TurnEvent))!;
  const opts: FakeNode[] = [];
  (function walk(n: FakeNode) { if (n.className.split(/\s+/).includes('insrc-select__opt')) opts.push(n); n.children.forEach(walk); })(row);
  assert.equal(opts.length, 2, 'both duplicate-id options render as distinct rows');
  assert.ok(allText(row).includes('First') && allText(row).includes('Second'), 'both distinct labels render');
  opts[0]!.click();
  opts[1]!.click();
  findByClass(row, 'insrc-select__confirm')!.click();
  assert.deepEqual(posted, [['s3', ['dup', 'dup']]], 'each selected index contributes its id');
});

test('S004 (ux polish): a selection-request card with no decision sink registered does not throw on confirm', () => {
  const { reg } = makeRegistry();
  const row = reg.renderRow(reg.toViewModel({ kind: 'selection-request', turnId: 't', requestId: 's1', prompt: 'Pick', options: [{ id: 'a', label: 'A' }] } as TurnEvent))!;
  const opts: FakeNode[] = [];
  (function walk(n: FakeNode) { if (n.className.split(/\s+/).includes('insrc-select__opt')) opts.push(n); n.children.forEach(walk); })(row);
  opts[0]!.click();
  assert.doesNotThrow(() => findByClass(row, 'insrc-select__confirm')!.click());
});

test('S004 (ux polish): the selection-outcome renderer draws a non-actionable chip listing the chosen labels', () => {
  const { reg, appended } = makeRegistry();
  const vm = reg.toViewModel({ kind: 'selection-outcome', turnId: 't', chosen: ['Option A', 'Option C'] } as TurnEvent);
  const row = reg.renderRow(vm)!;
  assert.equal(row, appended[0], 'the chip self-appends via line() (like permission-outcome)');
  const chip = findByClass(row, 'insrc-selectoutcome');
  assert.ok(chip, 'the chip is rendered');
  assert.ok(allText(row).includes('Option A') && allText(row).includes('Option C'), 'the chosen labels are shown');
  // Non-actionable: no buttons anywhere on the chip.
  assert.ok(!findByTag(row, 'button'), 'the resolved chip has no controls');
});

test('S004 (ux polish): a session-restored replay renders the resolved chip; the pending selection-request card does NOT re-surface', () => {
  // On restore, the transcript carries only the resolved selection-outcome row (the live-only
  // selection-request is never persisted — markerFor maps it to null). Replaying the stored
  // transcript therefore renders the chip, never the interactive card.
  const { reg, appended } = makeRegistry();
  const transcript: TranscriptEntry[] = [
    { role: 'user', text: 'which option?', at: 't1' },
    { role: 'selection-outcome', chosen: ['A'], at: 't2' },
  ];
  transcript.forEach((x, i) => reg.appendKeyed(reg.toViewModel(x), 'r' + i));
  assert.equal(appended.length, 2, 'two rows replayed (user + resolved chip)');
  assert.ok(!appended.some((n) => findByClass(n, 'insrc-select')), 'no interactive selection card re-surfaces on replay');
  assert.ok(appended.some((n) => findByClass(n, 'insrc-selectoutcome')), 'the resolved chip is rendered');
});
