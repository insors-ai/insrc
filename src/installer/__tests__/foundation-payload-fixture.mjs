import { createRun } from '../../../scripts/test-harness/context.mjs';
import { withRun } from '../../../scripts/test-harness/process.mjs';
import { assembleFixtureRelease, bundleControlEntrypoint, collectProductionPayload, preparePublisherRuntime, probePayload } from '../../../scripts/package-installer.mjs';
import { validateEntrypoints, sha256 } from '../../../scripts/installer-payload.mjs';
import { appendFileSync, copyFileSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
const [source, root, archive] = process.argv.slice(2);
const started = performance.now();
const progress = stage => {
  const line = JSON.stringify({ stage, elapsedMs: Math.round(performance.now() - started) }) + '\n';
  appendFileSync(join(root, 'progress.jsonl'), line, { mode: 0o600 });
  process.stderr.write(line);
};
progress('starting');
const esbuild = `node_modules/@esbuild/${process.platform}-${process.arch}/${process.platform === 'win32' ? 'esbuild.exe' : 'bin/esbuild'}`;
mkdirSync(dirname(join(root, esbuild)), { recursive: true }); copyFileSync(join(source, esbuild), join(root, esbuild));
const target = { os: process.platform, arch: process.arch, baseline: 'foundation-fixture' };
const run = createRun(root, { mode: 'build' });
await withRun(run, async scope => {
  validateEntrypoints(source, ['out/daemon/index.js', 'out/cli/index.js', 'out/installer/manager-entry.js', 'out/installer/terminal-entry.js']);
  const bootstrap = join(root, 'bootstrap.mjs'), manager = join(root, 'manager.mjs');
  await bundleControlEntrypoint(run, scope, join(source, 'out/installer/terminal-entry.js'), bootstrap, target);
  await bundleControlEntrypoint(run, scope, join(source, 'out/installer/manager-entry.js'), manager, target);
  progress('control-bundles-complete');
  const context = await preparePublisherRuntime(run, archive, undefined, target);
  try {
  progress('publisher-runtime-prepared');
  const files = collectProductionPayload(source, { excludedInputs: [context.location.home, archive] });
  progress('application-files-collected');
  const native = readFileSync(join(source, 'out/installer/native/control.node'));
  files.set('bootstrap.mjs', { bytes: readFileSync(bootstrap), mode: 0o644 }); files.set('manager.mjs', { bytes: readFileSync(manager), mode: 0o644 });
  files.set('native/control.node', { bytes: native, mode: 0o755 });
  const manifest = { schemaVersion: 1, releaseId: 'complete-foundation-fixture', sourceCommit: 'a'.repeat(40), target, runtime: context.identity, daemonEntry: 'out/daemon/index.js', managerEntry: 'manager.mjs', tuiEntry: 'out/cli/index.js', protocolVersion: 1, compatiblePredecessors: [], migrations: [] };
  const descriptor = await assembleFixtureRelease({ files, directory: join(root, 'release'), manifest, baseUrl: 'https://example.invalid/complete-foundation-fixture', bootstrap: readFileSync(bootstrap), native });
  progress('release-assembled');
  const { extractSafeZip } = await import(pathToFileURL(join(source, 'out/installer/safe-zip.js')).href);
  const probe = join(root, 'probe'); mkdirSync(probe);
  await extractSafeZip(join(root, 'release/payload.zip'), probe, descriptor);
  progress('consumer-extraction-complete');
  await probePayload(run, scope, probe, target, context);
  progress('native-probe-complete');
  writeFileSync(join(root, 'result.json'), JSON.stringify({ publication: descriptor.publication, files: files.size, payloadBytes: descriptor.payload.bytes, consumerExtraction: 'passed', nativeProbe: 'passed', managerAndTerminalBundled: true, runtimeOutsidePayload: !Array.from(files.keys()).some(path => path.startsWith('tools/node/') || path.startsWith('runtime/')), descriptorFormat: descriptor.schemaVersion }));
  } finally { if (!scope.cancellationErrors.length && !scope.evidenceErrors.length) context.cleanup(); }
});
