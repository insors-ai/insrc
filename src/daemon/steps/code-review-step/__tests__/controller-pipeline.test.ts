import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';
import { MessageChannel, Worker } from 'node:worker_threads';
import { serveHub } from '../../../threads/channel.js';
import { stepStateHubHandlers } from '../../../threads/step-state.js';
import type { ChangedSymbolSummary } from '../../../../workflow/code-review/types.js';
import { DEFAULT_DEPS, handleCodeReviewStep } from '../handler.js';
import type { CodeReviewStepDeps } from '../handler.js';
import { loadState, _clearCodeReviewStateStoreForTests } from '../state-store.js';
import type { CodeReviewStepEmitCall, CodeReviewStepOutput, ControllerCallResult } from '../types.js';
import { LEDGER_EXCLUDE_GLOBS } from '../../../../workflow/runners/build/changed-files.js';
import { getStepStateStore } from '../../../threads/step-state.js';

const epicHash = 'e1a2b3c4d5e6f708', storyId = 'S001';
function fixture(size = 200) {
 const repo = mkdtempSync(join(tmpdir(), 'insrc-controller-'));
 const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
 git('init', '-q'); git('config', 'user.name', 'Controller Test'); git('config', 'user.email', 'test@example.invalid');
 writeFileSync(join(repo, 'data.json'), 'base\n'); git('add', 'data.json'); git('commit', '-qm', 'base'); const base = git('rev-parse', 'HEAD');
 writeFileSync(join(repo, 'data.json'), `FACT_ALPHA ${'x'.repeat(size)} FACT_BETA\n`); git('add', 'data.json'); git('commit', '-qm', 'story', '-m', `Insrc-Story: ${epicHash}/${storyId}`);
 mkdirSync(join(repo, '.insrc/build-start'), { recursive: true }); mkdirSync(join(repo, '.insrc/artifacts'), { recursive: true });
 writeFileSync(join(repo, `.insrc/build-start/${epicHash}-${storyId}.json`), JSON.stringify({ epicHash, storyId, rangeBase: base, stampedAt: '2026-10-27T00:00:00Z' }));
 const path = (kind: string) => join(repo, `.insrc/artifacts/${kind}-${epicHash}-${storyId}.json`);
 const build = { meta: { workflow: 'build', epicHash, storyId, createdAt: '2026-10-27T00:00:00Z', standalone: true, authoredBy: 'daemon' }, body: { tasks: [{ id: 't1', passed: true }] } };
 const tests = { meta: { workflow: 'tests', epicHash, storyId, createdAt: '2026-10-27T00:00:00Z', updatedAt: '2026-10-27T00:00:00Z' }, body: { tasks: [] } };
 writeFileSync(path('BUILD'), JSON.stringify(build)); writeFileSync(path('TESTS'), JSON.stringify(tests));
 let now = Date.now(), writes = 0, diffReads = 0; const diffArgs: unknown[][] = [];
 const deps: CodeReviewStepDeps = { ...DEFAULT_DEPS, now: () => now, controllerExecution: { adapterId: 'cli-claude', maxInputChars: 384_000 },
  fetchFreshness: async () => ({ ok: true, isProcessing: true, inFlight: true, pendingCodeIndexJobs: 1, staleFiles: ['data.json'] }),
  assembleDiffGrounding: async (...args) => { diffReads++; diffArgs.push(args); return DEFAULT_DEPS.assembleDiffGrounding(...args); },
  write: (p, content) => { writes++; DEFAULT_DEPS.write(p, content); },
 };
 const call = async (input: unknown) => JSON.parse((await handleCodeReviewStep(input, deps)).content[0]!.text) as CodeReviewStepOutput;
 const start = async () => {
  const waiting = await call({ phase: 'start', repo, epicHash, storyId }); assert.ok(waiting.next === 'confirm_wait', JSON.stringify(waiting));
  return call({ phase: 'start', state: waiting.state, proceed: false });
 };
 return { repo, git, path, tests, build, base, diffArgs, deps, call, start, setNow: (t: number) => { now = t; }, counts: () => ({ writes, diffReads }), cleanup: async () => { await _clearCodeReviewStateStoreForTests(); rmSync(repo, { recursive: true, force: true }); } };
}
function rows(frame: CodeReviewStepEmitCall): ChangedSymbolSummary[] {
 return frame.call.messages.flatMap(m => {
  if (typeof m.content !== 'string') return [];
  return [...m.content.matchAll(/```json\n([\s\S]*?)\n```/g)].flatMap(match => {
   try { const value = JSON.parse(match[1]!); return Array.isArray(value) ? value.filter(v => typeof v === 'object' && v !== null && typeof v.entityId === 'string' && typeof v.signature === 'string') as ChangedSymbolSummary[] : []; } catch { return []; }
  });
 });
}
function answer(frame: CodeReviewStepEmitCall): ControllerCallResult {
 const schema = frame.call.schema as { properties: { answer: { required?: string[] } } };
 const required = schema.properties.answer.required ?? [];
 const held = rows(frame);
 const out: Record<string, unknown> = {};
 for (const key of required) {
  if (key === 'text') out[key] = ['FACT_ALPHA', 'FACT_BETA'].filter(f => JSON.stringify(frame.call.messages).includes(f)).join(' ') || 'local behavior evidence';
  else if (key === 'descriptions') out[key] = held.map(row => ({ atomId: row.entityId, description: 'local behavior' }));
  else if (key === 'notes') out[key] = frame.call.dimension === 'quality' ? held.filter(row => row.diffFragment !== undefined).map(row => ({ key: `diff-file-quality:${row.diffFragment!.parentId}`, atomIds: [row.entityId], note: ['FACT_ALPHA', 'FACT_BETA'].filter(f => row.signature.includes(f)).join(' ') || 'local behavior at source coordinates' })) : [];
  else out[key] = [];
 }
 return { callId: frame.call.callId, answer: { callId: frame.call.callId, answer: out } };
}
async function finish(f: ReturnType<typeof fixture>, first: CodeReviewStepOutput): Promise<CodeReviewStepOutput> {
 let frame = first;
 while (frame.next === 'emit_review_call') frame = await f.call({ phase: 'judgements', state: frame.state, callResult: answer(frame) });
 return frame;
}

