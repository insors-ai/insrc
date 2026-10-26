import assert from 'node:assert/strict';
import test from 'node:test';
import { admitConnectionProvider, assertConnectionProviderAdmission, connectionProviderPrivacyStatus } from '../../../shared/connection-provider.js';
import { sessionConnectionExecution, savedConnectionExecution, ConnectionExecutionError, runWithConnectionExecution } from '../../../shared/step-context.js';
import type { SessionConnectionExecution } from '../../../shared/step-context.js';
import { RequestLifetime } from '../../request-context.js';
import { buildShaperProvider, resolveRoleProvider, familyProvider, runWithRoutingContext } from '../../../analyze/context/shaper-provider.js';
import { createRoleRouter, resolveRole } from '../../../analyze/context/role-router.js';
import { dataAggregateReportRuntime } from '../../../analyze/runtimes/data/aggregate-report.js';
import { runAggregator } from '../../../analyze/runtimes/shared/aggregator.js';
import { runReadOnlyToolLoop, emitStructuredAnswer } from '../../../agent/read-only-tool-loop.js';
import { OllamaProvider } from '../../../agent/providers/ollama.js';
import { CliProvider } from '../../../agent/providers/cli-provider.js';
import { withStructuredRetry } from '../../../agent/providers/structured-output.js';
import { decompose } from '../../../analyze/context/decomposer.js';
import { synthesize } from '../../../analyze/context/synthesizer.js';
import { classify } from '../../../analyze/classifier/driver.js';
import type { AnalyzeConfig } from '../../../config/analyze.js';

function owner() {
	const lifetime = new RequestLifetime(); let now = 0;
	const execution = sessionConnectionExecution(Object.freeze({ lookupRoot: '/private/provider-fixture', daemonEpoch: 'provider-fixture', sessionHandle: 'opaque-owner' }), { bindingId: 'binding', audience: 'workbench-ui', controlGeneration: 1, lifetime, assertActive() { if (now >= 90000) throw Error('expired'); } });
	return { execution, lifetime, expire() { now = 90000; } };
}
function refusal(code = 'unsupported-temporary') { return (error: unknown) => error instanceof ConnectionExecutionError && error.code === code; }
const cfg: AnalyzeConfig = { shaperProvider: 'cli-claude', shaperProviderExplicit: true, shaperModel: 'claude-opus-5-5', shaperModelExplicit: true, shaper: { maxToolTurns: 3, structuredOutputRetries: 3, ollamaNumCtx: 32768, ollamaNumPredict: 8192 }, maxPlanDepth: { XS: 2, S: 3, M: 4, L: 5, XL: 6 }, tiering: { roleTiers: { 'design.contract.detail': 'cheap' }, coreFloor: 'core' } };

