import { resolveControllerReviewRole } from '../daemon-stream.js';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createConnection, createServer, type Socket } from 'node:net';
import { DEFAULT_DEPS, handleCodeReviewStep, withStepClient } from '../../daemon/steps/code-review-step/handler.js';
import { _clearCodeReviewStateStoreForTests } from '../../daemon/steps/code-review-step/state-store.js';
import { createStepCallHandler } from '../../daemon/steps/host.js';
import { currentStepContext } from '../../shared/step-context.js';
import { verifyBoundedCli } from '../../agent/providers/bounded-input.js';
import { CliProvider } from '../../agent/providers/cli-provider.js';
import { ControllerReviewHelper, isVerifiedControllerAdmission, resolveControllerReviewExecution } from '../controller-review.js';
import type { ControllerReviewForward } from '../controller-review.js';
import { forwardStep } from '../forward-step.js';
import type { StepMcpEnvelope } from '../forward-step.js';
import type { CodeReviewStepEmitCall } from '../../daemon/steps/code-review-step/types.js';

const FLAGS = '--safe-mode --no-session-persistence --system-prompt --tools --disable-slash-commands --setting-sources --strict-mcp-config --mcp-config';
const env = (value: unknown): StepMcpEnvelope => ({ content: [{ type: 'text', text: JSON.stringify(value) }] });
const parse = (reply: StepMcpEnvelope) => JSON.parse(reply.content[0]!.text);
function fixture(options: { help?: string; gated?: boolean; kind?: 'claude' | 'codex'; cap?: number; waitMs?: number } = {}) {
 const dir = mkdtempSync(join(tmpdir(), 'controller-cli-test-')), bin = join(dir, 'fake.mjs'), capture = join(dir, 'capture.jsonl'), gate = join(dir, 'gate'), closed = join(dir, 'closed');
 writeFileSync(bin, `#!/usr/bin/env node\nimport {appendFileSync,writeFileSync,existsSync} from 'node:fs';\nconst args=process.argv.slice(2);if(args.includes('--help')){process.stdout.write(${JSON.stringify(options.help ?? FLAGS)});process.exit(0)}\nlet stdin='';for await(const c of process.stdin)stdin+=c;\nappendFileSync(${JSON.stringify(capture)},JSON.stringify({pid:process.pid,args,stdin,cwd:process.cwd(),project:existsSync('CLAUDE.md'),inherited:process.env.CLAUDE_CODE_APPEND_SYSTEM_PROMPT})+'\\n');\nconst schema=JSON.parse(args[args.indexOf('--json-schema')+1]);\nconst finish=()=>{writeFileSync(${JSON.stringify(closed)},'closed');process.stdout.write(JSON.stringify({structured_output:{callId:schema.properties.callId.const,answer:{findings:[]}}}));};\nprocess.on('SIGTERM',()=>{writeFileSync(${JSON.stringify(closed)},'terminated');process.exit(0)});\n${options.gated ? `const timer=setInterval(()=>{if(existsSync(${JSON.stringify(gate)})){clearInterval(timer);finish()}},10);` : 'finish();'}\n`);
 chmodSync(bin, 0o755); writeFileSync(join(dir, 'CLAUDE.md'), 'PROJECT SENTINEL');
 const client = options.kind ?? 'claude';
 const helper = new ControllerReviewHelper({ waitMs: options.waitMs ?? 1000, privateSession: () => false, resolveRepo: async repo => repo ?? dir,
  resolveExecution: invoking => ({ client: invoking, bin, provider: new CliProvider({ kind: client, binPath: bin, model: 'review-high', ...(options.cap !== undefined ? { inputBudgetChars: options.cap } : {}) }), modelLabel: `cli-${invoking}:review-high` }),
 });
 const captures = () => existsSync(capture) ? readFileSync(capture, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line)) : [];
 return { dir, bin, capture, gate, closed, helper, client, captures, cleanup: async () => { await helper.close(); rmSync(dir, { recursive: true, force: true }); } };
}
function dead(pid: number): boolean { try { process.kill(pid, 0); return false; } catch (err) { return (err as NodeJS.ErrnoException).code === 'ESRCH'; } }
function frame(state = 'opaque-state', expiresAt = Date.now() + 600_000, cap = 384_000, content = 'EXPLICIT_EVIDENCE'): CodeReviewStepEmitCall {
 const callId = `identified-${state}`, startedAt = Date.now();
 return { next: 'emit_review_call', state, guidance: 'Execute only this explicit isolated task', timing: { startedAt, chunkCount: 3, budgetMs: 1_800_000, deadlineAt: startedAt + 1_800_000 },
  call: { callId, dimension: 'quality', stage: 'judge', role: 'single', messages: [{ role: 'system', content: 'Judge explicit evidence only' }, { role: 'user', content }], schema: { type: 'object', required: ['callId', 'answer'], additionalProperties: false, properties: { callId: { type: 'string', const: callId }, answer: { type: 'object', required: ['findings'], additionalProperties: false, properties: { findings: { type: 'array', items: { type: 'object' } } } } } }, limitChars: cap, expiresAt } };
}
function forwarding(task: CodeReviewStepEmitCall) {
 const requests: { args: Record<string, unknown>; verified: boolean }[] = [];
 const forward: ControllerReviewForward = async (raw, extra) => {
  const args = raw as Record<string, unknown>; requests.push({ args, verified: isVerifiedControllerAdmission(extra.controllerReview) });
  if (args['phase'] === 'judgements') return env({ next: 'done', verdict: 'warn', path: 'CR.md', jsonPath: 'CR.json' });
  if (args['proceed'] === false) return env({ next: 'error', error: { code: 'review-cancelled', retryable: false } });
  if (!isVerifiedControllerAdmission(extra.controllerReview)) return env({ next: 'error', error: { code: 'unsupported-bounded-controller', retryable: false } });
  return env(task);
 };
 return { forward, requests };
}
async function until(predicate: () => boolean): Promise<void> {
 const deadline = Date.now() + 5000;
 while (!predicate()) { if (Date.now() >= deadline) throw new Error('Test fixture did not settle'); await new Promise(resolve => setTimeout(resolve, 10)); }
}