test('DIFF-CONTROLLER-LARGE: oversized daemon-authored diff emits one complete bounded task per turn, covers every original span and folds only controller results', async () => {
 const f = fixture(600_000);
 try {
  let frame = await f.start(), calls = 0, parents = 0;
  assert.deepEqual(f.diffArgs[0], [f.repo, undefined, { base: f.base, excludeGlobs: LEDGER_EXCLUDE_GLOBS, storyKey: `${epicHash}/${storyId}` }]); const seen = new Map<string, ChangedSymbolSummary>(); let source = '';
  while (frame.next === 'emit_review_call') {
   assert.ok(JSON.stringify(frame).length <= 384_000); assert.equal('grounding' in frame, false); assert.equal('prompts' in frame, false);
   assert.equal('dimensions' in frame.timing, false, 'full primary audit/history is not appended to tasks');
   if (frame.call.dimension === 'quality' && frame.call.role === 'chunk') for (const row of rows(frame)) seen.set(row.entityId, row);
   if (frame.call.dimension === 'quality' && frame.call.role === 'obligation') { parents++; const evidence = JSON.stringify(frame.call.messages); assert.ok(evidence.includes('FACT_ALPHA') && evidence.includes('FACT_BETA'), 'parent/global gather receives both remote fragment facts'); }
   const state = await loadState(frame.state); assert.equal(state.kind, 'controller-pipeline');
   if (state.kind === 'controller-pipeline') source = (state.snapshot.grounding as { grounding: { symbols: ChangedSymbolSummary[] } }).grounding.symbols.map(r => r.signature).join('');
   const firstId = frame.call.callId;
   const resumed = await f.call({ phase: 'start', state: frame.state }); assert.deepEqual(resumed, frame, 'status does not change the call or clock');
   frame = await f.call({ phase: 'judgements', state: frame.state, callResult: answer(frame) });
   if (frame.next === 'emit_review_call') assert.notEqual(frame.call.callId, firstId);
   calls++; assert.ok(calls < 1000, 'scripted fixture should terminate');
  }
  assert.ok(frame.next === 'done', JSON.stringify(frame)); assert.ok(calls > 10 && parents >= 2);
  const parts = [...seen.values()].sort((a, b) => a.diffFragment!.startOffset - b.diffFragment!.startOffset);
  assert.ok(parts.length > 1); assert.equal(parts.map(r => r.signature).join(''), source, 'all captured diff text reaches quality exactly once');
  const cr = JSON.parse(readFileSync(f.path('CR'), 'utf8')); assert.equal(cr.meta.reviewedBy, 'controller'); assert.equal(cr.meta.model, 'client'); assert.equal(cr.body.groundingMode, 'degraded'); assert.equal(cr.body.verdict, 'warn'); assert.ok(cr.meta.reviewInputFingerprint); assert.equal(f.counts().writes, 2);
 } finally { await f.cleanup(); }
});

