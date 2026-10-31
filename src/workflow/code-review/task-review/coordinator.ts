/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { access } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { Type } from '@sinclair/typebox';
import { ReviewSessionTimeoutError } from '../../../agent/providers/cli-provider.js';
import { getLogger } from '../../../shared/logger.js';
import type { LLMProvider, ReviewSessionOpts } from '../../../shared/types.js';
import { decodeReview, requireReview, reviewPath, TaskResultSchema } from './contracts.js';
import type { ReviewAttempt, ReviewCheckpoint, TaskReviewResult } from './contracts.js';
import { deriveTaskAssignments, prepareReviewPacket } from './packet.js';
import type { PreparedReviewPacket, TaskAssignment } from './packet.js';
import type { ReviewSources } from './sources.js';
import { aggregateTaskStatus, validateTaskResult } from './results.js';
import { checkpointPath, saveCheckpoint } from './checkpoint.js';
import { assignmentPrompt, codeTaskCommands } from './policy.js';
import { assignmentResultSchema } from './result-schema.js';

const log = getLogger('task-review');
const AttributionSchema = Type.Object({ tasks: Type.Array(Type.Object({ taskId: Type.String(), changeIndexes: Type.Array(Type.Integer({ minimum: 0 })), testIndexes: Type.Array(Type.Integer({ minimum: 0 })) }, { additionalProperties: false })) }, { additionalProperties: false });
export interface TaskReviewDeps {
 readonly sources: ReviewSources;
 readonly provider: () => LLMProvider;
 readonly save?: typeof saveCheckpoint;
 readonly now?: () => number;
 readonly timer?: (callback: () => void, ms: number) => () => void;
}
export interface ReviewAcknowledgement { reviewId: string; attempt: 1; path: string; status: 'pending'; crPublication: 'pending'; }
interface ActiveReview { checkpoint: ReviewCheckpoint; attempt: ReviewAttempt; done: Promise<void>; }
/** Daemon-owned lifetime, intentionally independent of the submitting socket. S2 adds explicit recovery. */
export class TaskReviewCoordinator {
 private readonly active = new Map<string, ActiveReview | null>();
 constructor(private readonly deps: TaskReviewDeps) {}
 async start(project: string, reviewId: string, attempt: number, input: unknown, context?: { provider?: () => LLMProvider; epicHash?: string }): Promise<ReviewAcknowledgement> {
  const path = checkpointPath(project, reviewId);
  requireReview(attempt === 1, 'attempt', 'Fresh first attempts only; recovery is not implemented here');
  requireReview(!this.active.has(path), 'reviewId', 'already-running');
  this.active.set(path, null); // Reserve before any awaited admission or provider use.
  try {
   let exists = false;
   try { await access(path); exists = true; } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
   requireReview(!exists, 'reviewId', 'attempt-conflict: checkpoint already exists');
   const prepared = await prepareReviewPacket(input, this.deps.sources);
   requireReview(!context?.epicHash || context.epicHash === prepared.epicHash, 'epicHash', 'Pinned Plan belongs to another review subject');
   const selected = prepared.tasks.filter(task => !prepared.packet.taskId || task.id === prepared.packet.taskId);
   const entry: ReviewAttempt = { header: { attempt: 1, reviewer: 'daemon', status: 'pending', createdAt: new Date().toISOString(), selectedTaskIds: selected.map(task => task.id) }, submitted: prepared.packet,
    'review-response': { summary: 'Review admitted; CR publication pending.', tasks: [], crPublication: 'pending' } };
   const checkpoint: ReviewCheckpoint = { schemaVersion: 1, reviewId, project, storyId: prepared.packet.storyId, ...(prepared.packet.taskId ? { taskId: prepared.packet.taskId } : {}), attempts: [entry] };
   await (this.deps.save ?? saveCheckpoint)(path, checkpoint);
   const done = new Promise<void>(resolve => setImmediate(() => {
    void this.run(path, checkpoint, entry, prepared, context?.provider ?? this.deps.provider).catch(error => {
     // A persistence failure stops scheduling. Never overwrite the last durable task with a fabricated success.
     log.error({ reviewId, error: error instanceof Error ? error.message : String(error) }, 'Task review stopped; last durable checkpoint retained');
    }).finally(() => { this.active.delete(path); resolve(); });
   }));
   this.active.set(path, { checkpoint, attempt: entry, done });
   return { reviewId, attempt: 1, path, status: 'pending', crPublication: 'pending' };
  } catch (error) { this.active.delete(path); throw error; }
 }
 /** Used by shutdown/tests, never awaited by start or attached to a caller's cancellation. */
 async settled(project: string, reviewId: string): Promise<void> { await this.active.get(checkpointPath(project, reviewId))?.done; }
 private async run(path: string, checkpoint: ReviewCheckpoint, entry: ReviewAttempt, prepared: PreparedReviewPacket, resolveProvider: () => LLMProvider): Promise<void> {
  const save = this.deps.save ?? saveCheckpoint;
  const now = this.deps.now ?? (() => performance.now());
  const selected = prepared.tasks.filter(task => !prepared.packet.taskId || task.id === prepared.packet.taskId);
  // Derive once from the pinned Plan, not submitter-supplied task mappings. All model calls are serial.
  let assignments: readonly TaskAssignment[] | undefined;
  let attributionFailure: unknown;
  for (const task of selected.sort((a, b) => a.order - b.order)) {
   entry.header.status = 'running'; entry.header.activeTaskId = task.id;
   await save(path, checkpoint);
   const started = now(), allowance = { S: 300000, M: 600000, L: 900000 }[task.size];
   const cancellation = new AbortController();
   const timeout = new Error('Task review deadline expired');
   let cancelTimer: () => void = () => {};
   const expired = new Promise<never>((_resolve, reject) => {
    const callback = () => { cancellation.abort(timeout); reject(timeout); };
    if (this.deps.timer) cancelTimer = this.deps.timer(callback, allowance);
    else { const timer = setTimeout(callback, allowance); cancelTimer = () => clearTimeout(timer); }
   });
   const options = (): ReviewSessionOpts => {
    const remaining = allowance - (now() - started);
    if (remaining <= 0 || cancellation.signal.aborted) throw timeout;
    return { cwd: checkpoint.project, deadlineMs: remaining, stallMs: remaining, internalRetry: false, signal: cancellation.signal, codeTaskCommands: codeTaskCommands(prepared) };
   };
   let result: TaskReviewResult;
   try {
    result = await Promise.race([expired, (async () => {
     const provider = resolveProvider();
     requireReview(provider.runReviewSession, 'provider', 'Reviewer sessions are unsupported');
     if (!assignments) {
      if (attributionFailure) throw attributionFailure;
      try {
      const attribution = prepared.packet.taskId || selected.length === 1
       ? { tasks: [{ taskId: task.id, changeIndexes: prepared.changes.map((_c, i) => i), testIndexes: prepared.packet.tests.map((_t, i) => i) }] }
       : decodeReview(AttributionSchema, await provider.runReviewSession(`Derive task attribution from this committed Plan and the submitted change selection. Commit groups are pointers only. Account for every change and test; cross-cutting entries may belong to multiple tasks. Do not review code yet.\nPlan: ${prepared.documents.plan}\nSummary: ${prepared.packet.functionalSummary}\nChanges: ${JSON.stringify(prepared.changes.map(c => ({ commit: c.commit, path: c.path, segments: c.segments })))}\nTests: ${JSON.stringify(prepared.packet.tests)}\nReturn taskId and zero-based changeIndexes/testIndexes for every Plan task.`, AttributionSchema, options()));
      assignments = deriveTaskAssignments(prepared, attribution.tasks);
      } catch (error) { attributionFailure = error; throw error; }
     }
     const assignment = assignments.find(a => a.taskId === task.id)!;
     const references = await this.references(prepared, assignment);
     const raw = await provider.runReviewSession(assignmentPrompt(prepared, assignment, references), assignmentResultSchema(assignment), options());
     const parsed = decodeReview(TaskResultSchema, raw);
     // Additional context is allowed, but every claimed source reference must resolve at an explicit commit.
     for (const reference of [...parsed.inspectedReferences, ...parsed.findings.flatMap(f => f.evidenceReferences), ...parsed.testCoverage.evidenceReferences, ...parsed.executedTests.flatMap(t => t.evidenceReferences)]) {
      if (references.includes(reference)) continue;
      const match = /^([a-f0-9]{40}|[a-f0-9]{64}):(.+)$/.exec(reference);
      requireReview(match, 'evidence', 'Expected a committed evidence reference');
      reviewPath(match[2]!);
      requireReview(await this.deps.sources.file(match[1]!, match[2]!), 'evidence', 'Unresolved committed evidence reference');
      references.push(reference);
     }
     options(); // Output resolution and validation share the same clock.
     return validateTaskResult(parsed, { taskId: task.id, changes: assignment.changes, evidenceReferences: references });
    })()]);
   } catch (error) {
    if (!assignments) attributionFailure = error;
    const timedOut = error instanceof ReviewSessionTimeoutError || error === timeout || cancellation.signal.aborted || now() - started >= allowance;
    const message = timedOut ? `Task exceeded its ${task.size} allowance (${allowance}ms).` : `Reviewer failed: ${error instanceof Error ? error.message : String(error)}`;
    result = { taskId: task.id, status: timedOut ? 'incomplete' : 'failed', summary: message, findings: [], testCoverage: { assessment: 'unverified', explanation: 'No valid completed assessment was obtained.', evidenceReferences: [] }, limitations: [message], advice: [], inspectedReferences: [], executedTests: [], ...(!timedOut ? { error: message } : {}) };
   } finally { cancelTimer(); cancellation.abort(); }
   entry['review-response'].tasks = [...entry['review-response'].tasks, result];
   delete entry.header.activeTaskId;
   await save(path, checkpoint); // Never begin the next task before this succeeds.
  }
  entry.header.status = aggregateTaskStatus(entry['review-response'].tasks);
  entry.header.completedAt = new Date().toISOString();
  entry['review-response'].summary = 'All selected task assessments are terminal. CR publication pending until task-based publication is available.';
  await save(path, checkpoint);
 }
 private async references(prepared: PreparedReviewPacket, assignment: TaskAssignment): Promise<string[]> {
  const refs = Object.values(prepared.packet.documents).map(doc => `${doc.commit}:${doc.path}`);
  for (const change of assignment.changes) {
   if (change.before && change.parent) refs.push(`${change.parent}:${change.previousPath}`);
   if (change.after) refs.push(`${change.commit}:${change.path}`);
  }
  for (const pointer of prepared.packet.reviewSet) for (const test of assignment.tests) if (await this.deps.sources.file(pointer.commit, test.file)) refs.push(`${pointer.commit}:${test.file}`);
  return [...new Set(refs)];
 }
}
