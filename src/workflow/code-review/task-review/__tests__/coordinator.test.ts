/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import test from 'node:test';
import { Value } from '@sinclair/typebox/value';
import { assignmentResultSchema } from '../result-schema.js';
import { TASK_REVIEW_POLICY } from '../policy.js';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { LLMProvider, ReviewSessionOpts, StructuredSchema } from '../../../../shared/types.js';
import { TaskReviewCoordinator } from '../coordinator.js';
import type { ReviewPacket, ReviewCheckpoint, TaskReviewResult } from '../contracts.js';
import type { ReviewSources } from '../sources.js';
import { saveCheckpoint } from '../checkpoint.js';
import { prepareReviewPacket } from '../packet.js';
import { codeTaskCommands, assignmentPrompt } from '../policy.js';
import { deriveTaskAssignments } from '../packet.js';
import { claudeReviewSessionArgs, codexReviewSessionArgs, ReviewSessionTimeoutError } from '../../../../agent/providers/cli-provider.js';

const commit = 'a'.repeat(40), parent = 'b'.repeat(40), hash = '1234567890abcdef';
async function fixture(scoped = true) {
 const project = await mkdtemp(join(tmpdir(), 'task-review-execution-'));
 const tasks = ['S', 'M', 'L'].map((size, i) => ({ id: `t${i + 1}`, title: `Task ${i + 1}`, summary: 'Required behavior', size, order: i + 1, dependsOn: i ? [`t${i}`] : [], acceptanceChecks: ['Required behavior holds'], derivedFrom: ['c1'], tests: [{ level: 'unit', name: 'Behavior' }] }));
 const meta = { epicHash: hash, storyId: 's1' };
 const files: Record<string, string> = {
  'story.json': JSON.stringify({ meta: { ...meta, workflow: 'define' }, body: { stories: [{ id: 's1' }] } }),
  'lld.json': JSON.stringify({ meta: { ...meta, workflow: 'design.story' }, body: {} }),
  'plan.json': JSON.stringify({ meta: { ...meta, workflow: 'plan' }, body: { tasks }, citations: [{ id: 'c1', kind: 'stakeholder', ref: 'Fixture' }] }),
  'source.ts': 'new behavior\n', 'test.ts': 'assert behavior\n',
 };
 const sources: ReviewSources = { commit: async oid => oid === commit ? [parent] : [], file: async (oid, path) => files[path] === undefined ? null : ({ bytes: Buffer.from(oid === parent && path === 'source.ts' ? 'old behavior\n' : files[path]!), oid: 'c'.repeat(40) }), changedRanges: async () => [{ after: [1, 1] }] };
 const packet: ReviewPacket = { storyId: 's1', ...(scoped ? { taskId: 't1' } : {}), functionalSummary: 'Changed behavior', documents: { story: { commit, path: 'story.json' }, lld: { commit, path: 'lld.json' }, plan: { commit, path: 'plan.json' } }, reviewSet: [{ commit, parent, files: [{ path: 'source.ts', segments: [{ after: [1, 1] }] }] }], tests: [{ file: 'test.ts', cases: ['behavior'], command: 'node --test test.ts', result: 'pass', executionDetails: 'Builder-reported execution', evidenceReferences: [`${commit}:test.ts`] }] };
 const read = async (path: string): Promise<ReviewCheckpoint> => JSON.parse(await readFile(path, 'utf8')) as ReviewCheckpoint;
 return { project, sources, packet, read, cleanup: () => rm(project, { recursive: true, force: true }) };
}
const assessment = (taskId: string): TaskReviewResult => ({ taskId, status: 'passed', summary: 'Required behavior and relevant assertions inspected.', findings: [], testCoverage: { assessment: 'verified', explanation: 'Relevant test asserts the changed behavior; submitted execution is builder-reported.', evidenceReferences: [`${commit}:test.ts`] }, limitations: [], advice: [], inspectedReferences: [`${commit}:source.ts`, `${commit}:test.ts`], executedTests: [] });
function provider(run: (prompt: string, schema: StructuredSchema, opts: ReviewSessionOpts) => Promise<unknown>): LLMProvider {
 return { capabilities:{reviewActivity:true}, runReviewSession: run } as unknown as LLMProvider;
}

