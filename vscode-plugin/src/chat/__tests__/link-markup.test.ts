/**
 * Epic babd84c6e2fb480a Story S001 t4: the shared link step (link-markup.ts) run over the fake DOM,
 * the way both pages run it, and the chat registry's click wiring.
 *
 *   npx tsx --test src/chat/__tests__/link-markup.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { LINK_MARKUP_SOURCE } from '../link-markup.js';
import { renderRegistryWebviewSource } from '../render-registry.js';
import { bodyStub, textNode, allOf, type BodyStub } from './fake-dom.js';

/** A message from the page's context, copied so it compares by value. */
const plain = <T>(m: T): T => JSON.parse(JSON.stringify(m)) as T;

interface Page {
  guardMd(el: BodyStub): void;
  onLinkClick(e: unknown, post: (m: Record<string, unknown>) => void): void;
}

function page(): Page {
  const context: Record<string, unknown> = {
    document: { createElement: (tag: string) => bodyStub(tag), createTextNode: (t: string) => textNode(t) },
  };
  runInNewContext(LINK_MARKUP_SOURCE, context);
  return context as unknown as Page;
}

const el = (tag: string, ...kids: Array<BodyStub | string>): BodyStub => {
  const n = bodyStub(tag);
  for (const k of kids) n.appendChild(typeof k === 'string' ? textNode(k) : k);
  return n;
};
const link = (href: string, text: string): BodyStub => { const a = el('a', text); a.setAttribute('href', href); return a; };
const anchors = (root: BodyStub): BodyStub[] => allOf(root).filter((n) => n.tagName === 'a');
const shape = (root: BodyStub): string[] => root.children.map((c) => (c.nodeType === 3 ? `t:${c.data}` : `${c.tagName}:${c.textContent}`));

test('a code reference with a line in running text becomes a link carrying its path and line', () => {
  const p = page();
  const root = el('div', el('p', 'see src/foo.ts:42 for more, and package.json, then src/a/b.test.tsx:7-9.'));
  p.guardMd(root);
  const para = root.children[0]!;
  assert.deepEqual(shape(para), ['t:see ', 'a:src/foo.ts:42', 't: for more, and ', 'a:package.json', 't:, then ', 'a:src/a/b.test.tsx:7-9', 't:.']);
  const [first, second, third] = anchors(root);
  assert.deepEqual([first!.attrs['data-path'], first!.attrs['data-line']], ['src/foo.ts', '42']);
  assert.deepEqual([second!.attrs['data-path'], second!.attrs['data-line']], ['package.json', undefined]);
  assert.deepEqual([third!.attrs['data-path'], third!.attrs['data-line']], ['src/a/b.test.tsx', '7']);
  assert.ok(anchors(root).every((a) => a.getAttribute('href') === null), 'a code reference carries no href');
});

test('text inside code and pre and existing anchors is not wrapped', () => {
  const p = page();
  const pre = el('pre', el('code', 'cat src/foo.ts:42'));
  const partial = el('code', 'open src/foo.ts now');
  const existing = link('', 'src/inside.ts:3');
  const root = el('div', pre, el('p', partial, ' and ', existing));
  p.guardMd(root);
  assert.deepEqual(anchors(root).map((a) => a.children[0]?.data), ['src/inside.ts:3'], 'only the author-made anchor is there');
  assert.equal(existing.getAttribute('data-path'), null, 'an existing anchor is not given a code reference');
  assert.equal(pre.children[0]!.parentNode, pre, 'a fenced block is untouched');
  assert.equal(partial.parentNode!.tagName, 'p', 'inline code with more than the path is untouched');
});

test('a version number is not treated as a path', () => {
  const p = page();
  const root = el('div', el('p', 'node 22.22.1, v1.2.3, e.g. this, i.e. that, foo.bar, file.txt.bak and x.ts2'));
  p.guardMd(root);
  assert.deepEqual(anchors(root), []);
  assert.equal(root.children[0]!.children.length, 1, 'the text is left as one node');
});

test('a click on an http link posts open-link and prevents the default', () => {
  const p = page();
  const a = link('https://example.com/x?y=1', 'the docs');
  const inner = el('span', 'in');
  a.appendChild(inner);
  const root = el('div', el('p', a));
  p.guardMd(root);
  for (const target of [a, inner]) {
    const posted: Array<Record<string, unknown>> = [];
    let prevented = 0;
    p.onLinkClick({ target, preventDefault: () => { prevented++; } }, (m) => posted.push(plain(m)));
    assert.deepEqual(posted, [{ type: 'open-link', url: 'https://example.com/x?y=1' }]);
    assert.equal(prevented, 1);
  }
  // Something that is not a link posts nothing and is not prevented.
  const posted: Array<Record<string, unknown>> = [];
  let prevented = 0;
  p.onLinkClick({ target: root.children[0], preventDefault: () => { prevented++; } }, (m) => posted.push(plain(m)));
  assert.deepEqual([posted, prevented], [[], 0]);
});

