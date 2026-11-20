import { globSync, openSync, closeSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRun, checkedBudgets, harnessError } from './context.mjs';
import { fingerprint, inputFingerprint, npmEntrypoint, prepareBuild, publishPrepared, ROOT } from './build.mjs';
import { withRun } from './process.mjs';

export const MUTATION_FILE = 'src/daemon/__tests__/review-retirement-package.test.ts';

export function selectFiles(root, selectors) {
	const canonicalRoot = realpathSync(root);
	const files = new Set();
	for (const selector of selectors) {
		const matches = /[*?{}\[\]]/.test(selector) ? globSync(selector, { cwd: canonicalRoot }) : [selector];
		if (matches.length === 0) throw harnessError('context-invalid', `No selected tests: ${selector}`);
		for (const match of matches) {
			const path = realpathSync(resolve(canonicalRoot, match)), rel = relative(canonicalRoot, path);
			if (rel.startsWith('..') || isAbsolute(rel) || !rel.endsWith('.test.ts')) throw harnessError('context-invalid', 'Select repository .test.ts files only.');
			files.add(rel);
		}
	}
	if (!files.size) throw harnessError('context-invalid', 'No test files selected.');
	return [...files].sort();
}

export function parseArgs(root, args) {
	const selectors = [], testFlags = [], budgets = {};
	let suite = 'backend', concurrency = 2;
	for (const arg of args) {
		if (arg === '--') continue;
		if (arg === '--suite=vscode') suite = 'vscode';
		else if (arg === '--suite=backend') suite = 'backend';
		else if (arg.startsWith('--concurrency=')) concurrency = Number(arg.slice('--concurrency='.length));
		else if (/^--(build|file|run|cleanup)-ms=/.test(arg)) { const [key, value] = arg.slice(2).split('='); budgets[key.replace('-ms', 'Ms')] = Number(value); }
		else if (/^--test-(name-pattern|skip-pattern|reporter|reporter-destination)=/.test(arg)) testFlags.push(arg);
		else if (arg.startsWith('-')) throw harnessError('context-invalid', `Unsupported harness option: ${arg}`);
		else selectors.push(arg);
	}
	if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 4) throw harnessError('context-invalid', 'Concurrency must be 1–4.');
	const files = selectFiles(root, selectors.length ? selectors : [suite === 'vscode' ? 'vscode-plugin/src/**/__tests__/*.test.ts' : 'src/**/__tests__/*.test.ts']);
	if (files.length > 1 && testFlags.some(flag => flag.startsWith('--test-reporter-destination='))) throw harnessError('context-invalid', 'A reporter destination requires exactly one selected file.');
	return { files, testFlags, concurrency, budgets: checkedBudgets(budgets), suite };
}