test('DIFF-CONTROLLER-LARGE: actual helper dispatches complete explicit task metadata/schema through fresh isolated CLI/OAuth boundary', async () => {
 const f = fixture(), task = frame('large', Date.now() + 60_000, 384_000, 'EXPLICIT_EVIDENCE ' + 'x'.repeat(260_000)), h = forwarding(task);
 const prior = process.env['CLAUDE_CODE_APPEND_SYSTEM_PROMPT']; process.env['CLAUDE_CODE_APPEND_SYSTEM_PROMPT'] = 'INHERITED CHAT SENTINEL';
 try {
  const result = await f.helper.forward({ phase: 'start', repo: f.dir, epicHash: 'e1a2b3c4d5e6f708', storyId: 'S001' }, { client: 'claude' }, h.forward);
  assert.equal(parse(result).next, 'done'); const captures = f.captures(); assert.equal(captures.length, 1);
  const seen = captures[0]; assert.ok(seen.stdin.includes('EXPLICIT_EVIDENCE')); assert.ok(seen.stdin.includes(task.call.callId)); assert.ok(seen.stdin.includes('limitChars') && seen.stdin.includes('expiresAt') && seen.stdin.includes('timing'));
  assert.equal(seen.stdin.includes('INHERITED CHAT SENTINEL'), false); assert.equal(seen.inherited, undefined); assert.equal(seen.project, false); assert.notEqual(seen.cwd, f.dir);
  for (const flag of FLAGS.split(' ')) assert.ok(seen.args.includes(flag));
  assert.equal(seen.args[seen.args.indexOf('--tools') + 1], ''); assert.equal(seen.args[seen.args.indexOf('--setting-sources') + 1], ''); assert.equal(seen.args[seen.args.indexOf('--model') + 1], 'review-high');
  assert.deepEqual(JSON.parse(seen.args[seen.args.indexOf('--json-schema') + 1]), task.call.schema);
  assert.ok(h.requests.every(r => r.verified)); const callResult = h.requests.at(-1)!.args['callResult'] as { callId: string; answer: { callId: string } }; assert.equal(callResult.callId, task.call.callId); assert.equal(callResult.answer.callId, task.call.callId);
 } finally { if (prior === undefined) delete process.env['CLAUDE_CODE_APPEND_SYSTEM_PROMPT']; else process.env['CLAUDE_CODE_APPEND_SYSTEM_PROMPT'] = prior; await f.cleanup(); }
});

