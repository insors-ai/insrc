/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Unit tests for the manifests.locate resource-kind derivation.
 *
 * resourceKindFromBody parses the indexed manifest body (Entity.body) to
 * report the REAL k8s `kind` / helm chart `name`, falling back to the filename
 * heuristic (inferResourceKind) when the body yields nothing. Pure functions —
 * no db, no filesystem, no render.
 *
 * Run: npx tsx --test src/analyze/explore/__tests__/manifests-locate.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { resourceKindFromBody, inferResourceKind } from '../manifests-locate.js';

const k8s = (kind: string): string => `apiVersion: v1\nkind: ${kind}\nmetadata:\n  name: x\n`;

test('k8s body kind wins over a misleading filename', () => {
	// filename says Deployment, body says Service — content must win.
	const body = k8s('Service');
	assert.equal(resourceKindFromBody('k8s/nginx-deployment.yaml', 'kubernetes', body), 'Service');
	// prove the filename heuristic would have guessed 'Deployment'
	assert.equal(inferResourceKind('k8s/nginx-deployment.yaml', 'kubernetes'), 'Deployment');
});

test('multi-doc manifest returns the FIRST doc kind', () => {
	const body = `${k8s('ConfigMap')}---\n${k8s('Secret')}`;
	assert.equal(resourceKindFromBody('k8s/multi.yaml', 'kubernetes', body), 'ConfigMap');
});

test('helm Chart.yaml returns the chart name; other helm files return undefined', () => {
	const chart = 'apiVersion: v2\nname: my-chart\nversion: 0.1.0\n';
	assert.equal(resourceKindFromBody('charts/web/Chart.yaml', 'helm', chart), 'my-chart');
	// a helm values.yaml is not a chart identity → undefined (caller falls back)
	assert.equal(resourceKindFromBody('charts/web/values.yaml', 'helm', 'replicaCount: 2\n'), undefined);
});

test('empty and unparseable bodies return undefined (caller falls back)', () => {
	assert.equal(resourceKindFromBody('k8s/api.yaml', 'kubernetes', ''), undefined);
	// invalid YAML — loadAll throws, caught internally
	assert.equal(resourceKindFromBody('k8s/api.yaml', 'kubernetes', 'kind: :::not: valid: {['), undefined);
});

test('non-k8s/helm families return undefined (family gate)', () => {
	const body = k8s('Deployment');   // even a k8s-looking body
	for (const fam of ['terraform', 'docker', 'ci', 'other'] as const) {
		assert.equal(resourceKindFromBody('some/file.yaml', fam, body), undefined, fam);
	}
});

test('a doc with a non-string / missing kind yields undefined', () => {
	assert.equal(resourceKindFromBody('k8s/a.yaml', 'kubernetes', 'apiVersion: v1\nkind: 42\n'), undefined);
	assert.equal(resourceKindFromBody('k8s/a.yaml', 'kubernetes', 'apiVersion: v1\nmetadata:\n  name: x\n'), undefined);
	// leading empty document then a real kind → the real kind
	assert.equal(resourceKindFromBody('k8s/a.yaml', 'kubernetes', `---\n---\n${k8s('Ingress')}`), 'Ingress');
});

test('inferResourceKind (fallback) still guesses from the filename', () => {
	assert.equal(inferResourceKind('k8s/redis-service.yaml', 'kubernetes'), 'Service');
	assert.equal(inferResourceKind('k8s/some-configmap.yaml', 'kubernetes'), 'Configmap');
	// non-k8s/helm family → undefined
	assert.equal(inferResourceKind('main.tf', 'terraform'), undefined);
});
