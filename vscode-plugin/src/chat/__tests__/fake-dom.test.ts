/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** ISSUE-3b6bd6b5 — the shared fake DOM's own contract, fixed once for every review-pane suite. */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { allOf, bodyStub, fire, textNode } from './fake-dom.js';

test('the shared fake DOM records writes, parses and traps innerHTML, clears children on textContent, and models namespaces, text nodes, parent and sibling links, moves, querying and listeners', () => {
  // Write recording, in order, for every assignment the suites assert on.
  const el = bodyStub('div');
  el.className = 'card';
  el.setAttribute('role', 'note');
  el.textContent = 'hello';
  el.outerHTML = '<b>x</b>';
  assert.deepEqual(el.writes, [
    { prop: 'className', value: 'card' },
    { prop: 'attr:role', value: 'note' },
    { prop: 'textContent', value: 'hello' },
    { prop: 'outerHTML', value: '<b>x</b>' },
  ]);
  assert.equal(el.attrs['role'], 'note');
  assert.equal(el.attrs['class'], undefined, 'className is not reflected into the class attribute (the known divergence)');

  // innerHTML is both recorded and parsed into children, replacing what was there.
  const body = bodyStub('div', 'body');
  body.appendChild(bodyStub('span'));
  body.innerHTML = 'h2\tTitle\np\tprose';
  assert.deepEqual(body.writes.map((w) => w.prop), ['innerHTML']);
  assert.deepEqual(body.children.map((c) => [c.tagName, c.textContent]), [['h2', 'Title'], ['p', 'prose']]);
  assert.ok(body.children.every((c) => c.parentNode === body));

  // textContent clears the children, as in the real DOM.
  body.textContent = 'plain';
  assert.equal(body.children.length, 0);
  assert.equal(body.innerHTML, '');

  // Namespaces and text nodes.
  const svg = bodyStub('rect', '', '', 'http://www.w3.org/2000/svg');
  assert.equal(svg.ns, 'http://www.w3.org/2000/svg');
  assert.equal(bodyStub('div').ns, null);
  assert.equal(svg.tag, 'rect');
  const t = textNode('words');
  assert.equal(t.nodeType, 3);
  assert.equal(t.data, 'words');

  // Parent and sibling links, insertBefore, removeChild's presence check.
  const list = bodyStub('ul');
  const a = list.appendChild(bodyStub('li', 'a'));
  const c = list.appendChild(bodyStub('li', 'c'));
  const b = list.insertBefore(bodyStub('li', 'b'), c);
  assert.deepEqual(list.children.map((x) => x.id), ['a', 'b', 'c']);
  assert.equal(a.nextSibling, b);
  assert.equal(c.nextSibling, null);
  assert.equal(list.firstChild, a);
  assert.equal(b.parentNode, list);
  list.removeChild(b);
  assert.deepEqual(list.children.map((x) => x.id), ['a', 'c']);
  assert.equal(b.parentNode, null, 'a removed node has no parent');
  assert.throws(() => list.removeChild(bodyStub('li')), /not a child/);

  // Inserting a node that already has a parent moves it, within a parent or across.
  list.insertBefore(c, a);
  assert.deepEqual(list.children.map((x) => x.id), ['c', 'a']);
  const other = bodyStub('ol');
  other.appendChild(a);
  assert.deepEqual(list.children.map((x) => x.id), ['c'], 'a node has one parent');
  assert.equal(a.parentNode, other);
  assert.deepEqual(allOf(list).map((x) => x.tagName), ['ul', 'li'], 'and a walk finds it once');

  // Querying: '#id' through the tree, a SyntaxError on a digit-leading id, and tags.
  const root = bodyStub('div');
  const section = root.appendChild(bodyStub('section'));
  const deep = section.appendChild(bodyStub('h2', 'deep-one'));
  section.appendChild(textNode('between'));
  section.appendChild(bodyStub('h3'));
  assert.equal(root.querySelector('#deep-one'), deep);
  assert.equal(root.querySelector('#missing'), null);
  assert.equal(root.querySelector('.class-selectors-are-unsupported'), null);
  assert.throws(() => root.querySelector('#2-contract-details'), (err: Error) => err.name === 'SyntaxError');
  assert.deepEqual(root.querySelectorAll('h2, h3').map((x) => x.tagName), ['h2', 'h3']);

  // Listeners are arrays per type; scrollIntoView is recorded.
  const btn = bodyStub('button');
  const calls: string[] = [];
  btn.addEventListener('click', () => calls.push('one'));
  btn.addEventListener('click', () => calls.push('two'));
  fire(btn, 'click');
  assert.deepEqual(calls, ['one', 'two']);
  btn.scrollIntoView();
  assert.equal(btn.scrolled, true);
});

test('allOf walks pre-order, root first, and skips text nodes', () => {
  const root = bodyStub('div', 'root');
  const a = root.appendChild(bodyStub('section', 'a'));
  a.appendChild(bodyStub('h2', 'a1'));
  a.appendChild(textNode('skipped'));
  a.appendChild(bodyStub('p', 'a2'));
  const b = root.appendChild(bodyStub('section', 'b'));
  b.appendChild(bodyStub('p', 'b1'));
  assert.deepEqual(allOf(root).map((n) => n.id), ['root', 'a', 'a1', 'a2', 'b', 'b1']);
  assert.deepEqual(allOf(textNode('alone')), []);
});
