import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ConnectionExecutionError, requireConnectionExecution, savedConnectionExecution } from '../step-context.js';
import type { ConnectionExecutionContext } from '../step-context.js';

test('CM-S3-INVENTORY: missing or forged execution never defaults to saved', () => {
	for (const value of [undefined, {}, { mode: 'saved' }, { mode: 'session-memory', bindingId: 'forged' }]) {
		assert.throws(() => requireConnectionExecution(value as ConnectionExecutionContext | undefined),
			(error: unknown) => error instanceof ConnectionExecutionError && error.code === 'session-expired');
	}
	assert.throws(() => savedConnectionExecution({ lookupRoot: '/repo', daemonEpoch: 'epoch', sessionHandle: 'forged' },
		{ signal: new AbortController().signal, registerDrain() {} }, { emit() {} }), /session-expired/);
});

test('CM-S3-INVENTORY: explicit saved tuple is immutable, nonserializable and cancellation-bound', () => {
	const controller = new AbortController();
	const access = { lookupRoot: '/repo', daemonEpoch: 'epoch' };
	const pending: PromiseLike<unknown>[] = [];
	const messages: unknown[] = [];
	const lifetime = { signal: controller.signal, registerDrain: (p: PromiseLike<unknown>) => { pending.push(p); } };
	const execution = savedConnectionExecution(access, lifetime, { emit: (_level, format) => { messages.push(format()); } });
	access.lookupRoot = '/changed';
	lifetime.signal = new AbortController().signal;
	assert.equal(execution.connectionAccess.lookupRoot, '/repo');
	assert.equal(requireConnectionExecution(execution), execution);
	assert.ok(Object.isFrozen(execution) && Object.isFrozen(execution.connectionAccess));
	assert.ok(Object.isFrozen(execution.lifetime) && Object.isFrozen(execution.revisions));
	assert.ok(Object.isFrozen(execution.provider) && Object.isFrozen(execution.diagnostics));
	assert.throws(() => JSON.stringify({ execution }), /upgrade-required/);
	const work = Promise.resolve(); execution.lifetime.registerDrain(work);
	assert.deepEqual(pending, [work]);
	execution.diagnostics.emit('info', () => 'saved-marker');
	assert.deepEqual(messages, ['saved-marker']);
	controller.abort();
	assert.throws(() => requireConnectionExecution(execution), /session-expired/);
});
