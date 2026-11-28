import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { runInProcessGroup } from '../../../../src/shared/process-group.js';
import { ScratchLockPreference } from '../scratch-editor-lock.js';
import { ScratchRendererState } from '../scratch-editor-state.js';
import type { ScratchDraftProposal } from '../scratch-editor-protocol.js';

test('scratch pane uses actual Crepe remembered locks and click-only locked selection Send with source-safe failures', async () => {
  const chrome = process.env['INSRC_CHROME_BIN'] ?? ['/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(existsSync);
  assert.ok(chrome, 'Required actual Crepe integration needs Chrome.');
  const dir = mkdtempSync(join(tmpdir(), 'insrc-scratch-pane-'));
  try {
    await build({ entryPoints: [fileURLToPath(new URL('./fixtures/scratch-editor-pane-browser.ts', import.meta.url))], outfile: join(dir, 'fixture.js'), bundle: true, platform: 'browser', format: 'iife', target: 'chrome120', loader: { '.woff': 'file', '.woff2': 'file', '.ttf': 'file' }, logLevel: 'silent' });
    writeFileSync(join(dir, 'index.html'), '<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="./fixture.css"><script defer src="./fixture.js"></script>');
    const result = await runInProcessGroup(chrome, ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-background-networking', '--no-first-run', `--user-data-dir=${join(dir, 'profile')}`, '--virtual-time-budget=8000', '--dump-dom', `file://${join(dir, 'index.html')}`], { timeoutMs: 60_000 });
    assert.equal(result.timedOut, false); assert.equal(result.exitCode, 0, result.stderr);
    const match = result.stdout.match(/<pre id="scratch-result">([\s\S]*?)<\/pre>/); assert.ok(match, result.stdout.slice(-3500));
    const data = JSON.parse(match[1]!.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&'));
    assert.deepEqual(data.initial, { readonly: true, editable: 'false', messages: [] });
    assert.deepEqual(data.selected, { visible: true, sends: 0, drafts: 0, label: 'Send selection to chat' });
    assert.equal(data.lockedControls.length, 4);
    assert.deepEqual(data.ownedImage, { count: 1, rawInputs: 0, resizeControls: 0 });
    for (const control of data.lockedControls) assert.equal(control.display, 'none', control.selector);
    assert.deepEqual(data.clicked, [{ type: 'send-selection', requestId: 'send_1', paneSessionId: 'first', draftSeq: 0, docVersion: 1, selectedText: 'Selectable text.' }]);
    assert.deepEqual(data.remembered, { first: false, second: false, stored: false });
    assert.deepEqual(data.siblings, { first: false, second: true, third: true });
    assert.equal(data.lateAck.after, data.lateAck.before); assert.match(data.lateAck.after, /newer/);
    assert.equal(data.lateAck.drafts.length, 3); assert.equal(data.lateAck.drafts[1].apply, false); assert.equal(data.lateAck.drafts[2].apply, true);
    assert.match(data.host.markdown, /Host change/); assert.deepEqual(data.host.drafts, []);
    assert.equal(data.unsupported.fallback, true); assert.equal(data.unsupported.readonly, true); assert.ok(data.unsupported.alert); assert.deepEqual(data.unsupported.drafts, []);
    assert.deepEqual(data.fallback, { type: 'open-text', paneSessionId: 'unsupported' });
    assert.deepEqual(data.shortcuts, { childKeys: 0, actions: ['undo', 'redo', 'save'], drafts: [] });
    for (const selection of data.selectionChecks) {
      assert.deepEqual(selection.before, []); assert.deepEqual(selection.drafts, []);
      assert.equal(selection.sent.length, 1); assert.equal(selection.waiting, true); assert.equal(selection.disabledAfterFailure, false);
      assert.equal(selection.sent[0].selectedText, 'First bold paragraph.\n\nSecond 😀 paragraph.');
      assert.equal(selection.sent[0].docVersion, 1); assert.equal(selection.sent[0].draftSeq, 0);
      assert.equal(selection.retained, selection.sent[0].selectedText); assert.equal(selection.retainedVisible, true);
      assert.match(selection.status, /reselect and retry/);
      if (selection.method !== 'pointer') assert.equal(selection.focusedByTab, true);
    }
    assert.equal(data.limit.readonly, true); assert.match(data.limit.alert, /limits/); assert.deepEqual(data.limit.drafts, []);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('scratch lock preference defaults safely and surfaces persistence failures without poisoning later changes', async () => {
  let stored: unknown = 'not a boolean', fail = true;
  const preference = new ScratchLockPreference({ get: <T>() => stored as T, update: async (_key, value) => { if (fail) throw new Error('storage unavailable'); stored = value; } });
  assert.equal(preference.initial(), true); await assert.rejects(preference.remember(false), /storage unavailable/); assert.equal(preference.initial(), true);
  fail = false; await preference.remember(false); assert.equal(preference.initial(), false);
  await preference.remember(true); assert.equal(preference.initial(), true);
});

test('scratch refused draft stays recovery-only after the older edit acknowledgement', () => {
  const sent: ScratchDraftProposal[] = [], state = new ScratchRendererState('pane', { version: 1, digest: 'a'.repeat(64), markdown: '# Original\n' }, d => sent.push(d));
  state.edit('# First\n'); state.edit('# Refused but preserved\n', false);
  const old = sent[0]!;
  state.receive({ type: 'apply-ack', paneSessionId: 'pane', draftSeq: old.draftSeq, editId: old.editId, version: 2, digest: 'b'.repeat(64), markdown: old.markdown });
  assert.equal(sent.length, 2); assert.equal(sent[1]?.apply, false); assert.equal(state.markdown, '# Refused but preserved\n'); assert.equal(state.conflicted, true);
});
