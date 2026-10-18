/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The inventory of guarded entry points (sc4): every route that changes a stage names the team-gate
 * call (or the review-fix decision) it makes, and the test reads each function's source to see that
 * call still there. Removing a gate call from a listed function fails this test. The analyze and
 * code-review steps change no stage and must stay off the gate.
 *
 * Run: npx tsx --test src/workflow/__tests__/gate-guarded-entry-points.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/** The gate calls an entry point may make. */
const GATE_CALLS = ['assertMayAuthor', 'assertMayBuild', 'authorizeApproval', 'authorizeFindingApply', 'reviewFixModeFor', 'reviewFixDecision', 'teamGate'] as const;

interface EntryPoint {
	readonly file: string;
	readonly fn: string;
	readonly calls: readonly (typeof GATE_CALLS)[number][];
	/** Fewest gate calls the function makes (a draft writer asks again before it writes). */
	readonly min: number;
}

export const GUARDED_ENTRY_POINTS: readonly EntryPoint[] = [
	{ file: 'src/daemon/steps/workflow-step/phases/start.ts',      fn: 'handleStart',            calls: ['assertMayAuthor'], min: 1 },
	{ file: 'src/daemon/steps/workflow-step/phases/plan.ts',       fn: 'handlePlan',             calls: ['assertMayAuthor'], min: 1 },
	{ file: 'src/daemon/steps/workflow-step/phases/step.ts',       fn: 'handleStep',             calls: ['assertMayAuthor'], min: 1 },
	{ file: 'src/daemon/steps/workflow-step/phases/synthesize.ts', fn: 'handleSynthesize',       calls: ['assertMayAuthor'], min: 2 },
	{ file: 'src/daemon/workflow-rpc.ts',                          fn: 'runWorkflowServerSide',  calls: ['assertMayAuthor'], min: 2 },
	{ file: 'src/daemon/workflow-rpc.ts',                          fn: 'runStart',               calls: ['assertMayAuthor'], min: 1 },
	{ file: 'src/daemon/steps/build-step/phases/implement.ts',     fn: 'handleImplement',        calls: ['assertMayBuild'],  min: 1 },
	{ file: 'src/daemon/steps/build-step/phases/implement.ts',     fn: 'handleStandaloneImplement', calls: ['assertMayBuild'], min: 1 },
	{ file: 'src/daemon/steps/build-step/phases/validate.ts',      fn: 'handleValidate',         calls: ['assertMayBuild'],  min: 1 },
	{ file: 'src/daemon/steps/build-step/phases/validate.ts',      fn: 'handleStandaloneValidate', calls: ['assertMayBuild'], min: 1 },
	{ file: 'src/workflow/gates.ts',                               fn: 'approveArtifactByJsonPath', calls: ['authorizeApproval'], min: 1 },
	{ file: 'src/workflow/gates.ts',                               fn: 'approveWorkflowTarget',  calls: ['authorizeApproval'], min: 1 },
	{ file: 'src/workflow/review/resolve.ts',                      fn: 'resolveReviewFinding',   calls: ['authorizeFindingApply'], min: 1 },
	{ file: 'src/daemon/steps/review-step/phases/verdicts.ts',     fn: 'handleVerdicts',         calls: ['reviewFixModeFor'], min: 1 },
	{ file: 'src/workflow/review/run-artifact.ts',                 fn: 'reviewArtifactFile',     calls: ['reviewFixModeFor'], min: 1 },
];

/** Routes that change no stage and must make no gate call. */
const OFF_THE_GATE: readonly string[] = [
	'src/daemon/steps/analyze-step',
	'src/daemon/steps/code-review-step',
	'src/daemon/steps/analyze-oneshot.ts',
	'src/daemon/analyze-rpc.ts',
	'src/daemon/code-review-rpc.ts',
];

