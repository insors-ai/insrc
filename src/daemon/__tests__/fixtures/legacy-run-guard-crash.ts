/* Copyright (c) Procix Software India. Licensed under the MIT License. */

import { readDarwinIncarnation } from '../../../shared/darwin-lifecycle.js';
import { InstallationMutationGate } from '../../../shared/installation-mutation-gate.js';
import { giveLegacyRunGuard, holdLegacyRunGuard } from '../../legacy-run-guard.js';

const [root, helper, target, boundary] = process.argv.slice(2);
if (root === undefined || helper === undefined || target === undefined || (boundary !== 'before' && boundary !== 'after')) {
	throw new Error('expected fixture root, native helper, candidate PID and crash boundary');
}
const owner = await readDarwinIncarnation(process.pid, helper);
const candidate = await readDarwinIncarnation(Number(target), helper);
const gate = new InstallationMutationGate(root, helper);
const update = await gate.reserve({ kind: 'update', owner,
	predecessor: { priorRelease: 'old', candidateRelease: 'new', priorCommit: 'old', wasRunning: false } });
if (update.kind !== 'update') throw new Error('expected update reservation');
for (const step of ['legacy-launcher-fence', 'predecessor-stop']) {
	await gate.recordIntent(update, step, step);
	await gate.recordReceipt(update, step, step);
}
await holdLegacyRunGuard(gate, update, root, helper);
await gate.recordIntent(update, 'candidate-job', 'new');
await gate.recordReceipt(update, 'candidate-job', JSON.stringify({ incarnation: candidate }));
await giveLegacyRunGuard({
	admit: gate.admit.bind(gate),
	async recordIntent(...args: Parameters<InstallationMutationGate['recordIntent']>) {
		await gate.recordIntent(...args);
		if (boundary === 'before') process.kill(process.pid, 'SIGKILL');
	},
	async recordReceipt(...args: Parameters<InstallationMutationGate['recordReceipt']>) {
		if (boundary === 'after') process.kill(process.pid, 'SIGKILL');
		await gate.recordReceipt(...args);
	},
}, update, root, candidate, helper);
