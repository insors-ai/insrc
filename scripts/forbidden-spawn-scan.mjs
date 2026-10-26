#!/usr/bin/env node
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Build gate: report every place outside src/daemon/tools that runs git, gh or acli itself, or calls a
 * builtin tool's execute directly, instead of going through the tool registry (One tool registry epic, s7).
 *
 * Forms reported (the `form` of a site):
 *   direct-spawn      execFile, execFileSync, spawn, spawnSync, exec or execSync run on git, gh or acli
 *   shell-helper      runShell or runShellBytes with an argv array that starts with git, gh or acli
 *   injected-seam     any other call that passes git, gh or acli as its first argument (an injected exec function)
 *   wrapper-call      a call of a function imported from a wrapper module (WRAPPER_MODULES)
 *   builtin-execute   <importedBuiltinTool>.execute(...) outside the executor
 *
 * Report mode (the default) prints the sites and exits 0. `--fail` is failing mode: it exits 1 when any
 * site is listed (s10 turns it on). A file that cannot be parsed is listed as unscanned and the exit is 2 in
 * either mode, because a gap in the scan hides sites. src/daemon/tools is not read: the child_process inventory
 * test covers the inside. Test files are not read.
 *
 * Usage: node scripts/forbidden-spawn-scan.mjs [--root <dir>] [--fail] [--json]
 * The default root is src.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const here = dirname(fileURLToPath(import.meta.url));
const arg = (name) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; };
const root = resolve(arg('--root') ?? join(here, '..', 'src'));
const failing = process.argv.includes('--fail');
const asJson = process.argv.includes('--json');

const EXECUTABLES = new Set(['git', 'gh', 'acli']);
const SPAWNERS = new Set(['execFile', 'execFileSync', 'spawn', 'spawnSync', 'exec', 'execSync']);
const SHELL_HELPERS = new Set(['runShell', 'runShellBytes']);
/** Modules whose exports run git, gh or acli on the caller's behalf (the shell-calling wrappers). */
const WRAPPER_MODULES = [/(^|\/)workflow\/tracker\/github(\.js)?$/, /(^|\/)tracker\/github(\.js)?$/, /(^|\/)team\/git(-async)?(\.js)?$/, /(^|\/)\.\/git-async(\.js)?$/];
/** Imports of a builtin tool definition; a call of its execute is a direct call. */
const BUILTIN_MODULE = /tools\/builtins\//;

/** Relative to the root, with '/' separators: files that may spawn git themselves, each with its reason. */
const EXEMPT = new Map([
	['cli/services/maintenance.ts', 'the daemon self-update pulls and builds its own install directory, outside any repository the registry serves'],
	['daemon/installed-commit.ts', 'it reads the installed daemon\'s own commit at start-up, before the tool registry exists'],
	['indexer/index.ts', 'the indexer lists the files of a repository with git ls-files for its own file walk, not on behalf of a caller'],
]);

const SKIPPED_DIRS = new Set(['__tests__', '__type-tests__', 'node_modules']);

function* files(dir) {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name);
		const rel = relative(root, full).split(sep).join('/');
		if (entry.isDirectory()) {
			if (SKIPPED_DIRS.has(entry.name) || rel === 'daemon/tools') continue;
			yield* files(full);
		} else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
			yield { full, rel };
		}
	}
}

/** The text of a string-like node, or undefined. */
const textOf = (n) => (n !== undefined && (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) ? n.text : undefined);
const isExecutable = (s) => s !== undefined && EXECUTABLES.has(s);
/** A command string that starts with git, gh or acli followed by a space or the end. */
const commandStart = (s) => s !== undefined && EXECUTABLES.has(s.split(/\s/, 1)[0]);

/** The name a call is made through: `f(...)` is f, `a.b.f(...)` is f. */
function calleeName(expr) {
	if (ts.isIdentifier(expr)) return expr.text;
	if (ts.isPropertyAccessExpression(expr)) return expr.name.text;
	return undefined;
}

