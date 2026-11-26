import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { copyFileSync, mkdirSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { privateRuntimeTest } from './_private-runtime-test.js';
import { ollamaFixture } from './_ollama-fixture.js';
import { managerFixture } from './_manager-fixture.js';
import { productionPeers } from '../production-peers.js';
import { InstallerManager } from '../manager.js';
import { createRun } from '../../../scripts/test-harness/context.mjs';
import { withRun } from '../../../scripts/test-harness/process.mjs';
import { bundleControlEntrypoint, probePayload } from '../../../scripts/package-installer.mjs';

const out = fileURLToPath(new URL('../../../out/installer/', import.meta.url));
function tree(directory: string): unknown {
  return readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).map(item => [item.name,
    item.isDirectory() ? tree(join(directory, item.name)) : createHash('sha256').update(readFileSync(join(directory, item.name))).digest('hex')]);
}
privateRuntimeTest(import.meta.url, 'production-dependencies-compose-with-real-delivery-and-no-fake-s4-s5', async () => {
  const base = await ollamaFixture('fixture'), f = managerFixture(base.home, true);
  try {
    const before = tree(base.home), peers = productionPeers(base.target, base.location, base.options.runtime);
    assert.deepEqual(tree(base.home), before, 'factory construction performs no installation/probe writes');
    assert.equal(typeof peers.bundle?.resolve, 'function'); assert.equal(typeof peers.dev?.resolve, 'function');
    assert.equal(typeof peers.dependencies?.inspect, 'function'); assert.equal(typeof peers.dependencies?.decide, 'function');
    assert.equal(peers.lifecycle, undefined); assert.equal(peers.migrations, undefined);
    await assert.rejects(peers.dependencies!.decide(base.location, { offerId: 'forged', choice: 'install' }), { code: 'dependency-context-invalid' });
    await assert.rejects(new InstallerManager(base.location, base.target, peers).execute({ protocolVersion: 1, installationId: 'fixture', operationId: 'no-s4-s5', action: 'restart' }), { code: 'capability-unavailable' });
    assert.deepEqual(tree(base.home), before); assert.equal(f.state.shutdowns.length, 0);
  } finally { await base.cleanup(); }
});

