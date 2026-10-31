/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { TextDecoder } from 'node:util';
import { isCitationArray } from '../../artifacts/plan.js';
import type { PlanTask } from '../../artifacts/plan.js';
import { tasksEnumerateSchema } from '../../runners/plan/schemas.js';
import { validateAgainstSchema } from '../../../agent/providers/structured-output.js';
import { validatePlanRows } from '../../tasks/pure.js';
import { parsePacket, requireReview } from './contracts.js';
import type { CommittedDocument, ReviewPacket, SubmittedTestDetail } from './contracts.js';
import type { PinnedBlob, ReviewSources } from './sources.js';

const utf8 = (blob: PinnedBlob): string => new TextDecoder('utf-8', { fatal: true }).decode(blob.bytes);
export interface SelectedChange {
 readonly commit: string; readonly parent: string | null; readonly path: string; readonly previousPath: string;
 readonly segments: ReviewPacket['reviewSet'][number]['files'][number]['segments'];
 readonly before: PinnedBlob | null; readonly after: PinnedBlob | null; readonly limitations: readonly string[];
}
export interface PreparedReviewPacket {
 readonly epicHash: string; readonly packet: ReviewPacket; readonly changes: readonly SelectedChange[]; readonly tasks: readonly PlanTask[];
 readonly documents: Readonly<Record<'story' | 'lld' | 'plan', string>>;
}
function head(text: string): Record<string, unknown> {
 let value: unknown;
 try { value = JSON.parse(text); } catch { requireReview(false, 'documents', 'Malformed committed artifact JSON'); }
 requireReview(value && typeof value === 'object' && !Array.isArray(value), 'documents', 'Expected committed artifact object');
 return value as Record<string, unknown>;
}
/** Load committed document text; Markdown may reference its canonical JSON at the SAME commit. */
async function document(ref: CommittedDocument, sources: ReviewSources): Promise<{ text: string; head: Record<string, unknown> }> {
 await sources.commit(ref.commit);
 const blob = await sources.file(ref.commit, ref.path);
 requireReview(blob, 'documents', `Missing committed document ${ref.path}`);
 const text = utf8(blob);
 if (ref.path.endsWith('.json')) return { text, head: head(text) };
 const id = /^<!-- insrc:artifact ([A-Z]+-[0-9a-f]{16}(?:-s\d+)?) -->/m.exec(text)?.[1];
 requireReview(id, 'documents', 'Markdown must identify its committed canonical artifact');
 const canonical = await sources.file(ref.commit, `.insrc/artifacts/${id}.json`);
 requireReview(canonical, 'documents', 'Commit the referenced canonical artifact JSON with its document');
 return { text, head: head(utf8(canonical)) };
}
export async function prepareReviewPacket(input: unknown, sources: ReviewSources): Promise<PreparedReviewPacket> {
 const packet = parsePacket(input);
 const docs = { story: await document(packet.documents.story, sources), lld: await document(packet.documents.lld, sources), plan: await document(packet.documents.plan, sources) };
 const plan = docs.plan.head, meta = plan['meta'] as Record<string, unknown> | undefined;
 requireReview(meta && typeof meta['epicHash'] === 'string' && /^s\d+$/.test(String(meta['storyId'])), 'documents.plan', 'Expected a canonical story Plan');
 const storyId = String(meta['storyId']), hash = String(meta['epicHash']);
 requireReview(packet.storyId === storyId || packet.storyId === `STORY-${hash}-${storyId}`, 'storyId', 'Plan belongs to another story');
 for (const [name, doc] of Object.entries(docs)) {
  const m = doc.head['meta'] as Record<string, unknown> | undefined;
  requireReview(m?.['epicHash'] === hash, `documents.${name}`, 'Document belongs to another epic');
  if (name === 'lld') requireReview(m['storyId'] === storyId, 'documents.lld', 'LLD belongs to another story');
 }
 requireReview(meta['workflow'] === 'plan' && (docs.lld.head['meta'] as Record<string, unknown>)['workflow'] === 'design.story', 'documents', 'Expected canonical Plan and LLD artifacts');
 const storyMeta = docs.story.head['meta'] as Record<string, unknown>;
 const storyBody = docs.story.head['body'] as { stories?: { id?: string }[] } | undefined;
 requireReview(storyMeta['storyId'] === storyId || storyBody?.stories?.some(s => s.id === storyId), 'documents.story', 'Story definition does not contain this story');
 const body = plan['body'] as { tasks?: unknown } | undefined;
 // Reuse the Plan runner's strict row schema; tests are checked separately.
 const rows = Array.isArray(body?.tasks) ? body.tasks : [];
 requireReview(rows.every(row => row && typeof row === 'object' && !Array.isArray(row)), 'documents.plan', 'Expected task objects');
 const coreRows = rows.map(row => { const { tests: _tests, ...core } = row as PlanTask; return core; });
 const core = validateAgainstSchema<{ tasks: Omit<PlanTask, 'tests'>[] }>(tasksEnumerateSchema, { tasks: coreRows });
 requireReview(core.ok && rows.every(r => Array.isArray((r as PlanTask).tests) && (r as PlanTask).tests.every(t => t && ['unit', 'integration', 'live', 'smoke'].includes(t.level) && typeof t.name === 'string' && t.name.trim())), 'documents.plan', 'Malformed Plan tasks');
 requireReview(isCitationArray(plan['citations']), 'documents.plan', 'Plan citations are malformed');
 const tasks = rows as PlanTask[];
 const issues = validatePlanRows(tasks, plan['citations']);
 requireReview(issues.length === 0 && tasks.length > 0, 'documents.plan', issues.join('; ') || 'No Plan tasks');
 requireReview(!packet.taskId || tasks.some(t => t.id === packet.taskId), 'taskId', 'Task is not in the committed Plan');
 const changes: SelectedChange[] = [];
 for (const pointer of packet.reviewSet) {
  const parents = await sources.commit(pointer.commit);
  requireReview(pointer.parent === null ? parents.length === 0 : parents.includes(pointer.parent), 'parent', 'Explicit parent is not a parent of the referenced commit');
  for (const file of pointer.files) {
   const previousPath = file.previousPath ?? file.path;
   const before = pointer.parent === null ? null : await sources.file(pointer.parent, previousPath);
   const after = await sources.file(pointer.commit, file.path);
   if (file.previousPath && file.previousPath !== file.path) {
    requireReview(!await sources.file(pointer.commit, file.previousPath) && (pointer.parent === null || !await sources.file(pointer.parent, file.path)), 'previousPath', 'Expected an actual path move, not an unrelated file');
   }
   requireReview(before || after, 'reviewSet', 'Selected path is absent on both sides');
   const ranges = await sources.changedRanges(pointer.commit, pointer.parent, [...new Set([file.path, previousPath])]);
   const limitations: string[] = [];
   if (file.segments.length === 0) {
    requireReview(ranges.length === 0, 'segments', 'Textual changes require explicit changed segments');
    limitations.push('Selected metadata or non-textual change requires reviewer assessment; no textual ranges were invented.');
   }
   for (const segment of file.segments) {
    requireReview(ranges.some(r => (['before', 'after'] as const).every(side => {
     const selected = segment[side], changed = r[side];
     return selected === undefined || (changed !== undefined && selected[0] >= changed[0] && selected[1] <= changed[1]);
    })), 'segments', 'Selected range is not inside one referenced changed hunk');
    for (const side of ['before', 'after'] as const) {
     const selected = segment[side]; if (!selected) continue;
     const blob = side === 'before' ? before : after;
     requireReview(blob, 'segments', 'Selected side is absent');
     let lines: number;
     try { const text = utf8(blob); requireReview(!text.includes('\0'), 'segments', 'Binary source has no textual ranges'); lines = text.length ? text.split('\n').length - Number(text.endsWith('\n')) : 0; }
     catch { throw new Error('Selected text cannot be decoded; use a non-textual selection instead'); }
     requireReview(selected[1] <= lines, 'segments', 'Selected range exceeds committed source');
    }
   }
   changes.push({ commit: pointer.commit, parent: pointer.parent, path: file.path, previousPath, segments: file.segments, before, after, limitations });
  }
 }
 const revisions = [...new Set(packet.reviewSet.flatMap(c => [c.commit, ...(c.parent ? [c.parent] : [])]))];
 for (const test of packet.tests) {
  requireReview(test.evidenceReferences.length > 0 || test.result === 'not_run', 'tests', 'Reported execution needs provenance');
  let found = false;
  for (const revision of revisions) if (await sources.file(revision, test.file)) { found = true; break; }
  requireReview(found, 'tests', 'Test file is absent from the supplied committed source');
 }
 return { epicHash: hash, packet, changes, tasks, documents: { story: docs.story.text, lld: docs.lld.text, plan: docs.plan.text } };
}
/** Internal derivation output, not additional submitter input or a model-facing persistence protocol. */
export interface TaskAttribution { taskId: string; changeIndexes: readonly number[]; testIndexes: readonly number[]; }
export interface TaskAssignment { readonly taskId: string; readonly size: PlanTask['size']; readonly timeoutMs: number; readonly changes: readonly SelectedChange[]; readonly tests: readonly SubmittedTestDetail[]; readonly acceptanceChecks: readonly string[]; }
export function deriveTaskAssignments(prepared: PreparedReviewPacket, attribution: readonly TaskAttribution[]): readonly TaskAssignment[] {
 const selected = prepared.tasks.filter(t => !prepared.packet.taskId || t.id === prepared.packet.taskId).sort((a, b) => a.order - b.order);
 requireReview(attribution.length === selected.length && new Set(attribution.map(a => a.taskId)).size === selected.length, 'attribution', 'Every applicable task needs exactly one derived scope');
 const covered = new Set<number>(), assignedTests = new Set<number>();
 const assignments = selected.map(task => {
  const scope = attribution.find(a => a.taskId === task.id);
  requireReview(scope, 'attribution', 'Unknown or missing task scope');
  const changes = scope.changeIndexes.map(i => { requireReview(Number.isSafeInteger(i) && prepared.changes[i], 'attribution', 'Unknown selected change'); covered.add(i); return prepared.changes[i]!; });
  const tests = scope.testIndexes.map(i => { requireReview(Number.isSafeInteger(i) && prepared.packet.tests[i], 'attribution', 'Unknown test'); assignedTests.add(i); return prepared.packet.tests[i]!; });
  return { taskId: task.id, size: task.size, timeoutMs: { S: 300000, M: 600000, L: 900000 }[task.size], changes, tests, acceptanceChecks: task.acceptanceChecks };
 });
 requireReview(covered.size === prepared.changes.length && assignedTests.size === prepared.packet.tests.length, 'attribution', 'Derived task scopes omit submitted changes or tests');
 return assignments;
}