test('DIFF-CONTROLLER-ADMISSION: self-declared flags, forged descriptors, missing CLI isolation and unsupported Codex fail before evidence or model dispatch', async () => {
 for (const opts of [{ help: 'no-isolation' }, { kind: 'codex' as const }]) {
  const f = fixture(opts), h = forwarding(frame());
  try {
   const out = await f.helper.forward({ phase: 'start', repo: f.dir, controllerInput: { mode: 'isolated-structured', adapterId: `cli-${f.client}`, maxInputChars: 384_000 } }, { client: f.client }, h.forward);
   assert.equal(parse(out).error.code, 'unsupported-bounded-controller'); assert.ok(h.requests.every(r => !r.verified)); assert.equal(f.captures().length, 0);
  } finally { await f.cleanup(); }
 }
 let connected = false;
 const forged = await forwardStep('insrc_code_review_step', { phase: 'start' }, { client: 'claude', controllerReview: { client: 'claude', capability: { adapterId: 'cli-claude', maxInputChars: 384_000 } } }, { connect: () => { connected = true; throw new Error('forged descriptor reached socket'); } });
 assert.equal(parse(forged).error.code, 'unsupported-bounded-controller'); assert.equal(connected, false);
 const f = fixture(), h = forwarding(frame());
 try { const rawAnswer = await f.helper.forward({ phase: 'judgements', state: 'opaque-state', callResult: { callId: 'invented', answer: {} } }, { client: 'claude' }, h.forward); assert.equal(parse(rawAnswer).error.code, 'unsupported-bounded-controller'); assert.equal(h.requests.length, 0); }
 finally { await f.cleanup(); }
});

test('DIFF-CONTROLLER-TIME: pending helper turns rejoin one actual subprocess and explicit cancellation waits for its shutdown', async () => {
 for (const cancel of [false, true]) {
  const f = fixture({ gated: true, waitMs: 5 }), task = frame(), h = forwarding(task);
  try {
   const first = parse(await f.helper.forward({ phase: 'start', repo: f.dir }, { client: 'claude' }, h.forward)); assert.equal(first.next, 'controller_call_pending');
   await until(() => f.captures().length === 1);
   const again = parse(await f.helper.forward({ phase: 'start', state: task.state }, { client: 'claude' }, h.forward)); assert.equal(again.next, 'controller_call_pending'); assert.equal(again.callId, first.callId); assert.equal(f.captures().length, 1);
   if (cancel) {
    const cancelled = await f.helper.forward({ phase: 'start', state: task.state, proceed: false }, { client: 'claude' }, h.forward); assert.equal(parse(cancelled).error.code, 'review-cancelled'); assert.ok(dead(f.captures()[0].pid)); assert.equal(h.requests.filter(r => r.args['phase'] === 'judgements').length, 0);
   } else {
    writeFileSync(f.gate, 'release'); await until(() => existsSync(f.closed));
    let out: Record<string, unknown> = {};
    await until(() => f.captures().length === 1);
    for (let i = 0; i < 30; i++) { out = parse(await f.helper.forward({ phase: 'start', state: task.state }, { client: 'claude' }, h.forward)); if (out['next'] === 'done') break; await new Promise(resolve => setTimeout(resolve, 10)); }
    assert.equal(out['next'], 'done'); assert.equal(f.captures().length, 1);
   }
  } finally { await f.cleanup(); }
 }
});