test('DIFF-CONTROLLER-VALIDATE: aggregate, mixed, foreign and conflicting replay results cannot advance; accepted replay is atomic and cached', async () => {
 const f = fixture();
 try {
  const frame = await f.start(); assert.ok(frame.next === 'emit_review_call');
  for (const input of [{ judgements: { judgements: [] } }, { judgements: { judgements: [] }, callResult: answer(frame) }, { callResult: { ...answer(frame), callId: 'foreign' } }, { callResult: { callId: frame.call.callId, answer: {}, failure: { cause: 'stall', detail: 'mixed' } } }]) {
   const bad = await f.call({ phase: 'judgements', state: frame.state, ...input }); assert.ok(bad.next === 'error');
   assert.deepEqual(await f.call({ phase: 'start', state: frame.state }), frame);
  }
  const input = { phase: 'judgements', state: frame.state, callResult: answer(frame) };
  const first = f.call(input), duplicate = f.call(input); const accepted = await first; assert.deepEqual(await duplicate, accepted);
  const conflict = await f.call({ ...input, callResult: { callId: frame.call.callId, failure: { cause: 'stall', detail: 'different' } } }); assert.ok(conflict.next === 'error' && conflict.error.code === 'conflicting-call-replay');
  const done = await finish(f, accepted); assert.ok(done.next === 'done', JSON.stringify(done)); assert.equal(f.counts().writes, 2);
  assert.deepEqual(await f.call(input), accepted); assert.equal(f.counts().writes, 2, 'replay never republishes');
 } finally { await f.cleanup(); }
});

test('DIFF-CONTROLLER-TIME: status and delayed answers cannot renew per-call/root deadlines; cancellation revokes calls', async () => {
 for (const cancel of [false, true]) {
  const f = fixture();
  try {
   const frame = await f.start(); assert.ok(frame.next === 'emit_review_call');
   if (cancel) { const stopped = await f.call({ phase: 'start', state: frame.state, proceed: false }); assert.ok(stopped.next === 'error' && stopped.error.code === 'review-cancelled'); }
   else { f.setNow(frame.call.expiresAt); const late = await f.call({ phase: 'judgements', state: frame.state, callResult: answer(frame) }); assert.ok(late.next === 'error' && late.error.code === 'review-deadline', JSON.stringify(late)); }
   assert.equal(existsSync(f.path('CR')), false); assert.equal(f.counts().writes, 0);
  } finally { await f.cleanup(); }
 }
});

test('DIFF-IDENTITY-TESTS: TESTS-only/source/author changes at controller continuation invalidate the exact admitted snapshot', async () => {
 for (const mutation of ['tests', 'source', 'author'] as const) {
  const f = fixture();
  try {
   const frame = await f.start(); assert.ok(frame.next === 'emit_review_call');
   if (mutation === 'tests') writeFileSync(f.path('TESTS'), JSON.stringify({ ...f.tests, meta: { ...f.tests.meta, updatedAt: 'changed verdict evidence' } }));
   else if (mutation === 'source') writeFileSync(join(f.repo, 'data.json'), 'changed during controller turn');
   else writeFileSync(f.path('BUILD'), JSON.stringify({ ...f.build, meta: { ...f.build.meta, authoredBy: 'controller' } }));
   const changed = await f.call({ phase: 'judgements', state: frame.state, callResult: answer(frame) }); assert.ok(changed.next === 'error' && changed.error.code.startsWith('review-input-'), JSON.stringify(changed)); assert.equal(f.counts().writes, 0);
  } finally { await f.cleanup(); }
 }
});

test('DIFF-CONTROLLER-VALIDATE: unverified flags fail before diff evidence and legacy degraded states require restart', async () => {
 const f = fixture();
 try {
  const deps = { ...f.deps, controllerExecution: undefined };
  const waiting = JSON.parse((await handleCodeReviewStep({ phase: 'start', repo: f.repo, epicHash, storyId, controllerInput: { mode: 'isolated-structured', adapterId: 'cli-claude', maxInputChars: 384_000 } }, deps)).content[0]!.text) as CodeReviewStepOutput;
  assert.ok(waiting.next === 'confirm_wait');
  const unsupported = JSON.parse((await handleCodeReviewStep({ phase: 'start', state: waiting.state, proceed: false }, deps)).content[0]!.text) as CodeReviewStepOutput;
  assert.ok(unsupported.next === 'error' && unsupported.error.code === 'unsupported-bounded-controller'); assert.equal(f.counts().diffReads, 0);
  const resolved = await f.deps.resolveSubject(f.repo, epicHash, storyId); assert.ok(resolved.ok);
  const token = await getStepStateStore().mint('code-review', { repo: f.repo, epicHash, storyId, subject: resolved.subject, runId: 'old', startedAtMs: Date.now(), grounding: { symbols: [] }, groundingMode: 'degraded' });
  const legacy = await f.call({ phase: 'judgements', state: token, judgements: { judgements: [] } }); assert.ok(legacy.next === 'error' && legacy.error.code === 'restart-required');
 } finally { await f.cleanup(); }
});


