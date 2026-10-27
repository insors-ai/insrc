import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';
import type { IpcStreamMessage, LLMProvider } from '../../shared/types.js';
import { codeReviewRunStart } from '../code-review-rpc.js';
import { DEFAULT_DEPS, handleCodeReviewStep } from '../steps/code-review-step/handler.js';
import type { CodeReviewStepOutput } from '../steps/code-review-step/types.js';
import { _clearCodeReviewStateStoreForTests } from '../steps/code-review-step/state-store.js';
import { writeAtomic } from '../../workflow/storage.js';
import { compareReviewInputFingerprint, readReviewInputSnapshot } from '../../workflow/code-review/input-fingerprint.js';
import { claimReviewPublication } from '../../workflow/code-review/publication.js';
import { approveArtifactByJsonPath, approveWorkflowTarget, ReviewBlockedError } from '../../workflow/gates.js';
import { enforceCodeReviewGate } from '../../workflow/code-review/gate.js';
import { runCodeReview } from '../../workflow/code-review/runner.js';
import { enveloped } from '../../workflow/review-pipeline/__tests__/enveloped.js';

const epicHash = 'e1a2b3c4d5e6f708', storyId = 'S001';
function fixture(author: 'controller' | 'daemon' = 'controller') {
 const repo = mkdtempSync(join(tmpdir(), 'insrc-publication-'));
 const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
 git('init', '-q'); git('config', 'user.name', 'Publication Test'); git('config', 'user.email', 'test@example.invalid');
 mkdirSync(join(repo, 'src')); writeFileSync(join(repo, 'src/a.ts'), 'export const value = 1;\n'); git('add', 'src'); git('commit', '-qm', 'base');
 const base = git('rev-parse', 'HEAD'); writeFileSync(join(repo, 'src/a.ts'), 'export const value = 2;\n'); git('add', 'src'); git('commit', '-qm', 'story', '-m', `Insrc-Story: ${epicHash}/${storyId}`);
 mkdirSync(join(repo, '.insrc/build-start'), { recursive: true }); mkdirSync(join(repo, '.insrc/artifacts'), { recursive: true });
 writeFileSync(join(repo, `.insrc/build-start/${epicHash}-${storyId}.json`), JSON.stringify({ epicHash, storyId, rangeBase: base, stampedAt: '2026-10-27T00:00:00Z' }));
 const path = (kind: string) => join(repo, `.insrc/artifacts/${kind}-${epicHash}-${storyId}.json`);
 const build = { meta: { workflow: 'build', epicHash, storyId, createdAt: '2026-10-27T00:00:00Z', standalone: true, authoredBy: author }, body: { tasks: [{ id: 't1', passed: true }] } };
 const tests = { meta: { workflow: 'tests', epicHash, storyId, createdAt: '2026-10-27T00:00:00Z', updatedAt: '2026-10-27T00:00:00Z' }, body: { tasks: [] } };
 writeFileSync(path('BUILD'), JSON.stringify(build)); writeFileSync(path('TESTS'), JSON.stringify(tests));
 return { repo, path, build, tests, git, cleanup: () => rmSync(repo, { recursive: true, force: true }) };
}
async function daemonRun(f: ReturnType<typeof fixture>, mutate?: () => void, post?: () => void) {
 const frames: IpcStreamMessage[] = []; let calls = 0, writes = 0;
 const provider = { capabilities: { boundedStructuredInput: true }, completeStructured: async (_m: unknown, schema: unknown) => { if (++calls === 1) mutate?.(); return enveloped(schema, { findings: [] }); } } as unknown as LLMProvider;
 await codeReviewRunStart({ repo: f.repo, epicHash, storyId, groundingMode: 'degraded' }, frame => frames.push(frame), new AbortController().signal, {
  resolveProvider: () => ({ provider, modelLabel: 'scripted-isolated' }),
  write: (path, content) => { writes++; writeAtomic(path, content); if (writes === 2) post?.(); },
 });
 return { frames, calls, writes };
}

