import { test } from 'node:test';
import assert from 'node:assert/strict';
import { realpath } from 'node:fs/promises';
import { runConnectionMaintenance } from '../../../cli/services/connection-maintenance.js';
import type { MaintenanceControl } from '../../../cli/services/connection-maintenance.js';
test('maintenance control verifies the old daemon without stopping and never runs maintenance while it survives', async () => {
	const root = await realpath(process.cwd());
	let live = true, command = '/node/out/daemon/index.js', runs = 0;
	const control: MaintenanceControl = { ready: async () => true, registered: async () => true, pid: async () => 123, identity: () => 'a'.repeat(64), command: () => command, alive: () => live, run: async (_, proof) => {
			runs++;
			assert.equal(proof.pid, 123);
			assert.equal(proof.source, 'safe-stop-control');
		} };
	await assert.rejects(runConnectionMaintenance(root, { ...control, ready: async () => false }));

	assert.equal(runs, 0);
	command = '/unrelated/process';
	await assert.rejects(runConnectionMaintenance(root, control));

	command = '/node/out/daemon/index.js';
	await assert.rejects(runConnectionMaintenance(root, control));

	assert.equal(runs, 0);
	live = false;
	await runConnectionMaintenance(root, control);
	assert.equal(runs, 1);
});
