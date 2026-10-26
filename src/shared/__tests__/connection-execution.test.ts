import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ConnectionExecutionError, requireConnectionExecution, savedConnectionExecution, runInStepContext, currentStepContext } from '../step-context.js';
import type { ConnectionExecutionContext } from '../step-context.js';
import { analysisConnectionContext, savedAnalysisExecution } from '../../analyze/connection-access.js';

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

test('CM-S3-INVENTORY: production analysis entry installs saved authority and rejects forged policy before source access', async () => {
	const saved = savedAnalysisExecution('/repo');
	assert.equal(requireConnectionExecution(saved), saved);
	assert.throws(() => analysisConnectionContext('/repo', undefined as never), /session-expired/);
	assert.equal(analysisConnectionContext('/repo', saved), saved.connectionAccess);
	assert.throws(() => analysisConnectionContext('/other', saved), /session-expired/);
	const { dataDiscoveryConnectionsRuntime } = await import('../../analyze/runtimes/data/discovery-connections.js');
	const { dataConnectionResolver } = await import('../../analyze/runtimes/data/_shared.js');
	const previous = dataConnectionResolver.list;
	let reads = 0;
	dataConnectionResolver.list = async () => { reads++; return []; };
	try {
		await assert.rejects(() => dataDiscoveryConnectionsRuntime.execute({
			connectionExecution: { mode: 'session-memory', bindingId: 'forged' }, task: { params: {} },
		} as unknown as import('../../analyze/executor/types.js').TemplateExecuteArgs), /session-expired/);
		assert.equal(reads, 0);
	} finally { dataConnectionResolver.list = previous; }
});

test('CM-S3-INVENTORY: staged production executors refuse supplied unadmitted policy before loading state', async () => {
	const { executePlan, stepPlan } = await import('../../analyze/explore/executor.js');
	const { runShaper, runShaperToolLoop } = await import('../../analyze/context/driver.js');
	const { runExecutor } = await import('../../analyze/executor/walker.js');
	const { runAnalyze } = await import('../../analyze/orchestrator/driver.js');
	const { shaperFor } = await import('../../analyze/context/index.js');
	const { measureRequestScope, measureResolvedScope, measureDataSource } = await import('../../analyze/measure.js');
	const connectionExecution = { mode: 'session-memory', bindingId: 'forged' } as ConnectionExecutionContext;
	const entry = { connectionExecution };
	const calls = [
		() => executePlan(entry as Parameters<typeof executePlan>[0]),
		() => stepPlan(entry as Parameters<typeof stepPlan>[0]),
		() => runShaper(entry as Parameters<typeof runShaper>[0]),
		() => runShaperToolLoop(entry as Parameters<typeof runShaperToolLoop>[0]),
		() => runExecutor(entry as Parameters<typeof runExecutor>[0]),
		() => runAnalyze(entry as Parameters<typeof runAnalyze>[0]),
		() => runAnalyze({} as Parameters<typeof runAnalyze>[0], entry),
		() => runShaper({ opts: entry } as Parameters<typeof runShaper>[0]),
		() => shaperFor('classification').buildClassificationBundle({} as never, { ...entry, runId: 'refused-classification' }),
		() => shaperFor('run', 'data').buildRunBundle({} as never, { ...entry, runId: 'refused-run' }),
		() => shaperFor('task', 'data').buildTaskBundle({} as never, { ...entry, runId: 'refused-task' }),
		() => measureRequestScope({ kind: 'repo', value: '/not-read' }, 'code', undefined, entry),
		() => measureResolvedScope({} as Parameters<typeof measureResolvedScope>[0], 'code', undefined, entry),
		() => measureDataSource({ poolPath: '/not-read' }, undefined, entry),
	];
	for (const call of calls) await assert.rejects(call, (error: unknown) => error instanceof ConnectionExecutionError && error.code === 'session-expired');
});

test('CM-S3-INVENTORY: lost carrier in a bound call cannot become saved or enter a provider', async () => {
	const { runShaperToolLoop } = await import('../../analyze/context/driver.js');
	const { executePlan, stepPlan } = await import('../../analyze/explore/executor.js');
	const { shaperFor } = await import('../../analyze/context/index.js');
	const connectionExecution = { mode: 'session-memory', bindingId: 'server-bound-marker' } as ConnectionExecutionContext;
	await assert.rejects(() => runShaperToolLoop({} as Parameters<typeof runShaperToolLoop>[0]), /session-expired/);
	await runInStepContext({ cwd: '/repo', connectionExecution }, async () => {
		assert.throws(() => analysisConnectionContext('/repo', undefined as never), /session-expired/);
		assert.throws(() => savedAnalysisExecution('/repo'), /session-expired/);
		await assert.rejects(() => runShaperToolLoop({} as Parameters<typeof runShaperToolLoop>[0]), /session-expired/);
		await assert.rejects(() => executePlan({} as Parameters<typeof executePlan>[0]), /session-expired/);
		await assert.rejects(() => stepPlan({} as Parameters<typeof stepPlan>[0]), /session-expired/);
		await assert.rejects(() => shaperFor('run', 'data').buildRunBundle({} as never, { runId: 'lost' }), /session-expired/);
		await assert.rejects(runInStepContext({ cwd: '/shadowed' }, async () => analysisConnectionContext('/repo', undefined as never)), /session-expired/);
	});
	assert.equal(currentStepContext(), undefined);
	assert.equal(analysisConnectionContext('/unattached', savedAnalysisExecution('/unattached')).lookupRoot, '/unattached');
});