test('CM-S3-PROVIDER: actual factory/direct/injected/cache/loop/aggregate pre-send denial and expiry guards', async () => {
	const a = owner(); let reads = 0, sends = 0;
	const poison = new Proxy({}, { get(_target, key) { if (key === 'then') return undefined; reads++; throw Error('PRIVATE_PROVIDER_CANARY'); } });
	const args = new Proxy({ connectionExecution: a.execution }, { get(target, key) { if (key === 'connectionExecution') return target.connectionExecution; reads++; throw Error('PRIVATE_PROVIDER_CANARY'); } });
	try {
		// Warm the real role cache using Saved policy before trying the exact same role.
		const router = createRoleRouter(), selected = resolveRole('design.contract.detail', cfg), warm = router.resolveProviderForRole('design.contract.detail', cfg);
		assert.equal(selected.tier, 'core'); assert.equal(selected.clampedByFloor, true); assert.equal(warm.resolution.model, selected.model);
		assert.equal(router.resolveProviderForRole('design.contract.detail', cfg), warm);
		assert.equal(admitConnectionProvider(warm.provider), warm.provider);
		for (const candidate of [poison, warm.provider, { kind: 'ollama', model: selected.model, capabilities: { structuredOutput: true }, complete() { sends++; } }]) {
			for (const evidence of [undefined, { mode: 'verified-local', modelId: selected.model, evidenceDigest: 'copied-stale-digest' }, poison]) {
				assert.throws(() => admitConnectionProvider(candidate as never, a.execution, evidence), refusal());
			}
		}
		assert.throws(() => buildShaperProvider(poison as never, undefined, a.execution), refusal());
		assert.throws(() => familyProvider(poison as never, 'cli-codex', undefined, {}, a.execution), refusal());
		assert.throws(() => resolveRoleProvider('analyze.plan', poison as never, () => { sends++; return poison as never; }, a.execution), refusal());
		assert.throws(() => router.resolveProviderForRole('design.contract.detail', poison as never, undefined, a.execution), refusal());
		await runWithRoutingContext({ router }, async () => { assert.throws(() => resolveRoleProvider('design.contract.detail', cfg, undefined, a.execution), refusal()); });
		assert.throws(() => new OllamaProvider(undefined, undefined, undefined, a.execution), refusal());
		assert.throws(() => new CliProvider({ kind: 'codex', connectionExecution: a.execution }), refusal());
		for (const candidate of [Object.create(OllamaProvider.prototype) as OllamaProvider, Object.create(CliProvider.prototype) as CliProvider]) {
			await assert.rejects(candidate.complete(poison as never, { connectionExecution: a.execution }), refusal());
			await assert.rejects(candidate.completeStructured(poison as never, poison as never, { connectionExecution: a.execution }), refusal());
			await assert.rejects(candidate.runReviewSession('private', poison as never, { connectionExecution: a.execution } as never), refusal());
			if (candidate instanceof OllamaProvider) await assert.rejects(async () => { for await (const _chunk of candidate.stream(poison as never, { connectionExecution: a.execution })) sends++; }, refusal());
		}
		await assert.rejects(dataAggregateReportRuntime.execute(args as never), refusal());
		for (const invoke of [runAggregator, runReadOnlyToolLoop, emitStructuredAnswer, decompose, synthesize, classify]) await assert.rejects(async () => invoke(args as never), refusal());
		await assert.rejects(withStructuredRetry(async () => { sends++; return {}; }, () => { sends++; return { ok: true, value: {} }; }, 3, a.execution), refusal());
		// Missing policy beneath an actual bound request is loss, never a Saved retry.
		await runWithConnectionExecution(a.execution, async () => {
			assert.throws(() => buildShaperProvider(poison as never), refusal('session-expired'));
			await assert.rejects(Object.create(CliProvider.prototype).complete(poison), refusal('session-expired'));
		});
		assert.throws(() => admitConnectionProvider(poison as never, { ...a.execution, provider: { mode: 'verified-local', modelId: 'spoof', evidenceDigest: 'copied' } } as SessionConnectionExecution), refusal('session-expired'));
		a.expire(); assert.throws(() => assertConnectionProviderAdmission(a.execution), refusal('session-expired'));
		assert.equal(reads, 0); assert.equal(sends, 0);
		// Actual shared structured helper rechecks after the awaited attempt, before
		// validation or correction-note construction, even for a Saved request.
		const lifetime = new RequestLifetime(), saved = savedConnectionExecution({ lookupRoot: '/private/saved-provider', daemonEpoch: 'saved' }, lifetime, { emit() { } }); let calls = 0, validations = 0;
		await assert.rejects(withStructuredRetry(async () => { calls++; lifetime.abort(); return poison; }, () => { validations++; return { ok: false, errors: ['private'] }; }, 3, saved), refusal('session-expired'));
		assert.equal(calls, 1); assert.equal(validations, 0); lifetime.complete(); await lifetime.drained;
		const retryLifetime = new RequestLifetime(), retrySaved = savedConnectionExecution({ lookupRoot: '/private/saved-retry', daemonEpoch: 'saved' }, retryLifetime, { emit() { } }); let retryCalls = 0;
		await assert.rejects(withStructuredRetry(async () => { retryCalls++; return {}; }, () => { retryLifetime.abort(); return { ok: false, errors: ['private'] }; }, 3, retrySaved), refusal('session-expired')); assert.equal(retryCalls, 1); retryLifetime.complete(); await retryLifetime.drained;
		let typedCalls = 0; await assert.rejects(withStructuredRetry(async () => { typedCalls++; throw new ConnectionExecutionError('unsupported-temporary'); }, () => ({ ok: true, value: {} }), 3), refusal()); assert.equal(typedCalls, 1);
	} finally { a.lifetime.abort(); a.lifetime.complete(); await a.lifetime.drained; }
});

test('CM-S3-PROVIDER: actual admitted local Ollama no-persistence smoke; unavailable evidence is pending and admission stays refused', () => {
	// This is the required unavailable-evidence branch, NOT an actual-service pass.
	// No prompt is sent to the user's running service and no identity is admitted.
	assert.equal(connectionProviderPrivacyStatus.status, 'pending'); assert.equal(connectionProviderPrivacyStatus.mode, 'unsupported'); assert.ok(Object.isFrozen(connectionProviderPrivacyStatus));
	const a = owner(); try { assert.throws(() => admitConnectionProvider(Object.create(OllamaProvider.prototype), a.execution, { adapterTests: true, actualServiceSmoke: true }), refusal()); } finally { a.lifetime.abort(); a.lifetime.complete(); }
});
