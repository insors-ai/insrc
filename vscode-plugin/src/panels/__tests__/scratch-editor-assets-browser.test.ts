import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { runInProcessGroup } from '../../../../src/shared/process-group.js';
test('scratch actual Crepe upload display picker and URL paste callbacks preserve portable Markdown without failed references', async () => {
  const chrome = process.env['INSRC_CHROME_BIN'] ?? ['/usr/bin/google-chrome', '/usr/bin/chromium'].find(existsSync); assert.ok(chrome);
  const dir = mkdtempSync(join(tmpdir(), 'scratch-assets-browser-'));
  try {
    await build({ entryPoints: [fileURLToPath(new URL('./fixtures/scratch-editor-assets-browser.ts', import.meta.url))], outfile: join(dir, 'fixture.js'), bundle: true, platform: 'browser', format: 'iife', loader: { '.woff': 'file', '.woff2': 'file', '.ttf': 'file' }, logLevel: 'silent' });
    writeFileSync(join(dir, 'index.html'), '<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="fixture.css"><script defer src="fixture.js"></script>');
    const result = await runInProcessGroup(chrome, ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-background-networking', '--no-first-run', `--user-data-dir=${join(dir, 'profile')}`, '--virtual-time-budget=8000', '--dump-dom', `file://${join(dir, 'index.html')}`], { timeoutMs: 60_000 });
    assert.equal(result.exitCode, 0, result.stderr); assert.equal(result.timedOut, false);
    const match = result.stdout.match(/<pre id="scratch-result">([\s\S]*?)<\/pre>/); assert.ok(match, result.stdout.slice(-4500));
    const d = JSON.parse(match[1]!.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&'));
    assert.deepEqual(d.initial.drafts, []); assert.match(d.initial.source, /assets\/existing.png/); assert.equal(d.initial.resolved.length, 2); assert.equal(d.initial.ownedViews.rawImageInputs, 0); assert.equal(d.initial.ownedViews.images.length, 2);
    assert.deepEqual(d.initial.ownedViews.images.map((image: { alt: string }) => image.alt), ['Existing', 'Inline']); assert.equal(d.initial.ownedViews.images[0].alt, 'Existing'); assert.match(d.initial.ownedViews.images[0].src, /^data:image\/png/);
    assert.equal(d.inline, 'assets/image_1.png'); assert.equal(d.block, 'assets/image_2.png'); assert.match(d.display, /^data:image\/png/);
    assert.deepEqual(d.uploadedNodes, ['assets/image_3.png']); assert.match(d.failure, /Storage unavailable/);
    assert.equal(d.afterFailure, d.beforeFailure); assert.equal(d.afterCancel, d.beforeFailure);
    assert.match(d.pickedImage, /assets\/image_4.png/); assert.match(d.pickedLink, /\.\.\/workspace\/space%20name.md/);
    assert.ok(d.linkHrefs.includes('https://example.test/page'));
    assert.match(d.pickedImage, /!\[Existing\]\(assets\/existing.png\)/); assert.equal(d.pastePrevented, true);
    assert.equal(d.mixedPrevented, true); assert.match(d.mixedSource, /assets\/image_5.png/); assert.doesNotMatch(d.mixedSource, /blob:/); assert.equal(d.dropPrevented, true); assert.equal(d.failedAfterMixed, false, d.mixedStatus); assert.match(d.droppedSource, /assets\/image_6.png/, d.dropStatus); assert.equal(d.failedMixedSource, d.droppedSource);
    for (const draft of d.drafts) assert.doesNotMatch(draft.markdown, /blob:|vscode-webview:|data:image/);
    assert.ok(d.drafts.length > 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
