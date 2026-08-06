/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * sc2 (E20260806914cbf5e:S002) — pure-core + parser unit tests (t1/t2/t3).
 * No graph/fs fixtures: resolveAgainst is pure over an in-memory ConfigSourceMap
 * and the parsers are pure over source text.
 *
 * Run: npx tsx --test src/indexer/target-resolution/__tests__/core-and-parsers.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { ConfigSourceLayer, ResolvedTarget } from '../../../shared/types.js';
import type { ConfigSourceMap } from '../types.js';
import { resolveAgainst } from '../resolver.js';
import {
	parseEnvFile,
	parseDockerfile,
	parseComposeYaml,
	parseK8sManifest,
	parseLocalConfig,
	buildConfigSourceMap,
	mergeConfigEntries,
} from '../config-sources.js';

/** Build a ConfigSourceMap from (key,value,layer) tuples. */
function mapOf(...rows: Array<[string, string, ConfigSourceLayer]>): ConfigSourceMap {
	return mergeConfigEntries(rows.map(([key, value, layer]) => ({ key, value, layer })));
}

// ---------------------------------------------------------------------------
// t1 — type surface
// ---------------------------------------------------------------------------

test('t1: ResolvedTarget discriminates on `resolved`; ConfigSourceLayer has the four members', () => {
	const ok: ResolvedTarget = { resolved: true, protocol: 'http', identity: 'api.example.com' };
	const no: ResolvedTarget = { resolved: false, rawExpression: '${X}' };
	assert.equal(ok.resolved === true ? ok.identity : 'x', 'api.example.com');
	assert.equal(no.resolved === false ? no.rawExpression : 'x', '${X}');
	const layers: ConfigSourceLayer[] = ['k8s', 'docker', 'envFile', 'localConfig'];
	assert.deepEqual(layers, ['k8s', 'docker', 'envFile', 'localConfig']);
});

// ---------------------------------------------------------------------------
// t3 — pure resolution core
// ---------------------------------------------------------------------------

test('t3: a concrete literal resolves true with identity=the literal (no map lookup)', () => {
	const r = resolveAgainst(new Map(), 'http', 'https://api.example.com/v1');
	assert.deepEqual(r, { resolved: true, protocol: 'http', identity: 'https://api.example.com/v1' });
});

test('t3: an interpolation referencing a key present only in localConfig resolves from the default', () => {
	const map = mapOf(['API_HOST', 'api.example.com', 'localConfig']);
	assert.deepEqual(resolveAgainst(map, 'http', '${API_HOST}/v1'), {
		resolved: true, protocol: 'http', identity: 'api.example.com/v1',
	});
	// $VAR form too
	assert.deepEqual(resolveAgainst(map, 'http', '$API_HOST'), {
		resolved: true, protocol: 'http', identity: 'api.example.com',
	});
});

test('t3: a two-key interpolation with one missing key => {resolved:false} (no partial pin)', () => {
	const map = mapOf(['HOST', 'api.example.com', 'envFile']);
	assert.deepEqual(resolveAgainst(map, 'http', '${HOST}${PORT}'), {
		resolved: false, rawExpression: '${HOST}${PORT}',
	});
});

test('t3: a missing key => unresolved', () => {
	assert.deepEqual(resolveAgainst(new Map(), 'messaging', '${TOPIC}'), {
		resolved: false, rawExpression: '${TOPIC}',
	});
});

test('t3: a cyclic interpolation chain terminates and returns unresolved', () => {
	const map = mapOf(['A', '${B}', 'envFile'], ['B', '${A}', 'envFile']);
	assert.deepEqual(resolveAgainst(map, 'http', '${A}'), { resolved: false, rawExpression: '${A}' });
});

test('t3: a deep (nested) chain that terminates resolves to the final literal', () => {
	const map = mapOf(['A', '${B}', 'envFile'], ['B', '${C}', 'envFile'], ['C', 'final.example.com', 'k8s']);
	assert.deepEqual(resolveAgainst(map, 'rpc', '${A}'), {
		resolved: true, protocol: 'rpc', identity: 'final.example.com',
	});
});

test('t3: protocol is carried through unchanged for http/messaging/rpc (no shape validation)', () => {
	const map = mapOf(['T', 'orders.topic', 'k8s']);
	for (const p of ['http', 'messaging', 'rpc'] as const) {
		const r = resolveAgainst(map, p, '${T}');
		assert.deepEqual(r, { resolved: true, protocol: p, identity: 'orders.topic' });
	}
});

test('t3: precedence via resolveAgainst — k8s beats envFile beats localConfig; k8s beats docker', () => {
	const all = mapOf(
		['H', 'from-local', 'localConfig'],
		['H', 'from-env', 'envFile'],
		['H', 'from-docker', 'docker'],
		['H', 'from-k8s', 'k8s'],
	);
	assert.equal((resolveAgainst(all, 'http', '${H}') as { identity: string }).identity, 'from-k8s');

	const envVsLocal = mapOf(['H', 'from-local', 'localConfig'], ['H', 'from-env', 'envFile']);
	assert.equal((resolveAgainst(envVsLocal, 'http', '${H}') as { identity: string }).identity, 'from-env');

	const k8sVsDocker = mapOf(['H', 'from-docker', 'docker'], ['H', 'from-k8s', 'k8s']);
	assert.equal((resolveAgainst(k8sVsDocker, 'http', '${H}') as { identity: string }).identity, 'from-k8s');
});