test('DIFF-PUBLISH-SOURCE: real daemon hooks reject source, HEAD and contract changes during review without a second start or CR overwrite', async () => {
 for (const kind of ['source', 'head', 'contract'] as const) {
  const f = fixture();
  try {
   writeFileSync(f.path('CR'), 'previous CR bytes');
   const mutate = () => {
    if (kind === 'source') writeFileSync(join(f.repo, 'src/a.ts'), 'changed while reviewer ran');
    if (kind === 'head') f.git('commit', '--allow-empty', '-qm', 'new HEAD');
    if (kind === 'contract') writeFileSync(f.path('PLAN'), JSON.stringify({ meta: { ...f.build.meta, workflow: 'plan', approvedAt: 'approved' }, body: { tasks: [] } }));
   };
   const out = await daemonRun(f, mutate); assert.ok(out.calls > 0); assert.equal(out.writes, 0);
   assert.equal(out.frames.at(-1)!.stream, 'error'); assert.equal(readFileSync(f.path('CR'), 'utf8'), 'previous CR bytes');
   assert.equal((out.frames.at(-1)!.data as { reason: string }).reason, 'review-input-changed');
  } finally { f.cleanup(); }
 }
});

test('DIFF-PUBLISH-BUILD: rebuild and author replacement prevent publication; unchanged source records carry current fingerprint metadata', async () => {
 for (const author of [false, true]) {
  const f = fixture();
  try {
   const out = await daemonRun(f, () => writeFileSync(f.path('BUILD'), JSON.stringify(author ? { ...f.build, meta: { ...f.build.meta, authoredBy: 'daemon' } } : { ...f.build, body: { tasks: [{ id: 't1', passed: false }] } })));
   assert.equal(out.writes, 0); assert.equal(out.frames.at(-1)!.stream, 'error'); assert.equal(existsSync(f.path('CR')), false);
  } finally { f.cleanup(); }
 }
 const f = fixture();
 try {
  const out = await daemonRun(f); assert.equal(out.frames.at(-1)!.stream, 'done'); assert.equal(out.writes, 2);
  const artifact = JSON.parse(readFileSync(f.path('CR'), 'utf8'));
  assert.equal(artifact.meta.reviewInputSchemaVersion, 1); assert.equal(artifact.meta.reviewedBy, 'daemon');
  assert.deepEqual(compareReviewInputFingerprint(artifact.meta.reviewInputFingerprint, f.repo, epicHash, storyId), { status: 'fresh' });
 } finally { f.cleanup(); }
});

test('DIFF-IDENTITY-TESTS: a TESTS-only update during the actual daemon review prevents a new CR', async () => {
 const f = fixture();
 try {
  const out = await daemonRun(f, () => writeFileSync(f.path('TESTS'), JSON.stringify({ ...f.tests, meta: { ...f.tests.meta, updatedAt: 'new verdict evidence' } })));
  assert.equal(out.writes, 0); assert.equal(out.frames.at(-1)!.stream, 'error'); assert.equal(existsSync(f.path('CR')), false);
 } finally { f.cleanup(); }
});

