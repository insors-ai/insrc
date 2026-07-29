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
	INFRA_RUNTIMES,
	infraDiscoveryFamiliesRuntime,
	infraInventoryKubernetesRuntime,
	infraInventoryTerraformRuntime,
	infraInventoryHelmRuntime,
	infraInventoryDockerRuntime,
	infraInventoryCiRuntime,
} from '../index.js';
import {
	INFRA_TEMPLATES,
	infraDiscoveryFamilies,
} from '../../../planner/templates/infra/index.js';
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

test('registerBuiltinRuntimes registers all infra runtimes (incl. helm/docker/ci)', () => {
	_resetRuntimeBootstrapLatchForTests();
	assert.doesNotThrow(() => registerBuiltinRuntimes());
	const ids = listRegisteredRuntimes();
	for (const tid of [
		'infra.discovery.families',
		'infra.inventory.kubernetes',
		'infra.inventory.terraform',
		'infra.inventory.helm',
		'infra.inventory.docker',
		'infra.inventory.ci',
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
	assert.equal(infraInventoryHelmRuntime.templateId,       'infra.inventory.helm');
	assert.equal(infraInventoryDockerRuntime.templateId,     'infra.inventory.docker');
	assert.equal(infraInventoryCiRuntime.templateId,         'infra.inventory.ci');
});

test('registration parity: INFRA_RUNTIMES and INFRA_TEMPLATES both length 8; produces-key === runtime output key', async () => {
	assert.equal(INFRA_RUNTIMES.length, 8);
	assert.equal(INFRA_TEMPLATES.length, 8);
	// Every template has a matching runtime by id.
	const runtimeIds = new Set(INFRA_RUNTIMES.map(r => r.templateId));
	for (const t of INFRA_TEMPLATES) {
		assert.ok(runtimeIds.has(t.id), `template ${t.id} has a registered runtime`);
	}
	// For each new inventory family, the template's produces[0] equals the
	// runtime's single output-Map key.
	const empty = mkArgs(mkTask('x', { scopeRef: { kind: 'repo', value: tmpdir() } }, []), 'parity');
	for (const [tid, key] of [
		['infra.inventory.helm',   'helm-inventory'],
		['infra.inventory.docker', 'docker-inventory'],
		['infra.inventory.ci',     'ci-inventory'],
	] as const) {
		const tpl = INFRA_TEMPLATES.find(t => t.id === tid)!;
		assert.deepEqual(tpl.produces, [key], `${tid} produces === [${key}]`);
		const rt = INFRA_RUNTIMES.find(r => r.templateId === tid)!;
		const out = await rt.execute(empty);
		assert.ok(out.outputs.has(key), `${tid} runtime output Map has key ${key}`);
	}
});

test('infra.discovery.families description no longer overpromises ansible/pulumi/cloudformation', () => {
	const desc = infraDiscoveryFamilies.description;
	for (const dead of ['ansible', 'pulumi', 'cloudformation']) {
		assert.ok(!desc.includes(dead), `description should not mention ${dead}`);
	}
	// still names the families it actually detects
	for (const live of ['terraform', 'kubernetes', 'helm', 'github-actions', 'gitlab-ci', 'docker-compose', 'dockerfile']) {
		assert.ok(desc.includes(live), `description should still name ${live}`);
	}
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
			'variable "region" {',
			'  type    = string',
			'  default = "us-east-1"',
			'}',
			'variable "bucket_name" {',
			'  type = string',
			'}',
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

// ---------------------------------------------------------------------------
// inventory.terraform: real-parser behaviour (S001)
//
// The runtime now uses @cdktf/hcl2json (a real HCL parser) instead of the
// old column-0-anchored regex. This dedicated fixture proves the two
// behaviours the swap unlocks, on its own temp dir so it doesn't perturb the
// shared-fixture / discovery-families counts:
//   1. an INDENTED top-level block (valid HCL the regex dropped) is captured;
//   2. an INVALID-HCL file is skipped (logged + continue), not thrown, and
//      never appears in the inventory, while its valid sibling still does.
// ---------------------------------------------------------------------------

let tfParserFixtureRoot: string;

test.before(() => {
	tfParserFixtureRoot = mkdtempSync(join(tmpdir(), 'infra-tf-parser-fix-'));
	const write = (rel: string, body: string): void => {
		const abs = join(tfParserFixtureRoot, rel);
		mkdirSync(join(abs, '..'), { recursive: true });
		writeFileSync(abs, body, 'utf8');
	};

	// Indented top-level block: VALID HCL, but the old /^(resource|data)/m
	// regex required column 0 and silently dropped it. The real parser keeps it.
	write('indented.tf',
		[
			'  resource "aws_cloudwatch_log_group" "indented" {',
			'    name = "app-logs"',
			'  }',
			'',
		].join('\n'));
	// A plain, canonical sibling that must survive alongside the broken file.
	write('valid.tf',
		[
			'resource "aws_s3_bucket" "ok" {',
			'  bucket = "ok"',
			'}',
			'',
		].join('\n'));
	// Invalid HCL: the parser throws -> the runtime drops the file and continues.
	write('broken.tf',
		'resource "aws_thing" "x" {{{ not valid hcl\n');
});

test.after(() => {
	if (tfParserFixtureRoot) {
		try { rmSync(tfParserFixtureRoot, { recursive: true, force: true }); } catch { /* */ }
	}
});

test('inventory.terraform: captures indented blocks + drops invalid HCL (no throw)', async () => {
	const task = mkTask('infra.inventory.terraform',
		{ scopeRef: { kind: 'repo', value: tfParserFixtureRoot } }, ['tf-inventory']);

	// Must not throw despite broken.tf being present.
	const result = await infraInventoryTerraformRuntime.execute(mkArgs(task, 'int-tf-parser-1'));

	const inv = result.outputs.get('tf-inventory') as {
		files:     Array<{ path: string; resourceCount: number }>;
		resources: Array<{ file: string; type: string; name: string }>;
	};

	// The indented block (regex would have missed it) AND the canonical sibling
	// are both captured; the invalid file contributes nothing.
	assert.deepEqual(
		inv.resources.map(r => `${r.file}:${r.type}.${r.name}`).sort(),
		['indented.tf:aws_cloudwatch_log_group.indented', 'valid.tf:aws_s3_bucket.ok'],
	);
	// broken.tf is dropped -- it never appears in resources or the file summary.
	assert.ok(!inv.resources.some(r => r.file === 'broken.tf'), 'broken.tf must not contribute resources');
	assert.ok(!inv.files.some(f => f.path === 'broken.tf'),      'broken.tf must not appear in file summary');
});

// ---------------------------------------------------------------------------
// helm / docker / ci inventory integration (S001) — dedicated rich fixture.
//
// The shared fixtureRoot above only carries a bare Chart.yaml + a simple
// compose + a simple GHA workflow. This second fixture exercises the fuller
// shapes: a chart with dependencies + templates/ + values.yaml, a multi-stage
// Dockerfile + a build-only compose service, a GHA workflow with `on` as a MAP
// + step `uses`, and a .gitlab-ci.yml with stages + reserved keys + a broken
// workflow that must be skipped (not thrown).
// ---------------------------------------------------------------------------

let ciFixtureRoot: string;

test.before(() => {
	ciFixtureRoot = mkdtempSync(join(tmpdir(), 'infra-s001-fix-'));
	const write = (rel: string, body: string): void => {
		const abs = join(ciFixtureRoot, rel);
		mkdirSync(join(abs, '..'), { recursive: true });
		writeFileSync(abs, body, 'utf8');
	};

	// helm chart: metadata + dependencies + templates/ + values.yaml
	write('charts/web/Chart.yaml',
		[
			'apiVersion: v2',
			'name: web',
			'version: 1.2.3',
			'appVersion: "4.5.6"',
			'type: application',
			'dependencies:',
			'  - name: redis',
			'    version: 17.0.0',
			'    repository: https://charts.bitnami.com/bitnami',
			'  - name: postgres',
			'    version: 12.0.0',
			'',
		].join('\n'));
	write('charts/web/templates/deployment.yaml', 'kind: Deployment\n');
	write('charts/web/templates/service.yaml',    'kind: Service\n');
	write('charts/web/values.yaml',
		'replicaCount: 2\nimage:\n  repository: web\nservice:\n  port: 80\n');
	// a chart with no deps + no values + no templates
	write('charts/bare/Chart.yaml', 'apiVersion: v2\nname: bare\nversion: 0.0.1\n');

	// docker: multi-stage Dockerfile + a compose with a build-only service
	write('Dockerfile',
		[
			'FROM node:20 AS build',
			'WORKDIR /app',
			'EXPOSE 3000',
			'FROM nginx AS runtime',
			'EXPOSE 80 443',
			'',
		].join('\n'));
	write('docker-compose.yml',
		[
			'services:',
			'  api:',
			'    image: api:latest',
			'    ports:',
			'      - "8080:8080"',
			'  worker:',
			'    build: ./worker',
			'',
		].join('\n'));

	// github-actions: `on` as a MAP + step uses
	write('.github/workflows/release.yml',
		[
			'name: Release',
			'on:',
			'  push:',
			'    branches: [main]',
			'  workflow_dispatch: {}',
			'jobs:',
			'  build:',
			'    runs-on: ubuntu-latest',
			'    steps:',
			'      - uses: actions/checkout@v4',
			'      - uses: actions/setup-node@v4',
			'      - run: npm ci',
			'',
		].join('\n'));
	// a broken workflow — must be skipped, not thrown
	write('.github/workflows/broken.yml', 'name: X\non: [push\n  bad: : :\n');

	// gitlab-ci: stages + reserved keys + two jobs
	write('.gitlab-ci.yml',
		[
			'stages:',
			'  - build',
			'  - test',
			'variables:',
			'  FOO: bar',
			'default:',
			'  image: node:20',
			'build-job:',
			'  stage: build',
			'  script: [make]',
			'test-job:',
			'  stage: test',
			'  script: [make test]',
			'',
		].join('\n'));
});

test.after(() => {
	if (ciFixtureRoot) {
		try { rmSync(ciFixtureRoot, { recursive: true, force: true }); } catch { /* */ }
	}
});

function ciArgs(templateId: string, root: string, runId: string): TemplateExecuteArgs {
	return mkArgs(mkTask(templateId, { scopeRef: { kind: 'repo', value: root } }, []), runId);
}

test('inventory.helm: enumerates charts with metadata + deps + templateFileCount + valuesKeys', async () => {
	const result = await infraInventoryHelmRuntime.execute(ciArgs('infra.inventory.helm', ciFixtureRoot, 'helm-1'));
	const inv = result.outputs.get('helm-inventory') as {
		charts: Array<{ path: string; name?: string; version?: string; appVersion?: string; type?: string; dependencies: Array<{ name: string; version?: string; repository?: string }>; templateFileCount: number; valuesKeys: string[] }>;
		truncated: boolean;
	};
	assert.equal(inv.truncated, false);
	// sorted by path: charts/bare before charts/web
	assert.deepEqual(inv.charts.map(c => c.path), ['charts/bare/Chart.yaml', 'charts/web/Chart.yaml']);

	const web = inv.charts.find(c => c.path === 'charts/web/Chart.yaml')!;
	assert.equal(web.name, 'web');
	assert.equal(web.version, '1.2.3');
	assert.equal(web.appVersion, '4.5.6');
	assert.equal(web.type, 'application');
	assert.equal(web.templateFileCount, 2);                       // deployment.yaml + service.yaml
	assert.deepEqual(web.valuesKeys, ['image', 'replicaCount', 'service']);   // sorted top-level keys
	assert.deepEqual(web.dependencies.map(d => d.name), ['postgres', 'redis']); // sorted
	assert.equal(web.dependencies.find(d => d.name === 'redis')?.repository, 'https://charts.bitnami.com/bitnami');

	// bare chart: still listed, empty deps/values, zero templates
	const bare = inv.charts.find(c => c.path === 'charts/bare/Chart.yaml')!;
	assert.deepEqual(bare.dependencies, []);
	assert.deepEqual(bare.valuesKeys, []);
	assert.equal(bare.templateFileCount, 0);
});

test('inventory.docker: multi-stage Dockerfile FROM/stage/EXPOSE + compose services (build-only kept)', async () => {
	const result = await infraInventoryDockerRuntime.execute(ciArgs('infra.inventory.docker', ciFixtureRoot, 'docker-1'));
	const inv = result.outputs.get('docker-inventory') as {
		dockerfiles: Array<{ path: string; froms: Array<{ image: string; stage?: string }>; exposedPorts: string[] }>;
		composeFiles: Array<{ path: string; services: Array<{ name: string; image?: string; ports: string[] }> }>;
		truncated: boolean;
	};
	const df = inv.dockerfiles.find(d => d.path === 'Dockerfile')!;
	assert.deepEqual(df.froms, [{ image: 'node:20', stage: 'build' }, { image: 'nginx', stage: 'runtime' }]);
	assert.deepEqual(df.exposedPorts, ['3000', '443', '80'].sort());   // sorted

	const compose = inv.composeFiles.find(c => c.path === 'docker-compose.yml')!;
	assert.deepEqual(compose.services.map(s => s.name), ['api', 'worker']);   // sorted
	const api = compose.services.find(s => s.name === 'api')!;
	assert.equal(api.image, 'api:latest');
	assert.deepEqual(api.ports, ['8080:8080']);
	const worker = compose.services.find(s => s.name === 'worker')!;
	assert.equal(worker.image, undefined);   // build-only service kept with no image
	assert.deepEqual(worker.ports, []);
});

test('inventory.ci: GHA `on` map normalized + step uses; gitlab stages + jobs (reserved keys excluded); broken skipped', async () => {
	const result = await infraInventoryCiRuntime.execute(ciArgs('infra.inventory.ci', ciFixtureRoot, 'ci-1'));
	const inv = result.outputs.get('ci-inventory') as {
		githubWorkflows: Array<{ path: string; name?: string; triggers: string[]; jobs: Array<{ id: string; stepUses: string[] }> }>;
		gitlabCi: Array<{ path: string; stages: string[]; jobs: string[] }>;
		truncated: boolean;
	};
	// The broken workflow is skipped, so only release.yml remains.
	const wf = inv.githubWorkflows.find(w => w.path === '.github/workflows/release.yml')!;
	assert.equal(wf.name, 'Release');
	assert.deepEqual(wf.triggers, ['push', 'workflow_dispatch']);   // `on` map keys, sorted
	const build = wf.jobs.find(j => j.id === 'build')!;
	assert.deepEqual(build.stepUses, ['actions/checkout@v4', 'actions/setup-node@v4']);

	const gl = inv.gitlabCi.find(g => g.path === '.gitlab-ci.yml')!;
	assert.deepEqual(gl.stages, ['build', 'test']);
	assert.deepEqual(gl.jobs, ['build-job', 'test-job']);   // stages/variables/default excluded
});

test('inventory runtimes: empty scope yields well-formed empty inventories, no throw', async () => {
	const emptyRoot = mkdtempSync(join(tmpdir(), 'infra-empty-'));
	try {
		const helm = (await infraInventoryHelmRuntime.execute(ciArgs('infra.inventory.helm', emptyRoot, 'e1'))).outputs.get('helm-inventory') as { charts: unknown[]; truncated: boolean };
		assert.deepEqual(helm.charts, []);
		assert.equal(helm.truncated, false);
		const docker = (await infraInventoryDockerRuntime.execute(ciArgs('infra.inventory.docker', emptyRoot, 'e2'))).outputs.get('docker-inventory') as { dockerfiles: unknown[]; composeFiles: unknown[] };
		assert.deepEqual(docker.dockerfiles, []);
		assert.deepEqual(docker.composeFiles, []);
		const ci = (await infraInventoryCiRuntime.execute(ciArgs('infra.inventory.ci', emptyRoot, 'e3'))).outputs.get('ci-inventory') as { githubWorkflows: unknown[]; gitlabCi: unknown[] };
		assert.deepEqual(ci.githubWorkflows, []);
		assert.deepEqual(ci.gitlabCi, []);
	} finally {
		rmSync(emptyRoot, { recursive: true, force: true });
	}
});
