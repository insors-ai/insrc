import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmdirSync, writeFileSync } from 'node:fs';
import { delimiter, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRun, harnessError, participantContext } from './context.mjs';
import { processScope, withRun } from './process.mjs';

export const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const REQUIRED_ARTIFACTS = ['out/daemon/index.js', 'out/bin/insrc-mcp.js',
	'out/shared/daemon-run-files.js', 'out/cli/services/daemon.js',
	'out/daemon/server.js', 'out/shared/daemon-process.js', 'out/installer/native/control.node'];
const REQUIRED = REQUIRED_ARTIFACTS;
export const BUILD_INPUTS = ['src', 'scripts', 'packages/project-memory/src', 'packages/project-memory/package.json', 'packages/project-memory/tsconfig.json', 'package.json', 'package-lock.json', 'tsconfig.json', 'tsconfig.typecheck.json', 'copy-assets.mjs', 'vscode-plugin/src', 'vscode-plugin/package.json', '.npmrc', '.nvmrc'];
const INPUTS = BUILD_INPUTS;
export const inputFingerprint = root => fingerprint(root, INPUTS);

export function fingerprint(root, paths) {
	const hash = createHash('sha256');
	function visit(path) {
		const absolute = join(root, path);
		if (!existsSync(absolute)) { hash.update(`missing:${path}\0`); return; }
		const stat = lstatSync(absolute);
		if (stat.isSymbolicLink()) throw harnessError('context-invalid', `Fingerprint path is symlinked: ${path}`);
		if (stat.isDirectory()) { for (const name of readdirSync(absolute).sort()) visit(join(path, name)); }
		else if (stat.isFile()) { hash.update(`${path}\0${stat.size}\0`); hash.update(readFileSync(absolute)); }
	}
	for (const path of paths) visit(path);
	return hash.digest('hex');
}

export function npmEntrypoint(env) {
	for (const directory of (env.PATH ?? '').split(delimiter)) {
		const candidate = join(directory, 'npm');
		if (existsSync(candidate)) return realpathSync(candidate);
	}
	throw harnessError('compiler-unavailable', 'npm is required on the selected Node runtime PATH.');
}

export function buildStages(run, { npmCli } = {}) {
	if (npmCli !== undefined && (!isAbsolute(npmCli) || !existsSync(npmCli) || !lstatSync(npmCli).isFile() || lstatSync(npmCli).isSymbolicLink())) throw harnessError('compiler-unavailable', 'Explicit npm CLI must be an absolute regular file.');
	const npm = npmCli ?? npmEntrypoint(run.environment());
	return [
		['scripts/clean-output.mjs'],
		[npm, 'run', 'build', '--workspace', '@insrc/project-memory'],
		['node_modules/typescript/bin/tsc', '--inlineSources'],
		[npm, 'run', 'typecheck:tools'],
		['scripts/forbidden-spawn-scan.mjs', '--fail'],
		['scripts/check-model-definitions.mjs'], ['copy-assets.mjs'], ['scripts/build-installer-control.mjs'],
	];
}

export function publishPrepared(run, requiredArtifacts = REQUIRED) {
	run.assertOwner();
	if (!['preparing', 'mutating'].includes(run.record.phase)) throw harnessError('write-during-read', 'Cannot refresh prepared output in the reader phase.');
	for (const path of requiredArtifacts) if (!existsSync(join(run.root, path))) throw harnessError('build-incomplete', `Missing compiled helper: ${path}`);
	const prepared = { runId: run.runId, canonicalRoot: run.root, runtimeExecutable: run.runtime.executable, buildExitCode: 0, completedAt: new Date().toISOString(), inputFingerprint: fingerprint(run.root, INPUTS), outputFingerprint: fingerprint(run.root, ['out', 'packages/project-memory/dist']), requiredArtifacts };
	writeFileSync(join(run.workspace, 'prepared.json'), JSON.stringify(prepared, null, 2) + '\n', { mode: 0o600 });
	return prepared;
}