test('task review admission: short acknowledgement, initial atomic JSON and same-id exclusion', async () => {
 const f = await fixture();
 let release: ((value: unknown) => void) | undefined, calls = 0;
 const coordinator = new TaskReviewCoordinator({ sources: f.sources, provider: () => provider(async () => { calls++; return new Promise(resolve => { release = resolve; }); }) });
 try {
  const ack = await coordinator.start(f.project, 'admission', 1, f.packet);
  assert.equal(calls, 0, 'acknowledgement does not wait for or start the provider');
  const initial = await f.read(ack.path);
  assert.equal(initial.attempts[0]!.header.status, 'pending');
  assert.deepEqual(initial.attempts[0]!.submitted, f.packet);
  await assert.rejects(coordinator.start(f.project, 'admission', 1, f.packet), /already-running/);
  while (!release) await new Promise<void>(resolve => setImmediate(resolve));
  release(assessment('t1')); await coordinator.settled(f.project, 'admission');
  const complete = await f.read(ack.path);
  assert.equal(complete.attempts[0]!.header.status, 'passed');
  assert.equal(complete.attempts[0]!['review-response'].crPublication, 'pending');
  assert.equal(calls, 1);
  await assert.rejects(coordinator.start(f.project, 'admission', 1, f.packet), /attempt-conflict/);
 } finally { await f.cleanup(); }
});

test('task execution: checkpoint before next task, one inactivity grace, failure continuation and no automatic retry', async () => {
 const f = await fixture(false);
 let clock = 0, expire: (() => void) | undefined, current = '', calls = 0;
 const allowances: number[] = [], saved: ReviewCheckpoint[] = [];
 const coordinator = new TaskReviewCoordinator({ sources: f.sources, now: () => clock,
  timer: (callback, ms) => { allowances.push(ms); expire = callback; return () => {}; },
  save: async (path, record) => { await saveCheckpoint(path, record); saved.push(await f.read(path)); },
  provider: () => provider(async (prompt, _schema, opts) => {
   calls++; assert.equal(opts.internalRetry, false); assert.equal(opts.mode,'activity'); assert.ok(!('deadlineMs' in opts));
   if (prompt.startsWith('Derive task attribution')) { clock += 25; return { tasks: ['t1', 't2', 't3'].map(taskId => ({ taskId, changeIndexes: [0], testIndexes: [0] })) }; }
   current = /"taskId":"(t\d+)"/.exec(prompt)![1]!;
   const disk = saved.at(-1)!;
   assert.equal(disk.attempts[0]!['review-response'].tasks.length, Number(current.slice(1)) - 1, 'prior result durable before next provider');
   if (current === 't1') { assert.equal(opts.mode,'activity'); throw new Error('Transport unavailable'); }
   if (current === 't2') { clock += 1800000; expire!(); return new Promise((_,reject) => opts.signal!.addEventListener('abort',()=>reject(opts.signal!.reason),{once:true})); }
   return assessment('t3');
  }) });
 try {
  const ack = await coordinator.start(f.project, 'continuation', 1, f.packet);
  await coordinator.settled(f.project, 'continuation');
  const complete = await f.read(ack.path), results = complete.attempts[0]!['review-response'].tasks;
  assert.deepEqual(allowances, [1800000, 1800000, 1800000]);
  assert.deepEqual(results.map(r => r.status), ['failed', 'incomplete', 'passed']);
  assert.equal(complete.attempts[0]!.header.status, 'failed'); assert.equal(calls, 4, 'one attribution and exactly one call per task');
  assert.equal(saved.every(record => record.attempts.length === 1), true);
 } finally { await f.cleanup(); }
});

test('checkpoint write failure stops scheduling and retains the last complete JSON', async () => {
 const f = await fixture(false); let writes = 0, calls = 0;
 const coordinator = new TaskReviewCoordinator({ sources: f.sources, save: async (path, record) => { writes++; if (record.attempts.at(-1)!['review-response'].tasks.some(task=>task.taskId==='t2')) throw new Error('Disk full'); await saveCheckpoint(path, record); }, provider: () => provider(async prompt => {
  calls++; if (prompt.startsWith('Derive task attribution')) return { tasks: ['t1', 't2', 't3'].map(taskId => ({ taskId, changeIndexes: [0], testIndexes: [0] })) };
  return assessment(calls === 2 ? 't1' : 't2');
 }) });
 try {
  const ack = await coordinator.start(f.project, 'disk-failure', 1, f.packet); await coordinator.settled(f.project, 'disk-failure');
  const retained = await f.read(ack.path);
  assert.deepEqual(retained.attempts[0]!['review-response'].tasks.map(task => task.taskId), ['t1']); assert.equal(calls, 3, 'no third task after failed second result write');
 } finally { await f.cleanup(); }
});

