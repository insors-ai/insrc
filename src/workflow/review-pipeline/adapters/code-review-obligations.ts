/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * What each code-review dimension must judge when its review is divided (Epic
 * 8315a11f s3, plan task t1): one obligation per thing today's single prompt
 * asks the model to judge, each with the context atoms it is judged on.
 *
 *   adherence           one 'clause' per approved LLD clause (each contract entry,
 *                       data-model change, error case, edge case and invariant)
 *                       and one per approved PLAN task; none without either.
 *   functional coverage one 'requirement' per FR.
 *   coverage            one 'promised-test' per test the plan promised. Its context
 *                       is all the record evidence for that test, chosen by its
 *                       name: its reported result, the build tasks, the record's
 *                       notes and every test file naming it.
 *   conventions         one 'module-conventions' per touched module.
 *   quality             none.
 *
 * Built from the saved subject (and, for conventions, the material's atoms) only,
 * so a rebuilt adapter gives the same obligations. A context atom two obligations
 * share is listed once. The dimension judges pass in what they read from the
 * subject (FRs, promised tests, the test-record view), so this module imports none.
 */

import type { FunctionalRequirement } from '../../artifacts/functional-definition.js';
import type { TestFileView, TestRecordView } from '../../code-review/dimensions/test-record-view.js';
import type { CodeReviewSubject } from '../../code-review/types.js';
import type { ReviewAtom, ReviewObligation } from '../types.js';

/** A dimension's obligations and the context atoms they name. */
export interface DimensionObligations {
	readonly obligations: readonly ReviewObligation[];
	readonly context:     readonly ReviewAtom[];
}

const NONE: DimensionObligations = { obligations: [], context: [] };

/** Collects obligations and their context atoms, each atom once. */
class Builder {
	private readonly obligations: ReviewObligation[] = [];
	private readonly context = new Map<string, ReviewAtom>();

	has(key: string): boolean {
		return this.obligations.some(o => o.key === key);
	}

	add(key: string, kind: ReviewObligation['kind'], text: string, context: readonly ReviewAtom[] = []): void {
		for (const a of context) if (!this.context.has(a.id)) this.context.set(a.id, a);
		this.obligations.push({ key, kind, text, ...(context.length > 0 ? { atomIds: context.map(a => a.id) } : {}) });
	}

	done(): DimensionObligations {
		return { obligations: this.obligations, context: [...this.context.values()] };
	}
}

const contextAtom = (id: string, label: string, value: unknown): ReviewAtom =>
	({ id: `ctx:${id}`, label, text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) });

// -- adherence ---------------------------------------------------------------

interface LldBodyClauses {
	readonly contractDetails?: { readonly api?: readonly { readonly name?: string }[] } | readonly { readonly name?: string }[];
	readonly dataModelChanges?: readonly { readonly entity?: string }[];
	readonly errorPaths?: {
		readonly errorCases?: readonly { readonly scenario?: string }[];
		readonly edgeCases?: readonly { readonly input?: string }[];
		readonly invariantsToPreserve?: readonly { readonly text?: string }[];
	};
}

interface PlanBodyTasks {
	readonly tasks?: readonly { readonly id?: string; readonly title?: string }[];
}

/** Adherence: each approved LLD clause and each approved PLAN task; none without either. */
export function adherenceObligations(subject: CodeReviewSubject): DimensionObligations {
	if (subject.approvedLld === null && subject.approvedPlan === null) return NONE;
	const b = new Builder();
	const lld = (subject.approvedLld as { body?: LldBodyClauses } | null)?.body;
	if (lld !== undefined) {
		const cd = lld.contractDetails;
		const api = Array.isArray(cd) ? cd : (cd as { api?: readonly { name?: string }[] } | undefined)?.api ?? [];
		const clause = (key: string, label: string, entry: unknown): void => {
			b.add(key, 'clause', `LLD ${label}`, [contextAtom(key, `LLD ${label}`, entry)]);
		};
		api.forEach((e, i) => clause(`lld:contract:${i + 1}`, `contract ${i + 1}: ${e.name ?? '(unnamed)'}`, e));
		(lld.dataModelChanges ?? []).forEach((e, i) => clause(`lld:data-model:${i + 1}`, `data-model change ${i + 1}: ${e.entity ?? '(unnamed)'}`, e));
		(lld.errorPaths?.errorCases ?? []).forEach((e, i) => clause(`lld:error:${i + 1}`, `error case ${i + 1}: ${e.scenario ?? ''}`, e));
		(lld.errorPaths?.edgeCases ?? []).forEach((e, i) => clause(`lld:edge:${i + 1}`, `edge case ${i + 1}: ${e.input ?? ''}`, e));
		(lld.errorPaths?.invariantsToPreserve ?? []).forEach((e, i) => clause(`lld:invariant:${i + 1}`, `invariant ${i + 1}: ${e.text ?? ''}`, e));
	}
	const plan = (subject.approvedPlan as { body?: PlanBodyTasks } | null)?.body;
	(plan?.tasks ?? []).forEach((t, i) => {
		const id = t.id ?? `#${i + 1}`;
		const key = `plan:${id}`;
		b.add(key, 'clause', `PLAN task ${id}: ${t.title ?? ''}`, [contextAtom(key, `PLAN task ${id}`, t)]);
	});
	return b.done();
}

