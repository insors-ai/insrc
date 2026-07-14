/**
 * plans/exploration-based-context-build.md Phase 5. Unit tests for
 * the Phase 5 explorations' param validation + graceful-empty
 * paths. LMDB / DriverPool integration lives in a separate live
 * test; here we only exercise the fast-fail branches.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runDbTableDescribe } from '../db-table-describe.js';
import { runDbTablesList }    from '../db-tables-list.js';
import { runManifestsLocate } from '../manifests-locate.js';
import {
	classifyFamily,
	inferResourceKind,
	isCIPath,
	isHelmPath,
	isK8sPath,
} from '../manifests-locate.js';
import type { Exploration, ExplorationRunnerContext } from '../types.js';
import { permissiveIgnoreFilter } from '../../context/repo-ignore-filter.js';

const CTX: ExplorationRunnerContext = {
	runId:        'test-run',
	repoPath:     '/tmp/does-not-exist-phase5-root',
	closureRepos: ['/tmp/does-not-exist-phase5-root'],
	readDep:      () => undefined,
	ignoreFilter: permissiveIgnoreFilter(),
};

function mkExp(type: Exploration['type'], params: Record<string, unknown>): Exploration {
	return { id: 'e1', type, purpose: 'test', params };
}

// ---------------------------------------------------------------------------
// db.tables.list param validation
// ---------------------------------------------------------------------------

test('db.tables.list rejects empty params', async () => {
	await assert.rejects(
		() => runDbTablesList(mkExp('db.tables.list', {}), CTX),
		/connectionId is required/,
	);
});

test('db.tables.list rejects whitespace-only connectionId', async () => {
	await assert.rejects(
		() => runDbTablesList(mkExp('db.tables.list', { connectionId: '  ' }), CTX),
		/connectionId is required/,
	);
});

// ---------------------------------------------------------------------------
// db.table.describe param validation
// ---------------------------------------------------------------------------

test('db.table.describe rejects empty params', async () => {
	await assert.rejects(
		() => runDbTableDescribe(mkExp('db.table.describe', {}), CTX),
		/connectionId and params\.target are required/,
	);
});

test('db.table.describe rejects only-connectionId', async () => {
	await assert.rejects(
		() => runDbTableDescribe(mkExp('db.table.describe', { connectionId: 'x' }), CTX),
		/connectionId and params\.target are required/,
	);
});

// ---------------------------------------------------------------------------
// manifests.locate: param parsing is permissive (no required params)
// ---------------------------------------------------------------------------

test('manifests.locate returns empty output when repo has no indexed entities', async () => {
	// The context repo path doesn't exist; listEntitiesForRepo returns
	// an empty array and the runner emits notFoundNote instead of
	// throwing.
	const out = await runManifestsLocate(mkExp('manifests.locate', {}), CTX);
	assert.equal(out.type, 'manifests.locate');
	assert.equal(out.hits.length, 0);
	assert.match(out.notFoundNote, /No infra manifests indexed/);
});

// ---------------------------------------------------------------------------
// manifests.locate: family classifier
// ---------------------------------------------------------------------------

test('classifyFamily: Dockerfile -> docker', () => {
	assert.equal(classifyFamily('/repo/Dockerfile'), 'docker');
	assert.equal(classifyFamily('/repo/services/api/Dockerfile.prod'), 'docker');
});

test('classifyFamily: .tf -> terraform', () => {
	assert.equal(classifyFamily('/repo/infra/main.tf'), 'terraform');
	assert.equal(classifyFamily('/repo/vars.tfvars'), 'terraform');
});

test('classifyFamily: .github/workflows/*.yml -> ci', () => {
	assert.equal(classifyFamily('/repo/.github/workflows/build.yml'), 'ci');
});

test('classifyFamily: Chart.yaml -> helm', () => {
	assert.equal(classifyFamily('/repo/charts/redis/Chart.yaml'), 'helm');
});

test('classifyFamily: k8s/ path -> kubernetes', () => {
	assert.equal(classifyFamily('/repo/k8s/deployment.yaml'), 'kubernetes');
	assert.equal(classifyFamily('/repo/deployments/service.yaml'), 'kubernetes');
});

test('classifyFamily: plain yaml under repo root -> other', () => {
	assert.equal(classifyFamily('/repo/config.yaml'), 'other');
});

// ---------------------------------------------------------------------------
// manifests.locate: path helpers
// ---------------------------------------------------------------------------

test('isK8sPath: recognises the standard directories', () => {
	assert.equal(isK8sPath('/repo/k8s/deployment.yaml'), true);
	assert.equal(isK8sPath('/repo/kubernetes/svc.yaml'),  true);
	assert.equal(isK8sPath('/repo/manifests/x.yaml'),     true);
	assert.equal(isK8sPath('/repo/deploy/redis.yaml'),    true);
	assert.equal(isK8sPath('/repo/src/main.py'),          false);
});

test('isHelmPath: Chart.yaml + values.yaml + helm/ + charts/', () => {
	assert.equal(isHelmPath('/repo/charts/redis/Chart.yaml'),  true);
	assert.equal(isHelmPath('/repo/charts/redis/values.yaml'), true);
	assert.equal(isHelmPath('/repo/helm/postgres/x.yaml'),     true);
	assert.equal(isHelmPath('/repo/deploy/redis.yaml'),        false);
});

test('isCIPath: known CI file locations', () => {
	assert.equal(isCIPath('/repo/.github/workflows/build.yml'), true);
	assert.equal(isCIPath('/repo/.gitlab-ci.yml'),               true);
	assert.equal(isCIPath('/repo/Jenkinsfile'),                  true);
	assert.equal(isCIPath('/repo/build.yml'),                    false);
});

test('inferResourceKind: filename convention wins for kubernetes/helm', () => {
	assert.equal(inferResourceKind('/repo/k8s/nginx-deployment.yaml', 'kubernetes'), 'Deployment');
	assert.equal(inferResourceKind('/repo/k8s/redis-service.yaml',    'kubernetes'), 'Service');
	assert.equal(inferResourceKind('/repo/k8s/app-configmap.yaml',    'kubernetes'), 'Configmap');
});

test('inferResourceKind: undefined for non-kubernetes families', () => {
	assert.equal(inferResourceKind('/repo/main.tf', 'terraform'), undefined);
	assert.equal(inferResourceKind('/repo/Dockerfile', 'docker'), undefined);
});