test('DIFF-CONTROLLER-TIME: serial child clocks and final fold preserve a total budget beyond ten minutes', async () => {
 const f = fixture();
 try {
  let frame = await f.start(), turn = 0, rootDeadline = 0;
  while (frame.next === 'emit_review_call') {
   rootDeadline ||= frame.timing.deadlineAt;
   assert.equal(frame.timing.deadlineAt, rootDeadline);
   f.setNow(frame.timing.startedAt + (++turn * 480_000));
   frame = await f.call({ phase: 'judgements', state: frame.state, callResult: answer(frame) });
  }
  assert.ok(turn >= 3); assert.ok(frame.next === 'done', JSON.stringify(frame)); assert.equal(f.counts().writes, 2);
 } finally { await f.cleanup(); }
});

test('DIFF-CONTROLLER-VALIDATE: invalid envelopes use the real correction limit and cannot be retried indefinitely', async () => {
 const f = fixture();
 try {
  const first = await f.start(); assert.ok(first.next === 'emit_review_call');
  const retry = await f.call({ phase: 'judgements', state: first.state, callResult: { callId: first.call.callId, answer: { invented: true } } }); assert.ok(retry.next === 'emit_review_call'); assert.notEqual(retry.call.callId, first.call.callId);
  const failure = await f.call({ phase: 'judgements', state: retry.state, callResult: { callId: retry.call.callId, answer: { invented: true } } }); assert.ok(failure.next === 'error' && failure.error.code === 'controller-review-failed', JSON.stringify(failure));
  assert.deepEqual(await f.call({ phase: 'start', state: first.state }), failure); assert.equal(f.counts().writes, 0);
 } finally { await f.cleanup(); }
});

test('DIFF-CONTROLLER-VALIDATE: singleton size refusal rebuilds descendant material while original primary count and deadline stay fixed', async () => {
 const f = fixture(80_000);
 try {
  const first = await f.start(); assert.ok(first.next === 'emit_review_call');
  const before = await loadState(first.state); assert.ok(before.kind === 'controller-pipeline');
  const refused = await f.call({ phase: 'judgements', state: first.state, callResult: { callId: first.call.callId, failure: { cause: 'size-refusal', detail: 'verified helper reports smaller input allowance', maxChars: 50_000 } } });
  assert.ok(refused.next === 'emit_review_call', JSON.stringify(refused)); assert.notEqual(refused.call.callId, first.call.callId);
  const after = await loadState(first.state); assert.ok(after.kind === 'controller-pipeline'); assert.deepEqual(after.timing, before.timing);
  const revisions = after.dimensions[after.cursor]!.job.materialRevisions; assert.equal(revisions?.length, 1);
  assert.ok(revisions![0]!.limitChars < before.dimensions[before.cursor]!.job.plan.limitChars);
  assert.equal(revisions![0]!.timing.rootDeadlineAt, first.timing.deadlineAt);
  assert.ok(revisions![0]!.descendantRanges.length > 1);
  assert.equal(f.counts().writes, 0);
 } finally { await f.cleanup(); }
});


