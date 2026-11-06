/**
 * The scope check the step tool's start, plan and narrow phases all make
 * (stepScope): a path that does not exist, a path of the wrong kind, a '..'
 * path into another registered repository and a scope in another repository
 * are refused before anything is read, and a relative path resolves against
 * the call's repository.
 *
 * Stand-in readers and a real temporary directory tree -- no LMDB, no LLM.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { LoadedConnections } from '../../db/config.js';
import { ScopeNotFoundError, ScopeRepoMismatchError } from '../../../analyze/context/invariants.js';
import type { ScopeDeps } from '../../../analyze/context/scope.js';
import type { ClassifiedIntent } from '../../../shared/analyze-types.js';
import type { Entity, RegisteredRepo } from '../../../shared/types.js';
import { stepScope } from '../analyze-step/scope.js';

const ROOT = mkdtempSync(join(tmpdir(), 'insrc-start-request-'));
const A = join(ROOT, 'a');
const B = join(ROOT, 'b');
mkdirSync(join(A, 'src'), { recursive: true });
mkdirSync(join(B, 'src'), { recursive: true });
writeFileSync(join(A, 'src', 'x.ts'), '');
writeFileSync(join(B, 'src', 'y.ts'), '');

function deps(): ScopeDeps {
	return {
		listRepos: async () => [A, B].map(path => ({ path, status: 'ready' }) as unknown as RegisteredRepo),
		findEntitiesByFile:  async () => [],
		listEntitiesForRepo: async (repo) => [{ id: 'e1', repo } as unknown as Entity],
		loadConnections:     async () => ({ file: { connections: [] }, resolved: [], warnings: [] }) as unknown as LoadedConnections,
	};
}

function intent(kind: 'module' | 'file' | 'workspace', value: string): Pick<ClassifiedIntent, 'target' | 'scopeRef'> {
	return { target: 'code', scopeRef: { kind, value } };
}

test('the real start, plan and narrow scope check refuses a nonexistent path, a wrong path kind, a \'..\' path into another repository and a repository mismatch', async () => {
	// start, plan and narrow all call stepScope(intent, undefined, execution, repoPath): one hook for the three phases.
	await assert.rejects(stepScope(intent('module', join(A, 'src', 'nope')), deps(), undefined, A), ScopeNotFoundError);
	await assert.rejects(stepScope(intent('file', join(A, 'src', 'nope.ts')), deps(), undefined, A), ScopeNotFoundError);
	await assert.rejects(stepScope(intent('file', join(A, 'src')), deps(), undefined, A), ScopeNotFoundError);
	await assert.rejects(stepScope(intent('module', join(A, 'src', 'x.ts')), deps(), undefined, A), ScopeNotFoundError);
	// '..' enters the other registered repository: refused for the call's repository, accepted for the other's
	const sneaky = join(A, '..', 'b', 'src', 'y.ts');
	await assert.rejects(stepScope(intent('file', sneaky), deps(), undefined, A), ScopeRepoMismatchError);
	const own = await stepScope(intent('file', sneaky), deps(), undefined, B);
	assert.equal(own.filePath, join(B, 'src', 'y.ts'));
	// a module in the other repository
	await assert.rejects(stepScope(intent('module', join(B, 'src')), deps(), undefined, A), ScopeRepoMismatchError);
	// valid scopes pass, and a relative path resolves against the call's repository
	const mod = await stepScope(intent('module', join(A, 'src')), deps(), undefined, A);
	assert.equal(mod.lookupPath, join(A, 'src'));
	const rel = await stepScope(intent('module', 'src/./'), deps(), undefined, A);
	assert.equal(rel.lookupPath, join(A, 'src'));
	assert.equal(rel.value, join(A, 'src'));
	// a workspace scope is untouched
	const ws = await stepScope(intent('workspace', A), deps(), undefined, A);
	assert.equal(ws.lookupPath, A);
	// no expected repository (a caller that does not pass one): the repository comparison is skipped, the stat still runs
	await assert.rejects(stepScope(intent('module', join(A, 'src', 'nope')), deps()), ScopeNotFoundError);
});

test.after(() => { rmSync(ROOT, { recursive: true, force: true }); });
