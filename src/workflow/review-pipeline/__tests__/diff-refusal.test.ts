import assert from 'node:assert/strict';
import { test } from 'node:test';
import { InputTooLargeError } from '../../../agent/providers/cli-provider.js';
import type { LLMMessage, LLMProvider, StructuredCompletionOpts, StructuredSchema } from '../../../shared/types.js';
import { buildDiffSymbols } from '../../code-review/grounding.js';
import { validateDiffFragments } from '../../code-review/diff-spans.js';
import { prepareConventions } from '../../code-review/dimensions/conventions.js';
import { prepareQuality } from '../../code-review/dimensions/quality.js';
import type { ChangedSymbolSummary, CodeReviewSubject } from '../../code-review/types.js';
import { executeDimensionJob, type PreparedDimensionReview } from '../code-review.js';
import type { ReviewCall } from '../types.js';
import { enveloped } from './enveloped.js';

const subject: CodeReviewSubject = { repoPath: '/repo', epicHash: 'e1a2b3c4d5e6f708', storyId: 'S001', changedFiles: ['data.json'], approvedLld: null, approvedPlan: null, buildRecord: null };
const body = `diff --git a/data.json b/data.json\n@@ -0,0 +1 @@\n+FACT_ALPHA ${'🙂abc'.repeat(20_000)} FACT_BETA\n`;
const grounding = () => ({ symbols: buildDiffSymbols({ files: [{ path: 'data.json', change: 'added', insertions: 1, deletions: 0 }], body, truncated: false }) });

test('DIFF-REFUSAL-SPAN: singleton refusal restarts only the dimension with lossless descendant ownership and fixed initial time', async () => {
 let active: ReviewCall, refused = false, calls = 0, now = 1000;
 let original: PreparedDimensionReview;
 const rows = new Map<string, ChangedSymbolSummary>(), accepted = new Set<string>(), revisions: PreparedDimensionReview[] = [];
 const capSeen = new Set<number>(), seenCalls = new Set<string>();
 const provider = { inputBudgetChars: 16_000, capabilities: { boundedStructuredInput: true }, completeStructured: async (_messages: LLMMessage[], schema: StructuredSchema, opts?: StructuredCompletionOpts) => {
  calls++; now++; assert.ok(!seenCalls.has(active.callId)); seenCalls.add(active.callId); capSeen.add(opts!.boundedInput!.maxInputChars);
  if (!refused && active.stage === 'judge' && active.carries.atomIds.length === 1 && accepted.size > 0) {
   refused = true; assert.ok(rows.get(active.carries.atomIds[0]!)!.diffFragment);
   throw new InputTooLargeError('lower provider cap', '', { maxChars: 9000 });
  }
  if (active.role === 'reduce') {
   const text = _messages.map(m => m.content).join('\n');
   return enveloped(schema, { text: ['FACT_ALPHA', 'FACT_BETA'].filter(f => text.includes(f)).join(' ') || 'local evidence' });
  }
  if (active.role === 'obligation') {
   if (active.carries.key === 'diff-duplication') return enveloped(schema, { findings: [] });
   const text = _messages.map(m => m.content).join('\n'); assert.ok(text.includes('FACT_ALPHA') && text.includes('FACT_BETA'));
   assert.ok(active.carries.atomIds.every(id => !original.adapter.material().atoms.some(a => a.id === id)), 'old ownership is excluded');
   return enveloped(schema, { findings: [{ severity: 'MED', location: 'data.json:1', message: 'Combined FACT_ALPHA and FACT_BETA prove parent risk after repartition', confidence: 'breach' }] });
  }
  assert.equal(active.stage, 'judge');
  for (const id of active.carries.atomIds) accepted.add(id);
  return enveloped(schema, { findings: refused ? [] : [{ severity: 'LOW', location: 'data.json:1', message: 'STALE primary finding must be discarded', confidence: 'observation' }],
   descriptions: active.carries.atomIds.map(atomId => ({ atomId, description: 'local behavior' })),
   notes: active.carries.atomIds.map(id => ({ key: `diff-file-quality:${rows.get(id)!.diffFragment!.parentId}`, atomIds: [id], note: ['FACT_ALPHA', 'FACT_BETA'].filter(f => rows.get(id)!.signature.includes(f)).join(' ') || 'local behavior' })) });
 } } as unknown as LLMProvider;
 original = prepareQuality(subject, grounding(), provider, { groundingMode: 'degraded', now: () => now });
 for (const a of original.adapter.material().atoms) rows.set(a.id, JSON.parse(a.text) as ChangedSymbolSummary);
 const prepared = { ...original, reprepare: (limit: number, at: number) => {
  const next = original.reprepare(limit, at); revisions.push(next);
  const parts = next.adapter.material().atoms.map(a => JSON.parse(a.text) as ChangedSymbolSummary); validateDiffFragments(parts);
  assert.ok(parts.map(r => r.signature).join('') === original.adapter.material().atoms.map(a => (JSON.parse(a.text) as ChangedSymbolSummary).signature).join(''), 'all captured source bytes survive repartition');
  for (const row of parts) rows.set(row.entityId, row);
  assert.equal(next.snapshot, original.snapshot);
  return next;
 } };
 const output = await executeDimensionJob(prepared, provider, { groundingMode: 'degraded', now: () => now, onCall: c => { active = c as ReviewCall; } });
 assert.ok(refused && calls > 2); assert.equal(revisions.length, 1); assert.ok(capSeen.size > 1);
 assert.equal(output.findings.length, 1); assert.ok(output.findings.every(f => !f.message.includes('STALE')));
 const audit = output.materialRevisions![0]!;
 assert.equal(audit.fromReviewId, original.job.reviewId); assert.equal(audit.toReviewId, revisions[0]!.job.reviewId);
 assert.notEqual(audit.fromMaterialHash, audit.toMaterialHash); assert.ok(audit.limitChars < original.job.plan.limitChars);
 assert.equal(audit.timing.primaryChunkCount, original.primaryChunkCount);
 assert.equal(audit.timing.budgetMs, original.primaryChunkCount * 600_000); assert.equal(audit.timing.startedAt, 1000);
 assert.equal(audit.timing.deadlineAt, 1000 + original.primaryChunkCount * 600_000);
 assert.deepEqual(audit.initialPrimary.map(p => p.id), original.primaryChunkIds);
 assert.equal(audit.descendantRanges.length, revisions[0]!.adapter.material().atoms.length);
 assert.ok(audit.descendantRanges.every(r => r.atomId.includes(':revision:')));
});

