/**
 * No floating tracker promise (Story s10): the TypeScript compiler finds no call of a TrackerPort or IssueOps method, of a CloseIssue or of a
 * tracker loader whose promise is dropped (used as a statement, neither awaited, returned, voided nor caught). A value read from a dropped promise
 * (`port.whoAmI().ok`) does not compile, so the statement form is the one that can hide.
 * Run: npx tsx --test-force-exit src/workflow/tracker/__tests__/no-floating-promises.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

const PORT_METHODS = new Set([
	'whoAmI', 'readAssignee', 'setAssignee', 'addAssignee', 'createIssue', 'findIssue', 'findIssues', 'findIssuesByTitleToken', 'listComments',
	'postComment', 'attach', 'openSignoffRequest', 'readSignoffState', 'readSignoffRequest',
	'create', 'linkSubIssue', 'resolveIssueId', 'close', 'comment', 'readBody', 'writeBody', 'ensureLabel', 'ensureMilestone', 'attachMilestone',
]);
const FUNCTION_TYPES = new Set(['CloseIssue', 'LoadTracker']);

/** The statements in `program` that drop the promise of a tracker call. */
export function floatingTrackerCalls(program: ts.Program, include: (file: string) => boolean): string[] {
	const checker = program.getTypeChecker();
	const found: string[] = [];
	for (const file of program.getSourceFiles()) {
		if (file.isDeclarationFile || !include(file.fileName)) continue;
		const visit = (node: ts.Node): void => {
			if (ts.isExpressionStatement(node) && ts.isCallExpression(node.expression)) {
				const call = node.expression;
				const type = checker.getTypeAtLocation(call);
				const isPromise = (type.symbol?.name ?? '') === 'Promise';
				const callee = call.expression;
				const byMethod = ts.isPropertyAccessExpression(callee) && PORT_METHODS.has(callee.name.text)
					&& (checker.getTypeAtLocation(callee.expression).getProperty('kind') !== undefined || /TrackerPort|IssueOps|issueOps|port|tracker/i.test(callee.expression.getText()));
				const calleeType = checker.getTypeAtLocation(callee);
				const aliasName = calleeType.aliasSymbol?.name ?? '';
				const byAlias = FUNCTION_TYPES.has(aliasName);
				if (isPromise && (byMethod || byAlias)) {
					const { line } = file.getLineAndCharacterOfPosition(node.getStart());
					found.push(`${file.fileName}:${line + 1}: ${node.getText().slice(0, 80)}`);
				}
			}
			ts.forEachChild(node, visit);
		};
		visit(file);
	}
	return found;
}

function programOf(files: readonly string[], options: ts.CompilerOptions): ts.Program {
	return ts.createProgram([...files], options);
}

test('no-floating-promises.test.ts: the compiler-API scan finds no unawaited TrackerPort, IssueOps, CloseIssue or loader call', () => {
	const configPath = join(ROOT, 'tsconfig.json');
	const cfg = ts.getParsedCommandLineOfConfigFile(configPath, {}, { ...ts.sys, onUnRecoverableConfigFileDiagnostic: d => { throw new Error(ts.flattenDiagnosticMessageText(d.messageText, '\n')); } })!;
	const program = ts.createProgram(cfg.fileNames.filter(f => !/__tests__|\.test\./.test(f)), cfg.options);
	const found = floatingTrackerCalls(program, f => f.startsWith(join(ROOT, 'src')) && !/__tests__|\.test\./.test(f));
	assert.deepEqual(found.map(f => relative(ROOT, f)), []);
});

