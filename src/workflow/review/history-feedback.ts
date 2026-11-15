/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { isDeepStrictEqual as same } from 'node:util';
import { decodeStoredCheckpoint } from '../code-review/task-review/admission-checkpoint.js';
import { qualifiedCodeView } from '../code-review/task-review/worker-checkpoint.js';
import { restoreAcceptedAssignments } from '../code-review/task-review/attribution-binding.js';
import { validateTaskResult, validateResultOrigins, aggregateTaskStatus } from '../code-review/task-review/results.js';
import { resultReferences } from '../code-review/task-review/record.js';
import { reviewPath } from '../code-review/task-review/contracts.js';
import type { PreparedReviewPacket } from '../code-review/task-review/packet.js';
import type { ReviewSources } from '../code-review/task-review/sources.js';
import { decodeStoredDesignCheckpoint } from './design-review/admission-checkpoint.js';
import { qualifiedDesignProjection, validateStoredDesignIdentity } from './design-review/checkpoint.js';
import { validateDesignPlan, validateDesignImpact, assessDesignResult, designRequiredReferences, consolidateDesignReview } from './design-review/results.js';
import { designCheckpointPath } from './design-review/checkpoint.js';
import type { PreparationHistory, HistoryValidation } from './history-binding.js';
import { reviewWorkerCheckpoint } from '../../daemon/threads/review-worker-contract.js';

import { encodeReviewSourceResult, reviewSourceQueryDigest } from './source-session.js';
import type { CapturedHistoryEvidence } from './history-evidence.js';
import { preparationSemanticHistory } from './preparation-semantic-history.js';

type PublicationVerifier = (history: PreparationHistory) => Promise<HistoryValidation>;
const historical = preparationSemanticHistory;
async function publication(next: PreparationHistory, previous: PreparationHistory | undefined, verify: PublicationVerifier | undefined): Promise<HistoryValidation> {
 const published = (a: PreparationHistory['attempts'][number]) => 'review-response' in a ? a['review-response'].crPublication === 'complete' : 'publication' in a && a.publication?.state === 'complete';
 if (!next.attempts.some(published) || previous && same(next.attempts.map(a => 'review-response' in a ? a['review-response'].crPublication : 'publication' in a ? a.publication : undefined), previous.attempts.map(a => 'review-response' in a ? a['review-response'].crPublication : 'publication' in a ? a.publication : undefined))) return {};
 if (!verify) throw new Error('Permanent publication verification required'); return verify(next);
}

/** Same attribution/result/origin validators as admission, but with already
 * qualified views. No prepareReviewPacket or model invocation is repeated. */
export function codeHistoryFeedback(prepared: ReadonlyMap<number, PreparedReviewPacket>, sources: ReviewSources, verifyPublication?: PublicationVerifier) {
 const references = new Set<string>(), commits = new Set<string>();
 return async (next: PreparationHistory, previous?: PreparationHistory): Promise<HistoryValidation> => {
  const evidence: CapturedHistoryEvidence[] = [];
  if (!('storyId' in next)) throw new Error('Expected code feedback');
  const cp = qualifiedCodeView(decodeStoredCheckpoint(historical(next))); if (!cp) throw new Error('No qualified code history');
  const prior = previous ? qualifiedCodeView(decodeStoredCheckpoint(historical(previous))) : undefined;
  for (const attempt of cp.attempts) {
   const old = prior?.attempts.find(a => a.header.attempt === attempt.header.attempt);
   if (old && same(old, attempt)) continue;
   const scope = prepared.get(attempt.header.attempt); if (!scope || !same(scope.packet, attempt.submitted)) throw new Error('Prepared scope does not match pinned input');
   const selected = scope.tasks.filter(t => !scope.packet.taskId || t.id === scope.packet.taskId).map(t => t.id);
   if (new Set(attempt.header.selectedTaskIds).size !== selected.length || !same([...selected].sort(), [...attempt.header.selectedTaskIds].sort())) throw new Error('Saved task inventory differs from complete scope');
   if (scope.packet.reviewRevision && scope.projection?.identity !== attempt.header.finalScopeIdentity) throw new Error('Saved final scope identity changed');
   const assignments = await restoreAcceptedAssignments({ path: reviewWorkerCheckpoint({ project: cp.project, family: 'code', reviewId: cp.reviewId }), checkpoint: cp, attempt, prepared: scope });
   const results = attempt['review-response'].tasks;
   if (attempt['review-response'].crPublication === 'complete' && ['pending', 'running'].includes(attempt.header.status)) throw new Error('Publication cannot complete an active task review');
   if (new Set(results.map(r => r.taskId)).size !== results.length || results.some(r => !selected.includes(r.taskId))) throw new Error('Duplicate/foreign task feedback');
   for (const result of results.slice(old?.['review-response'].tasks.length ?? 0)) {
    const refs = resultReferences(result);
    for (const reference of refs) if (!references.has(reference)) {
     const match = /^([a-f0-9]{40}|[a-f0-9]{64}):(.+)$/.exec(reference); if (!match) throw new Error('Expected pinned feedback evidence');
     reviewPath(match[2]!); if (!commits.has(match[1]!)) { const value = await sources.commit(match[1]!); evidence.push({ queryDigest: reviewSourceQueryDigest('commit', [match[1]!]), bytes: encodeReviewSourceResult('commit', value) }); commits.add(match[1]!); }
     const value = await sources.file(match[1]!, match[2]!);
     if (!value) throw new Error('Feedback evidence unavailable');
     evidence.push({ queryDigest: reviewSourceQueryDigest('file', [match[1]!, match[2]!]), bytes: encodeReviewSourceResult('file', value) }); references.add(reference);
    }
    validateTaskResult(result, { taskId: result.taskId, changes: assignments?.find(a => a.taskId === result.taskId)?.changes ?? (scope.packet.reviewRevision ? [] : scope.changes), evidenceReferences: refs });
   }
   if (!['pending', 'running'].includes(attempt.header.status)) {
    if (!attempt.header.completedAt || !Number.isFinite(Date.parse(attempt.header.completedAt))) throw new Error('Terminal history needs completion time');
    if (attempt.header.status === 'failed' && attempt['review-response'].crPublication === 'pending') {
     if (results.length > selected.length || !attempt['review-response'].error && (!results.length || aggregateTaskStatus(results) !== 'failed')) throw new Error('Invalid failed task history');
    } else if (results.length !== selected.length || aggregateTaskStatus(results) !== attempt.header.status) throw new Error('Terminal history omits required tasks');
   }
  }
  validateResultOrigins(cp.attempts.map(a => ({ attempt: a.header.attempt, reviewer: a.header.reviewer, tasks: a['review-response'].tasks, origins: a['review-response'].origins })));
  return { ...await publication(next, previous, verifyPublication), evidence };
 };
}

