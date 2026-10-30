/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Value } from '@sinclair/typebox/value';
import { createScopedReviewMcpServer } from '../review-investigation-bridge.js';
import { startNativeReviewBroker, readNativeReviewBridgeConfig, forwardNativeReviewCommand } from '../review-investigation-native.js';
import { ScopedReviewBridge } from '../../daemon/review-investigation-bridge.js';
import { CompactReviewFacade } from '../../daemon/review-investigation-compact.js';
import { CompactFinalAckSchema, parseCompactCommand, compactToolError } from '../../shared/review-investigation-compact.js';
import type { CompactProgress } from '../../shared/review-investigation-compact.js';
import { scopedReviewToolCatalog, scopedReviewCatalogDigest } from '../../shared/review-investigation-catalog.js';
import { recoveryFixture } from '../../workflow/code-review/investigation/__tests__/recovery-fixtures.js';
import { inspectionFixture } from '../../workflow/code-review/investigation/__tests__/ledger-fixtures.js';
import { runRecoveredContinuation } from '../../workflow/code-review/investigation/recovery-session.js';
import { compactNativeReviewFrame, acceptedNativeReviewReply, runNativeInvestigationSession } from '../../agent/providers/native-investigation-session.js';
import { preflightProviderReviewBudget, reviewWireSchemaJson } from '../../agent/providers/review-budget.js';
import type { InvestigationTools } from '../../workflow/code-review/investigation/continuation-types.js';
import { finalReply } from '../../workflow/code-review/investigation/__tests__/continuation-fixtures.js';
import { admitInvestigationRequest } from '../../workflow/code-review/investigation/continuation-policy.js';

function toolsFor(f: ReturnType<typeof recoveryFixture>): InvestigationTools {
 return { seed: f.context.seed, impact: f.context.impact, read: async () => { throw Error('unused'); }, progress: async () => { throw Error('unused'); },
  execution: { budget: {} as never, timeoutMs: 300000, stallMs: 300000, internalRetry: false } };
}
test('compact targets distinguish absent sides, bounded changes and pinned context with safe errors', () => {
 const f = recoveryFixture(); try {
  const facade = new CompactReviewFacade(f.turn, toolsFor(f), () => f.context.state, Date.now() + 300000);
  assert.equal(facade.read({ kind: 'change', blockId: 'b1', side: 'after' }), null);
  assert.deepEqual(JSON.parse(facade.read({ kind: 'change', blockId: 'b1', side: 'before' })!), { kind: 'blob', oid: 'e'.repeat(40), start: 1, end: 2 });
  assert.deepEqual(JSON.parse(facade.read({ kind: 'context', path: 'callers.ts', start: 20, end: 30 })!), { kind: 'context', path: 'callers.ts', start: 20, end: 30 });
  assert.throws(() => facade.read({ kind: 'change', blockId: 'b1', side: 'before', start: 1, end: 3 }), /needs correction/);
  assert.throws(() => facade.read({ kind: 'context', path: '../secret', start: 1, end: 2 }));
  assert.throws(() => facade.read({ kind: 'change', blockId: 'foreign', side: 'before' }));
  assert.throws(() => facade.read({ kind: 'artifact', artifactId: 'foreign', start: 1, end: 2 }));
  const safe = compactToolError(Error('private-token source-content /private/file'));
  assert.ok(safe.hint); assert.ok(!JSON.stringify(safe).includes('private-token'));
  assert.throws(() => parseCompactCommand({ operation: 'read', target: { kind: 'context', path: 'a.ts', start: 1, end: 2 } }));
  const catalog = scopedReviewToolCatalog(false, 'compact-v1');
  assert.equal(Value.Check(catalog[0]!.inputSchema, { target: { kind: 'context', path: 'a.ts', start: 1, end: 2 }, bindingId: 'forged' }), false);
  assert.notEqual(scopedReviewCatalogDigest(false), scopedReviewCatalogDigest(false, 'compact-v1'));
 } finally { f.cleanup(); }
});

