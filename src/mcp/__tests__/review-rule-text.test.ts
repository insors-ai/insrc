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
const PLUGIN_PATH = join(HERE, '../../../vscode-plugin/assets/steering-block.md');
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

test('T13 the steering review guide states the rule in both directions', () => {
	const g = guide('review');
	assert.match(g, /the party that did not author the work reviews it/i);
	assert.match(g, /An artifact you authored through `insrc_workflow_step` is reviewed by the daemon/);
	assert.match(g, /an artifact the daemon authored is reviewed by you/);
	assert.match(g, /The same model on both sides is fine/);
	assert.match(g, /A subagent you spawn is still you/);
	assert.match(g, /You do not choose the reviewer\..*the tool routes by who authored the artifact/);
	assert.match(g, /It does NOT fall back to a review by you/);
	assert.match(g, /approval requires it/i);
	assert.match(g, /An ISSUE, SPEC or PLAN needs no review/);
});

test('T13 the steering code-review guide states the rule in both directions', () => {
	const g = guide('code-review');
	assert.match(g, /the party that did not write the code reviews it/i);
	assert.match(g, /You wrote the code .* the tool asks the daemon to review/);
	assert.match(g, /The daemon wrote the code:.*`emit_judgements`/);
	assert.match(g, /it does NOT fall back to a review by you/);
	assert.match(g, /`confirm_wait`/);
	assert.match(g, /a Story with no code review is always withheld/);
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

test('T13 the insrc_review_step description states the rule in both directions', () => {
	const d = description('insrc_review_step');
	assert.match(d, /by the party that did NOT author it/);
	assert.match(d, /an artifact the daemon authored is reviewed by YOU \(the controller\)/);
	assert.match(d, /an artifact YOU authored .* is reviewed by the daemon/);
	assert.match(d, /The same model on both sides is fine/);
	assert.match(d, /the tool routes it/);
	assert.match(d, /never falls back to a review by you/);
	assert.match(d, /approval REQUIRES it/);
});

test('T13 the insrc_code_review_step description states the rule in both directions', () => {
	const d = description('insrc_code_review_step');
	assert.match(d, /by the party that did NOT write the code/);
	assert.match(d, /code the daemon wrote is reviewed by YOU \(the controller\)/);
	assert.match(d, /code YOU wrote .* is reviewed by the daemon/);
	assert.match(d, /The same model on both sides is fine/);
	assert.match(d, /never falls back to a review by you/);
	assert.match(d, /REQUIRES one, done by the other party/);
});

test('T13 the insrc_workflow_approve description says what approval requires', () => {
	const d = description('insrc_workflow_approve');
	assert.match(d, /a DEF, HLD or LLD needs a review, and a BUILD record needs a code review of its Story, each done by the party that did NOT author the work/);
	assert.match(d, /An ISSUE, SPEC or PLAN needs no review/);
	assert.match(d, /missing, same-party or blocking review/);
});

test('T13 the plugin copy of the steering source is identical to the source', () => {
	assert.equal(readFileSync(PLUGIN_PATH, 'utf8'), STEERING);
});
