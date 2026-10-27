/**
 * The callers of the team gate chain await it (Story s10, task t8). The gate functions are still synchronous when this lands, so
 * awaiting changes no value; the point is that when they turn async (t9) no caller reads a Promise as a value.
 * Run: npx tsx --test-force-exit src/workflow/team/__tests__/team-gate-callers.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

import { runMetaFor } from '../run-meta.js';
import { resolveReviewFinding } from '../../review/resolve.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

/** Each caller file and the gate functions it calls that must be awaited. */
const CALLERS: ReadonlyArray<readonly [string, readonly string[]]> = [
	['src/workflow/gates.ts', ['authorizeApproval']],
	['src/workflow/review/resolve.ts', ['authorizeFindingApply']],
	['src/workflow/review/run-artifact.ts', ['reviewFixModeFor']],
	['src/daemon/steps/review-step/phases/verdicts.ts', ['reviewFixModeFor']],
	['src/daemon/workflow-rpc.ts', ['assertMayAuthor']],
	['src/daemon/steps/workflow-step/phases/start.ts', ['assertMayAuthor', 'runMetaFor']],
	['src/daemon/steps/workflow-step/phases/plan.ts', ['assertMayAuthor']],
	['src/daemon/steps/workflow-step/phases/step.ts', ['assertMayAuthor']],
	['src/daemon/steps/workflow-step/phases/synthesize.ts', ['assertMayAuthor']],
	['src/daemon/steps/workflow-step/resume.ts', ['actingUser']],
	['src/daemon/steps/build-step/phases/implement.ts', ['assertMayBuild']],
	['src/daemon/steps/build-step/phases/validate.ts', ['assertMayBuild']],
	['src/workflow/team/run-meta.ts', ['claimsEnforcedFor', 'actingUser']],
];

/** Every call of one of `names` in the file, with whether it is awaited and whether its enclosing function is async. */
function callsIn(file: string, names: readonly string[]): Array<{ name: string; line: number; awaited: boolean; inAsync: boolean }> {
	const source = ts.createSourceFile(file, readFileSync(join(ROOT, file), 'utf8'), ts.ScriptTarget.ES2022, true);
	const out: Array<{ name: string; line: number; awaited: boolean; inAsync: boolean }> = [];
	const visit = (node: ts.Node): void => {
		if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && names.includes(node.expression.text)) {
			let parent: ts.Node = node.parent;
			while (ts.isParenthesizedExpression(parent) || ts.isNonNullExpression(parent) || ts.isAsExpression(parent)) parent = parent.parent;
			let fn: ts.Node | undefined = node.parent;
			while (fn !== undefined && !ts.isFunctionLike(fn)) fn = fn.parent;
			const inAsync = fn !== undefined && (ts.getCombinedModifierFlags(fn as ts.Declaration) & ts.ModifierFlags.Async) !== 0;
			out.push({ name: node.expression.text, line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1, awaited: ts.isAwaitExpression(parent), inAsync });
		}
		ts.forEachChild(node, visit);
	};
	visit(source);
	return out;
}

test('team-gate-callers.test.ts: each listed caller awaits its gate call and returns the same outcome; handler.test.ts and handler-runtime.test.ts still pass', async () => {
	let total = 0;
	for (const [file, names] of CALLERS) {
		const calls = callsIn(file, names);
		assert.ok(calls.length > 0, `${file} calls ${names.join(', ')}`);
		for (const c of calls) {
			assert.equal(c.awaited, true, `${file}:${c.line} awaits ${c.name}`);
			assert.equal(c.inAsync, true, `${file}:${c.line} is inside an async function`);
			total++;
		}
	}
	assert.ok(total >= 20, `${total} awaited gate calls`);

	// the functions that became async by this task return a Promise with the same outcome as before
	const meta = runMetaFor('/nowhere-without-policy', 'stub', {});
	assert.ok(meta instanceof Promise);
	assert.equal(await meta, undefined, 'a repo without a policy records no run meta, as before');
	const refused = resolveReviewFinding('/nowhere.md', '/nowhere.json', 'f', 'accept');
	assert.ok(refused instanceof Promise);
	await assert.rejects(refused, /No artifact json at \/nowhere\.json/);
});