test('DIFF-CONTROLLER-TIME: expiry kills owned CLI work and refuses late structured output', async () => {
 const f = fixture({ gated: true, waitMs: 5 }), task = frame('expires', Date.now() + 1500), h = forwarding(task);
 try {
  const first = parse(await f.helper.forward({ phase: 'start', repo: f.dir }, { client: 'claude' }, h.forward)); assert.equal(first.next, 'controller_call_pending');
  await until(() => f.captures().length === 1); await until(() => dead(f.captures()[0].pid));
  const expired = await f.helper.forward({ phase: 'start', state: task.state }, { client: 'claude' }, h.forward); assert.equal(parse(expired).error.code, 'review-deadline'); assert.equal(h.requests.filter(r => r.args['phase'] === 'judgements').length, 0); assert.equal(f.captures().length, 1);
 } finally { await f.cleanup(); }
});

test('DIFF-CONTROLLER-LARGE: duplicated normalized schema and task framing are measured before actual CLI dispatch and reported as a lower size refusal', async () => {
 const f = fixture({ cap: 10_000 }), task = frame('normalized', Date.now() + 60_000, 10_000);
 (task.call.schema as { description?: string }).description = 'schema context '.repeat(430);
 assert.ok(JSON.stringify(task).length < 10_000);
 const h = forwarding(task);
 try {
  await f.helper.forward({ phase: 'start', repo: f.dir }, { client: 'claude' }, h.forward);
  const result = h.requests.at(-1)!.args['callResult'] as { failure: { cause: string; maxChars: number } };
  assert.equal(result.failure.cause, 'size-refusal'); assert.ok(result.failure.maxChars < 10_000); assert.equal(f.captures().length, 0);
 } finally { await f.cleanup(); }
});


test('DIFF-CONTROLLER-ADMISSION: actual socket forwarder separates verified helper capability from arguments and host rechecks the installed CLI', async () => {
 const f = fixture(), task = frame(), socketPath = join(f.dir, 'helper.sock');
 const sockets = new Set<Socket>(); let hostProbes = 0; const contexts: unknown[] = [], requests: Record<string, unknown>[] = [];
 const handler = createStepCallHandler({ insrc_code_review_step: async raw => {
  const args = raw as Record<string, unknown>; requests.push(args); contexts.push(currentStepContext()?.controllerReview);
  if (currentStepContext()?.controllerReview === undefined) return env({ next: 'error', error: { code: 'unsupported-bounded-controller', retryable: false } });
  return args['phase'] === 'judgements' ? env({ next: 'done', verdict: 'warn' }) : env(task);
 } }, { verifyControllerCli: (client, cwd) => { hostProbes++; verifyBoundedCli(client, f.bin, cwd); } });
 const server = createServer(socket => {
  sockets.add(socket); const controller = new AbortController(); let buffer = '';
  socket.on('close', () => { sockets.delete(socket); controller.abort(); }); socket.on('error', () => {});
  socket.on('data', chunk => {
   buffer += chunk.toString(); const lines = buffer.split('\n'); buffer = lines.pop() ?? '';
   for (const line of lines.filter(Boolean)) {
    const request = JSON.parse(line); void handler(request.params, response => { if (!socket.destroyed) socket.write(JSON.stringify({ ...response, id: request.id }) + '\n'); }, controller.signal);
   }
  });
 });
 await new Promise<void>(resolve => server.listen(socketPath, resolve));
 const forward: ControllerReviewForward = (args, extra) => forwardStep('insrc_code_review_step', args, extra, { connect: () => createConnection(socketPath), cwd: f.dir });
 try {
  const raw = await forward({ phase: 'start', controllerInput: { mode: 'isolated-structured', adapterId: 'cli-claude', maxInputChars: 384_000 } }, { client: 'claude' });
  assert.equal(parse(raw).error.code, 'unsupported-bounded-controller'); assert.equal(hostProbes, 0); assert.equal(f.captures().length, 0);
  const done = await f.helper.forward({ phase: 'start', repo: f.dir }, { client: 'claude' }, forward); assert.equal(parse(done).next, 'done'); assert.equal(hostProbes, 2); assert.equal(f.captures().length, 1);
  assert.equal(contexts[0], undefined); assert.ok(contexts.slice(1).every(value => typeof value === 'object' && value !== null));
  assert.ok(requests.every(args => !('controllerReview' in args)), 'capability is an out-of-band forwarding context, never tool arguments');
 } finally { await f.helper.close(); for (const socket of sockets) socket.destroy(); await new Promise<void>(resolve => server.close(() => resolve())); await f.cleanup(); }
});

