import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { runInProcessGroup } from '../../../../src/shared/process-group.js';
import { checkScratchMarkdown, checkScratchMarkdownEdit, inspectScratchSyntax, scratchSourceCodec } from '../scratch-markdown.js';
import { SCRATCH_NOTE_BYTES } from '../scratch-editor-protocol.js';
import { supportedScratchMarkdown, unsupportedScratchMarkdown } from './fixtures/scratch-markdown-corpus.js';

test('scratch Markdown host and browser modules pass their production TypeScript configurations', async () => {
  const compiler = createRequire(import.meta.url).resolve('typescript/bin/tsc');
  for (const name of ['tsconfig.json', 'tsconfig.webview.json']) {
    const result = await runInProcessGroup(process.execPath, [compiler, '-p', fileURLToPath(new URL(`../../../${name}`, import.meta.url)), '--noEmit'], { timeoutMs: 120_000 });
    assert.equal(result.timedOut, false);
    assert.equal(result.exitCode, 0, result.stdout + result.stderr);
  }
});

test('scratch Markdown refuses structural or raw syntax loss and keeps both source and draft', () => {
  const identity = { parse: (s: string) => s, serialize: (s: string) => s, equivalent: (a: string, b: string) => a === b };
  for (const source of unsupportedScratchMarkdown) {
    const result = checkScratchMarkdownEdit(source, '# Lost metadata\n', identity);
    assert.equal(result.allowed, false, source);
    assert.equal(result.source, source);
    assert.equal(result.draft, '# Lost metadata\n');
  }
  const code = '```mermaid\ngraph TD\nA --> B\n```\n';
  const lossy = { ...identity, parse: (_: string) => 'same document', serialize: (_: string) => '# Code dropped\n' };
  assert.equal(checkScratchMarkdown(code, lossy).allowed, false, 'raw fingerprints catch loss even when codec claims equal');
  assert.equal(checkScratchMarkdown('# Before\n', { ...identity, serialize: () => '# Different\n' }).allowed, false);
  assert.equal(checkScratchMarkdown('# Throws\n', { ...identity, parse: () => { throw new Error('unsupported'); } }).allowed, false);
  assert.equal(checkScratchMarkdown('x'.repeat(SCRATCH_NOTE_BYTES + 1), identity).allowed, false);
  assert.equal(inspectScratchSyntax('```txt\n[[literal code]]\n```\n').unsupported.length, 0, 'literal code is not mistaken for custom Markdown');
});

test('scratch Markdown host grammar independently admits supported edits and refuses unsupported base laundering', () => {
  for (const source of supportedScratchMarkdown) {
    assert.equal(checkScratchMarkdown(source, scratchSourceCodec).allowed, true, source);
    assert.equal(checkScratchMarkdownEdit(source, source + '\nAdded text.\n', scratchSourceCodec).allowed, true, source);
  }
  for (const source of unsupportedScratchMarkdown) {
    const result = checkScratchMarkdownEdit(source, '# Removed unknown content\n', scratchSourceCodec);
    assert.equal(result.allowed, false, source);
    assert.equal(result.source, source);
    assert.equal(result.draft, '# Removed unknown content\n');
  }
});

test('scratch Markdown corpus uses real Milkdown in Chrome and preserves source on open, lock and selection', async () => {
  const chrome = process.env['INSRC_CHROME_BIN'] ?? ['/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(existsSync);
  assert.ok(chrome, 'Required browser qualification needs Chrome; missing coverage must not be skipped-success.');
  const dir = mkdtempSync(join(tmpdir(), 'insrc-markdown-corpus-'));
  try {
    const sources = [...supportedScratchMarkdown, ...unsupportedScratchMarkdown];
    sources.forEach((source, i) => writeFileSync(join(dir, `note-${i}.md`), source));
    await build({ entryPoints: [fileURLToPath(new URL('./fixtures/scratch-markdown-browser.ts', import.meta.url))], outfile: join(dir, 'corpus.js'), bundle: true, platform: 'browser', format: 'iife', target: 'chrome120', loader: { '.woff': 'file', '.woff2': 'file', '.ttf': 'file' }, logLevel: 'silent' });
    writeFileSync(join(dir, 'index.html'), '<!doctype html><meta charset="utf-8"><script defer src="./corpus.js"></script>');
    const result = await runInProcessGroup(chrome, ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-background-networking', '--no-first-run', `--user-data-dir=${join(dir, 'profile')}`, '--virtual-time-budget=8000', '--dump-dom', new URL(`file://${join(dir, 'index.html')}`).href], { timeoutMs: 60_000 });
    assert.equal(result.timedOut, false);
    assert.equal(result.exitCode, 0, result.stderr);
    const match = result.stdout.match(/<pre id="scratch-result">([\s\S]*?)<\/pre>/);
    assert.ok(match, result.stdout.slice(-3000));
    const decoded = match[1]!.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
    const data = JSON.parse(decoded);
    assert.equal(data.before, data.after, 'parse/lock/selection never normalizes the editor buffer');
    for (const row of data.supported) {
      assert.equal(row.result.allowed, true, JSON.stringify(row));
      assert.equal(row.result.source, row.source);
      assert.equal(row.edit.allowed, true, JSON.stringify(row));
      assert.equal(row.edit.source, row.source);
      assert.equal(row.edit.draft, row.source + '\nAdded text.\n');
    }
    for (const row of data.unsupported) {
      assert.equal(row.result.allowed, false, JSON.stringify(row));
      assert.equal(row.edit.allowed, false);
      assert.equal(row.edit.source, row.source);
      assert.equal(row.edit.draft, '# Lost metadata\n');
    }
    assert.equal(data.intentionalCodeEdit.allowed, true, 'supported deliberate code edits are permitted');
    sources.forEach((source, i) => assert.equal(readFileSync(join(dir, `note-${i}.md`), 'utf8'), source));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
