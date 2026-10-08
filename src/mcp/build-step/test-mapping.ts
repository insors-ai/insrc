/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The builder's mapping from a Task's named tests to the test cases that carry
 * them, and the checks made on it before any check is run
 * (LLD-9b4a74dc-S001, task t2).
 *
 * A plan names its tests in prose. At the validate turn the builder says, for
 * each name, which test cases carry it: a test file and a test title. For a
 * test the gate cannot run (a live run that needs a model, a check a person
 * makes) the builder reports the result and where the evidence is instead;
 * that is accepted only for a test whose level is 'live' or 'smoke'.
 *
 * Pure: the mapping, the named tests and the tracked files in, faults out.
 */

/** One test case: a test file and the title of a test in it. */
export interface TestCaseRef {
	/** Repo-relative path of a tracked '.test.ts' file. */
	readonly file:  string;
	/** The test's title exactly as the test file declares it. */
	readonly title: string;
}

/** A result the builder states for a test the gate cannot run. */
export interface ReportedResult {
	readonly result:   'pass' | 'fail';
	/** Where the evidence is: a log path, a run id, a section of a record. */
	readonly evidence: string;
}

export interface TestMappingEntry {
	/** The exact text of one of the Task's test names (or of a design's subject). */
	readonly name:      string;
	readonly cases?:    readonly TestCaseRef[] | undefined;
	readonly reported?: ReportedResult | undefined;
}

/** A test the plan (or the design's test strategy) names. */
export interface NamedTest {
	readonly name:   string;
	readonly level?: string | undefined;
}

/** The only levels for which a builder-reported result is accepted. */
export const REPORTABLE_LEVELS: ReadonlySet<string> = new Set(['live', 'smoke']);

const ENTRY_KEYS: ReadonlySet<string> = new Set(['name', 'cases', 'reported']);
const CASE_KEYS:  ReadonlySet<string> = new Set(['file', 'title']);

function leavesRepo(file: string): boolean {
	return file.startsWith('/') || /^[A-Za-z]:[\\/]/.test(file) || file.split(/[\\/]/).includes('..');
}

/**
 * Every fault of a mapping, or an empty list. Checked against the named tests
 * (a name must be one of them, once), their levels (a reported result only for
 * 'live' or 'smoke'), and the repository's tracked files.
 */
export function checkTestMapping(
	mapping:      readonly TestMappingEntry[],
	named:        readonly NamedTest[],
	trackedFiles: readonly string[],
): readonly string[] {
	const faults: string[] = [];
	const levelOf = new Map<string, string | undefined>();
	for (const n of named) if (!levelOf.has(n.name)) levelOf.set(n.name, n.level);
	const tracked = new Set(trackedFiles);
	const seen = new Set<string>();

	mapping.forEach((entry, i) => {
		const at = `tests[${i}]`;
		for (const key of Object.keys(entry)) {
			if (!ENTRY_KEYS.has(key)) faults.push(`${at}: unknown key '${key}'`);
		}
		const name = entry.name;
		if (typeof name !== 'string' || name.length === 0) {
			faults.push(`${at}: 'name' is missing or empty`);
		} else if (!levelOf.has(name)) {
			faults.push(`${at}: '${name}' is not a test this Task names`);
		} else if (seen.has(name)) {
			faults.push(`${at}: '${name}' is named more than once`);
		}
		if (typeof name === 'string') seen.add(name);

		const cases = entry.cases ?? [];
		if (cases.length === 0 && entry.reported === undefined) {
			faults.push(`${at}: the entry has neither cases nor a reported result`);
		}
		cases.forEach((c, j) => {
			const cat = `${at}.cases[${j}]`;
			for (const key of Object.keys(c)) {
				if (!CASE_KEYS.has(key)) faults.push(`${cat}: unknown key '${key}'`);
			}
			if (typeof c.title !== 'string' || c.title.length === 0) faults.push(`${cat}: 'title' is empty`);
			if (typeof c.file !== 'string' || c.file.length === 0) {
				faults.push(`${cat}: 'file' is empty`);
			} else if (leavesRepo(c.file)) {
				faults.push(`${cat}: '${c.file}' is not a path inside the repository`);
			} else if (!c.file.endsWith('.test.ts') || !tracked.has(c.file)) {
				faults.push(`${cat}: '${c.file}' is not a tracked '.test.ts' file of the repository`);
			}
		});

		if (entry.reported !== undefined) {
			const r = entry.reported;
			if (r.result !== 'pass' && r.result !== 'fail') faults.push(`${at}.reported: 'result' must be 'pass' or 'fail'`);
			if (typeof r.evidence !== 'string' || r.evidence.trim().length === 0) faults.push(`${at}.reported: 'evidence' is empty`);
			if (typeof name === 'string' && levelOf.has(name)) {
				const level = levelOf.get(name);
				if (level === undefined || !REPORTABLE_LEVELS.has(level)) {
					faults.push(
						`${at}.reported: a result may be reported only for a 'live' or 'smoke' test; ` +
						`'${name}' ${level === undefined ? 'has no level' : `is '${level}'`}`,
					);
				}
			}
		}
	});
	return faults;
}
