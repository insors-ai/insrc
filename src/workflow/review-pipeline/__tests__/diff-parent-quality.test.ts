import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildDiffSymbols } from '../../code-review/grounding.js';
import { qualitySpec } from '../../code-review/dimensions/quality.js';
import type { ChangedSymbolSummary, CodeReviewSubject, DimensionResult } from '../../code-review/types.js';
import { codeReviewSnapshot, modelDimensionAdapter } from '../code-review.js';
import { applyOutput, createReviewJob, nextCalls, result, ReviewCallFailedError, runStage } from '../job.js';
import { promptChars } from '../envelope.js';
import type { ReviewCall, ReviewMaterial } from '../types.js';

const subject: CodeReviewSubject = { repoPath: '/repo', epicHash: 'e1a2b3c4d5e6f708', storyId: 'S001', changedFiles: ['data.json'], approvedLld: null, approvedPlan: null, buildRecord: null };
function fixture(size = 25_000, cap = 384_000) {
	const rows = buildDiffSymbols({ files: [{ path: 'data.json', change: 'added', insertions: 1, deletions: 0 }], body: `diff --git a/data.json b/data.json\n@@ -0,0 +1 @@\n+FACT_ALPHA ${'x'.repeat(size)} FACT_BETA\n`, truncated: false });
	const snapshot = codeReviewSnapshot(subject, { symbols: rows }, 'degraded');
	const adapter = modelDimensionAdapter(qualitySpec(subject), subject, snapshot, cap);
	return { adapter, material: adapter.material(), job: createReviewJob(adapter, 'daemon', snapshot, cap) };
}
function judgeAnswer(call: ReviewCall, material: ReviewMaterial, padding = 0) {
	return { findings: [], descriptions: call.carries.atomIds.map(atomId => ({ atomId, description: 'local logic' })),
		notes: call.carries.atomIds.map(id => {
			const row = JSON.parse(material.atoms.find(a => a.id === id)!.text) as ChangedSymbolSummary;
			return { key: `diff-file-quality:${row.diffFragment!.parentId}`, atomIds: [id], note: [row.signature.includes('FACT_ALPHA') ? 'FACT_ALPHA' : '', row.signature.includes('FACT_BETA') ? 'FACT_BETA' : '', 'local evidence', 'padding '.repeat(padding)].join(' ') };
		}) };
}

test('DIFF-FITS-ONE-CALL: fragmented quality still validates notes and gathers the parent when all input fits one primary call', async () => {
	const { adapter, material, job } = fixture();
	assert.ok(material.atoms.length > 1); assert.equal(job.plan.single, false);
	assert.equal(job.plan.chunks.length, 1); assert.equal(job.pending.length, 1);
	const primary = job.pending[0]!; assert.equal(primary.role, 'chunk');
	let next = applyOutput(job, adapter, primary.callId, { callId: primary.callId, answer: judgeAnswer(primary, material) });
	const parent = next.pending.find(c => c.role === 'obligation');
	assert.ok(parent); assert.match(parent.carries.key!, /^diff-file-quality:/);
	assert.deepEqual(parent.carries.atomIds.slice().sort(), material.atoms.map(a => a.id).sort());
	next = applyOutput(next, adapter, parent.callId, { callId: parent.callId, answer: { findings: [] } });
	assert.equal(next.phase, 'done');
});

test('DIFF-PARENT-QUALITY: missing, duplicate, foreign and mismatched fragment notes cannot complete a chunk', () => {
	for (const mutate of [
		(a: ReturnType<typeof judgeAnswer>) => { a.notes = []; },
		(a: ReturnType<typeof judgeAnswer>) => { a.notes.push(a.notes[0]!); },
		(a: ReturnType<typeof judgeAnswer>) => { a.notes.push({ key: a.notes[0]!.key, atomIds: ['foreign'], note: 'invented' }); },
		(a: ReturnType<typeof judgeAnswer>) => { a.notes[0]!.key = 'diff-file-quality:other-parent'; },
	]) {
		const { adapter, material, job } = fixture(); const call = job.pending[0]!;
		const answer = judgeAnswer(call, material); mutate(answer);
		const retried = applyOutput(job, adapter, call.callId, { callId: call.callId, answer });
		const retry = retried.pending.find(c => c.attempt === 2)!; assert.ok(retry);
		assert.throws(() => applyOutput(retried, adapter, retry.callId, { callId: retry.callId, answer }), ReviewCallFailedError);
	}
	const { adapter, material } = fixture(); const key = material.obligations[0]!.key;
	assert.throws(() => adapter.gather!.obligationCall(key, [], []), /Missing parent fragment evidence/, 'NO_EVIDENCE cannot manufacture a parent success');
});

test('DIFF-PARENT-QUALITY: bounded reduction preserves separate fragment facts for parent-only correctness judgment', async () => {
	const { adapter, material, job: initial } = fixture(100_000, 12_000);
	assert.ok(initial.pending.length > 1);
	let job = initial, reductions = 0, parents = 0;
	const primaryFacts = new Map<string, string[]>();
	while (job.phase !== 'done') {
		const call = nextCalls(job, adapter)[0];
		if (call === undefined) { job = await runStage(job, adapter); continue; }
		assert.ok(promptChars(call.messages, call.schema) <= 12_000);
		const text = call.messages.map(m => m.content).join('\n');
		let answer: unknown;
		if (call.role === 'reduce') {
			reductions++;
			answer = { text: [text.includes('FACT_ALPHA') ? 'FACT_ALPHA' : '', text.includes('FACT_BETA') ? 'FACT_BETA' : '', 'condensed local evidence'].join(' ') };
		} else if (call.role === 'obligation') {
			parents++; assert.match(text, /FACT_ALPHA/); assert.match(text, /FACT_BETA/);
			assert.match(text, /parentDigest/); assert.match(text, /ranges/);
			assert.ok(!text.includes('"atomIds"'), 'bounded parent metadata uses compact source ranges, not all raw IDs');
			assert.deepEqual(call.carries.atomIds.slice().sort(), material.atoms.map(a => a.id).sort());
			answer = { findings: [{ severity: 'MED', location: 'data.json:1', message: 'Parent correctness risk established by FACT_ALPHA combined with FACT_BETA', confidence: 'breach' }] };
		} else if (call.stage === 'judge') {
			const local = judgeAnswer(call, material, 180);
			assert.deepEqual(local.findings, []);
			primaryFacts.set(call.callId, local.notes.flatMap(n => ['FACT_ALPHA', 'FACT_BETA'].filter(f => n.note.includes(f))));
			answer = local;
		} else answer = call.stage === 'compare' ? { candidates: [] } : { findings: [] };
		job = applyOutput(job, adapter, call.callId, { callId: call.callId, answer });
	}
	assert.ok(reductions > 0); assert.equal(parents, 1);
	assert.ok([...primaryFacts.values()].some(f => f.includes('FACT_ALPHA')) && [...primaryFacts.values()].some(f => f.includes('FACT_BETA')));
	assert.ok([...primaryFacts.values()].every(f => f.length < 2), 'neither primary call establishes both facts');
	assert.ok(Object.keys(job.noteProvenance).length >= reductions);
	const output = result<DimensionResult>(job); assert.equal(output.findings.length, 1); assert.match(output.findings[0]!.message, /Parent correctness/);
});