test('code-task provider tools: committed reads, permitted target tests and unchanged design-review defaults', async () => {
 const f = await fixture();
 try {
  const prepared = await prepareReviewPacket(f.packet, f.sources), commands = codeTaskCommands(prepared);
  assert.ok(commands.includes(`git show ${commit}:source.ts`)); assert.ok(commands.includes(`git show ${parent}:source.ts`)); assert.ok(commands.includes('node --test test.ts'));
  const design = claudeReviewSessionArgs({}, []), code = claudeReviewSessionArgs({}, [], commands);
  assert.equal(design[design.indexOf('--tools') + 1], 'Read,Grep,Glob');
  assert.equal(code[code.indexOf('--tools') + 1], 'Read,Grep,Glob,Bash');
  const allowed = code[code.indexOf('--allowedTools') + 1]!;
  assert.ok(allowed.includes(`Bash(git show ${commit}:source.ts)`)); assert.ok(allowed.includes('Bash(node --test test.ts)'));
  assert.ok(!allowed.includes('Bash(*)')); assert.ok(!code.includes('--permission-mode'));
  assert.ok(codexReviewSessionArgs('schema', f.project, []).includes('read-only'), 'Codex retains its sandbox; unsupported writes stay unsupported');
  prepared.packet.tests[0]!.command = 'node --test test.ts; touch source.ts';
  assert.ok(!codeTaskCommands(prepared).some(c => c.includes(';')));
  const assignment = deriveTaskAssignments(prepared, [{ taskId: 't1', changeIndexes: [0], testIndexes: [0] }])[0]!;
  const prompt = assignmentPrompt(prepared, assignment, [`${commit}:source.ts`]);
  assert.ok(prompt.includes('"lines":[1,1]'), 'selected ranges preserved'); assert.ok(!prompt.includes('"bytes"'), 'no raw source prepack');
  assert.ok(prompt.includes('unsupported')); assert.ok(prompt.includes('Builder-reported'));
 } finally { await f.cleanup(); }
});


test('native provider timeout is incomplete even when it returns just before the host timer', async () => {
 const f = await fixture();
 const coordinator = new TaskReviewCoordinator({ sources: f.sources, provider: () => provider(async () => { throw new ReviewSessionTimeoutError(300000); }) });
 try {
  const ack = await coordinator.start(f.project, 'native-timeout', 1, f.packet); await coordinator.settled(f.project, 'native-timeout');
  assert.equal((await f.read(ack.path)).attempts[0]!['review-response'].tasks[0]!.status, 'incomplete');
 } finally { await f.cleanup(); }
});

test('malformed provider result is saved as failed without retrying the task', async () => {
 const f = await fixture(); let calls = 0;
 const coordinator = new TaskReviewCoordinator({ sources: f.sources, provider: () => provider(async () => { calls++; return { findings: [] }; }) });
 try {
  const ack = await coordinator.start(f.project, 'invalid-answer', 1, f.packet); await coordinator.settled(f.project, 'invalid-answer');
  const result = (await f.read(ack.path)).attempts[0]!['review-response'].tasks[0]!;
  assert.equal(result.status, 'failed'); assert.ok(result.error); assert.equal(calls, 1);
 } finally { await f.cleanup(); }
});


