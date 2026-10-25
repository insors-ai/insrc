/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { LLMProvider } from '../../../shared/types.js';
import type { CodeReviewSubject, CodeReviewGrounding, DimensionResult } from '../../code-review/types.js';
import { codeReviewSnapshot, modelDimensionAdapter, type ModelDimensionSpec } from '../code-review.js';
import { createReviewJob } from '../job.js';
import { runReviewJob } from '../driver.js';
import { REVIEW_CALL_LIMITS } from '../../review/call-limits.js';
import { enveloped } from './enveloped.js';

const subject = { repoPath: '/repo', epicHash: 'e', storyId: 's1', changedFiles: ['a.ts', 'b.ts'], approvedLld: null, approvedPlan: null, buildRecord: null } satisfies CodeReviewSubject;
const grounding: CodeReviewGrounding = { symbols: ['a', 'b'].map(name => ({ entityId: name, name, file: `${name}.ts`, kind: 'function', signature: `${name}()`, callers: [], callees: name === 'a' ? ['b'] : [], testsReaching: [] })) };
const schema = { type: 'object', required: ['findings'], properties: { findings: { type: 'array', items: { type: 'object' } } } };
function fixture(sourceInspection: boolean) {
	const spec: ModelDimensionSpec<{ findings: [] }> = {
		dimension: 'adherence', sourceInspection, schema,
		prompt: () => [{ role: 'user', content: 'Judge the approved clause.' }],
		toResult: output => ({ dimension: 'adherence', findings: output.findings }),
		chunk: { kind: 'notes', framing: 'Gather adherence evidence.', judge: 'Check the clause.', relation: 'Check caller and callee.' },
		obligations: () => ({ obligations: [{ key: 'clause', kind: 'clause', text: 'a must call b' }], context: [] }),
	};
	const snapshot = codeReviewSnapshot(subject, grounding);
	const adapter = modelDimensionAdapter(spec, subject, snapshot);
	return { adapter, snapshot };
}
const textOf = (call: { messages: readonly { content: unknown }[] }) => call.messages.map(m => m.content).join('\n');

test('source inspection routes every review role through bounded read-only sessions', () => {
	const { adapter } = fixture(true);
	const single = adapter.stagesFor('daemon')[0]!.singleCalls()[0]!;
	const material = adapter.material();
	const chunk = adapter.stagesFor('daemon')[0]!.chunkCalls({ id: 'c1', atomIds: ['a'], neighbours: [] })[0]!;
	const gather = adapter.gather!;
	const obligation = gather.obligationCall('clause', [], []);
	const reduce = gather.reduceCall('clause', []);
	const relations = gather.relationCall!([material.atoms[0]!, material.atoms[1]!]);
	for (const call of [single, chunk, obligation, reduce, ...relations]) {
		assert.deepEqual(call.execution, { mode: 'reviewer-session', cwd: '/repo', tools: 'read-only', deadlineMs: REVIEW_CALL_LIMITS['code-review'].timeoutMs, stallMs: REVIEW_CALL_LIMITS['code-review'].silenceMs });
	}
	assert.ok(relations.length > 0);
	const old = fixture(false).adapter;
	assert.equal(old.stagesFor('daemon')[0]!.singleCalls()[0]!.execution.mode, 'structured');
	assert.match(textOf(old.stagesFor('daemon')[0]!.chunkCalls({ id: 'c1', atomIds: ['a'], neighbours: [] })[0]!), /Reason only over the structured symbol summaries/);
	assert.match(textOf(old.gather!.obligationCall('clause', [], [])), /notes are the whole evidence/);
});

test('source-inspecting divided prompts preserve citations and uncertainty instead of closing evidence', () => {
	const { adapter } = fixture(true);
	const m = adapter.material();
	const calls = [adapter.stagesFor('daemon')[0]!.chunkCalls({ id: 'c1', atomIds: ['a'], neighbours: [] })[0]!, adapter.gather!.obligationCall('clause', [], []), adapter.gather!.reduceCall('clause', []), ...adapter.gather!.relationCall!([m.atoms[0]!, m.atoms[1]!])];
	for (const call of calls) {
		const prompt = textOf(call);
		assert.match(prompt, /read-only commands such as rg, sed or git show/);
		assert.match(prompt, /Do not edit files, run tests, builds/);
		assert.match(prompt, /source citations and uncertainty/);
		assert.match(prompt, /LOW.*observation/);
		assert.doesNotMatch(prompt, /Reason only over the structured symbol summaries|notes are the whole evidence/);
	}
	assert.match(textOf(calls[1]!), /Missing notes are missing evidence, never proof/);
	assert.match(textOf(calls[2]!), /Never turn an unverified note into a proven breach/);
});

test('source-inspection driver propagates deadlines and retries sessions without structured fallback', async () => {
	const { adapter, snapshot } = fixture(true);
	let calls = 0;
	const provider = {
		runReviewSession: async (_prompt: string, outputSchema: object, opts: { cwd: string; deadlineMs: number; stallMs: number; internalRetry: boolean }) => {
			calls++;
			assert.equal(opts.cwd, '/repo');
			assert.equal(opts.internalRetry, false);
			assert.ok(opts.deadlineMs > 0 && opts.deadlineMs <= 600_000);
			assert.equal(opts.stallMs, 300_000);
			if (calls === 1) throw new Error('temporary reviewer failure');
			return enveloped(outputSchema, { findings: [] });
		},
		completeStructured: async () => { throw new Error('unsafe structured fallback'); },
	} as unknown as LLMProvider;
	const result = await runReviewJob(createReviewJob(adapter, 'daemon', snapshot, 100_000), adapter, provider) as DimensionResult;
	assert.deepEqual(result.findings, []);
	assert.equal(calls, 2);
});

test('source-inspection missing session fails rather than fabricating a pass', async () => {
	const { adapter, snapshot } = fixture(true);
	await assert.rejects(runReviewJob(createReviewJob(adapter, 'daemon', snapshot, 100_000), adapter, {} as LLMProvider), /reviewer session|did not complete|failed/i);
});
