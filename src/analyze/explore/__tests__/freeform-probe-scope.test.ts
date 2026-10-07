/**
 * The free-form lookup is told what the request named.
 *
 * It used to build its own intent with a workspace scope on the
 * runner context's repo path, so a file, symbol or connection request
 * that fell to it lost the thing it named. It now takes the request's
 * resolved scope from the runner context.
 *
 * The tool loop is a stand-in -- no model, no store.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { _buildToolDepsForTest, type RunShaperToolLoopArgs } from '../../context/driver.js';
import type { ResolvedScope } from '../../context/scope.js';
import type { RunShapeInput } from '../../context/types.js';
import type { LLMProvider } from '../../../shared/types.js';
import { runFreeformProbe } from '../freeform-probe.js';
import type { Exploration, ExplorationRunnerContext } from '../types.js';

const REPO = '/work/app';
const FILE = `${REPO}/src/pay.ts`;

const LAYERS = { system: 's', focus: 'f', summary: 'sum', structure: 'st', surface: 'su', artefacts: 'a', upstream: 'u' };

function exploration(shaperId: string): Exploration {
	return {
		id: 'e1', type: 'freeform.probe', purpose: 'survey',
		params: { purpose: 'what does this file do', shaperId },
	} as unknown as Exploration;
}

function ctx(scope: ResolvedScope | undefined, repoPath: string): ExplorationRunnerContext {
	return {
		runId: 'r1', repoPath, closureRepos: [repoPath],
		readDep: () => undefined,
		...(scope !== undefined ? { scope } : {}),
	} as unknown as ExplorationRunnerContext;
}

/** Run the lookup with a stand-in loop; return what the loop was given. */
async function probe(scope: ResolvedScope | undefined, repoPath: string, shaperId = 'code'): Promise<RunShaperToolLoopArgs> {
	let seen: RunShaperToolLoopArgs | undefined;
	const out = await runFreeformProbe(exploration(shaperId), ctx(scope, repoPath), async (args) => {
		seen = args;
		return { rawBundle: LAYERS, toolCallCount: 4 } as never;
	});
	assert.equal(out.type, 'freeform.probe');
	assert.equal(out.toolCallCount, 4);
	assert.ok(seen !== undefined, 'the loop was called');
	return seen!;
}

/** The directory the real loop would run its tools in, for the scope it was handed. */
function loopPath(args: RunShaperToolLoopArgs): string {
	return _buildToolDepsForTest({
		runId: args.runId, shaperId: args.shaperId, invocationMode: args.invocationMode,
		scope: args.scope, provider: {} as unknown as LLMProvider,
	}).repoPath;
}

test('free-form lookup for a file-scope request builds a file intent and uses the resolved repo as the loop\'s path', async () => {
	// A file request whose plan was replaced by the free-form lookup:
	// the pipeline runs the lookups in the file's repo.
	const scope: ResolvedScope = { kind: 'file', value: FILE, repoPath: REPO, lookupPath: REPO, filePath: FILE };
	const args = await probe(scope, REPO);

	const intent = (args.inputs as RunShapeInput).intent;
	// The intent names the FILE -- it used to be a workspace scope on the repo.
	assert.deepEqual(intent.scopeRef, { kind: 'file', value: FILE });
	assert.equal(intent.focus, 'what does this file do');
	assert.equal(intent.target, 'code');
	// The loop is handed the resolved scope and runs in the repo.
	assert.equal(args.scope, scope);
	assert.equal(loopPath(args), REPO);

	// A symbol keeps its entity.
	const symbol: ResolvedScope = {
		kind: 'symbol', value: `${FILE}#settle`, repoPath: REPO, lookupPath: REPO,
		filePath: FILE, entityId: 'e-settle', entityName: 'settle',
	};
	const sArgs = await probe(symbol, REPO);
	assert.deepEqual((sArgs.inputs as RunShapeInput).intent.scopeRef, { kind: 'symbol', value: `${FILE}#settle` });
	assert.equal(sArgs.scope.entityId, 'e-settle');
	assert.equal(loopPath(sArgs), REPO);
});

test("free-form loop's path for a connection is the connection's repo", async () => {
	const scope: ResolvedScope = { kind: 'connection', value: 'ledger-db', repoPath: REPO, lookupPath: REPO, connectionId: 'ledger-db' };
	const args = await probe(scope, REPO, 'data');
	const intent = (args.inputs as RunShapeInput).intent;
	assert.deepEqual(intent.scopeRef, { kind: 'connection', value: 'ledger-db' });
	assert.equal(intent.target, 'data');
	assert.equal(loopPath(args), REPO);
	// Not the working directory, which is what a connection used to get.
	assert.notEqual(loopPath(args), process.cwd());
});

test('a module request keeps its own directory, and a bare repo path stands for a workspace scope', async () => {
	// A module: the loop runs in the module's directory, as before.
	const moduleDir = `${REPO}/src/billing`;
	const mod: ResolvedScope = { kind: 'module', value: moduleDir, repoPath: REPO, lookupPath: moduleDir };
	const mArgs = await probe(mod, moduleDir);
	assert.deepEqual((mArgs.inputs as RunShapeInput).intent.scopeRef, { kind: 'module', value: moduleDir });
	assert.equal(loopPath(mArgs), moduleDir);

	// No scope on the context (a caller that executes a plan on a bare
	// repo path): exactly what the lookup built before.
	const bare = await probe(undefined, REPO);
	assert.deepEqual((bare.inputs as RunShapeInput).intent.scopeRef, { kind: 'workspace', value: REPO });
	assert.deepEqual(bare.scope, { kind: 'workspace', value: REPO, repoPath: null, lookupPath: REPO });
	assert.equal(loopPath(bare), REPO);
});
