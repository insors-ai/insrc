/**
 * The one-shot tool's scope check: oneShotRunParams hands the call's
 * repository to the run, the run RPC parser keeps it, and prepareScope (the
 * one resolver the context builder's run mode uses) refuses the same invalid
 * scopes as the step tool.
 *
 * Stand-in readers and a real temporary directory tree -- no LMDB, no LLM.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { LoadedConnections } from '../../db/config.js';
import { closeGraphStore, setGraphStorePath } from '../../../db/graph/store.js';
import { addRepo } from '../../../db/repos.js';
import { upsertEntities } from '../../../db/entities.js';
import { buildRun } from '../../analyze-rpc.js';
import { runAnalyzeOneShot } from '../analyze-oneshot.js';
import '../../../workflow/__tests__/helpers/converted-repos.js';
import { prepareScope } from '../../../analyze/context/driver.js';
import { ScopeNotFoundError, ScopeRepoMismatchError } from '../../../analyze/context/invariants.js';
import type { ScopeDeps } from '../../../analyze/context/scope.js';
import type { RunShapeInput } from '../../../analyze/context/types.js';
import type { Entity, RegisteredRepo } from '../../../shared/types.js';
import { oneShotRunParams } from '../analyze-oneshot.js';

const ROOT = mkdtempSync(join(tmpdir(), 'insrc-oneshot-handler-'));
setGraphStorePath(join(ROOT, 'graph.lmdb'));
const A = join(ROOT, 'a');
const B = join(ROOT, 'b');
mkdirSync(join(A, 'src'), { recursive: true });
mkdirSync(join(B, 'src'), { recursive: true });
writeFileSync(join(B, 'src', 'y.ts'), '');

function deps(): ScopeDeps {
	return {
		listRepos: async () => [A, B].map(path => ({ path, status: 'ready' }) as unknown as RegisteredRepo),
		findEntitiesByFile:  async () => [],
		listEntitiesForRepo: async (repo) => [{ id: 'e1', repo } as unknown as Entity],
		loadConnections:     async () => ({ file: { connections: [] }, resolved: [], warnings: [] }) as unknown as LoadedConnections,
	};
}

function input(kind: 'module' | 'file', value: string, expectedRepo: string | undefined): RunShapeInput {
	return {
		intent: { target: 'code', focused: true, focus: 'q', scopeRef: { kind, value }, reasoning: 'r' },
		...(expectedRepo !== undefined ? { expectedRepo } : {}),
	};
}

test('the real one-shot handler and buildRun refuse the same invalid scopes through prepareScope with the repository from oneShotRunParams', async () => {
	// the repository travels with the run
	const params = oneShotRunParams({ focus: 'q' }, A, 'run-1');
	assert.equal(params.expectedRepo, A);

	// prepareScope is the resolver the run mode uses; it makes the same checks as the step tool
	await assert.rejects(prepareScope('run', input('module', join(A, 'src', 'nope'), A), deps()), ScopeNotFoundError);
	await assert.rejects(prepareScope('run', input('file', join(A, 'src'), A), deps()), ScopeNotFoundError);
	const sneaky = join(A, '..', 'b', 'src', 'y.ts');
	await assert.rejects(prepareScope('run', input('file', sneaky, A), deps()), ScopeRepoMismatchError);
	const own = await prepareScope('run', input('file', sneaky, B), deps());
	assert.equal(own.filePath, join(B, 'src', 'y.ts'));
	const rel = await prepareScope('run', input('module', 'src/./', A), deps());
	assert.equal(rel.lookupPath, join(A, 'src'));
});


test('runAnalyzeOneShot hands the call\'s repository to the run, and the real buildRun refuses a nonexistent path, a wrong path kind and a raw \'..\' path into another registered repository before any read', async () => {
	for (const repo of [A, B]) {
		await addRepo(null, { path: repo, name: repo, addedAt: '2026-01-01T00:00:00.000Z', status: 'ready' });
		await upsertEntities(null, [{ id: `e-${repo}`, repo, file: join(repo, 'src', 'y.ts'), kind: 'function', name: 'fn', language: 'typescript', startLine: 1, endLine: 2 } as unknown as Entity]);
	}
	// the tool: the run it dispatches carries the repository
	const seen: unknown[] = [];
	const result = await runAnalyzeOneShot({ focus: 'q', repo: A }, {
		buildRun: async (params) => { seen.push(params); return { ok: false, error: { code: 'internal-error', message: 'stop' } } as never; },
	});
	assert.equal(result.isError, true);
	assert.equal((seen[0] as { expectedRepo?: string }).expectedRepo, A);

	// the real tool and the real buildRun, with a structured request that names an invalid scope
	const viaTool = async (kind: 'module' | 'file', value: string) => runAnalyzeOneShot({ request: { question: 'q', scopeRef: { kind, value } }, repo: A });
	for (const [kind, value, code] of [
		['module', `${A}/src/nope`, 'scope-not-found'],
		['file', `${A}/src`, 'scope-not-found'],
		['file', `${A}/../b/src/y.ts`, 'scope-repo-mismatch'],
	] as const) {
		const refused = await viaTool(kind, value);
		assert.equal(refused.isError, true, value);
		assert.match(refused.content[0]!.text, new RegExp(code), value);
	}

	// the real buildRun with that repository: an invalid scope is refused with its code
	const run = async (kind: 'module' | 'file', value: string) => buildRun({
		runId: `req-${kind}`, expectedRepo: A,
		intent: { target: 'code', focused: true, focus: 'q', scopeRef: { kind, value }, reasoning: 'r' },
	}) as Promise<{ ok: boolean; error?: { code: string; message: string } }>;
	const missing = await run('module', `${A}/src/nope`);
	assert.equal(missing.ok, false);
	assert.equal(missing.error?.code, 'scope-not-found');
	assert.equal((await run('file', `${A}/src`)).error?.code, 'scope-not-found');
	// a raw string: the '..' reaches buildRun unnormalised
	const sneaky = await run('file', `${A}/../b/src/y.ts`);
	assert.equal(sneaky.error?.code, 'scope-repo-mismatch');
});

test.after(async () => { await closeGraphStore(); rmSync(ROOT, { recursive: true, force: true }); });
