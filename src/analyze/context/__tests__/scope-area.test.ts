/**
 * The area helpers, moved to the shared scope module, and scopeArea
 * (Story 65b643840a294422/s1, task t3).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
	docsAreaOf, graphRepoOf, inAreaOf, scopeArea, scopeAreaKey, type ResolvedScope,
} from '../scope.js';
import * as taskScope from '../../runtimes/shared/task-scope.js';

const REPO = '/repo';
const scope = (over: Partial<ResolvedScope> & Pick<ResolvedScope, 'kind'>): ResolvedScope => ({
	value: over.value ?? REPO, repoPath: REPO, lookupPath: REPO, ...over,
});
const WORKSPACE = scope({ kind: 'workspace' });
const REPO_SCOPE = scope({ kind: 'repo' });
const CONNECTION = scope({ kind: 'connection', connectionId: 'c1' });
const MODULE = scope({ kind: 'module', value: '/repo/src/pay', lookupPath: '/repo/src/pay' });
const MANIFEST = scope({ kind: 'manifest-dir', value: '/repo/infra', lookupPath: '/repo/infra' });
const FILE = scope({ kind: 'file', value: '/repo/src/a.ts', lookupPath: REPO, filePath: '/repo/src/a.ts' });
const SYMBOL = scope({ kind: 'symbol', value: '/repo/src/a.ts#f', lookupPath: REPO, filePath: '/repo/src/a.ts', entityId: 'e1', entityName: 'f' });

test('graphRepoOf, inAreaOf, docsAreaOf and scopeArea behave as pinned after the move; scopeArea is null for workspace, repo and connection scopes and the one entity for a symbol; scopeAreaKey differs per area', () => {
	// still importable from the old place, and the same functions
	assert.equal(taskScope.graphRepoOf, graphRepoOf);
	assert.equal(taskScope.inAreaOf, inAreaOf);
	assert.equal(taskScope.docsAreaOf, docsAreaOf);

	// graphRepoOf: the containing repository, the scope's own directory when none is known
	assert.equal(graphRepoOf(MODULE), REPO);
	assert.equal(graphRepoOf({ ...MODULE, repoPath: null }), '/repo/src/pay');

	// inAreaOf
	const ents = [
		{ id: 'e1', file: '/repo/src/a.ts' }, { id: 'e2', file: '/repo/src/a.ts' },
		{ id: 'e3', file: '/repo/src/pay/p.ts' }, { id: 'e4', file: '/repo/src/payments/q.ts' },
	];
	assert.deepEqual(ents.filter(inAreaOf(SYMBOL)).map(e => e.id), ['e1']);
	assert.deepEqual(ents.filter(inAreaOf(FILE)).map(e => e.id), ['e1', 'e2']);
	assert.deepEqual(ents.filter(inAreaOf(MODULE)).map(e => e.id), ['e3']);
	assert.equal(ents.filter(inAreaOf(WORKSPACE)).length, 4);

	// docsAreaOf
	assert.deepEqual(docsAreaOf(FILE), { file: '/repo/src/a.ts' });
	assert.deepEqual(docsAreaOf(MODULE), { directory: '/repo/src/pay' });
	assert.equal(docsAreaOf(WORKSPACE), undefined);

	// scopeArea
	assert.equal(scopeArea(WORKSPACE), null);
	assert.equal(scopeArea(REPO_SCOPE), null);
	assert.equal(scopeArea(CONNECTION), null);
	assert.deepEqual(scopeArea(MODULE), { kind: 'dir', path: '/repo/src/pay' });
	assert.deepEqual(scopeArea(MANIFEST), { kind: 'dir', path: '/repo/infra' });
	assert.equal(scopeArea({ ...MANIFEST, lookupPath: REPO }), null);
	assert.deepEqual(scopeArea(FILE), { kind: 'file', path: '/repo/src/a.ts' });
	assert.deepEqual(scopeArea(SYMBOL), { kind: 'symbol', entityId: 'e1', filePath: '/repo/src/a.ts' });
	assert.equal(scopeArea({ ...SYMBOL, entityId: undefined }), null);

	// scopeAreaKey differs per area
	const keys = [WORKSPACE, MODULE, MANIFEST, FILE, SYMBOL, { ...SYMBOL, entityId: 'e2' }].map(scopeAreaKey);
	assert.equal(keys[0], 'repo');
	assert.equal(new Set(keys).size, keys.length);
	assert.equal(scopeAreaKey(REPO_SCOPE), scopeAreaKey(WORKSPACE));
});
