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
import { prepareScope } from '../../../analyze/context/driver.js';
import { ScopeNotFoundError, ScopeRepoMismatchError } from '../../../analyze/context/invariants.js';
import type { ScopeDeps } from '../../../analyze/context/scope.js';
import type { RunShapeInput } from '../../../analyze/context/types.js';
import type { Entity, RegisteredRepo } from '../../../shared/types.js';
import { oneShotRunParams } from '../analyze-oneshot.js';

const ROOT = mkdtempSync(join(tmpdir(), 'insrc-oneshot-handler-'));
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

test.after(() => { rmSync(ROOT, { recursive: true, force: true }); });