export function requirePreparedBuild(root = ROOT) {
	const context = participantContext(root);
	if (context.phase !== 'reading') throw harnessError('context-invalid', 'Prepared readers are admitted only in the reading phase.');
	const prepared = JSON.parse(readFileSync(join(context.workspace, 'prepared.json'), 'utf8'));
	if (prepared.runId !== context.runId || prepared.canonicalRoot !== context.root || prepared.runtimeExecutable !== context.runtime.executable || prepared.buildExitCode !== 0
		|| prepared.inputFingerprint !== fingerprint(context.root, INPUTS) || prepared.outputFingerprint !== fingerprint(context.root, ['out', 'packages/project-memory/dist'])
		|| !Array.isArray(prepared.requiredArtifacts) || prepared.requiredArtifacts.some(path => !existsSync(join(context.root, path)))) throw harnessError('build-drift', 'Prepared output changed or is incomplete; rerun the supported coordinator selector.');
	return prepared;
}

export async function withWriter(run, scope, work) {
	run.assertOwner();
	if (!['preparing', 'mutating'].includes(run.record.phase)) throw harnessError('write-during-read', 'Build may run only in the admitted writer phase.');
	const writer = join(run.active, 'writer');
	try { mkdirSync(writer); } catch (error) { if (error.code === 'EEXIST') throw harnessError('busy', 'Another writer is active.'); throw error; }
	let completed = false;
	try {
		const result = await work();
		completed = true;
		return result;
	} finally {
		// A deadline returns before close. Keep writer ownership through draining.
		const closed = completed || await scope.drain();
		run.assertOwner();
		if (closed) rmdirSync(writer);
	}
}

export async function prepareBuild(run, scope, { npmCli, stages = buildStages(run, { npmCli }), requiredArtifacts = REQUIRED } = {}) {
	return withWriter(run, scope, async () => {
		const before = fingerprint(run.root, INPUTS);
		const started = performance.now();
		for (const args of stages) {
			const remaining = run.budgets.buildMs - (performance.now() - started);
			if (remaining <= 0) throw harnessError('child-timeout', 'Build ceiling exceeded.');
			const result = await scope.start(run.runtime.executable, args, { budgetMs: remaining, env: run.environment() });
			if (result.code !== 0 || result.timedOut || result.interrupted || result.launchError) throw harnessError('build-failed', `Build stage failed: ${relative(run.root, resolve(run.root, args[0]))}; ${JSON.stringify(result)}`);
		}
		if (before !== fingerprint(run.root, INPUTS)) throw harnessError('build-drift', 'Build input changed during preparation.');
		return publishPrepared(run, requiredArtifacts);
	});
}

export async function mainBuild(root = ROOT) {
	if (process.env.INSRC_TEST_RUN_ID) {
		const context = participantContext(root);
		if (!['preparing', 'mutating'].includes(context.phase)) throw harnessError('write-during-read', 'A test reader cannot rebuild shared output.');
		// A nested writer consumes existing ownership and never releases its parent.
		const run = { ...context, record: context, environment: () => ({ ...process.env }), assertOwner: () => { const current = participantContext(root); if (current.phase !== context.phase) throw harnessError('context-invalid', 'Writer phase changed.'); } };
		const scope = processScope(run, { includeForeignActors: false });
		try { return await prepareBuild(run, scope); }
		finally { if (!await scope.drain()) throw harnessError('cleanup-unconfirmed', 'Nested build did not close.'); }
	}
	const run = createRun(root, { mode: 'build' });
	return withRun(run, scope => prepareBuild(run, scope));
}

// esbuild rebases import.meta.url to the control bundle. Only the actual source
// CLI may start a build; importing these helpers in a manager must stay inert.
if (/[\\/]scripts[\\/]test-harness[\\/]build\.mjs$/i.test(fileURLToPath(import.meta.url))
  && process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
	try { await mainBuild(); } catch (error) { process.stderr.write(`${error.code ?? 'harness-build-failed'}: ${error.message}\n`); process.exitCode = 1; }
}
