/**
 * Epic 00d80121c593053c Story S001 t1: the generated highlighter module (webview-hljs.ts).
 *
 *   npx tsx --test src/chat/__tests__/webview-hljs.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { HLJS_SRC } from '../webview-hljs.js';

interface Hljs {
  highlight(code: string, opts: { language: string }): { value: string };
  getLanguage(name: string): unknown;
}
const load = (): Hljs => {
  const ctx: Record<string, unknown> = {};
  runInNewContext(HLJS_SRC, ctx);
  return ctx['hljs'] as Hljs;
};

test('evaluating the highlighter module highlights TypeScript, JSON and Python text as span markup', () => {
  const hljs = load();
  const ts = hljs.highlight('const x: number = 1; // note', { language: 'typescript' }).value;
  assert.match(ts, /<span class="hljs-keyword">const<\/span>/);
  assert.match(ts, /<span class="hljs-comment">\/\/ note<\/span>/);
  const json = hljs.highlight('{"a": "b", "n": 3}', { language: 'json' }).value;
  assert.match(json, /<span class="hljs-attr">&quot;a&quot;<\/span>/);
  assert.match(json, /<span class="hljs-number">3<\/span>/);
  const py = hljs.highlight('def f(x):\n    return "s"  # c', { language: 'python' }).value;
  assert.match(py, /<span class="hljs-keyword">def<\/span>/);
  assert.match(py, /<span class="hljs-string">&quot;s&quot;<\/span>/);
  // The rest of the subset is registered.
  for (const l of ['javascript', 'go', 'java', 'scala', 'bash', 'yaml', 'css', 'xml', 'markdown', 'dockerfile', 'makefile']) {
    assert.ok(hljs.getLanguage(l), `${l} is in the subset`);
  }
  assert.equal(hljs.getLanguage('cobol'), undefined, 'a language outside the subset is not');
});

test('the highlighter module holds no script tag and its byte length stays under 250 KB', () => {
  assert.doesNotMatch(HLJS_SRC, /<\/?script/i, 'no script tag text, which would end the page\'s inline script');
  assert.ok(Buffer.byteLength(HLJS_SRC, 'utf8') < 250 * 1024, `HLJS_SRC is ${Buffer.byteLength(HLJS_SRC, 'utf8')} bytes`);
  // The escape keeps the HTML grammar working: an html script tag is still recognised.
  const hljs = load();
  const html = hljs.highlight('<script>var a = 1;</script>', { language: 'xml' }).value;
  assert.match(html, /hljs-tag/);
});
