/* Copyright (c) Procix Software India. Licensed under the MIT License. */

import type { DarwinIncarnation } from '../shared/darwin-lifecycle.js';
import { classifyMutationRecovery } from '../shared/installation-mutation-gate.js';
import type {
	DurableUpdateOutcome, InstallationJournal, InstallationMutationGate, MutationReservation, UpdateDecision,
} from '../shared/installation-mutation-gate.js';
import type { HandoffReceipt } from './managed-update-handoff.js';

type Update = Extract<MutationReservation, { kind: 'update' }>;
type ActiveGate = Pick<InstallationMutationGate, 'publishOutcome' | 'release'>;
type RecoveryGate = ActiveGate & Pick<InstallationMutationGate, 'read' | 'claimRecovery'>;

function detail(error: unknown): string {
	return (error instanceof Error ? error.message : String(error)).trim().slice(0, 1_024) || 'unknown update error';
}

async function finish(gate: ActiveGate, update: Update, decision: UpdateDecision, message: string): Promise<DurableUpdateOutcome> {
	// Publication is the commit point. If it throws, retain the active
	// reservation and let recovery inspect the durable state before acting.
	await gate.publishOutcome(update, decision, message);
	if (decision !== 'operator-recovery') await gate.release(update);
	return { id: update.id, decision, detail: message };
}

interface TransactionEffects {
	readonly stage: () => Promise<HandoffReceipt>;
	readonly verifyCandidate: (receipt: HandoffReceipt) => Promise<void>;
	readonly rollback: () => Promise<void>;
}

/** Finalize exactly once, after verified candidate readiness or verified predecessor restoration. */
export async function settleManagedUpdate(gate: ActiveGate, update: Update, effects: TransactionEffects): Promise<DurableUpdateOutcome> {
	try {
		const receipt = await effects.stage();
		await effects.verifyCandidate(receipt);
	} catch (error) {
		const cause = detail(error);
		try { await effects.rollback(); }
		catch (rollbackError) {
			return finish(gate, update, 'operator-recovery', `${cause}. Rollback requires recovery. ${detail(rollbackError)}`);
		}
		return finish(gate, update, 'rolled-back', cause);
	}
	return finish(gate, update, 'committed', 'Candidate readiness and release selector verified');
}

interface RecoveryEffects {
	/** Read-only observations that bind ownership to the unchanged journal. */
	readonly verifyOwnership: (state: InstallationJournal) => Promise<boolean>;
	readonly verifyCommitted: (update: Update) => Promise<void>;
	readonly verifyRolledBack: (update: Update) => Promise<void>;
	readonly rollback: (update: Update, purpose: 'lifecycle' | 'reconcile') => Promise<void>;
}

/** A previously published outcome determines the only permissible recovery path. */
export async function recoverManagedTransaction(
	gate: RecoveryGate, id: string, owner: DarwinIncarnation, effects: RecoveryEffects,
): Promise<DurableUpdateOutcome> {
	const before = await gate.read();
	if (before.active === null && before.outcome?.id === id && before.outcome.decision !== 'operator-recovery') return before.outcome;
	const decision = await gate.claimRecovery(id, owner, async state =>
		state.active?.kind === 'update' && await effects.verifyOwnership(state));
	const snapshot = await gate.read();
	const update = snapshot.active;
	if (update?.kind !== 'update' || update.id !== id || classifyMutationRecovery(snapshot) !== decision) {
		throw new Error('managed update changed during recovery');
	}
	if (decision === 'uncommitted') {
		try { await effects.rollback(update, 'lifecycle'); }
		catch (error) { return finish(gate, update, 'operator-recovery', `Rollback requires recovery. ${detail(error)}`); }
		return finish(gate, update, 'rolled-back', 'Predecessor restored after update controller exit');
	}
	if (decision === 'activate') await effects.verifyCommitted(update);
	else if (decision === 'finish-rollback') await effects.verifyRolledBack(update);
	else if (decision === 'fenced') await effects.rollback(update, 'reconcile');
	else throw new Error('managed update has no recoverable reservation');
	if (snapshot.outcome?.id !== id) throw new Error('managed update outcome does not match recovery');
	await gate.release(update);
	return snapshot.outcome;
}
