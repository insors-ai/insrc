/* Copyright (c) Procix Software India. Licensed under the MIT License. */

import { prepareManagedUpdate, runAcknowledgedManagedUpdate } from '../daemon/managed-update-launch.js';
import { completeManagedUpdate } from '../daemon/managed-update-recovery.js';

try {
	if (!process.connected) throw new Error('managed updater requires a private launch channel');
	const { gate, reserve, pins } = await prepareManagedUpdate();
	await runAcknowledgedManagedUpdate(gate, reserve, pins, async (_gate, update, releasePins) => {
		await completeManagedUpdate(gate, update, releasePins);
	});
} catch (error) {
	process.stderr.write(`managed daemon update: ${error instanceof Error ? error.message : String(error)}\n`);
	process.exitCode = 4;
}
