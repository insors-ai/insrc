import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rawReviewCall, CONTROLLER_DECLARATION as declaration } from './terminal-client.js';
import { writeDesign, idOfWorkflow } from './review-fixture.js';
import { getStepStateStore } from '../../../threads/step-state.js';
import { _clearReviewStateStoreForTests } from '../state-store.js';
import { controllerPolicy, admitControllerFrame } from '../../../../workflow/review-pipeline/controller.js';
import { validateAgainstSchema } from '../../../../agent/providers/structured-output.js';
import { reviewTemplateFor } from '../../../../workflow/review/template.js';
import { createRepoLifecycle } from '../../../../workflow/artifact-core/repo-lifecycle.js';
import { rawControllerCall } from '../../code-review-step/__tests__/controller-client.js';
import { DEFAULT_DEPS } from '../../code-review-step/handler.js';
import type { Entity } from '../../../../shared/types.js';
import type { ReviewStepDeps, ReviewStepStatePayload } from '../types.js';
import '../../../../workflow/__tests__/helpers/converted-repos.js';

type Frame = Record<string, any>;
const parse = (value: { content: { text: string }[] }): Frame => JSON.parse(value.content[0]!.text);
const call = async (input: unknown, deps: ReviewStepDeps = {}) => parse(await rawReviewCall(input, deps));
const resume = (frame: Frame, answer: unknown, extra: Record<string, unknown> = {}) => ({ phase: frame.next === 'emit_claims' ? 'claims' : frame.next === 'emit_findings' ? 'findings' : 'verdicts', state: frame.state, reviewBudget: declaration,
	reply: { version: 1, generation: frame.call.generation, callId: frame.call.callId, answer }, ...extra });
function fixture(workflow: string, text = 'Read the exported constant in src/foo.ts.') {
	const repo = mkdtempSync(join(tmpdir(), 'design-controller-budget-'));
	mkdirSync(join(repo, 'src')); writeFileSync(join(repo, 'src/foo.ts'), 'export const alpha = 1;\nexport const beta = 2;\n');
	return { repo, ...writeDesign(repo, idOfWorkflow(workflow), { meta: { workflow, authoredBy: 'daemon' }, body: { summary: text } }, text) };
}
const templateAnswer = () => ({ items: reviewTemplateFor('spec').items.map(item => ({ item: item.id, premises: [{ premise: 'checked', outcome: 'holds', evidence: 'source inspected', action: 'none needed' }] })) });
const claim = (id: string) => ({ id, ref: id, kind: 'citation', text: `Constant ${id} exists`, anchors: ['src/foo.ts:1'], probe: { reads: ['src/foo.ts:1'] } });
const verdict = (id: string) => ({ claimId: id, severity: 'LOW', evidence: 'read the whole assigned evidence', action: 'none needed', fixability: 'manual' });