test('compact bridge expands explicit members through durable kernel and replays a lost ACK once', async () => {
 const f = recoveryFixture(), bridge = new ScopedReviewBridge('compact-test', () => {}); let backendFailure: unknown;
 try {
  await f.store.prepare(f.manifest); const lease = await f.store.claim(300000), native = inspectionFixture(f.basis);
  await runRecoveredContinuation(f.store, lease, f.turn, { ...f.context,
   inspect: async (_ref, attemptId) => ({ read: native.readReceipt!, inspection: { ...native, attempt: { ...native.attempt, attemptId } } }),
   backend: { ...f.context.backend, execute: async (turn, tools, signal) => { try {
    const grant = bridge.issue({ repo: f.repo, turn, tools, peer: 'native-cli', signal, protocol: 'compact-v1', ttlMs: 300000,
     assertCurrent: () => f.store.assertLease(f.store.replay(), lease.leaseId, lease.generation), state: () => f.store.replay().state });
    const { expiresAt: _, ...common } = grant.binding;
    await assert.rejects(() => bridge.dispatch({ ...common, operation: 'read', reference: 'x' }, 'native-cli'), /protocol/);
    await assert.rejects(() => bridge.dispatch({ ...common, protocol: 'compact-v1', runId: 'foreign', operation: 'read', target: { kind: 'change', blockId: 'foreign', side: 'before' } }, 'native-cli'), /binding mismatch/);
    const server = createScopedReviewMcpServer(grant.binding, false, command => bridge.dispatch(command, 'native-cli'), 'compact-v1');
    const [a, b] = InMemoryTransport.createLinkedPair(), client = new Client({ name: 'compact-test', version: '1' });
    await server.connect(a); await client.connect(b);
    try {
     const absent = await client.callTool({ name: 'review_read', arguments: { target: { kind: 'change', blockId: 'b1', side: 'after' } } });
     assert.match(JSON.stringify(absent), /absent/); assert.equal(f.store.status().blockCheckpoints.length, 0);
     const bad = await client.callTool({ name: 'review_read', arguments: { target: { kind: 'change', blockId: 'b1', side: 'before', start: 1, end: 4 } } });
     assert.equal(bad.isError, true); assert.match(JSON.stringify(bad), /invalid-range/); assert.match(JSON.stringify(bad), /context/);
     const read = await client.callTool({ name: 'review_read', arguments: { target: { kind: 'change', blockId: 'b1', side: 'before', start: 1, end: 1 } } });
     const payload = JSON.parse((read.content as { text: string }[])[0]!.text);
     assert.equal(payload.result.evidence, 'e1'); assert.equal(payload.result.text, 'old\n');
     assert.ok(!JSON.stringify(payload).includes(grant.binding.bindingId)); assert.ok(!JSON.stringify(payload).includes(turn.subjectDigest));
     assert.equal(payload.view.tasks, undefined); assert.equal(payload.view.packets, undefined); assert.equal(payload.view.expectations, undefined);
     const frame = compactNativeReviewFrame(turn, tools, () => f.store.replay().state, Date.now() + 300000);
     const expectation = frame.expectations!.find(r => r.category === 'change')!.expectation;
     const input: CompactProgress = { blockId: 'b1', disposition: 'reviewed', evidence: ['e1'], notes: 'Read and assessed deletion', unresolved: [],
      assessments: [{ expectation, disposition: 'finding', evidence: ['e1'], findings: [0], rationale: 'Deletion loses required behavior' }],
      findings: [{ criterion: 'quality', severity: 'MED', confidence: 'breach', evidence: ['e1'], expectations: [expectation], message: 'Fixture deletion violates expected behavior' }] };
     const foreign = await client.callTool({ name: 'review_progress', arguments: { progress: { ...input, evidence: ['foreign'] } } });
     assert.equal(foreign.isError, true); assert.equal(f.store.status().blockCheckpoints.length, 0);
     const missing = await client.callTool({ name: 'review_progress', arguments: { progress: { ...input, assessments: [{ ...input.assessments[0], expectation: 'r99999' }] } } });
     assert.equal(missing.isError, true);
     assert.match(JSON.stringify(missing), /Copy an expectation field exactly/);
     assert.match(JSON.stringify(missing), /Current expectations/);
     assert.ok(JSON.stringify(missing).includes(expectation));
     assert.equal(f.store.status().blockCheckpoints.length, 0, 'invalid aliases provide recovery guidance without accepting coverage');
     const ack = await client.callTool({ name: 'review_progress', arguments: { progress: input } });
     assert.equal(ack.isError, undefined); assert.equal(f.store.status().blockCheckpoints.length, 1, 'ACK follows real durable acceptance');
     const replay = await client.callTool({ name: 'review_progress', arguments: { progress: input } });
     const replayPayload = JSON.parse((replay.content as { text: string }[])[0]!.text), ackPayload = JSON.parse((ack.content as { text: string }[])[0]!.text);
     assert.deepEqual(replayPayload.result, ackPayload.result);
     assert.ok(replayPayload.view.remainingMs <= ackPayload.view.remainingMs);
     assert.equal(f.store.status().blockCheckpoints.length, 1, 'lost acknowledgement replay is not another commit');
     const state = f.store.replay().state;
     assert.equal(state.ledger.coverage.filter(r => r.disposition === 'finding').length, 1);
     assert.equal(state.ledger.coverage.filter(r => r.disposition === 'pending').length, state.ledger.coverage.length - 1);
     assert.equal(state.ledger.findings.length, 1); assert.equal(state.accepted[0]!.progress.attemptId, turn.attemptId);
     const done = await client.callTool({ name: 'review_reply', arguments: { reply: { action: 'finish', reason: 'Remaining obligations need further evidence' } } });
     assert.equal(done.isError, undefined); const reply = await grant.done;
     assert.equal(reply.next.kind, 'pause'); assert.ok(reply.next.remainingWork.length > 0);
     assert.deepEqual(acceptedNativeReviewReply('compact-v1', { acknowledged: true }, reply), reply);
     assert.throws(() => acceptedNativeReviewReply('compact-v1', { acknowledged: true }, undefined), /does not match accepted/);
     return reply;
    } finally { await client.close(); await server.close(); await bridge.revoke(grant.binding.bindingId); }
   } catch (cause) { backendFailure = cause; throw cause; } } }
  });
  if (backendFailure) throw backendFailure;
  assert.equal(f.store.status().blockCheckpoints.length, 1);
 } finally { await bridge.shutdown(); f.cleanup(); }
});

