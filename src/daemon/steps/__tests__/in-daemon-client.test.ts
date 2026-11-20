/** Current client refusals plus generic dispatcher transport controls. No daemon/store/model. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInDaemonClient, waitText } from '../daemon-client.js';
import { directDispatch } from '../../server.js';
import type { DeliverEnvelope, StreamHandler } from '../../server.js';
import { RequestLifetime } from '../../request-context.js';
import { DesignReviewConnections } from '../../../mcp/design-review/handler.js';
import { CodeReviewConnections } from '../../../mcp/code-review/handler.js';
import { reviewArtifactStream, codeReviewStream, fetchCodeReviewFreshness, fetchCodeReviewGrounding } from '../../../mcp/daemon-stream.js';

test('Retired review surfaces reject before argument inspection, providers or IO', async () => {
	let reads = 0, calls = 0;
	const poison = new Proxy({}, { get() { reads++; throw new Error('input inspected'); }, getPrototypeOf() { reads++; throw new Error('prototype inspected'); } });
	const client = createInDaemonClient(new Proxy({}, { get() { calls++; throw new Error('handler lookup'); } }), {}, {
		route: { targetOf() { calls++; throw new Error('route lookup'); }, request: async () => { calls++; throw new Error('worker request'); } },
	});
	const design = 'Design review functionality is being rewritten.';
	const code = 'Code review functionality is being rewritten.';
	await assert.rejects(client.reviewArtifactStream(poison as never, poison as never), { message: design });
	await assert.rejects(client.codeReviewStream(poison as never, poison as never), { message: code });
	await assert.rejects(client.fetchCodeReviewGrounding(poison as never), { message: code });
	await assert.rejects(client.fetchCodeReviewFreshness(poison as never), { message: code });
	assert.throws(() => reviewArtifactStream(poison as never, poison as never), { message: design });
	assert.throws(() => codeReviewStream(poison as never, poison as never), { message: code });
	await assert.rejects(fetchCodeReviewGrounding(poison as never), { message: code });
	await assert.rejects(fetchCodeReviewFreshness(poison as never), { message: code });
	const deps = { connect: () => { calls++; throw new Error('connect'); }, resolveRepo: async () => { calls++; throw new Error('resolve'); } };
	for (const [handler, message, type] of [[new DesignReviewConnections(deps), design, 'DesignReviewError'], [new CodeReviewConnections(deps), code, 'TaskReviewError']] as const) {
		try {
			const envelope = await handler.call(poison);
			assert.equal(envelope.isError, true);
			const body = JSON.parse(envelope.content[0]!.text);
			assert.equal(body.error.code, 'review-unavailable'); assert.equal(body.error.name, type);
			assert.equal(body.error.message, message); assert.equal(body.error.retryable, false);
		} finally { handler.close(); }
	}
	assert.equal(reads, 0); assert.equal(calls, 0);
});

test('in-daemon cwd lookup and unary failures keep current client semantics', async () => {
	const client = createInDaemonClient({ 'repo.resolveForCwd': async p => ({ path: (p as { cwd: string }).cwd === '/caller' ? '/registered' : null }) }, {});
	assert.equal(await client.resolveRepoForCwd('/caller'), '/registered'); assert.equal(await client.resolveRepoForCwd('/elsewhere'), null);
	const failed = createInDaemonClient({ 'repo.resolveForCwd': async () => { throw new Error('lookup exploded'); } }, {});
	await assert.rejects(failed.resolveRepoForCwd('/caller'), { message: 'lookup exploded' });
	const declined = createInDaemonClient({ 'repo.resolveForCwd': async () => ({ error: 'lookup refused' }) }, {});
	await assert.rejects(declined.resolveRepoForCwd('/caller'), { message: 'lookup refused' });
});

test('Generic client progress, synchronous errors and abort drains retain coverage on supported handlers', { timeout: 5000 }, async () => {
	const frames: Parameters<DeliverEnvelope>[0][] = [];
	const done = new RequestLifetime();
	directDispatch({}, { 'test.progress': async (_p, send) => {
		send({ id: 0, stream: 'progress', data: { step: 'working' } }); send({ id: 0, stream: 'done', data: { value: 42 } });
	} })({ kind: 'request', requestId: 'done', method: 'test.progress', params: {}, stream: true, lifetime: done }, frame => frames.push(frame));
	await done.completed; await done.drained;
	assert.deepEqual(frames, [
		{ kind: 'frame', requestId: 'done', frame: { id: 0, stream: 'progress', data: { step: 'working' } } },
		{ kind: 'frame', requestId: 'done', frame: { id: 0, stream: 'done', data: { value: 42 } } },
	]);
	const sync = new RequestLifetime(); const errors: Parameters<DeliverEnvelope>[0][] = [];
	const throwsNow = (() => { throw new Error('thrown before any await'); }) as StreamHandler;
	directDispatch({}, { 'test.throw': throwsNow })({ kind: 'request', requestId: 'sync', method: 'test.throw', params: {}, stream: true, lifetime: sync }, frame => errors.push(frame));
	await sync.completed; await sync.drained;
	assert.deepEqual(errors, [{ kind: 'frame', requestId: 'sync', frame: { id: 0, stream: 'error', data: { error: 'thrown before any await', recoverable: true } } }]);
	const unknown = new RequestLifetime(); const absent: Parameters<DeliverEnvelope>[0][] = [];
	directDispatch({})({ kind: 'request', requestId: 'missing', method: 'test.absent', params: {}, stream: true, lifetime: unknown }, frame => absent.push(frame));
	await unknown.completed; await unknown.drained;
	assert.deepEqual(absent, [{ kind: 'reply', requestId: 'missing', error: 'unknown method: test.absent' }]);
	const aborted = new RequestLifetime(); let started!: () => void, release!: () => void;
	const ready = new Promise<void>(r => { started = r; }); const cleanup = new Promise<void>(r => { release = r; });
	let observedAbort = false; const late: Parameters<DeliverEnvelope>[0][] = [];
	const cancel = directDispatch({}, { 'test.abort': async (_p, send, signal) => {
		aborted.registerDrain(cleanup); started();
		await new Promise<void>(r => { if (signal.aborted) r(); else signal.addEventListener('abort', () => r(), { once: true }); });
		observedAbort = true; send({ id: 0, stream: 'done', data: 'late' });
	} })({ kind: 'request', requestId: 'abort', method: 'test.abort', params: {}, stream: true, lifetime: aborted }, frame => late.push(frame));
	try {
		await ready; cancel(); await aborted.completed;
		assert.equal(observedAbort, true); assert.equal(aborted.signal.aborted, true); assert.deepEqual(late, []);
		let drained = false; void aborted.drained.then(() => { drained = true; }); await Promise.resolve(); assert.equal(drained, false, 'cleanup still owns the request drain');
	} finally { release(); await aborted.drained; }
});

test('in-daemon client: wait limit wording uses whole minutes or bounded seconds', () => {
	for (const [ms, text] of [[1800000, '30 minutes'], [60000, '1 minute'], [90000, '90 seconds'], [1500, '1 second'], [20000, '20 seconds'], [1000, '1 second'], [10, '1 second']] as const) assert.equal(waitText(ms), text);
});

test('the in-daemon client treats inherited-property methods as unknown', async () => {
	const client = createInDaemonClient({ 'x.ok': async () => 'ok' }, {});
	assert.equal(await client.request('x.ok', {}), 'ok');
	for (const method of ['toString', 'constructor', 'hasOwnProperty']) await assert.rejects(client.request(method, {}), { message: `unknown method: ${method}` });
});