// ---------------------------------------------------------------------------
// t2 — per-source parsers
// ---------------------------------------------------------------------------

test('t2: .env parser — key=value, quoted, comments, export, malformed line skipped', () => {
	const entries = parseEnvFile([
		'# a comment',
		'',
		'API_HOST=api.example.com',
		'PORT="8080"',
		"NAME='svc'",
		'export EXPORTED=yes',
		'MALFORMED_NO_EQ',
	].join('\n'));
	assert.deepEqual(entries, [
		{ key: 'API_HOST', value: 'api.example.com', layer: 'envFile' },
		{ key: 'PORT', value: '8080', layer: 'envFile' },
		{ key: 'NAME', value: 'svc', layer: 'envFile' },
		{ key: 'EXPORTED', value: 'yes', layer: 'envFile' },
	]);
});

test('t2: Dockerfile ENV parser — KEY=VALUE (multi) + legacy KEY VALUE, tagged docker', () => {
	const entries = parseDockerfile([
		'FROM node:20',
		'ENV API_HOST=api.example.com PORT=8080',
		'ENV LEGACY_KEY legacy value here',
		'RUN echo hi',
	].join('\n'));
	assert.deepEqual(entries, [
		{ key: 'API_HOST', value: 'api.example.com', layer: 'docker' },
		{ key: 'PORT', value: '8080', layer: 'docker' },
		{ key: 'LEGACY_KEY', value: 'legacy value here', layer: 'docker' },
	]);
});

test('t2: docker-compose parser — environment map + list forms, tagged docker', () => {
	const map = parseComposeYaml([
		'services:',
		'  web:',
		'    environment:',
		'      API_HOST: api.example.com',
		'      PORT: 8080',
		'  worker:',
		'    environment:',
		'      - QUEUE=orders',
	].join('\n'));
	assert.ok(map.some(e => e.key === 'API_HOST' && e.value === 'api.example.com' && e.layer === 'docker'));
	assert.ok(map.some(e => e.key === 'PORT' && e.value === '8080' && e.layer === 'docker'));
	assert.ok(map.some(e => e.key === 'QUEUE' && e.value === 'orders' && e.layer === 'docker'));
});

test('t2: k8s manifest parser — container env + ConfigMap data (multi-doc), tagged k8s, never kubectl', () => {
	const entries = parseK8sManifest([
		'apiVersion: v1',
		'kind: ConfigMap',
		'metadata: { name: cfg }',
		'data:',
		'  DB_HOST: db.example.com',
		'---',
		'apiVersion: apps/v1',
		'kind: Deployment',
		'spec:',
		'  template:',
		'    spec:',
		'      containers:',
		'        - name: app',
		'          env:',
		'            - name: API_HOST',
		'              value: api.example.com',
	].join('\n'));
	assert.ok(entries.some(e => e.key === 'DB_HOST' && e.value === 'db.example.com' && e.layer === 'k8s'));
	assert.ok(entries.some(e => e.key === 'API_HOST' && e.value === 'api.example.com' && e.layer === 'k8s'));
});

test('t2: unparseable YAML is skipped without throwing', () => {
	assert.deepEqual(parseK8sManifest('key: : : not valid : yaml\n  - broken'), []);
	assert.deepEqual(parseComposeYaml(': : bad'), []);
});

test('t2: localConfig parser — flat JSON + key=value/key: value lines, tagged localConfig', () => {
	assert.deepEqual(parseLocalConfig('{"API_HOST":"api.example.com","PORT":8080,"nested":{"x":1}}'), [
		{ key: 'API_HOST', value: 'api.example.com', layer: 'localConfig' },
		{ key: 'PORT', value: '8080', layer: 'localConfig' },
	]);
	assert.deepEqual(parseLocalConfig('# c\nAPI_HOST = api.example.com\nPORT: 8080'), [
		{ key: 'API_HOST', value: 'api.example.com', layer: 'localConfig' },
		{ key: 'PORT', value: '8080', layer: 'localConfig' },
	]);
});

test('t2: buildConfigSourceMap — dispatch by filename + total precedence winner per key', () => {
	const map = buildConfigSourceMap([
		{ path: '/r/.env', text: 'H=from-env' },
		{ path: '/r/Dockerfile', text: 'ENV H=from-docker' },
		{ path: '/r/deployment.yaml', text: 'kind: ConfigMap\ndata:\n  H: from-k8s' },
		{ path: '/r/app.json', text: '{"H":"from-local"}' },
	]);
	assert.deepEqual(map.get('H'), { value: 'from-k8s', layer: 'k8s' });
});