test('a click on a code reference posts open-code-ref with path and line', () => {
  const p = page();
  const root = el('div', el('p', 'at src/foo.ts:42 and src/bar.ts'));
  p.guardMd(root);
  const [withLine, bare] = anchors(root);
  const clicks = (target: BodyStub): Array<Record<string, unknown>> => {
    const posted: Array<Record<string, unknown>> = [];
    let prevented = 0;
    p.onLinkClick({ target, preventDefault: () => { prevented++; } }, (m) => posted.push(plain(m)));
    assert.equal(prevented, 1, 'the default is prevented');
    return posted;
  };
  assert.deepEqual(clicks(withLine!), [{ type: 'open-code-ref', path: 'src/foo.ts', line: 42 }]);
  assert.deepEqual(clicks(bare!), [{ type: 'open-code-ref', path: 'src/bar.ts' }]);
});

test('guardMd still drops a non-http href', () => {
  const p = page();
  const bad = ['javascript:alert(1)', 'file:///etc/passwd', 'vscode://x/y', './local.md', '#frag', ''].map((h) => link(h, 'x'));
  // A hand-written anchor that arrives carrying our own attributes is cleaned first.
  const forged = link('', 'y');
  forged.setAttribute('data-url', 'javascript:alert(1)');
  forged.setAttribute('data-path', '../../etc/passwd');
  const img = bodyStub('img');
  img.setAttribute('src', 'https://tracker.example/p.png');
  img.setAttribute('srcset', 'a 1x');
  const root = el('div', el('p', ...bad, forged, img));
  p.guardMd(root);
  for (const a of [...bad, forged]) {
    assert.equal(a.getAttribute('href'), null, 'no href survives');
    assert.equal(a.getAttribute('data-url'), null, 'a non-http href leaves no target behind');
    assert.equal(a.getAttribute('data-path'), null);
  }
  assert.equal(img.getAttribute('src'), null);
  assert.equal(img.getAttribute('srcset'), null);
});

test('an http link keeps its target in data-url and has no href, so it cannot open by itself', () => {
  const p = page();
  const a = link('HTTPS://Example.com/a', 'a');
  const b = link('http://example.org', 'b');
  const root = el('div', el('p', a, b));
  p.guardMd(root);
  assert.equal(a.getAttribute('href'), null);
  assert.equal(b.getAttribute('href'), null);
  assert.equal(a.getAttribute('data-url'), 'HTTPS://Example.com/a');
  assert.equal(b.getAttribute('data-url'), 'http://example.org');
  assert.equal(a.getAttribute('target'), null, 'nothing here asks the webview to open a window');
});

test('inline code whose whole text is a code reference becomes a link', () => {
  const p = page();
  const code = el('code', 'src/foo.ts:42');
  code.textContent = 'src/foo.ts:42';
  const para = el('p', 'in ', code, ' only');
  const root = el('div', para);
  p.guardMd(root);
  assert.deepEqual(para.children.map((c) => c.tagName), ['#text', 'a', '#text']);
  const a = para.children[1]!;
  assert.equal(a.tagName, 'a');
  assert.deepEqual([a.attrs['data-path'], a.attrs['data-line']], ['src/foo.ts', '42']);
  assert.equal(a.children[0], code, 'the code element sits inside the link');
});

test('the chat registry hands a clicked link to the open-link sink', () => {
  const listeners: Array<(e: unknown) => void> = [];
  const document = {
    createElement: (tag: string) => bodyStub(tag),
    createTextNode: (t: string) => textNode(t),
    addEventListener: (type: string, l: (e: unknown) => void) => { if (type === 'click') listeners.push(l); },
  };
  const reg = runInNewContext(`(${renderRegistryWebviewSource()})`, { document: undefined, marked: undefined }) as (d: unknown, line: unknown) => { onLinkOpen(cb: (m: unknown) => void): void };
  const registry = reg(document, () => undefined);
  const got: unknown[] = [];
  registry.onLinkOpen((m) => got.push(plain(m)));
  assert.equal(listeners.length, 1, 'one delegated click handler');
  const a = bodyStub('a');
  a.setAttribute('data-path', 'src/foo.ts');
  a.setAttribute('data-line', '3');
  let prevented = false;
  listeners[0]!({ target: a, preventDefault: () => { prevented = true; } });
  assert.deepEqual(got, [{ type: 'open-code-ref', path: 'src/foo.ts', line: 3 }]);
  assert.ok(prevented);
});

// ---- t5: the review pane --------------------------------------------------------------------

