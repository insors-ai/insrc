import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { privateRuntimeTest } from './_private-runtime-test.js';
import { ollamaFixture } from './_ollama-fixture.js';
import { prepareOllama, closedOllamaAttempts } from '../ollama-prepare.js';
import { dependencyPort } from '../dependencies.js';
import { createDependencyRetryContext } from '../dependency-context.js';
import { cleanupOllamaInstallAttempt } from '../ollama-recovery.js';
import { dependencyAttemptPaths } from '../ollama-policy.js';
import { servicePaths } from '../ollama-service-records.js';
import { spawnFixture, stopOwnedChildren } from '../../daemon/tools/__tests__/_proc.js';

privateRuntimeTest(import.meta.url, 'sighup-sigterm-and-sigkill-at-preparation-and-handoff-preserve-correct-evidence', async () => {
  const signals = process.platform === 'win32' ? ['EOF', 'SIGKILL'] as const : ['SIGHUP', 'SIGTERM', 'SIGKILL', 'SIGINT', 'EOF'] as const;
  for (const mode of ['preparation', 'handoff'] as const) for (const signal of signals) {
    const f = await ollamaFixture(), children: ChildProcess[] = []; let service: ChildProcess | undefined;
    const state = join(f.root, 'service-state');
    try {
      const { policy, offer } = await f.input(), prepared = mode === 'handoff' ? await prepareOllama(f.location, policy, offer, f.context(), { recheck: f.recheck, transport: f.transport }) : undefined;
      const bytesFile = join(f.root, 'fixture-asset'); writeFileSync(bytesFile, f.bytes);
      const input = join(f.root, 'signal-input.json'); writeFileSync(input, JSON.stringify({ root: f.root, bin: f.bin, location: f.location, target: f.target,
        policy, offer, mode, bytesFile, prepared }));
      const child = spawnFixture(f.options.runtime.node, [fileURLToPath(new URL('./ollama-signal-fixture.mjs', import.meta.url)), input], { stdio: ['pipe', 'ignore', 'pipe', 'ipc'] }); children.push(child);
      let diagnostic = '', reached!: () => void;
      child.stderr!.on('data', bytes => { diagnostic = (diagnostic + bytes.toString()).slice(-8192); });
      const boundary = new Promise<void>(resolve => { reached = resolve; });
      child.on('message', (message: { type: string; environment?: NodeJS.ProcessEnv; argv?: string[]; executable?: string }) => {
        if (message.type === 'boundary') reached();
        if (message.type !== 'launch-service') return;
        assert.deepEqual(message.argv, ['serve']); assert.equal(message.executable, join(prepared!.directory, policy.layout.executable));
        service = spawnFixture(process.execPath, [fileURLToPath(new URL('./ollama-process-fixture.mjs', import.meta.url)), 'serve'], {
          env: { ...message.environment, INSRC_TEST_SERVICE_STATE: state, INSRC_TEST_SERVICE_MODE: 'silent' }, stdio: ['ignore', 'ignore', 'pipe'] }); children.push(service);
        service.stderr!.resume(); service.once('spawn', () => { if (child.connected) child.send({ type: 'service-spawned' }); });
        service.once('close', (code, closeSignal) => { if (child.connected) child.send({ type: 'service-closed', code, signal: closeSignal }); });
      });
      const closed = once(child, 'close');
      await Promise.race([boundary, closed.then(result => { throw new Error(`signal fixture closed ${result}: ${diagnostic}`); })]);
      const paths = dependencyAttemptPaths('prepare-operation', 'a'.repeat(64)), record = join(f.home, paths.recordRelativePath), stage = join(f.home, paths.stageRelativePath);
      if (signal === 'EOF') child.stdin!.end(); else assert.equal(child.kill(signal), true); // Only this captured test actor.
      const result = await closed;
      if (signal === 'SIGKILL') assert.deepEqual(result, [null, 'SIGKILL']); else { assert.deepEqual(result, [0, null], diagnostic); assert.match(diagnostic, /draining finite work/); }
      if (mode === 'preparation') {
        assert.equal(existsSync(offer.destination), false);
        assert.equal(existsSync(stage), signal === 'SIGKILL');
        if (signal === 'SIGKILL') await assert.rejects(closedOllamaAttempts(f.location), { code: 'dependency-uncertain' });
      } else {
        assert.ok(service); assert.equal(service.exitCode, null); assert.equal(existsSync(servicePaths(record).exit), false, 'supervisor close never certifies retained service exit');
        const dir = dirname(record), before = readdirSync(dir).sort().map(name => [name, readFileSync(join(dir, name)).toString('base64')]);
        assert.equal((await dependencyPort(f.target, f.location, f.options).inspect(f.location)).ollama, 'ready');
        assert.deepEqual(readdirSync(dir).sort().map(name => [name, readFileSync(join(dir, name)).toString('base64')]), before, 'inspection does not repair a stale marker');
        if (signal === 'SIGKILL') await assert.rejects(closedOllamaAttempts(f.location), { code: 'dependency-uncertain' });
      }
      await cleanupOllamaInstallAttempt(f.location, createDependencyRetryContext(f.location, f.target.os, { ...f.context() }), policy);
      assert.equal((await closedOllamaAttempts(f.location)).length, 1); assert.equal(existsSync(stage), false);
      assert.equal(readFileSync(join(f.home, 'application-data'), 'utf8'), 'retain');
      if (mode === 'handoff') { assert.equal(existsSync(prepared!.directory), true); assert.equal(service!.exitCode, null); }
    } finally {
      mkdirSync(state, { recursive: true }); writeFileSync(join(state, 'stop'), 'close owned fixture');
      if (service && service.exitCode === null && service.signalCode === null) assert.deepEqual(await once(service, 'close'), [0, null]);
      await stopOwnedChildren(children); await f.cleanup();
    }
  }
});