privateRuntimeTest(import.meta.url, 'published-control-payload-includes-real-dependency-adapter-without-application-boot-imports', async () => {
  const base = await ollamaFixture('fixture');
  try {
    base.server.listen(base.port, '127.0.0.1'); await once(base.server, 'listening');
    const binaryPath = `node_modules/@esbuild/${process.platform}-${process.arch}/${process.platform === 'win32' ? 'esbuild.exe' : 'bin/esbuild'}`;
    const binary = join(base.root, binaryPath); mkdirSync(dirname(binary), { recursive: true });
    copyFileSync(fileURLToPath(new URL(`../../../${binaryPath}`, import.meta.url)), binary);
    const native = join(base.root, 'native/control.node'); mkdirSync(dirname(native)); copyFileSync(join(out, 'native/control.node'), native);
    const entry = join(base.root, 'inspect.mjs'), published = join(base.root, 'inspect-control.mjs');
    writeFileSync(entry, `import {productionPeers} from ${JSON.stringify(join(out, 'production-peers.js'))};
const location=${JSON.stringify(base.location)},target=${JSON.stringify(base.target)};
const {privateRuntimePaths,privateRuntimeIdentity}=await import(${JSON.stringify(join(out, 'runtime-policy.js'))});const runtime=await privateRuntimePaths(location,privateRuntimeIdentity(target));const peers=productionPeers(target,location,runtime);const report=await peers.dependencies.inspect(location);
process.stdout.write(JSON.stringify({node:process.version,executable:process.execPath,report,ports:Object.keys(peers).sort()}));`);
    const run = createRun(base.root, { mode: 'build' });
    await withRun(run, async scope => {
      const meta = await bundleControlEntrypoint(run, scope, entry, published, base.target);
      for (const part of ['dependencies.js', 'ollama-catalog.js', 'ollama-prepare.js', 'fzstd', 'xxhash-wasm'])
        assert.ok(Object.keys(meta.inputs).some(path => path.replaceAll('\\', '/').includes(part)), part);
      assert.ok(Object.keys(meta.inputs).every(path => !/(?:src|out)\/(?:db|indexer|agent|daemon|config)\//.test(path.replaceAll('\\', '/'))));
      const result = await scope.start(base.options.runtime.node, [published], { cwd: base.home,
        env: { ...run.environment(), PATH: '', HOME: base.root, USERPROFILE: base.root, NODE_OPTIONS: '', NODE_PATH: '' } });
      const text = readFileSync(result.log, 'utf8'); assert.equal(result.code, 0, text);
      const observed = JSON.parse(text); assert.equal(observed.node, 'v22.22.1'); assert.equal(observed.executable, base.options.runtime.node); assert.equal(observed.report.runtimeReady, true); assert.equal(observed.report.ollama, 'ready');
      assert.deepEqual(observed.ports, ['bundle', 'dependencies', 'dev']);
      for (const name of ['manager-entry', 'terminal-entry']) {
        const output = join(base.root, `${name}.mjs`), actual = await bundleControlEntrypoint(run, scope, join(out, `${name}.js`), output, base.target);
        for (const part of ['production-peers.js', 'dependencies.js', 'ollama-catalog.js']) assert.ok(Object.keys(actual.inputs).some(path => path.includes(part)), `${name}: ${part}`);
        if (name === 'terminal-entry') {
          assert.ok(Object.keys(actual.inputs).some(path => path.includes('ollama-service-worker.js')));
          const invalid = await scope.start(base.options.runtime.node, [output, '--ollama-service-worker'], { env: { ...run.environment(), PATH: '', NODE_OPTIONS: '', NODE_PATH: '' } });
          assert.notEqual(invalid.code, 0); assert.match(readFileSync(invalid.log, 'utf8'), /schema-invalid: Service worker requires/);
        }
      }
      // Execute the real publisher probe with actual installed native modules.
      // This controlled app slice is not full payload/publication qualification.
      const probe = join(base.root, 'publisher-probe'); mkdirSync(join(probe, 'native'), { recursive: true });
      writeFileSync(join(probe, 'package.json'), '{"type":"module"}');
      copyFileSync(native, join(probe, 'native/control.node'));
      symlinkSync(fileURLToPath(new URL('../../../node_modules', import.meta.url)), join(probe, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
      const commands: string[] = [], probeScope = Object.create(scope) as typeof scope;
      probeScope.start = async (...args: Parameters<typeof scope.start>) => { commands.push(args[0]); return scope.start(...args); };
      await probePayload(run, probeScope, probe, base.target, { location: base.location, identity: base.options.runtime.identity });
      assert.deepEqual(commands, [base.options.runtime.node], 'Real publisher probe must execute the canonical shared runtime');
    });
  } finally { await base.cleanup(); }
});

privateRuntimeTest(import.meta.url, 'both-control-entrypoints-use-identical-installation-bound-dependency-policy', async () => {
  const base = await ollamaFixture('fixture'); let requests = 0;
  try {
    base.server.on('request', () => requests++); base.server.listen(base.port, '127.0.0.1'); await once(base.server, 'listening');
    const before = tree(base.home), managerPeers = productionPeers(base.target, base.location, base.options.runtime), terminalPeers = productionPeers(base.target, base.location, base.options.runtime);
    assert.equal(requests, 0, 'both factories are probe-free'); assert.deepEqual(tree(base.home), before);
    const first = await managerPeers.dependencies!.inspect(base.location), second = await terminalPeers.dependencies!.inspect(base.location);
    assert.deepEqual(first, second); assert.equal(first.runtimeReady, true); assert.equal(first.ollama, 'ready'); assert.equal(requests, 2); assert.deepEqual(tree(base.home), before);
    for (const peers of [managerPeers, terminalPeers]) {
      await assert.rejects(peers.dependencies!.inspect({ ...base.location, installationId: 'another' }), { code: 'identity-mismatch' });
      await assert.rejects(peers.dependencies!.inspect({ ...base.location, home: join(base.root, 'other-home') }), { code: 'identity-mismatch' });
    }
    assert.equal(requests, 2);
    for (const name of ['manager-entry.ts', 'terminal-entry.ts']) {
      const source = readFileSync(fileURLToPath(new URL(`../${name}`, import.meta.url)), 'utf8');
      assert.match(source, /productionPeers\(target, location, runtime\)/); assert.doesNotMatch(source, /dependencyPort\(/);
    }
  } finally { await base.cleanup(); }
});
