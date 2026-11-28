/** Test-only launcher for bounded, isolated native VS Code processes. */
import { mkdtemp, mkdir, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { build } from 'esbuild';
import { runInProcessGroup } from '../../../../../src/shared/process-group.js';

export async function nativeScratchRun(fixture: string) {
  const root = await mkdtemp(join(tmpdir(), 'insrc-scratch-host-')), extension = join(root, 'extension'), out = join(extension, 'out');
  await mkdir(out, { recursive: true });
  await build({ entryPoints: [fileURLToPath(new URL(fixture, import.meta.url))], outfile: join(out, 'fixture.cjs'), bundle: true, platform: 'node', format: 'cjs', target: 'node22', external: ['vscode'], logLevel: 'silent' });
  const { bundleScratchEditor } = await import('../../../../esbuild.mjs'); await bundleScratchEditor(join(out, 'scratch-editor'));
  await writeFile(join(extension, 'package.json'), JSON.stringify({ name: 'scratch-lifecycle-fixture', publisher: 'insrc-test', version: '0.0.1', engines: { vscode: '^1.141.0' }, main: './out/fixture.cjs', activationEvents: ['*'], contributes: { customEditors: [{ viewType: 'insrc.scratchpad.editor', displayName: 'Scratchpad qualification', selector: [{ filenamePattern: '*.md' }], priority: 'option' }] } }));
  return { root, async dispose() { await rm(root, { recursive: true, force: true }); }, async launch(role: string) {
    const data = join(root, role, 'profile'); await mkdir(join(data, 'User'), { recursive: true });
    await writeFile(join(data, 'User', 'settings.json'), JSON.stringify({ 'chat.disableAIFeatures': false, 'security.workspace.trust.enabled': false, 'workbench.startupEditor': 'none', 'update.mode': 'none', 'extensions.autoUpdate': false, 'telemetry.telemetryLevel': 'off', 'files.simpleDialog.enable': true, 'files.hotExit': 'onExitAndWindowClose' }));
    const port = await new Promise<number>((resolve, reject) => { const server = createServer(); server.once('error', reject); server.listen(0, '127.0.0.1', () => { const addr = server.address(); if (!addr || typeof addr === 'string') { server.close(); reject(new Error('No debug port')); return; } server.close(() => resolve(addr.port)); }); });
    const env = { ...process.env, INSRC_NATIVE_ROLE: role, INSRC_NATIVE_DEBUG_PORT: String(port), INSRC_NATIVE_FIXTURE_ROOT: root, INSRC_NATIVE_FIXTURE_EXTENSION: extension };
    delete env['VSCODE_IPC_HOOK_CLI']; delete env['ELECTRON_RUN_AS_NODE'];
    // Recovery qualification deliberately ends the first process after its
    // durable checkpoint. This is an owned crash probe, not a timeout accepted
    // as success; failures never create the checkpoint and remain failures.
    const abort = new AbortController(); let restartRequested = false, checking = false;
    const restart = role === 'main' ? setInterval(() => {
      if (checking || restartRequested) return; checking = true;
      void (async () => {
        try {
          await readFile(join(root, 'main-ready-for-restart'), 'utf8');
          const recorded = JSON.parse(await readFile(join(root, 'main.json'), 'utf8'));
          if (recorded.passed === true) { restartRequested = true; abort.abort(); }
        } catch { /* checkpoint is not ready */ } finally { checking = false; }
      })();
    }, 100) : undefined;
    const result = await runInProcessGroup(process.env['INSRC_CODE_BIN'] ?? '/usr/share/code/code', ['--no-sandbox', '--ozone-platform=x11', '--force-device-scale-factor=1', '--log=trace', `--remote-debugging-port=${port}`, '--disable-gpu', '--new-window', '--skip-welcome', '--skip-release-notes', '--disable-extensions', `--user-data-dir=${data}`, `--extensions-dir=${join(root, role, 'extensions')}`, `--extensionDevelopmentPath=${extension}`, `--extensionTestsPath=${join(out, 'fixture.cjs')}`], { env, timeoutMs: 180_000, signal: abort.signal }).finally(() => { clearInterval(restart); });
    const evidence = JSON.parse(await readFile(join(root, `${role}.json`), 'utf8').catch(() => JSON.stringify({ passed: false, error: 'No native evidence' })));
    const trace: string[] = [];
    for (const stamp of await readdir(join(data, 'logs')).catch(() => [])) { const text = await readFile(join(data, 'logs', stamp, 'window1', 'renderer.log'), 'utf8').catch(() => ''); trace.push(...text.split('\n').filter(line => /Command 'undo'|Command 'redo'/.test(line))); }
    return { ...evidence, intentionalRestartCrash: restartRequested && result.aborted === true, commandTrace: trace, exitCode: result.exitCode, timedOut: result.timedOut, output: (result.stdout + result.stderr).slice(-4000) };
  } };
}
