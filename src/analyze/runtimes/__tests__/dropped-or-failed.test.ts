/**
 * A plan task that dropped something says so, or fails
 * (LLD-b9d5c5c40df5a574-s1, task t11).
 *
 * The rule is the lookups' rule: a catch clause in a runtime may go on only
 * when it handles one named, expected condition AND the task's record says
 * what was dropped. A clause that hides the failure of the task's whole work
 * rethrows, and the walk records the task as failed. The table below is the
 * classification of every clause; a test counts the clauses in the source.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { closeGraphStore, setGraphStorePath } from '../../../db/graph/store.js';
import { addRepo } from '../../../db/repos.js';
import type { ClassifiedIntent } from '../../../shared/analyze-types.js';
import type { LLMProvider } from '../../../shared/types.js';
import { runWithRoutingContext } from '../../context/shaper-provider.js';
import type { RoutingSeamContext } from '../../context/shaper-provider.js';
import { purgeAllTaskOutputs } from '../../executor/cache.js';
import { _resetRuntimeRegistryForTests, registerTemplateRuntime } from '../../executor/registry.js';
import type { PlannedTask, PlanTask, TemplateExecuteArgs, TemplateExecuteResult, TemplateRuntime } from '../../executor/types.js';
import { runExecutor } from '../../executor/walker.js';

import { codeAdherenceCheckRuntime } from '../code/adherence-check.js';
import { walkFiles } from '../infra/_shared.js';
import { infraDiscoveryFamiliesRuntime } from '../infra/discovery-families.js';
import { infraInventoryCiRuntime } from '../infra/inventory-ci.js';
import { infraInventoryDockerRuntime } from '../infra/inventory-docker.js';
import { infraInventoryHelmRuntime } from '../infra/inventory-helm.js';
import { infraInventoryKubernetesRuntime } from '../infra/inventory-kubernetes.js';
import { infraInventoryTerraformRuntime } from '../infra/inventory-terraform.js';

const RUNTIMES = join(dirname(fileURLToPath(import.meta.url)), '..');
const NOW = '2026-10-08T10:00:00.000Z';
const isRoot = process.getuid?.() === 0;
const noRoot = { skip: isRoot ? 'permission checks do not apply to root' : false };

// ---------------------------------------------------------------------------
// The classification of every catch clause in the runtime files
// ---------------------------------------------------------------------------

type ClauseClass = `expected: ${string}` | 'rethrow';

/** One row per catch clause, in source order; `after` is text near the clause it classifies. */
const CLAUSES: Record<string, readonly { after: string; cls: ClauseClass }[]> = {
	'code/structure-module-tree.ts': [
		{ after: 'its imports could not be read from the graph', cls: "expected: one file's imports cannot be read from the graph; the file is named under skipped" },
	],
	'data/schema-table.ts': [
		{ after: 'the driver could not list them', cls: "expected: the driver cannot list a table's indexes; they are named under skipped" },
	],
	'infra/_shared.ts': [
		{ after: 'if (dir === root) throw err;', cls: 'expected: a directory below the walk root cannot be read; it is named under skipped (the root itself rethrows)' },
	],
	'infra/discovery-families.ts': [
		{ after: 'return err instanceof Error ? err : new Error(String(err));', cls: 'expected: a YAML file cannot be read to tell whether it is a manifest; it is named under skipped' },
	],
	'infra/inventory-ci.ts': [
		{ after: 'skipped.push(unreadableFile(f.relPath, err));', cls: 'expected: a workflow file cannot be read or parsed; it is named under skipped' },
	],
	'infra/inventory-docker.ts': [
		{ after: 'Dockerfile read failed', cls: 'expected: a Dockerfile cannot be read; it is named under skipped' },
		{ after: 'compose parse failed', cls: 'expected: a compose file cannot be read or parsed; it is named under skipped' },
	],
	'infra/inventory-helm.ts': [
		{ after: 'Chart.yaml parse failed', cls: 'expected: a Chart.yaml cannot be read or parsed; it is named under skipped' },
		{ after: 'skipped.push(unreadableFile(values.relPath, err));', cls: 'expected: a values file cannot be read or parsed; it is named under skipped' },
	],
	'infra/inventory-kubernetes.ts': [
		{ after: 'inventory.kubernetes: YAML parse failed', cls: 'expected: a manifest cannot be read or parsed; it is named under skipped' },
	],
	'infra/inventory-terraform.ts': [
		{ after: 'inventory.terraform: read failed', cls: 'expected: a terraform file cannot be read; it is named under skipped' },
		{ after: 'HCL parse failed', cls: 'expected: a terraform file cannot be parsed; it is named under skipped' },
	],
	'shared/adherence.ts': [
		{ after: 'the model call that judges adherence failed', cls: 'rethrow' },
	],
	'shared/aggregator.ts': [
		{ after: 'throw classifyError(err);', cls: 'rethrow' },
		{ after: 'aggregator prompt missing', cls: 'rethrow' },
	],
	// Story s7: the one scope function for plan tasks names the refusing template and rethrows.
	'shared/task-scope.ts': [
		{ after: 'Say which template refused; the class, and so the code, is unchanged.', cls: 'rethrow' },
	],
};

