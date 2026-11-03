/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The review rule as it is WRITTEN for the model that drives the tools: the
 * steering source and the two review tool descriptions say that the party that
 * did not author the work reviews it, in both directions, and no longer say
 * that review is a controller task.
 * (LLD-1716f77ba9ba017b-S001, test T13; plan task t11.)
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { readWorkflowGuide } from '../../daemon/guide-sections.js';
import { buildInsrcMcpServerWithRegistry } from '../server.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE_PATH = join(HERE, '../../prompts/steering-block.md');
const STEERING = readFileSync(SOURCE_PATH, 'utf8');

/** One line, single spaces: the texts are hard-wrapped, the claims are not. */
const flat = (s: string): string => s.replace(/\s+/g, ' ');

const { schemaRegistry } = buildInsrcMcpServerWithRegistry();
const description = (tool: string): string => {
	const record = schemaRegistry.get(tool);
	assert.ok(record !== undefined, `${tool} is registered`);
	return flat(record.description);
};

const guide = (key: string): string => {
	const section = readWorkflowGuide(STEERING, key);
	assert.ok(section !== null, `the steering source has a ${key} guide`);
	return flat(section);
};

/** What the old rule said, in the words it used. None may remain anywhere. */
const OLD_RULE = [
	/review is a controller task/i,
	/independent controller review/i,
	/controller-driven independent review/i,
	/a daemon self-review runs the same (model|provider)/i,
	/moves the review's reasoning into you/i,
	/second set of eyes off the provider/i,
];

const TEXTS: readonly (readonly [string, () => string])[] = [
	['the steering source', () => flat(STEERING)],
	['the insrc_review_step description', () => description('insrc_review_step')],
	['the insrc_code_review_step description', () => description('insrc_code_review_step')],
	['the insrc_workflow_approve description', () => description('insrc_workflow_approve')],
];

for (const [name, text] of TEXTS) {
	test(`T13 ${name} no longer states the old rule`, () => {
		for (const re of OLD_RULE) assert.doesNotMatch(text(), re);
	});
}

test('T13 design-review guidance describes durable review without retired fallback', () => {
 const g = guide('review');
 assert.match(g, /background/);
 assert.match(g, /wait for full completion before corrections/);
 assert.match(g, /No self-review fallback/);
});

test('T13 current code-review guidance preserves both parties and explicit task protocol', () => {
 const g = guide('code-review');
 assert.match(g, /party that did not write the code/);
 assert.match(g, /controller-authored code goes to the daemon/);
 assert.match(g, /daemon-authored code goes to the live controller/);
 for (const phase of ['start','resume','progress','assignment','scope','activity','result','publish']) assert.ok(g.includes(phase));
 assert.match(g, /No self-review fallback/);
 assert.match(g, /whole-story review is withheld/);
 assert.doesNotMatch(g, /emit_judgements|confirm_wait/);
});

test('T13 the steering build guide says completion requires a code review whatever the enforcement setting', () => {
	const g = guide('build');
	assert.match(g, /A Story with NO code review, or one reviewed by the party that wrote the code, is always withheld/);
	assert.doesNotMatch(g, /a `block` — or no review having run — withholds completion/, 'the old wording tied the no-review rule to the enforcement setting');
});

test('T13 the steering tool table describes both review tools by the other-party rule', () => {
	const s = flat(STEERING);
	assert.match(s, /\| `insrc_review_step` \| Review of a design artifact \(DEF\/HLD\/LLD\) by the party that did not author it/);
	assert.match(s, /\| `insrc_code_review_step` \| Post-build code review by the party that did not write the code/);
});

test('T13 design-review tool routes the other party with live paths', () => {
 assert.match(description('insrc_review_step'), /party that did not author/);
 assert.match(description('insrc_review_step'), /live artifact paths/);
});

test('T13 current code-review description routes both parties without retired protocol', () => {
 const d = description('insrc_code_review_step');
 assert.match(d, /party that did not write the code/);
 assert.match(d, /Controller-authored code is reviewed by the daemon/);
 assert.match(d, /daemon-authored code is reviewed by the live controller/);
 assert.match(d, /No substitute self-review/);
 assert.match(d, /committed packet/);
 assert.doesNotMatch(d, /emit_judgements|confirm_wait/);
});

test('T13 the insrc_workflow_approve description says what approval requires', () => {
	const d = description('insrc_workflow_approve');
	assert.match(d, /a DEF, HLD or LLD needs a review, and a BUILD record needs a code review of its Story, each done by the party that did NOT author the work/);
	assert.match(d, /An ISSUE, SPEC or PLAN needs no review/);
	assert.match(d, /missing, same-party or blocking legacy review/);
	assert.match(d, /stale-review.*withholds approval even with overrides or enforcement off/);
});

test('T13 canonical guide sections are independently addressable', () => {
 assert.ok(guide('review')); assert.ok(guide('code-review')); assert.ok(guide('tracker'));
 assert.doesNotMatch(guide('review'), /committed task review/);
});
