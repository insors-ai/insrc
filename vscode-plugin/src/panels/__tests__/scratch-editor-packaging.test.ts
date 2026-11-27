import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createVSIX, listFiles, PackageManager } from '@vscode/vsce';
import { scratchEditorHtml } from '../scratch-editor-html.js';
import { shellCsp } from '../shell.js';

const root = fileURLToPath(new URL('../../../', import.meta.url));

test('Milkdown lockfile pins one compatible dependency graph', () => {
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'));
  for (const name of ['@milkdown/crepe', '@milkdown/kit']) assert.equal(manifest.dependencies[name], '7.23.0');
  const packages = Object.entries(lock.packages) as [string, { version?: string }][];
  const milkdown = packages.filter(([name]) => name.includes('node_modules/@milkdown/'));
  assert.ok(milkdown.length > 10);
  for (const [path, entry] of milkdown) {
    assert.equal(entry.version, '7.23.0', path);
    assert.equal(path.split('node_modules/').length, 2, `deduplicated ${path}`);
  }
  for (const name of ['prosemirror-model', 'prosemirror-state', 'prosemirror-view']) {
    assert.equal(packages.filter(([path]) => path.endsWith(`node_modules/${name}`)).length, 1, `${name}: one instance`);
  }
});

test('scratch editor emits local browser JS/CSS alongside CJS and includes them in a real VSIX', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'insrc-milkdown-package-'));
  try {
    const out = join(dir, 'out');
    const mod = await import('../../../esbuild.mjs');
    await mod.bundle(out);
    const js = readFileSync(join(out, 'scratch-editor/editor.js'), 'utf8');
    const css = readFileSync(join(out, 'scratch-editor/editor.css'), 'utf8');
    assert.match(js, /InsrcScratchEditor/);
    assert.doesNotMatch(js, /\brequire\(["'](?:node:|@milkdown|prosemirror)/);
    assert.match(css, /\.milkdown/);
    assert.doesNotMatch(css, /@import\s|url\(\s*["']?https?:/);
    assert.equal(JSON.parse(readFileSync(join(out, 'package.json'), 'utf8')).type, 'commonjs');
    for (const name of ['extension.js', 'uninstall.js', 'vibe-session-worker.js']) assert.ok(existsSync(join(out, name)));
    const analysis = await mod.bundleScratchEditor(join(dir, 'inspect'));
    for (const [name, output] of Object.entries(analysis.metafile.outputs) as [string, { imports: { path: string; external?: boolean }[] }][]) {
      assert.equal(output.imports.filter(i => i.external).length, 0, name);
    }
    assert.ok(!Object.keys(analysis.metafile.inputs).some(path => path.includes('/llm-providers/')), 'no library cloud providers bundled');
    // Package the REAL emitted runtime layout with no prepublish script (the
    // fixture must not rebuild the canonical checkout while tests are readers).
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'insrc-milkdown-fixture', version: '1.0.0', publisher: 'insors', description: 'Packaging qualification fixture', license: 'MIT', engines: { vscode: '^1.141.0' }, main: './out/extension.js', activationEvents: ['onStartupFinished'], repository: { type: 'git', url: 'https://github.com/insors-ai/insrc.git' } }));
    writeFileSync(join(dir, 'README.md'), '# Packaging fixture\n');
    writeFileSync(join(dir, 'LICENSE'), 'MIT\n');
    writeFileSync(join(dir, '.vscodeignore'), readFileSync(join(root, '.vscodeignore')));
    mkdirSync(join(dir, 'node_modules/unshipped'), { recursive: true });
    writeFileSync(join(dir, 'node_modules/unshipped/index.js'), 'do not ship');
    const files = await listFiles({ cwd: dir, packageManager: PackageManager.None });
    assert.ok(files.includes('out/scratch-editor/editor.js'));
    assert.ok(files.includes('out/scratch-editor/editor.css'));
    assert.ok(!files.some(path => path.startsWith('node_modules/')));
    await createVSIX({ cwd: dir, packagePath: join(dir, 'fixture.vsix'), dependencies: false, allowUnusedFilesPattern: true });
    assert.ok(existsSync(join(dir, 'fixture.vsix')));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('scratch editor HTML permits local assets while blocking connections and untrusted policy input', () => {
  const html = scratchEditorHtml({ script: 'vscode-webview://host/editor.js', style: 'vscode-webview://host/editor.css', cspSource: 'vscode-webview://host' }, 'nonce_123');
  assert.match(html, /connect-src 'none'/);
  assert.match(html, /script-src 'nonce-nonce_123'/);
  assert.match(html, /style-src 'unsafe-inline' vscode-webview:\/\/host/);
  assert.match(html, /<script defer nonce="nonce_123" src="vscode-webview:\/\/host\/editor.js"/);
  assert.match(html, /href="vscode-webview:\/\/host\/editor.css"/);
  assert.doesNotMatch(html, /https?:|unsafe-eval/);
  assert.equal(shellCsp('N'), "default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-N';");
  assert.throws(() => scratchEditorHtml({ script: '', style: '', cspSource: "*; script-src *" }, 'N'));
  assert.throws(() => scratchEditorHtml({ script: '', style: '', cspSource: 'vscode-webview://host' }, "N'"));
  assert.throws(() => scratchEditorHtml({ script: 'https://example.test/editor.js', style: 'vscode-webview://host/editor.css', cspSource: 'vscode-webview://host' }, 'N'));
  assert.throws(() => scratchEditorHtml({ script: 'javascript:alert(1)', style: 'vscode-webview://host/editor.css', cspSource: 'vscode-webview://host' }, 'N'));
  assert.ok(scratchEditorHtml({ script: 'https://file+.vscode-resource.vscode-cdn.net/editor.js', style: 'https://file+.vscode-resource.vscode-cdn.net/editor.css', cspSource: 'https://*.vscode-cdn.net' }, 'N'));
});