test('template extraction evidence verification and finalization preserve every required claim through admitted controller turns', async () => {
	await _clearReviewStateStoreForTests();
	const design = fixture('design.story'), premise = fixture('define'), huge = fixture('design.story', 'required material '.repeat(50000));
	let probes = 0;
	const deps: ReviewStepDeps = { readEntitiesForRepo: async () => { probes++; return []; }, lifecycleFor: repo => createRepoLifecycle(repo).service };
	try {
		const start = { phase: 'start', artifact: design.mdPath, repo: design.repo };
		assert.equal((await call(start, deps)).error.code, 'controller-budget-required');
		assert.equal((await call({ ...start, reviewBudget: { ...declaration, profile: { ...declaration.profile, qualification: 'unqualified' } } }, deps)).next, 'error');
		const first = await call({ ...start, reviewBudget: declaration }, deps);
		assert.equal(first.next, 'emit_findings');
		const policy = controllerPolicy(declaration).policy;
		const budget = admitControllerFrame(first, policy, declaration);
		const saved = (await getStepStateStore().read<ReviewStepStatePayload>('review', first.state))!.payload;
		assert.deepEqual(saved.controller!.frameBudget, budget, 'the full actual MCP envelope is admitted once');
		const answer = templateAnswer();
		assert.equal(validateAgainstSchema(first.schema, resume(first, answer).reply).ok, true);
		for (const extra of [
			{ reply: { ...resume(first, answer).reply, generation: 1 } },
			{ reply: { ...resume(first, answer).reply, callId: '00000000-0000-4000-8000-000000000000' } },
			{ phase: 'verdicts' },
			{ reviewBudget: { ...declaration, profile: { ...declaration.profile, providerId: 'other' } } },
		]) assert.equal((await call(resume(first, answer, extra), deps)).next, 'error');
		assert.equal((await call({ phase: 'findings', state: first.state, findings: answer }, deps)).error.code, 'controller-budget-required');
		assert.equal((await call(resume(first, { items: [] }), deps)).next, 'error');
		assert.equal((await call(resume(first, answer), deps)).next, 'done');
		assert.equal((await call(resume(first, answer), deps)).next, 'already_completed');
		assert.equal((await call({ phase: 'start', artifact: huge.mdPath, repo: huge.repo, reviewBudget: declaration }, deps)).error.code, 'mandatory-context-over-budget');

		let frame = await call({ phase: 'start', artifact: premise.mdPath, repo: premise.repo, reviewBudget: declaration }, deps);
		assert.equal(frame.next, 'emit_claims'); assert.equal(probes, 0, 'no probes before validated extraction');
		const extracted = { claims: [claim('c1'), claim('c2')] };
		assert.equal((await call(resume(frame, { claims: [claim('c1'), claim('c1')] }), deps)).next, 'error');
		frame = await call(resume(frame, extracted), deps);
		assert.equal(frame.next, 'emit_verdicts'); assert.ok(probes > 0);
		const payload = (await getStepStateStore().read<ReviewStepStatePayload>('review', frame.state))!.payload;
		assert.deepEqual(payload.claims!.map(c => c.id), ['c1', 'c2']); assert.equal(payload.evidence!.length, 2);
		assert.equal(frame.evidence, undefined, 'no duplicate unassigned grounding in the wire frame');
		assert.deepEqual(frame.call.assignedClaimIds, ['c1']); assert.ok(frame.prompt.user.includes('c1')); assert.ok(!frame.prompt.user.includes('Constant c2 exists'));
		const before = readFileSync(premise.jsonPath, 'utf8');
		for (const verdicts of [[], [verdict('c2')], [verdict('c1'), verdict('c1')]]) assert.equal((await call(resume(frame, { verdicts }), deps)).next, 'error');
		assert.equal(readFileSync(premise.jsonPath, 'utf8'), before);
		const firstVerify = frame;
		assert.equal((await call(resume(frame, { verdicts: [verdict('c1')] }, { reviewBudget: { ...declaration, hostContextReserveTokens: 200000 } }), deps)).next, 'error');
		frame = await call(resume(firstVerify, { verdicts: [verdict('c1')] }), deps);
		assert.deepEqual(frame.call.assignedClaimIds, ['c2']); assert.equal(frame.call.generation, firstVerify.call.generation + 1);
		assert.ok(frame.timing.jobBudgetMs >= 1800000, 'extraction and both claims each contribute ten minutes');
		const finalInput = resume(frame, { verdicts: [verdict('c2')] });
		assert.equal((await call(finalInput, deps)).next, 'done'); assert.equal((await call(finalInput, deps)).next, 'already_completed');
	} finally { for (const fx of [design, premise, huge]) rmSync(fx.repo, { recursive: true, force: true }); }
});

test('design continuations refuse expired changed and cancelled sources without a review write', async () => {
	for (const mode of ['expired', 'changed', 'cancelled', 'empty'] as const) {
		const fx = fixture('define'); let now = 1000;
		const deps: ReviewStepDeps = { nowMs: () => now, readEntitiesForRepo: async () => [], lifecycleFor: repo => createRepoLifecycle(repo).service };
		try {
			const frame = await call({ phase: 'start', artifact: fx.mdPath, repo: fx.repo, reviewBudget: declaration }, deps);
			const before = readFileSync(fx.jsonPath, 'utf8');
			if (mode === 'expired') now += 600001;
			if (mode === 'changed') writeFileSync(fx.mdPath, readFileSync(fx.mdPath, 'utf8') + '\nnew material');
			if (mode === 'cancelled') { const abort = new AbortController(); abort.abort(); deps.signal = abort.signal; }
			const result = await call(resume(frame, { claims: [] }), deps);
			if (mode === 'empty') assert.equal(result.next, 'done', JSON.stringify(result));
			else { assert.equal(result.next, 'error', JSON.stringify(result)); assert.equal(readFileSync(fx.jsonPath, 'utf8'), before); }
		} finally { rmSync(fx.repo, { recursive: true, force: true }); }
	}
});


test('grounded and degraded design evidence retain all claims and enforce original-epoch deadline boundaries', async () => {
	for (const grounded of [true, false]) {
		const fx = fixture('define'); let now = 1000;
		const events: unknown[] = [];
		const deps: ReviewStepDeps = { nowMs: () => now, progress: value => events.push(value), readEntitiesForRepo: async () => grounded ? [{ id: 'file', kind: 'file', file: join(fx.repo, 'src/foo.ts'), repo: fx.repo } as Entity] : [], lifecycleFor: repo => createRepoLifecycle(repo).service };
		try {
			const start = await call({ phase: 'start', artifact: fx.mdPath, repo: fx.repo, reviewBudget: declaration }, deps);
			now += 599999;
			const frame = await call(resume(start, { claims: [claim('a'), claim('b')] }), deps);
			assert.equal(frame.next, 'emit_verdicts', JSON.stringify(frame));
			const snapshot = (await getStepStateStore().read<ReviewStepStatePayload>('review', frame.state))!.payload;
			assert.equal(snapshot.claims!.length, 2); assert.equal(snapshot.evidence!.length, 2);
			assert.equal(events.some(e => (e as { mode?: string | undefined }).mode === 'degraded'), !grounded);
			assert.equal(frame.timing.deadlineAt, 1000 + 1800000, 'new work extends budget from original epoch');
			now = frame.timing.deadlineAt;
			const input = resume(frame, { verdicts: [verdict('a')] });
			assert.equal((await call(input, deps)).error.code, 'review-job-timeout');
			assert.equal((await call(input, deps)).error.code, 'review-state-uncertain', 'late answers cannot revive expired work');
		} finally { rmSync(fx.repo, { recursive: true, force: true }); }
	}
});