test('the review pane renderer source, run against a stub DOM, links a code reference, strips the href of an http link, and posts open-code-ref and open-link on click', async () => {
  const { DOCS_BODY_RENDERER_SOURCE } = await import('../docs-review-panel.js');
  const context: Record<string, unknown> = {
    document: { createElement: (tag: string) => bodyStub(tag), createTextNode: (t: string) => textNode(t) },
    marked: { parse: (s: string) => s },
  };
  runInNewContext(DOCS_BODY_RENDERER_SOURCE, context);
  const renderMarkdownBody = context['renderMarkdownBody'] as (el: BodyStub, src: string) => { degradation: { degraded: boolean } };
  const onLinkClick = context['onLinkClick'] as Page['onLinkClick'];

  // The rendered body: what marked would have produced, in place (the stub's innerHTML does not parse markup).
  const body = bodyStub('div');
  Object.defineProperty(body, 'innerHTML', { get: () => '', set: () => {} });
  const docs = link('https://example.com/docs', 'the docs');
  const relative = link('./local.md', 'local');
  body.appendChild(el('p', 'see src/foo.ts:42, ', docs, ' and ', relative));
  const out = renderMarkdownBody(body, 'ignored');
  assert.equal(out.degradation.degraded, false);

  const [code, http, relativeLink] = anchors(body);
  assert.deepEqual([code!.attrs['data-path'], code!.attrs['data-line'], code!.getAttribute('href')], ['src/foo.ts', '42', null], 'the code reference is a link');
  assert.deepEqual([http!.getAttribute('href'), http!.getAttribute('data-url')], [null, 'https://example.com/docs'], 'an http link has no href and keeps its target');
  assert.deepEqual([relativeLink!.getAttribute('href'), relativeLink!.getAttribute('data-url'), relativeLink!.getAttribute('data-path')], [null, null, null], 'a relative link is dropped as before');

  const posted: Array<Record<string, unknown>> = [];
  let prevented = 0;
  for (const target of [code!, http!]) onLinkClick({ target, preventDefault: () => { prevented++; } }, (m) => posted.push(plain(m)));
  assert.deepEqual(posted, [{ type: 'open-code-ref', path: 'src/foo.ts', line: 42 }, { type: 'open-link', url: 'https://example.com/docs' }]);
  assert.equal(prevented, 2);
});

test('the chat page and the review pane both include the linkify and click wiring', async () => {
  const { createChatPanelHost } = await import('../chat-panel.js');
  const { createDocsReviewHost } = await import('../docs-review-panel.js');
  const { createInMemoryChatSessionStore } = await import('../session-store.js');
  const channelFor = (set: (h: string) => void) => ({ setHtml: set, postMessage: () => {}, onMessage: () => {}, onDidDispose: () => {}, reveal: () => {}, dispose: () => {} });

  let chatHtml = '';
  createChatPanelHost({
    createPanel: () => channelFor((h) => { chatHtml = h; }),
    providers: { available: [], get() { throw new Error('unused'); } },
    store: createInMemoryChatSessionStore(),
    cwd: () => '/repo',
  }).open();
  let reviewHtml = '';
  createDocsReviewHost({
    createPanel: () => channelFor((h) => { reviewHtml = h; }),
    client: { async pending() { return []; }, async content() { throw new Error('unused'); }, async decide() { throw new Error('unused'); } },
  }).open();

  const count = (haystack: string, needle: string): number => haystack.split(needle).length - 1;
  for (const [name, html] of [['chat', chatHtml], ['review', reviewHtml]] as const) {
    assert.equal(count(html, LINK_MARKUP_SOURCE), 1, `${name}: the shared link source is inlined exactly once`);
    for (const fn of ['function guardMd(', 'function linkifyMd(', 'function onLinkClick(']) {
      assert.equal(count(html, fn), 1, `${name}: ${fn} is defined once`);
    }
    assert.match(html, /\.insrc-md a\[data-url\]/, `${name}: handled links have a pointer`);
  }
  // Each page hands the click to the host over its own channel.
  assert.match(chatHtml, /document\.addEventListener\('click',function\(e\)\{onLinkClick\(e,function\(p\)\{if\(LDEC\)LDEC\(p\);\}\);\}\);/);
  assert.match(chatHtml, /reg\.onLinkOpen\(function\(p\)\{vs\.postMessage\(\{v:1,payload:p\}\);\}\);/);
  assert.match(reviewHtml, /document\.addEventListener\('click',function\(e\)\{onLinkClick\(e,function\(p\)\{vs\.postMessage\(\{v:1,payload:p\}\);\}\);\}\);/);
  assert.equal(count(reviewHtml, "document.addEventListener('click'"), 1, 'review: one delegated click handler');
});
