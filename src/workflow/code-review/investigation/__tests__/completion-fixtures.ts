/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { recoveryFixture } from './recovery-fixtures.js';
import { inspectionFixture } from './ledger-fixtures.js';
import { progressFor } from './continuation-fixtures.js';
import { evidenceFromReceipt } from '../ledger-evidence.js';
import { BlockProgressCoordinator } from '../progress.js';
import type { CompletionValidationContext } from '../completion-types.js';
import type { TrustedInspectionReceipt } from '../ledger-types.js';

/** Actual journal admission/replay, with native source/test receipts and every required row assessed. */
export async function completedInvestigationFixture(severity?: 'HIGH'|'MED'|'LOW') {
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
  const first=f.context.state.ledger.coverage[0]!;
  const findings=severity?[{findingId:'finding-1',criterion:'adherence',severity,confidence:'breach' as const,evidenceIds,
   expectationRefs:[first.requirementRef],message:'Inspected approved contract violation'}]:[];
  await coordinator.accept({...progressFor(f.turn, 'block-1', 0), disposition:'reviewed', evidenceIds,findings,
   coverageUpdates:f.context.state.ledger.coverage.map(row => ({...row, disposition:severity&&row===first?'finding':'satisfied', evidenceIds,
    findingIds:severity&&row===first?['finding-1']:[],rationale:'Inspected pinned source and verified passing test result', assessedByAttempt:receipt.attempt.attemptId}))});
  await coordinator.accept({...progressFor(f.turn, 'block-2', 1), disposition:'reviewed', evidenceIds});
  await f.store.settleAttempt(leaseId, 1, f.turn.attemptId, 'accepted', 20);
  const context: CompletionValidationContext = {subjectDigest:f.manifest.subjectDigest, policyDigest:f.manifest.policyDigest,
   compatibility:f.manifest.compatibility, build:{...f.basis.subject.build, meta:{authoredBy:'controller'}}, reviewerParty:'daemon',
   expectationConflicts:[], assertFresh:async()=>{}};
  return {...f, leaseId, context, view:f.store.replay()};
 } catch(error) { f.cleanup(); throw error; }
}

import type { PrepareCompletionInput } from '../completion-publication.js';
export async function publicationFixture(severity?:'HIGH'|'MED'|'LOW'){
 const f=await completedInvestigationFixture(severity);
 const input:PrepareCompletionInput={context:f.context,repoPath:f.repo,epicHash:'c32aa60534232f36',storyId:'s1',
  buildRecord:{meta:{revision:1},body:{commit:f.basis.subject.build.sourceCommit}},createdAt:'2026-10-29T12:00:00Z',model:'fixture',
  sourceMode:'source-only',expectedRevision:null,expectedHeadDigest:null};
 return {...f,input};
}
