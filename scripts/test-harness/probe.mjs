import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';
import { childEnvironment, harnessError, participantContext } from './context.mjs';
import { ROOT } from './build.mjs';
import { processScope } from './process.mjs';

/** Real-module type probes live outside normal source includes, under one run. */
export async function compileProbe({ root = ROOT, target, snippet, compiler = join(root, 'node_modules/typescript/bin/tsc'), budgetMs }) {
	const context = participantContext(root);
	if (context.phase !== 'reading') throw harnessError('context-invalid', 'Compiler probes require an admitted reader.');
	if (!existsSync(compiler)) throw harnessError('compiler-unavailable', 'Install the repository TypeScript compiler before running type probes.');
	const module = realpathSync(target), rel = relative(context.root, module);
	if (rel.startsWith('..') || isAbsolute(rel)) throw harnessError('context-invalid', 'Probe target must belong to the active checkout.');
	const directory = mkdtempSync(join(context.workspace, 'probe-')), file = join(directory, 'probe.ts');
	let specifier = relative(dirname(file), module).split(sep).join('/').replace(/\.tsx?$/, '.js');
	if (!specifier.startsWith('.')) specifier = `./${specifier}`;
	const run = { ...context, record: context, environment: () => childEnvironment(context.runtime), assertOwner: () => { if (participantContext(root).phase !== 'reading') throw harnessError('context-invalid', 'Probe reader phase changed.'); } };
	const scope = processScope(run, { includeForeignActors: false });
	let interrupted = false;
	const interrupt = () => { interrupted = true; scope.stop(); };
	process.on('SIGINT', interrupt); process.on('SIGTERM', interrupt);
	try {
		writeFileSync(file, snippet(specifier), { flag: 'wx' });
		const result = await scope.start(context.runtime.executable, [compiler, '--noEmit', '--strict', '--exactOptionalPropertyTypes', '--module', 'nodenext', '--moduleResolution', 'nodenext', '--target', 'es2022', file], { budgetMs: budgetMs ?? context.budgets.fileMs });
		const out = readFileSync(result.log, 'utf8');
		if (interrupted || result.interrupted) throw harnessError('interrupted', 'Compiler probe interrupted.');
		if (result.timedOut) throw harnessError('child-timeout', 'Compiler probe exceeded its budget.');
		if (result.launchError || (result.code !== 0 && !/error TS\d+:/.test(out))) throw harnessError('compiler-unavailable', `Compiler did not produce a type-check result; see ${result.log}`);
		return { ok: result.code === 0, out };
	} finally {
		const closed = await scope.drain();
		process.off('SIGINT', interrupt); process.off('SIGTERM', interrupt);
		if (closed) rmSync(directory, { recursive: true, force: true });
		else throw harnessError('cleanup-unconfirmed', 'Compiler disposal remains unconfirmed; its isolated workspace was retained.');
	}
}
