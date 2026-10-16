/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Story E20261016f52996c2:S001 / t2 — the code-reference page script.
 *
 * The script runs here in a fresh vm context against a small stand-in DOM that models what the
 * script relies on: capture-phase listeners on the document, and a viewport that captures the
 * pointer, so a click is delivered to it rather than to the box that was pressed.
 *
 * Run: npx tsx --test src/workflow/artifacts/companion/__tests__/code-ref-script.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';

import { CODE_REF_SCRIPT } from '../../../../docgen/render/code-ref-script.js';
import { assembleShell } from '../../../../docgen/render/shell.js';
import { assembleFallbackShell } from '../../../../docgen/render/fallback.js';
import { isOk } from '../../../../docgen/outcome.js';
import type { DocumentIR } from '../../../../docgen/types.js';
import { renderCompanionPage, type CompanionPageContent } from '../shell.js';
import type { CompanionHeader } from '../types.js';

interface Node_ { nodeType: number; parentNode: El | null }
interface Text_ extends Node_ { nodeType: 3; data: string }
interface El extends Node_ {
  nodeType: 1; tagName: string; childNodes: Node_[]; attrs: Record<string, string>; style: Record<string, string>;
  getAttribute(n: string): string | null; setAttribute(n: string, v: string): void; removeAttribute(n: string): void;
}

function text(data: string): Text_ { return { nodeType: 3, data, parentNode: null }; }
function el(tagName: string, ...kids: (Node_ | string)[]): El {
  const e: El = {
    nodeType: 1, tagName: tagName.toUpperCase(), parentNode: null, childNodes: [], attrs: {}, style: {},
    getAttribute(n) { return n in e.attrs ? e.attrs[n]! : null; },
    setAttribute(n, v) { e.attrs[n] = v; },
    removeAttribute(n) { delete e.attrs[n]; },
  };
  for (const k of kids) { const n = typeof k === 'string' ? text(k) : k; n.parentNode = e; e.childNodes.push(n); }
  return e;
}
function walk(root: El, out: El[] = []): El[] {
  out.push(root);
  for (const k of root.childNodes) if (k.nodeType === 1) walk(k as El, out);
  return out;
}

interface Posted { msg: Record<string, unknown>; origin: string }
interface Page { posted: Posted[]; down(target: El, x: number, y: number): void; click(target: El, x: number, y: number, detail?: number): void; rescan(): void }

/** Runs the script over `root`; the page's events go through the document's capture listeners. */
function load(root: El): Page {
  const listeners: { type: string; fn: (ev: Record<string, unknown>) => void; capture: boolean }[] = [];
  const posted: Posted[] = [];
  const document = {
    querySelectorAll: () => walk(root),
    addEventListener: (type: string, fn: (ev: Record<string, unknown>) => void, capture?: boolean) => { listeners.push({ type, fn, capture: capture === true }); },
  };
  const parent = { postMessage: (msg: Record<string, unknown>, origin: string) => { posted.push({ msg, origin }); } };
  const window: Record<string, unknown> = { parent };
  window['window'] = window;
  runInNewContext(CODE_REF_SCRIPT, { document, window });
  const fire = (type: string, ev: Record<string, unknown>) => { for (const l of listeners) if (l.type === type && l.capture) l.fn(ev); };
  return {
    posted,
    down: (target, x, y) => fire('pointerdown', { target, clientX: x, clientY: y, button: 0 }),
    click: (target, x, y, detail) => fire('click', { target, clientX: x, clientY: y, ...(detail === undefined ? {} : { detail }) }),
    rescan: () => (window['insrcMarkCodeRefs'] as () => void)(),
  };
}

/** A press and release at the same place on `pressed`, delivered to `deliveredTo` (the viewport that captured the pointer). */
function press(page: Page, pressed: El, deliveredTo: El = pressed): void {
  page.down(pressed, 100, 100);
  page.click(deliveredTo, 100, 100);
}

test('src/workflow/artifacts/companion/__tests__/code-ref-script.test.ts: an element holding a path and line is marked, and a click posts that path and line to the parent', () => {
  const box = el('span', 'handle (src/workflow/synthesizer.ts:207)');
  const page = load(el('div', box));
  assert.equal(box.getAttribute('data-insrc-path'), 'src/workflow/synthesizer.ts');
  assert.equal(box.getAttribute('data-insrc-line'), '207');
  press(page, box);
  assert.deepEqual(page.posted.map(p => ({ ...p.msg })), [{ type: 'insrc-open-code-ref', path: 'src/workflow/synthesizer.ts', line: 207 }]);
});

test('src/workflow/artifacts/companion/__tests__/code-ref-script.test.ts: a table cell holding a path with no line is marked and posts the path alone', () => {
  const cell = el('td', 'src/docgen/render/shell.ts');
  const page = load(el('table', el('tr', cell)));
  assert.equal(cell.getAttribute('data-insrc-path'), 'src/docgen/render/shell.ts');
  assert.equal(cell.getAttribute('data-insrc-line'), null);
  press(page, cell);
  assert.deepEqual(page.posted.map(p => ({ ...p.msg })), [{ type: 'insrc-open-code-ref', path: 'src/docgen/render/shell.ts' }]);
});