test('compact native socket pins private protocol and preserves actionable safe errors', async () => {
 const f = recoveryFixture(), cwd = mkdtempSync(join(tmpdir(), 'compact-broker-')), bridge = new ScopedReviewBridge('socket-test', () => {});
 let broker: Awaited<ReturnType<typeof startNativeReviewBroker>> | undefined;
 try {
  const grant = bridge.issue({ repo: f.repo, turn: f.turn, tools: toolsFor(f), peer: 'native-cli', signal: new AbortController().signal,
   protocol: 'compact-v1', ttlMs: 300000, assertCurrent: () => {}, state: () => f.context.state });
  broker = await startNativeReviewBroker(cwd, grant.binding, command => bridge.dispatch(command, 'native-cli'), 'compact-v1');
  const config = readNativeReviewBridgeConfig(broker.bindingPath); assert.equal(config.version, 2);
  const { expiresAt: _, ...binding } = grant.binding;
  await assert.rejects(() => forwardNativeReviewCommand(config, { ...binding, protocol: 'compact-v1', operation: 'read', target: { kind: 'change', blockId: 'foreign', side: 'before' } }), error => {
   assert.equal(compactToolError(error).code, 'unknown-block'); return true;
  });
  await assert.rejects(() => forwardNativeReviewCommand(config, { ...binding, operation: 'read', reference: 'x' }));
  assert.equal((await forwardNativeReviewCommand(config, { ...binding, protocol: 'compact-v1', operation: 'read', target: { kind: 'change', blockId: 'b1', side: 'after' } }) as { result: { absent: boolean } }).result.absent, true);
 } finally { if (broker) await broker.close(); await bridge.shutdown(); rmSync(cwd, { recursive: true, force: true }); f.cleanup(); }
});

