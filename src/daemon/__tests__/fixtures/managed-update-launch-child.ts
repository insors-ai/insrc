/* Copyright (c) Procix Software India. Licensed under the MIT License. */

import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readDarwinIncarnation } from '../../../shared/darwin-lifecycle.js';
import { InstallationMutationGate } from '../../../shared/installation-mutation-gate.js';
import type { MutationReservation } from '../../../shared/installation-mutation-gate.js';
import type { ManagedUpdatePins } from '../../managed-update-handoff.js';
import { runAcknowledgedManagedUpdate } from '../../managed-update-launch.js';

const root = process.argv[2]!;
const gate = new InstallationMutationGate(root);
const owner = await readDarwinIncarnation(process.pid);
const result = await runAcknowledgedManagedUpdate(gate, async () => gate.reserve({
	kind: 'update', owner,
	predecessor: { priorRelease: 'old', candidateRelease: 'new', priorCommit: 'prior', wasRunning: true },
}) as Promise<Extract<MutationReservation, { kind: 'update' }>>, {} as ManagedUpdatePins, async () => {
	await writeFile(join(root, 'admitted'), 'helper was released');
	return { job: { target: 'fixture-job', pid: null }, generation: null };
});
if (result === undefined) await writeFile(join(root, 'cancelled'), 'untouched reservation was cancelled');
