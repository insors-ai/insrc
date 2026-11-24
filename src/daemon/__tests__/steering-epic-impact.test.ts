/**
 * The steering text states the Epic impact analysis rule (ISSUE-1b3caadf04023d33, s1/t6): in the design.story, plan and build guide
 * sections and the skeleton's feature route, with no marker pair added.
 *
 * Run: npx tsx --test src/daemon/__tests__/steering-epic-impact.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { EPIC_IMPACT_LABEL } from '../../workflow/epic-built-state.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const block = readFileSync(join(HERE, '..', '..', 'prompts', 'steering-block.md'), 'utf8');
const flat = (s: string): string => s.replace(/\s+/g, ' ');
const section = (name: string): string => {
	const a = block.indexOf(`<!-- insrc:guide:${name}:start -->`);
	const b = block.indexOf(`<!-- insrc:guide:${name}:end -->`);
	assert.ok(a >= 0 && b > a, `${name} section is addressable`);
	return flat(block.slice(a, b));
};

test('steering-epic-impact.test.ts: the design.story, plan and build guide sections of the shipped steering block each state the rule, the build section states that the BUILD summary must carry the labelled paragraph and that approval is refused without it, the skeleton\'s feature route points at it, no new marker pair was added, and the existing sections are still addressable by name', () => {
	for (const name of ['design.story', 'plan', 'build']) {
		const text = section(name);
		assert.match(text, /Epic impact analysis \(a later Story of an Epic\)/, `${name} states the rule`);
		assert.match(text, /FIRST activity|starts with the same analysis/, `${name}: it comes first`);
		assert.match(text, /Epic built-state digest/, `${name}: names the digest`);
	}
	for (const name of ['design.story', 'plan']) assert.match(section(name), /`epicImpact`/, `${name}: names the analysis it emits`);

	const build = section('build');
	assert.ok(build.includes(`starts with \`${EPIC_IMPACT_LABEL}\``), 'the build section names the labelled paragraph with the shared label');
	assert.match(build, /last validate call/);
	assert.match(build, /names each Story the LLD's analysis covered/);
	assert.match(build, /BUILD approval is refused/);
	assert.match(build, /epic-impact-missing/);

	// the skeleton's feature route points at it, above the guide sections
	const route = flat(block.slice(block.indexOf('**Build / add / implement a feature**'), block.indexOf('**Fix a bug / defect**')));
	assert.match(route, /later Story of an Epic, the first activity of its design\.story, plan and build is a complete impact analysis/);

	// no marker pair was added or removed
	const starts = [...block.matchAll(/<!-- insrc:([\w.:-]+):start -->/g)].map(m => m[1]);
	const ends = [...block.matchAll(/<!-- insrc:([\w.:-]+):end -->/g)].map(m => m[1]);
	assert.deepEqual(starts, ends, 'every start has its end, in order');
	assert.deepEqual(starts, [
		'analyze-request', 'guide:triage', 'guide:brainstorm', 'guide:define', 'guide:design.epic', 'guide:design.story', 'guide:plan',
		'guide:build', 'guide:review', 'guide:code-review', 'guide:tracker', 'guide:bugfix',
	], 'exactly the sections that existed');
});
