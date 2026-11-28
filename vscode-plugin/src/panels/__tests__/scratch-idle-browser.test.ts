import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { runScratchBrowser } from './fixtures/scratch-browser-runner.js';
import { SCRATCH_NOTE_BYTES } from '../scratch-editor-protocol.js';

test('Actual Milkdown immediate render and resumed typing during delayed validation', async () => {
  const chrome = process.env['INSRC_CHROME_BIN'] ?? ['/usr/bin/google-chrome', '/usr/bin/chromium'].find(existsSync);
  assert.ok(chrome, 'Actual worker/render qualification requires Chrome');
  const dir = mkdtempSync(join(tmpdir(), 'scratch-idle-browser-'));
  try {
    await build({ entryPoints: [fileURLToPath(new URL('./fixtures/scratch-idle-browser.ts', import.meta.url))], outfile: join(dir, 'fixture.js'), bundle: true, platform: 'browser', format: 'iife', loader: { '.woff': 'file', '.woff2': 'file', '.ttf': 'file' }, logLevel: 'silent' });
    writeFileSync(join(dir, 'index.html'), '<!doctype html><meta charset="utf-8"><script defer src="fixture.js"></script>');
    const html = await runScratchBrowser(chrome, dir);
    const match = html.match(/<pre id="scratch-result">([\s\S]*?)<\/pre>/); assert.ok(match, html);
    const data = JSON.parse(match[1]!.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&'));
    if (process.env['INSRC_IDLE_EVIDENCE']) writeFileSync(process.env['INSRC_IDLE_EVIDENCE'], JSON.stringify(data, null, 2));
    assert.equal(data.bytes, SCRATCH_NOTE_BYTES); assert.equal(data.failure, '');
    assert.equal(data.parserCalls, 0, 'No main-thread parsing during input or idle validation');
    assert.equal(data.serializerCalls, 21, 'Exactly one recovery serialization for each user transaction');
    assert.equal(data.afterTyping.sequence, 21); assert.equal(data.afterTyping.firstCharacter, 'x'); assert.ok(data.afterTyping.rendered > 1_000_000); assert.deepEqual(data.afterTyping.authorized, []);
    assert.deepEqual(data.authorized, [21], 'Stale active generation never authorizes after resumed typing');
    assert.equal(data.render.length, 21); assert.ok(data.medianRenderMs <= 150, JSON.stringify(data));
    assert.ok(data.resumedMs < 3000, 'All resumed full-bound edits render while delayed worker is busy');
    assert.equal(data.timings.filter((sample: {phase: string}) => sample.phase === 'validation').length, 2, 'Only stale active and latest generation run full validation');
    for (const phase of ['capture', 'intent', 'validation']) assert.ok(data.timings.some((sample: {phase: string}) => sample.phase === phase));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
