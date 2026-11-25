import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { executeOllamaServiceWorker } from '../../../out/installer/ollama-service-worker.js';
import { parseServiceFrame, servicePaths } from '../../../out/installer/ollama-service-records.js';
const [home, record, mode = 'ready'] = process.argv.slice(2);
const frame = parseServiceFrame(JSON.parse(readFileSync(servicePaths(record).frame, 'utf8'))), state = join(dirname(home), 'service-state');
try {
  await executeOllamaServiceWorker(frame.location, frame.attempt.identity.recordRelativePath, { target: frame.policy.target,
    launch(executable, argv, settings) {
      assert.equal(executable, join(home, frame.attempt.identity.payloadRelativePath, frame.policy.layout.executable)); assert.deepEqual(argv, ['serve']);
      writeFileSync(join(dirname(home), 'launch-arguments.json'), JSON.stringify({ executable, argv }));
      return spawn(process.execPath, [fileURLToPath(new URL('./ollama-process-fixture.mjs', import.meta.url)), ...argv], {
        ...settings, env: { ...settings.env, INSRC_TEST_SERVICE_STATE: state, INSRC_TEST_SERVICE_MODE: mode },
      });
    },
  });
} catch (error) { process.stderr.write(`${error?.code ?? 'worker-failed'}\n`); process.exitCode = 1; }
