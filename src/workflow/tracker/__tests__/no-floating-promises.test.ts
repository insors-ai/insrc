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
