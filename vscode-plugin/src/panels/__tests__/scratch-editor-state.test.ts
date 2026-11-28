import { runScratchBrowser } from './fixtures/scratch-browser-runner.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { runInProcessGroup } from '../../../../src/shared/process-group.js';

test('scratch renderer preserves newer real Milkdown typing across older and duplicate acknowledgements', async () => {
  const chrome = process.env['INSRC_CHROME_BIN'] ?? ['/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(existsSync);
  assert.ok(chrome, 'Required browser integration needs Chrome.');
  const dir = mkdtempSync(join(tmpdir(), 'insrc-scratch-ack-'));
  try {
    await build({ entryPoints: [fileURLToPath(new URL('./fixtures/scratch-editor-state-browser.ts', import.meta.url))], outfile: join(dir, 'fixture.js'), bundle: true, platform: 'browser', format: 'iife', target: 'chrome120', loader: { '.woff': 'file', '.woff2': 'file', '.ttf': 'file' }, logLevel: 'silent' });
    writeFileSync(join(dir, 'index.html'), '<!doctype html><meta charset="utf-8"><script defer src="./fixture.js"></script>');
    const result = { stdout: await runScratchBrowser(chrome, dir) };
    const match = result.stdout.match(/<pre id="scratch-result">([\s\S]*?)<\/pre>/); assert.ok(match, result.stdout.slice(-2500));
    const data = JSON.parse(match[1]!.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&'));
    assert.equal(data.beforeAck.drafts.length, 3);
    assert.equal(data.beforeAck.drafts[0].apply, false); assert.equal(data.beforeAck.drafts[1].apply, true); assert.equal(data.beforeAck.drafts[2].apply, false);
    assert.match(data.beforeAck.state, /newer typing/);
    assert.equal(data.beforeAck.state, data.beforeAck.view);
    assert.equal(data.afterAck.state, data.beforeAck.state); assert.equal(data.afterAck.view, data.beforeAck.view);
    assert.deepEqual(data.afterAck.action, { revalidate: true }, 'old ack requests fresh validation, never a view replacement or automatic authorization');
    assert.equal(data.afterAck.drafts.length, 3);
    assert.equal(data.afterAck.drafts[2].apply, false);
    assert.equal(data.afterRevalidation.length, 4); assert.equal(data.afterRevalidation[3].draftSeq, 2); assert.equal(data.afterRevalidation[3].apply, true);
    assert.equal(data.afterRevalidation[3].baseVersion, 2); assert.equal(data.afterRevalidation[3].parentEditId, data.beforeAck.drafts[0].editId);
    assert.equal(data.afterDuplicate, data.beforeAck.state); assert.equal(data.pending, true); assert.equal(data.frozen, false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('scratch synchronization modules pass host and browser production typechecks', async () => {
  const compiler = createRequire(import.meta.url).resolve('typescript/bin/tsc');
  for (const name of ['tsconfig.json', 'tsconfig.webview.json']) {
    const result = await runInProcessGroup(process.execPath, [compiler, '-p', fileURLToPath(new URL(`../../../${name}`, import.meta.url)), '--noEmit'], { timeoutMs: 120_000 });
    assert.equal(result.timedOut, false); assert.equal(result.exitCode, 0, result.stdout + result.stderr);
  }
});