test('DIFF-CONTROLLER-TIME: serial helper handoff starts the next identified call once without returning evidence into chat', async () => {
 const f = fixture({ waitMs: 1000 }), first = frame('serial'), second = { ...frame('serial'), call: { ...frame('serial').call, callId: 'second-call' } };
 (second.call.schema as { properties: { callId: { const: string } } }).properties.callId.const = 'second-call';
 let current = first, completed = 0;
 const forward: ControllerReviewForward = async (raw, extra) => {
  assert.ok(isVerifiedControllerAdmission(extra.controllerReview));
  if ((raw as { phase: string }).phase === 'judgements') { completed++; if (completed === 1) { current = second; return env(second); } return env({ next: 'done', verdict: 'warn' }); }
  return env(current);
 };
 try {
  const out = parse(await f.helper.forward({ phase: 'start', repo: f.dir }, { client: 'claude' }, forward)); assert.equal(out.next, 'controller_call_pending'); assert.equal(out.callId, 'second-call'); assert.equal('call' in out || 'messages' in out || 'grounding' in out, false);
  let next: Record<string, unknown> = out;
  for (let i = 0; i < 30; i++) { next = parse(await f.helper.forward({ phase: 'start', state: first.state }, { client: 'claude' }, forward)); if (next['next'] === 'done') break; await new Promise(resolve => setTimeout(resolve, 10)); }
  assert.equal(next['next'], 'done'); assert.equal(f.captures().length, 2); assert.equal(completed, 2);
 } finally { await f.cleanup(); }
});


test('DIFF-CONTROLLER-TIME: queued calls remain serial and cancellation does not wait for an unrelated subprocess', async () => {
 const f = fixture({ gated: true, waitMs: 5 }), tasks = [frame('first'), frame('queued')];
 const forward: ControllerReviewForward = async raw => {
  const args = raw as { state?: string; proceed?: boolean }; if (args.proceed === false) return env({ next: 'error', error: { code: 'review-cancelled' } });
  return env(tasks.find(task => task.state === args.state) ?? tasks[0]);
 };
 try {
  assert.equal(parse(await f.helper.forward({ phase: 'start', repo: f.dir, state: tasks[0]!.state }, { client: 'claude' }, forward)).next, 'controller_call_pending');
  await until(() => f.captures().length === 1);
  assert.equal(parse(await f.helper.forward({ phase: 'start', repo: f.dir, state: tasks[1]!.state }, { client: 'claude' }, forward)).next, 'controller_call_pending');
  assert.equal(f.captures().length, 1);
  const before = Date.now(); const cancelled = await f.helper.forward({ phase: 'start', state: tasks[1]!.state, proceed: false }, { client: 'claude' }, forward);
  assert.equal(parse(cancelled).error.code, 'review-cancelled'); assert.ok(Date.now() - before < 1000); assert.equal(f.captures().length, 1); assert.equal(dead(f.captures()[0].pid), false, 'unrelated owner keeps running');
 } finally { await f.cleanup(); }
});


