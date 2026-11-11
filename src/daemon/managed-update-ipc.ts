/* Copyright (c) Procix Software India. Licensed under the MIT License. */

import { realpath } from 'node:fs/promises';
import { InstallationMutationGate } from '../shared/installation-mutation-gate.js';
import type { InstallationJournal } from '../shared/installation-mutation-gate.js';
import { PATHS } from '../shared/paths.js';
import type { DaemonUpdateOutcome } from '../shared/types.js';
import { readInstalledCommit } from './installed-commit.js';
import { isManagedDaemon } from './managed-daemon-lifecycle.js';
import { readUpdateOutcome } from './update-runner.js';

type JournalReader = Pick<InstallationMutationGate, 'read'>;

async function readJournal(gate?: JournalReader): Promise<InstallationJournal> {
	return (gate ?? new InstallationMutationGate(await realpath(PATHS.insrc))).read();
}

/** One request-time rule for both status paths and the early probation listener. */
export async function readPublicInstalledCommit(
	gate?: JournalReader, probationId?: string, actual = readInstalledCommit,
): Promise<string> {
	if (gate === undefined && !isManagedDaemon()) return actual();
	try {
		const { active, outcome } = await readJournal(gate);
		if (probationId !== undefined) {
			if (outcome?.id === probationId && outcome.decision === 'committed') return actual();
			if (active?.kind !== 'update' || active.id !== probationId) return '';
		}
		if (active?.kind === 'update' && (outcome?.id !== active.id || outcome.decision !== 'committed')) {
			return active.predecessor.priorCommit;
		}
		return actual();
	} catch {
		// An unreadable fence cannot make a provisional release public.
		return '';
	}
}

export async function readPublicUpdateOutcome(gate?: JournalReader): Promise<DaemonUpdateOutcome | null> {
	if (gate === undefined && !isManagedDaemon()) return readUpdateOutcome();
	try {
		const { active, outcome } = await readJournal(gate);
		if (outcome?.finishedAt === undefined || (active?.kind === 'update' && outcome.id !== active.id)) return null;
		return {
			updateId: outcome.id,
			finishedAt: outcome.finishedAt,
			...(outcome.decision === 'committed' ? { state: 'succeeded' } : { state: 'failed', error: outcome.detail }),
		};
	} catch {
		return null;
	}
}