test('no-floating-promises.test.ts: the scan reports a dropped port call, a dropped issue-op call and a dropped CloseIssue or loader, and accepts the awaited and returned forms', () => {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-floating-'));
	try {
		mkdirSync(dir, { recursive: true });
		const file = join(dir, 'sample.ts');
		writeFileSync(file, `
type R<T> = { ok: true; value: T } | { ok: false; reason: string };
interface IssueOps { close(issue: string): Promise<R<void>>; comment(issue: string, body: string): Promise<R<void>>; }
interface TrackerPort { kind: string; issueOps: IssueOps; whoAmI(): Promise<R<string>>; }
type CloseIssue = (issue: string) => Promise<{ ok: boolean }>;
type LoadTracker = (repo: string) => Promise<R<TrackerPort>>;
declare const port: TrackerPort; declare const closeIssue: CloseIssue; declare const load: LoadTracker;
export async function bad(): Promise<void> {
	port.whoAmI();
	port.issueOps.close('o/r#1');
	closeIssue('o/r#1');
	load('/r');
}
export async function good(): Promise<unknown> {
	await port.whoAmI();
	void port.issueOps.comment('o/r#1', 'x');
	const r = await load('/r');
	return port.issueOps.close('o/r#1');
}
`);
		const found = floatingTrackerCalls(programOf([file], { strict: true, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, noEmit: true }), f => f === file);
		assert.equal(found.length, 4, found.join('\n'));
		assert.ok(found.every(f => /bad|port\.|closeIssue|load/.test(f)));
	} finally { rmSync(dir, { recursive: true, force: true }); }
});

/** The statements in `program` that drop the result of a PolicyReader call (a value or a Promise) without awaiting it. */
export function floatingPolicyReads(program: ts.Program, include: (file: string) => boolean): string[] {
	const checker = program.getTypeChecker();
	const found: string[] = [];
	for (const file of program.getSourceFiles()) {
		if (file.isDeclarationFile || !include(file.fileName)) continue;
		const visit = (node: ts.Node): void => {
			if (ts.isExpressionStatement(node) && ts.isCallExpression(node.expression)) {
				const call = node.expression;
				const calleeType = checker.getTypeAtLocation(call.expression);
				const nonNull = calleeType.getNonNullableType();
				const isReader = (nonNull.aliasSymbol?.name ?? '') === 'PolicyReader'
					|| (nonNull.isUnion() && nonNull.types.some(t => (t.aliasSymbol?.name ?? '') === 'PolicyReader'))
					|| /\b(policyReader|readPolicy)\b/.test(call.expression.getText());
				const type = checker.getTypeAtLocation(call);
				const mayBePromise = (type.isUnion() ? type.types : [type]).some(t => (t.symbol?.name ?? '') === 'Promise');
				if (isReader && mayBePromise) {
					const { line } = file.getLineAndCharacterOfPosition(node.getStart());
					found.push(`${file.fileName}:${line + 1}: ${node.getText().slice(0, 80)}`);
				}
			}
			ts.forEachChild(node, visit);
		};
		visit(file);
	}
	return found;
}

test('no-floating-promises.test.ts: the PolicyReader readers await the widened return', () => {
	// (1) the production tree drops no PolicyReader call
	const configPath = join(ROOT, 'tsconfig.json');
	const cfg = ts.getParsedCommandLineOfConfigFile(configPath, {}, { ...ts.sys, onUnRecoverableConfigFileDiagnostic: d => { throw new Error(ts.flattenDiagnosticMessageText(d.messageText, '\n')); } })!;
	const program = ts.createProgram(cfg.fileNames.filter(f => !/__tests__|\.test\./.test(f)), cfg.options);
	const found = floatingPolicyReads(program, f => f.startsWith(join(ROOT, 'src')) && !/__tests__|\.test\./.test(f));
	assert.deepEqual(found.map(f => relative(ROOT, f)), []);

	// (2) the scan reports a dropped reader call and accepts the awaited and returned forms; a value read from an un-awaited result does not compile
	const dir = mkdtempSync(join(tmpdir(), 'insrc-floating-policy-'));
	try {
		const file = join(dir, 'sample.ts');
		writeFileSync(file, `
type PolicyResult<T> = { ok: true; value: T } | { ok: false; reason: string };
type PolicyReader = (repo: string, opts?: { signal?: AbortSignal }) => Promise<PolicyResult<string>>;
declare const policyReader: PolicyReader; declare const injected: PolicyReader | undefined;
export async function bad(): Promise<void> {
	policyReader('/r');
	(injected ?? policyReader)('/r');
}
export async function good(): Promise<unknown> {
	const a = await policyReader('/r');
	const b = await (injected ?? policyReader)('/r');
	void policyReader('/r');
	return [a, b, policyReader('/r')];
}
export function unawaited(): boolean { return policyReader('/r').ok; }
`);
		const options: ts.CompilerOptions = { strict: true, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, noEmit: true };
		const sample = ts.createProgram([file], options);
		const dropped = floatingPolicyReads(sample, f => f === file);
		assert.equal(dropped.length, 2, dropped.join('\n'));
		const errors = ts.getPreEmitDiagnostics(sample).filter(d => d.file?.fileName === file);
		assert.ok(errors.some(d => /does not exist on type|Property 'ok'/.test(ts.flattenDiagnosticMessageText(d.messageText, '\n'))), 'reading .ok of an un-awaited result is a type error');
	} finally { rmSync(dir, { recursive: true, force: true }); }
});