test('DIFF-CONTROLLER-LARGE: actual helper and daemon pipeline complete a daemon-authored git Story through isolated CLI calls only', async () => {
 const f = fixture(), repo = join(f.dir, 'repo'), epicHash = 'e1a2b3c4d5e6f708', storyId = 'S001'; mkdirSync(repo);
 const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
 git('init', '-q'); git('config', 'user.name', 'Helper Test'); git('config', 'user.email', 'test@example.invalid');
 writeFileSync(join(repo, 'a.ts'), 'export const a = 1;\n'); git('add', 'a.ts'); git('commit', '-qm', 'base'); const base = git('rev-parse', 'HEAD');
 writeFileSync(join(repo, 'a.ts'), 'export const a = 2;\n'); git('add', 'a.ts'); git('commit', '-qm', 'story', '-m', `Insrc-Story: ${epicHash}/${storyId}`);
 mkdirSync(join(repo, '.insrc/build-start'), { recursive: true }); mkdirSync(join(repo, '.insrc/artifacts'), { recursive: true });
 writeFileSync(join(repo, `.insrc/build-start/${epicHash}-${storyId}.json`), JSON.stringify({ epicHash, storyId, rangeBase: base, stampedAt: '2026-10-27T00:00:00Z' }));
 const path = (kind: string) => join(repo, `.insrc/artifacts/${kind}-${epicHash}-${storyId}.json`);
 writeFileSync(path('BUILD'), JSON.stringify({ meta: { workflow: 'build', epicHash, storyId, createdAt: '2026-10-27T00:00:00Z', standalone: true, authoredBy: 'daemon' }, body: { tasks: [{ id: 't1', passed: true }] } }));
 writeFileSync(path('TESTS'), JSON.stringify({ meta: { workflow: 'tests', epicHash, storyId, createdAt: '2026-10-27T00:00:00Z', updatedAt: '2026-10-27T00:00:00Z' }, body: { tasks: [] } }));
 const handler = createStepCallHandler({ insrc_code_review_step: (raw, signal) => handleCodeReviewStep(raw, { ...withStepClient({ ...DEFAULT_DEPS, fetchFreshness: async () => ({ ok: true, isProcessing: true, inFlight: true, pendingCodeIndexJobs: 1, staleFiles: ['a.ts'] }) }), signal }) }, { verifyControllerCli: (client, cwd) => verifyBoundedCli(client, f.bin, cwd) });
 const socketPath = join(f.dir, 'pipeline.sock'), sockets = new Set<Socket>();
 const server = createServer(socket => {
  sockets.add(socket); let buffer = ''; const controller = new AbortController(); socket.on('error', () => {}); socket.on('close', () => { sockets.delete(socket); controller.abort(); });
  socket.on('data', data => { buffer += data.toString(); const lines = buffer.split('\n'); buffer = lines.pop() ?? ''; for (const line of lines.filter(Boolean)) { const req = JSON.parse(line); void handler(req.params, res => { if (!socket.destroyed) socket.write(JSON.stringify({ ...res, id: req.id }) + '\n'); }, controller.signal); } });
 });
 await new Promise<void>(resolve => server.listen(socketPath, resolve));
 const forward: ControllerReviewForward = (args, extra) => forwardStep('insrc_code_review_step', args, extra, { connect: () => createConnection(socketPath), cwd: repo });
 try {
  let out = parse(await f.helper.forward({ phase: 'start', repo, epicHash, storyId }, { client: 'claude' }, forward)); assert.equal(out.next, 'confirm_wait');
  out = parse(await f.helper.forward({ phase: 'start', state: out.state, proceed: false }, { client: 'claude' }, forward));
  for (let i = 0; i < 20 && out.next === 'controller_call_pending'; i++) out = parse(await f.helper.forward({ phase: 'start', state: out.state }, { client: 'claude' }, forward));
  assert.equal(out.next, 'done', JSON.stringify(out)); assert.equal(out.verdict, 'warn'); assert.equal(f.captures().length, 3);
  const cr = JSON.parse(readFileSync(path('CR'), 'utf8')); assert.equal(cr.meta.reviewedBy, 'controller'); assert.equal(cr.meta.model, 'cli-claude:review-high'); assert.equal(cr.body.groundingMode, 'degraded'); assert.equal(cr.body.verdict, 'warn'); assert.ok(cr.meta.reviewInputFingerprint);
  assert.ok(f.captures().every(capture => capture.cwd !== repo && !capture.project));
 } finally { await f.helper.close(); for (const socket of sockets) socket.destroy(); await new Promise<void>(resolve => server.close(() => resolve())); await _clearCodeReviewStateStoreForTests(); await f.cleanup(); }
});


