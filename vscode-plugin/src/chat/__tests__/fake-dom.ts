/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The one fake DOM the review pane's renderer tests run against (ISSUE-3b6bd6b5).
 * Every suite builds its nodes here, so a renderer cannot pass against a laxer fake
 * of its own while the real DOM behaves differently.
 *
 * What it models, because some test relies on each:
 * - every textContent, className, setAttribute ('attr:<k>'), innerHTML and outerHTML
 *   assignment, recorded in order on `writes`;
 * - innerHTML assignment REPLACES the children by parsing the harness's 'TAG\ttext'
 *   lines (and is recorded, so a suite can assert a renderer never assigned markup);
 *   textContent assignment clears the children, as in the real DOM;
 * - the namespace an element was created in (`ns`), and text nodes (nodeType 3);
 * - parent and sibling links, appendChild/insertBefore/removeChild (insertion
 *   moves a node that already has a parent; removeChild asserts the child is
 *   present and clears its parent), querySelector('#id') — which throws a SyntaxError
 *   on a digit-leading id, as the real DOM does — and querySelectorAll by tag;
 * - listeners as arrays per type, and scrollIntoView.
 *
 * The one known divergence from the real DOM: className is NOT reflected into
 * attrs['class'] (or back). The diagram tests read attrs['class'] and the parity
 * snapshots serialize both separately, as every earlier fake did.
 *
 * Not a .test.ts file, so the plugin's test glob never runs it.
 */

import assert from 'node:assert/strict';

export interface Write { readonly prop: string; readonly value: unknown }

export interface BodyStub {
  /** 1 for elements, 3 for text nodes. */
  readonly nodeType: 1 | 3;
  tagName: string;
  /** The same as tagName, for the suites that read `tag`. */
  readonly tag: string;
  /** The namespace from createElementNS; null for createElement. */
  readonly ns: string | null;
  /** A text node's text; '' for elements. */
  data: string;
  id: string;
  value: string;
  textContent: string;
  className: string;
  innerHTML: string;
  outerHTML: string;
  style: Record<string, string>;
  attrs: Record<string, string>;
  children: BodyStub[];
  parentNode: BodyStub | null;
  readonly nextSibling: BodyStub | null;
  readonly firstChild: BodyStub | null;
  listeners: Record<string, Array<(e?: unknown) => void>>;
  writes: Write[];
  scrolled: boolean;
  appendChild(c: BodyStub): BodyStub;
  insertBefore(c: BodyStub, ref: BodyStub | null): BodyStub;
  removeChild(c: BodyStub): BodyStub;
  setAttribute(k: string, v: unknown): void;
  addEventListener(type: string, l: (e?: unknown) => void): void;
  scrollIntoView(): void;
  querySelector(sel: string): BodyStub | null;
  querySelectorAll(sel: string): BodyStub[];
}

/** One element. ns is the namespace createElementNS passes; createElement leaves it null. */
export function bodyStub(tagName: string, id = '', text = '', ns: string | null = null): BodyStub {
  return makeNode(1, tagName, id, text, ns);
}

/** A text node, as document.createTextNode makes. */
export function textNode(data: string): BodyStub {
  const n = makeNode(3, '#text', '', data, null);
  n.data = data;
  return n;
}

/** Every element in the tree in pre-order, root first, skipping text nodes. */
export function allOf(n: BodyStub): BodyStub[] {
  return n.nodeType === 3 ? [] : [n, ...n.children.flatMap(allOf)];
}

/** Run every listener registered for a type, as dispatching the event would. */
export function fire(el: BodyStub, type: string, e?: unknown): void {
  for (const l of el.listeners[type] ?? []) l(e);
}

function makeNode(nodeType: 1 | 3, tagName: string, id: string, text: string, ns: string | null): BodyStub {
  const children: BodyStub[] = [];
  const writes: Write[] = [];
  let html = '';
  let txt = text;
  let cls = '';
  // Inserting a node that already has a parent MOVES it, as in the real DOM.
  const adopt = (c: BodyStub): BodyStub => {
    const from = c.parentNode;
    if (from) { const i = from.children.indexOf(c); if (i >= 0) from.children.splice(i, 1); }
    c.parentNode = n;
    return c;
  };
  const n: BodyStub = {
    nodeType, tagName, ns, id, data: '', value: '', style: {}, attrs: {}, children, writes,
    listeners: {}, scrolled: false, parentNode: null,
    get tag() { return n.tagName; },
    get className() { return cls; },
    set className(v: string) { cls = v; writes.push({ prop: 'className', value: v }); },
    get textContent() { return txt; },
    set textContent(v: string) {
      writes.push({ prop: 'textContent', value: v });
      txt = v; html = ''; children.length = 0;
    },
    get innerHTML() { return html; },
    set innerHTML(v: string) {
      writes.push({ prop: 'innerHTML', value: v });
      html = v;
      children.length = 0;
      for (const line of String(v).split('\n')) {
        const i = line.indexOf('\t');
        if (i > 0) children.push(adopt(bodyStub(line.slice(0, i), '', line.slice(i + 1))));
      }
    },
    get outerHTML() { return ''; },
    set outerHTML(v: string) { writes.push({ prop: 'outerHTML', value: v }); },
    get firstChild() { return children[0] ?? null; },
    get nextSibling() {
      const p = n.parentNode;
      if (!p) return null;
      const i = p.children.indexOf(n);
      return i >= 0 ? (p.children[i + 1] ?? null) : null;
    },
    appendChild(c) { children.push(adopt(c)); return c; },
    insertBefore(c, ref) {
      adopt(c); // first, so a move within this parent cannot shift ref's index
      const i = ref === null ? children.length : children.indexOf(ref);
      children.splice(i < 0 ? children.length : i, 0, c);
      return c;
    },
    removeChild(c) {
      const i = children.indexOf(c);
      assert.ok(i >= 0, 'removeChild was called with a node that is not a child');
      children.splice(i, 1);
      c.parentNode = null;
      return c;
    },
    setAttribute(k, v) { n.attrs[k] = String(v); writes.push({ prop: `attr:${k}`, value: v }); },
    addEventListener(type, l) { (n.listeners[type] ??= []).push(l); },
    scrollIntoView() { n.scrolled = true; },
    querySelectorAll(sel) {
      const want = new Set(sel.split(',').map((t) => t.trim().toLowerCase()));
      const walk = (x: BodyStub): BodyStub[] =>
        x.children.flatMap((c) => [...(c.nodeType === 1 && want.has(c.tagName.toLowerCase()) ? [c] : []), ...walk(c)]);
      return walk(n);
    },
    // Only `#id` is supported; anything else returns null rather than guessing, so an
    // unsupported selector shows up as a failing anchor. It throws where a real browser
    // throws: a bare CSS identifier may not begin with a digit.
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
  };
  return n;
}
