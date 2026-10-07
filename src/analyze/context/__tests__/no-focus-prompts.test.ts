/**
 * A request with no focus is served. The prompts that used to assume
 * a focus each state what to do without one.
 *
 * These tests read the SHIPPED prompt files and the lookup registry --
 * no model.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { ClassifiedIntent } from '../../../shared/analyze-types.js';
import { TARGET_ENUM } from '../../classifier/schema.js';
import { _getRunnersForTest } from '../../explore/executor.js';
import { NO_FOCUS_SECTION, prepareDecompose } from '../decomposer.js';
import type { ResolvedScope } from '../scope.js';

const PROMPT_DIR = fileURLToPath(new URL('../../../prompts/analyze/', import.meta.url));
const PLANNING_PROMPT = readFileSync(join(PROMPT_DIR, 'decompose.system.md'), 'utf8');

/** The no-focus section's text: from its heading to the next `## ` heading. */
function noFocusSection(): string {
	const start = PLANNING_PROMPT.indexOf(`## ${NO_FOCUS_SECTION}\n`);
	assert.notEqual(start, -1, `the planning prompt has a "## ${NO_FOCUS_SECTION}" section`);
	const next = PLANNING_PROMPT.indexOf('\n## ', start + 3);
	assert.notEqual(next, -1, 'another section follows it');
	return PLANNING_PROMPT.slice(start, next);
}

test('planning prompt has a no-focus recipe per kind of source, with existing lookups and no limit parameter', () => {
	const section = noFocusSection();

	// One recipe (at least) for each of the five kinds of source.
	for (const target of TARGET_ENUM) {
		assert.ok(section.includes(`**\`target=${target}\`**`), `a recipe for target=${target}`);
	}
	assert.equal(TARGET_ENUM.length, 5);

	// Every lookup a recipe step names exists in the lookup registry.
	const registered = new Set(Object.keys(_getRunnersForTest()));
	assert.ok(registered.size >= 20, `registry has ${registered.size} lookups`);
	const stepLines = section.split('\n').filter(l => /^\s+\d+\.\s+`/.test(l));
	assert.ok(stepLines.length >= 10, `found ${stepLines.length} recipe steps`);
	const named = new Set<string>();
	for (const line of stepLines) {
		const m = /^\s+\d+\.\s+`([a-z]+(?:\.[a-z-]+)+)/.exec(line);
		assert.ok(m !== null, `a step names a lookup first: ${line}`);
		named.add(m![1]!);
	}
	for (const lookup of named) {
		assert.ok(registered.has(lookup), `'${lookup}' is a registered lookup`);
	}
	// The recipes use the lookups that work without a subject.
	for (const expected of ['module.profile', 'import.graph', 'convention.detect', 'symbol.locate',
		'usage.example', 'db.connections.list', 'db.tables.list', 'manifests.locate', 'freeform.probe']) {
		assert.ok(named.has(expected), `the recipes use ${expected}`);
	}
	// None of them substitutes a focus, and none carries a parameter that bounds results.
	assert.ok(!/<intent\.focus>.*\)/.test(section.split('\n').filter(l => /^\s+\d+\./.test(l)).join('\n')),
		'no recipe step substitutes the focus');
	for (const bounded of ['limit', 'topK', 'maxSources', 'maxResults']) {
		assert.ok(!new RegExp(`\\b${bounded}\\b`).test(section), `the section does not mention '${bounded}'`);
	}
});

test('the no-focus section sits after the other recipes and before the output format', () => {
	const at = PLANNING_PROMPT.indexOf(`## ${NO_FOCUS_SECTION}\n`);
	const lastRecipe = PLANNING_PROMPT.lastIndexOf('### Recipe: ');
	const output = PLANNING_PROMPT.indexOf('## Output format');
	assert.ok(lastRecipe !== -1 && output !== -1);
	assert.ok(lastRecipe < at, 'after the last per-answer-type recipe');
	assert.ok(at < output, 'before the output format');
});

test('planning user turn for an unfocused intent names the no-focus section', () => {
	const scope: ResolvedScope = { kind: 'repo', value: '/work/app', repoPath: '/work/app', lookupPath: '/work/app' };
	const unfocused: ClassifiedIntent = {
		target: 'code', scope: 'M', focused: false, scopeRef: { kind: 'repo', value: '/work/app' }, reasoning: 'r',
	};
	const turn = prepareDecompose(unfocused, scope).userTurn;
	const focusLine = turn.split('\n').find(l => l.startsWith('focus: '));
	assert.equal(focusLine, `focus: none (a broad survey of the scope -- follow "${NO_FOCUS_SECTION}")`);
	// The name the user turn gives is the heading the prompt has.
	assert.ok(PLANNING_PROMPT.includes(`## ${NO_FOCUS_SECTION}\n`));
	// The prompt's own description of what it receives says `focus: none`.
	assert.ok(PLANNING_PROMPT.includes('`focus: none`'));

	// A focused intent is unchanged.
	const focused = prepareDecompose({ ...unfocused, focused: true, focus: 'how does X work' }, scope).userTurn;
	assert.ok(focused.split('\n').includes('focus: "how does X work"'));
});

test("every prompt that prints the intent's focus states the no-focus rule", () => {
	// Found by search, so a prompt added later is covered.
	const printers = readdirSync(PROMPT_DIR)
		.filter(f => f.endsWith('.md'))
		.filter(f => readFileSync(join(PROMPT_DIR, f), 'utf8').includes('`Intent focus: <intent.focus>`'));
	assert.deepEqual(printers.sort(), [
		'synthesize.adherence.system.md',
		'synthesize.capability.system.md',
		'synthesize.code.system.md',
		'synthesize.data.system.md',
		'synthesize.docs.system.md',
		'synthesize.infra.system.md',
	]);
	for (const f of printers) {
		const text = readFileSync(join(PROMPT_DIR, f), 'utf8');
		assert.ok(
			text.includes('`Intent focus: none (broad survey of <scopeRef.kind> <scopeRef.value>)`'),
			`${f} states what to write when there is no focus`,
		);
		// The rule sits directly under the line it qualifies.
		const lines = text.split('\n');
		const at = lines.findIndex(l => l.includes('`Intent focus: <intent.focus>`'));
		assert.ok(lines[at + 1]!.includes('When the intent has no focus'), `${f}: the rule follows the focus line`);
		assert.ok(text.includes('Never print a placeholder'), f);
	}
});