test('native task output refuses placeholder references and foreign locations before host completion', async () => {
 const f = await fixture();
 try {
  const prepared = await prepareReviewPacket(f.packet, f.sources);
  const assignment = deriveTaskAssignments(prepared, [{ taskId: 't1', changeIndexes: [0], testIndexes: [0] }])[0]!;
  const schema = assignmentResultSchema(assignment), valid = assessment('t1');
  assert.equal(Value.Check(schema, valid), true);
  assert.equal(Value.Check(schema, { ...valid, taskId: 'other' }), false);
  assert.equal(Value.Check(schema, { ...valid, inspectedReferences: ['d'] }), false);
  const finding = { severity: 'HIGH', location: 'source.ts:1', message: 'Behavior fails', rationale: 'Changed condition contradicts the requirement', evidenceReferences: [`${commit}:source.ts`] };
  assert.equal(Value.Check(schema, { ...valid, status: 'changes_requested', findings: [finding] }), true);
  assert.equal(Value.Check(schema, { ...valid, findings: [{ ...finding, location: 'source.ts:1 (commit abc)' }] }), false);
  assert.equal(Value.Check(schema, { ...valid, findings: [{ ...finding, location: 'foreign.ts:1' }] }), false);
  assert.equal(Value.Check(schema, { ...valid, findings: [{ ...finding, evidenceReferences: ['d'] }] }), false);
  const missing = { ...valid } as Partial<TaskReviewResult>; delete missing.findings;
  assert.equal(Value.Check(schema, missing), false);
  assert.match(TASK_REVIEW_POLICY, /never encoded in summary/);
  assert.match(TASK_REVIEW_POLICY, /status MUST be incomplete/);
 } finally { await f.cleanup(); }
});

test('optimistic native status with limitations retains the assessment as incomplete instead of failed', async () => {
 const f = await fixture();
 const coordinator = new TaskReviewCoordinator({ sources: f.sources, provider: () => provider(async () => ({ ...assessment('t1'), limitations: ['Required evidence has a limitation'], advice: ['Optional cleanup observation'] })) });
 try {
  const ack = await coordinator.start(f.project, 'normalize-feedback', 1, f.packet); await coordinator.settled(f.project, 'normalize-feedback');
  const result = (await f.read(ack.path)).attempts[0]!['review-response'].tasks[0]!;
  assert.equal(result.status, 'incomplete'); assert.equal(result.testCoverage.assessment, 'verified');
  assert.ok(result.inspectedReferences.length > 0); assert.deepEqual(result.advice, ['Optional cleanup observation']);
  assert.equal(result.error, undefined);
 } finally { await f.cleanup(); }
});


test('shared attribution timeout remains incomplete for every remaining task without retry', async () => {
 const f = await fixture(false); let clock = 0, calls = 0, expire: (() => void) | undefined;
 const coordinator = new TaskReviewCoordinator({ sources: f.sources, now: () => clock,
  timer: callback => { expire = callback; return () => {}; },
  provider: () => provider(async (_prompt,_schema,opts) => { calls++; clock += 1800000; expire!(); return new Promise((_,reject)=>opts.signal!.addEventListener('abort',()=>reject(opts.signal!.reason),{once:true})); }) });
 try {
  const ack = await coordinator.start(f.project, 'attribution-timeout', 1, f.packet); await coordinator.settled(f.project, 'attribution-timeout');
  const complete = await f.read(ack.path);
  assert.deepEqual(complete.attempts[0]!['review-response'].tasks.map(task => task.status), ['incomplete', 'incomplete', 'incomplete']);
  assert.equal(complete.attempts[0]!.header.status, 'incomplete'); assert.equal(calls, 1);
  assert.match(complete.attempts[0]!['review-response'].tasks[1]!.summary, /shared attribution.*inactivity/);
 } finally { await f.cleanup(); }
});

test('shared attribution provider failure remains failed for every remaining task without retry', async () => {
 const f = await fixture(false); let calls = 0;
 const coordinator = new TaskReviewCoordinator({ sources: f.sources, provider: () => provider(async () => { calls++; throw new Error('Attribution provider failed'); }) });
 try {
  const ack = await coordinator.start(f.project, 'attribution-failure', 1, f.packet); await coordinator.settled(f.project, 'attribution-failure');
  const complete = await f.read(ack.path);
  assert.deepEqual(complete.attempts[0]!['review-response'].tasks.map(task => task.status), ['failed', 'failed', 'failed']);
  assert.equal(complete.attempts[0]!.header.status, 'failed'); assert.equal(calls, 1);
 } finally { await f.cleanup(); }
});