test('DIFF-CONTROLLER-TIME: overlapping result handoffs join one next-call owner and never dispatch its cached continuation twice', async () => {
 const f = fixture({ gated: true, waitMs: 5 }), first = frame('overlap'), next = { ...frame('overlap'), call: { ...frame('overlap').call, callId: 'next-overlap-call' } };
 (next.call.schema as { properties: { callId: { const: string } } }).properties.callId.const = next.call.callId;
 let current = first, terminal = false, firstSubmissions = 0;
 let release!: () => void; const barrier = new Promise<void>(resolve => { release = resolve; });
 const forward: ControllerReviewForward = async raw => {
  const args = raw as { phase: string; callResult?: { callId: string } };
  if (args.phase === 'judgements') {
   if (args.callResult!.callId === first.call.callId) { firstSubmissions++; await barrier; current = next; return env(next); } // daemon replay returns the cached next call
   terminal = true; return env({ next: 'done', verdict: 'warn' });
  }
  return terminal ? env({ next: 'done', verdict: 'warn' }) : env(current);
 };
 try {
  const pending = parse(await f.helper.forward({ phase: 'start', repo: f.dir }, { client: 'claude' }, forward)); assert.equal(pending.next, 'controller_call_pending');
  await until(() => f.captures().length === 1); writeFileSync(f.gate, 'release'); await until(() => existsSync(f.closed));
  const a = f.helper.forward({ phase: 'start', state: first.state }, { client: 'claude' }, forward);
  const b = f.helper.forward({ phase: 'start', state: first.state }, { client: 'claude' }, forward);
  await until(() => firstSubmissions > 0); await new Promise(resolve => setTimeout(resolve, 50)); release();
  const one = parse(await a), two = parse(await b); assert.ok(['controller_call_pending', 'done'].includes(one.next)); assert.ok(['controller_call_pending', 'done'].includes(two.next));
  for (let i = 0; i < 30 && !terminal; i++) { await f.helper.forward({ phase: 'start', state: first.state }, { client: 'claude' }, forward); await new Promise(resolve => setTimeout(resolve, 10)); }
  assert.equal(terminal, true); assert.equal(firstSubmissions, 1); assert.equal(f.captures().length, 2, 'one actual CLI process for each identified call');
  assert.equal(f.captures().filter(c => c.stdin.includes('next-overlap-call')).length, 1);
 } finally { release?.(); await f.cleanup(); }
});

test('DIFF-COMPAT: rejected continuation requests preserve the active isolated call and exact result retry without a second subprocess', async () => {
 const f = fixture({ gated: true, waitMs: 5 }), task = frame('recoverable-owner'), h = forwarding(task);
 let rejectedResult = false, submissions = 0;
 const forward: ControllerReviewForward = async (raw, extra) => {
  const args = raw as Record<string, unknown>;
  if (args['repo'] === '/foreign-review-target') return env({ next: 'error', error: { code: 'review-target-mismatch', retryable: false } });
  if (typeof args['requestError'] === 'string') return env({ next: 'error', error: { code: args['requestError'], retryable: false } });
  if (args['phase'] === 'judgements') { submissions++; if (!rejectedResult) { rejectedResult = true; return env({ next: 'error', error: { code: 'bad-call-result', retryable: false } }); } }
  return h.forward(raw, extra);
 };
 try {
  const first = parse(await f.helper.forward({ phase: 'start', repo: f.dir }, { client: 'claude' }, forward)); assert.equal(first.next, 'controller_call_pending');
  await until(() => f.captures().length === 1); const pid = f.captures()[0].pid, before = h.requests.length;
  const legacy = parse(await f.helper.forward({ phase: 'judgements', state: task.state, judgements: [] }, { client: 'claude' }, forward));
  assert.equal(legacy.error.code, 'bad-call-result'); assert.equal(h.requests.length, before, 'reject inherited chat judgements before RPC');
  const foreign = parse(await f.helper.forward({ phase: 'start', state: task.state, repo: '/foreign-review-target' }, { client: 'claude' }, forward)); assert.equal(foreign.error.code, 'review-target-mismatch');
  for (const code of ['bad-input', 'bad-phase', 'bad-state', 'bad-call-result', 'conflicting-call-replay']) {
   const invalid = parse(await f.helper.forward({ phase: 'start', state: task.state, requestError: code }, { client: 'claude' }, forward)); assert.equal(invalid.error.code, code);
  }
  assert.equal(dead(pid), false, 'request rejection must not cancel owned work');
  const rejoin = parse(await f.helper.forward({ phase: 'start', state: task.state }, { client: 'claude' }, forward)); assert.equal(rejoin.callId, first.callId); assert.equal(f.captures().length, 1);
  writeFileSync(f.gate, 'release'); await until(() => existsSync(f.closed));
  let out: ReturnType<typeof parse> = {};
  for (let i = 0; i < 30; i++) { out = parse(await f.helper.forward({ phase: 'start', state: task.state }, { client: 'claude' }, forward)); if (out.next === 'error') break; await new Promise(resolve => setTimeout(resolve, 10)); }
  assert.equal(out.error.code, 'bad-call-result');
  const done = parse(await f.helper.forward({ phase: 'start', state: task.state }, { client: 'claude' }, forward)); assert.equal(done.next, 'done');
  assert.equal(submissions, 2); assert.equal(f.captures().length, 1, 'retry forwards the same settled answer instead of executing another CLI call');
 } finally { await f.cleanup(); }
});


