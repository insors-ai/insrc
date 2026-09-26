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
import { renderRegistryWebviewSource, RENDER_REGISTRY_STYLE, toViewModel } from '../render-registry.js';
import type { RowViewModel } from '../render-registry.js';
import type { TranscriptEntry } from '../session-store.js';
import type { TurnEvent } from '../stream-events.js';

/** A tiny DOM stand-in: records className/textContent/children + click listeners. */
interface FakeNode {
  tag: string;
  className: string;
  textContent: string;
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

test('renderRegistryWebviewSource() is CSP-safe: no import/remote/innerHTML/vscode', () => {
  const src = renderRegistryWebviewSource();
  assert.doesNotMatch(src, /\bimport\b/, 'no import');
  assert.doesNotMatch(src, /https?:\/\//, 'no remote origin');
  assert.doesNotMatch(src, /innerHTML/, 'no innerHTML');
  assert.doesNotMatch(src, /asWebviewUri/, 'no asWebviewUri');
  assert.doesNotMatch(src, /\bvscode\b/, 'no vscode reference');
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
  assert.deepEqual(appended.map((n) => n.textContent), ['first step', 'second step']);
});

test('integration: a command-bearing tool-call renders the command; a command-less one renders the tool name (ac3)', () => {
  const { reg, appended } = makeRegistry();
  reg.renderRow(reg.toViewModel({ kind: 'tool-call', turnId: 't', tool: 'Bash', command: 'grep -rn foo' } as TurnEvent));
  reg.renderRow(reg.toViewModel({ kind: 'tool-call', turnId: 't', tool: 'Read' } as TurnEvent));
  assert.equal(appended[0]!.textContent, 'grep -rn foo', 'the command is shown inline');
  assert.equal(appended[0]!.className, 'insrc-term__marker--tool', 'the tool-command row keeps the sc1 tool tone');
  assert.equal(appended[1]!.textContent, 'Read', 'command-less falls back to the tool name');
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
  const wrap = longRow!.children.find((c) => /insrc-collapse/.test(c.className));
  assert.ok(wrap, 'a long message is wrapped in the collapse primitive');
  assert.match(wrap!.className, /insrc-collapse--collapsed/, 'default-collapsed (3-line preview)');
  const chevron = wrap!.children.find((c) => c.className === 'insrc-collapse__chevron');
  assert.equal(chevron!.textContent, '▸', 'icon-only chevron, collapsed glyph');
  const shortRow = reg.renderRow({ kind: 'user', role: 'user', text: 'just one line', collapsible: true });
  assert.ok(!shortRow!.children.some((c) => /insrc-collapse/.test(c.className)), 'a short message is NOT wrapped');
  assert.equal(shortRow!.textContent, 'just one line', 'short message keeps its plain text');
});

test('S003 k6 d: the tool-command renderer stays inline, never wrapped in collapse', () => {
  const { reg, appended } = makeRegistry();
  const node = reg.renderRow({ kind: 'tool-command', text: 'grep -rn foo', collapsible: false });
  assert.equal(node, appended[0], 'tool-command is the flat line() row');
  assert.equal(node!.className, 'insrc-term__marker--tool', 'tool tone, no msg/collapse class');
  assert.doesNotMatch(node!.className, /insrc-collapse|insrc-msg/, 'never collapsed, not a message row');
});
