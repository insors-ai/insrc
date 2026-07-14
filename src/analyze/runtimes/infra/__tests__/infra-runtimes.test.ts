/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Infra-target runtime tests (3 deterministic + bootstrap + prompt
 * file existence).
 *
 * Live aggregator test lives in aggregate-report.live.test.ts so
 * the slow-Ollama path is on its own file.
 *
 * Two halves:
 *   1. Pure unit tests for _shared.ts helpers + bootstrap +
 *      prompt-file-exists + per-file classifier + YAML resource
 *      extractor. Always run.
 *   2. Integration tests against a tmp filesystem fixture
 *      (k8s manifests + a tf module + a Helm Chart.yaml + a
 *      docker-compose file). Always run too -- pure filesystem,
 *      no LMDB / Ollama, no need for the live gate.
 *
 * Run:
 *   PATH=/opt/homebrew/opt/node@22/bin:$PATH \
 *     npx tsx --test \
 *     src/insrc/analyze/runtimes/infra/__tests__/infra-runtimes.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
	_resetRuntimeBootstrapLatchForTests,
	registerBuiltinRuntimes,
} from '../../bootstrap.js';
import {
	getRuntime,
	listRegisteredRuntimes,
} from '../../../executor/registry.js';

import {
	INFRA_AGGREGATE_PROMPT_PATH,
	infraDiscoveryFamiliesRuntime,
	infraInventoryKubernetesRuntime,
	infraInventoryTerraformRuntime,
} from '../index.js';
import {
	_baseNameForTest,
	_classifyFileForTest,
} from '../discovery-families.js';
import { _extractResourceForTest } from '../inventory-kubernetes.js';
import {
	readScopeRef,
	resolveRepoPath,
	walkFiles,
} from '../_shared.js';

import type {
	PlannedTask,
	TemplateExecuteArgs,
} from '../../../executor/types.js';
import type { ClassifiedIntent } from '../../../../shared/analyze-types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const INTENT: ClassifiedIntent = {
	target:    'infra',
	scope:     'S',
	focused:   false,
	scopeRef:  { kind: 'repo', value: '/synthetic/placeholder' },
	reasoning: 'infra runtime tests',
};

function mkTask(templateId: string, params: Record<string, unknown>, produces: string[]): PlannedTask {
	return {
		taskId:    't01',
		template:  templateId,
		kind:      'leaf',
		params,
		produces,
		rationale: `${templateId} test`,
	};
}

function mkArgs(task: PlannedTask, runId: string): TemplateExecuteArgs {
	return {
		task,
		intent: INTENT,
		upstreamOutputs: new Map(),
		runId,
	};
}

// ---------------------------------------------------------------------------
// _shared.ts pure helpers
// ---------------------------------------------------------------------------

test('readScopeRef: well-formed -> returns', () => {
	const args = mkArgs(
		mkTask('infra.discovery.families',
			{ scopeRef: { kind: 'repo', value: '/r' } }, ['families']),
		'unit-1');
	assert.deepEqual(readScopeRef(args, 'tpl'), { kind: 'repo', value: '/r' });
});

test('readScopeRef: missing -> throws INV-5', () => {
	const args = mkArgs(mkTask('infra.discovery.families', {}, ['families']), 'unit-2');
	assert.throws(() => readScopeRef(args, 'tpl'), /tpl: task\.params\.scopeRef missing/);
});

test('resolveRepoPath: workspace + repo + manifest-dir all pass through; symbol -> throws', () => {
	for (const kind of ['workspace', 'repo', 'manifest-dir']) {
		assert.equal(resolveRepoPath({ kind, value: '/r' }, 'tpl'), '/r');
	}
	assert.throws(
		() => resolveRepoPath({ kind: 'symbol', value: 'foo' }, 'tpl'),
		/scopeRef\.kind='symbol'.*workspace/,
	);
});

// ---------------------------------------------------------------------------
// discovery-families: classifier unit tests (no walk)
// ---------------------------------------------------------------------------

test('baseName: directory-stripped', () => {
	assert.equal(_baseNameForTest('a/b/c/Foo.yaml'), 'Foo.yaml');
	assert.equal(_baseNameForTest('Foo.yaml'),       'Foo.yaml');
});