test('shared attribution corrects omitted unchanged regression evidence before any assessment', async () => {
 const f=await fixture(false);let scopes=0, assessments=0;
 const coordinator=new TaskReviewCoordinator({sources:f.sources,provider:()=>provider(async(prompt)=>{
  if(prompt.startsWith('Derive task attribution')){
   scopes++;
   assert.match(prompt,/including unchanged regression tests/);
   if(scopes===1)return{tasks:['t1','t2','t3'].map(taskId=>({taskId,changeIndexes:[0],testIndexes:[]}))};
   assert.match(prompt,/missing tests:.*index.*0.*test\.ts/);
   assert.equal(assessments,0);
   return{tasks:['t1','t2','t3'].map(taskId=>({taskId,changeIndexes:[0],testIndexes:[0]}))};
  }
  assessments++;return assessment(`t${assessments}`);
 })});
 try{
  const ack=await coordinator.start(f.project,'attribution-repair',1,f.packet);await coordinator.settled(f.project,'attribution-repair');
  const a=(await f.read(ack.path)).attempts[0]!;
  assert.equal(a.header.status,'passed');assert.equal(scopes,2);assert.equal(assessments,3);
  assert.equal(a.header.attributionRepair?.rejections,1);
 }finally{await f.cleanup();}
});

test('shared attribution exhausts three submissions without running assessments or resetting on resume', async () => {
 const f=await fixture(false);let calls=0;
 const coordinator=new TaskReviewCoordinator({sources:f.sources,provider:()=>provider(async()=>{
  calls++;return{tasks:['t1','t2','t3'].map(taskId=>({taskId,changeIndexes:[0],testIndexes:[]}))};
 })});
 try{
  const ack=await coordinator.start(f.project,'attribution-exhaustion',1,f.packet);await coordinator.settled(f.project,'attribution-exhaustion');
  const a=(await f.read(ack.path)).attempts[0]!;
  assert.equal(calls,3);assert.equal(a.header.attributionRepair?.rejections,3);
  assert.deepEqual(a['review-response'].tasks.map(t=>t.status),['failed','failed','failed']);
  await coordinator.start(f.project,'attribution-exhaustion',1,undefined,{operation:'resume'});await coordinator.settled(f.project,'attribution-exhaustion');
  assert.equal(calls,3);
 }finally{await f.cleanup();}
});

test('controller attribution returns pointed correction frames then accepts complete mapping with replay protection', async () => {
 const f=await fixture(false);const signal=new AbortController();const owner={id:'review-controller',signal:signal.signal};
 const coordinator=new TaskReviewCoordinator({sources:f.sources,provider:()=>{throw new Error('No native provider on controller route');}});
 const bad={tasks:['t1','t2','t3'].map(taskId=>({taskId,changeIndexes:[0],testIndexes:[]}))};
 try{
  const initial=await coordinator.startController(f.project,'controller-attribution-repair',1,f.packet,owner);
  assert.equal(initial.kind,'scope');
  const envelope={taskId:initial.taskId,executionId:initial.executionId,sequence:initial.nextSequence};
  const corrected=await coordinator.controllerScope(f.project,'controller-attribution-repair',1,bad,owner,envelope);
  assert.equal(corrected.kind,'scope');assert.match(corrected.prompt!,/missing tests:.*test\.ts/);
  const replay=await coordinator.controllerScope(f.project,'controller-attribution-repair',1,bad,owner,envelope);
  assert.equal(replay.kind,corrected.kind);assert.equal(replay.nextSequence,corrected.nextSequence);assert.equal(replay.prompt,corrected.prompt);
  assert.equal((await f.read(initial.path)).attempts[0]!.header.attributionRepair?.rejections,1);
  const next=await coordinator.controllerScope(f.project,'controller-attribution-repair',1,{tasks:['t1','t2','t3'].map(taskId=>({taskId,changeIndexes:[0],testIndexes:[0]}))},owner,{taskId:corrected.taskId,executionId:corrected.executionId,sequence:corrected.nextSequence});
  assert.equal(next.kind,'task');assert.equal(next.taskId,'t1');
 }finally{signal.abort();await coordinator.settled(f.project,'controller-attribution-repair');await f.cleanup();}
});

