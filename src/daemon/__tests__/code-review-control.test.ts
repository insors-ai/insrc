import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type { IpcStreamMessage, LLMProvider, StructuredCompletionOpts } from '../../shared/types.js';
import { CodeReviewOperationRegistry } from '../code-review-operations.js';
import { codeReviewRunStart, type CodeReviewRunDeps } from '../code-review-rpc.js';
import { enveloped } from '../../workflow/review-pipeline/__tests__/enveloped.js';
import { writeAtomic } from '../../workflow/storage.js';

const epicHash = 'e1a2b3c4d5e6f708', storyId = 'S001';
function fixture() {
 const repo = mkdtempSync(join(tmpdir(), 'insrc-review-control-'));
 const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
 git('init', '-q'); git('config', 'user.name', 'Control Test'); git('config', 'user.email', 'test@example.invalid');
 mkdirSync(join(repo, 'src')); writeFileSync(join(repo, 'src/a.ts'), 'export const value = 1;\n'); git('add', 'src'); git('commit', '-qm', 'base');
 const base = git('rev-parse', 'HEAD'); writeFileSync(join(repo, 'src/a.ts'), 'export const value = 2;\n'); git('add', 'src'); git('commit', '-qm', 'story', '-m', `Insrc-Story: ${epicHash}/${storyId}`);
 mkdirSync(join(repo, '.insrc/build-start'), { recursive: true }); mkdirSync(join(repo, '.insrc/artifacts'), { recursive: true });
 writeFileSync(join(repo, `.insrc/build-start/${epicHash}-${storyId}.json`), JSON.stringify({ epicHash, storyId, rangeBase: base, stampedAt: '2026-10-27T00:00:00Z' }));
 writeFileSync(join(repo, `.insrc/artifacts/BUILD-${epicHash}-${storyId}.json`), JSON.stringify({ meta: { workflow: 'build', epicHash, storyId, createdAt: '2026-10-27T00:00:00Z', standalone: true, authoredBy: 'controller' }, body: { tasks: [] } }));
 return { repo, target: { repo: realpathSync(repo), epicHash, storyId }, cr: join(repo, `.insrc/artifacts/CR-${epicHash}-${storyId}.json`), cleanup: () => rmSync(repo, { recursive: true, force: true }) };
}
function harness(f: ReturnType<typeof fixture>) {
 const operations = new CodeReviewOperationRegistry(); let calls = 0, providers = 0, writes = 0, ownerSignal: AbortSignal | undefined, finish!: () => void, notify!: () => void;
 const started = new Promise<void>(resolve => { notify = resolve; });
 const provider = { capabilities: { boundedStructuredInput: true }, completeStructured: async (_m: unknown, schema: unknown, opts?: StructuredCompletionOpts) => {
  calls++; ownerSignal = opts?.signal;
  if (calls === 1) return await new Promise((resolve, reject) => { finish = () => resolve(enveloped(schema, { findings: [] })); opts!.signal!.addEventListener('abort', () => reject(Object.assign(new Error('owner aborted'), { name: 'AbortError' }))); notify(); });
  return enveloped(schema, { findings: [] });
 } } as unknown as LLMProvider;
 const deps: CodeReviewRunDeps = { operations, controlWaitMs: 0, resolveProvider: () => { providers++; return { provider, modelLabel: 'scripted-isolated' }; }, write: (path, text) => { writes++; writeAtomic(path, text); } };
 const rpc = async (extra: Record<string, unknown>, signal = new AbortController().signal) => { const frames: IpcStreamMessage[] = []; await codeReviewRunStart({ repo: f.repo, epicHash, storyId, ...extra }, frame => frames.push(frame), signal, deps); return frames.at(-1)!; };
 return { operations, started, rpc, finish: () => finish(), signal: () => ownerSignal, counts: () => ({ calls, providers, writes }), close: () => operations.close() };
}

test('DIFF-WAIT-RESUME: real operation RPC returns pending, detaches a request abort, joins starts and caches one final CR', async () => {
 const f = fixture(), h = harness(f);
 try {
  const request = new AbortController(); const first = await h.rpc({ operation: 'start', groundingMode: 'degraded' }, request.signal);
  assert.equal(first.stream, 'done'); const pending = first.data as { status: string; reviewHandle: string; artifact?: unknown }; assert.equal(pending.status, 'pending'); assert.equal(pending.artifact, undefined);
  await h.started; request.abort(); assert.equal(h.signal()!.aborted, false);
  const join = await h.rpc({ operation: 'start', groundingMode: 'degraded' }); assert.equal((join.data as { reviewHandle: string }).reviewHandle, pending.reviewHandle); assert.equal(h.counts().providers, 1);
  const wrong = await h.rpc({ operation: 'status', reviewHandle: pending.reviewHandle, storyId: 'S002' }); assert.equal(wrong.stream, 'error'); assert.equal((wrong.data as { reason: string }).reason, 'review-target-mismatch');
  h.finish(); const done = await h.operations.wait(pending.reviewHandle, f.target, { waitMs: 10_000 }); assert.equal(done.status, 'done'); assert.equal(h.counts().writes, 2);
  const cached = await h.rpc({ operation: 'start', groundingMode: 'degraded' }); assert.equal((cached.data as { reviewHandle: string }).reviewHandle, pending.reviewHandle); assert.equal((cached.data as { status: string }).status, 'done'); assert.equal(h.counts().writes, 2); assert.equal(h.counts().providers, 1);
  assert.equal(JSON.parse(readFileSync(f.cr, 'utf8')).meta.reviewInputSchemaVersion, 1);
 } finally { h.finish(); await h.close(); f.cleanup(); }
});

test('DIFF-WAIT-RESUME: real operation RPC conflicts on changed source and explicit cancellation stops the owner without a CR', async () => {
 const f = fixture(), h = harness(f);
 try {
  const first = await h.rpc({ operation: 'start', groundingMode: 'degraded' }); const handle = (first.data as { reviewHandle: string }).reviewHandle; await h.started;
  writeFileSync(join(f.repo, 'src/a.ts'), 'changed input while owner runs');
  const conflict = await h.rpc({ operation: 'start', groundingMode: 'degraded' }); assert.equal(conflict.stream, 'error'); assert.equal((conflict.data as { reason: string }).reason, 'review-conflict'); assert.equal(h.counts().providers, 1);
  await h.rpc({ operation: 'cancel', reviewHandle: handle });
  const cancelled = await h.operations.wait(handle, f.target, { waitMs: 10_000 }); assert.equal(cancelled.status, 'cancelled'); assert.equal(h.signal()!.aborted, true);
  assert.equal(h.counts().writes, 0); assert.equal(existsSync(f.cr), false);
  const lost = await h.rpc({ operation: 'status', reviewHandle: 'old-daemon-epoch.unknown' }); assert.equal(lost.stream, 'error'); assert.equal((lost.data as { reason: string }).reason, 'review-operation-lost');
 } finally { h.finish(); await h.close(); f.cleanup(); }
});
