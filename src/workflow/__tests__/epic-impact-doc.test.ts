/**
 * docs/workflow.md describes the Epic impact analysis in line with the code (ISSUE-1b3caadf04023d33, s1/t7): the label, the refusal
 * kind and the caps are read from the code, so the doc fails the test when it names a different one.
 *
 * Run: npx tsx --test src/workflow/__tests__/epic-impact-doc.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { EPIC_DIGEST_DEFAULTS, EPIC_IMPACT_LABEL } from '../epic-built-state.js';
import { EPIC_IMPACT_MIN_PARAGRAPH_CHARS, EPIC_IMPACT_MISSING_KIND } from '../epic-impact-build-check.js';

const doc = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'docs', 'workflow.md'), 'utf8');

/** The section's text, whitespace collapsed. */
function section(): string {
	const a = doc.indexOf('### Epic impact analysis (a later Story of an Epic)');
	assert.ok(a >= 0, 'the section exists');
	const b = doc.indexOf('\n### ', a + 10);
	return doc.slice(a, b === -1 ? undefined : b).replace(/\s+/g, ' ');
}

test('epic-impact-doc.test.ts: docs/workflow.md describes the Epic impact analysis, the digest and its caps and the BUILD approval check in line with the code', () => {
	const text = section();
	// the label, the refusal kind and the caps are the code's
	assert.ok(text.includes(`\`${EPIC_IMPACT_LABEL}\``), 'names the label');
	assert.ok(text.includes(`\`${EPIC_IMPACT_MISSING_KIND}\``), 'names the refusal kind');
	assert.ok(text.includes(`newest ${EPIC_DIGEST_DEFAULTS.fullStories} Stories`), 'the number of full Stories');
	assert.ok(text.includes(`${EPIC_DIGEST_DEFAULTS.perStoryChars} characters`), 'the per-Story cap');
	assert.ok(text.includes(`${EPIC_DIGEST_DEFAULTS.totalChars} characters`), 'the total cap');
	assert.ok(text.includes(`at least ${EPIC_IMPACT_MIN_PARAGRAPH_CHARS} characters`), 'the minimum paragraph length');
	// the caps as rules, not just numbers
	assert.ok(text.includes(`each at most ${EPIC_DIGEST_DEFAULTS.perStoryChars} characters`), 'each full Story is at most the per-Story cap');
	assert.ok(text.includes(`the whole digest at most ${EPIC_DIGEST_DEFAULTS.totalChars} characters`), 'the whole digest is at most the total cap');
	assert.ok(text.includes(`the newest ${EPIC_DIGEST_DEFAULTS.fullStories} Stories are shown in full`), 'the newest Stories are in full');
	// the rule it states
	for (const piece of ['`epicImpact`', 'storiesCovered', 'overrideReview', 'skipped[]', 'standalone Story', 'first', 'refuses a later Story\'s LLD or PLAN', 'does not apply']) {
		assert.ok(text.includes(piece), `states: ${piece}`);
	}
	assert.match(text, /each Story the LLD's analysis covered/);
	// the rule itself, sentence by sentence: a doc that states the opposite fails
	assert.ok(text.includes(`must open a paragraph with \`${EPIC_IMPACT_LABEL}\``), 'the paragraph must open the summary paragraph, as the check requires');
	assert.match(text, /Approving a later Story's BUILD without it is refused/);
	assert.match(text, /An explicit `overrideReview` passes it\./);
	assert.match(text, /does not apply when the Story has no approved LLD, its LLD has no `epicImpact`, or the analysis says it does not apply/);
	assert.match(text, /refuses a later Story's LLD or PLAN that has none \(or one that does not apply, names no Story, has no findings or cites no source\)/);
	assert.match(text, /can be replaced by a current one in the synthesized body/);
	assert.match(text, /and nothing is written \(a BUILD with no record yet gets none created\)/);
	assert.match(text, /the controller reads the digest against the Story|controller reads the digest against the Story/);
	// the section sits in the walkthrough between the LLD step and the GitHub push
	assert.ok(doc.indexOf('### 4. Design LLDs') < doc.indexOf('### Epic impact analysis') && doc.indexOf('### Epic impact analysis') < doc.indexOf('### 5. Push to GitHub'));
});