test('DIFF-REFUSAL-SPAN: an initially single-call dimension with empty carries rebuilds complete diff evidence after a lower refusal', async () => {
 let active: ReviewCall, calls = 0;
 const provider = { inputBudgetChars: 384_000, capabilities: { boundedStructuredInput: true }, completeStructured: async (_m: unknown, schema: unknown) => {
  calls++;
  if (calls === 1) { assert.equal(active.role, 'single'); assert.equal(active.carries.atomIds.length, 0); throw new InputTooLargeError('smaller singleton limit', '', { maxChars: 9000 }); }
  assert.notEqual(active.role, 'single');
  return enveloped(schema, active.role === 'reduce' ? { text: 'local evidence' } : active.role === 'obligation' ? { findings: [] } : { notes: [] });
 } } as unknown as LLMProvider;
 const initial = prepareConventions(subject, grounding(), provider, { groundingMode: 'degraded', now: () => 1000 });
 assert.equal(initial.job.plan.single, true);
 const output = await executeDimensionJob(initial, provider, { groundingMode: 'degraded', now: () => 1000, onCall: c => { active = c as ReviewCall; } });
 assert.ok(calls > 1); assert.equal(output.materialRevisions!.length, 1);
 const revision = output.materialRevisions![0]!;
 assert.equal(revision.timing.primaryChunkCount, 1); assert.equal(revision.timing.budgetMs, 600_000);
 assert.equal(revision.initialPrimary[0]!.id, 'conventions:single');
 assert.equal(revision.descendantRanges.at(-1)!.endOffset, revision.initialPrimary[0]!.ranges.at(-1)!.endOffset);
});

test('DIFF-REFUSAL-SPAN: repeated irreducible refusals and time exhausted during replacement fail without a dimension result', async () => {
 for (const expire of [false, true]) {
  let now = 1000, calls = 0, active: ReviewCall, attempts = 0;
  const limits: number[] = [], completedRevisions: PreparedDimensionReview[] = [], rows = new Map<string, ChangedSymbolSummary>();
  const provider = { inputBudgetChars: 16_000, capabilities: { boundedStructuredInput: true }, completeStructured: async (_m: unknown, schema: unknown) => {
   calls++;
   if (active.role === 'chunk' && active.carries.atomIds.length === 1 && rows.get(active.carries.atomIds[0]!)!.signature.length > 500) {
    throw new InputTooLargeError('repeated singleton refusal', '', { maxChars: expire || attempts === 0 ? 9000 : attempts === 1 ? 6500 : 100 });
   }
   return enveloped(schema, { findings: [], descriptions: active.carries.atomIds.map(atomId => ({ atomId, description: 'local' })), notes: active.carries.atomIds.map(id => ({ key: `diff-file-quality:${rows.get(id)!.diffFragment!.parentId}`, atomIds: [id], note: 'local' })) });
  } } as unknown as LLMProvider;
  const p = prepareQuality(subject, grounding(), provider, { groundingMode: 'degraded', now: () => now });
  const save = (ready: PreparedDimensionReview) => { for (const a of ready.adapter.material().atoms) rows.set(a.id, JSON.parse(a.text) as ChangedSymbolSummary); };
  save(p);
  const wrapped = { ...p, reprepare: (limit: number, at: number) => {
   attempts++; limits.push(limit);
   const next = p.reprepare(limit, at); completedRevisions.push(next); save(next);
   if (expire) now = 1_000_000_000;
   return next;
  } };
  await assert.rejects(executeDimensionJob(wrapped, provider, { groundingMode: 'degraded', now: () => now, onCall: c => { active = c as ReviewCall; } }), expire ? /deadline exhausted/ : /exceeds|minimum fragment framing|cannot fit|too large/i);
  assert.ok(calls > 0 && calls < 30); assert.ok(limits.every((v, i) => i === 0 || v < limits[i - 1]!));
  if (expire) assert.equal(completedRevisions.length, 1, 'expiry happens after replacement preparation');
  else { assert.ok(attempts >= 3); assert.equal(completedRevisions.length, 2, 'two successful descendants precede irreducibility'); }
 }
});
