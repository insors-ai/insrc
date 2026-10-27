import assert from 'node:assert/strict';
import { test } from 'node:test';
import { prepareAdherence } from '../../code-review/dimensions/adherence.js';
import { prepareConventions } from '../../code-review/dimensions/conventions.js';
import { prepareCoverage } from '../../code-review/dimensions/coverage.js';
import { prepareQuality } from '../../code-review/dimensions/quality.js';
import { prepareFunctionalCoverage } from '../../code-review/dimensions/functional-coverage.js';
import { prepareDiagram } from '../../code-review/dimensions/diagram/index.js';
import { prepareUx } from '../../code-review/dimensions/ux/index.js';
import { DEFAULT_DEPS, runCodeReview } from '../../code-review/runner.js';
import { buildDiffSymbols } from '../../code-review/grounding.js';
import type { ChangedSymbolSummary, CodeReviewSubject } from '../../code-review/types.js';
import type { LLMMessage, LLMProvider, StructuredCompletionOpts, StructuredSchema } from '../../../shared/types.js';
import { codeReviewSnapshot, effectiveDimensionLimit, executeDimensionJob, type PreparedDimensionReview } from '../code-review.js';
import { promptChars } from '../envelope.js';
import type { ReviewCall } from '../types.js';
import { enveloped } from './enveloped.js';

const subject: CodeReviewSubject = { repoPath: '/repo', epicHash: 'e1a2b3c4d5e6f708', storyId: 'S001', changedFiles: ['data.json'], approvedLld: { meta: { epicHash: 'e1a2b3c4d5e6f708', epicSlug: 'prepared-review', createdAt: '2026-10-27T00:00:00Z', standalone: true }, body: {} } as unknown as CodeReviewSubject['approvedLld'], approvedPlan: null, buildRecord: null };
const factories = [prepareAdherence, prepareConventions, prepareCoverage, prepareQuality, prepareFunctionalCoverage, prepareDiagram, prepareUx];
const grounding = (size: number) => ({ symbols: buildDiffSymbols({ files: [{ path: 'data.json', change: 'added', insertions: 1, deletions: 0 }], body: `diff --git a/data.json b/data.json\n@@ -0,0 +1 @@\n+${'x'.repeat(size)}\n`, truncated: false }) });

test('DIFF-FACTORY-LIMIT: all five model and two deterministic factories share the provider cap through preparation and dispatch', async () => {
 const cap = 12_000, g = grounding(60_000), snapshot = codeReviewSnapshot(subject, g, 'degraded');
 let active: ReviewCall | undefined, current: PreparedDimensionReview | undefined, calls = 0;
 const provider = { inputBudgetChars: cap, capabilities: { boundedStructuredInput: true }, completeStructured: async (messages: LLMMessage[], schema: StructuredSchema, opts?: StructuredCompletionOpts) => {
  calls++; assert.equal(opts?.boundedInput?.maxInputChars, cap); assert.equal(opts.boundedInput.contextMode, 'isolated-structured');
  assert.ok(promptChars(messages, schema) <= cap); assert.ok(active && current);
  if (active.role === 'reduce') return enveloped(schema, { text: 'condensed evidence' });
  if (active.role === 'obligation' || active.role === 'relation') return enveloped(schema, { findings: [] });
  if (active.stage === 'compare') return enveloped(schema, { candidates: [] });
  if (active.stage === 'pair' || active.role === 'single') return enveloped(schema, { findings: [] });
  if (current.dimension !== 'quality') return enveloped(schema, { notes: [], ...(current.dimension === 'coverage' ? { findings: [] } : {}) });
  const rows = new Map(current.adapter.material().atoms.map(a => [a.id, JSON.parse(a.text) as ChangedSymbolSummary]));
  return enveloped(schema, { findings: [], descriptions: active.carries.atomIds.map(atomId => ({ atomId, description: 'local behavior' })), notes: current.dimension !== 'quality' ? [] : active.carries.atomIds.flatMap(id => { const part = rows.get(id)?.diffFragment; return part ? [{ key: `diff-file-quality:${part.parentId}`, atomIds: [id], note: 'local behavior' }] : []; }) });
 } } as unknown as LLMProvider;
 const prepared = factories.map(prepare => prepare(subject, g, provider, { groundingMode: 'degraded', snapshot }));
 assert.equal(calls, 0);
 for (const ready of prepared) {
  assert.equal(ready.snapshot, snapshot); assert.equal(ready.job.snapshot, snapshot); assert.equal(ready.job.plan.limitChars, cap);
  assert.equal(ready.primaryChunkCount, ['ux', 'diagram'].includes(ready.dimension) ? 0 : Math.max(1, ready.job.plan.chunks.length));
  for (const call of ready.job.pending) { assert.ok(promptChars(call.messages, call.schema) <= cap); if (call.execution.mode === 'structured') assert.equal(call.execution.inputContext, 'isolated'); }
  current = ready; const before = ready.job.pending[0]?.callId;
  let first: string | undefined;
  await executeDimensionJob(ready, provider, { groundingMode: 'degraded', onCall: c => { active = c as ReviewCall; first ??= (c as ReviewCall).callId; } });
  assert.equal(first, before);
 }
 assert.ok(calls > 0); assert.equal(effectiveDimensionLimit(provider, 'degraded', 9000), 9000);
 assert.equal(effectiveDimensionLimit({ inputBudgetChars: 900_000 } as LLMProvider, 'degraded', 800_000), 384_000);
 assert.throws(() => effectiveDimensionLimit({ inputBudgetChars: NaN } as LLMProvider, 'degraded'), /Invalid effective/);
});

