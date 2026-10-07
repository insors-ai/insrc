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
import { handleAnalyzeStep } from '../analyze-step/handler.js';
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

// ---------------------------------------------------------------------------
// Through the tool's own start phase
// ---------------------------------------------------------------------------

function parseEnvelope<T>(envelope: { content: { text: string }[] }): T {
	return JSON.parse(envelope.content[0]!.text) as T;
}

test('the real start phase builds a workspace scope, for every kind of source, and its prompt names that directory', async () => {
	// The pairing test in the start phase can only ever be reached with
	// the scope the phase itself builds. That scope is pinned here: a
	// workspace on the resolved repo, which every row of the table
	// allows. If the start phase is later widened to another kind of
	// scope, this test is where the pairing has to be reconsidered.
	const repo = process.cwd();
	for (const target of ['code', 'docs', 'data', 'infra', 'generic'] as const) {
		const envelope = await handleAnalyzeStep({
			phase: 'start', repo, focus: `scope pin ${target} ${Date.now()}`, target, scope: 'S',
		});
		assert.notEqual(envelope.isError, true, `${target}: ${envelope.content[0]!.text.slice(0, 200)}`);
		const out = parseEnvelope<{ next: string; userTurn: string; state: string }>(envelope);
		assert.equal(out.next, 'emit_plan', target);

		// The token minted by the real start phase: an intent with a
		// workspace scope on the repo, and no resolved scope.
		const state = decodeState(out.state) as unknown as Record<string, unknown> & { intent: ClassifiedIntent; repoPath: string };
		assert.deepEqual(state.intent.scopeRef, { kind: 'workspace', value: repo }, target);
		assert.equal(state.intent.target, target);
		assert.ok(!('scope' in state) && !('resolvedScope' in state), 'the token carries no resolved scope');

		// The planning prompt the start phase prepared from the resolved
		// scope prints the directory the lookups will run in.
		assert.ok(out.userTurn.split('\n').includes(`Repo path: ${repo}`), `${target}: ${out.userTurn.slice(-300)}`);
		assert.ok(!out.userTurn.includes('\nScope: '), 'a workspace scope has no further line');

		// And that token drives the later phases' scope: resolved again
		// from its intent, to the directory its repoPath names.
		const again = await stepScope(state.intent, deps());
		assert.equal(again.lookupPath, state.repoPath, target);
	}
});
