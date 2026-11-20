/** Ownership seam only. Callers retain their existing proof and readiness policy. */
import { closeSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createRun, harnessError } from './context.mjs';
import { withWriter } from './build.mjs';
import { actorsClosed, withRun } from './process.mjs';
import { parseArgs, runHarness } from './run.mjs';

export async function withSpecializedOwnership(root, work) {
	const selection = parseArgs(root, []);
	const run = createRun(root, { selectedFiles: selection.files, budgets: selection.budgets });
	const environment = run.environment;
	run.environment = () => ({ ...environment(), INSRC_LOG_LEVEL: 'error', INSRC_LIVE_TESTS: '0' });
	return withRun(run, async scope => {
		async function execute(args, output) {
			if (args.includes('--test')) {
				const files = args.filter(arg => arg.endsWith('.test.ts'));
				const selected = parseArgs(root, ['--concurrency=4', ...files]);
				const result = await runHarness(root, selected, { ownedRun: run, ownedScope: scope });
				const totals = Object.fromEntries(['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo'].map(key => [key, result.results.reduce((sum, file) => sum + (file.coverage.counts[key] ?? 0), 0)]));
				writeFileSync(output, result.results.map(file => readFileSync(resolve(root, file.log), 'utf8')).join('\n') + '\n' + Object.entries(totals).map(([key, value]) => `# ${key} ${value}`).join('\n') + '\n');
				if (!actorsClosed(run)) throw harnessError('cleanup-unconfirmed', 'Qualification readers have not all closed.');
				// Existing policy may publish its gate + copy assets after all readers.
				run.transition('mutating');
				return { code: result.code, signal: null, args: ['scripts/test-harness/run.mjs', '--concurrency=4', ...files], coordinator: { runId: run.runId, report: join(run.workspace, 'results.json') } };
			}
			const fd = openSync(output, 'w', 0o600);
			try {
				return await withWriter(run, scope, async () => {
					const result = await scope.start(run.runtime.executable, args, { env: { ...run.environment(), INSRC_LOG_LEVEL: 'error', INSRC_LIVE_TESTS: '0' }, budgetMs: run.budgets.buildMs, stdout: fd, stderr: fd, logPath: output });
					if (result.timedOut || result.interrupted) throw harnessError('child-timeout', 'Qualification stage did not finish; policy remains unqualified.');
					return result;
				});
			} finally { closeSync(fd); }
		}
		return work(execute);
	});
}
