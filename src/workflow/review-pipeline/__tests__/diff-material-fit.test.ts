import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildDiffSymbols } from '../../code-review/grounding.js';
import { validateDiffFragments } from '../../code-review/diff-spans.js';
import { qualitySpec } from '../../code-review/dimensions/quality.js';
import type { ChangedSymbolSummary, CodeReviewSubject } from '../../code-review/types.js';
import { codeReviewMaterial } from '../adapters/code-review-material.js';
import { codeReviewSnapshot, modelDimensionAdapter } from '../code-review.js';
import { promptChars } from '../envelope.js';
import { applyOutput, createReviewJob, nextCalls, runStage } from '../job.js';
import { AtomTooLargeError } from '../pack-into-batches.js';

const subject: CodeReviewSubject = { repoPath: '/repo', epicHash: 'e1a2b3c4d5e6f708', storyId: 'S001', changedFiles: ['data.json'], approvedLld: null, approvedPlan: null, buildRecord: null };
function evidence(size: number, path = 'data.json'): ChangedSymbolSummary[] {
	return buildDiffSymbols({ files: [{ path, change: 'added', insertions: 1, deletions: 0 }], body: `diff --git a/${path} b/${path}\n@@ -0,0 +1 @@\n+${'x'.repeat(size)}\n`, truncated: false });
}

test('DIFF-LOW-CAP: actual quality framing and schema fit below a 16384-character staging span', () => {
	const rows = evidence(100_000);
	const snapshot = codeReviewSnapshot(subject, { symbols: rows }, 'degraded');
	const before = structuredClone(snapshot);
	const adapter = modelDimensionAdapter(qualitySpec(subject), subject, snapshot, 12_000);
	const material = adapter.material();
	assert.ok(material.atoms.length > rows.length, 'lower cap forces real subdivision before primary planning');
	const fitted = material.atoms.map(a => JSON.parse(a.text) as ChangedSymbolSummary);
	validateDiffFragments(fitted);
	assert.equal(fitted.map(r => r.signature).join(''), rows.map(r => r.signature).join(''));
	assert.deepEqual(snapshot, before, 'original source snapshot stays immutable');
	const job = createReviewJob(adapter, 'daemon', snapshot, 12_000);
	assert.equal(job.plan.single, false);
	assert.deepEqual([...job.plan.chunks.flatMap(c => c.atomIds)].sort(), material.atoms.map(a => a.id).sort());
	for (const call of job.pending) assert.ok(promptChars(call.messages, call.schema) <= 12_000);
});

test('DIFF-LOW-CAP: fixed framing that cannot fit refuses instead of exploding into tiny evidence', () => {
	const snapshot = codeReviewSnapshot(subject, { symbols: evidence(100_000) }, 'degraded');
	const spec = qualitySpec(subject);
	const impossible = { ...spec, chunk: { ...spec.chunk!, framing: 'fixed required context '.repeat(1_000) } };
	assert.throws(() => modelDimensionAdapter(impossible, subject, snapshot, 12_000).material(), AtomTooLargeError);
});

test('DIFF-INTEGRITY: material rejects bad fragment provenance before accepting any atom', () => {
	const rows = evidence(50_000);
	const first = rows[0]!;
	rows[0] = { ...first, diffFragment: { ...first.diffFragment!, endOffset: first.diffFragment!.endOffset - 1 } };
	assert.throws(() => codeReviewMaterial({ symbols: rows }), /diff fragment/);
});

test('DIFF-SCALE: sibling material links remain linear and do not fabricate graph calls', () => {
	const rows = [...evidence(4_000_000), ...evidence(100_000, 'other.json')];
	const material = codeReviewMaterial({ symbols: rows });
	assert.ok(material.atoms.length > 200);
	assert.ok(material.relations.length < material.atoms.length * 3, `${material.relations.length} sparse links for ${material.atoms.length} fragments`);
	assert.ok(material.relations.every(r => r.kind !== 'calls'));
	const touched = new Set(material.relations.flatMap(r => [r.from, r.to]));
	assert.equal(touched.size, material.atoms.length, 'each fragment remains connected to its parent chain');
});

test('DIFF-LARGE: S003-sized complete evidence plans bounded primary calls with every span covered', async () => {
	const rows = evidence(1_838_027);
	const snapshot = codeReviewSnapshot(subject, { symbols: rows }, 'degraded');
	const adapter = modelDimensionAdapter(qualitySpec(subject), subject, snapshot, 384_000);
	let job = createReviewJob(adapter, 'daemon', snapshot, 384_000);
	assert.ok(job.pending.length > 1);
	assert.deepEqual(job.plan.chunks.flatMap(c => c.atomIds).sort(), adapter.material().atoms.map(a => a.id).sort());
	for (const call of job.pending) assert.ok(promptChars(call.messages, call.schema) <= 384_000);
	const reviewed: string[] = [];
	while (job.phase !== 'done') {
		const call = nextCalls(job, adapter)[0];
		if (call === undefined) { job = await runStage(job, adapter); continue; }
		assert.ok(promptChars(call.messages, call.schema) <= 384_000);
		if (call.stage === 'judge') reviewed.push(...call.carries.atomIds);
		const answer = call.stage === 'judge'
			? { findings: [], descriptions: call.carries.atomIds.map(atomId => ({ atomId, description: `Local facts for ${atomId}` })), notes: call.carries.atomIds.map(atomId => { const row = JSON.parse(adapter.material().atoms.find(a => a.id === atomId)!.text) as ChangedSymbolSummary; return { key: `diff-file-quality:${row.diffFragment!.parentId}`, atomIds: [atomId], note: 'Local quality facts' }; }) }
			: call.stage === 'compare' ? { candidates: [] } : { findings: [] };
		job = applyOutput(job, adapter, call.callId, { callId: call.callId, answer });
	}
	assert.deepEqual(reviewed.sort(), adapter.material().atoms.map(a => a.id).sort(), 'each complete source span reaches a completed serial primary call');
});

test('DIFF-LOW-CAP: a small renamed file keeps its original path when fitting requires new fragments', () => {
	const rows = buildDiffSymbols({ files: [{ path: 'data.json', origPath: 'old.json', change: 'renamed', insertions: 1, deletions: 1 }],
		body: `diff --git a/old.json b/data.json\n--- a/old.json\n+++ b/data.json\n@@ -1 +1 @@\n-old\n+${'x'.repeat(4_000)}\n`, truncated: false });
	assert.equal(rows.length, 1);
	const snapshot = codeReviewSnapshot(subject, { symbols: rows }, 'degraded');
	const adapter = modelDimensionAdapter(qualitySpec(subject), subject, snapshot, 6_000);
	const material = adapter.material();
	assert.ok(material.atoms.length > 1);
	for (const atom of material.atoms) assert.equal((JSON.parse(atom.text) as ChangedSymbolSummary).diffFragment!.oldFile, 'old.json');
});