test('DIFF-PUBLISH-SOURCE: post-publication mutation reports no accepted completion and leaves an explicitly stale fingerprinted record', async () => {
 const f = fixture();
 try {
  const out = await daemonRun(f, undefined, () => writeFileSync(join(f.repo, 'src/a.ts'), 'narrow publication race'));
  assert.equal(out.writes, 2); assert.equal(out.frames.at(-1)!.stream, 'error'); assert.ok(!out.frames.some(frame => frame.stream === 'done'));
  const artifact = JSON.parse(readFileSync(f.path('CR'), 'utf8'));
  assert.equal(compareReviewInputFingerprint(artifact.meta.reviewInputFingerprint, f.repo, epicHash, storyId).status, 'stale-review');
  for (const overrideReview of [undefined, 'accept findings']) {
   assert.throws(() => enforceCodeReviewGate(f.repo, epicHash, storyId, { enforce: false, overrideReview }), (err: unknown) => err instanceof ReviewBlockedError && err.summary === 'stale-review');
   const before = readFileSync(f.path('BUILD'));
   assert.throws(() => approveArtifactByJsonPath(f.path('BUILD'), overrideReview === undefined ? {} : { overrideReview }), (err: unknown) => err instanceof ReviewBlockedError && err.summary === 'stale-review');
   assert.ok(readFileSync(f.path('BUILD')).equals(before));
  }

 } finally { f.cleanup(); }
});

const parse = (envelope: Awaited<ReturnType<typeof handleCodeReviewStep>>) => JSON.parse(envelope.content[0]!.text) as CodeReviewStepOutput;
test('DIFF-PUBLISH-BUILD: real controller continuation rejects source, BUILD, TESTS and author changes against admitted identity', async () => {
 for (const kind of ['source', 'build', 'tests', 'author'] as const) {
  const f = fixture('daemon'); await _clearCodeReviewStateStoreForTests();
  try {
   const deps = { ...DEFAULT_DEPS, fetchFreshness: async () => ({ ok: true as const, isProcessing: false, staleFiles: [] }), fetchGrounding: async () => ({ ok: true as const, grounding: { symbols: [{ entityId: 'a', file: 'src/a.ts', kind: 'function', name: 'a', signature: 'value(): number', callers: [], callees: [], testsReaching: [] }] } }) };
   const start = parse(await handleCodeReviewStep({ phase: 'start', repo: f.repo, epicHash, storyId }, deps));
   assert.equal(start.next, 'emit_judgements'); if (start.next !== 'emit_judgements') continue;
   if (kind === 'source') writeFileSync(join(f.repo, 'src/a.ts'), 'changed controller source');
   if (kind === 'build') writeFileSync(f.path('BUILD'), JSON.stringify({ ...f.build, body: { tasks: [{ id: 't1', passed: false }] } }));
   if (kind === 'tests') writeFileSync(f.path('TESTS'), '{invalid replacement');
   if (kind === 'author') writeFileSync(f.path('BUILD'), JSON.stringify({ ...f.build, meta: { ...f.build.meta, authoredBy: 'controller' } }));
   const done = parse(await handleCodeReviewStep({ phase: 'judgements', state: start.state, judgements: { judgements: ['adherence', 'conventions', 'coverage', 'quality'].map(dimension => ({ dimension, findings: [] })) } }, deps));
   assert.equal(done.next, 'error'); assert.equal(existsSync(f.path('CR')), false);
  } finally { await _clearCodeReviewStateStoreForTests(); f.cleanup(); }
 }
});

test('DIFF-PUBLISH-BUILD: ownership excludes a competing publisher and required hook admission fails before grounding or models', async () => {
 const f = fixture();
 try {
  const admitted = readReviewInputSnapshot(f.repo, epicHash, storyId), guard = claimReviewPublication(admitted.fingerprint, 'daemon');
  try { assert.throws(() => claimReviewPublication(admitted.fingerprint, 'daemon'), /already owns/); }
  finally { guard.release(); }
  const next = claimReviewPublication(admitted.fingerprint, 'daemon'); next.release();
  let grounded = 0;
  const result = await runCodeReview(admitted.subject, {} as LLMProvider, { runId: 'missing-hook', modelLabel: 'none', requirePublication: true }, { judges: [], assembleGrounding: async () => { grounded++; return { symbols: [] }; }, write: () => { throw new Error('must not write'); } });
  assert.equal(result.ok, false); assert.equal(grounded, 0);
 } finally { f.cleanup(); }
});


