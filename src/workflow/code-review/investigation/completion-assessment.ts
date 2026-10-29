/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { authorPartyOf } from '../../review/party.js';
import { appendImpactRequirements, validateLedgerBasis } from './ledger-catalog.js';
import { validateReviewLedger } from './ledger.js';
import { ledgerEqual, ledgerSnapshot } from './ledger-identity.js';
import { RecoveryError } from './recovery-types.js';
import { SubjectPreparationError } from './types.js';
import type { RecoveryView } from './recovery-replay.js';
import type { CompletionAssessmentV1, CompletionValidationContext } from './completion-types.js';

/** Assess only sc4's verified accepted prefix. No final-reply delta or candidate ledger is an input. */
export async function assessReviewCompletion(raw: RecoveryView, context: CompletionValidationContext): Promise<CompletionAssessmentV1> {
 const view = ledgerSnapshot(raw), { manifest, basis, state } = view;
 const result = (outcome: CompletionAssessmentV1['outcome'], reasons: string[], unresolvedRows: string[] = []): CompletionAssessmentV1 =>
  ledgerSnapshot({runId: manifest.runId, subjectDigest: manifest.subjectDigest, checkpointDigest: state.checkpoint,
   outcome, reasons, unresolvedRows, requiredCriteria: basis.criteria.map(c => c.id)});
 // Recheck the original row universe, not just the self-consistency of a replacement basis.
 validateLedgerBasis(manifest.basis);
 const additions = basis.requirements.filter(r => !manifest.basis.requirements.some(old => old.category === r.category && old.requirementRef === r.requirementRef));
 if (!ledgerEqual(appendImpactRequirements(manifest.basis, additions), basis)
  || manifest.runId !== basis.runId || manifest.subjectDigest !== basis.subject.subjectDigest)
  throw new RecoveryError('corrupt', 'Completion basis differs from the accepted manifest and appended impact obligations.');
 validateReviewLedger(state.ledger, basis, {attempt: {runId: manifest.runId, subjectDigest: manifest.subjectDigest,
  attemptId: state.accepted.at(-1)?.progress.attemptId ?? 'initial'}, receipts: view.receipts});

 const stale: string[] = [];
 if (context.subjectDigest !== manifest.subjectDigest) stale.push('Current subject differs from the accepted subject.');
 if (context.policyDigest !== manifest.policyDigest || !ledgerEqual(context.compatibility, manifest.compatibility)) stale.push('Review policy or runtime compatibility changed.');
 const build = basis.subject.build;
 if (context.build.artifactId !== build.artifactId || context.build.revision !== build.revision || context.build.sourceCommit !== build.sourceCommit)
  stale.push('Canonical BUILD identity, revision or source changed.');
 // Infrastructure errors propagate; they must not be misrepresented as a proven stale pin.
 try { await context.assertFresh(); }
 catch (error) {
  if ((error instanceof RecoveryError && error.code === 'stale') || (error instanceof SubjectPreparationError && ['stale-contract', 'unapproved-contract', 'invalid-object'].includes(error.code))) stale.push(error.message);
  else throw error;
 }
 if (stale.length) return result('stale', stale);

 const author = authorPartyOf(context.build.meta), conflicts: string[] = [];
 if (author === 'unknown' || context.reviewerParty === 'unknown' || author === context.reviewerParty)
  conflicts.push('Completion requires known, independent BUILD author and authenticated reviewer parties.');
 for (const conflict of context.expectationConflicts) conflicts.push(`Expectation conflict ${conflict.reference}: ${conflict.reason}`);
 if (conflicts.length) return result('conflict', conflicts);

 const unresolved = state.ledger.coverage.filter(r => r.disposition === 'pending' || r.disposition === 'unverified').map(r => r.rowId);
 const reasons: string[] = [];
 if (unresolved.length) reasons.push('Required coverage rows remain pending or unverified.');
 for (const block of basis.subject.packets.flatMap(p => p.blocks)) {
  const last = [...state.accepted].reverse().find(a => a.progress.blockId === block.blockId);
  if (!last || last.progress.disposition !== 'reviewed') { unresolved.push(block.blockId); reasons.push(`Selected block ${block.blockId} has no final reviewed disposition.`); }
 }
 if (view.outstandingWork.length) { unresolved.push(...view.outstandingWork); reasons.push('Accepted outstanding work remains unresolved.'); }
 if (view.accounting.attempts.some(a => a.state === 'issued' || a.state === 'partially-accepted')) reasons.push('An issued investigation attempt is not settled.');
 if (state.uncertainProgressId !== null) reasons.push('Progress acceptance remains uncertain.');
 if (!['running', 'completion-requested', 'completed'].includes(view.lifecycle.state)) reasons.push(`Run lifecycle is ${view.lifecycle.state}.`);
 return reasons.length ? result('incomplete', reasons, [...new Set(unresolved)]) : result('publishable', []);
}
