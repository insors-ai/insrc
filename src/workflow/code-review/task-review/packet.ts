/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { TextDecoder } from 'node:util';
import { isCitationArray } from '../../artifacts/plan.js';
import type { PlanTask } from '../../artifacts/plan.js';
import { tasksEnumerateSchema } from '../../runners/plan/schemas.js';
import { validateAgainstSchema } from '../../../agent/providers/structured-output.js';
import { validatePlanRows } from '../../tasks/pure.js';
import { parsePacket, requireReview } from './contracts.js';
import type { CommittedDocument, ReviewPacket, StoredDerived, SubmittedTestDetail } from './contracts.js';
import type { PinnedBlob, ReviewSources } from './sources.js';
import { DOCUMENT_ROLES, requiredDocumentRoles } from './route.js';
import type { DocumentRole, StoryRoute } from './route.js';

const utf8 = (blob: PinnedBlob): string => new TextDecoder('utf-8', { fatal: true }).decode(blob.bytes);
export interface SelectedChange {
 readonly commit: string; readonly parent: string | null; readonly path: string; readonly previousPath: string;
 readonly segments: ReviewPacket['reviewSet'][number]['files'][number]['segments'];
 readonly before: PinnedBlob | null; readonly after: PinnedBlob | null; readonly limitations: readonly string[];
}
export interface PreparedReviewPacket {
 readonly epicHash: string; readonly packet: ReviewPacket; readonly changes: readonly SelectedChange[]; readonly tasks: readonly PlanTask[];
 readonly documents: Readonly<Partial<Record<DocumentRole, string>>>;
 readonly derived?: StoredDerived | undefined;
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
type LoadedDocument = { text: string; head: Record<string, unknown> };
const WORKFLOW_OF: Readonly<Record<DocumentRole, string>> = { story: 'define', lld: 'design.story', plan: 'plan', issue: 'issue' };
/** The story, LLD and Plan every packet pinned before routes existed: all three, from one epic and one story. */
async function pinnedTriple(packet: ReviewPacket, sources: ReviewSources) {
 const { story: storyRef, lld: lldRef, plan: planRef } = packet.documents;
 requireReview(storyRef && lldRef && planRef, 'documents', 'Expected story, lld and plan documents');
 const docs = { story: await document(storyRef, sources), lld: await document(lldRef, sources), plan: await document(planRef, sources) };
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
 return { docs: docs as Partial<Record<DocumentRole, LoadedDocument>>, hash, storyId };
}
const list = (roles: readonly string[]): string => roles.length ? roles.join(', ') : 'none';
/** Exactly the documents the Story's route produced, each a committed canonical artifact of this epic and story. */
async function routedDocuments(packet: ReviewPacket, route: StoryRoute, sources: ReviewSources) {
 const { epicHash: hash, storyId } = route;
 requireReview(packet.storyId === storyId || packet.storyId === `STORY-${hash}-${storyId}`, 'storyId', 'Packet belongs to another story');
 const required = requiredDocumentRoles(route), supplied = DOCUMENT_ROLES.filter(role => packet.documents[role] !== undefined);
 requireReview(required.length === supplied.length && required.every(role => supplied.includes(role)), 'documents', `Expected the documents ${list(required)} for this Story's route, got ${list(supplied)}`);
 const docs: Partial<Record<DocumentRole, LoadedDocument>> = {};
 for (const role of supplied) {
  const doc = await document(packet.documents[role]!, sources);
  const m = doc.head['meta'] as Record<string, unknown> | undefined;
  requireReview(m?.['workflow'] === WORKFLOW_OF[role], `documents.${role}`, `Expected a ${WORKFLOW_OF[role]} artifact`);
  requireReview(m[role === 'issue' ? 'issueHash' : 'epicHash'] === hash, `documents.${role}`, 'Document belongs to another epic');
  if (role === 'lld' || role === 'plan') requireReview(m['storyId'] === storyId, `documents.${role}`, `${role === 'lld' ? 'LLD' : 'Plan'} belongs to another story`);
  if (role === 'story') {
   const body = doc.head['body'] as { stories?: { id?: string }[] } | undefined;
   requireReview(body?.stories?.some(s => s.id === storyId), 'documents.story', 'Story definition does not contain this story');
  }
  docs[role] = doc;
 }
 return { docs, hash, storyId };
}
/** The one review unit of a route without a Plan: the BUILD's single task, judged against the design record the route has. */
function derivedUnit(route: StoryRoute, docs: Partial<Record<DocumentRole, LoadedDocument>>, files: number): PlanTask {
 requireReview(route.build.taskIds.length === 1, 'documents', 'A route without a Plan needs a BUILD with exactly one task');
 const id = route.build.taskIds[0]!, focus = route.build.focus?.trim() || undefined;
 const body = (name: DocumentRole) => (docs[name]?.head['body'] ?? {}) as Record<string, unknown>;
 const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim() !== '') : [];
 let title = focus ?? `Story ${route.storyId}`, checks: string[] = [];
 if (route.lld) {
  const mapping = (body('lld')['testStrategy'] as { acceptanceMapping?: { criterionId?: unknown; provingTests?: unknown }[] } | undefined)?.acceptanceMapping ?? [];
  checks = mapping.filter(m => typeof m.criterionId === 'string').map(m => `Criterion ${String(m.criterionId)} is proven by: ${strings(m.provingTests).join('; ') || 'no named test'}`);
 } else if (route.issue) {
  const issue = body('issue');
  if (typeof issue['title'] === 'string' && issue['title'].trim()) title = issue['title'];
  checks = strings([issue['fixIntent']]);
 }
 if (checks.length === 0 && focus) checks = [focus];
 requireReview(checks.length > 0, 'documents', 'The route has no stated done condition to review against');
 return { id, title, summary: focus ?? title, size: files <= 2 ? 'S' : files <= 8 ? 'M' : 'L', order: 1, dependsOn: [], acceptanceChecks: checks, derivedFrom: [], tests: [] };
}
/** Re-reading a stored review of a route without a Plan: the pinned documents must still load, and the epic and unit come from what admission kept. */
async function storedDocuments(packet: ReviewPacket, stored: StoredDerived, sources: ReviewSources) {
 const docs: Partial<Record<DocumentRole, LoadedDocument>> = {};
 for (const role of DOCUMENT_ROLES) if (packet.documents[role]) docs[role] = await document(packet.documents[role]!, sources);
 return { docs, hash: stored.epicHash };
}
export async function prepareReviewPacket(input: unknown, sources: ReviewSources, historical = false, route?: StoryRoute, stored?: StoredDerived): Promise<PreparedReviewPacket> {
 const packet = parsePacket(input, historical);
 const { docs, hash } = route ? await routedDocuments(packet, route, sources) : stored ? await storedDocuments(packet, stored, sources) : await pinnedTriple(packet, sources);
 const plan = docs.plan?.head;
 let tasks: PlanTask[] = [];
 if (plan) {
  const body = plan['body'] as { tasks?: unknown } | undefined;
  // Reuse the Plan runner's strict row schema; tests are checked separately.
  const rows = Array.isArray(body?.tasks) ? body.tasks : [];
  requireReview(rows.every(row => row && typeof row === 'object' && !Array.isArray(row)), 'documents.plan', 'Expected task objects');
  const coreRows = rows.map(row => { const { tests: _tests, ...core } = row as PlanTask; return core; });
  const core = validateAgainstSchema<{ tasks: Omit<PlanTask, 'tests'>[] }>(tasksEnumerateSchema, { tasks: coreRows });
  requireReview(core.ok && rows.every(r => Array.isArray((r as PlanTask).tests) && (r as PlanTask).tests.every(t => t && ['unit', 'integration', 'live', 'smoke'].includes(t.level) && typeof t.name === 'string' && t.name.trim())), 'documents.plan', 'Malformed Plan tasks');
  requireReview(isCitationArray(plan['citations']), 'documents.plan', 'Plan citations are malformed');
  tasks = rows as PlanTask[];
  const issues = validatePlanRows(tasks, plan['citations']);
  requireReview(issues.length === 0 && tasks.length > 0, 'documents.plan', issues.join('; ') || 'No Plan tasks');
  requireReview(!packet.taskId || tasks.some(t => t.id === packet.taskId), 'taskId', 'Task is not in the committed Plan');
 }
 const changes: SelectedChange[] = [];
 for (const pointer of packet.reviewSet) {
  const parents = await sources.commit(pointer.commit);
  requireReview(pointer.parent === null ? parents.length === 0 : parents.includes(pointer.parent), 'parent', 'Explicit parent is not a parent of the referenced commit');
  for (const file of pointer.files) {
   const previousPath = file.previousPath ?? file.path;
   const after = await sources.file(pointer.commit, file.path);
   const before = pointer.parent === null || (!historical && after && !file.previousPath) ? null : await sources.file(pointer.parent, previousPath);
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
     if (segment.deletionAt !== undefined) return r.deletionAt === segment.deletionAt;
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
 let derived: StoredDerived | undefined;
 if (!plan && (route || stored)) {
  const unit = route ? derivedUnit(route, docs, new Set(changes.map(change => change.path)).size) : { ...stored!.unit, order: 1, dependsOn: [], derivedFrom: [], tests: [] };
  tasks = [unit];
  derived = { epicHash: hash, unit: { id: unit.id, title: unit.title, summary: unit.summary, size: unit.size, acceptanceChecks: [...unit.acceptanceChecks] } };
  requireReview(!packet.taskId || packet.taskId === unit.id, 'taskId', 'Task is not in the review');
 }
 const revisions = [...new Set(packet.reviewSet.flatMap(c => [c.commit, ...(c.parent ? [c.parent] : [])]))];
 for (const test of packet.tests) {
  requireReview(test.evidenceReferences.length > 0 || test.result === 'not_run', 'tests', 'Reported execution needs provenance');
  let found = false;
  for (const revision of revisions) if (await sources.file(revision, test.file)) { found = true; break; }
  requireReview(found, 'tests', 'Test file is absent from the supplied committed source');
 }
 return { epicHash: hash, packet, changes, tasks, ...(derived ? { derived } : {}), documents: Object.fromEntries(Object.entries(docs).map(([role, doc]) => [role, doc.text])) as Partial<Record<DocumentRole, string>> };
}
/** Internal derivation output, not additional submitter input or a model-facing persistence protocol. */
export interface TaskAttribution { taskId: string; changeIndexes: readonly number[]; testIndexes: readonly number[]; }
export interface TaskAssignment { readonly taskId: string; readonly size: PlanTask['size']; readonly timeoutMs: number; readonly changes: readonly SelectedChange[]; readonly tests: readonly SubmittedTestDetail[]; readonly acceptanceChecks: readonly string[]; readonly reassessment?: { readonly action: 'reassess' | 'reuse'; readonly reason: string; readonly sourceAttempt?: number | undefined } | undefined; }
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

/** Model input contains selected reviewed-version text only, never full blobs or prior code. */
export function selectedCode(change: SelectedChange) {
 const text = change.after && change.segments.some(segment => segment.after) ? utf8(change.after) : '';
 const lines = text.split('\n');
 return { commit: change.commit, parent: change.parent, path: change.path, previousPath: change.previousPath,
  blocks: change.segments.map(segment => segment.after
   ? { lines: segment.after, code: lines.slice(segment.after[0] - 1, segment.after[1]).join('\n') + (segment.after[1] < lines.length ? '\n' : '') }
   : { deletionAt: segment.deletionAt, deleted: true }),
  deletedFile: change.after === null, limitations: change.limitations };
}
