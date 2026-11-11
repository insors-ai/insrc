/* Copyright (c) Procix Software India. Licensed under the MIT License. */

import { realpath } from 'node:fs/promises';
import { runAcknowledgedManagedUpdate } from '../daemon/managed-update-launch.js';
import { admitManagedPreparation, runManagedPreparation } from '../daemon/managed-update-preparation.js';
import { PATHS } from '../shared/paths.js';

try {
	if (!process.connected) throw new Error('managed updater requires a private launch channel');
	const { gate, reserve, prior } = await admitManagedPreparation(await realpath(PATHS.insrc));
	await runAcknowledgedManagedUpdate(gate, reserve, prior, (_gate, update, selected) => runManagedPreparation(gate, update, selected));
} catch (error) {
	process.stderr.write(`managed daemon update: ${error instanceof Error ? error.message : String(error)}\n`);
	process.exitCode = 4;
}
