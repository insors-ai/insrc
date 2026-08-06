/**
 * S001 (sc1) — deterministic per-repo external-endpoint id (k2 dedup).
 * Epic E20260806914cbf5e:S001, task t3.
 *
 * Run: npx tsx --test src/indexer/parser/__tests__/external-endpoint-id.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { makeEntityId, makeExternalEndpointId } from '../base.js';

const REPO_A = '/repo/a';
const REPO_B = '/repo/b';

test('endpoint id reuses the makeEntityId hex-32 convention (file="" , kind="externalEndpoint")', () => {
	const id = makeExternalEndpointId(REPO_A, 'http', 'api.example.com/v1');
	assert.equal(id.length, 32);
	assert.equal(id, makeEntityId(REPO_A, '', 'externalEndpoint', 'http:api.example.com/v1'));
});

test('same (repo, protocol, target) => same id; differing repo => different id (per-repo dedup, k2)', () => {
	const a1 = makeExternalEndpointId(REPO_A, 'http', 'api.example.com/v1');
	const a2 = makeExternalEndpointId(REPO_A, 'http', 'api.example.com/v1');
	const b1 = makeExternalEndpointId(REPO_B, 'http', 'api.example.com/v1');
	assert.equal(a1, a2, 'two call-sites to one target+protocol in one repo dedup to one id');
	assert.notEqual(a1, b1, 'same target in two repos yields two distinct ids');
});

test('protocol participates in identity: same target, different protocol => different id', () => {
	const http = makeExternalEndpointId(REPO_A, 'http', 'svc.example.com');
	const rpc = makeExternalEndpointId(REPO_A, 'rpc', 'svc.example.com');
	assert.notEqual(http, rpc);
});

test('unresolved endpoint (target="") derives its id from rawExpression, distinct from a resolved same-protocol endpoint', () => {
	const unresolved = makeExternalEndpointId(REPO_A, 'http', '', '`${cfg.baseUrl}/users`');
	const resolved = makeExternalEndpointId(REPO_A, 'http', 'api.example.com/users');
	assert.equal(unresolved.length, 32);
	assert.notEqual(unresolved, resolved);
	// deterministic on the raw expression
	assert.equal(unresolved, makeExternalEndpointId(REPO_A, 'http', '', '`${cfg.baseUrl}/users`'));
});