test('src/workflow/artifacts/companion/__tests__/code-ref-script.test.ts: text with no reference is not marked and a click on it posts nothing', () => {
  const plain = el('p', 'the call returns to its caller, see section 4');
  const page = load(el('div', plain));
  assert.equal(plain.getAttribute('data-insrc-path'), null);
  press(page, plain);
  assert.deepEqual(page.posted, []);
});

test('src/workflow/artifacts/companion/__tests__/code-ref-script.test.ts: marking changes no text node', () => {
  const first = text('see ');
  const second = text(' for the entry point');
  const box = el('span');
  for (const n of [first, text('src/a/b.ts:3'), second]) { n.parentNode = box; box.childNodes.push(n); }
  load(el('div', box));
  assert.equal(box.getAttribute('data-insrc-path'), 'src/a/b.ts');
  assert.deepEqual(box.childNodes.map(n => (n as Text_).data), ['see ', 'src/a/b.ts:3', ' for the entry point']);
  assert.equal(box.childNodes[0], first);
  assert.equal(box.childNodes[2], second);
});

test('src/workflow/artifacts/companion/__tests__/code-ref-script.test.ts: a click on a marked box inside the pan/zoom viewport, which captures the pointer, posts the reference', () => {
  const box = el('span', 'run (src/mcp/server.ts:12)');
  const viewport = el('div', el('div', box));
  const page = load(el('body', viewport));
  press(page, box, viewport);
  assert.deepEqual(page.posted.map(p => ({ ...p.msg })), [{ type: 'insrc-open-code-ref', path: 'src/mcp/server.ts', line: 12 }]);
});

test('src/workflow/artifacts/companion/__tests__/code-ref-script.test.ts: a press, a move past the drag threshold and a release posts nothing', () => {
  const box = el('span', 'run (src/mcp/server.ts:12)');
  const viewport = el('div', box);
  const page = load(el('body', viewport));
  page.down(box, 100, 100);
  page.click(viewport, 106, 100);
  assert.deepEqual(page.posted, []);
  page.down(box, 100, 100);
  page.click(viewport, 103, 100);
  assert.equal(page.posted.length, 1, 'a move of 3 pixels is still a click');
  page.posted.length = 0;
  page.click(viewport, 100, 100);
  assert.deepEqual(page.posted, [], 'a click with no recorded press on a marked box does not reuse an old press');
});

test('src/workflow/artifacts/companion/__tests__/code-ref-script.test.ts: a bare file name is not marked', () => {
  const bare = el('span', 'synthesizer.ts:207');
  const dotted = el('span', 'about v1.2/notes and the name synthesizer.ts');
  const page = load(el('div', bare, dotted));
  assert.equal(bare.getAttribute('data-insrc-path'), null);
  assert.equal(dotted.getAttribute('data-insrc-path'), null);
  press(page, bare);
  assert.deepEqual(page.posted, []);
});

test('src/workflow/artifacts/companion/__tests__/code-ref-script.test.ts: an element marked from text that is later replaced loses its mark, so a click on the drawn diagram opens nothing', () => {
  // A Mermaid page is marked once before the diagram is drawn, when its <pre> holds the source.
  const pre = el('pre', 'sequenceDiagram\n  A->>B: call (src/a/b.ts:12)');
  const empty = el('g');
  const page = load(el('body', pre));
  assert.equal(pre.getAttribute('data-insrc-path'), 'src/a/b.ts', 'marked from the source text');
  // The diagram replaces the text with an SVG, and the page marks again.
  pre.childNodes = [];
  empty.parentNode = pre;
  pre.childNodes.push(empty);
  page.rescan();
  assert.equal(pre.getAttribute('data-insrc-path'), null);
  assert.equal(pre.getAttribute('data-insrc-line'), null);
  press(page, empty, pre);
  assert.deepEqual(page.posted, [], 'a click on the empty canvas posts nothing');
});

test('src/workflow/artifacts/companion/__tests__/code-ref-script.test.ts: a click with no press before it, as the keyboard sends, is read at its own target', () => {
  const box = el('span', 'a/b.ts:1');
  const other = el('span', 'c/d.ts:2');
  const page = load(el('div', box, other));
  page.down(other, 100, 100);           // a press that never ended in a click
  page.click(other, 100, 100);          // ...is spent by the click that follows it
  page.posted.length = 0;
  page.down(other, 300, 300);           // a stale press
  page.click(box, 0, 0, 0);             // a keyboard activation: detail 0, no position
  assert.deepEqual(page.posted.map(p => ({ ...p.msg })), [{ type: 'insrc-open-code-ref', path: 'a/b.ts', line: 1 }]);
});

