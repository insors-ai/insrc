/**
 * The step tool's scope: the pairing test and the resolution that the
 * start phase makes before it mints any state, and that the plan and
 * narrow phases make again from the intent in the state token.
 *
 * Stand-in readers -- no LMDB, no LLM.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { LoadedConnections } from '../../daemon/db/config.js';
import { ScopeKindTargetMismatchError } from '../../analyze/context/invariants.js';
import type { ScopeDeps } from '../../analyze/context/scope.js';
import { prepareDecompose } from '../../analyze/context/decomposer.js';
import type { AnalyzeTarget, ClassifiedIntent } from '../../shared/analyze-types.js';
import type { RegisteredRepo } from '../../shared/types.js';
import { stepScope } from '../analyze-step/scope.js';
import { decodeState, encodeState, STATE_VERSION, type StepStatePayload } from '../analyze-step/state.js';

const REPO = '/work/app';

function deps(): ScopeDeps & { calls: string[] } {
	const calls: string[] = [];
	return {
		calls,
		listRepos:           async () => { calls.push('listRepos'); return [{ path: REPO, status: 'ready' } as unknown as RegisteredRepo]; },
		findEntitiesByFile:  async () => { calls.push('findEntitiesByFile'); return []; },
		listEntitiesForRepo: async () => { calls.push('listEntitiesForRepo'); return []; },
		loadConnections:     async () => {
			calls.push('loadConnections');
			return { file: { connections: [] }, resolved: [], warnings: [] } as unknown as LoadedConnections;
		},
	};
}

/** The intent the start phase builds (src/mcp/analyze-step/phases/start.ts). */
function startIntent(target: AnalyzeTarget, repoPath = REPO): ClassifiedIntent {
	return {
		target,
		scope:     'M',
		focused:   true,
		focus:     'how does settlement work',
		scopeRef:  { kind: 'workspace', value: repoPath },
		reasoning: 'insrc_analyze_step invocation: how does settlement work',
	};
}

test('step tool start phase: resolved workspace scope, and the pairing test refusing a stand-in scope', async () => {
	// The workspace scope the start phase builds passes for EVERY kind of source.
	for (const target of ['code', 'docs', 'data', 'infra', 'generic'] as const) {
		const scope = await stepScope(startIntent(target), deps());
		assert.deepEqual(scope, { kind: 'workspace', value: REPO, repoPath: REPO, lookupPath: REPO }, target);
		// ... and the planning prompt it prepares from that scope names the repo.
		const turn = prepareDecompose(startIntent(target), scope).userTurn;
		assert.ok(turn.split('\n').includes(`Repo path: ${REPO}`), target);
	}

	// A stand-in scope the table refuses: a code request on a data connection.
	const d = deps();
	const refused: ClassifiedIntent = { ...startIntent('code'), scopeRef: { kind: 'connection', value: 'ledger-db' } };
	await assert.rejects(
		() => stepScope(refused, d),
		(err: unknown) => {
			assert.ok(err instanceof ScopeKindTargetMismatchError, `got ${(err as Error).name}`);
			assert.match(err.message, /scopeRef\.kind='connection' is incompatible with target='code'/);
			return true;
		},
	);
	// It is refused before the scope is resolved -- and so before the
	// start phase reaches the point where it mints its state.
	assert.deepEqual(d.calls, []);
});

test('step tool plan and narrow phases resolve the scope from a token that has no scope field', async () => {
	// A token as the start phase mints it: the intent, and no resolved scope.
	const payload: StepStatePayload = {
		version:        STATE_VERSION,
		runId:          'mcp-step-1',
		repoPath:       REPO,
		repoIndexedAt:  1_700_000_000_000,
		intent:         startIntent('code'),
		synthesizerKey: 'code',
		stage:          'awaiting_plan',
	} as unknown as StepStatePayload;
	const decoded = decodeState(encodeState(payload));
	assert.ok(!('scope' in (decoded as unknown as Record<string, unknown>)), 'the token carries no resolved scope');
	assert.ok(!('resolvedScope' in (decoded as unknown as Record<string, unknown>)));

	// What the plan and narrow phases do with it: resolve the scope
	// again from the intent, and run the lookups where it resolved to --
	// the same directory the token's repoPath names.
	const scope = await stepScope(decoded.intent, deps());
	assert.equal(scope.lookupPath, decoded.repoPath);
	assert.deepEqual(scope, { kind: 'workspace', value: REPO, repoPath: REPO, lookupPath: REPO });
});
