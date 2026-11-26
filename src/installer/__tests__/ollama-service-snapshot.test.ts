import assert from 'node:assert/strict';
import fs from 'node:fs';
import io from 'node:fs/promises';
import { once } from 'node:events';
import { syncBuiltinESMExports } from 'node:module';
import { join } from 'node:path';
import { ollamaFixture } from './_ollama-fixture.js';
import { privateRuntimeTest } from './_private-runtime-test.js';
import { prepareOllama } from '../ollama-prepare.js';
import { startOllamaService } from '../ollama-service.js';
import { canonicalJson } from '../release-descriptor.js';
import { serviceFact, servicePaths } from '../ollama-service-records.js';
import type { OllamaServiceFact, OllamaServiceFrame } from '../ollama-service-records.js';

async function preparedFixture() {
  const f = await ollamaFixture('service-snapshot');
  try {
    const { policy, offer } = await f.input();
    const prepared = await prepareOllama(f.location, policy, offer, f.context(), { recheck: f.recheck, transport: f.transport });
    return { ...f, prepared, paths: servicePaths(join(f.home, prepared.identity.recordRelativePath)) };
  } catch (error) { await f.cleanup(); throw error; }
}

// Controlled append-only worker facts, not a real service or native qualification.
function publish(path: string, frame: OllamaServiceFrame, state: OllamaServiceFact['state'], extra: Pick<OllamaServiceFact, 'code' | 'signal'> = {}) {
  fs.writeFileSync(path, canonicalJson(serviceFact(frame.admission, state, extra)), { flag: 'wx', mode: 0o600 });
}

privateRuntimeTest(import.meta.url, 'legal service fact publication during reconciliation preserves causal consistency and rejects persistent contradictions', async () => {
  for (const transition of ['advancing', 'contradictory'] as const) {
    const f = await preparedFixture(), exists = fs.existsSync;
    let published = false, launches = 0;
    try {
      const pending = startOllamaService(f.location, f.prepared, f.context(), {
        workerEntrypoint: 'controlled-fact-fixture', recheck: f.recheck, readinessMs: 3000,
        launch: async frame => {
          launches++; f.server.listen(f.port, '127.0.0.1'); await once(f.server, 'listening');
          if (transition === 'contradictory') publish(f.paths.running, frame, 'spawned');
          else {
            fs.existsSync = path => {
              if (path === f.paths.running && !published) {
                published = true;
                publish(f.paths.launch, frame, 'launch-admitted');
                publish(f.paths.running, frame, 'spawned');
              }
              return exists(path);
            };
            syncBuiltinESMExports();
          }
          return { started: true };
        },
      });
      if (transition === 'contradictory') await assert.rejects(pending, { code: 'dependency-uncertain' });
      else {
        const result = await pending;
        assert.equal(published, true);
        assert.equal(result.ollama, 'ready', JSON.stringify(result));
        assert.equal(JSON.parse(fs.readFileSync(f.paths.result, 'utf8')).state, 'ready');
      }
      assert.equal(launches, 1); assert.equal(f.server.listening, true);
    } finally { fs.existsSync = exists; syncBuiltinESMExports(); await f.cleanup(); }
  }
});

privateRuntimeTest(import.meta.url, 'exit published during reconciliation rechecks surviving and closed endpoints before recording the terminal result', async () => {
  for (const endpointSurvives of [true, false]) {
    const f = await preparedFixture(), open = io.open;
    let published = false, launches = 0;
    try {
      const result = await startOllamaService(f.location, f.prepared, f.context(), {
        workerEntrypoint: 'controlled-fact-fixture', recheck: f.recheck, readinessMs: 3000,
        launch: async frame => {
          launches++; f.server.listen(f.port, '127.0.0.1'); await once(f.server, 'listening');
          publish(f.paths.launch, frame, 'launch-admitted');
          publish(f.paths.logError, frame, 'unverified');
          io.open = async (...args: Parameters<typeof open>) => {
            const handle = await open(...args);
            if (args[0] === f.paths.logError && !published) {
              published = true;
              publish(f.paths.running, frame, 'spawned');
              publish(f.paths.exit, frame, 'closed', { code: 1, signal: null });
              if (!endpointSurvives) {
                f.server.closeAllConnections();
                await new Promise<void>(resolve => f.server.close(() => resolve()));
              }
            }
            return handle;
          };
          syncBuiltinESMExports();
          return { started: true };
        },
      });
      assert.equal(published, true); assert.equal(launches, 1);
      assert.equal(result.ollama, endpointSurvives ? 'ready' : 'installed-not-running', JSON.stringify(result));
      assert.equal(f.server.listening, endpointSurvives);
      assert.equal(JSON.parse(fs.readFileSync(f.paths.result, 'utf8')).state, endpointSurvives ? 'ready' : 'unverified');
      assert.equal(JSON.parse(fs.readFileSync(f.paths.exit, 'utf8')).endpointOwnership, 'unproven');
    } finally { io.open = open; syncBuiltinESMExports(); await f.cleanup(); }
  }
});
