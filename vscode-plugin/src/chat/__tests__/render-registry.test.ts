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
import { renderRegistryWebviewSource, RENDER_REGISTRY_STYLE } from '../render-registry.js';

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
