import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';
import { createRun } from '../test-harness/context.mjs';
import { buildStages, fingerprint, npmEntrypoint, ROOT } from '../test-harness/build.mjs';
import { withRun } from '../test-harness/process.mjs';
import { parseArgs, runHarness } from '../test-harness/run.mjs';
import { withSpecializedOwnership } from '../test-harness/specialized.mjs';

test('Root and VSCode command overlap refuses before asset synchronization', { timeout: 20000 }, async () => {
	const run = createRun(ROOT);
	await withRun(run, async () => {
		const before = fingerprint(ROOT, ['out', 'vscode-plugin/assets', 'src/assets/connection-management-gates.json']);
		const npm = npmEntrypoint(run.environment());
		for (const args of [[npm, 'run', 'build'], [npm, 'test', '--', 'scripts/__tests__/test-harness.test.ts'], [npm, '--prefix', 'vscode-plugin', 'test'], ['scripts/connection-management-regression.mjs'], ['scripts/connection-test-regression.mjs']]) {
			const child = spawnSync(run.runtime.executable, args, { cwd: ROOT, env: { ...run.environment(), INSRC_TEST_RUN_ID: '', INSRC_TEST_ROOT: '' }, encoding: 'utf8', timeout: 5000 });
			assert.notEqual(child.status, 0, args.join(' '));
			assert.match(child.stdout + child.stderr, /harness-busy|Checkout already owned/, args.join(' '));
		}
		assert.equal(fingerprint(ROOT, ['out', 'vscode-plugin/assets', 'src/assets/connection-management-gates.json']), before);
	});
});

function reportProperty(file: string, name: string): ts.Expression {
	const source = ts.createSourceFile(file, readFileSync(join(ROOT, file), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
	let result: ts.Expression | undefined;
	function visit(node: ts.Node) {
		if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'report' && node.initializer && ts.isObjectLiteralExpression(node.initializer)) {
			const property = node.initializer.properties.find(p => ts.isPropertyAssignment(p) && p.name.getText(source) === name);
			if (property && ts.isPropertyAssignment(property)) result = property.initializer;
		}
		ts.forEachChild(node, visit);
	}
	visit(source); assert.ok(result, `${file}: report.${name} exists`); return result;
}

test('Build stages and specialized launcher gate policies survive wrapper integration', () => {
	const stages = buildStages({ environment: () => process.env });
	assert.deepEqual(stages.map(args => args[0].endsWith('npm-cli.js') ? args.slice(1).join(' ') : args.join(' ')), [
		'scripts/clean-output.mjs', 'run build --workspace @insrc/project-memory', 'node_modules/typescript/bin/tsc --inlineSources', 'run typecheck:tools', 'scripts/forbidden-spawn-scan.mjs --fail', 'scripts/check-model-definitions.mjs', 'copy-assets.mjs', 'scripts/build-installer-control.mjs',
	]);
	const expression = reportProperty('scripts/connection-management-regression.mjs', 'ready');
	const ready = new Function('build', 'sweep', 'sourceDrift', 'compiledDrift', `return (${expression.getText()});`);
	for (const build of [0, 1]) for (const sweep of [0, 1]) for (const source of [false, true]) for (const compiled of [false, true]) assert.equal(ready({ code: build }, { code: sweep }, source ? ['changed'] : [], compiled ? ['changed'] : []), build === 0 && sweep === 0 && !source && !compiled);
	assert.equal(reportProperty('scripts/connection-test-regression.mjs', 'releaseReady').kind, ts.SyntaxKind.FalseKeyword);
	const plugin = JSON.parse(readFileSync(join(ROOT, 'vscode-plugin/package.json'), 'utf8'));
	assert.equal(plugin.scripts.pretest, undefined);
	assert.equal(plugin.scripts.test, 'node ../scripts/test-harness/run.mjs --suite=vscode');
	assert.equal(plugin.scripts['sync-assets'], 'node ../scripts/sync-client-runtime-assets.mjs vscode');
	assert.deepEqual(parseArgs(ROOT, ['--suite=vscode', 'src/chat/__tests__/docs-review-panel.test.ts']).files, ['vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts']);
});

test('Specialized stages retain writer ownership and reader closure precedes later mutation', async t => {
	const root = mkdtempSync(join(tmpdir(), 'insrc-specialized-'));
	t.after(() => rmSync(root, { recursive: true, force: true }));
	mkdirSync(join(root, 'src/__tests__'), { recursive: true }); writeFileSync(join(root, 'src/__tests__/fixture.test.ts'), '');
	await withSpecializedOwnership(root, async execute => {
		assert.throws(() => createRun(root), { code: 'harness-busy' });
		const result = await execute(['-e', "const f=require('node:fs');if(!f.existsSync('.insrc/tmp/test-harness/active/writer')||process.env.INSRC_LIVE_TESTS!=='0')process.exit(9);process.stdout.write('writer held')"], join(root, 'stage.log'));
		assert.equal(result.code, 0);
		assert.equal(readFileSync(join(root, 'stage.log'), 'utf8'), 'writer held');
	});
	assert.equal(existsSync(join(root, '.insrc/tmp/test-harness/active')), false);
	const run = createRun(root);
	await withRun(run, async scope => {
		run.transition('reading');
		const pending = scope.start(run.runtime.executable, ['-e', 'setTimeout(()=>{},150)']);
		assert.throws(() => run.transition('mutating'), { code: 'harness-busy' });
		assert.equal((await pending).code, 0);
		run.transition('mutating');
	});
});

test('Native refusal and saved-mode controls remain enforced', { timeout: 120000 }, async () => {
	const selection = parseArgs(ROOT, ['--concurrency=1', '--test-name-pattern=^controller rejects lock replacement and unsafe records or control roots$|owner context is immutable lazy quiet', 'src/installer/__tests__/controller-store.test.ts', 'src/daemon/db/__tests__/driver-log-policy.test.ts']);
	const base = createRun(ROOT, { selectedFiles: selection.files, budgets: selection.budgets });
	const run = { ...base, environment: () => ({ ...base.environment(), INSRC_BUILD_CONFIRM_CLOSURE: '1' }) };
	const result = await withRun(run, scope => runHarness(ROOT, selection, {
		ownedRun: run, ownedScope: scope,
		testArgs: (file: string) => ['--import', 'tsx', '--test', '--test-force-exit', '--test-concurrency=1', '--test-reporter=tap', ...selection.testFlags, file],
	}));
	assert.equal(result.code, 0, JSON.stringify(result));
	assert.equal(result.results.length, 2);
	for (const file of result.results) {
		assert.equal(file.code, 0, file.log); assert.equal(file.coverage.status, 'reported');
		assert.equal(file.coverage.counts.pass, 1); assert.equal(file.coverage.counts.fail, 0);
		assert.equal(file.coverage.counts.cancelled, 0);
	}
	const cleanup = JSON.parse(readFileSync(join(result.workspace, 'cleanup.json'), 'utf8'));
	assert.equal(cleanup.confirmedClosed, true); assert.equal(cleanup.closureMode, 'owned-groups');
	assert.deepEqual(cleanup.evidenceErrors, []); assert.deepEqual(cleanup.cancellationErrors, []);
	assert.equal(existsSync(join(ROOT, '.insrc/tmp/test-harness/active')), false);
});