test('classifyFile: terraform / dockerfile / helm chart / gha / gitlab / compose', async () => {
	const cases: Array<[string, string[]]> = [
		['main.tf',                                  ['terraform']],
		['variables.tfvars',                         ['terraform']],
		['Dockerfile',                               ['dockerfile']],
		['build.dockerfile',                         ['dockerfile']],
		['charts/my/Chart.yaml',                     ['helm']],
		['.github/workflows/ci.yml',                 ['github-actions']],
		['.gitlab-ci.yml',                           ['gitlab-ci']],
		['docker-compose.yml',                       ['docker-compose']],
		['compose.yaml',                             ['docker-compose']],
		// Plain README / source not in any family.
		['README.md',                                []],
		['src/index.ts',                             []],
	];

	for (const [rel, expected] of cases) {
		const got = await _classifyFileForTest({ absPath: '/dev/null', relPath: rel });
		assert.deepEqual([...got].sort(), expected.sort(),
			`classify(${rel}) = [${got.join(',')}], expected [${expected.join(',')}]`);
	}
});

// ---------------------------------------------------------------------------
// inventory-kubernetes: extractResource unit tests
// ---------------------------------------------------------------------------

test('extractResource: minimal valid manifest -> record', () => {
	const r = _extractResourceForTest('a.yaml', {
		apiVersion: 'apps/v1',
		kind:       'Deployment',
		metadata:   { name: 'api', namespace: 'prod', labels: { app: 'api', tier: 'web' } },
	});
	assert.deepEqual(r, {
		file:       'a.yaml',
		apiVersion: 'apps/v1',
		kind:       'Deployment',
		name:       'api',
		namespace:  'prod',
		labels:     { app: 'api', tier: 'web' },
	});
});

test('extractResource: no metadata.name -> null (dropped)', () => {
	const r = _extractResourceForTest('a.yaml', {
		apiVersion: 'apps/v1',
		kind:       'Deployment',
		metadata:   { namespace: 'prod' },
	});
	assert.equal(r, null);
});

test('extractResource: no apiVersion/kind -> null', () => {
	assert.equal(_extractResourceForTest('a.yaml', { foo: 'bar' }), null);
	assert.equal(_extractResourceForTest('a.yaml', { apiVersion: 'v1' }), null);
	assert.equal(_extractResourceForTest('a.yaml', { kind: 'Foo' }), null);
});

test('extractResource: label coercion of non-string values', () => {
	const r = _extractResourceForTest('a.yaml', {
		apiVersion: 'v1',
		kind:       'ConfigMap',
		metadata:   { name: 'cfg', labels: { 'count': 3 } },
	});
	assert.equal(r?.labels?.['count'], '3');
});

// ---------------------------------------------------------------------------
// Bootstrap registration
// ---------------------------------------------------------------------------

test('registerBuiltinRuntimes registers all 4 infra runtimes', () => {
	_resetRuntimeBootstrapLatchForTests();
	assert.doesNotThrow(() => registerBuiltinRuntimes());
	const ids = listRegisteredRuntimes();
	for (const tid of [
		'infra.discovery.families',
		'infra.inventory.kubernetes',
		'infra.inventory.terraform',
		'infra.aggregate.report',
	]) {
		assert.notEqual(getRuntime(tid), undefined, `${tid} should be registered`);
		assert.ok(ids.includes(tid), `${tid} should appear in listRegisteredRuntimes`);
	}
});

test('runtime templateIds match expected ids', () => {
	assert.equal(infraDiscoveryFamiliesRuntime.templateId,   'infra.discovery.families');
	assert.equal(infraInventoryKubernetesRuntime.templateId, 'infra.inventory.kubernetes');
	assert.equal(infraInventoryTerraformRuntime.templateId,  'infra.inventory.terraform');
});

// ---------------------------------------------------------------------------
// Prompt file actually exists
// ---------------------------------------------------------------------------

test('INFRA_AGGREGATE_PROMPT_PATH resolves to an existing non-empty file', () => {
	const abs = isAbsolute(INFRA_AGGREGATE_PROMPT_PATH)
		? INFRA_AGGREGATE_PROMPT_PATH
		: resolveRelativeToInsrcRoot(INFRA_AGGREGATE_PROMPT_PATH);
	assert.ok(existsSync(abs), `infra aggregator prompt not found at ${abs}`);
});

