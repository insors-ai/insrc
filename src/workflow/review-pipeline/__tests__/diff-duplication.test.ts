import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildDiffSymbols } from '../../code-review/grounding.js';
import { qualitySpec } from '../../code-review/dimensions/quality.js';
import type { ChangedSymbolSummary, CodeReviewSubject, DimensionResult } from '../../code-review/types.js';
import { codeReviewSnapshot, modelDimensionAdapter } from '../code-review.js';
import { applyOutput, createReviewJob, nextCalls, result, ReviewCallFailedError, runStage } from '../job.js';
import { promptChars } from '../envelope.js';
import { parentFindingReasons } from '../adapters/diff-parent-evidence.js';

const subject: CodeReviewSubject = { repoPath: '/repo', epicHash: 'e1a2b3c4d5e6f708', storyId: 'S001', changedFiles: ['a.json', 'b.json', 'small.ts'], approvedLld: null, approvedPlan: null, buildRecord: null };

test('DIFF-SCALE-DUPLICATES: hundreds of fragments use bounded parent and cross-parent judgments without symbol pair calls', async () => {
 const cap = 12_000;
 const bodies = [
  ['a.json', `WITHIN_ALPHA CROSS_ALPHA ${'x'.repeat(1_050_000)} WITHIN_BETA`],
  ['b.json', `CROSS_BETA ${'y'.repeat(30_000)}`],
  ['small.ts', 'SMALL_DUPLICATE'],
 ] as const;
 const rows = buildDiffSymbols({ files: bodies.map(([path]) => ({ path, change: 'added' as const, insertions: 1, deletions: 0 })), body: bodies.map(([path, body]) => `diff --git a/${path} b/${path}\n@@ -0,0 +1 @@\n+${body}\n`).join(''), truncated: false });
 const snapshot = codeReviewSnapshot(subject, { symbols: rows }, 'degraded');
 const adapter = modelDimensionAdapter(qualitySpec(subject), subject, snapshot, cap), material = adapter.material();
 const byId = new Map(material.atoms.map(a => [a.id, JSON.parse(a.text) as ChangedSymbolSummary]));
 const fragments = material.atoms.filter(a => byId.get(a.id)!.diffFragment !== undefined);
 assert.ok(fragments.length > 200);
 let job = createReviewJob(adapter, 'daemon', snapshot, cap), primaries = 0, reductions = 0, obligations = 0;
 // Exercise the real primary-answer boundary, including its correction attempt.
 const primary = nextCalls(job, adapter)[0]!;
 const validNotes = primary.carries.atomIds.flatMap(id => {
  const row = byId.get(id)!;
  return row.diffFragment === undefined ? [] : [{ key: `diff-file-quality:${row.diffFragment.parentId}`, atomIds: [id], note: 'local evidence' }];
 });
 for (const invalid of [
  { location: 'a.json:1', counterpartRef: fragments[0]!.id },
  { location: 'a.json:1', counterpartRef: 'foreign.ts:1' },
  { location: fragments[0]!.id, counterpartRef: 'b.json:1' },
 ]) {
  const answer = { findings: [{ ...invalid, severity: 'MED', message: 'invalid provenance', confidence: 'breach' }], descriptions: primary.carries.atomIds.map(atomId => ({ atomId, description: 'local' })), notes: validNotes };
  const retryJob = applyOutput(job, adapter, primary.callId, { callId: primary.callId, answer });
  const retry = retryJob.pending.find(c => c.attempt === 2)!;
  assert.ok(retry, 'invalid primary provenance must request correction');
  assert.throws(() => applyOutput(retryJob, adapter, retry.callId, { callId: retry.callId, answer }), ReviewCallFailedError);
 }
 const facts = ['WITHIN_ALPHA', 'WITHIN_BETA', 'CROSS_ALPHA', 'CROSS_BETA', 'SMALL_DUPLICATE'];
 const localFacts: string[][] = [];
 while (job.phase !== 'done') {
  const call = nextCalls(job, adapter)[0];
  if (call === undefined) { job = await runStage(job, adapter); continue; }
  assert.ok(promptChars(call.messages, call.schema) <= cap);
  const text = call.messages.map(m => m.content).join('\n');
  let answer: unknown;
  if (call.role === 'reduce') {
   reductions++; answer = { text: facts.filter(f => text.includes(f)).join(' ') || 'No duplicated behavior in this portion' };
  } else if (call.role === 'obligation') {
   obligations++;
   if (call.carries.key === 'diff-duplication') {
    for (const f of ['CROSS_ALPHA', 'CROSS_BETA', 'SMALL_DUPLICATE']) assert.ok(text.includes(f), f);
    assert.deepEqual(call.carries.atomIds.slice().sort(), material.atoms.map(a => a.id).sort());
    answer = { findings: [
     { severity: 'MED', location: 'a.json:1', counterpartRef: 'b.json:1', message: 'Cross parent duplicated behavior', confidence: 'breach' },
     { severity: 'MED', location: 'a.json:1:10', counterpartRef: 'small.ts:1', message: 'Fragment versus ordinary evidence duplicates behavior', confidence: 'breach' },
    ] };
   } else if (text.includes('WITHIN_ALPHA')) {
    assert.ok(text.includes('WITHIN_BETA'));
    answer = { findings: [{ severity: 'MED', location: 'a.json:1:1', counterpartRef: 'a.json:1:100', message: 'Within parent duplicated behavior', confidence: 'breach' }] };
   } else answer = { findings: [] };
  } else {
   assert.equal(call.stage, 'judge', 'fragment evidence never reaches compare or pair model calls'); primaries++;
   const carriedFacts = call.carries.atomIds.flatMap(id => facts.filter(f => byId.get(id)!.signature.includes(f)));
   localFacts.push(carriedFacts);
   answer = { findings: [], descriptions: call.carries.atomIds.map(id => ({ atomId: id, description: facts.filter(f => byId.get(id)!.signature.includes(f)).join(' ') || 'local behavior' })),
    notes: call.carries.atomIds.flatMap(id => {
     const row = byId.get(id)!;
     return row.diffFragment === undefined ? [] : [{ key: `diff-file-quality:${row.diffFragment.parentId}`, atomIds: [id], note: facts.filter(f => row.signature.includes(f)).join(' ') || 'local behavior' }];
    }) };
  }
  job = applyOutput(job, adapter, call.callId, { callId: call.callId, answer });
 }
 assert.ok(primaries <= material.atoms.length); assert.ok(reductions > 0); assert.equal(obligations, 3);
 assert.ok(localFacts.every(f => !(f.includes('WITHIN_ALPHA') && f.includes('WITHIN_BETA'))));
 const output = result<DimensionResult>(job); assert.equal(output.findings.length, 3);
 assert.deepEqual(new Set(output.findings.map(f => f.counterpartRef)), new Set(['a.json:1:100', 'b.json:1', 'small.ts:1']));
 assert.throws(() => adapter.gather!.obligationCall('diff-duplication', [], []), /Missing parent fragment evidence/);
 assert.ok(parentFindingReasons('diff-duplication', { findings: [{ location: 'a.json:1', counterpartRef: fragments[0]!.id }] }, material).length > 0);
 const pair = adapter.stagesFor('daemon').find(s => s.id === 'pair')!;
 const first = fragments[0]!.id, second = fragments[1]!.id;
 assert.throws(() => pair.chunkCalls({ id: 'c1', atomIds: [first], neighbours: [], chars: 0 }, { compare: [{ answer: { candidates: [{ a: first, b: second, why: 'invalid fragment pair' }] } }] } as never, snapshot), /Diff fragments cannot enter/);
});