export async function runHarness(root, selection, { buildOptions, testArgs, syncAssets = selection.suite === 'vscode' } = {}) {
	const argsForTest = testArgs ?? (file => ['--import', 'tsx', '--test', '--test-concurrency=1', '--test-reporter=tap', ...selection.testFlags, file]);
	const run = createRun(root, { selectedFiles: selection.files, budgets: selection.budgets });
	const results = [];
	const report = { runId: run.runId, runtime: run.runtime, budgets: run.budgets, selectedFiles: selection.files, diagnosticFlags: run.record.diagnosticFlags, liveTests: process.env.INSRC_LIVE_TESTS ?? 'unset', results, cleanupPath: relative(run.root, join(run.workspace, 'cleanup.json')), incomplete: true };
	const save = () => writeFileSync(join(run.workspace, 'results.json'), JSON.stringify(report, null, 2) + '\n');
	try {
		return await withRun(run, async scope => {
			if (syncAssets) {
				const result = await scope.start(run.runtime.executable, [npmEntrypoint(run.environment()), 'run', 'sync-assets', '--prefix', 'vscode-plugin'], { budgetMs: run.budgets.buildMs });
				if (result.code !== 0) throw harnessError('build-failed', 'VSCode asset synchronization failed.');
			}
			await prepareBuild(run, scope, buildOptions);
			const preparedInput = inputFingerprint(run.root);
			async function execute(file) {
				const log = join(run.workspace, `${results.length}-${file.replaceAll('/', '_')}.log`), fd = openSync(log, 'wx', 0o600);
				try {
					const result = await scope.start(run.runtime.executable, argsForTest(file), { budgetMs: run.budgets.fileMs, stdout: fd, stderr: fd, logPath: log });
					const destination = selection.testFlags.find(flag => flag.startsWith('--test-reporter-destination='))?.split('=').slice(1).join('=');
					let text = '', coverageError;
					try { text = readFileSync(destination ? resolve(run.root, destination) : log, 'utf8'); } catch (error) { coverageError = error.code; }
					const counts = Object.fromEntries(['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo'].map(name => [name, [...text.matchAll(new RegExp(`^# ${name} (\\d+)$`, 'gm'))].at(-1)?.[1]]).filter(([, value]) => value !== undefined).map(([name, value]) => [name, Number(value)]));
					const coverageIncomplete = testArgs === undefined && !Object.hasOwn(counts, 'tests');
					const fileResult = { file, ...result, log: relative(run.root, log), coverageIncomplete, coverage: { status: Object.hasOwn(counts, 'tests') ? 'reported' : 'unavailable', counts, ...(coverageError ? { error: coverageError } : {}) } };
					results.push(fileResult);
					process.stdout.write(`${file}: ${result.code === 0 && !result.timedOut && !coverageIncomplete ? 'passed' : 'failed/incomplete'} (${relative(run.root, log)})\n`);
					return fileResult;
				} finally { closeSync(fd); save(); }
			}
			if (selection.files.includes(MUTATION_FILE)) {
				run.transition('mutating');
				const result = await execute(MUTATION_FILE);
				if (result.code !== 0 || result.timedOut || result.coverageIncomplete) throw harnessError('test-failed', 'Output-mutating regression failed; readers were not admitted.');
				if (inputFingerprint(run.root) !== preparedInput) throw harnessError('build-drift', 'Source changed during the mutation lane.');
				publishPrepared(run, buildOptions?.requiredArtifacts);
			}
			run.transition('reading');
			const prepared = JSON.parse(readFileSync(join(run.workspace, 'prepared.json'), 'utf8'));
			const readers = selection.files.filter(file => file !== MUTATION_FILE);
			let cursor = 0;
			async function worker() {
				while (cursor < readers.length && !scope.stopped) {
					const file = readers[cursor++];
					const result = await execute(file);
					if (result.unconfirmed || result.interrupted || result.timedOut || result.coverageIncomplete) scope.stop();
				}
			}
			await Promise.all(Array.from({ length: Math.min(selection.concurrency, readers.length) }, worker));
			if (fingerprint(run.root, ['out', 'packages/project-memory/dist']) !== prepared.outputFingerprint) throw harnessError('build-drift', 'Output changed while tests were reading.');
			if (inputFingerprint(run.root) !== prepared.inputFingerprint) throw harnessError('build-drift', 'Source changed during validation.');
			report.incomplete = scope.stopped || results.length !== selection.files.length || results.some(result => result.timedOut || result.interrupted || result.unconfirmed || result.coverageIncomplete);
			save();
			return { runId: run.runId, workspace: run.workspace, results, code: report.incomplete || results.some(result => result.code !== 0) ? 1 : 0 };
		});
	} catch (error) { report.error = { code: error.code, message: error.message }; report.incomplete = true; save(); throw error; }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
	try { const result = await runHarness(ROOT, parseArgs(ROOT, process.argv.slice(2))); process.exitCode = result.code; }
	catch (error) { process.stderr.write(`${error.code ?? 'harness-failed'}: ${error.message}\n`); process.exitCode = 1; }
}
