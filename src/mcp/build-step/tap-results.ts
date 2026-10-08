/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Reads the TAP output of ONE test file's run into a result per test title
 * (LLD-9b4a74dc-S001, task t1).
 *
 * The shape read here is what `npx tsx --test --test-reporter=tap` prints
 * under Node 22, captured in `__tests__/fixtures/tap-sample.tap`:
 *   - one `ok N - <title>` or `not ok N - <title>` line per test and per suite;
 *   - four spaces of indent per depth of nesting;
 *   - ` # SKIP` (with an optional reason) or ` # TODO` after the title;
 *   - '#' printed as `\#` and a backslash as `\\`; quotes are not escaped;
 *   - a YAML block (`---` to `...`) after a result line, whose content is not
 *     a result whatever it looks like.
 *
 * Pure: a string in, results out. Nothing is run here.
 */

export type TapResult = 'pass' | 'fail' | 'skipped';

export interface TapTitle {
	/** The title as the test file declares it (escapes reversed). */
	readonly title:  string;
	/** 0 for a top-level test, 1 for a test inside one suite or parent, ... */
	readonly depth:  number;
	readonly result: TapResult;
}

export interface TapRun {
	/** False when the output holds no TAP version line and no result line. */
	readonly understood: boolean;
	/** Every result line, in the order printed (children before their parent). */
	readonly titles:     readonly TapTitle[];
}

const RESULT_LINE = /^( *)(ok|not ok) \d+(?: - (.*))?$/;
const YAML_OPEN   = /^ *---\s*$/;
const YAML_CLOSE  = /^ *\.\.\.\s*$/;
const INDENT_PER_DEPTH = 4;

/** Split a result line's description at its first UNESCAPED '#', and reverse
 *  the runner's two escapes in the title part. */
function splitDescription(description: string): { readonly title: string; readonly directive: string } {
	let title = '';
	for (let i = 0; i < description.length; i++) {
		const ch = description[i]!;
		if (ch === '\\' && i + 1 < description.length) {
			title += description[i + 1]!;
			i += 1;
			continue;
		}
		if (ch === '#') {
			return { title: title.trimEnd(), directive: description.slice(i + 1).trim() };
		}
		title += ch;
	}
	return { title, directive: '' };
}

export function parseTapRun(output: string): TapRun {
	const titles: TapTitle[] = [];
	let sawVersion = false;
	let inYaml = false;
	for (const line of output.split('\n')) {
		if (inYaml) {
			if (YAML_CLOSE.test(line)) inYaml = false;
			continue;
		}
		if (YAML_OPEN.test(line)) { inYaml = true; continue; }
		if (line.startsWith('TAP version ')) { sawVersion = true; continue; }
		const m = RESULT_LINE.exec(line);
		if (m === null) continue;
		const indent = m[1]!.length;
		if (indent % INDENT_PER_DEPTH !== 0) continue;
		const { title, directive } = splitDescription(m[3] ?? '');
		const skipped = /^(SKIP|TODO)\b/i.test(directive);
		titles.push({
			title,
			depth:  indent / INDENT_PER_DEPTH,
			result: skipped ? 'skipped' : m[2] === 'ok' ? 'pass' : 'fail',
		});
	}
	return { understood: sawVersion || titles.length > 0, titles };
}

/**
 * The result of one title in a run, at any depth. A title that occurs more
 * than once fails if any occurrence failed, else passes if any passed, else is
 * skipped. `not found` when no result line carries the title.
 */
export function resultOfTitle(run: TapRun, title: string): TapResult | 'not found' {
	let found: TapResult | undefined;
	for (const t of run.titles) {
		if (t.title !== title) continue;
		if (t.result === 'fail') return 'fail';
		if (t.result === 'pass') found = 'pass';
		else if (found === undefined) found = 'skipped';
	}
	return found ?? 'not found';
}
