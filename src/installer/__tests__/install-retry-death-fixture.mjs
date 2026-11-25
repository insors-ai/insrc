// An isolated, captured child is killed by its owning test at an acknowledged
// cleanup boundary. It never launches a daemon or dependency service.
import { readFileSync } from 'node:fs';
import { managerFixture } from './_manager-fixture.js';
import { cleanupOllamaInstallAttempt } from '../ollama-recovery.js';
import { requireTerminal } from '../terminal-admission.js';
const input = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const f = managerFixture(input.home, false);
f.peers.bundle = { ...f.peers.bundle, async resolve() { throw new Error('cleanup reached delivery'); }, async prepare() { throw new Error('cleanup reached preparation'); } };
f.peers.dependencies = {
  async inspect() { throw new Error('cleanup should be interrupted before reconciliation'); },
  async decide() { throw new Error('cleanup reached dependency installation'); },
  async cleanupInstall(location, context) {
    await cleanupOllamaInstallAttempt(location, context, input.policy, { afterTemporaryRemoval: async () => {
      process.send({ boundary: 'temporary-unlinked-before-completion' });
      await new Promise(() => {});
    } });
  },
};
await f.manager().retryInstall(requireTerminal({ stdin: { isTTY: true }, stdout: { isTTY: true }, stderr: { isTTY: true } }), input.operationId);
throw new Error('cleanup was expected to remain at its interrupted boundary');
