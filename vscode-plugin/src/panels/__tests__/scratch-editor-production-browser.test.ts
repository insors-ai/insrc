import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { scratchEditorHtml } from '../scratch-editor-html.js';
import { runInProcessGroup } from '../../../../src/shared/process-group.js';

test('scratch production browser bundle boots under local CSP with no initial write and locked explicit Send', async () => {
  const chrome = process.env['INSRC_CHROME_BIN'] ?? ['/usr/bin/google-chrome', '/usr/bin/chromium'].find(existsSync);
  assert.ok(chrome, 'Actual production-browser qualification requires Chrome');
  const dir = mkdtempSync(join(tmpdir(), 'insrc-scratch-production-'));
  try {
    const { bundleScratchEditor } = await import('../../../esbuild.mjs');
    await bundleScratchEditor(dir);
    // Chrome has no vscode-webview scheme. Only resource locations are adapted;
    // the emitted JS/CSS, nonce policy and bootstrap are the production ones.
    let html = scratchEditorHtml({ script: 'vscode-webview://fixture/editor.js', style: 'vscode-webview://fixture/editor.css', cspSource: 'vscode-webview://fixture' }, 'fixture_nonce', 'production');
    html = html.replaceAll('vscode-webview://fixture/editor.js', pathToFileURL(join(dir, 'editor.js')).href)
      .replaceAll('vscode-webview://fixture/editor.css', pathToFileURL(join(dir, 'editor.css')).href)
      .replaceAll('vscode-webview://fixture', 'file:');
    const driver = `
const frames = [], violations = [];
document.addEventListener('securitypolicyviolation', e => violations.push(e.violatedDirective));
window.acquireVsCodeApi = () => ({ postMessage: message => {
  frames.push(message);
  if (message.type === 'editor-ready') setTimeout(() => window.dispatchEvent(new MessageEvent('message', {data:{type:'document-state',paneSessionId:'production',version:1,digest:'a'.repeat(64),markdown:'# Production\\n\\nSelected paragraph.\\n',locked:true}})), 0);
  if (message.type === 'editor-initialized') setTimeout(() => {
    const editor = document.querySelector('.ProseMirror'), range = document.createRange();
    range.selectNodeContents(editor.querySelector('p'));
    getSelection().removeAllRanges(); getSelection().addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
    setTimeout(() => {
      const send = document.querySelector('.scratch-selection-send');
      const before = frames.filter(f => f.type === 'send-selection').length;
      const visible = !send.hidden; send.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true}));send.click();
      const pre = document.createElement('pre'); pre.id='production-result';
      pre.textContent=JSON.stringify({frames,violations,visible,before,editable:editor.getAttribute('contenteditable'),css:getComputedStyle(send).position});document.body.append(pre);
    },100);
  },100);
}});
`;
    html = html.replace('<main id="scratch-editor"', `<script nonce="fixture_nonce">${driver}</script><main id="scratch-editor"`);
    writeFileSync(join(dir, 'index.html'), html);
    const result = await runInProcessGroup(chrome, ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-background-networking', '--no-first-run', `--user-data-dir=${join(dir, 'profile')}`, '--virtual-time-budget=10000', '--dump-dom', pathToFileURL(join(dir, 'index.html')).href], { timeoutMs: 60000 });
    assert.equal(result.timedOut, false); assert.equal(result.exitCode, 0, result.stderr);
    const match = result.stdout.match(/<pre id="production-result">([\s\S]*?)<\/pre>/); assert.ok(match, result.stdout.slice(-3000));
    const data = JSON.parse(match[1]!.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&'));
    assert.deepEqual(data.violations, []); assert.equal(data.editable, 'false'); assert.equal(data.visible, true); assert.equal(data.before, 0); assert.equal(data.css, 'fixed');
    assert.ok(data.frames.some((m: {type:string;success?:boolean}) => m.type === 'editor-initialized' && m.success));
    assert.equal(data.frames.filter((m: {type:string}) => m.type === 'draft').length, 0);
    assert.deepEqual(data.frames.filter((m: {type:string}) => m.type === 'send-selection').map((m: {selectedText:string}) => m.selectedText), ['Selected paragraph.']);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
