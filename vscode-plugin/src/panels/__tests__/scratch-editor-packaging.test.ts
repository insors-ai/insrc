import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, existsSync, rmSync, cpSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
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
    // The approved plain-CLI adapter story retires the separate Vibe worker.
    // Keep the active host entries and both scratch validators mandatory.
    for (const name of ['extension.js', 'uninstall.js', 'scratch-validation-host-worker.js']) assert.ok(existsSync(join(out, name)));
    assert.ok(existsSync(join(out, 'scratch-editor/validator.js')));
    const analysis = await mod.bundleScratchEditor(join(dir, 'inspect'));
    for (const [name, output] of Object.entries(analysis.metafile.outputs) as [string, { imports: { path: string; external?: boolean }[] }][]) {
      assert.equal(output.imports.filter(i => i.external).length, 0, name);
    }
    assert.ok(!Object.keys(analysis.metafile.inputs).some(path => path.includes('/llm-providers/')), 'no library cloud providers bundled');
    // This second analysis build is test instrumentation, not package content.
    rmSync(join(dir, 'inspect'), { recursive: true, force: true });
    // Snapshot the actual production package and its selected runtime files.
    // Omit only prepublish so packaging cannot mutate the canonical checkout;
    // emitted binaries above, contribution metadata and uninstall stay real.
    const productionFiles = await listFiles({ cwd: root, packageManager: PackageManager.None });
    for (const file of productionFiles) if (!file.startsWith('out/') && file !== 'package.json') {
      const destination = join(dir, file); mkdirSync(join(destination, '..'), { recursive: true });
      cpSync(join(root, file), destination, { recursive: true });
    }
    const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    delete manifest.scripts['vscode:prepublish'];
    assert.equal(manifest.main, './out/extension.js');
    assert.equal(manifest.scripts['vscode:uninstall'], 'node ./out/uninstall.js');
    writeFileSync(join(dir, 'package.json'), JSON.stringify(manifest));
    writeFileSync(join(dir, '.vscodeignore'), readFileSync(join(root, '.vscodeignore')));
    mkdirSync(join(dir, 'node_modules/unshipped'), { recursive: true });
    writeFileSync(join(dir, 'node_modules/unshipped/index.js'), 'do not ship');
    const files = await listFiles({ cwd: dir, packageManager: PackageManager.None });
    assert.ok(files.includes('out/scratch-editor/editor.js'));
    assert.ok(files.includes('out/scratch-editor/editor.css'));
    assert.ok(files.includes('out/scratch-editor/validator.js'));
    assert.ok(files.includes('out/scratch-validation-host-worker.js'));
    assert.ok(!files.some(path => path.startsWith('node_modules/')));
    await createVSIX({ cwd: dir, packagePath: join(dir, 'fixture.vsix'), dependencies: false, allowUnusedFilesPattern: true });
    const archive = join(dir, 'fixture.vsix'); assert.ok(existsSync(archive));
    // Read the written archive, not only the pre-package file list. yauzl is
    // already a dependency of the pinned VSCE package used to create it.
    const yauzl = createRequire(import.meta.url)('yauzl');
    const archived = await new Promise<string[]>((resolve, reject) => {
      yauzl.open(archive, { lazyEntries: true }, (error: Error | null, zip: any) => {
        if (error) { reject(error); return; }
        const names: string[] = []; zip.on('error', reject); zip.on('end', () => resolve(names));
        zip.on('entry', (entry: { fileName: string }) => { names.push(entry.fileName); zip.readEntry(); }); zip.readEntry();
      });
    });
    for (const name of ['package.json', 'out/extension.js', 'out/uninstall.js', 'out/package.json', 'out/scratch-editor/editor.js', 'out/scratch-editor/editor.css', 'out/scratch-editor/validator.js', 'out/scratch-validation-host-worker.js']) assert.ok(archived.includes(`extension/${name}`), name);
    assert.ok(!archived.some(path => path.includes('/node_modules/') || path.includes('/__tests__/') || path.endsWith('.ts')));
    const retained = process.env['INSRC_SCRATCH_VSIX_PATH']; if (retained) cpSync(archive, retained);
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


test('scratch production manifest keeps scratch-only opt-in association and native uninstall entry', () => {
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const editor = manifest.contributes.customEditors.find((entry: { viewType: string }) => entry.viewType === 'insrc.scratchpad.editor');
  assert.ok(editor); assert.equal(editor.priority, 'option');
  assert.deepEqual(editor.selector, [{ filenamePattern: '**/.insrc/scratches/*.md' }]);
  assert.equal(manifest.contributes.configurationDefaults?.['workbench.editorAssociations'], undefined);
  assert.equal(manifest.main, './out/extension.js');
  assert.equal(manifest.scripts['vscode:uninstall'], 'node ./out/uninstall.js');
});
