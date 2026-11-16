/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import type { ActivityReviewSessionOpts, LLMProvider, StructuredSchema } from '../../shared/types.js';
import type { AdmittedReview } from '../code-review/task-review/execution.js';
import { originalChange } from '../code-review/task-review/packet.js';
import type { PreparedReviewPacket, TaskAssignment, selectedCode } from '../code-review/task-review/packet.js';
import { assignmentPrompt, TASK_REVIEW_POLICY } from '../code-review/task-review/policy.js';
import { PreparedViewReader } from './prepared-views.js';
import type { PreparedViewWriter, PreparedValueReference } from './prepared-views.js';
import type { PreparedWindow } from './prepared-views.js';
import { ReviewPromptWindow } from './prompt-window.js';
import { selectedCodeWindow } from './selected-code-window.js';
import type { StagedPacketBlob } from './staged-packet-sources.js';
import { preparationDigest } from './prepared-context.js';
import { reviewMetadataJsonBytes } from '../code-review/task-review/json-size.js';
import { designPlanningPrompt, designImpactPrompt, designChunkPrompt, DESIGN_REVIEW_POLICY } from './design-review/policy.js';
import { DesignPlanSchema, DesignImpactOutputSchema, designChunkResultSchema } from './design-review/contracts.js';
import type { DesignReviewSubject, DesignChunk, DesignAttempt } from './design-review/contracts.js';

/** Stage one accepted task without full packet bodies, document text or other
 * tasks' selected source. Reference objects share the original immutable leaves. */
export async function stageExecutionTask(writer: PreparedViewWriter, prepared: PreparedReviewPacket<StagedPacketBlob>, assignment: TaskAssignment<StagedPacketBlob>): Promise<PreparedValueReference> {
 const task = prepared.tasks.find(task => task.id === assignment.taskId);
 if (!task || assignment.changes.some(change => !prepared.changes.includes(change)) || assignment.tests.some(test => !prepared.packet.tests.includes(test))) throw new Error('Foreign execution task assignment');
 const lease = writer.memory.reserve((assignment.tests.length + assignment.changes.length) * 16 + 1024, 'execution task descriptor assembly');
 try {
  const scoped: PreparedReviewPacket<StagedPacketBlob> = { epicHash: prepared.epicHash, packet: { ...prepared.packet, tests: [...assignment.tests] }, tasks: [task], changes: assignment.changes, originChanges: assignment.changes.map(originalChange), documents: {} };
  return await writer.add(assignment.taskId, 'task', { prepared: scoped, assignment });
 } finally { lease.release(); }
}

/** Execution adapter for one task's metadata and selected leaves. The caller's
 * current private generation borrow remains authoritative throughout the call.
 * Coordinated worker/lifecycle wiring is the later T20 cutover. */