test('src/workflow/artifacts/companion/__tests__/code-ref-script.test.ts: the script stops no event and the posted origin is any, as the frame has an opaque origin', () => {
  assert.ok(!/preventDefault|stopPropagation|stopImmediatePropagation|setPointerCapture|releasePointerCapture/.test(CODE_REF_SCRIPT));
  const box = el('span', 'a/b.ts:1');
  const page = load(el('div', box));
  press(page, box);
  assert.equal(page.posted[0]?.origin, '*');
  assert.ok(!CODE_REF_SCRIPT.includes('</script'));
  assert.ok(!CODE_REF_SCRIPT.includes('`'));
});

// ---------------------------------------------------------------------------
// t4 — the three page shells carry the script
// ---------------------------------------------------------------------------

const HEADER: CompanionHeader = {
  projectName: 'insrc', workItemId: 'E1:S001', sourceDoc: { id: 'LLD-1-S001', href: './LLD.md' },
  date: '2026-10-16 10:00', user: 'U', contextLine: 'ctx',
};
const MERMAID_PAGE: CompanionPageContent = {
  title: 'Calls', kindLabel: 'Sequence', narrative: 'Narrative.',
  visual: { kind: 'mermaid', source: 'sequenceDiagram\n  A->>B: call' },
  description: [{ columns: ['Step', 'Where'], rows: [['1', 'src/a/b.ts:3']] }],
};
const HTML_PAGE: CompanionPageContent = {
  title: 'Mock', kindLabel: 'UX', visual: { kind: 'html', html: '<div>card</div>' },
  description: [{ columns: ['#', 'Element'], rows: [['1', 'Email']] }],
};
const DOC_IR: DocumentIR = {
  docType: 'call-sequence', scopeDescription: 'main', derived: { nodes: [{ id: 'a', label: 'main (src/a.ts:1)', kind: 'frame' }], edges: [] },
  narrated: { sections: [] }, generatedAtRevision: 'rev1',
};
const CLICKABLE = /\[data-insrc-path\]\s*\{\s*cursor:\s*pointer/;
const scriptBodies = (html: string): string[] => [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]!);

test('src/workflow/artifacts/companion/__tests__/code-ref-script.test.ts: the companion page and the docgen page carry the script, after the diagram is drawn', async () => {
  const companion = renderCompanionPage(HEADER, MERMAID_PAGE, { panzoom: '/*PANZOOM*/', mermaid: '/*MERMAID*/' });
  const bodies = scriptBodies(companion);
  assert.equal(bodies.filter(b => b === CODE_REF_SCRIPT).length, 1, 'the companion page carries the script once');
  assert.ok(bodies.findIndex(b => b === CODE_REF_SCRIPT) < bodies.findIndex(b => b.includes('mermaid.run')), 'before the boot script');
  const boot = bodies.find(b => b.includes('mermaid.run'))!;
  assert.ok(boot.indexOf('mermaid.run') < boot.indexOf('window.insrcMarkCodeRefs()'), 'the marking runs after the diagram is drawn');
  assert.match(companion, CLICKABLE);
  // A page with no Mermaid visual marks at load, by the script itself.
  const html = renderCompanionPage(HEADER, HTML_PAGE, { panzoom: '/*PANZOOM*/' });
  assert.equal(scriptBodies(html).filter(b => b === CODE_REF_SCRIPT).length, 1);
  assert.match(html, CLICKABLE);
  assert.match(html, /<h1>Mock<\/h1>/, 'and still renders its header and tables');
  assert.match(html, /<table class="dt">/);

  const out = await assembleShell(DOC_IR);
  assert.ok(isOk(out), 'the docgen page is assembled');
  if (!isOk(out)) return;
  const docBodies = scriptBodies(out.value.html);
  assert.equal(docBodies.filter(b => b === CODE_REF_SCRIPT).length, 1, 'the docgen page carries the script once');
  const init = docBodies.find(b => b.includes('mermaid.run'))!;
  assert.ok(init.indexOf('mermaid.run') < init.indexOf('window.insrcMarkCodeRefs()'), 'marked after the diagram is drawn');
  assert.match(out.value.html, CLICKABLE);
});

test('src/workflow/artifacts/companion/__tests__/code-ref-script.test.ts: the docgen fallback shell carries the script and marks references at load', () => {
  const shell = assembleFallbackShell(DOC_IR, '<svg xmlns="http://www.w3.org/2000/svg"><text>main (src/a.ts:1)</text></svg>', '/* svgPanZoom */', '1.0.0');
  const bodies = scriptBodies(shell.html);
  assert.equal(bodies.filter(b => b === CODE_REF_SCRIPT).length, 1, 'carries the script once');
  assert.match(shell.html, CLICKABLE);
  assert.match(CODE_REF_SCRIPT, /markCodeRefs\(\);\s*\}\)\(\);\s*$/, 'the script marks once on load');
  assert.match(shell.html, /<div id="docgen-diagram">/, 'the diagram is still shown');
});