test('DIFF-COMPAT: controller execution resolves the critical review role over daemon IPC and refuses mismatched or malformed policy', async () => {
 const dir = mkdtempSync('/tmp/cm-role-wire-'), socket = join(dir, 'd.sock');
 const requests: { method: string; params: unknown }[] = [];
 const role = { tier: 'core', family: 'daemon-owned-family', model: 'served-review-model', effort: 'high', cli: { kind: 'claude' }, inputLimit: { unit: 'chars', max: 123456 } };
 const server = createServer(client => { let text = ''; client.on('data', chunk => { text += chunk.toString(); if (!text.includes('\n')) return; const request = JSON.parse(text.split('\n')[0]!); requests.push(request); client.write(JSON.stringify({ id: request.id, result: role }) + '\n'); }); });
 await new Promise<void>(resolve => server.listen(socket, resolve));
 try {
  const execution = await resolveControllerReviewExecution('claude', dir, repo => resolveControllerReviewRole(repo, { connect: () => createConnection(socket) }));
  assert.equal(requests.length, 1); assert.equal(requests[0]!.method, 'models.resolveRole'); assert.deepEqual(requests[0]!.params, { role: 'review', repoPath: dir });
  assert.equal(execution.client, 'claude'); assert.equal(execution.modelLabel, 'cli-claude:served-review-model'); assert.equal(execution.provider.inputBudgetChars, 123456);
  for (const invalid of [null, { error: 'older daemon' }, { ...role, cli: { kind: 'codex' } }, { ...role, model: '' }, { ...role, effort: 7 }, { ...role, inputLimit: { unit: 'chars', max: 0 } }]) {
   await assert.rejects(resolveControllerReviewExecution('claude', dir, async () => invalid), (error: unknown) => (error as { code?: unknown }).code === 'unsupported-bounded-input');
  }
  const tokens = await resolveControllerReviewExecution('claude', dir, async () => ({ ...role, inputLimit: { unit: 'tokens', max: 1000 } })); assert.equal(tokens.provider.inputBudgetChars, 3000);
 } finally { await new Promise<void>(resolve => server.close(() => resolve())); rmSync(dir, { recursive: true, force: true }); }
});

test('controller-review.test.ts: an Ollama-hosted or refused review role is not the invoking controller CLI', async () => {
	const hosted = { tier: 'core', family: 'ollama-claude', model: 'glm-5.3:cloud', cli: { kind: 'claude', ollama: { host: 'http://localhost:11434', hosting: 'cloud' } } };
	const refused = { tier: 'core', family: 'ollama-claude', model: 'kimi-k9:cloud', fallback: { reason: 'model-not-supported', requested: 'kimi-k9:cloud' }, cli: { kind: 'claude' } };
	for (const role of [hosted, refused]) {
		await assert.rejects(resolveControllerReviewExecution('claude', '/repo', async () => role), /does not select the invoking controller CLI/, role.model);
	}
	// The controller's own vendor CLI still resolves.
	const own = await resolveControllerReviewExecution('claude', '/repo', async () => ({ tier: 'core', family: 'cli-claude', model: 'claude-sonnet-5', cli: { kind: 'claude' } }));
	assert.deepEqual([own.client, own.provider.defaultModel, own.provider.ollama], ['claude', 'claude-sonnet-5', undefined]);
});
