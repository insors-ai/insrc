/**
 * Epic 00d80121c593053c Story S001 t4: the diff widget with syntax highlighting, built by the registry's
 * page script over the shared fake DOM with the real highlighter evaluated beside it.
 *
 *   npx tsx --test src/chat/__tests__/diff-tokens.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { renderRegistryWebviewSource } from '../render-registry.js';
import { HLJS_SRC } from '../webview-hljs.js';
import { allOf, bodyStub, fire, textNode, textOf, type BodyStub } from './fake-dom.js';

interface Registry { renderRow(vm: unknown): BodyStub | null }

/** The registry over the fake DOM; `withHljs` evaluates the real highlighter in the same context first. */
function registry(opts: { withHljs?: boolean; hljs?: unknown } = {}): Registry {
  const ctx: Record<string, unknown> = {
    document: { createElement: (tag: string) => bodyStub(tag), createTextNode: (t: string) => textNode(t), addEventListener: () => {} },
  };
  if (opts.hljs !== undefined) ctx['hljs'] = opts.hljs;
  else if (opts.withHljs !== false) runInNewContext(HLJS_SRC, ctx);
  const make = runInNewContext(`(${renderRegistryWebviewSource()})`, ctx) as (d: unknown, line: unknown) => Registry;
  return make(ctx['document'], () => bodyStub('div'));
}

interface Row { path: string; oldStart: number; newStart: number; lines: string[]; added?: number; removed?: number }
const diffRow = (row: Row): BodyStub => {
  const box = registry().renderRow({ kind: 'diff', meta: { added: 0, removed: 0, ...row } });
  assert.ok(box, 'the widget is built');
  return box;
};
const render = (reg: Registry, row: Row): BodyStub => reg.renderRow({ kind: 'diff', meta: { added: 0, removed: 0, ...row } })!;
const byClass = (root: BodyStub, cls: string): BodyStub[] => allOf(root).filter((e) => e.className.split(' ').includes(cls));
const textSpans = (root: BodyStub): BodyStub[] => byClass(root, 'insrc-diffw__text');
/** The runs of a text span: its children as [text, class | undefined]. */
const runsOf = (span: BodyStub): Array<[string, string | undefined]> =>
  span.children.map((c) => (c.nodeType === 3 ? [c.data, undefined] : [textOf(c), c.className]));

test('a TypeScript diff line is split into keyword, string and comment tokens carrying their classes', () => {
  const box = diffRow({ path: 'src/a.ts', oldStart: 1, newStart: 1, lines: ["+const s = 'hi'; // note"] });
  const [span] = textSpans(box);
  const runs = runsOf(span!);
  assert.deepEqual(runs.find(([t]) => t === 'const'), ['const', 'hljs-keyword']);
  assert.deepEqual(runs.find(([t]) => t === "'hi'"), ["'hi'", 'hljs-string']);
  assert.deepEqual(runs.find(([t]) => t.startsWith('// note')), ['// note', 'hljs-comment']);
  assert.equal(textOf(span!), "const s = 'hi'; // note", 'the text is exactly the line without its sign');
});

test('a block comment opened on a context line colours an added line as comment', () => {
  const box = diffRow({
    path: 'src/a.ts', oldStart: 1, newStart: 1,
    lines: [' /* a comment that', '+   goes on here', ' */ const x = 1;'],
  });
  const spans = textSpans(box);
  assert.deepEqual(runsOf(spans[1]!), [['   goes on here', 'hljs-comment']], 'the added line sits inside the comment');
  const last = runsOf(spans[2]!);
  assert.deepEqual(last[0], ['*/', 'hljs-comment'], 'and the comment closes on the next line');
  assert.deepEqual(last.find(([t]) => t === 'const'), ['const', 'hljs-keyword']);
});

test('a removed line and an added line are each tokenised from their own side', () => {
  // The removed side opens a block comment that the added side does not: the same context line after
  // them is a comment on one side and code on the other.
  const box = diffRow({
    path: 'src/a.ts', oldStart: 1, newStart: 1,
    lines: ['-/* old start', '+const y = 2;', ' const z = 3;'],
  });
  const spans = textSpans(box);
  assert.deepEqual(runsOf(spans[0]!), [['/* old start', 'hljs-comment']], 'the removed line is a comment on the old side');
  assert.deepEqual(runsOf(spans[1]!).find(([t]) => t === 'const'), ['const', 'hljs-keyword'], 'the added line is code on the new side');
  assert.deepEqual(runsOf(spans[2]!).find(([t]) => t === 'const'), ['const', 'hljs-keyword'], 'a context line takes the new side, so it is code and not swallowed by the old comment');
});