test('native attribution handles the real host-candidate rejection wrapper and preserves diagnostics', async () => {
 const {ReviewOutputFailureError}=await import('../../../../shared/review-diagnostics.js');
 const f=await fixture(false);let scopes=0;
 const coordinator=new TaskReviewCoordinator({sources:f.sources,provider:()=>provider(async(prompt,_schema,opts)=>{
  if(prompt.startsWith('Derive task attribution')){
   scopes++;const value={tasks:['t1','t2','t3'].map(taskId=>({taskId,changeIndexes:[0],testIndexes:scopes===1?[]:[0]}))};
   try{if(opts.mode==='activity')await opts.onCandidate(value);}catch(error){
    throw new ReviewOutputFailureError('Rejected mapping',{provider:'codex',issues:[{code:'HOST_VALIDATION_ERROR',field:'attribution',correction:'Cover every submitted test.',occurrences:1}]},error);
   }
   return value;
  }
  const id=/"taskId":"(t\d+)"/.exec(prompt)![1]!;return assessment(id);
 })});
 try{
  const ack=await coordinator.start(f.project,'wrapped-attribution-repair',1,f.packet);await coordinator.settled(f.project,'wrapped-attribution-repair');
  const a=(await f.read(ack.path)).attempts[0]!;
  assert.equal(a.header.status,'passed');assert.equal(scopes,2);
  assert.equal(a['review-response'].failureDiagnostics?.[0]?.resolved,true);
 }finally{await f.cleanup();}
});

test('controller attribution budget survives disconnect and explicit resume, then exhausts', async () => {
 const f=await fixture(false);const first=new AbortController(),second=new AbortController();
 const owner1={id:'first',signal:first.signal},owner2={id:'second',signal:second.signal};
 const coordinator=new TaskReviewCoordinator({sources:f.sources,provider:()=>{throw new Error('No native calls');}});
 const bad={tasks:['t1','t2','t3'].map(taskId=>({taskId,changeIndexes:[0],testIndexes:[]}))};
 const submit=(frame:import('../controller.js').ControllerFrame,owner:typeof owner1)=>coordinator.controllerScope(f.project,'controller-budget',1,bad,owner,{taskId:frame.taskId,executionId:frame.executionId,sequence:frame.nextSequence});
 try{
  let frame=await coordinator.startController(f.project,'controller-budget',1,f.packet,owner1);
  frame=await submit(frame,owner1);assert.equal(frame.kind,'scope');
  first.abort();await coordinator.settled(f.project,'controller-budget');
  frame=await coordinator.startController(f.project,'controller-budget',1,undefined,owner2,undefined,'resume');
  frame=await submit(frame,owner2);assert.equal(frame.kind,'scope');
  frame=await submit(frame,owner2);assert.equal(frame.kind,'done');assert.equal(frame.status,'failed');
  const a=(await f.read(frame.path)).attempts[0]!;assert.equal(a.header.attributionRepair?.rejections,3);
  assert.equal(a['review-response'].tasks.length,3);
 }finally{first.abort();second.abort();await coordinator.settled(f.project,'controller-budget');await f.cleanup();}
});

test('attribution omission diagnostics enumerate missing change and test indexes separately', async () => {
 const f=await fixture(false);
 try{
  const prepared=await prepareReviewPacket(f.packet,f.sources);
  assert.throws(()=>deriveTaskAssignments(prepared,['t1','t2','t3'].map(taskId=>({taskId,changeIndexes:[],testIndexes:[]}))),error=>{
   assert.match(String(error),/Missing changes: \[\{"index":0,"path":"source.ts"\}\]/);
   assert.match(String(error),/missing tests: \[\{"index":0,"path":"test.ts"\}\]/);return true;
  });
 }finally{await f.cleanup();}
});

test('attribution repair persistence failure stops dispatch without fabricating task failures', async () => {
 const f=await fixture(false);let calls=0;
 const coordinator=new TaskReviewCoordinator({sources:f.sources,save:async(path,checkpoint)=>{
  if(checkpoint.attempts[0]?.header.attributionRepair)throw new Error('fixture storage unavailable');
  await saveCheckpoint(path,checkpoint);
 },provider:()=>provider(async()=>{calls++;return{tasks:['t1','t2','t3'].map(taskId=>({taskId,changeIndexes:[0],testIndexes:[]}))};})});
 try{
  const ack=await coordinator.start(f.project,'repair-storage-failure',1,f.packet);await coordinator.settled(f.project,'repair-storage-failure');
  const a=(await f.read(ack.path)).attempts[0]!;assert.equal(calls,1);
  assert.equal(a.header.attributionRepair,undefined);assert.equal(a['review-response'].tasks.length,0);
  assert.notEqual(a.header.status,'passed');
 }finally{await f.cleanup();}
});
