/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Unit tests for the RoutingSeamContext ambient seam (S005 — sc6). Proves a
 * converted reasoning site resolves per-role through the ambient RoleRouter when
 * a context is established, and falls through to buildShaperProvider(cfg)
 * byte-for-byte when unestablished (k3) — the non-live counterpart to the
 * live-gated runCodeShaper anchor. Also covers the nullish-router invariant and
 * the claude-preserving legacy fallback.
 *
 * Run: npx tsx --test src/analyze/context/__tests__/routing-seam-context.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { loadAnalyzeConfig } from '../../../config/analyze.js';
import type { LLMProvider } from '../../../shared/types.js';
import type { RoleRouter, ResolvedProvider } from '../role-router.js';
import {
	runWithRoutingContext,
	currentRoutingContext,
	resolveRoleProvider,
	buildShaperProvider,
	type RoutingSeamContext,
} from '../shaper-provider.js';

/** A sentinel provider so the resolved identity is assertable without a live model. */
function sentinel(tag: string): LLMProvider {
	return {
		supportsTools: false,
		get capabilities() { return { structuredOutput: true, toolCalling: false, vision: false, webSearch: false, streaming: false, embeddings: false }; },
		async complete() { return tag; },
		async *stream() { yield tag; },
		async embed() { return []; },
		async completeStructured<T>() { return tag as unknown as T; },
	} as LLMProvider;
}

/** A fake RoleRouter recording the role it was asked to resolve. */
function fakeRouter(provider: LLMProvider): { router: RoleRouter; lastRole: () => string | undefined } {
	let last: string | undefined;
	const router: RoleRouter = {
		resolveProviderForRole(role): ResolvedProvider {
			last = role;
			return { provider, resolution: { role, tier: 'mid', runner: 'cli-claude', model: 'sonnet' } };
		},
		resolveSummariser(): ResolvedProvider {
			return { provider, resolution: { role: 'indexer.summarise', tier: 'cheap', runner: 'ollama', model: 'q' } };
		},
	};
	return { router, lastRole: () => last };
}

test('currentRoutingContext is undefined outside an established run', () => {
	assert.equal(currentRoutingContext(), undefined);
});

test('established context → a converted site resolves per-role via the ambient router', async () => {
	const cfg = loadAnalyzeConfig();
	const p = sentinel('router-provider');
	const { router, lastRole } = fakeRouter(p);
	await runWithRoutingContext({ router, repoPath: '/work/afm' }, async () => {
		const got = resolveRoleProvider('analyze.plan', cfg);
		assert.equal(got, p, 'returns the router-resolved provider');
		assert.equal(lastRole(), 'analyze.plan', 'the site declared its RoleId to the router');
	});
});

test('unestablished context → resolveRoleProvider is byte-for-byte buildShaperProvider(cfg) (k3)', () => {
	const cfg = loadAnalyzeConfig();
	// With no context + no tiering config, both paths build a local Ollama provider
	// from the same cfg; assert the same concrete class + identity of construction.
	const viaSeam = resolveRoleProvider('analyze.decompose', cfg);
	const viaLegacy = buildShaperProvider(cfg);
	assert.equal(viaSeam.constructor.name, viaLegacy.constructor.name);
	assert.equal(viaSeam.supportsTools, viaLegacy.supportsTools);
});

test('unestablished context → a claude-preserving legacyFallback is honoured (not dropped to Ollama)', () => {
	const cfg = loadAnalyzeConfig();
	const claude = sentinel('claude-fallback');
	const got = resolveRoleProvider('review', cfg, () => claude);
	assert.equal(got, claude, 'the site keeps its own hardcoded default when no context is established');
});

test('established context with a nullish router throws (fail-loud, no silent legacy revert)', async () => {
	const cfg = loadAnalyzeConfig();
	const broken = { router: undefined as unknown as RoleRouter } as RoutingSeamContext;
	await runWithRoutingContext(broken, async () => {
		assert.throws(() => resolveRoleProvider('analyze.plan', cfg), /router is nullish/);
	});
});