test('an unknown extension and a failing highlighter leave every line as plain text', () => {
  const lines = ['+const a = 1;', '-const b = 2;', ' keep', '\\ No newline at end of file'];
  const plainCheck = (box: BodyStub, why: string): void => {
    const spans = textSpans(box);
    assert.deepEqual(spans.map((s) => textOf(s)), ['const a = 1;', 'const b = 2;', 'keep', '\\ No newline at end of file'], why);
    for (const s of spans) assert.equal(s.children.length, 0, `${why}: the text is the span's own text`);
  };
  plainCheck(render(registry(), { path: 'notes.unknownext', oldStart: 1, newStart: 1, lines }), 'an unknown extension');
  plainCheck(render(registry({ withHljs: false }), { path: 'src/a.ts', oldStart: 1, newStart: 1, lines }), 'no highlighter in the page');
  plainCheck(render(registry({ hljs: { highlight: () => { throw new Error('boom'); } } }), { path: 'src/a.ts', oldStart: 1, newStart: 1, lines }), 'a highlighter that throws');
  plainCheck(render(registry({ hljs: { highlight: () => ({ value: '<b>x</b>' }) } }), { path: 'src/a.ts', oldStart: 1, newStart: 1, lines }), 'highlighter output the scanner refuses');
  plainCheck(render(registry({ hljs: { highlight: () => ({ value: 'one line only' }) } }), { path: 'src/a.ts', oldStart: 1, newStart: 1, lines }), 'a line count that does not match');
  // A note line is never tokenised even when the rest is.
  const mixed = render(registry(), { path: 'src/a.ts', oldStart: 1, newStart: 1, lines: ['+const a = 1;', '\\ No newline at end of file'] });
  assert.equal(textSpans(mixed)[1]!.children.length, 0);
  assert.equal(textOf(textSpans(mixed)[1]!), '\\ No newline at end of file');
});

test("a diff line's text span holds no assigned markup", () => {
  const box = diffRow({ path: 'src/a.ts', oldStart: 1, newStart: 1, lines: ['+const t = "<b>x</b> & y";', '-let u = 1; // <script>'] });
  for (const e of allOf(box)) {
    assert.ok(!e.writes.some((w) => w.prop === 'innerHTML' || w.prop === 'outerHTML'), `${e.tagName} was never given markup`);
  }
  const [a, d] = textSpans(box);
  assert.equal(textOf(a!), 'const t = "<b>x</b> & y";', 'markup characters in the code stay text');
  assert.equal(textOf(d!), 'let u = 1; // <script>');
  // Only text nodes and class-named spans sit under a text span.
  for (const s of [a!, d!]) {
    for (const c of s.children) assert.ok(c.nodeType === 3 || (c.tagName === 'span' && /^hljs-/.test(c.className)), 'a text node or an hljs span');
  }
});

test('the diff widget keeps its signs, line numbers, add and del classes and collapse behaviour with highlighting on', () => {
  const lines = ['-old1', '+new1', ' ctx', '+n2', '+n3', '+n4', '+n5', '+n6', '+n7', '+n8', '+n9'].map((l) => l.replace(/^(.)/, '$1' + 'const q = '));
  const box = diffRow({ path: 'src/a.ts', oldStart: 5, newStart: 7, lines, added: 9, removed: 1 });
  const rows = byClass(box, 'insrc-diffw__line');
  assert.equal(rows.length, lines.length);
  assert.deepEqual(rows.slice(0, 3).map((r) => r.className), [
    'insrc-diffw__line insrc-diffw__line--del',
    'insrc-diffw__line insrc-diffw__line--add',
    'insrc-diffw__line insrc-diffw__line--ctx',
  ]);
  // Signs and numbers are as they were: the old number on a removed line, the new on the rest.
  const signs = byClass(box, 'insrc-diffw__sign').map((s) => s.textContent);
  assert.deepEqual(signs.slice(0, 3), ['−', '+', '']);
  const nums = byClass(box, 'insrc-diffw__num').map((s) => s.textContent);
  assert.deepEqual(nums.slice(0, 4), ['5', '7', '8', '9']);
  assert.ok(textSpans(box)[0]!.children.length > 0, 'and the text is highlighted');
  // Collapse: lines past the limit start hidden, the header and the button open and close them.
  const hiddenCount = (): number => rows.filter((r) => r.className.includes('insrc-diffw__line--more')).length;
  assert.equal(hiddenCount(), lines.length - 8);
  assert.ok(!box.className.includes('insrc-diffw--open'));
  const head = byClass(box, 'insrc-diffw__head')[0]!;
  fire(head, 'click');
  assert.ok(box.className.includes('insrc-diffw--open'), 'the header opens the rest');
  fire(head, 'click');
  assert.ok(!box.className.includes('insrc-diffw--open'), 'and closes it again');
  const more = byClass(box, 'insrc-diffw__more')[0]!;
  assert.match(more.textContent, /show 3 more lines/);
});