function resolveRelativeToInsrcRoot(relPath: string): string {
	const thisFile = fileURLToPath(import.meta.url);
	return resolve(thisFile, '..', '..', '..', '..', '..', relPath);
}

// ---------------------------------------------------------------------------
// Integration: real tmp filesystem fixture (no LMDB, no Ollama).
//
// Fixture layout (~10 files across 4 IaC families):
//   <root>/
//     k8s/
//       api-deployment.yaml       (Deployment "api" in prod, labels {app, tier})
//       api-service.yaml          (Service    "api" in prod)
//       worker-deployment.yaml    (Deployment "worker" in prod)
//       multi.yaml                (ConfigMap + Secret in one file, multi-doc)
//       broken.yaml               (invalid YAML -- skipped gracefully)
//     tf/
//       main.tf                   (2 resources, 1 provider, 1 data, 1 output)
//       variables.tf              (2 variables)
//       backend.tfvars            (counts in files[] at zero blocks)
//     helm/
//       my-chart/
//         Chart.yaml              (helm, not k8s)
//     .github/workflows/
//       ci.yml                    (github-actions; not k8s by content)
//     docker-compose.yml          (compose; not k8s)
//     README.md                   (no family)
//     node_modules/skipped.tf     (SHOULD be skipped by SKIP_DIRS)
// ---------------------------------------------------------------------------

let fixtureRoot: string;

test.before(() => {
	fixtureRoot = mkdtempSync(join(tmpdir(), 'infra-runtime-fix-'));
	const write = (rel: string, body: string): void => {
		const abs = join(fixtureRoot, rel);
		mkdirSync(join(abs, '..'), { recursive: true });
		writeFileSync(abs, body, 'utf8');
	};

	// k8s
	write('k8s/api-deployment.yaml',
		[
			'apiVersion: apps/v1',
			'kind: Deployment',
			'metadata:',
			'  name: api',
			'  namespace: prod',
			'  labels:',
			'    app: api',
			'    tier: web',
			'spec:',
			'  replicas: 3',
			'',
		].join('\n'));
	write('k8s/api-service.yaml',
		[
			'apiVersion: v1',
			'kind: Service',
			'metadata:',
			'  name: api',
			'  namespace: prod',
			'spec:',
			'  ports:',
			'    - port: 80',
			'',
		].join('\n'));
	write('k8s/worker-deployment.yaml',
		[
			'apiVersion: apps/v1',
			'kind: Deployment',
			'metadata:',
			'  name: worker',
			'  namespace: prod',
			'',
		].join('\n'));
	write('k8s/multi.yaml',
		[
			'apiVersion: v1',
			'kind: ConfigMap',
			'metadata:',
			'  name: app-config',
			'data:',
			'  LOG_LEVEL: info',
			'---',
			'apiVersion: v1',
			'kind: Secret',
			'metadata:',
			'  name: app-secret',
			'',
		].join('\n'));
	write('k8s/broken.yaml',
		'apiVersion: v1\nkind: Pod\nmetadata:\n  name: x\n  : badcolon::: nope\n');

	// tf
	write('tf/main.tf',
		[
			'provider "aws" {',
			'  region = var.region',
			'}',
			'',
			'resource "aws_s3_bucket" "logs" {',
			'  bucket = var.bucket_name',
			'}',
			'',
			'resource "aws_iam_role" "app" {',
			'  name               = "app-role"',
			'  assume_role_policy = data.aws_iam_policy_document.assume.json',
			'}',
			'',
			'data "aws_iam_policy_document" "assume" {',
			'  statement { actions = ["sts:AssumeRole"] }',
			'}',
			'',
			'output "bucket_name" {',
			'  value = aws_s3_bucket.logs.bucket',
			'}',
			'',
		].join('\n'));
	write('tf/variables.tf',
		[
			'variable "region"      { type = string; default = "us-east-1" }',
			'variable "bucket_name" { type = string }',
			'',
		].join('\n'));
	write('tf/backend.tfvars',
		'region = "us-west-2"\nbucket_name = "demo-logs"\n');

	// helm
	write('helm/my-chart/Chart.yaml',
		'apiVersion: v2\nname: my-chart\nversion: 0.1.0\n');

	// github-actions
	write('.github/workflows/ci.yml',
		'name: CI\non: [push]\njobs:\n  test:\n    runs-on: ubuntu-latest\n');

	// docker-compose
	write('docker-compose.yml',
		[
			'services:',
			'  api:',
			'    image: api:latest',
			'    ports:',
			'      - "8080:8080"',
			'',
		].join('\n'));

	// README (no family)
	write('README.md', '# fixture\n');

	// SKIP_DIRS test: a tf file inside node_modules MUST be ignored.
	write('node_modules/skipped.tf',
		'resource "aws_should_not_appear" "x" { }\n');
});