const CATCH = /\bcatch\b\s*(\(|\{)/g;

function runtimeFiles(dir = RUNTIMES, prefix = ''): string[] {
	const out: string[] = [];
	for (const name of readdirSync(dir)) {
		if (name === '__tests__') continue;
		const full = join(dir, name);
		if (statSync(full).isDirectory()) out.push(...runtimeFiles(full, `${prefix}${name}/`));
		else if (name.endsWith('.ts')) out.push(`${prefix}${name}`);
	}
	return out;
}

test('the count of catch clauses in the runtime files equals the number of classified entries', () => {
	const counted: Record<string, number> = {};
	for (const f of runtimeFiles()) {
		const n = (readFileSync(join(RUNTIMES, f), 'utf8').match(CATCH) ?? []).length;
		if (n > 0) counted[f] = n;
	}
	const classified = Object.fromEntries(Object.entries(CLAUSES).map(([f, rows]) => [f, rows.length]));
	assert.deepEqual(counted, classified, 'every catch clause in a runtime file has a row in CLAUSES, and no row is left over');

	// The count the design left unsettled (fifteen by one count, eighteen by another): fifteen, in eleven files.
	// Story s7 added one, a rethrow, in a twelfth file (shared/task-scope.ts).
	assert.equal(Object.values(classified).reduce((a, b) => a + b, 0), 16);
	assert.equal(Object.keys(classified).length, 12);

	// Each row is tied to the clause it classifies, in order.
	for (const [f, rows] of Object.entries(CLAUSES)) {
		const src = readFileSync(join(RUNTIMES, f), 'utf8');
		const positions = [...src.matchAll(CATCH)].map(m => m.index);
		rows.forEach((row, i) => {
			const from = positions[i]!;
			assert.ok(src.slice(from - 200, from + 700).includes(row.after), `${f}: clause ${i + 1} is the one classified "${row.cls}" (looked for: ${row.after})`);
		});
	}
	for (const rows of Object.values(CLAUSES)) {
		for (const row of rows) assert.match(row.cls, /^(rethrow|expected: .{20,})$/);
	}
});

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

let dir: string;
let REPO: string;
const locked: string[] = [];

function write(rel: string, content: string): string {
	const p = join(REPO, rel);
	mkdirSync(dirname(p), { recursive: true });
	writeFileSync(p, content);
	return p;
}

function intent(): ClassifiedIntent {
	return { target: 'infra', scope: 'M', focused: true, focus: 'infra', scopeRef: { kind: 'repo', value: REPO }, reasoning: 't' };
}

function args(templateId: string, params: Record<string, unknown> = { scopeRef: { kind: 'repo', value: REPO } }): TemplateExecuteArgs {
	const task = { taskId: 't01', template: templateId, kind: 'leaf', params, produces: [], rationale: 't' } as PlannedTask;
	return { task, intent: intent(), upstreamOutputs: new Map(), runId: 'r1' };
}

test.beforeEach(async () => {
	await closeGraphStore();
	dir = realpathSync(mkdtempSync(join(tmpdir(), 'insrc-dropped-or-failed-')));
	REPO = join(dir, 'repo');
	mkdirSync(REPO);
	setGraphStorePath(join(dir, 'graph.lmdb'));
	await addRepo(null, { path: REPO, name: '', addedAt: NOW, status: 'pending' });
});

test.afterEach(async () => {
	_resetRuntimeRegistryForTests();
	for (const p of locked.splice(0)) { try { chmodSync(p, 0o755); } catch { /* already gone */ } }
	await closeGraphStore();
	rmSync(dir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// expected: the inventory goes on and names what it dropped
// ---------------------------------------------------------------------------

test('an inventory over a tree with an unreadable directory and a file that does not parse lists both under skipped and is not complete (mutation: restore the silent skip)', noRoot, async () => {
	// One good file and one that does not parse, for each inventory.
	write('k8s/good.yaml', 'apiVersion: v1\nkind: Service\nmetadata:\n  name: ok\n');
	write('k8s/broken.yaml', 'apiVersion: v1\nkind: Service\nmetadata: {[ not yaml\n');
	write('.github/workflows/ok.yml', 'name: ok\non: [push]\njobs: {}\n');
	write('.github/workflows/broken.yml', 'name: [unclosed\n');
	write('docker-compose.yml', 'services: {[ not yaml\n');
	write('Dockerfile', 'FROM node:22\n');
	write('charts/web/Chart.yaml', 'apiVersion: v2\nname: web\nversion: 1.0.0\n');
	write('charts/web/values.yaml', 'replicas: {[ not yaml\n');
	write('charts/bad/Chart.yaml', 'name: {[ not yaml\n');
	write('infra/ok.tf', 'variable "region" {}\n');
	write('infra/broken.tf', 'resource "aws_s3_bucket" "b" {\n  bucket = \n');
	// A directory the walk cannot enter, holding a manifest nobody will see.
	const vault = join(REPO, 'secrets');
	mkdirSync(vault);
	writeFileSync(join(vault, 'hidden.yaml'), 'apiVersion: v1\nkind: Secret\n');
	chmodSync(vault, 0o000);
	locked.push(vault);

	const run = async (runtime: TemplateRuntime): Promise<TemplateExecuteResult> => runtime.execute(args(runtime.templateId));
	const skippedOf = (r: TemplateExecuteResult): string[] => (r.completeness.skipped ?? []).map(s => s.what).sort();

	const k8s = await run(infraInventoryKubernetesRuntime);
	// The kubernetes inventory reads EVERY YAML file to see whether it is a manifest,
	// so every YAML file that does not parse is one it could not classify.
	// (A Chart.yaml is helm's, and the kubernetes inventory does not read it.)
	const BROKEN_YAML = ['.github/workflows/broken.yml', 'charts/web/values.yaml', 'docker-compose.yml', 'k8s/broken.yaml'];
	assert.deepEqual(skippedOf(k8s), [...BROKEN_YAML, 'secrets'].sort(), 'the unparsable YAML files and the unreadable directory');
	assert.equal(k8s.completeness.complete, false);
	assert.match(k8s.completeness.skipped!.find(s => s.what === 'secrets')!.reason, /could not be read \(EACCES\)/);
	assert.match(k8s.completeness.skipped!.find(s => s.what === 'k8s/broken.yaml')!.reason, /^it could not be read or parsed \(/);
	const k8sOut = k8s.outputs.get('k8s-inventory') as { resources: { name?: string }[] };
	assert.ok(k8sOut.resources.length >= 1, 'the readable manifest is still inventoried');

	const ci = await run(infraInventoryCiRuntime);
	assert.deepEqual(skippedOf(ci), ['.github/workflows/broken.yml', 'secrets']);

	const docker = await run(infraInventoryDockerRuntime);
	assert.deepEqual(skippedOf(docker), ['docker-compose.yml', 'secrets']);
	assert.equal((docker.outputs.get('docker-inventory') as { dockerfiles: unknown[] }).dockerfiles.length, 1);

	const helm = await run(infraInventoryHelmRuntime);
	assert.deepEqual(skippedOf(helm), ['charts/bad/Chart.yaml', 'charts/web/values.yaml', 'secrets'], 'a chart file and a values file, each named');
	assert.equal((helm.outputs.get('helm-inventory') as { charts: unknown[] }).charts.length, 1, 'the chart whose values did not parse is still listed');

	const tf = await run(infraInventoryTerraformRuntime);
	assert.deepEqual(skippedOf(tf), ['infra/broken.tf', 'secrets']);

	const families = await run(infraDiscoveryFamiliesRuntime);
	assert.ok(skippedOf(families).includes('secrets'));
	assert.equal(families.completeness.complete, false);

	// A file that cannot be READ, where the family depends on its content.
	const sealed = write('k8s/sealed.yaml', 'apiVersion: v1\nkind: Service\n');
	chmodSync(sealed, 0o000);
	locked.push(sealed);
	const families2 = await run(infraDiscoveryFamiliesRuntime);
	assert.ok(skippedOf(families2).includes('k8s/sealed.yaml'), 'whether it is a manifest is not known, and it is named');

	// The walk's root itself: the task could not run at all.
	await assert.rejects(walkFiles(vault), (err: unknown) => (err as NodeJS.ErrnoException).code === 'EACCES');
	await assert.rejects(walkFiles(join(REPO, 'no-such-dir')), (err: unknown) => (err as NodeJS.ErrnoException).code === 'ENOENT');

	// A tree with nothing unreadable or unparsable is complete.
	const clean = join(dir, 'clean');
	mkdirSync(clean);
	writeFileSync(join(clean, 'Dockerfile'), 'FROM node:22\n');
	const a = args('infra.inventory.docker', { scopeRef: { kind: 'repo', value: clean } });
	const ok = await infraInventoryDockerRuntime.execute({ ...a, intent: { ...a.intent, scopeRef: { kind: 'repo', value: clean } } });
	assert.equal(ok.completeness.skipped, undefined);
	assert.equal(ok.completeness.complete, true);
});

// ---------------------------------------------------------------------------
// rethrow: the task did not do its work
// ---------------------------------------------------------------------------

test('an adherence check whose model call fails is recorded by the walk as a failed task', async () => {
	const modelDown = { completeStructured: async () => { throw new Error('model unavailable'); } } as unknown as LLMProvider;
	const routing = { router: { resolveProviderForRole: () => ({ provider: modelDown }) } } as unknown as RoutingSeamContext;
	const params = { codeSubject: 'settleRefund', constraints: [{ constraint: 'refunds MUST be issued within 30 days' }] };

	// At the runtime: it throws. It used to return every constraint as a missing implementation.
	await assert.rejects(
		runWithRoutingContext(routing, () => codeAdherenceCheckRuntime.execute(args('code.adherence.check', params))),
		/the model call that judges adherence failed: model unavailable\. 1 constraint\(s\) and 0 excerpt\(s\) were gathered and not judged\./,
	);

	// Through the walk: a failed task, with the reason, and no report of findings.
	_resetRuntimeRegistryForTests();
	registerTemplateRuntime(codeAdherenceCheckRuntime);
	const runId = `dropped-or-failed-${Math.floor(Math.random() * 1e9).toString(16)}`;
	const plan: PlanTask = {
		planId: 'p', goal: 'g', target: 'code', scope: 'M', reasoning: 'r',
		tasks: [{ taskId: 't01', template: 'code.adherence.check', kind: 'leaf', params, produces: ['adherence-report'], rationale: 'r' } as PlannedTask],
	} as PlanTask;
	try {
		const result = await runWithRoutingContext(routing, () => runExecutor({
			tree: { plan, children: new Map(), childErrors: new Map() },
			intent: { ...intent(), target: 'code' },
			runId,
		}));
		const t01 = result.root.perTask.get('t01')!;
		assert.equal(t01.status, 'failed');
		assert.match(t01.error ?? '', /^runtime-threw: code\.adherence\.check: the model call that judges adherence failed/);
		assert.equal(t01.outputs, undefined, 'no adherence report is produced from a check that did not run');
		assert.equal(t01.completeness, undefined);
		assert.deepEqual(result.root.tasksFailed.map(f => f.taskId), ['t01']);
	} finally {
		purgeAllTaskOutputs(runId);
	}
});
