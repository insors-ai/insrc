import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { createServer } from 'node:net';
import { runInProcessGroup } from '../../../../src/shared/process-group.js';

test('scratch native VS Code qualification exercises TextDocument save undo redo autosave and broadcasts', { skip: process.env['INSRC_NATIVE_VSCODE_TESTS'] !== '1', timeout: process.env['INSRC_NATIVE_MANUAL_FOCUS'] === '1' ? 660_000 : 180_000 }, async () => {
  assert.ok(process.env['INSRC_NATIVE_PRIVATE_DISPLAY'] === '1' || process.env['INSRC_NATIVE_MANUAL_FOCUS'] === '1', 'Automated native input requires an explicitly private display');
  assert.ok(process.env['DISPLAY'] || process.platform !== 'linux', 'Native VS Code qualification requires a display.');
  const dir = await mkdtemp(join(tmpdir(), 'insrc-native-vscode-'));
  const extension = join(dir, 'extension'), data = join(dir, 'profile'), evidenceRoot = join(dir, 'evidence'), out = join(extension, 'out');
  await mkdir(out, { recursive: true }); await mkdir(evidenceRoot, { recursive: true });
  try {
    await build({ entryPoints: [fileURLToPath(new URL('./fixtures/scratch-editor-native-host.ts', import.meta.url))], outfile: join(out, 'fixture.cjs'), bundle: true, platform: 'node', format: 'cjs', target: 'node22', external: ['vscode'], logLevel: 'silent' });
    const { bundleScratchEditor } = await import('../../../esbuild.mjs');
    await bundleScratchEditor(join(out, 'scratch-editor'));
    await writeFile(join(extension, 'package.json'), JSON.stringify({ name: 'scratch-native-fixture', publisher: 'insrc-test', version: '0.0.1', engines: { vscode: '^1.141.0' }, main: './out/fixture.cjs', activationEvents: ['*'], contributes: { customEditors: [{ viewType: 'insrc.scratchpad.editor', displayName: 'Scratchpad qualification', selector: [{ filenamePattern: '*.md' }], priority: 'option' }] } }));
    await mkdir(join(data, 'User'), { recursive: true });
    await writeFile(join(data, 'User', 'settings.json'), JSON.stringify({ 'chat.disableAIFeatures': process.env['INSRC_NATIVE_BUILTIN_AI'] !== '1', 'security.workspace.trust.enabled': false, 'workbench.startupEditor': 'none', 'update.mode': 'none', 'extensions.autoUpdate': false, 'telemetry.telemetryLevel': 'off' }));
    const debugPort = await new Promise<number>((resolve, reject) => { const server = createServer(); server.once('error', reject); server.listen(0, '127.0.0.1', () => { const address = server.address(); if (!address || typeof address === 'string') { server.close(); reject(new Error('No debug port')); return; } server.close(() => resolve(address.port)); }); });
    const env = { ...process.env, INSRC_NATIVE_DEBUG_PORT: String(debugPort), INSRC_NATIVE_FIXTURE_ROOT: evidenceRoot, INSRC_NATIVE_FIXTURE_EXTENSION: extension };
    delete env['VSCODE_IPC_HOOK_CLI']; delete env['ELECTRON_RUN_AS_NODE'];
    const result = await runInProcessGroup(process.env['INSRC_CODE_BIN'] ?? '/usr/share/code/code', ['--no-sandbox', '--ozone-platform=x11', '--force-device-scale-factor=1', '--log=trace', `--remote-debugging-port=${debugPort}`, '--disable-gpu', '--new-window', '--skip-welcome', '--skip-release-notes', '--disable-extensions', `--user-data-dir=${data}`, `--extensions-dir=${join(dir, 'extensions')}`, `--extensionDevelopmentPath=${extension}`, `--extensionTestsPath=${join(out, 'fixture.cjs')}`], { env, timeoutMs: process.env['INSRC_NATIVE_MANUAL_FOCUS'] === '1' ? 600_000 : 150_000 });
    let evidence = await readFile(join(evidenceRoot, 'evidence.json'), 'utf8').catch(() => 'No native evidence generated.');
    const { readdir } = await import('node:fs/promises');
    const trace: string[] = [];
    for (const stamp of await readdir(join(data, 'logs')).catch(() => [])) {
      const text = await readFile(join(data, 'logs', stamp, 'window1', 'renderer.log'), 'utf8').catch(() => '');
      trace.push(...text.split('\n').filter(line => /Command 'undo'|Command 'redo'/.test(line)));
    }
    if (evidence.startsWith('{')) evidence = JSON.stringify({ ...JSON.parse(evidence), commandTrace: trace }, null, 2);
    const retained = process.env['INSRC_NATIVE_EVIDENCE'];
    if (retained) await writeFile(retained, evidence);
    assert.equal(result.timedOut, false, evidence + result.stderr.slice(-2000));
    assert.equal(result.exitCode, 0, evidence + result.stdout.slice(-3000) + result.stderr.slice(-3000));
    assert.equal(JSON.parse(evidence).passed, true, evidence);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
