import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, globSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createRun } from '../test-harness/context.mjs';
import { ROOT } from '../test-harness/build.mjs';
import { withRun } from '../test-harness/process.mjs';
import { parseArgs, runHarness } from '../test-harness/run.mjs';
import { waitFor } from '../../src/daemon/tools/__tests__/_proc.js';

test('Real panel type probes preserve positive and intended-negative diagnostics', { timeout: 180000 }, async () => {
	const before = globSync('vscode-plugin/src/**/__sc4probe*', { cwd: ROOT });
	const result = await runHarness(ROOT, parseArgs(ROOT, ['--suite=vscode', "--test-name-pattern=t3: the 'absent'|t3: an unhandled companion", 'vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts']));
	assert.equal(result.code, 0, JSON.stringify(result));
	assert.equal(result.results[0].coverage.counts.pass, 2);
	assert.equal(result.results[0].coverage.counts.fail, 0);
	assert.deepEqual(globSync('vscode-plugin/src/**/__sc4probe*', { cwd: ROOT }), before);
	assert.equal(readdirSync(result.workspace).some(name => name.startsWith('probe-')), false);
});

test('Compiler launch failure and interruption cannot pass a negative probe or pollute source includes', { timeout: 45000 }, async () => {
	const root = mkdtempSync('/tmp/insrc-probe-'), run = createRun(root, { budgets: { fileMs: 5000, cleanupMs: 2000 } });
	mkdirSync(join(root, 'src')); writeFileSync(join(root, 'src/types.ts'), 'export interface Value { state: string }');
	writeFileSync(join(root, 'package.json'), '{"type":"module"}');
	writeFileSync(join(root, 'compiler-noise.mjs'), "process.stderr.write('not a compiler diagnostic');process.exitCode=1;");
	writeFileSync(join(root, 'compiler-hang.mjs'), "import fs from 'node:fs';fs.writeFileSync('compiler-ready','yes');setInterval(()=>{},1000);");
	const module = pathToFileURL(resolve('scripts/test-harness/probe.mjs')).href;
	const invoke = (compiler: string, code: string, budgetMs = 1000) => `import {compileProbe} from ${JSON.stringify(module)};try{await compileProbe({root:process.cwd(),target:'src/types.ts',compiler:${JSON.stringify(join(root, compiler))},snippet:()=>'',budgetMs:${budgetMs}});process.exitCode=9}catch(e){process.stderr.write(e.code);process.exitCode=e.code===${JSON.stringify(code)}?0:8}`;
	try {
		await withRun(run, async scope => {
			run.transition('reading');
			for (const [compiler, code, budget] of [['missing.mjs', 'harness-compiler-unavailable', 1000], ['compiler-noise.mjs', 'harness-compiler-unavailable', 1000], ['compiler-hang.mjs', 'harness-child-timeout', 100]] as const) {
				const result = await scope.start(run.runtime.executable, ['--input-type=module', '-e', invoke(compiler, code, budget)]);
				assert.equal(result.code, 0, readFileSync(result.log, 'utf8'));
				assert.equal(readdirSync(run.workspace).some(name => name.startsWith('probe-')), false);
			}
			rmSync(join(root, 'compiler-ready'), { force: true });
			const interrupted = scope.start(run.runtime.executable, ['--input-type=module', '-e', invoke('compiler-hang.mjs', 'harness-interrupted', 5000)]);
			assert.equal(await waitFor(() => existsSync(join(root, 'compiler-ready'))), true);
			scope.stop(); await interrupted;
		});
		assert.equal(existsSync(run.active), false);
		assert.equal(readdirSync(run.workspace).some(name => name.startsWith('probe-')), false);
		assert.deepEqual(globSync('src/**/probe*.ts', { cwd: root }), []);
		assert.equal(JSON.parse(readFileSync(join(run.workspace, 'cleanup.json'), 'utf8')).confirmedClosed, true);
		const compiled = spawnSync(run.runtime.executable, [join(ROOT, 'node_modules/typescript/bin/tsc'), '--noEmit', '--listFiles', '-p', 'vscode-plugin/tsconfig.json'], { cwd: ROOT, encoding: 'utf8', timeout: 30000, maxBuffer: 8 * 1024 * 1024 });
		assert.equal(compiled.status, 0, compiled.stdout + compiled.stderr);
		assert.match(compiled.stdout, /vscode-plugin[/\\]src[/\\]chat[/\\]docs-review-panel\.ts/);
		assert.doesNotMatch(compiled.stdout, /__sc4probe_|test-harness[/\\]runs[/\\].*probe-/);
	} finally { rmSync(root, { recursive: true, force: true }); }
});