/** Preserve existing plan, chunk, impact and finding-origin semantics. */
export function designHistoryFeedback(verifyPublication?: PublicationVerifier) {
 return async (next: PreparationHistory, previous?: PreparationHistory): Promise<HistoryValidation> => {
  if ('storyId' in next) throw new Error('Expected design feedback');
  const stored = decodeStoredDesignCheckpoint(historical(next)); validateStoredDesignIdentity(next.project, next.reviewId, stored);
  const cp = qualifiedDesignProjection(stored); if (!cp) throw new Error('No qualified design history');
  const prior = previous ? qualifiedDesignProjection(decodeStoredDesignCheckpoint(historical(previous))) : undefined;
  for (const attempt of cp.attempts) {
   const old = prior?.attempts.find(a => a.number === attempt.number); if (old && same(old, attempt)) continue;
   if (attempt.publication?.state === 'complete' && (!attempt.report || !['passed', 'changes_requested', 'incomplete'].includes(attempt.status))) throw new Error('Publication cannot complete an unfinished design review');
   if (!attempt.plan) { if (attempt.completedChunks.length || attempt.report) throw new Error('Feedback requires an accepted plan'); continue; }
   validateDesignPlan(attempt.plan, attempt.inventory);
   const history = cp.attempts.filter(a => a.number < attempt.number);
   if (attempt.impact) validateDesignImpact({ plan: attempt.plan, impact: attempt.impact }, attempt, history);
   const retained = new Set(attempt.impact?.retainedCoverage.map(r => r.chunkId) ?? []), selected = attempt.plan.chunks.filter(c => !retained.has(c.id));
   for (let i = old?.completedChunks.length ?? 0; i < attempt.completedChunks.length; i++) {
    const result = attempt.completedChunks[i]!, chunk = selected[i]; if (!chunk || chunk.id !== result.chunkId) throw new Error('Chunk feedback is not the selected dependency-order prefix');
    const checked = assessDesignResult(structuredClone(result), chunk, attempt.completedChunks.slice(0, i), designRequiredReferences(cp.subject, chunk, designCheckpointPath(cp.project, cp.reviewId)), attempt.impact ? { attempt, history } : undefined, true);
    if (!same(checked, result)) throw new Error('Accepted chunk feedback omits mandatory coverage');
   }
   if (attempt.report) {
    const report = consolidateDesignReview(cp.reviewId, attempt.number, { ...cp.subject, reviewer: attempt.reviewer ?? cp.subject.reviewer }, attempt.baseline.contentIdentity, attempt.plan, attempt.completedChunks, attempt.impact ? { impact: attempt.impact, attempts: cp.attempts.filter(a => a.number <= attempt.number) } : undefined);
    if (!same(report, attempt.report)) throw new Error('Report differs from accepted chunk history');
   }
  }
  return publication(next, previous, verifyPublication);
 };
}