export class StagedTaskExecution {
 constructor(private readonly reader: PreparedViewReader) {}
 private async task(taskId: string): Promise<PreparedWindow<{ prepared: PreparedReviewPacket<StagedPacketBlob>; assignment: TaskAssignment<StagedPacketBlob> }>> {
  const window = await this.reader.metadata(await this.reader.descriptor(taskId, 'task'));
  const value = window.value as { prepared?: PreparedReviewPacket<StagedPacketBlob>; assignment?: TaskAssignment<StagedPacketBlob> };
  if (!value?.prepared || value.assignment?.taskId !== taskId || !Array.isArray(value.prepared.tasks) || !value.prepared.tasks.some(task => task.id === taskId)) { window.release(); throw new Error('Unbound staged task metadata'); }
  return window as PreparedWindow<{ prepared: PreparedReviewPacket<StagedPacketBlob>; assignment: TaskAssignment<StagedPacketBlob> }>;
 }
 async codePrompt(taskId: string, references: readonly string[], project?: string, review?: AdmittedReview<StagedPacketBlob>): Promise<ReviewPromptWindow> {
  const task = await this.task(taskId);
  try { return await this.buildCodePrompt(task.value.prepared, task.value.assignment, references, project, review); }
  finally { task.release(); }
 }
 private async buildCodePrompt(prepared: PreparedReviewPacket<StagedPacketBlob>, assignment: TaskAssignment<StagedPacketBlob>, references: readonly string[], project?: string, review?: AdmittedReview<StagedPacketBlob>): Promise<ReviewPromptWindow> {
  await this.reader.verify();
  const indexLease = this.reader.memory.reserve(assignment.changes.length * 64 + assignment.tests.length * 16 + 1024, 'review task window index');
  const windows: PreparedWindow<ReturnType<typeof selectedCode>>[] = [];
  try {
   for (const change of assignment.changes) windows.push(await selectedCodeWindow(this.reader, change));
   const selected = windows.map(window => window.value);
   // All data actually serialized by the shared policy is counted before
   // assembly. Metadata never contains source bytes or full document bodies.
   const bound = reviewMetadataJsonBytes({ assignment: { ...assignment, changes: selected }, functionalSummary: prepared.packet.functionalSummary,
    documents: prepared.packet.documents, references, project, history: review?.checkpoint.attempts }) + TASK_REVIEW_POLICY.length + 16384;
   return await ReviewPromptWindow.create(this.reader, bound, () => assignmentPrompt(prepared, assignment, references, project, review, selected));
  } finally { for (const window of windows) window.release(); indexLease.release(); }
 }
 /** Latest-subject policy uses only subject/path metadata. The existing live
  * author/route/subject check is repeated at assembly and provider admission. */
 async designUnit(subjectId: string, checkpointPath: string, unit: { phase: 'planning' } | { phase: 'impact'; attempt: number } | { phase: 'chunk'; chunk: DesignChunk; attempt?: Pick<DesignAttempt, 'impact' | 'plan'> }, assertCurrent: () => Promise<void>): Promise<ReviewPromptWindow> {
  const metadata = await this.reader.metadata(await this.reader.descriptor(subjectId, 'view'));
  try {
   const subject = metadata.value as DesignReviewSubject;
   const schema = unit.phase === 'planning' ? DesignPlanSchema : unit.phase === 'impact' ? DesignImpactOutputSchema : designChunkResultSchema(unit.chunk, unit.attempt);
   const bound = reviewMetadataJsonBytes({ subject, checkpointPath, unit, schema }) + DESIGN_REVIEW_POLICY.length + 16384;
   return await ReviewPromptWindow.create(this.reader, bound, () => unit.phase === 'planning' ? designPlanningPrompt(subject, checkpointPath) : unit.phase === 'impact' ? designImpactPrompt(subject, checkpointPath, unit.attempt) : designChunkPrompt(subject, unit.chunk, checkpointPath, unit.attempt), assertCurrent);
  } finally { metadata.release(); }
 }
 /** Inspect every assigned test's committed body without assembling a whole
  * test file or treating optional execution as evidence of coverage. The
  * caller performs the assessment; traversal alone never verifies coverage. */
 async coverage(taskId: string, inspect: (test: TaskAssignment['tests'][number], revision: string, bytes: Uint8Array) => Promise<void>): Promise<void> {
  const task = await this.task(taskId);
  try { await this.inspectCoverage(task.value.prepared, task.value.assignment, inspect); } finally { task.release(); }
 }
 private async inspectCoverage(prepared: PreparedReviewPacket<StagedPacketBlob>, assignment: TaskAssignment<StagedPacketBlob>, inspect: (test: TaskAssignment['tests'][number], revision: string, bytes: Uint8Array) => Promise<void>): Promise<void> {
  await this.reader.verify();
  const indexLease = this.reader.memory.reserve(prepared.packet.reviewSet.length * 512 + assignment.tests.length * 64 + 1024, 'coverage revision index');
  try {
  const revisions = new Set([...(prepared.packet.reviewRevision ? [prepared.packet.reviewRevision] : []), ...prepared.packet.reviewSet.flatMap(entry => [entry.commit, ...(entry.parent ? [entry.parent] : [])])]);
  for (const test of assignment.tests) {
   let found = false;
   for (const revision of revisions) {
    const id = `blob-${preparationDigest(['staged-packet-blob-v2', revision, test.file])}`;
    if (!await this.reader.hasDescriptor(id, 'file')) continue;
    const ref = await this.reader.descriptor(id, 'file');
    let visited = false;
    for await (const chunk of this.reader.chunks(ref)) {
     try { visited = true; await inspect(test, revision, chunk.value); await this.reader.verify(); }
     finally { chunk.release(); }
    }
    if (!visited) { await inspect(test, revision, new Uint8Array(0)); await this.reader.verify(); }
    found = true; break;
   }
   if (!found) throw new Error(`Required coverage source was not staged: ${test.file}`);
  }
  } finally { indexLease.release(); }
 }
 async dispatch<T>(provider: LLMProvider, prompt: ReviewPromptWindow, schema: StructuredSchema, options: ActivityReviewSessionOpts): Promise<T> {
  await this.reader.verify();
  if (!prompt.belongsTo(this.reader)) throw new Error('Foreign review prompt borrow');
  if (!provider.runReviewSession || !provider.capabilities?.reviewActivity) throw new Error('Provider does not support activity-supervised task reviews');
  // The CLI owns its transport reservation. Other deterministic/internal
  // providers use the same hook contract; no provider bypass is introduced.
  return provider.runReviewSession<T>(prompt.prompt, schema, { ...options, signal: AbortSignal.any([options.signal, this.reader.signal]), inputOwnership: prompt.inputOwnership });
 }
}