// -- functional coverage -----------------------------------------------------

/** Functional coverage: one obligation per FR (functionalRequirementsOf), its full requirement as context. */
export function functionalCoverageObligations(requirements: readonly FunctionalRequirement[]): DimensionObligations {
	const b = new Builder();
	for (const fr of requirements) {
		const key = `fr:${fr.id}`;
		b.add(key, 'requirement', `${fr.id}: ${fr.statement}`, [contextAtom(key, `FR ${fr.id}`, fr)]);
	}
	return b.done();
}

// -- coverage ----------------------------------------------------------------

/** `<file>.test.ts: '<title>'`, as plan test names are written; anything else is a name only. */
function parseTestName(name: string): { readonly file?: string; readonly title?: string } {
	const m = /^(\S+\.test\.[cm]?[jt]sx?):\s*'([\s\S]*)'$/.exec(name.trim());
	return m === null ? {} : { file: m[1]!, title: m[2]! };
}

/** Whether a test file names the promised test: it is the test's file, or it ran (or once ran) a title equal to the test's title or whole name. */
function fileNames(f: TestFileView, name: string): boolean {
	const { file, title } = parseTestName(name);
	if (file !== undefined && f.file === file) return true;
	const titles = [...f.titles.map(t => t.title), ...f.notInLatestRun];
	return titles.some(t => t === name.trim() || (title !== undefined && t === title));
}

/** The record evidence of one promised test, chosen by its name. */
function testEvidence(view: TestRecordView | null, name: string): ReviewAtom[] {
	if (view === null) {
		return [contextAtom('record:none', 'test record', 'No test record is available: every test\'s pass-state is unverified (never assert a green).')];
	}
	const out: ReviewAtom[] = [];
	for (const r of view.reportedTests ?? []) {
		if (r.name.trim() === name.trim()) out.push(contextAtom(`reported:${r.name}`, `reported result: ${r.name}`, r));
	}
	out.push(contextAtom('record:build-tasks', 'build tasks', view.buildTasks));
	if (view.notes.length > 0) out.push(contextAtom('record:notes', 'test record notes', view.notes));
	for (const f of view.files) {
		if (fileNames(f, name)) out.push(contextAtom(`test-file:${f.file}`, `test file ${f.file}`, f));
	}
	return out;
}

/** Coverage: one obligation per promised test (promisedTestsOf), with all of that test's
 *  evidence in the record view (testRecordView; null when the Story has no TESTS record). */
export function coverageObligations(promised: readonly { readonly level?: string | undefined; readonly name: string }[], view: TestRecordView | null): DimensionObligations {
	const b = new Builder();
	for (const t of promised) {
		const name = t.name.trim();
		// A test the plan names twice is one obligation, as it is one line to judge.
		if (b.has(`test:${name}`)) continue;
		b.add(`test:${name}`, 'promised-test', `Promised ${t.level !== undefined ? `${t.level} ` : ''}test: ${name}`, testEvidence(view, name));
	}
	return b.done();
}

// -- conventions -------------------------------------------------------------

/** Conventions: one obligation per touched module, in the order the atoms first name it. */
export function conventionsObligations(atoms: readonly ReviewAtom[]): DimensionObligations {
	const b = new Builder();
	const seen = new Set<string>();
	for (const a of atoms) {
		if (a.module === undefined || seen.has(a.module)) continue;
		seen.add(a.module);
		b.add(`module:${a.module}`, 'module-conventions', `The documented rules and local idioms of module ${a.module}`);
	}
	return b.done();
}