/** The sites of one source file, or the parse errors. */
function scanFile(text, fileName) {
	const parsed = ts.transpileModule(text, { fileName, reportDiagnostics: true, compilerOptions: { target: ts.ScriptTarget.ES2022 } });
	const syntax = (parsed.diagnostics ?? []).filter(d => d.category === ts.DiagnosticCategory.Error);
	if (syntax.length > 0) return { error: ts.flattenDiagnosticMessageText(syntax[0].messageText, '\n') };

	const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.ES2022, true, fileName.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
	const wrapperNames = new Set();
	const builtinNames = new Set();
	for (const st of sf.statements) {
		if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier)) continue;
		const spec = st.moduleSpecifier.text;
		const bindings = st.importClause?.namedBindings;
		if (st.importClause?.isTypeOnly || bindings === undefined) continue;
		const names = ts.isNamedImports(bindings)
			? bindings.elements.filter(e => !e.isTypeOnly).map(e => e.name.text)
			: [bindings.name.text];
		if (WRAPPER_MODULES.some(re => re.test(spec))) names.forEach(n => wrapperNames.add(n));
		if (BUILTIN_MODULE.test(spec)) names.forEach(n => builtinNames.add(n));
	}

	const sites = [];
	const add = (node, form) => {
		const { line, character } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
		sites.push({ line: line + 1, column: character + 1, form, text: node.getText(sf).split('\n')[0].slice(0, 120) });
	};
	const visit = (node) => {
		if (ts.isCallExpression(node)) {
			const name = calleeName(node.expression);
			const first = node.arguments[0];
			const firstArray = first !== undefined && ts.isArrayLiteralExpression(first) ? textOf(first.elements[0]) : undefined;
			if (name === 'execute' && ts.isPropertyAccessExpression(node.expression) && ts.isIdentifier(node.expression.expression) && builtinNames.has(node.expression.expression.text)) {
				add(node, 'builtin-execute');
			} else if (name !== undefined && SHELL_HELPERS.has(name) && isExecutable(firstArray)) {
				add(node, 'shell-helper');
			} else if (name !== undefined && SPAWNERS.has(name) && (isExecutable(textOf(first)) || (name.startsWith('exec') && !name.startsWith('execFile') && commandStart(textOf(first))))) {
				add(node, 'direct-spawn');
			} else if (isExecutable(textOf(first)) && name !== undefined) {
				add(node, 'injected-seam');
			} else if (ts.isIdentifier(node.expression) && wrapperNames.has(node.expression.text)) {
				add(node, 'wrapper-call');
			}
		}
		ts.forEachChild(node, visit);
	};
	visit(sf);
	return { sites };
}

const violations = [];
const exempt = [];
const unscanned = [];
for (const { full, rel } of files(root)) {
	const result = scanFile(readFileSync(full, 'utf8'), full);
	if (result.error !== undefined) { unscanned.push({ file: rel, reason: result.error }); continue; }
	if (result.sites.length === 0) continue;
	const reason = EXEMPT.get(rel);
	if (reason !== undefined) exempt.push({ file: rel, reason, sites: result.sites.length });
	else for (const s of result.sites) violations.push({ file: rel, ...s });
}
violations.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);

if (asJson) {
	process.stdout.write(`${JSON.stringify({ mode: failing ? 'failing' : 'report', violations, exempt, unscanned })}\n`);
} else {
	for (const v of violations) console.log(`[forbidden-spawn-scan] ${v.file}:${v.line}:${v.column} ${v.form}: ${v.text}`);
	for (const e of exempt) console.log(`[forbidden-spawn-scan] exempt ${e.file} (${e.sites}): ${e.reason}`);
	for (const u of unscanned) console.error(`[forbidden-spawn-scan] UNSCANNED ${u.file}: ${u.reason}`);
	console.log(`[forbidden-spawn-scan] ${violations.length} site(s) in ${failing ? 'failing' : 'report'} mode, ${exempt.length} exempt file(s), ${unscanned.length} unscanned`);
}
process.exit(unscanned.length > 0 ? 2 : failing && violations.length > 0 ? 1 : 0);