test('actual design and code-review handlers refuse cross-protocol tokens and stale envelopes without consuming valid work', async () => {
	const fx = fixture('design.story');
	try {
		const frame = await call({ phase: 'start', artifact: fx.mdPath, repo: fx.repo, reviewBudget: declaration });
		const answer = templateAnswer(), input = resume(frame, answer);
		const wrongTool = parse(await rawControllerCall({ ...input, phase: 'judgements' }, DEFAULT_DEPS));
		assert.equal(wrongTool.next, 'error'); assert.match(wrongTool.error.code, /stale|not-found/);
		const code = await getStepStateStore().mintReviewState('code-review', { controller: { version: 1 } }, { generation: frame.call.generation, callId: frame.call.callId });
		const wrongKind = await call({ ...input, state: code }); assert.equal(wrongKind.next, 'error');
		const stale = await call({ ...input, state: 'missing-state' }); assert.equal(stale.next, 'error');
		assert.equal((await call(input, { lifecycleFor: repo => createRepoLifecycle(repo).service })).next, 'done');
	} finally { rmSync(fx.repo, { recursive: true, force: true }); }
});

test('final controller reserve overflow precedes every persistence effect and late attempts cannot use remaining job time', async () => {
	const template = fixture('design.story'), premise = fixture('define');
	let inspections = 0, now = 1000;
	const deps: ReviewStepDeps = { nowMs: () => now, readEntitiesForRepo: async () => [], lifecycleFor: repo => {
		inspections++; return createRepoLifecycle(repo).service;
	} };
	try {
		const frame = await call({ phase: 'start', artifact: template.mdPath, repo: template.repo, reviewBudget: declaration }, deps);
		const before = readFileSync(template.jsonPath, 'utf8');
		const final = resume(frame, templateAnswer(), { reviewBudget: { ...declaration, hostContextReserveTokens: 200000 } });
		assert.equal((await call(final, deps)).error.code, 'controller-frame-over-budget'); assert.equal(inspections, 0);
		assert.equal(readFileSync(template.jsonPath, 'utf8'), before);
		assert.equal((await call(resume(frame, templateAnswer()), deps)).next, 'done');
		const extract = await call({ phase: 'start', artifact: premise.mdPath, repo: premise.repo, reviewBudget: declaration }, deps);
		const verify = await call(resume(extract, { claims: [claim('a'), claim('b')] }), deps);
		const original = readFileSync(premise.jsonPath, 'utf8');
		now += verify.timing.attemptLimitMs;
		assert.ok(now < verify.timing.deadlineAt);
		const result = await call(resume(verify, { verdicts: [verdict('a')] }), deps);
		assert.equal(result.error.code, 'review-attempt-timeout'); assert.equal(result.error.retryable, false);
		assert.equal(readFileSync(premise.jsonPath, 'utf8'), original);
		const replay = await call(resume(verify, { verdicts: [verdict('a')] }), deps);
		assert.equal(replay.error.code, 'review-state-uncertain');
		assert.equal(replay.error.evidence.artifactId, idOfWorkflow('define'));
	} finally { for (const fx of [template, premise]) rmSync(fx.repo, { recursive: true, force: true }); }
});


test('an artifact edited during awaited inspection cannot receive stale controller findings', async()=>{
 await _clearReviewStateStoreForTests();
 const f=fixture('design.story');
 const service=createRepoLifecycle(f.repo).service;
 let mutate=false, writes=0;
 const original=service.inspect.bind(service);
 const deps:ReviewStepDeps={lifecycleFor:()=>new Proxy(service,{get(target,key){
  if(key==='inspect')return async(...args:Parameters<typeof original>)=>{const seen=await original(...args);if(mutate){mutate=false;const a=JSON.parse(readFileSync(f.jsonPath,'utf8'));a.body.summary='concurrent edit';writeFileSync(f.jsonPath,JSON.stringify(a));}return seen;};
  if(key==='apply'||key==='updateContent')return ()=>{writes++;throw new Error('unexpected stale write');};
  const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;
 }})};
 try {
  const frame=await call({phase:'start',artifact:f.mdPath,repo:f.repo,reviewBudget:declaration},deps);
  mutate=true;
  const done=await call(resume(frame,templateAnswer()),deps);
  assert.equal(done.next,'error');assert.equal(done.error.code,'review-source-changed');assert.equal(writes,0);
 } finally {rmSync(f.repo,{recursive:true,force:true});}
});
