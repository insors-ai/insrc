/**
 * Epic 00d80121c593053c Story S001 t3: the language map and the span-markup scanner (diff-highlight.ts),
 * run on the page source.
 *
 *   npx tsx --test src/chat/__tests__/diff-highlight.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { DIFF_HIGHLIGHT_SOURCE } from '../diff-highlight.js';

type Run = { text: string; cls?: string };
interface Page {
  diffLang(path: string): string | undefined;
  hljsRuns(html: string): Run[][] | undefined;
}
const page = (): Page => {
  const ctx: Record<string, unknown> = {};
  runInNewContext(DIFF_HIGHLIGHT_SOURCE, ctx);
  return ctx as unknown as Page;
};
/** A value from the page's context, copied so it compares by value. */
const plain = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

test('the extension is matched without regard to case and a Dockerfile has a language', () => {
  const p = page();
  assert.equal(p.diffLang('src/a/b.ts'), 'typescript');
  assert.equal(p.diffLang('SRC/A.TS'), 'typescript');
  assert.equal(p.diffLang('x.TSX'), 'typescript');
  assert.equal(p.diffLang('x.mjs'), 'javascript');
  assert.equal(p.diffLang('conf/app.Yml'), 'yaml');
  assert.equal(p.diffLang('page.HTML'), 'xml');
  assert.equal(p.diffLang('README.md'), 'markdown');
  assert.equal(p.diffLang('deploy/Dockerfile'), 'dockerfile');
  assert.equal(p.diffLang('deploy/Dockerfile.dev'), 'dockerfile');
  assert.equal(p.diffLang('Makefile'), 'makefile');
  assert.equal(p.diffLang('a/GNUmakefile'), 'makefile');
  // Anything else has none; nothing is guessed from the content.
  for (const none of ['LICENSE', 'a.unknownext', 'noext', '', 'archive.tar.gz', '.gitignore', 'dir.ts/readme']) {
    assert.equal(p.diffLang(none), undefined, none);
  }
  assert.equal(p.diffLang(undefined as unknown as string), undefined);
  assert.equal(p.diffLang('toString'), undefined, 'a name that is an Object property is not a language');
});

test('nested spans and a span that crosses a newline are flattened per line with the innermost class', () => {
  const p = page();
  const nested = plain(p.hljsRuns('<span class="hljs-string">`a <span class="hljs-subst">${x}</span> b`</span>'));
  assert.deepEqual(nested, [[{ text: '`a ', cls: 'hljs-string' }, { text: '${x}', cls: 'hljs-subst' }, { text: ' b`', cls: 'hljs-string' }]]);
  const across = plain(p.hljsRuns('x <span class="hljs-comment">/* one\ntwo\nthree */</span> y'));
  assert.deepEqual(across, [
    [{ text: 'x ' }, { text: '/* one', cls: 'hljs-comment' }],
    [{ text: 'two', cls: 'hljs-comment' }],
    [{ text: 'three */', cls: 'hljs-comment' }, { text: ' y' }],
  ], 'the open span carries to the next lines and closes on the last');
  // Entities are decoded, and adjacent text of one class is one run.
  assert.deepEqual(plain(p.hljsRuns('a &lt; b &amp;&amp; c &gt; &quot;d&quot; &#x27;e&#x27;')), [[{ text: `a < b && c > "d" 'e'` }]]);
  // An empty line is an empty run list; nothing in, one empty line out.
  assert.deepEqual(plain(p.hljsRuns('a\n\nb')), [[{ text: 'a' }], [], [{ text: 'b' }]]);
  assert.deepEqual(plain(p.hljsRuns('')), [[]]);
});

test('the scanner accepts a multi-class span such as hljs-title function_ and uses its first hljs class', () => {
  const p = page();
  assert.deepEqual(plain(p.hljsRuns('<span class="hljs-title function_">go</span>()')), [[{ text: 'go', cls: 'hljs-title' }, { text: '()' }]]);
  assert.deepEqual(plain(p.hljsRuns('<span class="function_ hljs-title">go</span>')), [[{ text: 'go', cls: 'hljs-title' }]], 'the first hljs class, wherever it sits');
  assert.deepEqual(plain(p.hljsRuns('<span class="hljs-built_in">len</span>')), [[{ text: 'len', cls: 'hljs-built_in' }]]);
});

test('a span with no hljs- class is read as classless text and does not reject the section', () => {
  const p = page();
  assert.deepEqual(plain(p.hljsRuns('<span class="language-xml">a</span> b')), [[{ text: 'a b' }]], 'a wrapper around plain text adds no class and the runs merge');
  assert.deepEqual(
    plain(p.hljsRuns('<span class="hljs-string">q <span class="language-xml">inner</span> r</span>')),
    [[{ text: 'q inner r', cls: 'hljs-string' }]],
    'inside a classed span it takes that span\'s class',
  );
});

test('highlighter output that is not plain spans and text falls back to plain text', () => {
  const p = page();
  for (const bad of [
    '<b>bold</b>',
    '<span class="hljs-x" onclick="e()">a</span>',
    '<span>no class</span>',
    '<script>x</script>',
    '<img src=x>',
    'a < b',
    'a & b',
    '&nbsp;',
    '&#60;',
    '<span class="hljs-x">unclosed',
    'stray </span>',
    '<span class="a<b">x</span>',
  ]) {
    assert.equal(p.hljsRuns(bad), undefined, bad);
  }
});