test('DIFF-TIME-PLAN: the runner prepares all effective dimensions before execution and uses the identical prepared jobs', async () => {
 const g = grounding(10), prepared: PreparedDimensionReview[] = [], events: string[] = [], writes: string[] = [];
 const slots = DEFAULT_DEPS.judges.map(slot => ({ ...slot,
  prepare: (...args: Parameters<NonNullable<typeof slot.prepare>>) => { events.push(`prepare:${slot.dimension}`); const ready = slot.prepare!(...args); prepared.push(ready); return ready; },
  execute: async (ready: PreparedDimensionReview, provider: LLMProvider, ctx: Parameters<NonNullable<typeof slot.execute>>[2]) => { assert.equal(ready, prepared.find(p => p.dimension === slot.dimension)); events.push(`execute:${slot.dimension}`); return slot.execute!(ready, provider, ctx); },
 }));
 let completions = 0;
 const provider = { inputBudgetChars: 12_000, capabilities: { boundedStructuredInput: true }, completeStructured: async (_m: unknown, schema: unknown) => { completions++; assert.equal(events.filter(e => e.startsWith('prepare:')).length, 4); return enveloped(schema, { findings: [] }); } } as unknown as LLMProvider;
 const outcome = await runCodeReview(subject, provider, { runId: 'prepared', modelLabel: 'fake', groundingMode: 'degraded', capVerdictAtWarn: true }, { judges: slots, assembleGrounding: async () => g, write: (p) => { writes.push(p); } });
 assert.ok(outcome.ok, outcome.ok ? '' : outcome.error); assert.equal(completions, 4); assert.equal(writes.length, 2);
 assert.deepEqual(events.slice(0, 4), ['prepare:adherence', 'prepare:conventions', 'prepare:coverage', 'prepare:quality']);
 assert.equal(new Set(prepared.map(p => p.job.reviewId)).size, 4);
 assert.ok(prepared.every(p => p.primaryChunkCount === 1 && p.snapshot === prepared[0]!.snapshot));
 const skip = prepareAdherence({ ...subject, approvedLld: null }, g, provider, { groundingMode: 'degraded' }); assert.equal(skip.primaryChunkCount, 0);
 // Evidence is captured, not retained by mutable caller reference.
 g.symbols[0]!.signature = 'mutated after preparation';
 assert.notEqual((prepared[0]!.snapshot.grounding as { grounding: typeof g }).grounding.symbols[0]!.signature, 'mutated after preparation');
});
