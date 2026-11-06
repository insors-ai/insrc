/**
 * validateRequestScope and the canonical-path rule (Story
 * 65b643840a294422/s1, task t4).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Entity, RegisteredRepo } from '../../../shared/types.js';
import { ScopeNotFoundError, ScopeRepoMismatchError } from '../invariants.js';
import {
	canonicalPath, resolveScope, validateRequestScope,
	type ResolvedScope, type ScopeCheckDeps, type ScopeDeps,
} from '../scope.js';

const A = '/work/a';
const B = '/work/b';

const fsOf = (files: readonly string[], dirs: readonly string[]): ScopeCheckDeps => ({
	async kindOfPath(path) {
		return files.includes(path) ? 'file' : dirs.includes(path) ? 'directory' : 'missing';
	},
});
const FS = fsOf(['/work/a/src/x.ts', '/work/b/src/y.ts'], ['/work/a', '/work/a/src', '/work/a/empty', '/work/b', '/work/b/src']);

function deps(): ScopeDeps {
	const repos = [A, B].map(path => ({ path, status: 'ready' }) as unknown as RegisteredRepo);
	return {
		listRepos:           async () => repos,
		findEntitiesByFile:  async file => [{ id: 'e1', kind: 'function', name: 'f', file, startLine: 1 } as unknown as Entity],
		listEntitiesForRepo: async () => [{ id: 'e1' } as unknown as Entity],
		loadConnections:     async () => ({ connections: [], errors: [] }) as never,
		repoHasAnyEntity:    async () => true,
	};
}

const resolve = (kind: 'file' | 'module' | 'manifest-dir' | 'symbol' | 'repo' | 'workspace', value: string) =>
	resolveScope({ kind, value }, deps());

test('validateRequestScope refuses a nonexistent path, a wrong path kind and a scope in another registered repository, accepts an existing empty directory, leaves workspace, repo and connection scopes to the existing checks, and resolves \'..\' and equivalent spellings to one canonical path', async () => {
	// nonexistent path, inside an indexed repository
	await assert.rejects(validateRequestScope(await resolve('file', `${A}/src/nope.ts`), A, FS), ScopeNotFoundError);
	await assert.rejects(validateRequestScope(await resolve('module', `${A}/nope`), A, FS), /not there/);
	await assert.rejects(validateRequestScope(await resolve('manifest-dir', `${A}/nope`), A, FS), ScopeNotFoundError);

	// wrong path kind
	await assert.rejects(validateRequestScope(await resolve('file', `${A}/src`), A, FS), /not a file/);
	await assert.rejects(validateRequestScope(await resolve('module', `${A}/src/x.ts`), A, FS), /not a directory/);

	// another registered repository
	await assert.rejects(validateRequestScope(await resolve('file', `${B}/src/y.ts`), A, FS), ScopeRepoMismatchError);
	await assert.rejects(validateRequestScope(await resolve('module', `${B}/src`), A, FS), ScopeRepoMismatchError);

	// an existing empty directory is a valid empty area; so are existing files and directories of the repository
	await validateRequestScope(await resolve('module', `${A}/empty`), A, FS);
	await validateRequestScope(await resolve('file', `${A}/src/x.ts`), A, FS);
	await validateRequestScope(await resolve('module', `${A}/src`), undefined, FS);

	// workspace, repo and connection scopes are left to the existing checks (no stat, no comparison)
	const never = fsOf([], []);
	await validateRequestScope(await resolve('workspace', '/not/anywhere'), A, never);
	await validateRequestScope(await resolve('repo', B), A, never);
	await validateRequestScope({ kind: 'connection', value: 'c1', repoPath: B, lookupPath: B, connectionId: 'c1' } as ResolvedScope, A, never);

	// '..' and equivalent spellings are one canonical path, used by the repository choice, the stat and the filter
	assert.equal(canonicalPath('/work/a/../b/src/y.ts'), '/work/b/src/y.ts');
	assert.equal(canonicalPath('/work/a/src/'), '/work/a/src');
	assert.equal(canonicalPath('/work//a/./src'), '/work/a/src');
	assert.equal(canonicalPath('rel/../x'), 'rel/../x');
	const sneaky = await resolve('file', `${A}/../b/src/y.ts`);
	assert.equal(sneaky.repoPath, B);
	assert.equal(sneaky.filePath, `${B}/src/y.ts`);
	await assert.rejects(validateRequestScope(sneaky, A, FS), ScopeRepoMismatchError);
	await validateRequestScope(sneaky, B, FS);
	const spelled = await resolve('module', `${A}/src/`);
	assert.equal(spelled.lookupPath, `${A}/src`);
	assert.equal(spelled.value, `${A}/src`);
	assert.deepEqual(await resolve('module', `${A}/./src`), spelled);
	assert.deepEqual(await resolve('module', `${A}//src/../src`), spelled);
	const sym = await resolve('symbol', `${A}/../b/src/y.ts#f`);
	assert.equal(sym.filePath, `${B}/src/y.ts`);
	assert.equal(sym.repoPath, B);
	await assert.rejects(validateRequestScope(sym, A, FS), ScopeRepoMismatchError);

	// a registered repository nested in the call's repository is another repository
	const nested = { kind: 'module', value: `${A}/pkg`, repoPath: `${A}/pkg`, lookupPath: `${A}/pkg` } as ResolvedScope;
	await assert.rejects(validateRequestScope(nested, A, fsOf([], [`${A}/pkg`])), ScopeRepoMismatchError);

	// a relative path has no canonical absolute spelling, so it is refused
	const relative = { kind: 'module', value: 'src/./x', repoPath: null, lookupPath: 'src/./x' } as ResolvedScope;
	await assert.rejects(validateRequestScope(relative, A, never), ScopeNotFoundError);
});