test('compact frame retains tasks and every packet while inclusive budget admits actual catalog and acknowledgement schema', () => {
 const f = recoveryFixture(); try {
  const frame = compactNativeReviewFrame(f.turn, toolsFor(f), () => f.context.state, Date.now() + 300000);
  assert.equal(frame.tasks.length, f.basis.subject.tasks.length); assert.equal(frame.packets[0]!.blocks.length, 2); assert.equal(frame.focus, 'b1');
  assert.equal(frame.expectations!.find(r => r.category === 'criterion')!.criterion, 'adherence');
  const json = JSON.stringify(frame);
  for (const hidden of ['requestDigest', 'subjectDigest', 'generation', 'expectedSequence', 'rowId', 'checkpointDigest']) assert.ok(!json.includes(`"${hidden}"`));
  const execution = { policy: f.context.policy.budget, admitted: admitInvestigationRequest(f.context.policy, { frame }, CompactFinalAckSchema), outputAllowanceTokens: f.context.policy.budget.profile.completionReserveTokens, reviewId: f.turn.runId, callId: 'test', stage: 'judge', role: 'investigation', attempt: 1 };
  const budget = preflightProviderReviewBudget(execution,
   f.context.policy.budget.profile, json.length, reviewWireSchemaJson(f.context.policy.budget.profile, CompactFinalAckSchema), undefined, JSON.stringify(scopedReviewToolCatalog(false, 'compact-v1')));
  assert.ok(budget.estimatedTotalTokens <= 128000);
  assert.throws(() => preflightProviderReviewBudget(execution,
   f.context.policy.budget.profile, 1000000, JSON.stringify(CompactFinalAckSchema), undefined, JSON.stringify(scopedReviewToolCatalog(false, 'compact-v1'))));
 } finally { f.cleanup(); }
});

test('compact CLI acknowledgement never substitutes for accepted reply and old bindings cannot launch it', async () => {
 const f = recoveryFixture(); try {
  const reply = finalReply(f.turn, [], 0);
  assert.throws(() => acceptedNativeReviewReply('compact-v1', { acknowledged: true }, undefined));
  assert.throws(() => acceptedNativeReviewReply('compact-v1', { acknowledged: true, reply }, reply));
  assert.throws(() => acceptedNativeReviewReply('compact-v1', reply, reply));
  assert.equal(acceptedNativeReviewReply('bound-v1', reply, reply), reply);
  assert.throws(() => acceptedNativeReviewReply('bound-v1', { acknowledged: true }, reply));
  assert.equal(Value.Check(CompactFinalAckSchema, { acknowledged: true }), true);
  // A serialized or obsolete lookalike has no verifier authority; it cannot reach invoke.
  let calls = 0;
  await assert.rejects(() => runNativeInvestigationSession({ binding: {} as never, adapter: { kind: 'claude', version: 'unqualified-compact', modelProtocol: 'compact-v1', args: () => [], configuration: () => ({}), launchDigest: () => '' },
   prompt: '', schema: CompactFinalAckSchema, opts: {} as never, binaryPath: '/untrusted', modelArgs: [], profile: f.context.policy.budget.profile, invoke: async () => { calls++; } }));
  assert.equal(calls, 0);
 } finally { f.cleanup(); }
});