test('DIFF-CONTROLLER-LARGE: admitted freshness-timeout and hollow-graph routes persist exact fallback evidence; unreadable diff fails before any task', async () => {
 for (const variant of ['queued', 'in-flight', 'hollow', 'unreadable'] as const) {
  const f = fixture();
  try {
   let clock = Date.now();
   const deps: CodeReviewStepDeps = { ...f.deps, now: () => clock, sleep: async () => { clock += 1000; }, freshnessTimeoutMs: () => 2500,
    fetchFreshness: async () => ({ ok: true, isProcessing: variant !== 'hollow', inFlight: variant === 'in-flight', pendingCodeIndexJobs: variant === 'queued' ? 2 : 0, staleFiles: variant === 'hollow' ? [] : ['data.json'] }),
    fetchGrounding: async () => ({ ok: true, grounding: { symbols: [] } }),
   };
   if (variant === 'unreadable') {
    const { DiffUnavailableError } = await import('../../../../workflow/code-review/grounding.js');
    Object.assign(deps, { assembleDiffGrounding: async () => { throw new DiffUnavailableError('unreadable scoped diff'); } });
   }
   const call = async (input: unknown) => JSON.parse((await handleCodeReviewStep(input, deps)).content[0]!.text) as CodeReviewStepOutput;
   let out = await call({ phase: 'start', repo: f.repo, epicHash, storyId });
   if (out.next === 'confirm_wait') out = await call({ phase: 'start', state: out.state, proceed: true });
   if (variant === 'unreadable') { assert.ok(out.next === 'error' && out.error.code === 'diff-unavailable'); assert.equal(f.counts().writes, 0); continue; }
   const expected = variant === 'hollow' ? { kind: 'hollow-grounding' } : { kind: 'freshness-timeout', waitedMs: 3000, inFlight: variant === 'in-flight', pendingCodeIndexJobs: variant === 'queued' ? 2 : 0, staleFiles: ['data.json'] };
   while (out.next === 'emit_review_call') out = await call({ phase: 'judgements', state: out.state, callResult: answer(out) });
   assert.ok(out.next === 'done', JSON.stringify(out)); assert.deepEqual(out.fallbackReason, expected);
   const cr = JSON.parse(readFileSync(f.path('CR'), 'utf8')); assert.deepEqual(cr.body.fallbackReason, expected); assert.equal(cr.body.verdict, 'warn');
  } finally { await f.cleanup(); }
 }
});


test('DIFF-CONTROLLER-VALIDATE: two real workers submitting the same final answer publish once and both receive the cached continuation', async () => {
 const f = fixture();
 const workers: Worker[] = [];
 try {
  let frame = await f.start();
  while (frame.next === 'emit_review_call' && frame.call.dimension !== 'quality') frame = await f.call({ phase: 'judgements', state: frame.state, callResult: answer(frame) });
  assert.ok(frame.next === 'emit_review_call' && frame.call.role === 'single');
  const events: { event: string; result?: { content: { text: string }[] }; message?: string }[] = [];
  const waits: (() => void)[] = [];
  const waitFor = async (predicate: () => boolean): Promise<void> => {
   while (!predicate()) await new Promise<void>(resolve => {
    const timer = setTimeout(() => { const i = waits.indexOf(wake); if (i >= 0) waits.splice(i, 1); resolve(); }, 50);
    const wake = () => { clearTimeout(timer); resolve(); }; waits.push(wake);
   });
  };
  for (let i = 0; i < 2; i++) {
   const { port1, port2 } = new MessageChannel(); serveHub(port1, stepStateHubHandlers(getStepStateStore()));
   const worker = new Worker(new URL('./helpers/controller-final-worker.ts', import.meta.url), { workerData: { port: port2 }, transferList: [port2] });
   worker.on('message', event => { events.push(event); for (const wake of waits.splice(0)) wake(); });
   worker.on('error', err => { events.push({ event: 'error', message: String(err) }); for (const wake of waits.splice(0)) wake(); });
   workers.push(worker);
  }
  await waitFor(() => events.filter(e => e.event === 'ready').length === 2 || events.some(e => e.event === 'error'));
  assert.equal(events.some(e => e.event === 'error'), false, JSON.stringify(events));
  for (const worker of workers) worker.postMessage({ operation: 'answer', input: { phase: 'judgements', state: frame.state, callResult: answer(frame) } });
  await waitFor(() => events.some(e => e.event === 'fold-entered') || events.some(e => e.event === 'error'));
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(events.filter(e => e.event === 'fold-entered').length, 1, 'shared ownership is acquired before either worker may publish');
  for (const worker of workers) worker.postMessage({ operation: 'release' });
  await waitFor(() => events.filter(e => e.event === 'result').length === 2 || events.some(e => e.event === 'error'));
  assert.equal(events.some(e => e.event === 'error'), false, JSON.stringify(events));
  const results = events.filter(e => e.event === 'result').map(e => JSON.parse(e.result!.content[0]!.text));
  assert.equal(results[0].next, 'done', JSON.stringify(results)); assert.deepEqual(results[0], results[1]);
  assert.equal(events.filter(e => e.event === 'write').length, 2, 'one JSON/Markdown CR publication, never two folds');
  assert.equal(events.filter(e => e.event === 'fold-entered').length, 1);
 } finally { for (const worker of workers) await worker.terminate(); await f.cleanup(); }
});