/** The functions of the build runners, the validation checks, the ignore filter, the companion header and the convert plan whose git reads move onto the tools (Story s9). */
export const RUNNER_FUNCTIONS = new Set([
	'commitExists', 'headFullSha', 'introducingCommit', 'resolveStoryRangeEnd', 'readBuildStart', 'stampBuildStart', 'resolveStoryRangeBase',
	'headShortSha', 'priorCommit', 'newestStoryCommit', 'storyChangeSet', 'mergeInProgress', 'trackedFiles', 'changedFiles', 'trivialCheckPlan',
	'withTypecheckProjects', 'storyFiles', 'storyCommit', 'createRepoIgnoreFilter', 'defaultGitUserName', 'prepareBuildRecord',
]);

/** The statements in `program` that call one of `names` and drop its Promise. */
export function floatingNamedCalls(program: ts.Program, include: (file: string) => boolean, names: ReadonlySet<string>): string[] {
	const checker = program.getTypeChecker();
	const found: string[] = [];
	for (const file of program.getSourceFiles()) {
		if (file.isDeclarationFile || !include(file.fileName)) continue;
		const visit = (node: ts.Node): void => {
			if (ts.isExpressionStatement(node) && ts.isCallExpression(node.expression) && ts.isIdentifier(node.expression.expression) && names.has(node.expression.expression.text)) {
				if ((checker.getTypeAtLocation(node.expression).symbol?.name ?? '') === 'Promise') {
					const { line } = file.getLineAndCharacterOfPosition(node.getStart());
					found.push(`${file.fileName}:${line + 1}: ${node.getText().slice(0, 80)}`);
				}
			}
			ts.forEachChild(node, visit);
		};
		visit(file);
	}
	return found;
}

test('no-floating-promises.test.ts: the callers of the runners await the widened return', () => {
	const configPath = join(ROOT, 'tsconfig.json');
	const cfg = ts.getParsedCommandLineOfConfigFile(configPath, {}, { ...ts.sys, onUnRecoverableConfigFileDiagnostic: d => { throw new Error(ts.flattenDiagnosticMessageText(d.messageText, '\n')); } })!;
	const program = ts.createProgram(cfg.fileNames.filter(f => !/__tests__|\.test\./.test(f)), cfg.options);
	const found = floatingNamedCalls(program, f => f.startsWith(join(ROOT, 'src')) && !/__tests__|\.test\./.test(f), RUNNER_FUNCTIONS);
	assert.deepEqual(found.map(f => relative(ROOT, f)), []);

	const dir = mkdtempSync(join(tmpdir(), 'insrc-floating-runner-'));
	try {
		const file = join(dir, 'sample.ts');
		writeFileSync(file, `
declare function headFullSha(cwd: string): Promise<string | undefined>;
declare function mergeInProgress(cwd: string): Promise<boolean>;
declare function other(cwd: string): Promise<void>;
export async function bad(): Promise<void> { headFullSha('/r'); mergeInProgress('/r'); other('/r'); }
export async function good(): Promise<unknown> { await headFullSha('/r'); void mergeInProgress('/r'); return headFullSha('/r'); }
`);
		const sample = ts.createProgram([file], { strict: true, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, noEmit: true });
		const dropped = floatingNamedCalls(sample, f => f === file, RUNNER_FUNCTIONS);
		assert.equal(dropped.length, 2, dropped.join('\n'));
	} finally { rmSync(dir, { recursive: true, force: true }); }
});
