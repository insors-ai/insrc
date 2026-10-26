import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { sessionConnectionExecution, runInStepContext } from '../../../../shared/step-context.js';
import { handleAnalyzeStep } from '../../analyze-step/handler.js';
import { runAnalyzeOneShot } from '../../analyze-oneshot.js';
import { handleStart } from '../../analyze-step/phases/start.js';
import { handlePlan } from '../../analyze-step/phases/plan.js';
import { handleNarrow } from '../../analyze-step/phases/narrow.js';
import { handleBundle } from '../../analyze-step/phases/bundle.js';
import { prepareAnswerTurn } from '../../analyze-step/answer-turn.js';
import { createStepCallHandler } from '../../host.js';
const signal = new AbortController().signal, access = Object.freeze({ lookupRoot: '/fixture/root', daemonEpoch: 'epoch', sessionHandle: 'owner' });
const mint = (audience: 'mcp-unverified' | 'workbench-ui') => sessionConnectionExecution(access, { bindingId: 'server-connection', audience, controlGeneration: 1, lifetime: { signal, registerDrain() {} }, assertActive() {} });
const execution = mint('mcp-unverified'); let reads = 0, providers = 0;
const denied = new Proxy({}, { get() { reads++; throw new Error('DATA_SECRET_CANARY'); }, has() { reads++; throw new Error('DATA_SECRET_CANARY'); }, ownKeys() { reads++; throw new Error('DATA_SECRET_CANARY'); } });
const check = (value: unknown) => { assert.ok(JSON.stringify(value).includes('unsupported-temporary')); assert.equal(JSON.stringify(value).includes('DATA_SECRET_CANARY'), false); };
const ctx = { cwd: '/fixture/root', connectionExecution: execution };
await runInStepContext(ctx, async () => {
 check(await handleAnalyzeStep(denied, execution)); check(await runAnalyzeOneShot(denied, { buildRun: async () => { providers++; throw new Error('DATA_SECRET_CANARY'); } }, execution));
 for (const phase of [handleStart, handlePlan, handleNarrow, handleBundle]) await assert.rejects(phase(denied as never, execution), { code: 'unsupported-temporary' });
 assert.throws(() => prepareAnswerTurn(denied as never, execution), { code: 'unsupported-temporary' });
 const frames: unknown[] = []; let runners = 0;
 await createStepCallHandler({ insrc_analyze_step: async () => { runners++; throw new Error('DATA_SECRET_CANARY'); } })(denied, frame => { frames.push(frame); }, signal, { connectionIdentity: 'server', daemonEpoch: 'epoch', connectionExecution: execution });
 assert.equal(runners, 0); check(frames); assert.equal(reads, 0); assert.equal(providers, 0);
 // Lost explicit policy also refuses before evaluating a payload.
 assert.ok(JSON.stringify(await handleAnalyzeStep(denied)).includes('session-expired')); assert.equal(reads, 0);
});
const ui = mint('workbench-ui'); const uiResult = await runInStepContext({ cwd: '/fixture/root', connectionExecution: ui }, () => handleAnalyzeStep({ phase: 'unknown' }, ui)); assert.ok(JSON.stringify(uiResult).includes('bad-phase'));
const saved = await handleAnalyzeStep({ phase: 'unknown' }); assert.ok(JSON.stringify(saved).includes('bad-phase'));
// UI and unverified session calls never append trace; the unbound saved control does.
const trace = await readFile(process.env['INSRC_ANALYZE_STEP_TRACE']!, 'utf8'); assert.equal(trace.includes('DATA_SECRET_CANARY'), false); assert.equal(trace.trim().split('\n').length, 1);
process.stdout.write('analysis-refusal-before-read-ok\n');