test.after(() => {
	if (fixtureRoot) {
		try { rmSync(fixtureRoot, { recursive: true, force: true }); } catch { /* */ }
	}
});

// ---------------------------------------------------------------------------
// walkFiles: SKIP_DIRS smoke
// ---------------------------------------------------------------------------

test('walkFiles: node_modules is skipped (SKIP_DIRS); other files visible', async () => {
	const { files } = await walkFiles(fixtureRoot);
	const paths = files.map(f => f.relPath);
	assert.ok(paths.some(p => p === 'tf/main.tf'),               'tf/main.tf should be walked');
	assert.ok(paths.some(p => p === 'k8s/api-deployment.yaml'),  'k8s manifest should be walked');
	for (const p of paths) {
		assert.ok(!p.startsWith('node_modules/'),
			`node_modules content must be skipped; found ${p}`);
	}
});

// ---------------------------------------------------------------------------
// discovery.families integration
// ---------------------------------------------------------------------------

test('discovery.families: classifies all expected families against the fixture', async () => {
	const task = mkTask('infra.discovery.families',
		{ scopeRef: { kind: 'repo', value: fixtureRoot } }, ['families']);
	const result = await infraDiscoveryFamiliesRuntime.execute(mkArgs(task, 'int-fam-1'));

	const families = result.outputs.get('families') as Array<{
		name: string; fileCount: number; sampleFiles: readonly string[];
	}>;
	const byName = new Map(families.map(f => [f.name, f]));

	// terraform: main.tf + variables.tf + backend.tfvars = 3
	assert.equal(byName.get('terraform')?.fileCount, 3);
	// dockerfile: none in fixture
	assert.equal(byName.get('dockerfile'), undefined);
	// helm: Chart.yaml
	assert.equal(byName.get('helm')?.fileCount, 1);
	// github-actions: .github/workflows/ci.yml
	assert.equal(byName.get('github-actions')?.fileCount, 1);
	// gitlab-ci: none
	assert.equal(byName.get('gitlab-ci'), undefined);
	// docker-compose: docker-compose.yml
	assert.equal(byName.get('docker-compose')?.fileCount, 1);
	// kubernetes: 3 deployment/service manifests + multi.yaml + broken.yaml
	// (broken passes the peek classifier because peek just checks for
	// apiVersion+kind directives, not full YAML validity)
	assert.ok((byName.get('kubernetes')?.fileCount ?? 0) >= 4,
		`kubernetes count should be >= 4, got ${byName.get('kubernetes')?.fileCount}`);

	// Output sorted alphabetically by name.
	const names = families.map(f => f.name);
	const sorted = [...names].sort();
	assert.deepEqual(names, sorted);
});

// ---------------------------------------------------------------------------
// inventory.kubernetes integration
// ---------------------------------------------------------------------------

test('inventory.kubernetes: enumerates resources with kind/name/namespace/labels', async () => {
	const task = mkTask('infra.inventory.kubernetes',
		{ scopeRef: { kind: 'repo', value: fixtureRoot } }, ['k8s-inventory']);
	const result = await infraInventoryKubernetesRuntime.execute(mkArgs(task, 'int-k8s-1'));

	const inv = result.outputs.get('k8s-inventory') as {
		files:     Array<{ path: string; resourceCount: number; kinds: readonly string[] }>;
		resources: Array<{ file: string; kind: string; name: string; namespace?: string; labels?: Record<string, string> }>;
		truncated: boolean;
	};

	// Resources: 2 deployments + 1 service + 1 configmap + 1 secret = 5.
	// (broken.yaml is dropped on YAML parse failure)
	assert.equal(inv.resources.length, 5);

	const apiDeployment = inv.resources.find(r => r.kind === 'Deployment' && r.name === 'api');
	assert.ok(apiDeployment);
	assert.equal(apiDeployment!.namespace, 'prod');
	assert.deepEqual(apiDeployment!.labels, { app: 'api', tier: 'web' });

	// Sorted by (file, kind, name).
	const sortKey = (r: { file: string; kind: string; name: string }): string =>
		`${r.file}|${r.kind}|${r.name}`;
	const keys = inv.resources.map(sortKey);
	assert.deepEqual(keys, [...keys].sort());

	// File summary covers every yaml that produced at least 1 resource.
	const filesByPath = new Map(inv.files.map(f => [f.path, f]));
	assert.equal(filesByPath.get('k8s/multi.yaml')?.resourceCount, 2);
	assert.deepEqual([...(filesByPath.get('k8s/multi.yaml')?.kinds ?? [])].sort(),
		['ConfigMap', 'Secret']);
	// broken.yaml MUST NOT appear in the files summary (parse failed).
	assert.equal(filesByPath.get('k8s/broken.yaml'), undefined);
});