/** The names called inside the named function (nested closures included), or undefined when there is no such function. */
export function gateCallsIn(source: string, fn: string): string[] | undefined {
	const sf = ts.createSourceFile('x.ts', source, ts.ScriptTarget.Latest, true);
	let found: ts.FunctionDeclaration | undefined;
	sf.forEachChild(n => { if (ts.isFunctionDeclaration(n) && n.name?.text === fn && n.body !== undefined) found = n; });
	if (found === undefined) return undefined;
	const names: string[] = [];
	const visit = (n: ts.Node): void => {
		if (ts.isCallExpression(n) && ts.isIdentifier(n.expression)) names.push(n.expression.text);
		n.forEachChild(visit);
	};
	found.body?.forEachChild(visit);
	return names;
}

function sourceFilesUnder(rel: string): string[] {
	const abs = join(ROOT, rel);
	if (statSync(abs).isFile()) return [rel];
	return readdirSync(abs, { withFileTypes: true }).flatMap(e => {
		const child = join(rel, e.name);
		if (e.isDirectory()) return e.name === '__tests__' ? [] : sourceFilesUnder(child);
		return e.name.endsWith('.ts') ? [child] : [];
	});
}

test('the inventory of guarded entry points (daemon step phases, approveArtifactByJsonPath, approveWorkflowTarget, resolveReviewFinding apply) is complete, and the analyze and code-review steps are not on it', () => {
	// every listed entry point still makes its gate call
	for (const ep of GUARDED_ENTRY_POINTS) {
		const names = gateCallsIn(readFileSync(join(ROOT, ep.file), 'utf8'), ep.fn);
		assert.ok(names !== undefined, `${ep.file}: function ${ep.fn} is gone; update the inventory`);
		const made = names.filter(n => (ep.calls as readonly string[]).includes(n)).length;
		assert.ok(made >= ep.min, `${ep.file} ${ep.fn} must call ${ep.calls.join(' or ')} at least ${ep.min} time(s); it calls it ${made}`);
	}

	// the detector sees a removal: the same source without the call fails the check
	const withCall = 'export function f() { assertMayBuild(repo, ref); return 1; }';
	const without = 'export function f() { return 1; }';
	assert.deepEqual(gateCallsIn(withCall, 'f')?.filter(n => n === 'assertMayBuild'), ['assertMayBuild']);
	assert.deepEqual(gateCallsIn(without, 'f')?.filter(n => n === 'assertMayBuild'), []);
	assert.equal(gateCallsIn(without, 'missing'), undefined);

	// every file of the daemon's step directories and workflow route that holds a gate call is on the inventory
	const listed = new Set(GUARDED_ENTRY_POINTS.map(e => e.file));
	const stepFiles = ['src/daemon/steps/workflow-step/phases', 'src/daemon/steps/build-step/phases'].flatMap(sourceFilesUnder);
	for (const file of stepFiles) {
		const src = readFileSync(join(ROOT, file), 'utf8');
		const calls = GATE_CALLS.filter(g => new RegExp(`\\b${g}\\(`).test(src));
		if (calls.length > 0) assert.ok(listed.has(file), `${file} calls ${calls.join(', ')} but is not on the inventory`);
	}
	for (const phase of ['start', 'plan', 'step', 'synthesize']) {
		assert.ok(listed.has(`src/daemon/steps/workflow-step/phases/${phase}.ts`), `workflow-step ${phase} is on the inventory`);
	}
	for (const phase of ['implement', 'validate']) {
		assert.ok(listed.has(`src/daemon/steps/build-step/phases/${phase}.ts`), `build-step ${phase} is on the inventory`);
	}

	// the analyze and code-review steps change no stage: no gate call, no import of the team gate
	for (const rel of OFF_THE_GATE) {
		for (const file of sourceFilesUnder(rel)) {
			const src = readFileSync(join(ROOT, file), 'utf8');
			assert.ok(!listed.has(file), `${file} must not be on the inventory`);
			assert.ok(!/workflow\/team\/(gate|author-gate|approval-gate)\.js/.test(src), `${relative(ROOT, join(ROOT, file))} must not import the team gate`);
			for (const g of GATE_CALLS) assert.ok(!new RegExp(`\\b${g}\\(`).test(src), `${file} must not call ${g}`);
		}
	}
});
