/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { recoveryFixture } from './recovery-fixtures.js';
import { inspectionFixture } from './ledger-fixtures.js';
import { progressFor } from './continuation-fixtures.js';
import { evidenceFromReceipt } from '../ledger-evidence.js';
import { BlockProgressCoordinator } from '../progress.js';
import type { CompletionValidationContext } from '../completion-types.js';
import type { TrustedInspectionReceipt } from '../ledger-types.js';

/** Actual journal admission/replay, with native source/test receipts and every required row assessed. */
export async function completedInvestigationFixture() {
 const f = recoveryFixture();
 try {
  await f.store.prepare(f.manifest); await f.store.claim(300000);
  const leaseId = f.store.status().owner!.leaseId;
  await f.store.issueAttempt(leaseId, 1, f.turn, 1000);
  const receipt = inspectionFixture(f.basis);
  const passing: TrustedInspectionReceipt = {...receipt, receiptId:'test-pass', kind:'test-result', role:'context-only',
   source:{...receipt.source, revision:f.basis.subject.build.sourceCommit}, readReceipt:null, blockId:null, testResult:'pass'};
  const receipts = [receipt, passing], evidenceIds = receipts.map(r => evidenceFromReceipt(f.basis, r).evidenceId);
  const coordinator = new BlockProgressCoordinator(f.turn, {...f.context,
   ports:f.store.ports(1, f.turn.attemptId, leaseId), validation:{attempt:receipt.attempt, receipts}});
  await coordinator.accept({...progressFor(f.turn, 'block-1', 0), disposition:'reviewed', evidenceIds,
   coverageUpdates:f.context.state.ledger.coverage.map(row => ({...row, disposition:'satisfied', evidenceIds,
    rationale:'Inspected pinned source and verified passing test result', assessedByAttempt:receipt.attempt.attemptId}))});
  await coordinator.accept({...progressFor(f.turn, 'block-2', 1), disposition:'reviewed', evidenceIds});
  await f.store.settleAttempt(leaseId, 1, f.turn.attemptId, 'accepted', 20);
  const context: CompletionValidationContext = {subjectDigest:f.manifest.subjectDigest, policyDigest:f.manifest.policyDigest,
   compatibility:f.manifest.compatibility, build:{...f.basis.subject.build, meta:{authoredBy:'controller'}}, reviewerParty:'daemon',
   expectationConflicts:[], assertFresh:async()=>{}};
  return {...f, leaseId, context, view:f.store.replay()};
 } catch(error) { f.cleanup(); throw error; }
}
