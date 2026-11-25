import { EventEmitter } from 'node:events';
import { PassThrough, Readable } from 'node:stream';
import { readFileSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { terminalAbort } from '../../../out/installer/terminal-abort.js';
import { createDependencyOperationContext } from '../../../out/installer/dependency-context.js';
import { dependencyReadIo, inspectDependenciesClosed } from '../../../out/installer/dependencies.js';
import { prepareOllama } from '../../../out/installer/ollama-prepare.js';
import { startOllamaService } from '../../../out/installer/ollama-service.js';
import { executeOllamaServiceWorker } from '../../../out/installer/ollama-service-worker.js';
import { servicePaths } from '../../../out/installer/ollama-service-records.js';
const input = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const terminal = createInterface({ input: process.stdin }), abort = terminalAbort(terminal, text => process.stderr.write(text));
const context = createDependencyOperationContext(input.location, input.target.os, { operationId: 'prepare-operation', attemptNonce: 'a'.repeat(64), signal: abort.signal, assertCurrent() {}, progress() {} });
const options = { runtimeDirectory: input.runtimeDirectory, userHome: input.root, environment: { PATH: input.bin }, policies: [input.policy],
  io: { ...dependencyReadIo, async stat(file) { const path = relative(input.root, file); if (path === '..' || path.startsWith('../') || path.startsWith('..\\')) throw Object.assign(new Error('fixture absence'), { code: 'ENOENT' }); return dependencyReadIo.stat(file); } } };
const recheck = signal => inspectDependenciesClosed(input.location, input.target, options, { signal });
const waitForAbort = () => new Promise(resolve => { if (abort.signal.aborted) resolve(); else abort.signal.addEventListener('abort', resolve, { once: true }); });
let proxy, worker;
process.on('message', message => {
  if (message.type === 'service-spawned') { proxy?.emit('spawn'); if (input.mode === 'supervisor') process.send({ type: 'boundary', mode: input.mode }); }
  if (message.type === 'service-closed') proxy?.emit('close', message.code, message.signal);
});
const launchProxy = (executable, argv, settings) => {
  proxy = new EventEmitter(); proxy.stdout = new PassThrough(); proxy.stderr = new PassThrough();
  process.send({ type: 'launch-service', executable, argv, environment: settings.env }); return proxy;
};
try {
  if (input.mode === 'preparation') {
    await prepareOllama(input.location, input.policy, input.offer, context, { recheck,
      transport: async () => ({ status: 200, body: Readable.from([readFileSync(input.bytesFile)]) }),
      beforeFiniteClose: async () => { process.send({ type: 'boundary', mode: input.mode }); await waitForAbort(); } });
  } else if (input.mode === 'supervisor') {
    await executeOllamaServiceWorker(input.location, input.prepared.identity.recordRelativePath, { target: input.target, launch: launchProxy });
  } else {
    const prepared = { ...input.prepared, preparationDeadline: performance.now() + 15000 };
    let launched = false;
    await startOllamaService(input.location, prepared, context, { workerEntrypoint: 'trusted-process-fixture', readinessMs: 10000,
      recheck: async signal => {
        const check = await recheck(signal);
        if (launched && check.report.ollama === 'ready' && existsSync(servicePaths(join(input.location.home, prepared.identity.recordRelativePath)).running)) {
          process.send({ type: 'boundary', mode: input.mode }); await waitForAbort();
        }
        return check;
      },
      launch: async frame => {
        // The owning parent holds the actual service ChildProcess, allowing a
        // positive close assertion even after this supervisor is killed.
        worker = executeOllamaServiceWorker(input.location, prepared.identity.recordRelativePath, { target: input.target,
          launch: launchProxy });
        void worker.catch(error => { process.stderr.write(`${error.code ?? 'worker-failed'}\n`); }); launched = true; return { started: true };
      } });
  }
  throw new Error('fixture expected interruption');
} catch (error) {
  if (!abort.signal.aborted) throw error;
  process.send({ type: 'drained', code: error.code ?? error.name });
} finally { abort.dispose(); if (process.connected) process.disconnect(); }