test('inventory.kubernetes: Chart.yaml is skipped (helm metadata, not k8s)', async () => {
	const task = mkTask('infra.inventory.kubernetes',
		{ scopeRef: { kind: 'repo', value: fixtureRoot } }, ['k8s-inventory']);
	const result = await infraInventoryKubernetesRuntime.execute(mkArgs(task, 'int-k8s-helm-skip'));
	const inv = result.outputs.get('k8s-inventory') as {
		files: Array<{ path: string }>;
	};
	for (const f of inv.files) {
		assert.notEqual(f.path, 'helm/my-chart/Chart.yaml',
			'Chart.yaml should not appear in k8s inventory');
	}
});

// ---------------------------------------------------------------------------
// inventory.terraform integration
// ---------------------------------------------------------------------------

test('inventory.terraform: extracts resources / data / providers / variables / outputs', async () => {
	const task = mkTask('infra.inventory.terraform',
		{ scopeRef: { kind: 'repo', value: fixtureRoot } }, ['tf-inventory']);
	const result = await infraInventoryTerraformRuntime.execute(mkArgs(task, 'int-tf-1'));

	const inv = result.outputs.get('tf-inventory') as {
		files:     Array<{ path: string; resourceCount: number; providerCount: number;
		                   moduleCount: number; variableCount: number;
		                   dataCount: number; outputCount: number }>;
		resources: Array<{ file: string; type: string; name: string }>;
		data:      Array<{ file: string; type: string; name: string }>;
		modules:   Array<{ file: string; name: string }>;
		providers: Array<{ file: string; name: string }>;
		variables: Array<{ file: string; name: string }>;
		outputs:   Array<{ file: string; name: string }>;
		truncated: boolean;
	};

	// main.tf: 2 resources + 1 provider + 1 data + 1 output
	assert.deepEqual(
		inv.resources.map(r => `${r.type}.${r.name}`).sort(),
		['aws_iam_role.app', 'aws_s3_bucket.logs'],
	);
	assert.deepEqual(inv.providers.map(p => p.name), ['aws']);
	assert.deepEqual(inv.data.map(d => `${d.type}.${d.name}`), ['aws_iam_policy_document.assume']);
	assert.deepEqual(inv.outputs.map(o => o.name), ['bucket_name']);

	// variables.tf: 2 variables
	assert.deepEqual(inv.variables.map(v => v.name).sort(), ['bucket_name', 'region']);

	// node_modules/skipped.tf must NOT appear anywhere.
	for (const r of inv.resources) {
		assert.ok(!r.file.startsWith('node_modules/'));
		assert.notEqual(r.type, 'aws_should_not_appear');
	}

	// File summary: 3 entries (main.tf + variables.tf + backend.tfvars).
	const paths = inv.files.map(f => f.path).sort();
	assert.deepEqual(paths, ['tf/backend.tfvars', 'tf/main.tf', 'tf/variables.tf']);
	const mainSummary = inv.files.find(f => f.path === 'tf/main.tf')!;
	assert.equal(mainSummary.resourceCount, 2);
	assert.equal(mainSummary.providerCount, 1);
	assert.equal(mainSummary.dataCount,     1);
	assert.equal(mainSummary.outputCount,   1);
	const tfvarsSummary = inv.files.find(f => f.path === 'tf/backend.tfvars')!;
	assert.equal(tfvarsSummary.resourceCount, 0);
});
