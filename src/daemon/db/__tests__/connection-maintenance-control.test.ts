import { test } from 'node:test';
import assert from 'node:assert/strict';
import { realpath } from 'node:fs/promises';
import { runConnectionMaintenance } from '../../../cli/services/connection-maintenance.js';
import type { MaintenanceControl } from '../../../cli/services/connection-maintenance.js';
test('maintenance control verifies the old daemon before stopping and never runs maintenance while it survives', async () => {
	const root = await realpath(process.cwd());
	let live = true, command = '/node/out/daemon/index.js', stops = 0, runs = 0;
	const control: MaintenanceControl = { registered: async () => true, pid: async () => 123, identity: () => 'a'.repeat(64), command: () => command, alive: () => live, stop: async () => {
			stops++;
		}, run: async (_, proof) => {
			runs++;
			assert.equal(proof.pid, 123);
			assert.equal(proof.source, 'safe-stop-control');
		} };
	command = '/unrelated/process';
	await assert.rejects(runConnectionMaintenance(root, control));
	assert.equal(stops, 0);
	command = '/node/out/daemon/index.js';
	await assert.rejects(runConnectionMaintenance(root, control));
	assert.equal(stops, 1);
	assert.equal(runs, 0);
	await runConnectionMaintenance(root, { ...control, stop: async () => {
			stops++;
			live = false;
		} });
	assert.equal(runs, 1);
});