test('DIFF-PUBLISH-SOURCE: hollow graph fallback cannot silently admit source edited during the first grounding read', async () => {
 const f = fixture('daemon'); await _clearCodeReviewStateStoreForTests();
 try {
  let diffReads = 0;
  const deps = { ...DEFAULT_DEPS, fetchFreshness: async () => ({ ok: true as const, isProcessing: false, staleFiles: [] }), fetchGrounding: async () => { writeFileSync(join(f.repo, 'src/a.ts'), 'changed while empty graph returned'); return { ok: true as const, grounding: { symbols: [] } }; }, assembleDiffGrounding: async () => { diffReads++; throw new Error('must not restart with new source'); } };
  const start = parse(await handleCodeReviewStep({ phase: 'start', repo: f.repo, epicHash, storyId }, deps));
  assert.equal(start.next, 'error'); assert.equal(diffReads, 0); assert.equal(existsSync(f.path('CR')), false);
 } finally { await _clearCodeReviewStateStoreForTests(); f.cleanup(); }
});


test('DIFF-PUBLISH-BUILD: RPC rechecks identity after the runner returns before sending its terminal result', async () => {
 const f = fixture();
 try {
  const frames: IpcStreamMessage[] = [];
  const provider = { capabilities: { boundedStructuredInput: true }, completeStructured: async (_m: unknown, schema: unknown) => enveloped(schema, { findings: [] }) } as unknown as LLMProvider;
  await codeReviewRunStart({ repo: f.repo, epicHash, storyId, groundingMode: 'degraded' }, m => frames.push(m), new AbortController().signal, {
   resolveProvider: () => ({ provider, modelLabel: 'scripted' }),
   runReview: async (...args) => { const outcome = await runCodeReview(...args); writeFileSync(f.path('BUILD'), JSON.stringify({ ...f.build, body: { tasks: [{ id: 't1', passed: false }] } })); return outcome; },
  });
  assert.equal(frames.at(-1)!.stream, 'error'); assert.ok(!frames.some(m => m.stream === 'done'));
  const artifact = JSON.parse(readFileSync(f.path('CR'), 'utf8'));
  assert.equal(compareReviewInputFingerprint(artifact.meta.reviewInputFingerprint, f.repo, epicHash, storyId).status, 'stale-review');
  for (const overrideReview of [undefined, 'accept findings']) {
   assert.throws(() => enforceCodeReviewGate(f.repo, epicHash, storyId, { enforce: false, overrideReview }), (err: unknown) => err instanceof ReviewBlockedError && err.summary === 'stale-review');
   const before = readFileSync(f.path('BUILD'));
   assert.throws(() => approveArtifactByJsonPath(f.path('BUILD'), overrideReview === undefined ? {} : { overrideReview }), (err: unknown) => err instanceof ReviewBlockedError && err.summary === 'stale-review');
   assert.ok(readFileSync(f.path('BUILD')).equals(before));
  }

 } finally { f.cleanup(); }
});


test('DIFF-PUBLISH-BUILD: completion cannot erase a known legacy BUILD author to bypass independent review', async () => {
 const f = fixture();
 try {
  const { createdAt: _created, ...meta } = f.build.meta;
  writeFileSync(f.path('BUILD'), JSON.stringify({ meta, body: f.build.body }));
  writeFileSync(f.path('CR'), JSON.stringify({ meta: { reviewedBy: 'controller' }, body: { verdict: 'pass', counts: { high: 0, med: 0, low: 0 } } }));
  const result = await approveWorkflowTarget({ repoPath: f.repo, artifactPath: f.path('BUILD') }, { enforce: false });
  assert.equal(result.approved.length, 0); assert.equal(result.skipped.length, 1);
  const current = JSON.parse(readFileSync(f.path('BUILD'), 'utf8'));
  assert.equal(current.meta.authoredBy, 'controller'); assert.equal(current.meta.approvedAt, undefined);
 } finally { f.cleanup(); }
});
