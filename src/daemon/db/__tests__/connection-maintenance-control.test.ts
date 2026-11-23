import { test } from 'node:test';
import assert from 'node:assert/strict';
import { realpath } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { runConnectionMaintenance } from '../../../cli/services/connection-maintenance.js';
import type { MaintenanceControl } from '../../../cli/services/connection-maintenance.js';
import { processObservation } from '../management-owner-lease.js';

test('maintenance consumes captured stopped-process proof without live IPC or fabricated dead-process observations', { timeout: 10000 }, async () => {
  const root = await realpath(process.cwd());
  const child = spawn(process.execPath, ['-e', 'process.stdout.write("ready");setInterval(()=>{},1000)'], { stdio: ['ignore', 'pipe', 'ignore'] });
  const exited = once(child, 'close');
  try {
    await once(child.stdout, 'data');
    const pid = child.pid!;
    const identity = processObservation.identity(pid);
    assert.ok(identity, 'capture identity while this owned fixture is alive');
    const proof = { source: 'safe-stop-control' as const, pid, processIdentity: identity, stoppedAt: new Date().toISOString() };
    let runs = 0;
    const control: MaintenanceControl = {
      ready: async () => true, proof: async () => proof, alive: processObservation.alive,
      run: async (canonical, observed) => { runs++; assert.equal(canonical, root); assert.deepEqual(observed, proof); },
    };
    await assert.rejects(runConnectionMaintenance(root, { ...control, ready: async () => false }), /verified build gates/);
    await assert.rejects(runConnectionMaintenance(root, control), /previous daemon to exit/);
    assert.equal(runs, 0);
    child.kill('SIGTERM'); await exited;
    assert.equal(processObservation.identity(pid), undefined, 'a dead process supplies no live identity');
    await runConnectionMaintenance(root, control);
    assert.equal(runs, 1, 'the independently captured proof permits the offline entry');
    await assert.rejects(runConnectionMaintenance(root, { ...control, proof: async () => ({ ...proof, processIdentity: '' }) }), /stopped-daemon evidence/);
    assert.equal(runs, 1);
  } finally { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); await exited; }
});
